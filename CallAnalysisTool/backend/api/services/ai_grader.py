"""
AI-based transcript grading and nature code detection helpers.

This module consolidates the previous split between ``AIGrader.py`` and the
Flask-facing ``ai_grader.py`` wrapper so there is a single grading entrypoint.
"""

import json
import os
import re
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import ollama
import pandas as pd

from api.services.detect_naturecode import run_detection
from api.services.text_handler import json_to_text


SERVICE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SERVICE_DIR.parent.parent
EMSQA_PATH = BACKEND_DIR / "data" / "EMSQA.csv"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

_ollama_initialized = False


def check_ollama_ready(max_retries: int = 5, retry_delay: int = 2) -> bool:
    """Check whether Ollama is responsive."""
    for attempt in range(max_retries):
        try:
            print(f"Checking Ollama at {OLLAMA_HOST} (attempt {attempt + 1}/{max_retries})...")
            response = ollama.generate(
                model=OLLAMA_MODEL,
                prompt='Say "ready"',
                options={"num_predict": 5, "temperature": 0.0},
            )
            if response and "response" in response:
                print("Ollama is ready!")
                return True
        except Exception as exc:
            print(f"Ollama not ready yet: {exc}")
            if attempt < max_retries - 1:
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)

    print("Ollama readiness check failed after all retries")
    return False


def initialize_ollama() -> None:
    """Warm up the Ollama model once per process."""
    global _ollama_initialized

    if _ollama_initialized:
        return

    try:
        print("=" * 60)
        print(f"Preloading Ollama model ({OLLAMA_MODEL})...")
        print("=" * 60)
        print(f"Connecting to Ollama at: {OLLAMA_HOST}")

        response = ollama.generate(
            model=OLLAMA_MODEL,
            prompt="Say 'ready' if you are ready.",
            options={"num_predict": 10, "temperature": 0.0},
        )

        if response and "response" in response:
            print("Ollama model preloaded successfully!")
            print(f"Warm-up response: {response['response'][:100]}...")
        else:
            print("Warning: Ollama responded with an unexpected response structure")
            print(f"Response: {response}")

        _ollama_initialized = True
        print("=" * 60)
    except ConnectionError as exc:
        print(f"Warning: Could not connect to Ollama: {exc}")
        print("Ollama may not be running. Grading requests will fail.")
    except Exception as exc:
        print(f"Warning: Failed to preload Ollama model: {exc}")
        print("Grading requests may be slow on first use.")


def detect_nature_codes_in_memory(transcript_path: str) -> str:
    """Run sentence-transformer nature code detection for a transcript file."""
    transcript_text = json_to_text(transcript_path)
    temp_path = run_detection(transcript_path, transcript_text)
    with open(temp_path, "r", encoding="utf-8") as handle:
        nature_codes = handle.read()
    os.remove(temp_path)
    return nature_codes


def identify_nature_code(text: str, transcript: str) -> Optional[str]:
    """Use Ollama to choose the most likely nature code from candidates."""
    if not _ollama_initialized:
        try:
            initialize_ollama()
        except Exception as exc:
            print(f"Failed to initialize Ollama for identifying the nature code: {exc}")
            raise RuntimeError("Ollama initialization failed. Cannot perform nature code identification.")

    prompt = f"""You are a 911 call quality assurance analyst. You need to parse the transcript and determine the nature code based on the conversation between the dispatcher and caller.

TRANSCRIPT:
{transcript}

POSSIBLE NATURE CODES:
{text}

Return ONLY the nature code you have identified based on the transcript and ONLY the nature code, don't give me your reasoning.

Important: Be accurate and return a valid string only."""

    try:
        response = ollama.generate(
            model=OLLAMA_MODEL,
            prompt=prompt,
            options={
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": 500,
                "timeout": 120,
                "seed": 42,
                "num_gpu": 0,
                "top_k": 0.9,
            },
        )
        if response:
            return response["response"]
        print("Could not parse AI response")
        return None
    except Exception as exc:
        print(f"Nature code identification failed: {exc}")
        return None


def load_nature_code_questions(nature_code: str) -> Dict[str, str]:
    """Load grading questions for a nature code from ``EMSQA.csv``."""
    try:
        df = pd.read_csv(EMSQA_PATH)
        nature_questions = df[df["NatureCode"] == nature_code]

        questions_dict: Dict[str, str] = {}
        for _, row in nature_questions.iterrows():
            qid = str(row["Question_ID"])
            question_text = row["Question_Text"]
            if pd.notna(question_text):
                prefix = "CE" if nature_code == "Case Entry" else "NC"
                questions_dict[f"{prefix}_{qid}"] = question_text

        return questions_dict
    except FileNotFoundError:
        print(f"Error: EMSQA.csv file not found at {EMSQA_PATH}")
        return {}
    except Exception as exc:
        print(f"Error loading questions for Nature Code {nature_code}: {exc}")
        return {}


def calculate_final_grade(grades: Dict[str, str], questions_dict: Dict[str, str]) -> float:
    """Calculate the final numeric percentage from question grades."""
    total_points = 0
    earned_points = 0.0

    for qid, grade in grades.items():
        if qid not in questions_dict or grade in {"5", "RC"}:
            continue

        total_points += 1
        if grade in {"1", "6"}:
            earned_points += 1
        elif grade == "4":
            earned_points += 0.5

    if total_points == 0:
        return 0.0

    return (earned_points / total_points) * 100


def ai_grade_transcript(
    transcript_text: str,
    questions_dict: Dict[str, str],
    nature_code: str,
) -> Dict[str, str]:
    """Grade a transcript against a question set with Ollama."""
    if not _ollama_initialized:
        try:
            initialize_ollama()
        except Exception as exc:
            print(f"Failed to initialize Ollama for grading: {exc}")
            raise RuntimeError("Ollama initialization failed. Cannot perform AI grading.")

    prompt = f"""You are a 911 call quality assurance analyst. Analyze this transcript and grade it based on the questions from the given nature code below.

NATURE_CODE: {nature_code}

TRANSCRIPT:
{transcript_text}

GRADING QUESTIONS (use codes: 1=Asked Correctly, 2=Not Asked, 3=Asked Incorrectly, 4=Not As Scripted, 5=N/A, 6=Obvious, RC=Recorded Correctly):
{chr(10).join([f"{qid}: {question}" for qid, question in questions_dict.items()])}

Return ONLY a JSON object with question IDs as keys and grade codes as values. Example: {{"CE_1": "1", "CE_2": "2"}}. DO NOT SAY ANYTHING ELSE.

Important: Be accurate and return valid JSON only."""

    try:
        response = ollama.generate(
            model=OLLAMA_MODEL,
            prompt=prompt,
            options={
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": 500,
                "timeout": 120,
                "seed": 42,
                "num_gpu": 0,
                "top_k": 0.9,
            },
        )
        print("Raw response: ", response)

        json_match = re.search(r"\{.*\}", response["response"], re.DOTALL)
        if json_match:
            return json.loads(json_match.group())

        print("Could not parse AI response as JSON")
        return {}
    except Exception as exc:
        print(f"AI grading failed: {exc}")
        return {}


class AIGraderService:
    """Flask-facing transcript grader that formats grades for API responses."""

    KEY = {
        "1": "Asked Correctly",
        "2": "Not Asked",
        "3": "Asked Incorrectly",
        "4": "Not As Scripted",
        "5": "N/A",
        "6": "Obvious",
        "RC": "Recorded Correctly",
    }

    def grade_transcript(
        self,
        nature_code: str,
        transcript_data: Dict[str, Any],
        show_evidence: bool = False,
    ) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """Grade a parsed transcript payload and return formatted grades."""
        del show_evidence
        import traceback

        print("Starting grade_transcript...", flush=True)

        try:
            print("Creating temporary transcript file...", flush=True)
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as tmp:
                json.dump(transcript_data, tmp)
                tmp_path = tmp.name
            print(f"Temporary file created: {tmp_path}", flush=True)
        except Exception as exc:
            print(f"Failed to create temp file: {exc}\n{traceback.format_exc()}", flush=True)
            raise

        try:
            print("Step 1: Converting JSON to text...", flush=True)
            transcript_text = json_to_text(tmp_path)
            if not transcript_text:
                raise ValueError("Failed to parse transcript data")

            print(f"Step 1 complete: transcript length = {len(transcript_text)}", flush=True)

            print("Step 2: Loading questions...", flush=True)
            case_entry_questions = load_nature_code_questions("Case Entry")
            nature_code_questions = load_nature_code_questions(nature_code)
            all_questions = {**case_entry_questions, **nature_code_questions}

            if not all_questions:
                raise RuntimeError("Failed to load questions from EMSQA.csv")

            print(f"Step 2 complete: {len(all_questions)} questions loaded", flush=True)

            print("Step 3: Running AI grading...", flush=True)
            try:
                ai_grades = ai_grade_transcript(transcript_text, all_questions, nature_code)
            except Exception as exc:
                print(f"AI grading failed: {exc}\n{traceback.format_exc()}", flush=True)
                raise RuntimeError(f"AI grading failed: {exc}")

            if not ai_grades:
                raise RuntimeError("AI grading returned empty results")

            print(f"Step 3 complete: received {len(ai_grades)} grades", flush=True)

            print("Step 4: Formatting grades...", flush=True)
            formatted_grades: Dict[str, Dict[str, str]] = {}
            for q_id, question_text in all_questions.items():
                code = ai_grades.get(q_id, "2")
                formatted_grades[q_id] = {
                    "code": code,
                    "label": question_text,
                    "status": self.KEY.get(code, "Unknown"),
                }

            print("Step 4 complete: formatting finished", flush=True)
            return formatted_grades, all_questions
        except Exception as exc:
            print(f"Error in grade_transcript: {exc}\n{traceback.format_exc()}", flush=True)
            raise
        finally:
            if "tmp_path" in locals() and os.path.exists(tmp_path):
                os.unlink(tmp_path)
                print("Temporary file cleaned up", flush=True)

    def calculate_percentage(self, grades: Dict[str, Any], questions: Dict[str, str]) -> float:
        """Calculate a percentage from formatted grade objects."""
        if not grades or not questions:
            return 0.0

        grade_codes = {q_id: grade_data.get("code", "2") for q_id, grade_data in grades.items()}
        percentage = calculate_final_grade(grade_codes, questions)
        return round(percentage, 1)


def grade_transcript_file(nature_code: str, transcript_path: Path, output_path: Path) -> Tuple[Dict[str, Any], Path]:
    """Grade a transcript JSON file and write ``grades.json`` to ``output_path``."""
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript_data = json.load(f)

    if not isinstance(transcript_data, dict) or "segments" not in transcript_data:
        raise ValueError("Invalid transcript format")

    print("Initializing AI grader...", flush=True)
    ai_grader = AIGraderService()
    print("AI grader initialized, calling grade_transcript...", flush=True)

    grades, questions = ai_grader.grade_transcript(nature_code, transcript_data)
    print(f"Grade transcript completed. Got {len(grades)} grades.", flush=True)

    percentage = ai_grader.calculate_percentage(grades, questions)
    total_questions = len(grades)
    case_entry_count = sum(1 for q_id in grades if q_id.startswith("CE_"))
    nature_code_count = sum(1 for q_id in grades if q_id.startswith("NC_"))
    questions_asked_correctly = sum(1 for grade in grades.values() if grade.get("code") in {"1", "6"})
    questions_missed = total_questions - questions_asked_correctly

    response = {
        "grader_type": "ai",
        "grade_percentage": percentage,
        "detected_nature_code": nature_code,
        "total_questions": total_questions,
        "case_entry_questions": case_entry_count,
        "nature_code_questions": nature_code_count,
        "questions_asked_correctly": questions_asked_correctly,
        "questions_missed": questions_missed,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "grades": grades,
        "metadata": {
            "language": transcript_data.get("language", "unknown"),
            "segment_count": len(transcript_data.get("segments", [])),
            "grader_version": "2.0.0",
            "model": OLLAMA_MODEL,
            "questions_source": f"EMSQA.csv (Case Entry + {nature_code})",
            "nature_code_detection": "keyword + embedding model",
        },
    }

    grades_path = output_path / "grades.json"
    with open(grades_path, "w", encoding="utf-8") as f:
        json.dump(response, f)

    return response, grades_path
