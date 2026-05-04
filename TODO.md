# TODO

## Priority Guide

| Priority | Meaning |
| --- | --- |
| High | Important for stability, maintainability, or near-term usability |
| Medium | Valuable next-step work, but not blocking day-to-day use |
| Low | Useful improvement or exploratory work |

## Tasks

| Priority | Size Estimate | Task | Notes |
| --- | ---: | --- | --- |
| High | Large | Clean up backend and frontend code | Reduce duplicate route logic, consolidate shared helpers, simplify large frontend components, and make the code easier to test and maintain. |
| High | Small | Add back a backend health route | Restore a simple endpoint such as `GET /api/health` for Docker checks, deployment smoke tests, and frontend/backend connectivity debugging. |
| High | Extra Large | Add users, roles, and admin views | Basic users should only view records. Admin users should be able to edit transcripts, override grades, regrade records, manage `nature_codes_master.json`, and edit AI prompt text through the UI. |
| Medium | Large | Re-add the full testing suite | Restore automated tests for routes, services, upload/regrade workflows, and frontend-critical API behavior. This will require adding main methods or test-friendly entrypoints for routes and some service modules. |
| Medium | Medium | Improve long-running frontend workflows | Uploading, transcription, grading, and regrading should continue while users navigate the app. Add better job/progress tracking instead of locking the user into one page. |
| Medium | Medium | Revisit record naming and unique identifiers | Replace or supplement dispatcher names in paths with stable identifiers such as employee ID, call ID, or generated record IDs. Keep display names separate from storage identifiers. |
| Medium | Large | Move app output storage outside the app folder | Store audio, transcripts, CDRs, and grades on a separate server or storage service instead of `backend/output/`. Add an abstraction layer so routes do not depend directly on local filesystem paths. |
| Low | Medium | Experiment with larger AI models | Test larger Ollama-compatible models for nature-code detection and per-question grading accuracy. Compare accuracy, latency, memory use, and deployment requirements against `llama3.1:8b`. |
