import json
import os
import shutil
from pathlib import Path
from urllib.parse import unquote

from flask import Blueprint, jsonify, request, send_from_directory
from pathvalidate import sanitize_filepath, sanitize_filename

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

        if description == "transcript":
            if "segments" not in replacement_payload:
                return jsonify({"error": "Transcript must include 'segments'"}), 400
        elif description == "grades":
            # Validate grades structure
            required_fields = ["grades", "detected_nature_code"]
            if not all(field in replacement_payload for field in required_fields):
                return jsonify({"error": "Grades must include 'grades' and 'detected_nature_code'"}), 400

            # Check if nature code changed
            new_nature_code = replacement_payload["detected_nature_code"]     
            if new_nature_code != nature:
                # Need to rename the folder and all files
                base_dir = Path(OUTPUT_DIR)

                # Sanitize new directory components
                safe_agent = sanitize_filename(agent, replacement_text="-")   
                safe_new_folder = sanitize_filename(f"{date}_{time}_{new_nature_code}", replacement_text="-")

                # Build new directory path
                new_record_dir = sanitize_filepath(base_dir / safe_agent / safe_new_folder, replacement_text="-")
                new_record_dir = Path(new_record_dir)

                # Create new directory if it doesn't exist
                new_record_dir.mkdir(parents=True, exist_ok=True)

                # Build new base filename
                new_base_name = sanitize_filename(
                    f"{agent}_{date}_{time}_{new_nature_code}",
                    replacement_text="-"
                )

                # Rename all files in the record
                for file in record_dir.iterdir():
                    if not file.is_file():
                        continue

                    filename_parts = file.name.split('_')
                    if len(filename_parts) >= 5:
                        # Replace nature code in filename
                        filename_parts[3] = new_nature_code
                        new_filename = '_'.join(filename_parts)

                        # Sanitize new filename
                        new_filename = sanitize_filename(new_filename, replacement_text="-")

                        # Move file
                        new_file_path = new_record_dir / new_filename
                        shutil.move(str(file), str(new_file_path))

                # Remove old directory if empty
                try:
                    record_dir.rmdir()
                except OSError:
                    # Directory not empty, that's fine
                    pass

                # Update paths for the grades file
                record_dir = new_record_dir
                filename = sanitize_filename(f"{new_base_name}_grades.json", replacement_text="-")
                file_path = record_dir / filename

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(replacement_payload, f, indent=2, ensure_ascii=False)   

        return jsonify({
            'message': 'File updated successfully',
            'filename': filename,
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
