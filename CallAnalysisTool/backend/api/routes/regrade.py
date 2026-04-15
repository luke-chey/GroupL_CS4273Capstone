# Standard Library
import json
import os
import shutil
import uuid
from pathlib import Path

# Third-party
from flask import Blueprint, request, jsonify
from pathvalidate import sanitize_filepath

from api.services.ai_grader import (
    grade_transcript_file
)

regrade_bp = Blueprint('regrade', __name__)

# Root of output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

@regrade_bp.route('/regrade', methods=['POST'])
def regrade():
    """
    Accepts .json file types.

    Regrades dispatcher over the new provided transcript and/or nature code and/or grades.

    Response: JSON with success message and record folder name.
    """
    try:
        print("Regrade endpoint called")

        if 'natureCode' not in request.files:
            print("Nature code detected")
        else:
            return jsonify({'error': 'No nature code provided'}), 400
            
        # Do all processing in temp dir
        date = time = agent_name = (None,) * 3

        temp_dir = OUTPUT_DIR / "_tmp" / str(uuid.uuid4().hex)
        temp_dir.mkdir(parents=True, exist_ok=True)
        TEMP_PATH = Path(temp_dir)
    
        data = request.get_json()
    
        if data is None:
            return {"error": "Flask could not parse the JSON."}, 400
        
        new_nature_code = data.get('natureCode')

        BASE_DIR = os.path.dirname(os.path.abspath(__file__))

        transcriptName = data.get('transcriptName')
        transcriptInfo = transcriptName.split("_")
        partialtranscriptPath = transcriptInfo[0] + "\\" + transcriptInfo[1] + "_" + transcriptInfo[2] + "_" + transcriptInfo[3] + "\\" + transcriptName
        transcriptPath = os.path.join(BASE_DIR, '..\\..\\output\\', partialtranscriptPath)

        response, grades_path = grade_transcript_file(new_nature_code, transcriptPath, TEMP_PATH)

        # Create destination folder and move everything there
        # Base output directory
        base_dir = Path(OUTPUT_DIR)

        # Create folder: output/{agent_name}/{date}_{time}_{nature_code}/
        agent_name = transcriptInfo[0]
        date = transcriptInfo[1]
        time = transcriptInfo[2]
        dest_dir = base_dir / agent_name / f"{date}_{time}_{new_nature_code}"
        dest_dir = sanitize_filepath(dest_dir, replacement_text="-")
        dest_dir.mkdir(parents=True, exist_ok=True)

        # Build base filename prefix
        base_name = f"{agent_name}_{date}_{time}_{new_nature_code}"

        # Source paths
        transcript_src = Path(transcriptPath)
        grades_src = Path(grades_path)

        # Destination paths (preserve correct extensions and sanitize)
        transcript_dst = dest_dir / f"{base_name}_transcript{transcript_src.suffix}"
        transcript_dst = sanitize_filepath(transcript_dst, replacement_text="-")

        grades_dst = dest_dir / f"{base_name}_grades{grades_src.suffix}"
        grades_dst = sanitize_filepath(grades_dst, replacement_text="-")

        # Source/dest dict
        source_dest_dict = {
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