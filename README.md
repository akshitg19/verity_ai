# CheckMate

CheckMate is a tablet-first homework workspace that reads each handwritten math
step, verifies it with deterministic math software, and points students toward
mistakes without revealing the answer.

## Prerequisites

- Git
- Python 3.11
- Node.js 22 LTS and npm
- Google Cloud CLI, only for developers testing Gemini transcription
- Access to the Google Cloud project configured in `.env.example`

Each developer creates their own `backend/venv` and `frontend/node_modules`.
Never commit either directory or share Google Cloud credentials.

## Setup

### macOS or Linux

```bash
cd backend
./setup-backend.sh
cd ../frontend
npm ci
```

### Windows PowerShell

```powershell
cd backend
.\setup-backend.ps1
cd ..\frontend
npm ci
```

The backend setup scripts recreate `backend/venv` with Python 3.11 each time,
so stale packages from an older Python installation cannot leak into the new
environment.

If PowerShell blocks local scripts, allow them for the current terminal only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Run the app

Use two terminals from the repository root.

| Service | macOS/Linux | Windows PowerShell |
| --- | --- | --- |
| Backend | `./backend/start-backend.sh` | `.\backend\start-backend.ps1` |
| Frontend | `./frontend/start-frontend.sh` | `.\frontend\start-frontend.ps1` |

Open these URLs after startup:

- Frontend: <http://localhost:5173>
- Backend health check: <http://127.0.0.1:8000/health>
- Interactive API docs: <http://127.0.0.1:8000/docs>

The health endpoint should return:

```json
{"status":"ok"}
```

## Gemini authentication

The `/check` endpoint works without Google Cloud. The `/transcribe` endpoint
requires each developer to authenticate with their own account:

```bash
gcloud init
gcloud config set project cs-sail-2b08
gcloud auth application-default login
```

Run the optional paid/network smoke test from the repository root:

```bash
./backend/venv/bin/python backend/scripts/check_gemini_connection.py
```

On Windows:

```powershell
.\backend\venv\Scripts\python.exe backend\scripts\check_gemini_connection.py
```

Expected output: `working`. Automated tests never call Gemini.

Configuration defaults are documented in `.env.example`. To override one,
export `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, or `GEMINI_MODEL` in the
terminal before starting the backend. No secret values belong in that file.

The current deterministic judge intentionally supports a narrow MVP: rational
arithmetic and one-variable linear equations. See
[`backend/JUDGE_SCOPE.md`](backend/JUDGE_SCOPE.md) for accepted notation and
the difference between an incorrect, unsupported, and unparseable step.

The frontend uses Vite's `/api` development proxy by default, so a tablet that
opens the displayed Network URL still reaches the backend running on the
laptop. For separate deployments, set `VITE_API_BASE_URL` when building the
frontend and add that frontend origin to the backend's comma-separated
`CORS_ORIGINS` environment variable.

## Validate changes

### Backend

```bash
cd backend
./venv/bin/python -m pytest
```

Windows equivalent:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest
```

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run build
```

## Team workflow

Do not commit directly to `main`. Create a focused branch, push it, and open a
pull request for teammate review:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Before merging, confirm backend tests and frontend lint/build all pass. See
`PROJECT_NOTES.md` for ownership and the current product plan.

## Common problems

- `str | None` fails: the virtual environment uses Python 3.9; recreate it with
  Python 3.11 using the setup script.
- `DefaultCredentialsError`: run `gcloud auth application-default login`.
- `command not found: uvicorn`: run the backend setup script again.
- A tablet cannot open the frontend: use the Vite `Network` URL and keep the
  laptop and tablet on the same Wi-Fi.
