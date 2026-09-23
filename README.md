# CabWise

A phone-first operator companion for older construction equipment. This repository currently implements **steps 1?4**: application foundation, a seeded SQLite database, and persistent daily task/basic safety workflows.

Read [the MVP scope](docs/MVP_SCOPE.md) for the future feature boundaries and demo journey.

## Implemented
- Responsive React/Vite app with Tailwind and React Router.
- My Day with demo operator selection, start shift, and persisted task start/finish timestamps and actual durations.
- One active task per operator and machine; duplicate requests preserve the original timestamp.
- Demo pre-dig acknowledgement before trenching starts (no mapped utility checks yet).
- Sample-data seatbelt replay with a visual warning and Hindi audio when a device voice is available.
- SQLite/SQLModel tables for operators, machines, tasks, shifts, machine logs, incidents, lessons, and completions. Incident and training workflows remain unimplemented.
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

With the backend running, `Invoke-RestMethod http://127.0.0.1:8000/api/health` should return `status: ok` and `service: cabwise-api`.

## Deploy over HTTPS
1. Push this directory to your GitHub repository.
2. Create the Render service using `render.yaml`, or set root directory `backend`, build `pip install -r requirements.txt`, and start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Create a Vercel project with root directory `frontend`, build command `npm run build`, and output directory `dist`.
4. Set Vercel `VITE_API_URL` to the HTTPS Render origin, without a trailing `/api`, and redeploy. Frontend environment values are bundled at build time; never place secrets there.
5. Set Render `CORS_ORIGINS` to the exact Vercel frontend origin (comma-separated if multiple). Restart the backend after changing it. `.env.example` documents configuration; the backend reads process environment variables, not `.env` files automatically.
6. Open the public frontend, verify the backend indicator, and refresh a nested route such as `/device-check`.

Deployments have not been created by the scaffold itself. **SQLite now requires persistent storage on Render.** Mount a persistent disk and set `DATABASE_URL` to its absolute database path (for example `sqlite:////var/data/cabwise.db`). The default local file will be lost on an ephemeral deployment. The current Blueprint does not provision a paid disk automatically. Use one backend instance for this SQLite MVP.

## Real-phone acceptance checklist
Open `/device-check` on the intended Android phone over HTTPS. An HTTP LAN address such as `http://192.168...:5173` will not provide a secure sensor context.

- Confirm the backend indicator reports connected.
- Tap Check motion, grant permission if requested, move the phone, and verify changing acceleration values. Stop listening; navigate away and back.
- Tap Check location and verify coordinates and the reported accuracy. Permission denial should show a useful message.
- Tap Play Hindi greeting and confirm audible, intelligible Hindi. If no Hindi voice is installed, the app reports that instead of claiming successful playback.
- Try audio without connectivity to determine whether the selected device voice works offline. Offline application loading is not implemented yet.
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

Unknown or unavailable readings are not treated as safe. The replay API is an explicit demo control, not a connection to a real seatbelt sensor. Offline mutation queues, utility proximity, and machine classifiers are not implemented.

`DATABASE_URL` can override the local SQLite path. Parent directories must already exist. The backend reads process environment, not `.env` files automatically. To seed manually without changing saved work, run `.venv/Scripts/python.exe seed.py` from `backend`. SQLModel creates missing tables; it does not migrate existing schemas.

This is a demo API with no authentication or access controls; use demo data only.
