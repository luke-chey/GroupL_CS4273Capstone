import json
from pathlib import Path
from urllib.parse import unquote

from flask import Blueprint, jsonify, request, send_from_directory

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
        
        if "segments" not in replacement_payload:
            return jsonify({"error": "Transcript must include 'segments'"}), 400
        
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





