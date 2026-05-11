#!/bin/sh
# Install backend API dependencies from the CallAnalysisTool/backend directory.

set -eu

if [ "$(basename "$PWD")" != "backend" ]; then
    echo "Wrong directory. Run this script from CallAnalysisTool/backend." >&2
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg was not found on PATH."
    echo "Install ffmpeg with your system package manager before running audio transcription."
fi

if command -v ollama >/dev/null 2>&1; then
    ollama pull llama3.1:8b
else
    echo "ollama was not found on PATH."
    echo "Install Ollama before running AI grading."
fi

if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "python3 or python was not found on PATH." >&2
    exit 1
fi

if [ ! -d "venv" ]; then
    "$PYTHON_CMD" -m venv venv
fi

if [ -f "venv/bin/activate" ]; then
    . "venv/bin/activate"
elif [ -f "venv/Scripts/activate" ]; then
    . "venv/Scripts/activate"
else
    echo "Could not find venv activation script." >&2
    exit 1
fi

python -m pip install -r requirements.txt

export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
export PYTHONPATH=.

echo "Backend API requirements installed."
