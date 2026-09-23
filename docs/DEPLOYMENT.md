# Deploy CATalog on Render and Vercel

Both services deploy from `Pratishtha36/CATalog`, branch `main`. Deploy the backend first so its real origin can be supplied to the frontend build. Use demo data: authentication and production access controls are not implemented.

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
| Health check | `/health` (`/api/health` also remains available) |
| Environment | `PYTHON_VERSION=3.13.7` |
| Initial CORS environment | `FRONTEND_URL=http://localhost:5173` (replace after the Vercel URL is assigned) |

For a temporary demo, select Free. The root `render.yaml` also provides these basic settings for Blueprint users. This YAML intentionally does not provision a paid resource.

The backend accepts `FRONTEND_URL` and `DATABASE_URL`, including lowercase aliases `frontend_url` and `database_url`. Use uppercase names consistently as shown here. `FRONTEND_URL` is the frontend origin (no path); comma-separated origins are supported. Legacy `CORS_ORIGINS` remains a fallback when no frontend URL is set.

### Supabase PostgreSQL

Before deploying, set Render > Environment > `DATABASE_URL` to the full URI from Supabase **Connect > Transaction pooler** (usually port 6543). Replace the password placeholder with your URL-encoded database password. Keep the credential on the backend only; never use a `VITE_` variable for it.

The backend uses psycopg, requires TLS, disables prepared statements, and uses transaction-scoped write locks compatible with the pooler. It creates missing tables and seeds demo records on startup. Existing laptop SQLite records are not automatically imported; the original SQLite file is retained. Trained phone models and incident photos are stored in PostgreSQL, so a Render persistent disk is not required for these records.

For local use, create ignored `backend/.env` with `DATABASE_URL` and `FRONTEND_URL` (see `.env.example`). Render environment variables take precedence. SQLite remains a local/test fallback when no URL is configured; Render startup refuses that fallback to prevent accidental ephemeral storage.

In Supabase, disable the Data API if it is not used by another application, or enable RLS without anonymous policies on the application tables. This app connects through the backend database owner; it does not use the Supabase browser client. The demo backend itself still has no authentication.

Once deployment finishes, open `https://YOUR-SERVICE.onrender.com/api/health` and confirm `status: ok`, version `0.5.0`, and `database: postgresql`. This confirms the selected database engine after successful startup. A free service can sleep when inactive; let it wake before testing the frontend.

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

In Render > Environment, replace `FRONTEND_URL` with the exact Vercel production origin:

```text
FRONTEND_URL=https://YOUR-PROJECT.vercel.app
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

- SciPy metadata-generation failure: verify the build log uses Python 3.13.7. Set Render `PYTHON_VERSION=3.13.7`, then clear the build cache and redeploy. The backend `.python-version` pins the same version, but a Render environment override takes precedence. The pinned SciPy version has Python 3.13 wheels; newer Python versions may trigger an unsupported source build.
- Render deploy fails: inspect its build/runtime logs. Verify Root directory is backend and the start command uses `$PORT` (Render runs Linux, not PowerShell).
- Vercel build requests VITE_API_URL: add the actual HTTPS Render origin and redeploy.
- Backend unavailable: open the Render health URL first. A waking free service may exceed the frontend's 12-second timeout; retry once it is awake.
- CORS error: verify Render allows the exact browser origin, including `https://`, and restart the backend after changing it.
- Requests go to Vercel `/api`: VITE_API_URL was missing when the frontend was built. Set it and redeploy.
- Old code or missing features: verify both services deployed the latest main commit.
- Database connection fails: check DATABASE_URL, the actual password, the transaction-pooler host and port, and whether the Supabase project is active. Never paste credentials into logs or screenshots.

Official references: [Render FastAPI](https://render.com/docs/deploy-fastapi), [Render free limitations](https://render.com/docs/free), [Render disks](https://render.com/docs/disks), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
