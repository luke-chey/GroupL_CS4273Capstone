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
    identify_nature_code,
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
    
    def grade_transcript(self, nature_code: str, transcript_data: Dict[str, Any], show_evidence: bool = False) -> Tuple[Dict[str, Any], str, Dict[str, str]]:
        """
        Grade a transcript using AI with nature code detection
        """
        import traceback

        print("Starting grade_transcript...", flush=True)

        # Create temp file for JSON parser (expects file path)
        try:
            print("Creating temporary transcript file...", flush=True)
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
                json.dump(transcript_data, tmp)
                tmp_path = tmp.name
            print(f"Temporary file created: {tmp_path}", flush=True)
        except Exception as e:
            print(f"Failed to create temp file: {e}\n{traceback.format_exc()}", flush=True)
            raise

        try:
            # Step 1: Convert JSON to text
            print("Step 1: Converting JSON to text...", flush=True)
            transcript_text = json_to_text(tmp_path)

            if not transcript_text:
                raise ValueError("Failed to parse transcript data")

            print(f"Step 1 complete: transcript length = {len(transcript_text)}", flush=True)

            # Step 2: Load questions
            print("Step 2: Loading questions...", flush=True)
            case_entry_questions = load_nature_code_questions("Case Entry")
            nature_code_questions = load_nature_code_questions(nature_code)

            all_questions = {**case_entry_questions, **nature_code_questions}

            if not all_questions:
                raise RuntimeError("Failed to load questions from EMSQA.csv")

            print(f"Step 2 complete: {len(all_questions)} questions loaded", flush=True)

            # Step 3: AI grading
            print("Step 3: Running AI grading...", flush=True)
            try:
                ai_grades = ai_grade_transcript(transcript_text, all_questions, nature_code)
            except Exception as e:
                print(f"AI grading failed: {e}\n{traceback.format_exc()}", flush=True)
                raise RuntimeError(f"AI grading failed: {e}")

            if not ai_grades:
                raise RuntimeError("AI grading returned empty results")

            print(f"Step 3 complete: received {len(ai_grades)} grades", flush=True)

            # Step 4: Format results
            print("Step 4: Formatting grades...", flush=True)
            formatted_grades = {}

            for q_id, question_text in all_questions.items():
                code = ai_grades.get(q_id, "2")  # Default = Not Asked
                formatted_grades[q_id] = {
                    "code": code,
                    "label": question_text,
                    "status": self.KEY.get(code, "Unknown")
                }

            print("Step 4 complete: formatting finished", flush=True)

            return formatted_grades, all_questions

        except Exception as e:
            print(f"Error in grade_transcript: {e}\n{traceback.format_exc()}", flush=True)
            raise

        finally:
            # Clean up temp file
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.unlink(tmp_path)
                print("Temporary file cleaned up", flush=True)
    
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

