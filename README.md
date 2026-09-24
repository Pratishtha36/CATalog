# CATalog

A phone-first operator companion for older construction equipment. The MVP implements task management, multilingual safety audio, SwingSense motion capture and classifier training, explainable operational insights, and incident reporting with offline photo queues. Real-phone and field-accuracy validation remain outstanding.

Read [the MVP scope](docs/MVP_SCOPE.md) for the future feature boundaries and demo journey.

## Implemented
- Responsive React/Vite app with Tailwind and React Router.
- My Day with demo operator selection, start shift, and persisted task start/finish timestamps and actual durations.
- One active task per operator and machine; duplicate requests preserve the original timestamp.
- Demo pre-dig acknowledgement before trenching starts (no mapped utility checks yet).
- Sample-data seatbelt replay with a visual warning and Hindi audio when a device voice is available.
- PostgreSQL/SQLModel tables for operators, machines, tasks, shifts, machine logs, incidents, lessons, completions, and trained phone models, with SQLite fallback locally. CoachCard lessons and quiz completions are implemented.
- FastAPI health endpoint, frontend connection indicator, and retry.
- Tap-to-run motion, GPS, and Hindi speech checks; no sensor data uploads.
- Deployment configuration for Vercel and Render.

## Run locally on Windows
Use two PowerShell terminals from the repository root. `npm.cmd` avoids PowerShell restrictions on unsigned npm.ps1 scripts.

Backend:
```powershell
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Frontend:
```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:5173. Vite proxies `/api` to http://127.0.0.1:8000, so a local frontend environment file is optional. API docs: http://127.0.0.1:8000/docs. Click the connection indicator to retry after starting the backend.

## Validation
Backend integration tests use temporary databases and do not reset demo data:
```powershell
cd backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Frontend:
```powershell
cd frontend
npm.cmd run build
```

With the backend running, `Invoke-RestMethod http://127.0.0.1:8000/api/health` should return `status: ok` and `service: catalog-api`.

## Deploy over HTTPS
1. Push this directory to your GitHub repository.
2. Create the Render service using `render.yaml`, or set root directory `backend`, build `pip install -r requirements.txt`, and start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Create a Vercel project with root directory `frontend`, build command `npm run build`, and output directory `dist`.
4. Set Vercel `VITE_API_URL` to the HTTPS Render origin, without a trailing `/api`, and redeploy. Frontend environment values are bundled at build time; never place secrets there.
5. Set Render `FRONTEND_URL` to the exact Vercel frontend origin (comma-separated if multiple). Restart the backend after changing it. `.env.example` documents configuration; the backend reads process environment variables and ignored `backend/.env`.
6. Open the public frontend, verify the backend indicator, and refresh a nested route such as `/device-check`.

Deployments have not been created automatically. Set Render `DATABASE_URL` to your Supabase transaction-pooler URI before deploying. PostgreSQL persists application records, incident photos, and trained phone models. See [deployment instructions](docs/DEPLOYMENT.md). Existing local SQLite data is retained but is not automatically copied to Supabase.

## Real-phone acceptance checklist
Open `/device-check` on the intended Android phone over HTTPS. An HTTP LAN address such as `http://192.168...:5173` will not provide a secure sensor context.

- Confirm the backend indicator reports connected.
- Tap Check motion, grant permission if requested, move the phone, and verify changing acceleration values. Stop listening; navigate away and back.
- Tap Check location and verify coordinates and the reported accuracy. Permission denial should show a useful message.
- Tap Play Hindi greeting and confirm audible, intelligible Hindi. If no Hindi voice is installed, the app reports that instead of claiming successful playback.
- Try audio without connectivity to determine whether the selected device voice works offline. Production builds support cached offline loading after one online visit.
- Check navigation at a narrow phone width and refresh a nested route.

Phone capability checks do not establish activity-classifier accuracy or suitability as a safety system.

## Reference documentation
- Tailwind Vite integration: https://tailwindcss.com/docs/installation/using-vite
- Device motion permission and secure-context requirements: https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static

## Database and demo workflow
The API creates `backend/cabwise.db` on startup and seeds OP1001, MC1001 (CAT 320D), three tasks for the site day (Asia/Kolkata), and one historical sample log. Seeding runs idempotently: existing task progress and sample replays are never reset. Each new day gets new pending tasks; an unfinished task remains visible until finished. Timestamps are returned in UTC with explicit offsets.

These are authored **demo fixtures**, not the original CAT CSV dataset. The implementation PDF did not contain complete original sample tables. Source labels distinguish `demo_fixture` from `sample_replay`. Replayed seatbelt logs leave engine hours, fuel, cycles, and idle time unknown.

1. Open My Day and select OP1001. Operator selection is not authentication.
2. Tap Start shift. This records the shift and attempts Hindi playback after a user gesture. A reload preserves the shift; enable audio again for the new page session.
3. Open the trenching pre-dig review, acknowledge that utility clearance is unavailable, and start the demo task.
4. Return to My Day, refresh, and verify the task remains in progress. Finish it to store actual elapsed time; another task can now start.
5. Open Safety. Replay the unfastened sample to display the Hindi warning and play it if audio is enabled. Repeating the same sample does not append duplicate log rows or replay the alert. Replay fastened, then unfastened to demonstrate a new transition.

Unknown or unavailable readings are not treated as safe. The replay API is an explicit demo control, not a connection to a real seatbelt sensor. Offline task queues and sample utility proximity are implemented. Incident reporting has a separate durable queue. SwingSense has its own durable motion queue and classifier workflow described below.

`DATABASE_URL` can override the local SQLite path. Parent directories must already exist. The backend reads process environment and ignored `backend/.env`. To seed manually without changing saved work, run `.venv/Scripts/python.exe seed.py` from `backend`. SQLModel creates missing tables; it does not migrate existing schemas.

This is a demo API with no authentication or access controls; use demo data only.

## Multilingual safety audio
My Day and Safety offer Hindi, Tamil, English, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, and Punjabi. The browser remembers the selection. Each language includes a synthesized greeting and seatbelt-warning MP3 in `frontend/public/audio/safety`; no installed speech voice or live TTS service is needed during playback. Native text and an English translation remain visible for the warning.

Changing language stops playback and asks the operator to enable audio again. A reload also requires enabling audio. Playback failures keep visual alerts active. Audio files are served alongside the frontend; production builds cache these clips with the app shell; browser storage can still be evicted.

The separate device-check page still tests browser Hindi speech synthesis; that diagnostic does not determine whether bundled safety audio works.

### Generate or update clips
The committed files are ready to use. Generation is a development-only operation using gTTS 2.5.4 (Google Translate speech) and mutagen for MP3 validation. It sends only the fixed prompt text to the speech service and does not run as part of deployment or normal app use.

From the repository root:
```powershell
backend/.venv/Scripts/python.exe -m pip install --target tmp/audio-tools -r scripts/requirements-audio.txt
backend/.venv/Scripts/python.exe scripts/generate-safety-audio.py --tools-dir tmp/audio-tools
```

Use `--language pa-IN` to regenerate Punjabi only. The generator hashes prompt text into filenames, verifies MP3 duration, and records text, size, and duration in `frontend/src/lib/safetyAudioManifest.json`. Prompt edits require regeneration. Clips are synthesized demo assets; pronunciation has not been independently reviewed by native speakers.

Run `npm.cmd test` from `frontend` to verify asset coverage, text consistency, and playback/error handling without installed voices. Run `npm.cmd run build` to include the clips in the production output.

References: https://gtts.readthedocs.io/en/stable/module.html and https://github.com/pndurette/gTTS

## SwingSense: steps 5 and 6
Open `/live` after starting a shift in My Day.

### Try it on a Windows laptop
1. Choose **Laptop simulator (synthetic)**. This is deliberately separate from real phone input.
2. Confirm the simulated engine-running checkbox if you want idle estimates. Choose threshold rules or the synthetic demo Random Forest.
3. Start capture. Hold **dig**, then **swing**, then **dig**, at least 5 seconds each, to see an estimated cycle. The first estimate needs two complete windows.
4. Stop & save. Check the queue count and expand the latest observation to see CAT-shaped columns. Fuel, engine hours, seatbelt, and safety status remain null.
5. Disconnect while capturing and stop: the row stays in IndexedDB. Reconnect and press Sync now, or wait for automatic retry. Repeated requests use the same ID and do not create duplicate server rows.

The simulator uses generated samples at real elapsed time. Its visual idle warning threshold is explicitly shortened to 10 seconds; the real phone threshold is 20 minutes of continuous estimated idle. No live machine accuracy is claimed by this demonstration.

### Real phone capture
Use HTTPS on a sensor-capable phone. A Windows laptop generally cannot provide the required accelerometer readings. Tap Start capture to request motion access. Keep the phone in a consistent orientation and the page visible. Missing permissions/readings produce a useful message; hiding the page or losing sensor readings stops capture. Stationary motion does not prove that an engine is on or off, so idle time requires explicit engine-running confirmation.

The app uses acceleration **including gravity**, interpolates 2-second windows to 50 Hz, and advances windows by 1 second. The displayed Hz is the actual incoming sample rate, not a promise of 50 Hz hardware sampling. Features are mean, population standard deviation, and mean-square energy for each acceleration axis. Gyroscope magnitude aids the rule-based swing estimate when available; absent rotation readings cannot establish a swing using that rule.

Rules are rough demonstration thresholds: total acceleration standard deviation below 0.18 m/s^2 indicates stationary/idle, above 1.5 suggests digging, intermediate motion suggests travel, and gyro magnitude above 18 degrees/s suggests swing. Two successive predictions are required for a stable transition. Only a stable dig -> swing -> dig sequence adds a cycle; intervening idle/travel resets the sequence. These thresholds need calibration on actual machines.

### Record and train
- While phone capture is running, choose a ground-truth label and record a 15-second take. Repeat at least 3 separate takes for each of idle, dig, swing, and travel. Aim for 10-15 minutes of diverse takes. These are manually labelled demonstrations, not machine-ground-truth data.
- Export raw recordings as CSV to keep a backup. Each row retains `recording_id`, `source`, label, timestamp, acceleration, and rotation axes. Local takes remain after a refresh.
- Stop capture and select **Train phone classifier**. This sends only the collected phone takes to the backend, trains a 40-tree Random Forest, saves it, and displays per-class precision, recall, F1, confusion matrix, and sample counts. Simulation takes are excluded.
- Whole recordings are split by label into training/test groups **before** overlapping windows are created. The held-out share is approximately 20%, with at least one test recording per class. With only 3 takes/class it is 33%.
- Choose Random Forest and start another capture. The forest is a portable JSON model evaluated locally, including offline after it is cached. Missing/mismatched/low-vote-share models fall back to rules. Vote share is not a calibrated probability or an accuracy claim.

No genuine phone recordings have been collected by the coding agent. The committed demo model is trained only on generated signals and can only be selected for the simulator. A phone model is absent until real phone recordings are supplied. Grouped validation on phone takes still does not establish field accuracy on an excavator.

### Model commands and persistence
From `backend`, regenerate the synthetic demonstration model:
```powershell
.venv/Scripts/python.exe ml/motion_model.py --demo --output ml/artifacts/demo-model.json
```
Train from exported phone CSV:
```powershell
.venv/Scripts/python.exe ml/motion_model.py --input path/to/phone-recordings.csv --output ml/artifacts/phone-model.json
```
The CLI phone-model file is Git-ignored and supports local SQLite workflows. API-trained phone models are stored in PostgreSQL on deployment; no model disk is needed. The bundled synthetic model remains available from the source tree. JSON avoids loading uploaded pickle files.

Motion drafts are checkpointed after each complete window, then finalized every 60 observed seconds or on stop. Drafts are recovered on reload in the same tab; finalized queue entries are shared between tabs. The last not-yet-processed sensor window can be lost on abrupt closure. Partial labelled takes are saved on normal stop/navigation if they have at least 2 seconds; abrupt closure can lose an unfinished take. Production builds cache the app shell and bundled audio after the first online visit.

### Motion API
| Endpoint | Behaviour |
| --- | --- |
| `POST /api/motion/ingest` | Validates and idempotently saves an observation batch and CAT-shaped machine log. |
| `GET /api/motion/recent?operator_id=OP1001` | Latest 10 saved batches, with source/classifier metadata. |
| `GET /api/motion/model?source=phone` | Trained phone forest; 404 until trained. Use `source=simulation` for the labelled demo forest. |
| `POST /api/motion/train` | Trains from 12-100 phone recordings (at least 3/class; at most 100,000 samples). |

Run the backend integration/training tests and `npm.cmd test` in frontend. Tests use temporary databases; they never reset demo tasks or train the actual phone-model artifact.


## Insights and incident reporting
The next milestone adds explainable operational insights at `/insights` and photo-capable incident reporting at `/incidents`. Reports persist in IndexedDB before upload, retry with a stable ID, and sync across routes while the app remains open. Machine-log sources are kept separate; missing telemetry remains unknown.

See [manual checks and API details](docs/INSIGHTS_INCIDENTS_MANUAL_CHECKS.md). CoachCard, synthetic task-time prediction, sample utility mapping, offline task updates, handover and supervisor aggregation are implemented. See [steps 9 and 10 manual checks](docs/COMPANION_MANUAL_CHECKS.md) for setup, API details and acceptance checks.

For the complete dashboard setup, environment variables, free-versus-persistent storage options, and phone checks, see [Deployment guide](docs/DEPLOYMENT.md).

## CoachCard and task-time estimation

Open Training for cached Hindi lessons, spoken quizzes and persisted learning progress. Set backend-only `GEMINI_API_KEY` to enable Gemini drafts; template lessons work without it. Open Time estimate for synthetic Gradient Boosting predictions, a planning interval, held-out evaluation and Add to My Day. The production app also provides a cached offline shell, ordered task/quiz queues, DigSafe sample proximity mapping, Supervisor and Shift handover. See [manual checks](docs/COMPANION_MANUAL_CHECKS.md).
