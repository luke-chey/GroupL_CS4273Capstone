# Docker Deployment Guide

This is the Docker and offline deployment guide for the EMS Call Analysis Tool.
The Docker setup lives under `CallAnalysisTool/` and is split into four services:

- `frontend`: Next.js web app built by `frontend/Dockerfile.node`
- `backend`: Flask API built by `backend/Dockerfile.flask`
- `ollama`: Ollama server with the configured model pulled during build by `backend/Dockerfile.ollama`
- `whisper`: one-shot cache seeding container built by `backend/Dockerfile.whisper`

The app can run offline after its Docker images and model-cache volumes have been exported from an online build machine and imported on the target machine.

## Requirements

- Docker Desktop or Docker Engine with Docker Compose v2
- Git Bash or another Bash-compatible shell for `export_all.sh` and `import_all.sh`
- Enough disk space for images and model caches; expect tens of GB
- `HF_TOKEN` with access to the pyannote diarization model pages before building `Dockerfile.whisper`
- Ports available by default:
  - Frontend: `3000`
  - Backend: `5001`
  - Ollama: `11434`

## Project Layout

```text
CallAnalysisTool/
├── .env  # Not tracked in git
├── docker-compose.yml
├── export_all.sh
├── import_all.sh
├── backend/
│   ├── Dockerfile.flask
│   ├── Dockerfile.ollama
│   ├── Dockerfile.whisper
│   ├── data/
│   └── output/
└── frontend/
    └── Dockerfile.node
```

Run all Docker Compose commands from `CallAnalysisTool/`, not the repository root.

## Configuration

Edit `CallAnalysisTool/.env` before building or starting containers.

Important values:

```text
HF_TOKEN=...
OLLAMA_MODEL=llama3.1:8b
OLLAMA_HOST_BACKEND=http://ollama:11434
PORT_FRONTEND=3000
PORT_BACKEND=5001
PORT_OLLAMA=11434
TRANSFORMERS_OFFLINE=0
HF_HUB_OFFLINE=0
```

Use `TRANSFORMERS_OFFLINE=0` and `HF_HUB_OFFLINE=0` while building online. For offline deployment, set both to `1` on the target machine.

If the frontend needs to call a non-local backend, set:

```text
NEXT_PUBLIC_API_URL=http://your-backend-host:5001
```

## Online Build

Build on a machine with internet access:

```sh
cd CallAnalysisTool
docker compose build
```

What happens during build:

- `Dockerfile.node` installs frontend dependencies and builds the Next.js app.
- `Dockerfile.flask` installs Python backend dependencies, ffmpeg, and NLTK data.
- `Dockerfile.ollama` starts Ollama temporarily and pulls `OLLAMA_MODEL`.
- `Dockerfile.whisper` downloads WhisperX, alignment, pyannote, and sentence-transformer assets into a preload cache.

After building, start the app once online to seed the named Docker volumes:

```sh
docker compose up
```

Suggestion: Upload at least one call to make sure things are working. There may be some models or services that only get downloaded at runtime. If this is the case, they should be cached in the docker volumes after downloading once.

The `whisper` service exits after copying baked model files into named volumes. The backend waits for that service to complete and for Ollama to become healthy.

Open the app at:

```text
http://localhost:3000
```

Stop services with:

```sh
docker compose down
```

## Export Offline Artifacts

The offline bundle needs both images and named volumes. Images alone are not enough because the Compose setup uses named volumes for model caches.

From `CallAnalysisTool/`, run:

```sh
sh export_all.sh
```

When prompted, export both images and volumes.

The script writes artifacts to:

```text
CallAnalysisTool/offline_backup/
```

Expected image archives:

- `callanalysistool-frontend-latest.tar.gz`
- `callanalysistool-ollama-latest.tar.gz`
- `callanalysistool-whisper-latest.tar.gz`
- `callanalysistool-backend-latest.tar.gz`
- `ubuntu-latest.tar.gz`

Expected volume archives:

- `callanalysistool_ollama_data.tar.gz`
- `callanalysistool_whisperx_cache.tar.gz`
- `callanalysistool_models_data.tar.gz`
- `callanalysistool_torch_cache.tar.gz`

Copy `CallAnalysisTool/` to the offline target machine with:

- `docker-compose.yml`
- `.env`
- `import_all.sh`
- `offline_backup/`
- `backend/data/`

The full source tree may be helpful, but the offline runtime mainly needs those files plus the output directory if you want existing results.

## Offline Import

On the offline target machine, open Git Bash in `CallAnalysisTool/`.

Import images first:

```sh
sh import_all.sh
```

When prompted, choose images only. This imports `ubuntu:latest`, which is needed to restore volumes.

Close and reopen Git Bash, then import volumes:

```sh
sh import_all.sh
```

When prompted, choose volumes only.

Verify in Docker Desktop or with Docker commands that these volumes exist and are non-empty:

- `callanalysistool_ollama_data`
- `callanalysistool_whisperx_cache`
- `callanalysistool_models_data`
- `callanalysistool_torch_cache`

## Offline Start

Set offline flags in `CallAnalysisTool/.env`:

```text
TRANSFORMERS_OFFLINE=1
HF_HUB_OFFLINE=1
OLLAMA_MODEL=llama3.1:8b
```

Start the app from `CallAnalysisTool/`:

```sh
docker compose up
```

For detached (hidden terminal) mode:

```sh
docker compose up -d
```

Open:

```text
http://localhost:3000
```

## Volumes and Persistent Data

Compose uses fixed volume names so exports/imports attach to the expected caches:

- `callanalysistool_ollama_data`: Ollama model data
- `callanalysistool_whisperx_cache`: Hugging Face and WhisperX cache
- `callanalysistool_models_data`: sentence-transformer model cache copied to `/app/models`
- `callanalysistool_torch_cache`: Torch cache

Host bind mounts:

- `./backend/data:/app/data:ro`: protocol and nature-code data
- `./backend/output:/app/output`: generated transcripts, grades, and audio outputs

## Useful Commands

```sh
docker compose ps
docker compose logs -f
docker compose logs backend
docker compose logs ollama
docker compose down
docker compose restart backend
```

List Ollama models:

```sh
docker compose exec ollama ollama list
```

Open a backend shell:

```sh
docker compose exec backend bash
```

## Troubleshooting

**Port already in use**

Change `PORT_FRONTEND`, `PORT_BACKEND`, or `PORT_OLLAMA` in `.env`, or stop the conflicting local service.

**Whisper build fails on pyannote**

Confirm `HF_TOKEN` is set and that the Hugging Face account accepted access terms for the required pyannote models.

**Backend waits forever**

Check whether Ollama is healthy and the `whisper` service completed:

```sh
docker compose ps
docker compose logs ollama
docker compose logs whisper
```

**Offline target tries to download models**

Confirm `.env` has:

```text
TRANSFORMERS_OFFLINE=1
HF_HUB_OFFLINE=1
```

Also confirm all four named volumes were restored before starting Compose.

**Frontend cannot reach backend**

Check the backend directly:

```sh
curl http://localhost:5001/api/dispatchers
```

If the frontend is being served from another machine, set `NEXT_PUBLIC_API_URL` before building the frontend image.
