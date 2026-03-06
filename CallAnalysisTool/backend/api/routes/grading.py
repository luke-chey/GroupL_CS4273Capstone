"""
Grading endpoints for transcript analysis
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import tempfile
from api.services.ai_grader import AIGraderService
from api.services.question_loader import QuestionLoader

grading_bp = Blueprint('grading', __name__)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'json'}

def allowed_file(filename):
    """Check if file has allowed extension"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Initialize loaders and graders
question_loader = QuestionLoader()  # Loads questions from EMSQA.csv

@grading_bp.route('/grade', methods=['POST'])
def grade_transcript():
    """
    Grade a transcript using AI grading (default)
    
    Request body (JSON):
        Group B's transcript format:
        {
            "language": "en",
            "segments": [
                {
                    "start": 0.0,
                    "end": 5.0,
                    "text": "Norman 911, what is the address?",
                    "speaker": "SPEAKER_01",
                    ...
                }
            ]
        }
    
    Optional query params:
        ?show_evidence=true  - Include evidence in response (not used by AI)
    
    Returns:
        JSON response with AI grading results
    """
    import sys
    print("=" * 60, flush=True)
    print("POST /api/grade endpoint called", flush=True)
    print(f"Content-Type: {request.content_type}", flush=True)
    print(f"Request method: {request.method}", flush=True)
    sys.stderr.write("POST /api/grade endpoint called\n")
    sys.stderr.flush()
    
    try:
        # Get JSON data from request
        print("Checking if request is JSON...", flush=True)
        if not request.is_json:
            return jsonify({
                'error': 'Content-Type must be application/json'
            }), 400
        
        print("Getting JSON data from request...", flush=True)
        transcript_data = request.get_json()
        print(f"Got transcript data with {len(transcript_data.get('segments', []))} segments", flush=True)
        
        # Validate required fields
        if 'segments' not in transcript_data:
            return jsonify({
                'error': 'Missing required field: segments'
            }), 400
        
        # Check if evidence should be included (not used by AI, but kept for API compatibility)
        show_evidence = request.args.get('show_evidence', 'false').lower() == 'true'
        
        # Initialize AI grader (questions now loaded dynamically based on nature codes)
        print("Initializing AI grader...", flush=True)
        ai_grader = AIGraderService()
        print("AI grader initialized, calling grade_transcript...", flush=True)
        
        # Grade the transcript using AI with nature code detection
        # Returns: (grades, primary_nature_code, all_questions)
        grades, primary_nature_code, questions = ai_grader.grade_transcript(
            transcript_data, 
            show_evidence=show_evidence
        )
        print(f"Grade transcript completed. Got {len(grades)} grades.", flush=True)
        
        # Calculate percentage score
        percentage = ai_grader.calculate_percentage(grades, questions)
        
        # Count questions by type
        total_questions = len(grades)
        case_entry_count = sum(1 for q_id in grades.keys() if q_id.startswith('CE_'))
        nature_code_count = sum(1 for q_id in grades.keys() if q_id.startswith('NC_'))
        
        # Count correct answers (codes "1" and "6")
        questions_asked_correctly = sum(
            1 for g in grades.values() if g.get('code') in ['1', '6']
        )
        questions_missed = total_questions - questions_asked_correctly
        
        # Build response
        response = {
            'grader_type': 'ai',
            'grade_percentage': percentage,
            'detected_nature_code': primary_nature_code,
            'total_questions': total_questions,
            'case_entry_questions': case_entry_count,
            'nature_code_questions': nature_code_count,
            'questions_asked_correctly': questions_asked_correctly,
            'questions_missed': questions_missed,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'grades': grades,
            'metadata': {
                'language': transcript_data.get('language', 'unknown'),
                'segment_count': len(transcript_data.get('segments', [])),
                'grader_version': '2.0.0',
                'model': 'llama3.1:8b',
                'questions_source': f'EMSQA.csv (Case Entry + {primary_nature_code})',
                'nature_code_detection': 'keyword + embedding model'
            }
        }
        
        return jsonify(response), 200
    
    except ConnectionError as e:
        return jsonify({
            'error': 'Ollama connection failed',
            'message': 'Please ensure Ollama is installed and running (ollama serve)',
            'details': str(e)
        }), 503
    
    except ValueError as e:
        return jsonify({
            'error': 'Invalid transcript data',
            'message': str(e)
        }), 400
    
    except RuntimeError as e:
        error_msg = str(e)
        if "empty response from Ollama" in error_msg:
            return jsonify({
                'error': 'AI grading timeout',
                'message': 'AI grading took too long to complete. The model is working but processing is slow.',
                'suggestion': 'Try with a shorter transcript or wait for the model to warm up.',
                'estimated_time': '2-3 minutes'
            }), 408  # Request Timeout
        else:
            return jsonify({
                'error': 'AI grading failed',
                'message': error_msg,
                'suggestion': 'Check if llama3.1:8b model is loaded and Ollama is running'
            }), 500
    
    except Exception as e:
        import traceback
        import sys
        from flask import current_app
        error_traceback = traceback.format_exc()
        # Use stderr to ensure output is flushed
        sys.stderr.write(f"\n{'='*60}\n")
        sys.stderr.write(f"ERROR in /api/grade: {str(e)}\n")
        sys.stderr.write(f"Traceback:\n{error_traceback}\n")
        sys.stderr.write(f"{'='*60}\n")
        sys.stderr.flush()
        # Also print for stdout
        print(f"\n{'='*60}\nERROR in /api/grade: {str(e)}\nTraceback:\n{error_traceback}\n{'='*60}\n", flush=True)
        return jsonify({
            'error': f'Grading failed: {str(e)}',
            'traceback': error_traceback if current_app.debug else None
        }), 500


@grading_bp.route('/grade/ai', methods=['POST'])
def grade_ai():
    """
    AI-based grading endpoint (alias for /grade)
    Uses Ollama with llama3.1:8b model
    """
    return grade_transcript()  # Use the main AI grading endpoint


@grading_bp.route('/upload', methods=['POST'])
def upload_and_grade():
    """
    Accept file upload and grade transcript
    
    For Camden's frontend: Upload .json transcript file, get grading results
    
    Request: multipart/form-data with 'file' field
    Response: Same format as /api/grade
    """
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        # Check if filename is empty
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file extension
        if not allowed_file(file.filename):
            return jsonify({
                'error': 'Invalid file type',
                'message': 'Only .json files are supported',
                'allowed_types': ['.json']
            }), 400
        
        # Create secure filename
        filename = secure_filename(file.filename)
        
        # Save to temporary directory
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.json', delete=False) as tmp_file:
            file.save(tmp_file.name)
            temp_path = tmp_file.name
        
        try:
            # Read the JSON file
            import json
            with open(temp_path, 'r') as f:
                transcript_data = json.load(f)
            
            # Validate JSON structure
            if 'segments' not in transcript_data:
                return jsonify({'error': 'Invalid transcript format: missing "segments" field'}), 400
            
            # Initialize AI grader
            ai_grader = AIGraderService()
            
            # Grade the transcript using AI with nature code detection
            grades, primary_nature_code, questions = ai_grader.grade_transcript(
                transcript_data, 
                show_evidence=False
            )
            
            # Calculate percentage score
            percentage = ai_grader.calculate_percentage(grades, questions)
            
            # Count questions by type
            total_questions = len(grades)
            case_entry_count = sum(1 for q_id in grades.keys() if q_id.startswith('CE_'))
            nature_code_count = sum(1 for q_id in grades.keys() if q_id.startswith('NC_'))
            
            questions_asked_correctly = sum(
                1 for g in grades.values() if g.get('code') in ['1', '6']
            )
            questions_missed = total_questions - questions_asked_correctly
            
            # Build response
            response = {
                'filename': filename,
                'grader_type': 'ai',
                'grade_percentage': percentage,
                'detected_nature_code': primary_nature_code,
                'total_questions': total_questions,
                'case_entry_questions': case_entry_count,
                'nature_code_questions': nature_code_count,
                'questions_asked_correctly': questions_asked_correctly,
                'questions_missed': questions_missed,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'grades': grades,
                'metadata': {
                    'language': transcript_data.get('language', 'unknown'),
                    'segment_count': len(transcript_data.get('segments', [])),
                    'grader_version': '2.0.0',
                    'model': 'llama3.1:8b',
                    'questions_source': f'EMSQA.csv (Case Entry + {primary_nature_code})',
                    'nature_code_detection': 'keyword + embedding model'
                }
            }
            
            return jsonify(response), 200
        
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except json.JSONDecodeError as e:
        return jsonify({
            'error': 'Invalid JSON file',
            'message': str(e)
        }), 400
    
    except ConnectionError as e:
        return jsonify({
            'error': 'Ollama connection failed',
            'message': 'Please ensure Ollama is installed and running (ollama serve)',
            'details': str(e)
        }), 503
    
    except ValueError as e:
        return jsonify({
            'error': 'Invalid transcript data',
            'message': str(e)
        }), 400
    
    except RuntimeError as e:
        error_msg = str(e)
        if "empty response from Ollama" in error_msg:
            return jsonify({
                'error': 'AI grading timeout',
                'message': 'AI grading took too long to complete. The model is working but processing is slow.',
                'suggestion': 'Try with a shorter transcript or wait for the model to warm up.',
                'estimated_time': '2-3 minutes'
            }), 408  # Request Timeout
        else:
            return jsonify({
                'error': 'AI grading failed',
                'message': error_msg,
                'suggestion': 'Check if llama3.1:8b model is loaded and Ollama is running'
            }), 500
    
    except Exception as e:
        return jsonify({
            'error': f'Upload and grading failed: {str(e)}'
        }), 500


@grading_bp.route('/grade/status', methods=['GET'])
def grading_status():
    """
    Check if AI grading is ready and warmed up
    """
    try:
        # Quick test to see if Ollama is responsive
        import ollama
        response = ollama.generate(
            model='llama3.1:8b',
            prompt='Say "ready" if you can respond.',
            options={'num_predict': 5, 'temperature': 0.0}
        )

        if response and 'response' in response:
            return jsonify({
                'status': 'ready',
                'model': 'llama3.1:8b',
                'message': 'AI grading is ready to use',
                'estimated_grading_time': '2-3 minutes per transcript'
            }), 200
        else:
            return jsonify({
                'status': 'unresponsive',
                'message': 'Ollama model is loaded but not responding properly'
            }), 503

    except Exception as e:
        return jsonify({
            'status': 'not_ready',
            'message': f'AI grading not available: {str(e)}',
            'suggestion': 'Wait for Ollama to finish loading the model'
        }), 503


@grading_bp.route('/grade/all', methods=['POST'])
def grade_all():
    """
    Run both rule-based and AI grading, return comparison

    TODO: Implement once AI grader is ready
    """
    return jsonify({
        'error': 'Combined grading not yet implemented',
        'message': 'Use /api/grade/rule for rule-based grading',
        'status': 'coming_soon'
    }), 501

