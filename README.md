# EMS Call Analysis Tool

## Project Overview

The EMS Call Analysis Tool helps review emergency medical dispatch calls for protocol compliance. It supports a complete local workflow:

1. Upload a zipped call package or an existing transcript JSON.
2. Transcribe audio with WhisperX when a WAV file is provided.
3. Separate dispatcher and caller speech with diarization plus transcript heuristics.
4. Detect the call's EMS nature code with a local Ollama model.
5. Grade each required protocol question with local AI grading.
6. Save the audio, CDR, transcript, and grades in a dispatcher-organized output folder.
7. Review records in the frontend dashboard, edit transcripts or grades, change nature codes, regrade records, and print call reports.

The system is designed for local processing. Audio, transcripts, and grades are stored in `CallAnalysisTool/backend/output/`.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
  - [Technologies Used](#technologies-used)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Docker Setup](#docker-setup)
- [Key Features](#key-features)
- [Usage](#usage)
- [How it Works](#how-it-works)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Notes](#notes)
- [Team Members](#team-members-spring-2026)

---

## Project Structure

```text
GroupL_CS4273Capstone/
├── README.md           # This file
├── DOCKER_README.md    # Information pertaining to docker setup and offline deployment
└── CallAnalysisTool/
    ├── .env                # Environmental variables, not tracked in git
    ├── docker-compose.yml  # Coordinates all of the dockerfiles, defines volumes
    ├── export_all.sh       # Script to export docker container and volumes, see DOCKER_README.md
    ├── import_all.sh       # Script to import docker container and volumes, see DOCKER_README.md
    ├── backend/
    │   ├── install_api_requirements.sh  # Script that verifies and installs API requirements 
    │   ├── start_api.sh                 # Script to start the API
    │   ├── requirements.txt             # Python requirements
    │   ├── Dockerfile.flask             # Flask (api) docker configuration
    │   ├── Dockerfile.ollama            # Ollama server docker configuration
    │   ├── Dockerfile.whisper           # Whisper docker configuration
    │   ├── api/
    │   │   ├── app.py
    │   │   ├── routes/
    │   │   │   ├── dispatchers.py  # Routes to get dispather and record information
    │   │   │   ├── files.py        # Routes to GET and PUT files
    │   │   │   ├── regrade.py      # Route for regrading records
    │   │   │   └── upload.py       # Route to grade new records
    │   │   └── services/
    │   │       ├── ai_grader.py               # Logic for AI grading
    │   │       ├── nature_codes.py            # Helpers for using nature_codes_master.json
    │   │       ├── ollama_handler.py          # Helpers for using ollama (prompt, chat)
    │   │       ├── prompts.py                 # Helpers and constants for AI prompts
    │   │       ├── speaker_separation.py      # Logic for speaker separation (diarization)
    │   │       ├── text_handler.py            # Helpers for text files/JSON parsing and manipulation
    │   │       └── whisperx_transcriber.py    # Helpers for using Whisper
    │   ├── data/
    │   │   ├── EMSQA.csv                   # Raw question and nature code data
    │   │   └── nature_codes_master.json    # JSON-structured question and nature code data
    │   ├── output/
    │   │   ├── _tmp/            # Temp directory where intermediate processing happens
    │   │   └── {dispatcher}/    # Folder for a given dispatcher, contains all their records
    │   │       └── {date}_{time}_{nature_code}/   # Folder for a give record
    │   └── tests/               # Testing stuff (outdated or broken)
    │       ├── test_manual.sh
    │       └── test_transcript.json
    └── frontend/
        ├── package.json      # Node packages
        ├── Dockerfile.node   # Frontend docker configuration
        ├── src/
        │   ├── app/
        │   │   ├── evaluate/
        │   │   ├── help/
        │   │   └── records/
        │   ├── components/
        │   ├── lib/
        │   └── types/
        └── public/
```

Important runtime folders and files:

- `backend/data/nature_codes_master.json`: nature-code metadata and protocol questions used by grading.
- `backend/data/EMSQA.csv`: protocol source data retained with the backend data set.
- `backend/output/`: saved call records, grouped by dispatcher and call folder.
- `frontend/src/lib/api.ts`: frontend API client and endpoint mapping.
- `CallAnalysisTool/.env`: Docker and runtime environment variables.

---

## Setup Instructions

### Technologies Used

- Python and Flask for the backend API.
- Next.js 15, React 19, TypeScript, and Tailwind CSS for the frontend.
- WhisperX for speech-to-text transcription and timestamp alignment.
- pyannote/WhisperX diarization for speaker separation.
- Ollama with `llama3.1:8b` for local nature-code detection and per-question grading.
- Docker Compose for containerized and offline deployment.

### Backend Setup

Run backend commands from `CallAnalysisTool/backend`.

Prerequisites:

- Python available as `python3` or `python`.
- ffmpeg available on `PATH`.
- Ollama installed and available on `PATH`.
- The `llama3.1:8b` model pulled in Ollama.
- `HF_TOKEN` set when running local speaker diarization with pyannote model downloads.

Basic setup:

```sh
cd CallAnalysisTool/backend
sh install_api_requirements.sh
```

The install script:

- Checks for ffmpeg.
- Pulls `llama3.1:8b` if Ollama is available.
- Creates `venv/` if needed.
- Installs `requirements.txt`.
- Exports backend environment values inside the script. `start_api.sh` exports them again before launching Flask.

Manual equivalent:

```sh
cd CallAnalysisTool/backend
python3 -m venv venv
. venv/bin/activate
python -m pip install -r requirements.txt
export PYTHONPATH=.
export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
ollama pull llama3.1:8b
```

On Windows shells that expose the Windows venv layout, use:

```sh
. venv/Scripts/activate
```

Start the backend:

```sh
cd CallAnalysisTool/backend
sh start_api.sh
```

Manual equivalent:

```sh
cd CallAnalysisTool/backend
. venv/bin/activate
export PYTHONPATH=.
export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
python api/app.py
```

The backend listens on `http://localhost:5001` by default.

### Frontend Setup

Run frontend commands from `CallAnalysisTool/frontend`.

The project is configured for pnpm, but npm can also install from the included lockfile.

```sh
cd CallAnalysisTool/frontend
pnpm install
pnpm dev
```

Alternative with npm:

```sh
cd CallAnalysisTool/frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Production-style local run:

```sh
pnpm build
pnpm start
```

The frontend builds its API base URL from:

- `NEXT_PUBLIC_API_URL`, when set.
- Otherwise the browser host plus `NEXT_PUBLIC_API_PORT`, defaulting to `5001`.

### Docker Setup

The Docker setup lives in `CallAnalysisTool/docker-compose.yml` and uses four services: `frontend`, `backend`, `ollama`, and `whisper`.

For Docker and offline deployment instructions, see [DOCKER_README.md](DOCKER_README.md).

Quick online build:

```sh
cd CallAnalysisTool
docker compose build
docker compose up
```

---

## Key Features

- Dispatcher dashboard with station grade, dispatcher grades, date filtering, searching, and sorting.
- Record review pages with call navigation, audio playback, synchronized transcript display, and grade details.
- Upload workflow for `.zip` call packages and `.json` transcripts.
- Full audio pipeline for ZIP uploads: CDR parsing, WhisperX transcription, speaker separation, nature-code detection, AI grading, and record storage.
- JSON transcript grading without audio transcription when a pre-transcribed call is available.
- Grade editing, transcript editing, nature-code switching, question add/delete, and recalculated scores.
- Regrade action that reruns AI grading against the current transcript and selected nature code.
- Printable call reports.
- Local model execution through WhisperX, pyannote, and Ollama.

---

## Usage

### Upload and Grade a New Call

1. Start the backend and frontend.
2. Open `http://localhost:3000/evaluate`.
3. Upload one or more `.zip` or `.json` files.
4. Wait for processing to finish.
5. The frontend redirects to the first processed record.

ZIP upload requirements:

- The ZIP should contain one `.wav` file.
- The ZIP should contain one `.txt` CDR file.
- The WAV and CDR should be at the top level of the ZIP, not nested inside another folder.

JSON transcript requirements:

- The JSON body should contain a `segments` array.
- `date`, `time`, and `agent_name` are used when present.
- If `agent_name` is missing, the backend falls back to the first value in `speakers`.

### Review Existing Records

1. Open `http://localhost:3000/records`.
2. Search or filter dispatchers by date range.
3. Select a dispatcher.
4. Review individual calls, audio, transcript segments, grade reasoning, and nature-code details.

### Edit and Regrade

On a record page:

- Use `Edit Transcript` to change segment speaker labels or text.
- Use `Edit Grades` to change grade codes, question labels, detected nature code, or question set.
- Save grade edits to recalculate grade percentage and summary counts.
- Use `Regrade` to rerun AI grading using the current transcript and nature code.

If a nature-code change affects the stored folder/file naming, the backend renames the record folder and related files.

---

## How it Works

### Upload Pipeline

The main upload flow is implemented in `backend/api/routes/upload.py`.

```text
ZIP upload
  -> create temp folder
  -> extract ZIP
  -> find .txt CDR and .wav audio
  -> parse date, time, and dispatcher from CDR
  -> transcribe WAV with WhisperX
  -> run speaker separation
  -> detect nature code
  -> grade transcript
  -> move CDR, audio, transcript, and grades into backend/output

JSON upload
  -> create temp folder
  -> save request body as transcript.json
  -> detect nature code
  -> grade transcript
  -> move transcript and grades into backend/output
```

Final records are stored as:

```text
backend/output/{dispatcher}/{YYYYMMDD}_{HHMMSS}_{nature_code}/
  {dispatcher}_{YYYYMMDD}_{HHMMSS}_{nature_code}_cdr.txt
  {dispatcher}_{YYYYMMDD}_{HHMMSS}_{nature_code}_audio.wav
  {dispatcher}_{YYYYMMDD}_{HHMMSS}_{nature_code}_transcript.json
  {dispatcher}_{YYYYMMDD}_{HHMMSS}_{nature_code}_grades.json
```

JSON-only uploads do not create CDR or audio files.

### Transcription and Speaker Separation

- `whisperx_transcriber.py` wraps WhisperX model loading and transcription.
- `speaker_separation.py` aligns the transcript, runs diarization, assigns word speakers, then labels the likely dispatcher based on question-heavy speech.
- `text_handler.py` converts transcript JSON into prompt text and extracts CDR metadata.

### Nature-Code Detection

`nature_codes.py` loads `nature_codes_master.json`, formats available nature codes into a prompt, and asks Ollama to return a valid bracketed nature-code ID. The detector retries invalid responses and falls back to Case Entry if it cannot get a valid nature code.

### Grading System

`ai_grader.py` grades one protocol question at a time using a persistent Ollama chat.

The grading question set is loaded from `nature_codes_master.json`:

- Case Entry questions are included first.
- The detected or selected nature-code questions are appended.
- Question metadata such as parent question, allowed alternatives, condition, scenario, clarification rules, macros, and skipped-AI flags can affect the prompt or grading behavior.

Each question receives:

- `code`
- `status`
- `label`
- `reasoning`

The final percentage excludes `Not Applicable` and `Recorded Correctly`, gives full credit for `Asked Correctly` and `Obvious`, partial credit for `Not As Scripted`, and no credit for `Not Asked` or `Asked Incorrectly`.

### Grade Codes

| Code | Meaning |
| ---- | ------- |
| `1` | Asked Correctly |
| `2` | Not Asked |
| `3` | Asked Incorrectly |
| `4` | Not As Scripted |
| `5` | Not Applicable |
| `6` | Obvious |
| `RC` | Recorded Correctly |

---

## API Endpoints

All current backend routes are registered under `/api`.

### Upload

```http
POST /api/upload
```

Accepted inputs:

- `multipart/form-data` with `file` containing a `.zip`.
- JSON request body containing a transcript.

Response:

```json
{
  "outputDestination": "output/Dispatcher/20260326_093424_Falls",
  "dispatcherName": "Dispatcher",
  "grades": {
    "grader_type": "ai",
    "grade_percentage": 82.4,
    "detected_nature_code": {
      "id": "17",
      "name": "Falls"
    },
    "nature_code_reasoning": "...",
    "total_questions": 27,
    "case_entry_questions": 17,
    "nature_code_questions": 10,
    "questions_asked_correctly": 20,
    "questions_missed": 7,
    "timestamp": "2026-05-04T00:00:00Z",
    "grades": {}
  }
}
```

### Dispatchers

```http
GET /api/dispatchers
GET /api/dispatchers?start_date=20260301&end_date=20260331
```

Returns dispatcher summaries and station grade.

```http
GET /api/dispatchers/{dispatcher}
GET /api/dispatchers/{dispatcher}?start_date=20260301&end_date=20260331
```

Returns record folder names for a dispatcher.

```http
GET /api/dispatchers/{dispatcher}/{record_name}
```

Returns the files available for a record, grouped into audio, CDR, transcript, grade, and other files.

### Files

```http
GET /api/files/{filename}
```

Returns JSON, plain text, or audio content for a stored record file. File names follow:

```text
{dispatcher}_{YYYYMMDD}_{HHMMSS}_{nature_code}_{description}.{ext}
```

```http
PUT /api/files/{filename}
```

Updates supported JSON files:

- `{...}_transcript.json`
- `{...}_grades.json`

Grade updates recalculate score fields. If a nature-code edit changes the record's nature-code name, the backend can rename the record folder and files.

```http
GET /api/files/nature-codes
```

Returns nature-code IDs and names.

```http
GET /api/files/nature-codes/{nature_code_id}
```

Returns a blank grade scaffold for the selected nature code.

### Regrade

```http
POST /api/regrade/{dispatcher}/{record_identifier}
```

Re-runs AI grading for an existing record using its current transcript and stored nature code.

`record_identifier` is:

```text
{YYYYMMDD}_{HHMMSS}_{nature_code}
```

There is no dedicated `/api/health` route at the moment. For a simple backend smoke check, use `GET /api/dispatchers`.

---

## Configuration

### Local Environment

When running the backend locally from `CallAnalysisTool/backend`, set:

```sh
export PYTHONPATH=.
export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
export OLLAMA_HOST=http://localhost:11434
export HF_TOKEN=your_huggingface_token
```

`start_api.sh` loads `../.env` if it exists. That file is primarily used by Docker, so check values such as `DOCKER_CONTAINER`, `OLLAMA_HOST_BACKEND`, and offline flags if local startup behaves differently than expected.

### Docker Environment

Docker variables are defined in `CallAnalysisTool/.env`.

Common values:

```text
NODE_ENV=production
PORT_FRONTEND=3000
NEXT_PUBLIC_API_PORT=5001
NEXT_PUBLIC_API_URL=

OLLAMA_HOST_OLLAMA=0.0.0.0
OLLAMA_MODEL=llama3.1:8b
PORT_OLLAMA=11434

HF_HOME_PRELOAD=/preload_cache
TRANSFORMERS_CACHE_PRELOAD=/preload_cache
SENTENCE_TRANSFORMERS_HOME_PRELOAD=/preload_cache
HF_HOME=/root/.cache/huggingface
TRANSFORMERS_CACHE=/root/.cache/huggingface
SENTENCE_TRANSFORMERS_HOME=/root/.cache/huggingface
TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
HF_TOKEN=...

OLLAMA_HOST_BACKEND=http://ollama:11434
FLASK_ENV=production
DOCKER_CONTAINER=true
TRANSFORMERS_OFFLINE=0
HF_HUB_OFFLINE=0
NLTK_DATA=/usr/local/share/nltk_data
PORT_BACKEND=5001
```

For offline Docker deployment, set:

```text
TRANSFORMERS_OFFLINE=1
HF_HUB_OFFLINE=1
```

### CORS

The Flask app currently allows all origins for all routes. CORS is configured in `CallAnalysisTool/backend/api/app.py`.

---

## Testing

Current verification is mostly manual.

Backend syntax check:

```sh
cd CallAnalysisTool/backend
python -m compileall -q api
```

Frontend lint:

```sh
cd CallAnalysisTool/frontend
pnpm lint
```

The `backend/tests/` folder contains a sample transcript and a manual shell script, but `test_manual.sh` still references older endpoints and should be updated before relying on it for endpoint verification.

---

## Troubleshooting

### Backend Import Errors

Run the backend from `CallAnalysisTool/backend` and set `PYTHONPATH=.`

```sh
cd CallAnalysisTool/backend
export PYTHONPATH=.
python api/app.py
```

### Port Already in Use

Backend default: `5001`

Frontend default: `3000`

Ollama default: `11434`

Change `PORT_BACKEND`, `PORT_FRONTEND`, or `PORT_OLLAMA` in `CallAnalysisTool/.env` for Docker. For local Flask runs, set `PORT` before starting `api/app.py`.

### Ollama Connection Failed

Check:

```sh
ollama --version
ollama serve
ollama list
ollama pull llama3.1:8b
curl http://localhost:11434/api/tags
```

For Docker, the backend uses `OLLAMA_HOST_BACKEND=http://ollama:11434`.

### WhisperX or pyannote Download Issues

- Confirm internet access for first local model download.
- Confirm `HF_TOKEN` is set if pyannote needs to download diarization models.
- Confirm the Hugging Face account has accepted the required pyannote model terms.
- Confirm there is enough disk space for model caches.

### ffmpeg Not Found

Install ffmpeg and make sure it is available in the same shell that starts the backend.

Examples:

```sh
brew install ffmpeg
sudo apt-get install ffmpeg
```

On Windows, install ffmpeg with your preferred package manager and restart the terminal so `ffmpeg` is on `PATH`.

### Frontend Cannot Connect to Backend

Check the backend directly:

```sh
curl http://localhost:5001/api/dispatchers
```

If the frontend is hosted somewhere other than the backend host, set `NEXT_PUBLIC_API_URL` before building or starting the frontend.

### Torch Safe Loading Errors

Set:

```sh
export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=true
```

---

## Notes

### Privacy and Security

- Treat all call audio, transcripts, CDRs, and grades as sensitive data.
- The intended workflow uses local transcription and local Ollama inference.
- Stored outputs remain under `CallAnalysisTool/backend/output/` unless manually moved or exported.
- Be careful when committing or sharing generated output files.

### Current Limitations

- AI grading quality depends on transcript quality, speaker labels, nature-code selection, and local model responses.
- The frontend protocol reference is static UI data and may not perfectly mirror `nature_codes_master.json`.
- The manual backend test script still targets older endpoints.
- There is no dedicated backend health endpoint.

---

## Team Members (Spring 2026)

| Name | Role | Contact |
| ---- | ---- | ------- |
| Luke Chey | Product Owner | lvchey@ou.edu |
| Brayden Garner | SM1 | bgarner@ou.edu |
| Keyera Lastrap | SM2 | keyera.l.lastrap-1@ou.edu |
| Michael Crabb | SM3 | michael.m.crabb-1@ou.edu |
| Ethan Gulley | SM4 | ethangulley@ou.edu |
