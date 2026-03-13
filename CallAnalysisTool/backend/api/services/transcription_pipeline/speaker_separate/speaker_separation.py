"""
USAGE:
    python3 speaker_separation.py <audio_file.wav> <transcription.json>

    (python3 might not be necessary if running in a virtual environment)

    Arguments:
        audio_file.wav     - WAV audio file of emergency call
        transcription.json - WhisperX transcription JSON output with naming convention: YYYYMMDD_HHMMSS_dispatchername.json

    Output:
        Creates <audio_basename>.json in the same directory as the input JSON file
        Output format includes date, time, dispatcher name extracted from input filename

REQUIREMENTS:
    - Python 3.7+
    - whisperx
    - torch
"""
import json
import os
import sys
import whisperx
import torch
import gc

def extract_dispatcher_name(basename):
    """
    Extracts the dispatcher name from the audio/folder basename.
    Expected format: YYYYMMDD_HHMMSS_dispatchername

    Args:
        basename(str): The base name (without extension) in format YYYYMMDD_HHMMSS_dispatchername
    Returns:
        A tuple of (date_part, time_part, dispatcher_name) extracted from the basename.
    """
    parts = basename.split('_')
    if len(parts) >= 3:
        date_part = parts[0]
        time_part = parts[1]
        dispatcher_name = '_'.join(parts[2:])  
        return date_part, time_part, dispatcher_name
    else:
        return "unknown", "unknown", "dispatcher"

def create_combined_transcript(speaker_segments, audio_basename, json_filename, output_path=None):
    """
    Formats and saves the final speaker-separated transcript as JSON in the new format.

    Args:
        speaker_segments(dict): A dictionary containing the list of dispatcher and caller segments.
        audio_basename(str):    The base name of the audio file (without extension). This is used to name the output file.
        json_filename(str):     The input JSON filename (used for output directory if output_path is None).
        output_path(str):       Optional full path for output file. If None, uses directory from json_filename.
    Returns:
        Saves the final speaker-separated transcript as <audio_basename>.json in the specified directory.
    """
    if output_path is None:
        output_dir = os.path.dirname(json_filename)
        if not output_dir:
            output_dir = "."
        output_file = os.path.join(output_dir, f"{audio_basename}.json")
    else:
        output_file = output_path

    # Extract dispatcher info from audio_basename (format: YYYYMMDD_HHMMSS_dispatchername)
    date_str, time_str, dispatcher_name = extract_dispatcher_name(audio_basename)

    all_segments = []
    for speaker, segments in speaker_segments.items():
        speaker_label = dispatcher_name if speaker == 'dispatcher' else 'caller'
        for segment in segments:
            all_segments.append({
                'speaker': speaker_label, 'start': segment['start'],
                'end': segment['end'], 'text': segment['text']
            })

    all_segments.sort(key=lambda x: x['start'])

    transcript_data = {
        'date': int(date_str) if date_str.isdigit() else 0,
        'time': int(time_str) if time_str.isdigit() else 0,
        'total_segments': len(all_segments),
        'speakers': [dispatcher_name, 'caller'],
        'segments': all_segments
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(transcript_data, f, indent=2, ensure_ascii=False)

def speaker_separation(audio_file, transcription_file, output_dir):
    """
    Main function to perform speaker separation on audio and transcription data.

    Args:
        audio_file (str): Path to the audio file (.wav)
        transcription_file (str): Path to the WhisperX transcription JSON file
        output_dir (str): Directory where the output should be saved
    """
    if not os.path.exists(audio_file) or not os.path.exists(transcription_file):
        raise FileNotFoundError("Audio file or transcription file not found")

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
    BATCH_SIZE = 8
    HF_TOKEN = os.getenv('HF_TOKEN')

    audio = whisperx.load_audio(audio_file)

    with open(transcription_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    result = {'segments': data['segments'], 'language': 'en'}

    align_model, metadata = whisperx.load_align_model(language_code=result["language"], device=DEVICE)
    result = whisperx.align(result["segments"], align_model, metadata, audio, DEVICE, return_char_alignments=False)

    del align_model
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()

    from whisperx.diarize import DiarizationPipeline
    diarize_model = DiarizationPipeline(token=HF_TOKEN, device=DEVICE)
    diarize_segments = diarize_model(audio, min_speakers=2, max_speakers=2)
    result = whisperx.assign_word_speakers(diarize_segments, result)

    del diarize_model
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()

    # Classify dispatcher based on questions
    speakers = set(seg.get('speaker', 'Unknown') for seg in result['segments'] if seg.get('speaker') != 'Unknown')
    if not speakers:
        speaker_segments = {'dispatcher': [], 'caller': []}
    else:
        speaker_texts = {spk: [seg['text'] for seg in result['segments'] if seg.get('speaker') == spk] for spk in speakers}
        questions = {spk: sum(1 for text in texts if '?' in text) for spk, texts in speaker_texts.items()}
        dispatcher_speaker = max(questions, key=questions.get) if questions else list(speakers)[0]

        for seg in result['segments']:
            spk = seg.get('speaker', 'Unknown')
            if spk == dispatcher_speaker:
                seg['_predicted_speaker'] = 'dispatcher'
            else:
                seg['_predicted_speaker'] = 'caller'

        # Move long questions from caller to dispatcher
        for seg in result['segments']:
            if seg.get('_predicted_speaker') == 'caller' and '?' in seg['text']:
                word_count = len(seg['text'].split())
                if word_count >= 3:
                    seg['_predicted_speaker'] = 'dispatcher'

        speaker_segments = {
            'dispatcher': [seg for seg in result['segments'] if seg.get('_predicted_speaker') == 'dispatcher'],
            'caller': [seg for seg in result['segments'] if seg.get('_predicted_speaker') == 'caller']
        }

    # Create output filename based on audio file basename
    audio_basename = os.path.splitext(os.path.basename(audio_file))[0]

    # Use the output_dir and create the combined transcript there
    output_path = os.path.join(str(output_dir), f"{audio_basename}.json")
    create_combined_transcript(speaker_segments, audio_basename, transcription_file, output_path)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 speaker_separation.py <audio_file> <json_file>")
        return

    audio_file, json_file = sys.argv[1], sys.argv[2]
    if not os.path.exists(audio_file) or not os.path.exists(json_file):
        print("Error: File not found")
        return

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
    BATCH_SIZE = 8
    HF_TOKEN = os.getenv('HF_TOKEN')

    audio = whisperx.load_audio(audio_file)

    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    result = {'segments': data['segments'], 'language': 'en'}

    align_model, metadata = whisperx.load_align_model(language_code=result["language"], device=DEVICE)
    result = whisperx.align(result["segments"], align_model, metadata, audio, DEVICE, return_char_alignments=False)

    del align_model
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()

    from whisperx.diarize import DiarizationPipeline
    diarize_model = DiarizationPipeline(token=HF_TOKEN, device=DEVICE)
    diarize_segments = diarize_model(audio, min_speakers=2, max_speakers=2)
    result = whisperx.assign_word_speakers(diarize_segments, result)

    del diarize_model
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()

    # Classify dispatcher based on questions
    speakers = set(seg.get('speaker', 'Unknown') for seg in result['segments'] if seg.get('speaker') != 'Unknown')
    if not speakers:
        speaker_segments = {'dispatcher': [], 'caller': []}
    else:
        speaker_texts = {spk: [seg['text'] for seg in result['segments'] if seg.get('speaker') == spk] for spk in speakers}
        questions = {spk: sum(1 for text in texts if '?' in text) for spk, texts in speaker_texts.items()}
        dispatcher_speaker = max(questions, key=questions.get) if questions else list(speakers)[0]

        for seg in result['segments']:
            spk = seg.get('speaker', 'Unknown')
            if spk == dispatcher_speaker:
                seg['_predicted_speaker'] = 'dispatcher'
            else:
                seg['_predicted_speaker'] = 'caller'

        # Move long questions from caller to dispatcher
        for seg in result['segments']:
            if seg.get('_predicted_speaker') == 'caller' and '?' in seg['text']:
                word_count = len(seg['text'].split())
                if word_count >= 3:
                    seg['_predicted_speaker'] = 'dispatcher'

        speaker_segments = {
            'dispatcher': [seg for seg in result['segments'] if seg.get('_predicted_speaker') == 'dispatcher'],
            'caller': [seg for seg in result['segments'] if seg.get('_predicted_speaker') == 'caller']
        }

    create_combined_transcript(speaker_segments, os.path.splitext(os.path.basename(audio_file))[0], json_file)

if __name__ == "__main__":
    main()