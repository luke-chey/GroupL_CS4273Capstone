# Jaiden Sizemore
# CS4273 Group G
# Last Updated 03/28/2026: Consolidated transcript and CDR text helpers

# Usage: python text_handler.py <filepath.json>

import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple, Any


def json_to_text(file_path = None, json_data = None):
    """
    Parse a JSON transcription file into plain text lines.

    Output format:
    [Timestamp][Speaker]: Text
    """
    try:
        if json_data is not None:
            data = json_data
        else:
            with open(file_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        return ""
    except json.JSONDecodeError:
        print(f"Error: File '{file_path}' is not valid JSON.")
        return ""
    except Exception as exc:
        print(f"Error reading file: {exc}")
        return ""

    text_output = ""

    if "segments" in data and isinstance(data["segments"], list):
        for segment in data["segments"]:
            start_time = segment.get("start", 0.0)
            end_time = segment.get("end", 0.0)
            speaker = segment.get("speaker", "UNKNOWN")
            transcript_text = segment.get("text", "").strip()

            start_minutes = int(start_time // 60)
            start_seconds = start_time % 60
            end_minutes = int(end_time // 60)
            end_seconds = end_time % 60

            start_timestamp = f"{start_minutes:02d}:{start_seconds:04.1f}"
            end_timestamp = f"{end_minutes:02d}:{end_seconds:04.1f}"
            text_output += f"[{start_timestamp}-{end_timestamp}] {speaker}: {transcript_text}\n"
    else:
        print("Error: JSON file does not contain 'segments' array or has unexpected structure.")
        return ""

    return text_output


def extract_info_from_cdr(cdr_path: Path) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Extract date (YYYYMMDD), time (HHMMSS), and dispatcher name from a CDR text file.
    """
    cdr_content = cdr_path.read_text(encoding="utf-8", errors="ignore")

    start_match = re.search(
        r"\bStart:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})",
        cdr_content,
    )
    if not start_match:
        return None, None, None

    year, month, day, hour, minute, second = start_match.groups()
    date_str = f"{year}{month}{day}"
    time_str = f"{hour}{minute}{second}"

    agent_match = re.search(r"\bAGENT_NAME:\s*([^,\s]+)", cdr_content)
    if not agent_match:
        agent_match = re.search(r"\bAGENT:\s*([^,\s]+)", cdr_content)

    agent_name = agent_match.group(1).strip() if agent_match else None
    if not agent_name:
        return None, None, None

    return date_str, time_str, agent_name

IGNORE_LIST = [
    "CE_1b",
    "CE_2a",
    "CE_FT1",
]


def _format_parent_question_id(question_id: str, parent_question_id: str) -> str:
    if parent_question_id.startswith(("CE_", "NC_")):
        return parent_question_id

    prefix = "CE" if question_id.startswith("CE_") else "NC"
    return f"{prefix}_{parent_question_id}"


def format_questions_for_prompt(questions_dict):
    lines = []

    for qid, q in questions_dict.items():
        parts = [f"{qid}: {q['text']}"]

        if (qid in IGNORE_LIST):
            parts.append("[PROTOCOL QUESTION: ALWAYS GRADE AS N/A (5)]")

        if q["parent"]:
            parts.append(f"[Follows: {_format_parent_question_id(qid, q['parent'])}]")

        if q["alternatives"]:
            parts.append(f"[Alt: {q['alternatives']}]")

        if q["condition"]:
            parts.append(f"[Condition: {q['condition']}]")

        if q["condition_type"]:
            parts.append(f"[Condition Type: {q['condition_type']}]")

        if q["age_min_f"] or q["age_min_m"]:
            parts.append(f"[Age: F>{q['age_min_f']} M>{q['age_min_m']}]")

        if q["clarification_allowed"]:
            parts.append(f"[Clarification Allowed: {q['clarification_allowed']}]")

        if q["macros"]:
            parts.append(f"[Macro: {q['macros']}]")

        if q["echo"]["level"] or q["echo"]["number"] or q["echo"]["letter"] or q["echo"]["response"]:
            parts.append(
                f"[ECHO: level={q['echo']['level']} number={q['echo']['number']} letter={q['echo']['letter']} response={q['echo']['response']}]"
            )

        if q["scenario"]:
            parts.append(f"[Scenario: {q['scenario']}]")

        lines.append(" ".join(parts))

    return "\n".join(lines)

def format_question_for_chat(question_id: str, question_data: Dict[str, Any]) -> str:
    parts = [f"Question ID: {question_id}", f"Question Text: {question_data['text']}"]

    if (question_id in IGNORE_LIST):
        parts.append("[Question not related to transcript]: ALWAYS GRADE AS N/A (5)]")
        return "\n".join(parts)

    if question_data.get("parent"):
        parts.append(f"Should follow question: {_format_parent_question_id(question_id, question_data['parent'])}")
    if question_data.get("alternatives"):
        parts.append(f"Allowed wording alternatives: {question_data['alternatives']}")
    if question_data.get("condition"):
        parts.append(f"Condition: {question_data['condition']}")
    else:
        parts.append("Condition: None. This question should always be asked.")
    # if question_data.get("condition_type"):
    #     parts.append(f"Condition type: {question_data['condition_type']}")
    if question_data.get("age_min_f") or question_data.get("age_min_m"):
        parts.append(
            f"Minimum age context: female>{question_data.get('age_min_f')} male>{question_data.get('age_min_m')}"
        )
    # if question_data.get("clarification_allowed"):
    #     parts.append(f"Clarification allowed: {question_data['clarification_allowed']}")
    # if question_data.get("macros"):
    #     parts.append(f"Macro context: {question_data['macros']}")
    # if (
    #     question_data["echo"].get("level")
    #     or question_data["echo"].get("number")
    #     or question_data["echo"].get("letter")
    #     or question_data["echo"].get("response")
    # ):
    #     parts.append(
    #         "ECHO context: "
    #         f"level={question_data['echo'].get('level')} "
    #         f"number={question_data['echo'].get('number')} "
    #         f"letter={question_data['echo'].get('letter')} "
    #         f"response={question_data['echo'].get('response')}"
    #     )
    if question_data.get("scenario"):
        parts.append(f"Scenario: {question_data['scenario']}")
    parts.append(
        """Grade codes:
        1 = Asked Correctly (Question asked and in the correct order)
        2 = Not Asked (Conditions met to ask but question still ommitted)
        3 = Asked Incorrectly (Question asked but wording is different)
        4 = Not As Scripted (Question asked but out of order)
        5 = Not applicable (Usually if some conditions are not met to ask)
        6 = Obvious (Usually if mentioned by caller before dispatcher asked)\n""")
    parts.append(
        "Notes for grading:" \
        "- Transcript speaker labels may be wrong, so if it looks like the dispatcher is talking to themself or not waiting for a proper response, take that into account. " \
        "- Remember, you are assessing whether the dispatcher physically asked the questions and in the correct order. The order that questions are being provided to you is unrelated to whether or not the dispatcher followed protocol. Finally, very rarely can you say that something was 'mentioned previously' or 'implied' by context. " \
        "- Something is usually only 'Obvious' if the caller themself specifically said it before the dispatcher had a chance to ask. " \
        "- The questions are separated the way they are and use the wording that they do because they need to be asked distinctly and exactly, word-for-word.")
    parts.append(
        "\nReply using this exact structure: [X] reasoning text, where X is one of 1, 2, 3, 4, 5, or 6."
    )
    return "\n".join(parts)

def main():
    if len(sys.argv) != 2:
        print("Usage: python text_handler.py <filepath.json>")
        print("Example: python text_handler.py transcriptions/example.json")
        sys.exit(1)

    filename = sys.argv[1]
    if not os.path.exists(filename):
        print(f"Error: File '{filename}' does not exist.")
        sys.exit(1)

    return json_to_text(file_path=filename)


if __name__ == "__main__":
    result = main()
    if result:
        print(result)
