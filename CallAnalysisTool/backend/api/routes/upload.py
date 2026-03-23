# Standard library
import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

# Third-party
from flask import Blueprint, request, jsonify

# Local modules
from AIGrader import detect_nature_codes_in_memory, identify_nature_code
from JSONTranscriptionParser import json_to_text
from api.services.ai_grader import AIGraderService
from api.services.transcription_pipeline.speaker_separate.speaker_separation import speaker_separation
from api.services.transcriber import get_transcriber

upload_bp = Blueprint('upload', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)


def extract_info_from_cdr(cdr_path):
    """
    Extract date (YYYYMMDD), time (HHMMSS), and dispatcher name from CDR text.
    """
    # Read file
    cdr_content = cdr_path.read_text(encoding="utf-8", errors="ignore")

    # Start: 2026-02-27 12:44:33
    start_match = re.search(
        r"\bStart:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})",
        cdr_content,
    )
    if not start_match:
        return None, None, None

    year, month, day, hour, minute, second = start_match.groups()
    date_str = f"{year}{month}{day}"
    time_str = f"{hour}{minute}{second}"

    # Dispatcher name
    agent_match = re.search(r"\bAGENT_NAME:\s*([^,\s]+)", cdr_content)
    if not agent_match:
        # Could be stored as AGENT
        agent_match = re.search(r"\bAGENT:\s*([^,\s]+)", cdr_content)

    agent_name = agent_match.group(1).strip() if agent_match else None

    if not agent_name:
        return None, None, None

    return date_str, time_str, agent_name

def grade_transcript(nature_code, transcript_path, output_path):
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
    transcript_data = None
    with open(transcript_path, "r") as f:
        transcript_data = json.load(f)

    if not isinstance(transcript_data, dict) or 'segments' not in transcript_data:
        return jsonify({'error': 'Invalid transcript format'}), 400
    
    
    # Initialize AI grader (questions now loaded dynamically based on nature codes)
    print("Initializing AI grader...", flush=True)
    ai_grader = AIGraderService()
    print("AI grader initialized, calling grade_transcript...", flush=True)
    
    # Grade the transcript using AI with nature code detection
    # Returns: (grades, primary_nature_code, all_questions)
    grades, questions = ai_grader.grade_transcript(
        nature_code,
        transcript_data,
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
        'detected_nature_code': nature_code,
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
            'questions_source': f'EMSQA.csv (Case Entry + {nature_code})',
            'nature_code_detection': 'keyword + embedding model'
        }
    }

    grades_path = output_path / "grades.json"
    with open(grades_path, "w") as f:
        json.dump(response, f)
    
    return response, grades_path

@upload_bp.route('/upload', methods=['POST'])
def upload():
    """
    Accepts a .zip or .json file

    Transcribes zip contents (if provided), grades transcription.
    
    Response: JSON with success message and call folder name.
    """
    try:
        print("Upload endpoint called")

        # Handle initial input
        is_zip = False
        is_json = False
        if 'file' not in request.files:
            if request.is_json:
                print("Json detected")
                is_json = True
            else:
                print("No file or json provided")
                return jsonify({'error': 'No file or json provided'}), 400
        else:
            file = request.files['file']
            if file.filename == '':
                print("No file provided")
                return jsonify({'error': 'No file selected'}), 400

            # Get file extension
            filename, file_extension = os.path.splitext(file.filename)
            print(f"File detected. Name: {filename}. Extension: {file_extension}")
            if file_extension == '.zip':
                is_zip = True

        # Do processing in temp dir
        date = time = agent_name = (None,) * 3
        cdr_path = audio_path = transcript_path = grades_path = nature_code = (None,) * 5
        transcript_data = None
        with tempfile.TemporaryDirectory() as temp_dir:
            TEMP_PATH = Path(temp_dir)

            if is_zip:
                print("Processing zip")
                # Unzip
                zip_path = TEMP_PATH / filename
                file.save(str(zip_path))
                with zipfile.ZipFile(zip_path, "r") as zip_ref:
                    zip_ref.extractall(TEMP_PATH)

                # Find cdr file
                txt_files = list(TEMP_PATH.glob("*.txt"))
                if txt_files:
                    cdr_path = txt_files[0]
                    print(f"CDR file found: {cdr_path}")
                else:
                    return jsonify({'error': 'No cdr file detected'}), 400

                # Find audio file
                wav_files = list(TEMP_PATH.glob("*.wav"))
                if wav_files:
                    audio_path = wav_files[0]
                    print(f"Audio file found: {audio_path}")
                else:
                    return jsonify({'error': 'No audio file detected'}), 400

                # Parse cdr file
                date, time, agent_name = extract_info_from_cdr(cdr_path)
                print(f"Info extracted from CDR: Date={date}, Time={time}, Agent={agent_name}")

                # Transcribe audio file
                transcriber = get_transcriber()
                print(f"Beginning transcription of {audio_path}")
                result = transcriber.transcribe(str(audio_path))

                # Save transcript
                raw_transcript_path = TEMP_PATH / "raw_transcript.json"
                with open(raw_transcript_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, indent=2, ensure_ascii=False)
                print(f"Transcription finished, saved to: {raw_transcript_path}")

                # Do speaker separation
                print("Separating speakers")
                transcript_path = speaker_separation(
                    audio_path,
                    raw_transcript_path,
                    TEMP_PATH,
                    dispatcher_name=agent_name,
                    date_str=date,
                    time_str=time,
                )
                print(f"Speaker separation finished, saved to: {transcript_path}")
                
                # Get data again
                with open(transcript_path, "r") as f:
                    transcript_data = json.load(f)

            elif is_json:
                print("Processing json")
                # Read json data from request
                transcript_data = request.get_json()
                date = transcript_data.get("date")
                time = transcript_data.get("time")
                agent_name = (transcript_data.get("agent_name") or (transcript_data.get("speakers", [None])[0]))
                print(f"Info extracted from transcript: Date={date}, Time={time}, Agent={agent_name}")
            else:
                print("Both is_zip and is_json False")
                return jsonify({'error': 'No file or json provided'}), 400
            
            # Get nature code
            # Convert JSON to text format
            transcript_text = json_to_text(transcript_path)
            
            # Detect nature codes with sentence transformer
            print("Detecting possible nature codes using sentence transformer")
            nature_codes_text = detect_nature_codes_in_memory(transcript_path)
            
            # Get final nature code using AI
            print("Getting final nature code using AI")
            nature_code = identify_nature_code(nature_codes_text, transcript_text)
            if nature_code is not None:
                print(f"Final nature code: {nature_code}")
            else:
                print("Nature code not found")
                raise RuntimeError("Nature code could not be detected")
            
            # Get grades
            response, grades_path = grade_transcript(nature_code, transcript_path, TEMP_PATH)

            # Create destination folder and move everything there
            # Base output directory
            base_dir = Path(OUTPUT_DIR)

            # Create folder: output/{agent_name}/{date}_{time}_{nature_code}/
            dest_dir = base_dir / agent_name / f"{date}_{time}_{nature_code}"
            dest_dir.mkdir(parents=True, exist_ok=True)

            # Build base filename prefix
            base_name = f"{agent_name}_{date}_{time}_{nature_code}"

            # Source paths
            cdr_src = Path(cdr_path)
            audio_src = Path(audio_path)
            transcript_src = Path(transcript_path)
            grades_src = Path(grades_path)

            # Destination paths (preserve correct extensions)
            cdr_dst = dest_dir / f"{base_name}_cdr{cdr_src.suffix}"
            audio_dst = dest_dir / f"{base_name}_audio{audio_src.suffix}"
            transcript_dst = dest_dir / f"{base_name}_transcript{transcript_src.suffix}"
            grades_dst = dest_dir / f"{base_name}_grades{grades_src.suffix}"

            # Move + rename
            if is_zip and cdr_src.exists():
                shutil.move(cdr_src, cdr_dst)
            if is_zip and audio_src.exists():
                shutil.move(audio_src, audio_dst)
            if transcript_src.exists():
                shutil.move(transcript_src, transcript_dst)
            if grades_src.exists():
                shutil.move(grades_src, grades_dst)

            # Return destination folder with grades data
            return jsonify({
                'outputDestination': str(dest_dir),
                'dispatcherName': agent_name,
                'grades': response,
            })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
