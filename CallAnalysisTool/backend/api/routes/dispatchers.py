# Standard library
import json
from pathlib import Path

# Third-party
from flask import Blueprint, jsonify
from urllib.parse import unquote

dispatchers_bp = Blueprint('dispatchers', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

@dispatchers_bp.route('/dispatchers', methods=['GET'])
def get_dispatchers():
    """
    Returns a list of all dispatchers in the system.

    Dispatchers contain the following:
    `name`
    `overallGrade`
    `numRecords`
    `numTranscripts`
    `numGrades`

    **Returns:**
    - `Dispatcher[] dispatchers`
    """
    try:
        # Base output directory
        base_dir = Path(OUTPUT_DIR)

        # Initialize response
        response = {
            "dispatchers": []
        }

        # Iterate over dispatcher folders
        for agent_dir in base_dir.iterdir():
            if not agent_dir.is_dir():
                continue

            dispatcher = {
                "name": agent_dir.name,
                "overallGrade": 0,
                "numRecords": 0,
                "numTranscripts": 0,
                "numGrades": 0
            }

            total_grade = 0
            grade_count = 0

            # Iterate over records (subfolders)
            for record_dir in agent_dir.iterdir():
                if not record_dir.is_dir():
                    continue

                dispatcher["numRecords"] += 1

                # Iterate over files in each record
                for file in record_dir.iterdir():
                    if not file.is_file():
                        continue

                    filename = file.name

                    if filename.endswith("transcript.json"):
                        dispatcher["numTranscripts"] += 1

                    elif filename.endswith("grades.json"):
                        dispatcher["numGrades"] += 1

                        # Try to read grade_percentage
                        try:
                            with open(file, "r") as f:
                                data = json.load(f)

                            grade = data.get("grade_percentage")
                            if isinstance(grade, (int, float)):
                                total_grade += grade
                                grade_count += 1
                        except Exception:
                            # Skip bad files silently
                            continue

            # Compute average grade
            if grade_count > 0:
                dispatcher["overallGrade"] = round(total_grade / grade_count, 2)
            else:
                dispatcher["overallGrade"] = 0

            response["dispatchers"].append(dispatcher)

        # Sort by overall grade
        response["dispatchers"].sort(key=lambda x: x["overallGrade"])

        return jsonify(response), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@dispatchers_bp.route('/dispatchers/<string:name>', methods=['GET'])
def get_dispatcher_records(name):
    """
    Returns a list of all records for a given dispatcher.

    **Returns:**
    - `str[] records`
    """
    try:
        # Base output directory
        base_dir = Path(OUTPUT_DIR)

        # Check that url is not whitespace
        if not name.strip():
            return jsonify({'error': 'Invalid name'}), 400

        # Check dispatcher folder exists
        agent_dir = base_dir / name
        if not agent_dir.exists() or not agent_dir.is_dir():
            return jsonify({'error': f'Agent "{name}" not found'}), 404
        
        # Initialize response
        response = {
            "records": []
        }

        # List subdirectories (call records)
        for item in agent_dir.iterdir():
            if item.is_dir():
                response["records"].append(item.name)
        response["records"].sort()

        return jsonify(response), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@dispatchers_bp.route('/dispatchers/<string:name>/<string:record_name>', methods=['GET'])
def get_record_details(name, record_name):
    """
    Returns all the files (names only) for a given record.
    
    **Returns:**
    - `str[] audioFiles` 
    - `str[] cdrFiles` 
    - `str[] transcriptFiles` 
    - `str[] gradeFiles` 
    - `str[] otherFiles` 
    """
    try:
        record_name = unquote(record_name)

        # Base output directory
        base_dir = Path(OUTPUT_DIR)

        # Check that url is not whitespace
        if not name.strip() or not record_name.strip():
            return jsonify({'error': 'Invalid name or record_name'}), 400

        # Check dispatcher folder exists
        agent_dir = base_dir / name
        if not agent_dir.exists() or not agent_dir.is_dir():
            return jsonify({'error': f'Agent "{name}" not found'}), 404

        # Check record folder exists
        record_dir = agent_dir / record_name
        if not record_dir.exists() or not record_dir.is_dir():
            return jsonify({'error': f'Record "{record_name}" not found for agent "{name}"'}), 404

        # Initialize response
        response = {
            "audioFiles": [],
            "cdrFiles": [],
            "transcriptFiles": [],
            "gradeFiles": [],
            "otherFiles": [],
        }

        # Scan directory
        for file in record_dir.iterdir():
            if not file.is_file():
                continue

            filename = file.name

            # Categorize based on naming + extension
            if filename.endswith("audio.wav"):
                response["audioFiles"].append(filename)

            elif filename.endswith("cdr.txt"):
                response["cdrFiles"].append(filename)

            elif filename.endswith("transcript.json"):
                response["transcriptFiles"].append(filename)

            elif filename.endswith("grades.json"):
                response["gradeFiles"].append(filename)

            else:
                response["otherFiles"].append(filename)

        return jsonify(response), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500