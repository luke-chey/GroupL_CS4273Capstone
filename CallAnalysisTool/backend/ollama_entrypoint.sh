#!/bin/sh
set -e

MODEL="llama3.1:8b"
OLLAMA_DIR="/root/.ollama"

echo "Starting Ollama container..."

# Check if Ollama data directory exists and is non-empty
if [ ! -d "$OLLAMA_DIR" ] || [ -z "$(ls -A "$OLLAMA_DIR" 2>/dev/null)" ]; then
    echo "No Ollama data found."
    echo "Pulling model: $MODEL"
    ollama pull "$MODEL"
    echo "Model pull complete."
else
    echo "Existing Ollama data detected. Skipping model pull."
fi

echo "Launching Ollama server..."
exec ollama serve