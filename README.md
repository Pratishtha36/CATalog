# CATalog

**A phone-first operator assistant for the Caterpillar hackathon.** CATalog brings daily work, safety reminders, activity observations, personalised training and task planning into one interface for older construction equipment.

Its three named modules are **SwingSense** (phone motion estimates), **DigSafe** (sample utility proximity) and **CoachCard** (Hindi coaching from recorded evidence). The operator interface runs on a phone; the supervisor view also works on a laptop.

Repository: [Pratishtha36/CATalog](https://github.com/Pratishtha36/CATalog).

> This is a demonstration, not a certified safety or machine-control system. Utility lines and task-time training data are synthetic; seatbelt status is sample replay. Operator selection is not authentication. Real-phone and real-machine acceptance remain separate from automated tests.

## Implemented features

| Module | Route | Functionality |
| --- | --- | --- |
| My Day | `/` | Daily tasks, add activity, start shift, task start/finish, elapsed and actual durations, carried-over active work and pre-dig acknowledgement. |
| SwingSense | `/live` | Phone motion capture, activity estimates, cycle counts, idle estimates, laptop simulator, labelled recordings, CSV export, Random Forest training and offline observation queues. |
| Safety | `/safety` | Sample seatbelt replay, visual alerts and bundled greetings/warnings in ten Indian languages. |
| DigSafe | `/dig-safe` | Synthetic utility map, draggable/tappable simulated position, accessible slider, optional phone GPS and 20/10/5 m demo warning zones. |
| Insights | `/insights` | Explainable idle, fuel-per-cycle, repeated seatbelt and task-overrun flags with source selection, supporting evidence and CoachCard links. |
| Incident reports | `/incidents` | Incident, near-miss and unsafe-condition reports with optional photo/location, local persistence, retry-safe sync and saved history. |
| CoachCard | `/training` | Evidence-based Hindi lessons, optional Gemini generation, cached template fallback, spoken quizzes, server-side grading and saved learning progress. |
| Time estimate | `/estimate` | Synthetic Gradient Boosting predictions, planning ranges, model factors, held-out evaluation and adding predicted tasks to My Day. |
| Supervisor | `/dashboard` | Task progress, source-separated observations, incidents and training completions; refreshes every 15 seconds. |
| Shift handover | `/handover` | Current site-day work/incident summary, Hindi speech on supported devices and explicit unknown fuel/fault values. |
| Device check | `/device-check` | Tap-to-run motion, location and device Hindi-voice diagnostics. |

The responsive interface uses CAT-inspired yellow/black accents, soft-depth components, mobile navigation, visible keyboard focus and hidden visual scrollbars while retaining scrolling.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React 19, Vite, React Router, Lucide icons, custom CSS tokens and Tailwind integration |
| Backend | Python 3.13.7, FastAPI, Uvicorn, SQLModel / SQLAlchemy |
| Database | Supabase PostgreSQL transaction pooler; SQLite fallback for local development/tests |
| Offline | Dexie / IndexedDB and a production service worker for the app shell and bundled audio |
| Machine learning | scikit-learn, NumPy, SciPy; Random Forest classification and Gradient Boosting regression |
| Coaching AI | Optional server-side Gemini API; default model `gemini-3.1-flash-lite` |
| Sensors/audio | DeviceMotion, Geolocation, SpeechSynthesis and bundled MP3s |
| Utility map | Local SVG plan with point-to-line distance calculations; no external map tiles |
| Deployment | Vercel frontend and Render backend |

## Run locally on Windows

Use two PowerShell terminals, starting from the repository root. `npm.cmd` avoids PowerShell restrictions on `npm.ps1`.

### 1. Configure the backend

Create an ignored `backend/.env` using [backend/.env.example](backend/.env.example) as a reference:

```dotenv
FRONTEND_URL=http://localhost:5173,http://127.0.0.1:5173
DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:6543/postgres?sslmode=require

# Optional: omit this line until you have an actual private key
# GEMINI_API_KEY=your-private-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Replace the database placeholder with the full URI from **Supabase → Connect → Transaction pooler**. URL-encode special characters in the password. Keep credentials out of Git and screenshots.

For local SQLite, omit `DATABASE_URL`. The existing `backend/cabwise.db` filename is retained for compatibility with saved local data. SQLite records are **not automatically copied** to Supabase.

### 2. Start the backend

Use Python 3.13.7. Create the virtual environment once; reuse it on later runs.

```powershell
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 3. Start the frontend

In the second terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173**. Keep both terminals running; press `Ctrl+C` to stop either server.

- API documentation: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health
- Compatibility health route: http://127.0.0.1:8000/api/health

Vite proxies `/api` to the laptop backend at `127.0.0.1:8000`. A frontend environment file is unnecessary for normal local development. Health checks query the database and return `status`, `service`, `version` and the database engine name.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Backend | Full PostgreSQL URI; required on Render. |
| `FRONTEND_URL` | Backend | Allowed frontend origin, or comma-separated origins, without page paths. |
| `GEMINI_API_KEY` | Backend only | Optional credential for generating AI lesson drafts. |
| `GEMINI_MODEL` | Backend | Defaults to `gemini-3.1-flash-lite`. |
| `PYTHON_VERSION` | Render | Set to `3.13.7`, matching `backend/.python-version`. |
| `VITE_API_URL` | Vercel frontend | Public HTTPS backend origin, without `/api` or another path. |

Lowercase `frontend_url` and `database_url` aliases work. Use uppercase names consistently to avoid ambiguity. Legacy `CORS_ORIGINS` is a fallback when no frontend URL is set. Backend process environment takes precedence over the corresponding local `.env` settings.

**Never put credentials in a `VITE_` variable:** frontend environment values are included in the browser bundle.

## Deploy on Render and Vercel

### Render backend

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/health` |
| Python version | `PYTHON_VERSION=3.13.7` |
| Required app variables | `DATABASE_URL`, `FRONTEND_URL` |

[render.yaml](render.yaml) supplies the basic Blueprint configuration. For an existing manually configured service, check its dashboard settings explicitly. Add `GEMINI_API_KEY` there to enable AI generation.

PostgreSQL connections require TLS, disable prepared statements and use transaction-scoped write locks for pooler compatibility. Application records, incident photos and API-trained phone models persist in the database; they do not require a Render disk. Startup creates missing tables and demo fixtures without resetting existing progress. It does not perform arbitrary existing-schema migrations.

### Vercel frontend

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment | `VITE_API_URL=https://YOUR-BACKEND.onrender.com` |

Set Render's `FRONTEND_URL` to the actual Vercel HTTPS origin. Redeploy the frontend after changing `VITE_API_URL`; restart/redeploy the backend after changing its environment. The local Vite proxy does not run on Vercel.

Check the deployed `/health` for `status: ok`, `service: catalog-api` and `database: postgresql`. Verify the frontend connection indicator and refresh a nested route such as `/training`.

If SciPy fails during installation, confirm Render is actually using Python 3.13.7, then clear its build cache and redeploy. See [the deployment guide](docs/DEPLOYMENT.md) for additional troubleshooting and database configuration.

## Feature details

### My Day and saved data

The demo seeds **OP1001**, **MC1001 / CAT 320D**, three tasks for the Asia/Kolkata site day and a historical machine-log fixture. Each new day receives pending tasks; unfinished active work carries over. One task can be active per operator and machine. Trenching and excavation require a demo pre-dig acknowledgement.

Task actions preserve timestamps and actual elapsed duration. **Add activity** lets you continue after all scheduled tasks are complete. The fixtures are authored demo data, not the complete original CAT datasets. Unknown telemetry remains unknown.

### Multilingual safety audio

Bundled greetings and seatbelt warnings support **Hindi, Tamil, English, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati and Punjabi**. These clips require neither an installed system voice nor a runtime TTS service. Enable audio after a tap; changing language or reloading requires enabling it again. Visual alerts remain if playback fails.

Seatbelt replay is labelled sample data. An unfastened transition produces an alert; repeating the same state does not append duplicate replay records. The device-check page separately tests system Hindi speech, which does not determine whether bundled safety audio works.

### SwingSense

Phone acceleration including gravity is resampled into two-second windows with a one-second advance. Nine features describe axis mean, standard deviation and energy. Threshold rules provide a fallback; a trained 40-tree Random Forest runs locally as a portable JSON model. A stable `dig → swing → dig` sequence counts an estimated load cycle.

- Phone capture requires HTTPS, permission and the page in the foreground.
- Idle estimation requires confirmation that the engine is running; a stationary phone cannot establish engine state.
- The labelled laptop simulator and its synthetic model stay separate from real phone input.
- Record at least three separate 15-second takes for each of idle, dig, swing and travel; export CSV or train from the UI.
- Evaluation splits whole recordings before creating overlapping windows and reports per-class metrics.
- Observations finalize every 60 observed seconds or on stop and queue locally for retry-safe upload.

The phone does not measure fuel, engine hours or seatbelt state. Real excavator accuracy remains unvalidated. See [SwingSense manual checks](docs/SWINGSENSE_MANUAL_CHECKS.md).

### Insights and incident reporting

Insights show evidence behind idle-time, fuel-per-cycle, repeated seatbelt and >20% task-overrun flags. Machine-log sources stay separate: `demo_fixture`, `sample_replay`, `phone_estimate` and `simulation`. Missing coverage is visible; no flags does not establish safety.

Incident reports support notes, optional coordinates and JPEG/PNG photos up to 2 MB at the API. Reports save to IndexedDB before upload, retain stable IDs during retries and sync across app routes. Saved history and photos are available from the backend. See [incident and insight checks](docs/INSIGHTS_INCIDENTS_MANUAL_CHECKS.md).

### CoachCard: personalised training

CoachCard produces a cached Hindi lesson and three-question quiz from selected evidence. Triggers include repeat seatbelt episodes within seven days, repeated >20% overruns for a task type, idle/fuel observations and reported near-misses in the sample utility area. Idle ranking uses comparable same-source records where available and a labelled threshold fallback when data is sparse.

With `GEMINI_API_KEY`, the backend requests a structured Gemini lesson draft. It sends selected numeric evidence and fixed guidance, **not operator IDs, incident free text, photos or coordinates**. Returned JSON is validated. Provider failure or invalid output falls back to templates and remains retryable. Successful drafts are cached separately from completed template quizzes.

Five Hindi topic lessons, fifteen spoken template questions and one utility warning are bundled as **21 audio clips**. A Hindi device voice can read current personalised text. Without one, bundled topic audio plays with an explicit fallback label. AI-specific questions and dynamic handover speech require a device voice or reading the visible transcript.

Quiz answers are graded on the server. Best scores, passed lessons and learning progress persist across refreshes and backend restarts. Offline answers wait for server acknowledgement. **Passing a quiz does not certify operating skill or automatically reduce task estimates.**

### Task-time estimation

The Gradient Boosting demonstration uses task type, weather, recorded operator skill, machine age and a baseline estimate. It trains reproducibly on **2,000 synthetic rows**: 1,200 training, 400 calibration and 400 held-out test rows.

The UI shows predicted minutes, a planning range, model-wide feature importance, held-out MAE and interval coverage. The interval targets 90% calibration coverage, not guaranteed field coverage. Baseline input is 5–240 minutes and supported machine age is 0–25 years. **Add to My Day** creates a task using the prediction with a stable retry ID.

The data are generated from assumed factors and noise. Feature importance is not a causal explanation for an individual task. Reproduce evaluation from the repository root:

```powershell
backend/.venv/Scripts/python.exe backend/ml/time_model.py
```

### DigSafe, supervisor and handover

DigSafe uses a local synthetic utility plan. Drag/tap the simulated position or use its slider; phone GPS is optional. Demo warnings change at 20, 10 and 5 metres. Stale GPS or accuracy worse than 10 metres is marked uncertain. The map does not detect buried utilities, track a bucket, set E-Fence depth or provide excavation clearance.

Supervisor data refreshes every 15 seconds with a freshness timestamp. Handover summarizes the current site day's recorded work and incidents; fuel remaining and machine faults stay unknown when unmeasured.

## Offline behaviour

After the first online visit, the production service worker caches the app shell and bundled audio. IndexedDB caches operator tasks, safety snapshots, lessons and sample utility lines.

| Operation | Offline behaviour |
| --- | --- |
| Start shift; start/finish cached tasks | Saved locally, then uploaded in order with original device timestamps. |
| Answer a cached quiz | Queued locally; score appears after server acknowledgement. |
| Record incident/photo | Saved locally; a separate queue retries after reconnection. |
| Capture motion | Observations queue locally; cached models/rules remain available. |
| Read cached lessons or utility map | Available from the last successful cache. |
| Create a new activity, replay seatbelt samples, generate lessons or request an estimate | Requires the backend connection. |

Keep the app open to sync. Failed task events pause later events; conflicts have visible retry/discard controls instead of silently overwriting server state. Task events older than seven days or over five minutes in the future are rejected. Cached safety information is historical, not live.

Offline page loading works in **production builds**, not the Vite development server. Browser storage can be evicted and is not a backup. Abrupt closure can lose an unsaved motion window or unfinished recording.

## Test on an Android phone

1. Deploy both services over HTTPS and open the Vercel URL in Chrome on Android. Phone `localhost` refers to the phone; a plain HTTP LAN URL is insufficient for secure sensor access.
2. Confirm **Backend connected**. In **Device check**, request motion/location access and verify readings.
3. Start a shift in My Day, enable a safety language, add/start/finish a task and refresh to verify persistence.
4. Try SwingSense phone capture with the page visible. Use the laptop simulator only for its labelled synthetic demonstration.
5. In DigSafe, move the simulated point through warning zones, then try GPS and inspect its accuracy label.
6. In Training, play a lesson, answer its quiz and check the saved score. In Time estimate, predict a task and add it to My Day.
7. Allow production caching to finish, disconnect, record an incident and task/quiz changes, then reconnect with the app open. Verify syncing and the supervisor view on a second device.
8. Check portrait/landscape layouts, nested-route refreshes and audio intelligibility on the actual demo device.

See [the complete companion acceptance guide](docs/COMPANION_MANUAL_CHECKS.md) for detailed checks.

## Tests and validation

Backend tests use disposable databases, not the configured demo database:

```powershell
cd backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Frontend tests and production build:

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

The latest implementation verification passed **45 backend tests, 23 frontend tests and the production build**. The generated offline bundle was checked for all 45 referenced assets, including the 21 CoachCard clips. Tests cover retries, persistence, conflicts, provider mocks/fallbacks, geometry, model evaluation and audio integrity.

Live Gemini responses, browser service-worker behaviour, audio intelligibility and physical-phone/field performance still require environment/device checks. Automated tests do not establish real-machine accuracy.

## API overview

| Endpoint | Purpose |
| --- | --- |
| `GET /health`, `GET /api/health` | Backend/database connectivity. |
| `GET /api/operators`, `GET /api/operators/{id}`, `GET /api/machines/{id}` | Demo profiles. |
| `GET /api/machine-logs` | Recent machine-log records. |
| `GET /api/tasks/today`, `POST /api/tasks` | Daily work and activity creation. |
| `POST /api/tasks/{id}/start`, `POST /api/tasks/{id}/finish` | Online task actions. |
| `GET /api/shifts/current`, `POST /api/shifts/start` | Shift state. |
| `GET /api/safety/status`, `POST /api/safety/replay` | Sample seatbelt state and replay. |
| `POST /api/motion/ingest`, `GET /api/motion/recent` | Observation upload/history. |
| `POST /api/motion/train`, `GET /api/motion/model` | Classifier training/retrieval. |
| `GET /api/insights` | Source-separated flags and evidence. |
| `POST /api/incidents`, `GET /api/incidents`, `GET /api/incidents/{id}/photo` | Reports, history and photos. |
| `POST /api/predict-time` | Synthetic prediction and evaluation. |
| `GET /api/training/assigned`, `POST /api/training/generate` | Cached lessons and generation. |
| `POST /api/training/{id}/complete` | Retry-safe server quiz grading. |
| `GET /api/utilities/near` | Sample utility GeoJSON. |
| `GET /api/offline-pack`, `POST /api/sync` | Cache snapshot and one ordered task event per sync request. |
| `GET /api/dashboard`, `GET /api/handover` | Supervisor and handover summaries. |

Use `/docs` for required query parameters and request schemas. Incident and motion queues retain their dedicated upload endpoints.

## Development utilities

Committed audio is ready to use. Regenerate fixed prompts from the repository root:

```powershell
backend/.venv/Scripts/python.exe -m pip install --target tmp/audio-tools -r scripts/requirements-audio.txt
backend/.venv/Scripts/python.exe scripts/generate-safety-audio.py --tools-dir tmp/audio-tools
backend/.venv/Scripts/python.exe scripts/generate-coach-audio.py --force
```

Generation uses gTTS and mutagen, sends fixed text to the speech service and checks MP3 duration. It is a development operation, not a deployment step. Safety clips use text-hashed filenames; CoachCard has an asset manifest. Regenerate audio after editing its source prompts.

From `backend`, regenerate the synthetic motion model or train locally from exported recordings:

```powershell
.venv/Scripts/python.exe ml/motion_model.py --demo --output ml/artifacts/demo-model.json
.venv/Scripts/python.exe ml/motion_model.py --input path/to/phone-recordings.csv --output ml/artifacts/phone-model.json
```

The CLI phone-model file is Git-ignored and used by the local SQLite workflow. Use in-app API training on PostgreSQL deployments, where trained phone models persist in the database.

## Remaining boundaries

- No production authentication/authorization, ECU integration or verified utility dataset.
- No automatic import of historical SQLite records into Supabase.
- Genuine phone recordings and machine-mounted field validation must be collected separately.
- Time predictions are synthetic planning demonstrations, not validated operating targets.
- Coaching is learning support, not certification or a substitute for manufacturer instructions and authorised site procedures.
- Native-speaker audio review and complete phone acceptance remain manual.

## Further documentation

- [Deployment guide](docs/DEPLOYMENT.md)
- [CoachCard, estimates and companion checks](docs/COMPANION_MANUAL_CHECKS.md)
- [SwingSense manual checks](docs/SWINGSENSE_MANUAL_CHECKS.md)
- [Insights and incident checks](docs/INSIGHTS_INCIDENTS_MANUAL_CHECKS.md)
- [MVP scope](docs/MVP_SCOPE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
