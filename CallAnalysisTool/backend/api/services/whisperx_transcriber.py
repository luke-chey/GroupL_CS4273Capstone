# Wraps WhisperX model loading, audio transcription, and CLI batch transcription helpers.

# Standard library
import os
import time
from datetime import datetime
from typing import Dict, Optional
import json

# Third-party
from pathlib import Path
from dataclasses import dataclass, asdict
import torch


_global_transcriber = None
_transcriber_config = None

@dataclass
class TranscriptionConfig:
    """Configuration for WhisperX transcription"""
    implementation: str = "whisperx"
    model_size: str = "large-v3"
    beam_size: int = 5
    best_of: int = 5
    temperature: float = 0.0
    language: Optional[str] = "en"  # Defaulted to English
    initial_prompt: Optional[str] = None
    word_timestamps: bool = True
    vad_filter: bool = False
    fp16: bool = True  # GPU uses FP16
    condition_on_previous_text: bool = True
    compression_ratio_threshold: float = 2.4
    log_prob_threshold: float = -1.0
    no_speech_threshold: float = 0.6
    align_model: Optional[str] = None
    batch_size: int = 32  # GPU can handle mor

    def to_dict(self):
        """Return this transcription configuration as a dictionary."""
        return asdict(self)


class WhisperXTranscriber:
    """WhisperX transcription wrapper"""

    def __init__(self, config: TranscriptionConfig = None):
        """Create a transcriber with lazy-loaded WhisperX model state."""
        self.config = config or TranscriptionConfig()
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.whisperx = None

    def load_model(self):
        """Load WhisperX model on CPU."""
        try:
            import whisperx
            self.whisperx = whisperx
        except ImportError:
            raise ImportError(
                "WhisperX not installed."
            )

        print(f"Loading WhisperX-{self.config.model_size}")
        print("Cuda available: ", torch.cuda.is_available())
        compute_type = "float16" if self.device == "cuda" else "int8"

        self.model = whisperx.load_model(
            self.config.model_size,
            self.device,
            compute_type=compute_type
        )
        print("Model loaded successfully!")

    def transcribe(self, audio_file: str) -> Dict:
        """
        Transcribe audio file

        Args:
            audio_file: Path to audio file

        Returns:
            Dictionary with transcription results
        """
        if self.model is None:
            self.load_model()

        print(f"Transcribing: {audio_file}")
        start_time = time.time()

        # Load audio
        audio = self.whisperx.load_audio(audio_file)

        # Transcribe
        result = self.model.transcribe(
            audio,
            batch_size=self.config.batch_size,
            language=self.config.language
        )

        # Align for word-level timestamps
        if self.config.word_timestamps:
            model_a, metadata = self.whisperx.load_align_model(
                language_code=result["language"],
                device=self.device
            )
            result = self.whisperx.align(
                result["segments"],
                model_a,
                metadata,
                audio,
                self.device,
                return_char_alignments=False
            )

        duration = time.time() - start_time

        # Format results to match test file structure
        return self._format_result(audio_file, result, duration)

    def _format_result(self, audio_file: str, result: Dict, duration: float) -> Dict:
        """Format transcription result to match test file structure exactly."""
        segments = []
        total_speech_duration = 0

        for seg in result.get("segments", []):
            segment_data = {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip(),
                "confidence": 0.0,
                "no_speech_prob": 0.0,
                "compression_ratio": 0.0,
            }

            if "words" in seg:
                segment_data["words"] = seg["words"]

            segments.append(segment_data)
            total_speech_duration += (seg["end"] - seg["start"])

        return {
            "audio_file": os.path.basename(audio_file),
            "implementation": "whisperx",
            "config": self.config.to_dict(),
            "language": result.get("language", "unknown"),
            "language_confidence": 0.0,
            "transcription_time": round(duration, 2),
            "total_speech_duration": round(total_speech_duration, 2),
            "real_time_factor": round(total_speech_duration / duration, 2) if duration > 0 else 0,
            "num_segments": len(segments),
            "segments": segments,
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "avg_confidence": 0.0,
                "min_confidence": 0.0,
                "max_confidence": 0.0,
                "avg_no_speech_prob": 0.0,
                "avg_compression_ratio": 0.0,
            }
        }

    def transcribe_batch(self, audio_files: list) -> list:
        """Transcribe multiple audio files."""
        if self.model is None:
            self.load_model()

        results = []
        for audio_file in audio_files:
            try:
                result = self.transcribe(audio_file)
                results.append(result)
            except Exception as e:
                print(f"Error transcribing {audio_file}: {e}")
                results.append({
                    "audio_file": os.path.basename(audio_file),
                    "error": str(e)
                })

        return results


def initialize_transcriber():
    """
    Initialize and preload the WhisperX transcriber model.
    This should be called once at Flask startup.
    """
    global _global_transcriber, _transcriber_config

    if _global_transcriber is None:
        print("=" * 60)
        print("Preloading WhisperX")
        print("=" * 60)

        _transcriber_config = TranscriptionConfig()
        _global_transcriber = WhisperXTranscriber(_transcriber_config)
        _global_transcriber.load_model()

        print("=" * 60)
        print("WhisperX model preloaded successfully!")
        print("=" * 60)

    return _global_transcriber


def get_transcriber():
    """
    Get the global transcriber instance.
    If not initialized, create it lazily as a fallback.
    """
    global _global_transcriber
    if _global_transcriber is None:
        print("Warning: Transcriber not preloaded, initializing now...")
        initialize_transcriber()
    return _global_transcriber


"""
Audio Transcription Script
Takes .wav files and outputs JSON transcriptions.

Usage:
  python whisperx_transcriber.py input.wav
  python whisperx_transcriber.py folder/
  python whisperx_transcriber.py file1.wav file2.wav file3.wav
"""

import os
import sys
import json
import argparse
from pathlib import Path

def find_wav_files(paths):
    """Find all .wav files from given paths (files or directories)."""
    wav_files = []

    for path in paths:
        path_obj = Path(path)

        if path_obj.is_file() and path_obj.suffix.lower() == '.wav':
            wav_files.append(str(path_obj))
        elif path_obj.is_dir():
            # Find all .wav files in directory
            wav_files.extend([str(f) for f in path_obj.glob('*.wav')])
            wav_files.extend([str(f) for f in path_obj.glob('*.WAV')])

    return wav_files


def transcribe_to_json(audio_files, output_dir=None, config=None):
    """
    Transcribe audio files and save as JSON.

    Args:
        audio_files: List of audio file paths
        output_dir: Output directory (default: same as input file)
        config: TranscriptionConfig object
    """
    if not audio_files:
        print("No audio files found!")
        return

    print(f"Found {len(audio_files)} audio file(s) to transcribe\n")

    # Initialize transcriber
    transcriber = WhisperXTranscriber(config)

    # Process each file
    for i, audio_file in enumerate(audio_files, 1):
        print(f"\n[{i}/{len(audio_files)}] Processing: {audio_file}")

        try:
            # Transcribe
            result = transcriber.transcribe(audio_file)

            original_stem = Path(audio_file).stem
            model_size = config.model_size.replace('-', '')  # Remove hyphens from model name
            new_filename = f"WhisperX_{model_size}_{original_stem}.json"

            # Determine output path
            if output_dir:
                output_path = Path(output_dir)
                output_path.mkdir(parents=True, exist_ok=True)
                output_file = output_path / new_filename
            else:
                output_file = Path(audio_file).parent / new_filename

            # Save JSON
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)

            print(f"[SUCCESS] Saved: {output_file}")
            print(f"  Language: {result['language']}")
            print(f"  Duration: {result['transcription_time']}s")
            print(f"  Segments: {result['num_segments']}")

        except Exception as e:
            print(f"[ERROR] Failed: {e}")

    print(f"\n{'=' * 80}")
    print(f"Completed! Processed {len(audio_files)} file(s)")
    print(f"{'=' * 80}")
