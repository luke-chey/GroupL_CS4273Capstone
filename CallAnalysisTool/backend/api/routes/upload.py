# Standard library
import json
import os
import shutil
import zipfile
import uuid
from pathlib import Path

# Third-party
from flask import Blueprint, request, jsonify
from pathvalidate import sanitize_filepath, sanitize_filename

# Local modules
from api.services.ai_grader import grade_transcript_file
from api.services.nature_codes import detect_nature_code
from api.services.speaker_separation import speaker_separation
from api.services.text_handler import extract_info_from_cdr
from api.services.whisperx_transcriber import get_transcriber

upload_bp = Blueprint('upload', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)


def create_temp_upload_dir():
    """
    Create an isolated temporary folder for one upload request.
    """
    temp_dir = OUTPUT_DIR / "_tmp" / uuid.uuid4().hex
    temp_dir.mkdir(parents=True, exist_ok=True)
    return temp_dir

def get_upload_input(upload_request):
    """
    Determine whether the request contains a ZIP file or a JSON transcript body.
    """
    if 'file' not in upload_request.files:
        if upload_request.is_json:
            print("Json detected")
            return "json", None, None, None

        print("No file or json provided")
        return None, None, None, "No file or json provided"

    file = upload_request.files['file']
    if file.filename == '':
        print("No file provided")
        return None, None, None, "No file selected"

    filename, file_extension = os.path.splitext(file.filename)
    print(f"File detected. Name: {filename}. Extension: {file_extension}")
    if file_extension == '.zip':
        return "zip", file, filename, None

    return None, None, None, "Unsupported file type"

def extract_zip_to_temp(file, filename, temp_path):
    """
    Save an uploaded ZIP file and extract its contents to the temp folder.
    """
    zip_path = temp_path / filename
    file.save(str(zip_path))

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(temp_path)

def find_required_zip_file(temp_path, pattern, missing_message):
    """
    Find a required extracted file matching a glob pattern.
    """
    matches = list(temp_path.glob(pattern))
    if not matches:
        return None, missing_message

    return matches[0], None

def transcribe_audio(audio_path, temp_path):
    """
    Transcribe the extracted audio file and save the raw transcript JSON.
    """
    transcriber = get_transcriber()
    print(f"Beginning transcription of {audio_path}")
    result = transcriber.transcribe(str(audio_path))

    raw_transcript_path = temp_path / "raw_transcript.json"
    with open(raw_transcript_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Transcription finished, saved to: {raw_transcript_path}")
    return raw_transcript_path

def process_zip_upload(file, filename, temp_path):
    """
    Extract, transcribe, and speaker-separate a ZIP upload.
    """
    print("Processing zip")
    extract_zip_to_temp(file, filename, temp_path)

    cdr_path, error = find_required_zip_file(temp_path, "*.txt", "No cdr file detected")
    if error:
        return None, error
    print(f"CDR file found: {cdr_path}")

    audio_path, error = find_required_zip_file(temp_path, "*.wav", "No audio file detected")
    if error:
        return None, error
    print(f"Audio file found: {audio_path}")

    date, time, agent_name = extract_info_from_cdr(cdr_path)
    print(f"Info extracted from CDR: Date={date}, Time={time}, Agent={agent_name}")

    raw_transcript_path = transcribe_audio(audio_path, temp_path)

    print("Separating speakers")
    transcript_path = speaker_separation(
        audio_path,
        raw_transcript_path,
        temp_path,
        dispatcher_name=agent_name,
        date_str=date,
        time_str=time,
    )
    print(f"Speaker separation finished, saved to: {transcript_path}")

    return {
        "date": date,
        "time": time,
        "agent_name": agent_name,
        "cdr_path": cdr_path,
        "audio_path": audio_path,
        "transcript_path": transcript_path,
    }, None

def process_json_upload(upload_request, temp_path):
    """
    Save a JSON transcript body into the temp folder for the grading pipeline.
    """
    print("Processing json")
    transcript_data = upload_request.get_json()
    date = transcript_data.get("date")
    time = transcript_data.get("time")
    agent_name = (
        transcript_data.get("agent_name") or
        transcript_data.get("speakers", [None])[0]
    )
    print(f"Info extracted from transcript: Date={date}, Time={time}, Agent={agent_name}")

    transcript_path = temp_path / "transcript.json"
    with open(transcript_path, 'w', encoding='utf-8') as f:
        json.dump(transcript_data, f, indent=2, ensure_ascii=False)

    return {
        "date": date,
        "time": time,
        "agent_name": agent_name,
        "cdr_path": None,
        "audio_path": None,
        "transcript_path": transcript_path,
    }, None

def process_upload_content(input_type, file, filename, upload_request, temp_path):
    """
    Process upload input into a transcript file plus record metadata.
    """
    if input_type == "zip":
        return process_zip_upload(file, filename, temp_path)

    if input_type == "json":
        return process_json_upload(upload_request, temp_path)

    print("Both zip and json handlers skipped")
    return None, "No file or json provided"

def grade_upload_transcript(transcript_path, temp_path):
    """
    Detect the nature code and grade the uploaded transcript.
    """
    print("Detecting nature code with AI")
    nature_code_id, nature_code_name, nature_code_reasoning = detect_nature_code(transcript_path)
    print(f"Detected nature code: [{nature_code_id}] {nature_code_name}\nReasoning: {nature_code_reasoning}")

    response, grades_path = grade_transcript_file(
        nature_code_id,
        transcript_path,
        temp_path,
        nature_code_reasoning=nature_code_reasoning,
    )

    return response, grades_path, nature_code_name

def build_destination_paths(record_data, nature_code_name, grades_path):
    """
    Build final output paths for all files produced by upload processing.
    """
    base_dir = Path(OUTPUT_DIR)
    agent_name = record_data["agent_name"]
    date = record_data["date"]
    time = record_data["time"]

    safe_agent = sanitize_filename(agent_name, replacement_text="-")
    safe_folder = sanitize_filename(f"{date}_{time}_{nature_code_name}", replacement_text="-")
    dest_dir = Path(
        sanitize_filepath(base_dir / safe_agent / safe_folder, replacement_text="-")
    )
    dest_dir.mkdir(parents=True, exist_ok=True)

    base_name = sanitize_filename(
        f"{agent_name}_{date}_{time}_{nature_code_name}",
        replacement_text="-"
    )

    source_suffixes = {
        record_data.get("cdr_path"): "cdr",
        record_data.get("audio_path"): "audio",
        record_data.get("transcript_path"): "transcript",
        grades_path: "grades",
    }

    destination_paths = {}
    for source_path, suffix in source_suffixes.items():
        if source_path is None:
            continue

        source_path = Path(source_path)
        destination_name = sanitize_filename(
            f"{base_name}_{suffix}{source_path.suffix}",
            replacement_text="-"
        )
        destination_paths[source_path] = dest_dir / destination_name

    return dest_dir, destination_paths

def move_outputs_to_destination(source_dest_dict):
    """
    Move generated upload files to their final destination paths.
    """
    for src, dst in source_dest_dict.items():
        try:
            shutil.move(src, dst)
        except Exception as e:
            print(f"Failed to move '{src}' to '{dst}': {e}")

def cleanup_temp_dir(temp_path):
    """
    Remove the temporary upload directory.
    """
    try:
        shutil.rmtree(temp_path)
    except Exception as e:
        print(f"Failed to remove temp directory '{temp_path}': {e}")

@upload_bp.route('/upload', methods=['POST'])
def upload():
    """
    Accepts a .zip file or JSON transcript body.

    Transcribes zip contents (if provided), grades transcription.

    Response: JSON with success message and record folder name.
    """
    temp_path = None

    try:
        print("Upload endpoint called")

        input_type, file, filename, error = get_upload_input(request)
        if error:
            return jsonify({'error': error}), 400

        temp_path = create_temp_upload_dir()
        record_data, error = process_upload_content(
            input_type,
            file,
            filename,
            request,
            temp_path,
        )
        if error:
            return jsonify({'error': error}), 400

        response, grades_path, nature_code_name = grade_upload_transcript(
            record_data["transcript_path"],
            temp_path,
        )

        dest_dir, source_dest_dict = build_destination_paths(
            record_data,
            nature_code_name,
            grades_path,
        )
        move_outputs_to_destination(source_dest_dict)

        return jsonify({
            'outputDestination': str(dest_dir),
            'dispatcherName': record_data["agent_name"],
            'grades': response,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        if temp_path and temp_path.exists():
            cleanup_temp_dir(temp_path)
