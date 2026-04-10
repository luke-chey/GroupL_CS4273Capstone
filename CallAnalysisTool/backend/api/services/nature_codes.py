# Standard library
import json
from typing import Any, Dict
import textwrap
from pathlib import Path

# Third party
import pandas as pd

# Local modules
from api.services.ollama_handler import prompt_ollama
from api.services.text_handler import json_to_text

KEYWORDS_PATH = Path("data") / "nature_keywords.json"
EMSQA_PATH = Path("data") / "EMSQA.csv"

def load_nature_code_questions(nature_code: str, include_case_entry: bool = True) -> Dict[str, Dict[str, Any]]:
    """Load grading questions for a nature code from ``EMSQA.csv``. Also loads Case Entry questions by default."""
    try:
        df = pd.read_csv(EMSQA_PATH)

        if include_case_entry:
            nature_questions = df[df["NatureCode"].isin(["Case Entry", nature_code])]
        else:
            nature_questions = df[df["NatureCode"] == nature_code]

        questions_dict: Dict[str, Dict[str, Any]] = {}

        for _, row in nature_questions.iterrows():
            if pd.notna(row["Question_Text"]) and pd.notna(row["Question_ID"]):
                qid = str(row["Question_ID"])
                prefix = "CE" if row["NatureCode"] == "Case Entry" else "NC"
                key = f"{prefix}_{qid}"

                questions_dict[key] = {
                    "text": row["Question_Text"],
                    "parent": row["Parent_Question_ID"] if pd.notna(row["Parent_Question_ID"]) else None,
                    "alternatives": row["Allowed_Alternatives"] if pd.notna(row["Allowed_Alternatives"]) else None,
                    "condition": row["Condition"] if pd.notna(row["Condition"]) else None,
                    "condition_type": row["Condition_Type"] if pd.notna(row["Condition_Type"]) else None,
                    "age_min_f": row["Age_Min_F"] if pd.notna(row["Age_Min_F"]) else None,
                    "age_min_m": row["Age_Min_M"] if pd.notna(row["Age_Min_M"]) else None,
                    "clarification_allowed": row["Clarification_Allowed"] if pd.notna(row["Clarification_Allowed"]) else None,
                    "macros": row["Macros"] if pd.notna(row["Macros"]) else None,
                    "echo": {
                        "level": row["ECHO_Level"] if pd.notna(row["ECHO_Level"]) else None,
                        "number": row["ECHO_Number"] if pd.notna(row["ECHO_Number"]) else None,
                        "letter": row["ECHO_Letter"] if pd.notna(row["ECHO_Letter"]) else None,
                        "response": row["ECHO_response"] if pd.notna(row["ECHO_response"]) else None,
                    },
                    "scenario": row["Scenario/Condition"] if pd.notna(row["Scenario/Condition"]) else None,
                }
        return questions_dict
    except FileNotFoundError:
        print(f"Error: EMSQA.csv file not found at {EMSQA_PATH}")
        return {}
    except Exception as exc:
        print(f"Error loading questions for Nature Code {nature_code}: {exc}")
        return {}

def load_nature_codes():
    # Open json file
    with open(KEYWORDS_PATH, 'r') as f:
        data = json.load(f)

    # Getting only the nature codes themselves (not using keywords)
    nature_codes = data.keys()

    # Skip case entry (first key)
    nature_codes = list(nature_codes)[1:]

    # Converting list to a string
    nature_codes = ("; ").join(nature_codes)

    return nature_codes

def detect_nature_code(transcript_path):
    # Load naturecodes
    nature_codes = load_nature_codes()

    # Load transcript text
    transcript_text = json_to_text(file_path=transcript_path)

    # Run ollama query
    prompt = textwrap.dedent(f"""
        You are a 911 call quality assurance analyst. From the provided transcript, you need to determine the correct nature code. The nature code should be based on the initial event that caused the caller to call in. If the situation evolves through the course of the call, still use the first nature code that occurs. Example: Someone falls, and now they are having a headache, or their heart is pounding. The nature code would still be Falls. 

        TRANSCRIPT:
        {transcript_text}

        NATURE CODES (SELECT ONLY ONE):
        {nature_codes}

        Return ONLY the PRIMARY nature code you have identified based on the transcript, do not give any reasoning or other output. Return the nature code you've selected EXACTLY AS IT APPEARS in the provided list. Nature codes are separated by semimcolons (;), and may include multiple variants, include the full text, all variants, EXACTLY AS IT APPEARS.""")

    response = prompt_ollama(prompt)

    # Sometimes it likes to include multiple, so take first one
    response = response.split(";")[0]

    return response