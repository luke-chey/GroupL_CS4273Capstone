#!/bin/sh
# Start the backend API from the CallAnalysisTool/backend directory.

set -eu

if [ "$(basename "$PWD")" != "backend" ]; then
    echo "Wrong directory. Run this script from CallAnalysisTool/backend." >&2
    exit 1
fi

ENV_FILE="../.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
else
    echo "Warning: .env file not found at $ENV_FILE" >&2
fi

if command -v ollama >/dev/null 2>&1; then
    if ! ollama list >/dev/null 2>&1; then
        ollama serve >/tmp/call-analysis-ollama.log 2>&1 &
        echo "Started Ollama in the background."
    fi
else
    echo "Warning: ollama was not found on PATH. AI grading may fail." >&2
fi

if [ -f "venv/bin/activate" ]; then
    . "venv/bin/activate"
elif [ -f "venv/Scripts/activate" ]; then
    . "venv/Scripts/activate"
else
    echo "Could not find venv activation script. Run install_api_requirements first." >&2
    exit 1
fi

export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
export PYTHONPATH=.

python api/app.py
