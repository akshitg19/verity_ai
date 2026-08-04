# verity.ai

verity.ai is a tablet-first homework workspace. A student writes their work by
hand with a stylus, exactly as they would on paper. As each line is finished,
the app reads it, verifies it with deterministic math and chemistry software,
and flags the first line that contains a mistake — without ever revealing the
answer.

Current homework apps only check the final answer. Photomath and its peers hand
over the full solution, which is why schools ban them. Chat tutors cannot see
the student's written work at all. Nobody today can tell a student "your
mistake is on line 3, and it is a sign error." That is the gap verity.ai
fills.

## What makes it different

- **Live stroke input.** Competing step-checkers work from a photo of a
  finished page. verity.ai works from the pen strokes themselves, so a line can
  be checked the moment it is written.
- **Chemistry.** No shipped product checks hand-drawn molecular structures
  live.
- **The AI never grades.** A vision model is used for exactly one job, reading
  handwriting. Every correctness decision is made by deterministic software
  that cannot hallucinate.
- **Hints cannot leak the answer.** The hint generator receives only a line
  number and an error category — never the problem, the solution, or the
  student's math. This is structural, not a matter of careful wording.

## Features

Working today:

- Stylus canvas with pressure support, palm rejection, ruled-row line
  segmentation, undo, and a stroke eraser.
- Per-line PNG export sent to Gemini 2.5 Flash for handwriting transcription,
  with unreadable-input handling and normalization of Unicode and LaTeX output.
- An editable transcription panel: a misread line is a one-second typed fix
  that re-runs the checker for free.
- Deterministic algebra verdicts over one-variable linear equations and
  rational arithmetic, with error classification into `sign`, `arithmetic`,
  `division`, `distribution`, and generic `algebraic` categories.
- Deterministic chemistry verdicts comparing a submitted structure against a
  target by canonical SMILES.
- A three-level hint ladder: where to look, what kind of mistake, and a
  conceptual explanation.
- Verdict display that separates a confirmed student mistake (red) from a valid
  step (green) from input the product cannot judge (amber).

Planned work, in priority order, lives in [`final_tasks.md`](final_tasks.md).
That file is the source of truth for scope and sequencing.

## Architecture

Five stages, each depending only on the one before it.

```text
Ink Capture  ->  Line Segmentation  ->  Transcription  ->  Verdict  ->  Hint
  stylus            group strokes         PNG to          SymPy /      template
  strokes           into lines            Gemini          RDKit        by category
```

1. **Ink capture.** The browser records the stylus through the Pointer Events
   API. A stroke is the set of points the pen touched between touching down and
   lifting up, with timing and pressure. Being a web standard, it behaves the
   same on iPad and Samsung, which is why this is a web app rather than two
   native ones.
2. **Line segmentation.** Strokes are grouped into written lines by the ruled
   row containing each stroke's vertical center. Faint ruled lines in the UI
   make that behavior visible and predictable. This remains the highest
   technical risk in the project.
3. **Transcription.** A finished line is rendered to a PNG and sent to Gemini
   through Vertex AI, which returns plain-text math. This is the only place AI
   touches student work, and its only job is reading.
4. **Verdict.** The transcribed line goes to a deterministic judge. Every judge
   implements the same `Judge[ProblemT, StepT, VerdictT]` contract, so subjects
   can be added without changing the product around them. A step that fails
   does not become the new reference line, so a single mistake does not cascade
   false errors down every later line.
5. **Hint.** Only after the checker flags a supported line does the app offer a
   hint, and only at the level the student asks for.

The verdict stage distinguishes four outcomes: `valid`, `invalid` (a real
mistake, the only status that can flag a line), `unsupported`, and
`parse_error`. The last two are capability and input-quality limits, and are
never presented to a student as an error they made. See
[`backend/JUDGE_SCOPE.md`](backend/JUDGE_SCOPE.md) for the exact supported
notation.

## Tech stack

| Piece | Choice | Reason |
|---|---|---|
| App | React + Vite, canvas element | One codebase for iPad and Samsung; no app store; demo by sharing a URL |
| Ink | Pointer Events API | Web standard with full stylus data including pressure |
| Transcription | Gemini 2.5 Flash on Vertex AI | Reads rendered ink without training a model. Auth is Application Default Credentials via the gcloud CLI, never raw API keys |
| Algebra verdict | SymPy | Exact symbolic computation |
| Chemistry verdict | RDKit | Canonical SMILES comparison and substructure matching |
| Hints | Deterministic templates keyed by error category | No model sees the problem or answer, so a hint cannot leak a solution |
| Backend | FastAPI + uvicorn | Simple integration and an interactive `/docs` surface |

## Repository layout

```text
backend/          FastAPI app, judges, transcription, hints
  judge/          One module per subject, all sharing the Judge contract
  tests/          pytest suite, including the transcription failure log
frontend/         React + Vite tablet client
final_tasks.md    Task list and priority order (source of truth)
```

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

The backend setup scripts delete and recreate `backend/venv` with Python 3.11
on every run, so stale packages from an older Python installation cannot leak
into the new environment.

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

The health endpoint should return `{"status":"ok"}`.

The frontend uses Vite's `/api` development proxy by default, so a tablet that
opens the displayed Network URL still reaches the backend running on the
laptop. For separate deployments, set `VITE_API_BASE_URL` when building the
frontend and add that frontend origin to the backend's comma-separated
`CORS_ORIGINS` environment variable.

## Gemini authentication

The `/check` endpoints work without Google Cloud. `/transcribe` requires each
developer to authenticate with their own account:

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
export `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, or `GEMINI_MODEL`
before starting the backend. No secret values belong in that file.

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

CI runs the backend suite on Ubuntu and Windows plus frontend lint and build on
every pull request.

## Product rules

These do not bend, and a change that violates one is wrong regardless of how
well it works:

- The app never shows the answer, at any hint level, under any phrasing.
- The AI never decides whether work is correct. Only the deterministic checker
  does.
- A wrong line is flagged once and gently. The student fixes it themselves;
  that is the learning.
- Anything that would make a teacher ban the app is out of scope by definition.
- `backend/schemas.py` is the shared frontend-backend contract. Keep changes to
  it additive and announce them in the pull request that needs them.

## Team

- Akshit Ganesh
- Kavin Karki
- Timothy Chen

## Workflow

Do not commit directly to `main`. Create a focused branch, push it, and open a
pull request for teammate review:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Before merging, confirm backend tests and frontend lint and build all pass.

## Common problems

- `str | None` fails: the virtual environment uses an old Python; recreate it
  with the setup script.
- `DefaultCredentialsError`: run `gcloud auth application-default login`.
- `command not found: uvicorn`: run the backend setup script again.
- A tablet cannot open the frontend: use the Vite `Network` URL and keep the
  laptop and tablet on the same Wi-Fi.
