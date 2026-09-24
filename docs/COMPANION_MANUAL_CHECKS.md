# Steps 9 and 10: CoachCard and time estimates

## Setup

Start the backend and frontend as in README.md. Existing PostgreSQL/SQLite records are preserved; new lesson-details and sync-receipt tables are created on startup. The demo operator receives cached Hindi template lessons for its fixture evidence.

For AI-generated lessons, add these **backend-only** environment variables in Render or ignored `backend/.env`, then restart:

```text
GEMINI_API_KEY=your-own-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

The API sends numeric evidence and fixed lesson guidance to Google, never operator IDs, report notes, photos or coordinates. Without a key, fixed evidence-based templates work. Invalid output, provider failure or timeout falls back to templates with a visible status. Successful AI drafts are cached separately from immutable completed template quizzes. Generate again to retry a failed provider call. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Verify time estimates

1. Open **Time estimate**. Choose a task, weather and baseline of 5–240 minutes; submit.
2. Check predicted minutes, planning range, recorded skill/machine age, model-wide feature importance, held-out MAE and interval coverage.
3. Change weather or task type and predict again. Inputs invalidate the old result.
4. Select **Add to My Day with this estimate**. Verify the new task uses the predicted duration. Retrying an interrupted save reuses the request ID.
5. Out-of-range input is rejected. Quiz completion does not change recorded skill or reduce actual task estimates.

The Gradient Boosting model is reproducibly trained on 2,000 generated rows with assumed factors and random noise: 1,200 training, 400 calibration and 400 held-out test rows. Intervals use the calibration absolute-error quantile. This is a synthetic pipeline demonstration, not a field-accuracy claim. Run `backend/.venv/Scripts/python.exe backend/ml/time_model.py` to reproduce the evaluation.

## Verify CoachCard

1. Open **Insights**, then **Open CoachCard**, or go directly to **Training**.
2. Existing cached cards show the selected record evidence, Hindi transcript, and generation source. Repeat-seatbelt coaching uses a seven-day window; overrun coaching requires at least two >20% overruns of the same task type. Idle coaching compares same-source idle minutes per cycle when at least five comparable records exist; sparse data uses the visibly labelled 20-minute threshold fallback. **Generate lessons from my insights** checks current evidence and reuses existing cards.
3. Enable AI with the key above and generate: successful cards say `gemini draft`; failed calls show a fallback notice. Mocked provider tests verify this flow; a live key is required to verify Google's response.
4. Play the lesson and each of its three quiz questions. Devices with Hindi voices read the current text. Devices without one play bundled template-topic audio and template questions; AI-specific questions require a Hindi device voice or reading the transcript. The UI explicitly distinguishes bundled topic audio from personalised speech.
5. Submit three answers. Scoring happens on the server; the API does not expose correct answers before submission. Check best score, correct options, passed-lesson count and learning level. Refresh or restart the server: scores persist. Retakes cannot erase the best score.
6. Go offline, submit answers, then reconnect with the app open. The same request ID syncs once. Cached score updates after server acknowledgement; an offline answer is not represented as a passed quiz.

## Other completed MVP flows

- **DigSafe:** use its labelled synthetic map. Drag/tap the position or use the accessible slider across 20/10/5 metre zones. Enable Hindi warnings. GPS requests permission; stale positions and accuracy worse than 10 m are marked uncertain. No real utility detection, excavation clearance, E-Fence control or bucket-depth measurement is claimed.
- **Offline tasks:** load My Day once online. Disconnect, start the shift, acknowledge a trenching task, start and finish it. Reconnect with the app open. Original device times persist. A conflict pauses ordered uploads and appears visibly with retry/discard controls; records are not silently overwritten. New task creation and sample replay remain online-only demo controls.
- **Offline page loading:** deploy/build the frontend, visit online once and allow service-worker installation. Reopen an app route offline. The shell and bundled audio are cached; Vite development mode does not install this service worker. Browser storage can be evicted, so offline persistence is not a backup.
- **Supervisor:** task state, source-separated observations, incidents and completions refresh every 15 seconds with a freshness timestamp. The view is a demo and has no authentication.
- **Handover:** refresh the current site-day summary and play Hindi on a device with a Hindi voice. Fuel remaining and machine faults stay unknown when not measured.

## API additions

`POST /api/predict-time`, `GET /api/training/assigned`, `POST /api/training/generate`, `POST /api/training/{id}/complete`, `GET /api/utilities/near`, `GET /api/offline-pack`, `POST /api/sync`, `GET /api/dashboard`, `GET /api/handover`.

`/api/sync` receives one timestamped task event at a time. The browser keeps ordered events and only removes an event after its matching acknowledgement. Events older than seven days or over five minutes in the future are rejected. Incident and motion uploads retain their existing separate queues.

Browser/physical-phone acceptance remains manual. Automated tests cover endpoints, retry/conflict behaviour, model evaluation, provider fallbacks, persisted grades, local queue recovery, geometry and bundled asset integrity.
