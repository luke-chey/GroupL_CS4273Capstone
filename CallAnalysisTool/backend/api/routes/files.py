import json
from pathlib import Path
from urllib.parse import unquote

from flask import Blueprint, jsonify, send_from_directory

files_bp = Blueprint('files', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

@files_bp.route('/files/<string:filename>')
def get_file(filename):
    try:
        filename = unquote(filename)
        base_dir = Path(OUTPUT_DIR)

        name_part, ext = filename.rsplit('.', 1)
        parts = name_part.split('_')

        print(f"Serving file:\nDecoded: {filename}\nParts: {parts}")

        if len(parts) < 4:
            return jsonify({'error': 'Invalid filename format'}), 400

        agent = parts[0]
        date = parts[1]
        time = parts[2]
        nature = parts[3]

        record_dir = base_dir / agent / f"{date}_{time}_{nature}"
        if not record_dir.exists() or not record_dir.is_dir():
            return jsonify({'error': 'File directory not found'}), 404

        file_path = record_dir / filename
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404

        ext = ext.lower()

        if ext == "wav":
            relative_path = f"{agent}/{date}_{time}_{nature}/{filename}"
            return serve_audio(relative_path)

        if ext == "json":
            with open(file_path, "r", encoding="utf-8") as f:
                return jsonify(json.load(f))

        if ext == "txt":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read(), 200, {"Content-Type": "text/plain"}

        return jsonify({'error': 'Unsupported file type'}), 400

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def serve_audio(relative_path):
    """
    Serve audio files from the output directory.
    """
    print(f"Serving audio file: {relative_path}")

    output_dir = OUTPUT_DIR.resolve()
    file_path = output_dir / relative_path

    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404

    file_dir = file_path.parent
    file_name = file_path.name

    return send_from_directory(str(file_dir), file_name)
