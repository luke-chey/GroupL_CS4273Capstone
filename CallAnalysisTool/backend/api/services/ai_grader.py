"""AI-based transcript grading helpers with a single file-based entrypoint."""

import json
import os
import re
import tempfile
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

from api.services.ollama_handler import chat_ollama, prompt_ollama
from api.services.nature_codes import load_nature_code_questions
from api.services.text_handler import format_question_for_chat, format_questions_for_prompt, json_to_text

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
PER_QUESTION_MAX_RETRIES = 3
FALLBACK_REASONING = "No valid bracketed grade was returned after the maximum retry attempts."
GRADE_KEY = {
    "1": "Asked Correctly",
    "2": "Not Asked",
    "3": "Asked Incorrectly",
    "4": "Not As Scripted",
    "5": "N/A",
    "6": "Obvious",
    "RC": "Recorded Correctly",
}

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

def clean_response(response):
    # Remove // comments
    response = re.sub(r'//.*', '', response)

    # Remove trailing commas (just in case)
    response = re.sub(r',\s*}', '}', response)
    response = re.sub(r',\s*]', ']', response)

    # Replace N/A with correct identifier
    response = response.replace("N/A", "5")

    return response

def ai_grade_transcript(
    transcript_text: str,
    questions_dict: Dict[str, Dict[str, Any]],
    nature_code: str,
) -> Dict[str, str]:
    """Grade a transcript against a question set with Ollama."""

    prompt = textwrap.dedent(f"""
        You are a 911 call quality assurance analyst. Analyze this transcript and grade it based on the questions from the given nature code below.

        NATURE_CODE: {nature_code}

        TRANSCRIPT:
        {transcript_text}

        GRADING QUESTIONS (use codes: 1=Asked Correctly, 2=Not Asked, 3=Asked Incorrectly, 4=Not As Scripted, 5=N/A, 6=Obvious, RC=Recorded Correctly):

        Each question may include:
        - Alt: acceptable alternate phrasing
        - Condition: when the question should be asked

        EVERY SINGLE QUESTION MUST HAVE A GRADE. If a question requires conditions that have not been met, grade it as "5". All other questions that are not asked correctly should be graded as "2".

        {format_questions_for_prompt(questions_dict)}

        Return ONLY a JSON object with question IDs as keys and grade codes as values. Example: {{"CE_1": "1", "CE_2": "2"}}. DO NOT SAY ANYTHING ELSE, DO NOT ADD REASONING OR OTHER COMMENTS INTO THE JSON, JUST THE GRADE.
    """)
    print("FULL PROMPT: ", prompt)

    response = prompt_ollama(prompt)
    print("RAW_RESPONSE: ", response)

    response = clean_response(response)
    print("CLEAN RESPONSE: ", response)

    return json.loads(response)


def _extract_grade_and_reasoning(response: str) -> Tuple[str | None, str]:
    if not response:
        return None, ""

    cleaned = response.strip()
    match = re.search(r"\[([1-6])\]", cleaned)
    if not match:
        return None, cleaned

    grade_code = match.group(1)
    reasoning = re.sub(r"\[[1-6]\]", "", cleaned, count=1).strip()
    return grade_code, reasoning


def _format_question_sequence(questions_dict: Dict[str, Dict[str, Any]]) -> str:
    return "\n".join(
        f"{index}. {question_id}: {question_data['text']}"
        for index, (question_id, question_data) in enumerate(questions_dict.items(), start=1)
    )


def ai_grade_per_question(
    transcript_text: str,
    questions_dict: Dict[str, Dict[str, Any]]
) -> Dict[str, Dict[str, str]]:
    """Grade a transcript one question at a time using a persistent chat."""
    system_prompt = textwrap.dedent(f"""
        You are a 911 call quality assurance analyst. Your job is to ensure that important medical questions are asked precisely and in the correct order.

        You will be given one question at a time, and it is your job to determine if it was properly asked using this transcript. Some of the speaker labeling may be incorrect, so treat the transcript as a whole.

        Grade codes:
        1 = Asked Correctly (Question asked and in the correct order)
        2 = Not Asked (Conditions met to ask but question still ommitted)
        3 = Asked Incorrectly (Question asked but wording is different)
        4 = Not As Scripted (Question asked but out of order)
        5 = Not applicable (Usually if some conditions are not met to ask)
        6 = Obvious (Usually if mentioned by caller before dispatcher asked)

        Rules:
        - Every question must receive exactly one grade.
        - If a question's conditions are not met, grade it as 5.
        - If the question is not clearly asked and the condition is met, grade it as 2 unless another grade fits better.
        - For every answer, use this exact structure: [X] reasoning text, where X is one of 1, 2, 3, 4, 5, or 6.
        - The grade must appear in square brackets.
        - If transcript labels look wrong, including cases where the dispatcher seems to be talking to themself or not waiting for a proper response, use the conversational flow to judge what really happened.

        Question order:
        {_format_question_sequence(questions_dict)}

        Transcript:
        {transcript_text}
    """).strip()

    print(f"[SYSTEM]\n{system_prompt}\n")

    messages = [{"role": "system", "content": system_prompt}]
    grade_details: Dict[str, Dict[str, str]] = {}

    for question_id, question_data in questions_dict.items():
        user_message = format_question_for_chat(question_id, question_data)
        print(f"==============================\n[USER]\n{user_message}\n")
        messages.append({"role": "user", "content": user_message})

        grade_code = None
        reasoning = ""
        for attempt in range(PER_QUESTION_MAX_RETRIES):
            response = chat_ollama(messages)
            print(f"[OLLAMA]\n{response}\n")
            grade_code, reasoning = _extract_grade_and_reasoning(response)

            if grade_code:
                assistant_reply = response.strip()
                messages.append({"role": "assistant", "content": assistant_reply})
                grade_details[question_id] = {
                    "code": grade_code,
                    "reasoning": reasoning,
                }
                break

            invalid_reply = (response or "").strip()
            if invalid_reply:
                messages.append({"role": "assistant", "content": invalid_reply})

            if attempt < PER_QUESTION_MAX_RETRIES - 1:
                messages.append(
                    {
                        "role": "user",
                        "content": "Your last reply was invalid because it did not include a grade in square brackets. Reply again using this exact structure: [X] reasoning text. Also remember that transcript labels may be incorrect, including cases where the dispatcher appears to talk to themself or does not wait for a proper response.",
                    }
                )
            print("=== RETRYING ===")

        if not grade_code:
            messages.append({"role": "assistant", "content": "[5] " + FALLBACK_REASONING})
            grade_details[question_id] = {
                "code": "5",
                "reasoning": FALLBACK_REASONING,
            }

    return grade_details


def format_grades(
    ai_grades: Dict[str, Dict[str, str]],
    questions: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, str]]:
    """Format AI grade details for API responses without exposing reasoning yet."""
    return {
        q_id: {
            "code": ai_grades.get(q_id, {}).get("code", "2"),
            "label": q_data["text"],
            "status": GRADE_KEY.get(ai_grades.get(q_id, {}).get("code", "2"), "Unknown"),
        }
        for q_id, q_data in questions.items()
    }


def calculate_percentage(grades: Dict[str, Any], questions: Dict[str, Dict[str, Any]]) -> float:
    """Calculate a percentage from formatted grade objects."""
    if not grades or not questions:
        return 0.0

    grade_codes = {q_id: grade_data.get("code", "2") for q_id, grade_data in grades.items()}
    return round(calculate_final_grade(grade_codes, questions), 1)


def grade_transcript_file(nature_code: str, transcript_path: Path, output_path: Path) -> Tuple[Dict[str, Any], Path]:
    """Grade a transcript JSON file and write ``grades.json`` to ``output_path``."""
    # Check trasnscript is valid
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript_data = json.load(f)
    if not isinstance(transcript_data, dict) or "segments" not in transcript_data:
        raise ValueError("Invalid transcript format")

    # Convert transcript to text, get nature code questions
    transcript_text = json_to_text(json_data=transcript_data)
    questions = load_nature_code_questions(nature_code)

    # Run AI grading
    print("Running AI grading...", flush=True)
    ai_grades = ai_grade_per_question(transcript_text, questions)
    if not ai_grades:
        raise RuntimeError("AI grading returned empty results")
    else:
        grades = format_grades(ai_grades, questions)
    print(f"Grade transcript completed. Got {len(grades)} grades.", flush=True)

    # Calculate grade
    percentage = calculate_percentage(grades, questions)
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
        "timestamp": datetime.now().isoformat() + "Z",
        "grades": grades,
        "metadata": {
            "language": transcript_data.get("language", "unknown"),
            "segment_count": len(transcript_data.get("segments", [])),
            "grader_version": "2.0.0",
            "model": OLLAMA_MODEL,
            "questions_source": f"EMSQA.csv (Case Entry + {nature_code})",
        },
    }

    grades_path = output_path / "grades.json"
    with open(grades_path, "w", encoding="utf-8") as f:
        json.dump(response, f)

    return response, grades_path
