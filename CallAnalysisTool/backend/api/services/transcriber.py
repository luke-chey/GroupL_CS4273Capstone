"""
Shared transcriber lifecycle helpers.
"""

from api.services.transcription_pipeline.transcription.whisperx_transcriber import (
    TranscriptionConfig,
    WhisperXTranscriber,
)


_global_transcriber = None
_transcriber_config = None


def initialize_transcriber():
    """
    Initialize and preload the WhisperX transcriber model.
    This should be called once at Flask startup.
    """
    global _global_transcriber, _transcriber_config

    if _global_transcriber is None:
        print("=" * 60)
        print("Preloading WhisperX model on CPU...")
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
