# CabWise

A phone-first operator companion for older construction equipment. This repository currently implements **steps 1 and 2 only**: agreed MVP scope and the application foundation.

Read [the MVP scope](docs/MVP_SCOPE.md) for the future feature boundaries and demo journey.

## Implemented
- Responsive React/Vite app with Tailwind and React Router.
- My Day landing screen and explicitly labelled future-module screens.
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

Deployments have not been created by the scaffold itself. No database or persistent disk is needed for this milestone; persistence must be configured before later database features are deployed.

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
