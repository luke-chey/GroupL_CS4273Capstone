# TODO List - Call Analysis Tool

## High Priority

### 1. Internal Hosting Setup
Get the website fully hosted internally (on IT servers and accessible by dispatch users).
- **Issue**: The site is currently accessible on the EMDQA server, but the frontend file browser opens on the users local machine. This mismatch runs into permission issues (if the user selects a file hosted on the server) or it doesn't upload the file (if the user selects a zip file on their local machine).
- **Status**: Pending
- **Priority**: High

### 2. Offline NLP Model Installation
The NLP model is still not fully offline when building the docker image. It requires installation (internet connected) outside of it. This needs to be updated.
- **Status**: Pending
- **Priority**: High

### 3. Docker Image Optimization
Optimize the Docker image. It's far too large and uses 50GB+ of memory atm.
- **Status**: Pending
- **Priority**: High

## Medium Priority

### 4. Speaker Separation Model Integration
Speaker separation should be using the NLP model as well. There were performance issues after building the Docker image, so it currently uses an inferior non-ML method.
- **Status**: Pending
- **Priority**: Medium

### 5. Multiple Zip File Processing
The frontend/backend still needs multiple zip file selection and processing.
- **Status**: Pending
- **Priority**: Medium

## Future Enhancements

### 6. Model Server Separation
All of the models, especially the larger Llama and WhisperX ones, should be separated out of the Docker image and be running 24/7 on their own server. This would allow more projects to be created using the same resources, and avoid every future project using a different set of models.
- **Status**: Pending
- **Priority**: Medium

### 7. GPU Hardware Upgrade Path
The beefiest model in this project is the Ollama SLM (Small Language Model). I don't know if it's possible to run a model larger than 8B parameters with the current non-GPU hardware resources. This is a future upgrade path.
- **Status**: Pending
- **Priority**: Low

### 8. NLP Model Capability Assessment
A full SML might not be needed for this project, the smaller NLP model may be able to do both the speaker separation and grading. It currently only summarizes the grading/transcript.
- **Status**: Pending
- **Priority**: Low
