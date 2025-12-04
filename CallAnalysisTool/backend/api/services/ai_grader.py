"""
AI-based grading service with nature code detection
Wraps AIGrader.py and detect_naturecode.py to work with the Flask API
"""

import json
import tempfile
from typing import Dict, Any, Tuple
from pathlib import Path
import sys
import os

# Add parent backend directory to path for module imports
backend_path = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_path))

# Import core grading and nature code detection modules
from JSONTranscriptionParser import json_to_text
from AIGrader import (
    detect_nature_codes_in_memory,
    extract_all_nature_codes,
    load_nature_code_questions,
    ai_grade_transcript,
    calculate_final_grade
)

class AIGraderService:
    """
    AI-based transcript grader using Ollama (llama3.1:8b model)
    Integrates AI grading with nature code detection
    """
    
    # Grading code meanings
    KEY = {
        "1": "Asked Correctly",
        "2": "Not Asked",
        "3": "Asked Incorrectly",
        "4": "Not As Scripted",
        "5": "N/A",
        "6": "Obvious",
        "RC": "Recorded Correctly"
    }
    
    def __init__(self):
        """
        Initialize AI grader
        Questions are now loaded dynamically based on detected nature codes
        """
        pass
    
    def grade_transcript(self, transcript_data: Dict[str, Any], show_evidence: bool = False) -> Tuple[Dict[str, Any], str, Dict[str, str]]:
        """
        Grade a transcript using AI with nature code detection
        
        Args:
            transcript_data: Group B's JSON format with 'segments' array
            show_evidence: Whether to include evidence (not used currently)
        
        Returns:
            Tuple of (formatted_grades, primary_nature_code, all_questions)
            formatted_grades: Dict with structure:
            {
                "CE_1": {"code": "1", "label": "...", "status": "Asked Correctly"},
                "NC_3": {"code": "2", "label": "...", "status": "Not Asked"},
                ...
            }
        """
        import traceback
        
        print("Starting grade_transcript method...", flush=True)
        sys.stderr.write("Starting grade_transcript method...\n")
        sys.stderr.flush()
        
        # JSONTranscriptionParser expects a file path, so create a temp file
        try:
            print("Creating temp file for transcript...", flush=True)
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
                json.dump(transcript_data, tmp)
                tmp_path = tmp.name
            print(f"Temp file created: {tmp_path}", flush=True)
        except Exception as e:
            sys.stderr.write(f"ERROR creating temp file: {e}\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            raise
        
        try:
            # Step 1: Convert JSON to text format
            print("Step 1: Converting JSON to text format...", flush=True)
            sys.stderr.write("Step 1: Converting JSON to text format...\n")
            sys.stderr.flush()
            transcript_text = json_to_text(tmp_path)
            if not transcript_text:
                raise ValueError("Failed to parse transcript data")
            print(f"Step 1 complete: Got transcript text ({len(transcript_text)} chars)", flush=True)
            
            # Step 2: Detect nature codes
            print("Step 2: Detecting nature codes...", flush=True)
            sys.stderr.write("Step 2: Detecting nature codes...\n")
            sys.stderr.flush()
            try:
                nature_codes_text = detect_nature_codes_in_memory(tmp_path, transcript_text)
            except Exception as e:
                sys.stderr.write(f"ERROR in nature code detection: {e}\n")
                sys.stderr.write(f"Traceback: {traceback.format_exc()}\n")
                sys.stderr.flush()
                raise RuntimeError(f"Failed to detect nature codes: {e}")
            
            if not nature_codes_text:
                raise RuntimeError("Failed to detect nature codes - empty result")
            print(f"Step 2 complete: Got nature codes text", flush=True)
            
            # Step 3: Extract and sort nature codes by confidence
            print("Step 3: Extracting nature codes...", flush=True)
            nature_codes = extract_all_nature_codes(nature_codes_text)
            if not nature_codes:
                raise RuntimeError("No nature codes detected in transcript")
            print(f"Step 3 complete: Found {len(nature_codes)} nature codes", flush=True)
            
            # Step 4: Get primary nature code (highest confidence)
            primary_nature_code = nature_codes[0][0]
            print(f"Step 4 complete: Primary nature code: {primary_nature_code}", flush=True)
            
            # Step 5: Load questions for Case Entry AND primary nature code
            print("Step 5: Loading questions...", flush=True)
            case_entry_questions = load_nature_code_questions("Case Entry")
            nature_code_questions = load_nature_code_questions(primary_nature_code)
            
            # Combine into one dict
            all_questions = {**case_entry_questions, **nature_code_questions}
            
            if not all_questions:
                raise RuntimeError("Failed to load questions from EMSQA.csv")
            print(f"Step 5 complete: Loaded {len(all_questions)} questions", flush=True)
            
            # Step 6: Get AI grades
            print("Step 6: Getting AI grades from Ollama...", flush=True)
            sys.stderr.write("Step 6: Getting AI grades from Ollama...\n")
            sys.stderr.flush()
            try:
                ai_grades = ai_grade_transcript(transcript_text, all_questions, primary_nature_code)
            except Exception as e:
                sys.stderr.write(f"ERROR in AI grading: {e}\n")
                sys.stderr.write(f"Traceback: {traceback.format_exc()}\n")
                sys.stderr.flush()
                raise RuntimeError(f"AI grading failed: {e}")
            
            if not ai_grades:
                raise RuntimeError("AI grading failed - empty response from Ollama")
            print(f"Step 6 complete: Got {len(ai_grades)} grades", flush=True)
            
            # Step 7: Format grades to match API response structure
            formatted_grades = {}
            for q_id, question_text in all_questions.items():
                code = ai_grades.get(q_id, "2")  # Default to "Not Asked" if missing
                formatted_grades[q_id] = {
                    "code": code,
                    "label": question_text,
                    "status": self.KEY.get(code, "Unknown")
                }
            
            print("Step 7 complete: Grades formatted successfully", flush=True)
            return formatted_grades, primary_nature_code, all_questions
        
        except Exception as e:
            sys.stderr.write(f"ERROR in grade_transcript: {e}\n")
            sys.stderr.write(f"Full traceback:\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            raise
        
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def calculate_percentage(self, grades: Dict[str, Any], questions: Dict[str, str]) -> float:
        """
        Calculate grade percentage using the standard grading scheme
        
        Grading Key:
        1 = Asked Correctly (100%)
        2 = Not Asked (0%)
        3 = Asked Incorrectly (0%)
        4 = Not As Scripted (50% - partial credit)
        5 = N/A (excluded from calculation)
        6 = Obvious (100%)
        RC = Recorded Correctly (excluded from calculation)
        
        Args:
            grades: Dict of grades from grade_transcript()
            questions: Dict of all questions that were graded
        
        Returns:
            Percentage score (0.0 - 100.0)
        """
        if not grades or not questions:
            return 0.0
        
        # Convert formatted grades back to simple code dict
        grade_codes = {}
        for q_id, grade_data in grades.items():
            grade_codes[q_id] = grade_data.get('code', '2')
        
        # Calculate final grade using the standard grading function
        percentage = calculate_final_grade(grade_codes, questions)
        return round(percentage, 1)

