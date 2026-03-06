# Jaiden Sizemore
# CS4273 Group G
# Last Updated 10/16/2025: Adjusted timestamp format

# Usage: python JSONTranscriptionParser.py <filepath.json>

import json
import sys
import os

# Function for parsing Json transcription into the following format:
# [Timestamp][Speaker]: Text

# Input: Path to json file
# Output: Plain text in above format
def json_to_text(file_path):

    # Error handling for unsupported inputs
    try:
        # Attempt to open inputted file
        with open(file_path, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        # Inputted file doesn't exist
        print(f"Error: File '{file_path}' not found.")
        return ""
    except json.JSONDecodeError:
        # Json file format is invalid
        print(f"Error: File '{file_path}' is not valid JSON.")
        return ""
    except Exception as e:
        # Any other possible error
        print(f"Error reading file: {e}")
        return ""
    
    # Initialize string variable for storing output
    text_output = ""
    
    # Check if the JSON has the expected structure
    if 'segments' in data and isinstance(data['segments'], list):
        # For each message entry...
        for segment in data['segments']:
            # Extract the required fields
            start_time = segment.get('start', 0.0)              # Get Starting Timestamp component, "0.0" if missing
            end_time = segment.get('end', 0.0)                  # Get Ending Timestamp component, "0.0" if missing
            speaker = segment.get('speaker', 'UNKNOWN')         # Get Speaker component, "UNKNOWN" if missing
            transcript_text = segment.get('text', '').strip()   # Get Text component, empty string if missing
            
            # Format the line: "[Starting timestamp - Ending timestamp][Speaker]: Text"
            # Convert seconds to MM:SS format
            start_minutes = int(start_time // 60)
            start_seconds = start_time % 60
            end_minutes = int(end_time // 60)
            end_seconds = end_time % 60

            start_timestamp = f"{start_minutes:02d}:{start_seconds:04.1f}"
            end_timestamp = f"{end_minutes:02d}:{end_seconds:04.1f}"
            
            # Add the entry to the text output and move to the next line
            text_output += f"[{start_timestamp}–{end_timestamp}] {speaker}: {transcript_text}\n"
    else:
        # Incorrect structure
        print("Error: JSON file does not contain 'segments' array or has unexpected structure.")
        return ""
    
    # Return fully parsed transcript as a string
    return text_output

# Main method
def main():
    # Check if a file was provided as argument
    if len(sys.argv) != 2:
        print("Usage: python JSONTranscriptionParser.py <filepath.json>")
        print("Example: python JSONTranscriptionParser.py transcriptions/example.json")
        sys.exit(1)
    
    # Store inputted file name
    filename = sys.argv[1]
    
    # Check if the file exists
    if not os.path.exists(filename):
        print(f"Error: File '{filename}' does not exist.")
        sys.exit(1)
    
    # Put file through parser and store output in result
    result = json_to_text(filename)
    
    return result

if __name__ == "__main__":
    # Quick way to check output
    result = main()
    if result: 
        print(result)
