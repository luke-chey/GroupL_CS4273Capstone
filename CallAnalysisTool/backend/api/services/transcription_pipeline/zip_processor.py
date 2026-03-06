#!/usr/bin/env python3
"""
Zip file processor that unzips files and renames based on CDR text content.

Goal (Ticket):
- Users should NOT have to manually rename .wav files.
- Read dispatcher name + date/time from the metadata CDR text file inside the zip.
"""

import sys
import tempfile
import zipfile
import re
import shutil
from pathlib import Path


def safe_slug(value: str, default: str = "unknown_dispatcher") -> str:
    if not value:
        return default
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value or default


def extract_info_from_cdr(cdr_content: str):
    """
    Extract date (YYYYMMDD), time (HHMMSS), and dispatcher name from CDR text.

    - Dispatcher name is primarily stored under AGENT_NAME (your example)
    - Some files may store it as AGENT (ticket description)
    - Fallback: AGENT_ID
    """
    # Start: 2026-02-27 12:44:33
    start_match = re.search(
        r"\bStart:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})",
        cdr_content,
    )
    if not start_match:
        return None, None, None

    year, month, day, hour, minute, second = start_match.groups()
    date_str = f"{year}{month}{day}"
    time_str = f"{hour}{minute}{second}"

    # Dispatcher name
    agent_match = re.search(r"\bAGENT_NAME:\s*([^,\s]+)", cdr_content)
    if not agent_match:
        agent_match = re.search(r"\bAGENT:\s*([^,\s]+)", cdr_content)

    agent_name = agent_match.group(1).strip() if agent_match else None

    # Fallback to agent id if needed
    if not agent_name:
        agent_id_match = re.search(r"\bAGENT_ID:\s*([^,\s]+)", cdr_content)
        if agent_id_match:
            agent_name = agent_id_match.group(1).strip()

    if not agent_name:
        return None, None, None

    return date_str, time_str, safe_slug(agent_name)


def extract_location_from_cdr(cdr_content: str):
    """
    Optional secondary goal: parse LOCATION: (lat,lon)
    Returns (lat, lon) or (None, None)
    """
    m = re.search(r"\bLOCATION:\s*\(([-\d.]+),\s*([-\d.]+)\)", cdr_content)
    if not m:
        return None, None
    return float(m.group(1)), float(m.group(2))


def find_cdr_file(extract_path: Path):
    """
    Find a CDR text file inside extracted zip contents.
    Prefers "*-CDR.txt", but falls back to any .txt containing 'Start:'.
    """
    cdr_files = list(extract_path.glob("*-CDR.txt"))
    if cdr_files:
        return cdr_files[0]

    # fallback: any txt that looks like a CDR export
    for txt in extract_path.glob("*.txt"):
        try:
            content = txt.read_text(encoding="utf-8", errors="ignore")
            if "Start:" in content and ("AGENT_NAME:" in content or "AGENT:" in content or "AGENT_ID:" in content):
                return txt
        except Exception:
            pass

    return None


def process_zip(zip_path, output_dir=None):
    """
    Process a zip file:
    - Extracts the zip
    - Reads CDR metadata (start datetime + dispatcher)
    - Creates output folder: YYYYMMDD_HHMMSS_dispatcher
    - Renames largest WAV to: YYYYMMDD_HHMMSS_dispatcher.wav
    """
    zip_path = Path(zip_path).resolve()
    if not zip_path.exists():
        print(f"Error: Zip file '{zip_path}' does not exist.")
        return None

    output_dir = Path(output_dir or zip_path.parent).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_extract_dir = Path(temp_dir)

        try:
            print(f"Extracting {zip_path}...")
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(temp_extract_dir)

            cdr_file = find_cdr_file(temp_extract_dir)
            if not cdr_file:
                print("Error: Could not find a CDR text file in the zip archive.")
                return None

            print(f"Reading CDR file: {cdr_file.name}")
            cdr_content = cdr_file.read_text(encoding="utf-8", errors="ignore")

            date_str, time_str, dispatcher = extract_info_from_cdr(cdr_content)
            if not all([date_str, time_str, dispatcher]):
                print("Error: Could not extract required information from CDR file.")
                return None

            lat, lon = extract_location_from_cdr(cdr_content)
            print(f"Parsed: date={date_str} time={time_str} dispatcher={dispatcher} location=({lat},{lon})")

            new_name = f"{date_str}_{time_str}_{dispatcher}"
            print(f"New name will be: {new_name}")
            
        
            new_zip_path = zip_path.with_name(f"{new_name}.zip")
            print(f"Renaming zip file: {zip_path.name} -> {new_zip_path.name}")
            zip_path.rename(new_zip_path)

            zip_path = new_zip_path

            final_folder_path = output_dir / new_name
            if final_folder_path.exists():
                shutil.rmtree(final_folder_path)
            final_folder_path.mkdir(parents=True, exist_ok=True)

            # Move extracted files into the final folder
            for item in temp_extract_dir.iterdir():
                if item.is_file():
                    shutil.move(str(item), str(final_folder_path / item.name))

            # Pick the largest WAV file and rename it
            wav_files = sorted(final_folder_path.glob("*.wav"), key=lambda p: p.stat().st_size, reverse=True)
            if not wav_files:
                print("Error: No .wav file found after extraction.")
                return None

            wav_file = wav_files[0]
            new_wav_path = final_folder_path / f"{new_name}.wav"
            print(f"Renaming audio file: {wav_file.name} -> {new_wav_path.name}")
            wav_file.rename(new_wav_path)

            print(f"Successfully processed zip file. Final folder: {final_folder_path}")
            return new_name

        except Exception as e:
            print(f"Error processing zip file: {e}")
            return None


def main():
    if len(sys.argv) != 2:
        print("Usage: python zip_processor.py <zip_file>")
        print(r'Example: python zip_processor.py "C:\path\to\Recording_1.zip"')
        sys.exit(1)

    zip_file = sys.argv[1]
    result = process_zip(zip_file)

    if result:
        print(f"\nSuccess! Processed as: {result}")
    else:
        print("\nFailed to process the zip file.")
        sys.exit(1)


if __name__ == "__main__":
    main()