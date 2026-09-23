# Deploy CATalog on Render and Vercel

Both services deploy from `Pratishtha36/CabWise`, branch `main`. The repository name can stay CabWise. Deploy the backend first so its real origin can be supplied to the frontend build. Use demo data: authentication and production access controls are not implemented.

## 1. Render backend

In Render, select New > Web Service, connect GitHub, and select the repository.

| Setting | Value |
| --- | --- |
| Name | `catalog-api` (or another available name) |
| Branch | `main` |
| Root directory | `backend` |
| Runtime | Python 3 |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/api/health` |
| Environment | `PYTHON_VERSION=3.13.7` |
| Initial CORS environment | `CORS_ORIGINS=http://localhost:5173` (replace after the Vercel URL is assigned) |

For a temporary demo, select Free. The root `render.yaml` also provides these basic settings for Blueprint users. This YAML intentionally does not provision a paid resource.

Once deployment finishes, copy the actual service URL. Open `https://YOUR-SERVICE.onrender.com/api/health` and confirm `status: ok` and version `0.4.0`. A free service can sleep when inactive; let this URL finish waking the service before testing the frontend. Use one backend instance with this SQLite implementation.

### Persistent option

Free Render web services do not support persistent disks. Local SQLite data, incident photos, and trained phone models can be lost on a redeploy/restart/spin-down. Local browser queues are separate; already-synced records are not automatically re-uploaded after a server reset.

If persistent data is required, choose a paid web service, attach a persistent disk mounted at `/var/data`, and set:

```text
DATABASE_URL=sqlite:////var/data/cabwise.db
MOTION_MODEL_DIR=/var/data/motion-models
```

Only set these paths after attaching the disk. These environment variables do not create a Render disk. Laptop data is not automatically copied to the cloud; a new hosted database begins with demo fixtures. Review current Render charges before creating paid resources.

## 2. Vercel frontend

Select Add New > Project, import the same repository, and configure:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | `frontend` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `VITE_API_URL=https://YOUR-SERVICE.onrender.com` |

Set the variable before deploying (Production; also Preview if you will use preview deployments). Use the real Render origin, with HTTPS and without `/api`. It is a public API address, not a secret. The build fails with an actionable error if Vercel is missing this setting or it includes a path. The committed `frontend/vercel.json` configures SPA route refreshes.

Click Deploy and copy the stable production domain, for example `https://YOUR-PROJECT.vercel.app`. Use the actual assigned URL, not this placeholder.

## 3. Connect the two services

In Render > Environment, replace `CORS_ORIGINS` with the exact Vercel production origin:

```text
CORS_ORIGINS=https://YOUR-PROJECT.vercel.app
```

Save and redeploy/restart Render. For multiple intentionally allowed origins, use comma-separated values, without paths. A changing Vercel preview URL is a different origin and must be explicitly allowed if used. Prefer the stable production domain for phone testing and consistent browser storage.

Changing `VITE_API_URL` on Vercel requires a new frontend deployment because Vite substitutes it at build time. The Vite localhost proxy is only for local development; it does not run in the hosted frontend.

## 4. Test on another device

1. Open the stable Vercel HTTPS URL in Chrome on Android and confirm Backend connected (tap the connection button to retry after Render wakes up).
2. Start a shift, add an activity, and verify saved task state after refresh.
3. Open SwingSense > Phone sensors > Threshold rules > Start capture. Keep the page visible and allow motion access if prompted.
4. Save a demo incident/photo and check that it becomes Synced. A second device using the same demo operator should see the synced report via Incident reports > Sync now.
5. Reload a deep route such as `/insights` or `/incidents` directly; it should render instead of returning a Vercel 404.
6. Follow `INSIGHTS_INCIDENTS_MANUAL_CHECKS.md` for offline queue tests. Full offline app-shell loading is not implemented.

## Troubleshooting

- Render deploy fails: inspect its build/runtime logs. Verify Root directory is backend and the start command uses `$PORT` (Render runs Linux, not PowerShell).
- Vercel build requests VITE_API_URL: add the actual HTTPS Render origin and redeploy.
- Backend unavailable: open the Render health URL first. A waking free service may exceed the frontend's 12-second timeout; retry once it is awake.
- CORS error: verify Render allows the exact browser origin, including `https://`, and restart the backend after changing it.
- Requests go to Vercel `/api`: VITE_API_URL was missing when the frontend was built. Set it and redeploy.
- Old code or missing features: verify both services deployed the latest main commit.
- Reports missing after server reset: free filesystem storage is ephemeral. Persistent use requires a disk or a future database/storage migration.

Official references: [Render FastAPI](https://render.com/docs/deploy-fastapi), [Render free limitations](https://render.com/docs/free), [Render disks](https://render.com/docs/disks), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
