import json
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

from flask import Blueprint, jsonify, request, send_from_directory
from api.services.ai_grader import calculate_final_grade
from api.services.nature_codes import load_nature_code_questions

files_bp = Blueprint('files', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)


def decode_filename_parts(filename):
    """
    Decode a filename from the route and split it into its base name, extension,
    and underscore-delimited parts.
    """
    decoded_filename = unquote(filename)
    name_part, ext = decoded_filename.rsplit('.', 1)
    parts = name_part.split('_')
    return decoded_filename, name_part, ext, parts

def serve_audio(relative_path):
    """
    Serve audio files from the output directory.
    """
    #print(f"Serving audio file: {relative_path}")

    output_dir = OUTPUT_DIR.resolve()
    file_path = output_dir / relative_path

    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404

    file_dir = file_path.parent
    file_name = file_path.name

    return send_from_directory(str(file_dir), file_name)

@files_bp.route('/files/<string:filename>', methods=['GET'])
def get_file(filename):
    """
    Returns or serves a given file in the system.

    Expects file to be named like `{agent}_{date}_{time}_{nature}_{desc}.{ext}`

    Example: `lchey_032626_093424_Case Entry_audio.wav`
    """
    try:
        base_dir = Path(OUTPUT_DIR)

        # Split into parts
        filename, name_part, ext, parts = decode_filename_parts(filename)

        #print(f"Serving file:\nDecoded: {filename}\nParts: {parts}")

        if len(parts) < 4:
            return jsonify({'error': 'Invalid filename format'}), 400

        # Get info from parts
        agent = parts[0]
        date = parts[1]
        time = parts[2]
        nature = parts[3]

        # Check that file exists
        record_dir = base_dir / agent / f"{date}_{time}_{nature}"
        file_path = record_dir / filename
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404

        ext = ext.lower()

        # If wav, serve audio
        if ext == "wav":
            relative_path = f"{agent}/{date}_{time}_{nature}/{filename}"
            return serve_audio(relative_path)

        # If json, jsonify and return
        if ext == "json":
            with open(file_path, "r", encoding="utf-8") as f:
                return jsonify(json.load(f))

        # If txt, return plaintext
        if ext == "txt":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read(), 200, {"Content-Type": "text/plain"}

        return jsonify({'error': 'Unsupported file type'}), 400

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@files_bp.route('/files/<string:filename>', methods=['PUT'])
def put_file(filename):
    """
    Updates a given file in the system. 

    Expects file to be named like `{agent}_{date}_{time}_{nature}_{desc}.{ext}`

    Example: `lchey_032626_093424_Case Entry_audio.wav`
    """
    try:
        base_dir = Path(OUTPUT_DIR)

        # Split into parts
        filename, name_part, ext, parts = decode_filename_parts(filename)

        #print(f"Updating file:\nDecoded: {filename}\nParts: {parts}")

        if len(parts) < 5:
            return jsonify({'error': 'Invalid filename format'}), 400

        # Get info from parts
        agent = parts[0]
        date = parts[1]
        time = parts[2]
        nature = parts[3]
        description = "_".join(parts[4:]).lower()

        # Check that file exists
        record_dir = base_dir / agent / f"{date}_{time}_{nature}"
        file_path = record_dir / filename
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404

        ext = ext.lower()

        # If not grades or transcript, don't update
        if ext != "json" or description not in {"grades", "transcript"}:
            return jsonify({'error': 'Unsupported file type'}), 400

        if not request.is_json:
            return jsonify({'error': 'No replacement file or JSON body provided'}), 400

        replacement_payload = request.get_json(silent=True)
        if replacement_payload is None:
            return jsonify({'error': 'Invalid JSON body'}), 400
        
        if description == "transcript" and "segments" not in replacement_payload:
            return jsonify({"error": "Transcript must include 'segments'"}), 400

        if description == "grades" and not any(
            key in replacement_payload for key in ("grades", "per_question")
        ):
            return jsonify({"error": "Grades file must include 'grades' or 'per_question'"}), 400

        if description == "grades":
            print(f"Original grade: {replacement_payload.get("grade_percentage")}")

            grades_payload = replacement_payload.get("grades") or replacement_payload.get("per_question") or {}
            nature_code = replacement_payload.get("detected_nature_code")

            if not nature_code:
                return jsonify({"error": "Grades file must include 'detected_nature_code'"}), 400

            questions_dict = load_nature_code_questions(nature_code)
            if not questions_dict:
                return jsonify({"error": f"Could not load questions for nature code '{nature_code}'"}), 400

            grade_codes = {
                qid: str((grade_data or {}).get("code", "2"))
                for qid, grade_data in grades_payload.items()
            }

            percentage = round(calculate_final_grade(grade_codes, questions_dict), 1)
            print(f"New grade: {percentage}")
            total_questions = len(grades_payload)
            case_entry_count = sum(1 for qid in grades_payload if qid.startswith("CE_"))
            nature_code_count = sum(1 for qid in grades_payload if qid.startswith("NC_"))
            questions_asked_correctly = sum(
                1 for grade_data in grades_payload.values()
                if (grade_data or {}).get("code") in {"1", "6"}
            )
            questions_missed = total_questions - questions_asked_correctly

            replacement_payload["grades"] = grades_payload
            if "per_question" in replacement_payload:
                replacement_payload["per_question"] = grades_payload
            replacement_payload["grade_percentage"] = percentage
            replacement_payload["total_questions"] = total_questions
            replacement_payload["case_entry_questions"] = case_entry_count
            replacement_payload["nature_code_questions"] = nature_code_count
            replacement_payload["questions_asked_correctly"] = questions_asked_correctly
            replacement_payload["questions_missed"] = questions_missed
            replacement_payload["timestamp"] = datetime.now().isoformat() + "Z"
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(replacement_payload, f, indent=2, ensure_ascii=False)

        return jsonify({
            'message': 'File updated successfully',
            'filename': filename,
            'new_grade': replacement_payload.get('grade_percentage'),
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500





