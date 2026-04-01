# Standard library
import json
import os
import shutil
import zipfile
import uuid
from pathlib import Path

# Third-party
from flask import Blueprint, request, jsonify
from pathvalidate import sanitize_filepath

# Local modules
from api.services.ai_grader import (
    detect_nature_codes_in_memory,
    grade_transcript_file,
    identify_nature_code,
)
from api.services.speaker_separation import speaker_separation
from api.services.text_handler import extract_info_from_cdr, json_to_text
from api.services.whisperx_transcriber import get_transcriber

upload_bp = Blueprint('upload', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

@upload_bp.route('/upload', methods=['POST'])
def upload():
    """
    Accepts a .zip or .json file

    Transcribes zip contents (if provided), grades transcription.
    
    Response: JSON with success message and record folder name.
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

            # Get file extension, determine if zip
            filename, file_extension = os.path.splitext(file.filename)
            print(f"File detected. Name: {filename}. Extension: {file_extension}")
            if file_extension == '.zip':
                is_zip = True

        # Do all processing in temp dir
        date = time = agent_name = (None,) * 3
        cdr_path = audio_path = transcript_path = grades_path = nature_code = (None,) * 5
        transcript_data = None

        temp_dir = OUTPUT_DIR / "_tmp" / str(uuid.uuid4().hex)
        temp_dir.mkdir(parents=True, exist_ok=True)
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
        response, grades_path = grade_transcript_file(nature_code, transcript_path, TEMP_PATH)

        # Create destination folder and move everything there
        # Base output directory
        base_dir = Path(OUTPUT_DIR)

        # Create folder: output/{agent_name}/{date}_{time}_{nature_code}/
        dest_dir = base_dir / agent_name / f"{date}_{time}_{nature_code}"
        dest_dir = sanitize_filepath(dest_dir, replacement_text="-")
        dest_dir.mkdir(parents=True, exist_ok=True)

        # Build base filename prefix
        base_name = f"{agent_name}_{date}_{time}_{nature_code}"

        # Source paths
        cdr_src = Path(cdr_path)
        audio_src = Path(audio_path)
        transcript_src = Path(transcript_path)
        grades_src = Path(grades_path)

        # Destination paths (preserve correct extensions and sanitize)
        cdr_dst = dest_dir / f"{base_name}_cdr{cdr_src.suffix}"
        cdr_dst = sanitize_filepath(cdr_dst, replacement_text="-")

        audio_dst = dest_dir / f"{base_name}_audio{audio_src.suffix}"
        audio_dst = sanitize_filepath(audio_dst, replacement_text="-")

        transcript_dst = dest_dir / f"{base_name}_transcript{transcript_src.suffix}"
        transcript_dst = sanitize_filepath(transcript_dst, replacement_text="-")

        grades_dst = dest_dir / f"{base_name}_grades{grades_src.suffix}"
        grades_dst = sanitize_filepath(grades_dst, replacement_text="-")

        # Source/dest dict
        source_dest_dict = {
            cdr_src: cdr_dst,
            audio_src: audio_dst,
            transcript_src: transcript_dst,
            grades_src: grades_dst
        }

        # Move and rename to final destination
        for src, dst in source_dest_dict.items():
            try:
                shutil.move(src, dst)
            except Exception as e:
                print(f"Failed to move '{src}' to '{dst}': {e}")

        # Remove temp directory
        try:
            shutil.rmtree(TEMP_PATH)
        except Exception as e:
            print(f"Failed to remove temp directory '{TEMP_PATH}': {e}")

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
