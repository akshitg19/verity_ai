# verity.ai

**It knows the answer. It will never give it to you.**

verity.ai is a tablet-first homework workspace. A student writes their work
by hand with a stylus, exactly as they would on paper. As each line is
finished, the app reads it, checks it, and flags the first line where the
reasoning broke — while the student is still writing, and without ever
handing over the answer.

Current homework apps only check the final answer. Photomath and its peers
hand over the full solution, which is why schools ban them. Chat tutors
cannot see the student's written work at all. Nobody today can tell a
student "your mistake is on line 3, and it is a sign error." That is the gap
verity.ai fills.

## Three properties that make it a product

**Live, on the page.** Feedback arrives while the student is still writing,
from the pen strokes themselves, not from a photo of finished work.
Competing step-checkers start from a completed page; chat tutors never see
the page at all.

**Precise about where.** It flags the first line where reasoning broke, and
it distinguishes a proven mistake from a step it could not verify — so it
never accuses a student of an error it merely failed to understand.

**Teaches up to the answer, never past it.** The help gets genuinely
substantive, up to and including working a step with the student, and it
stops short of the solution by mechanism rather than by good manners.

The test we hold every feature to: *a teacher would let a student use this
during homework, and the student would still have to think.*

## Chemistry

Six subjects, each checked by software that computes the chemistry rather
than recognising a pattern.

| Subject | What it checks |
|---|---|
| **Formulas, moles & stoichiometry** | Molar mass, percent composition, empirical and molecular formulas, mole conversions, limiting reagent, theoretical and percent yield |
| **Equations & balancing** | Balancing by exact linear algebra, complete and net ionic equations, spectator-ion identification |
| **Redox & electrochemistry** | Half-reactions balanced on atoms *and* charge, oxidation-state assignment from the standard rules, standard cell potentials |
| **Solutions, acids & bases** | Molarity, dilution, pH and pOH, strong and weak acids and bases, Ka and Kb, buffers by Henderson-Hasselbalch, ICE tables solved exactly, titration |
| **Molecular structure & bonding** | Hand-drawn structures read into SMILES and compared by canonical form; constitutional and stereoisomers |
| **Organic** | Functional group identification, IUPAC naming, and reaction-product prediction |

Two things here exist nowhere else. **No shipped product checks hand-drawn
molecular structures live.** And verity.ai understands **generic structures**
— a student can draw the general ester `R-C(=O)-O-R'` with R groups standing
for "any substituent", and it is judged as the general case rather than
rejected as unreadable.

Every structure a student draws is rendered back to them as a picture, so a
misreading is caught at a glance instead of being discovered after the
verdict.

## Math

Deterministic verdicts over linear equations and rational arithmetic, with
mistakes classified into named categories — `sign`, `arithmetic`,
`division`, `distribution` — rather than a bare "wrong". A step that fails
does not become the reference for the next line, so a single mistake never
cascades false errors down the rest of the page.

## The hint ladder

Three levels, and each is a different *kind* of help rather than the same
help worded more generously. It is what a human tutor does: diagnose,
demonstrate, then work it through with you.

1. **Where it went wrong.** Names the operation the student actually
   performed on that line and what to compare against what. Never a
   corrected value.
2. **A worked example.** A *different* problem that mirrors theirs with
   different numbers, solved end to end. Every line of it is verified by the
   same engine that checks the student's own work before it is ever shown —
   so a wrong worked example cannot reach a student.
3. **Their own step**, reasoned through with them, up to but not including
   the answer.

On the final step, level 3 declines. It says so plainly and offers another
worked example instead, so the ladder never terminates in the answer.

## How the answer stays in

The system solves the problem completely and then refuses to tell you. That
refusal is enforced by machinery, not by asking a model to be discreet:

- The solved answer is held **server-side only**, and can never appear on
  any response the app is capable of sending.
- Every word bound for a student passes through a **single checkpoint** that
  compares it against every form of the answer — the number at any
  precision, the balanced equation, the structure in any equivalent
  notation — and blocks it.
- **On the last step, the deepest hint is refused** rather than softened.
- Deep hints are **metered per problem**, because a student who needs one on
  every line should be sent back to the worked examples instead.

Where a chemistry engine can prove a step, its verdict is final and the AI's
opinion is discarded. Where nothing can prove it — predicting a reaction
product, for instance — the AI's judgement is shown **labelled as such**, so
a student and a teacher can always see which engine spoke. If two
independent reads disagree, the app asks the student to confirm the line
rather than guessing at a verdict.

The claim we make is exactly as narrow as what we enforce: **the answer is
never stated.**

## Notebook

Notes, folders per subject, and pages — the app is built to be somewhere a
student keeps a term of homework, not a single canvas that grows forever.
Work is saved locally and stays there between sessions.

## Tech stack

| Piece | Choice | Reason |
|---|---|---|
| App | React + Vite, canvas element | One codebase for iPad and Samsung; no app store; demo by sharing a URL |
| Ink | Pointer Events API | Web standard with full stylus data including pressure |
| Recognition | Gemini 2.5 Flash on Vertex AI | Reads rendered ink without training a model |
| Math verdicts | SymPy | Exact symbolic computation |
| Chemistry structures | RDKit | Canonical SMILES comparison and substructure matching |
| Chemistry equations | Exact rational linear algebra | Balancing is solved, not searched |
| IUPAC naming | OPSIN | Name to structure, then the same structural comparison |
| Backend | FastAPI + uvicorn | Simple integration and an interactive `/docs` surface |

## Repository layout

```text
backend/          FastAPI app, judges, recognition, hints
  judge/          One module per subject, all sharing the Judge contract
  tests/          pytest suite, including the recognition failure logs
frontend/         React + Vite tablet client
Dockerfile        Builds both into one deployable image
final_tasks.md    Task list and priority order (source of truth for scope)
```

## Prerequisites

- Git
- Python 3.11
- Node.js 22 LTS and npm
- Google Cloud CLI, for developers testing handwriting recognition
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

## Run it locally

Use two terminals from the repository root.

| Service | macOS/Linux | Windows PowerShell |
| --- | --- | --- |
| Backend | `./backend/start-backend.sh` | `.\backend\start-backend.ps1` |
| Frontend | `./frontend/start-frontend.sh` | `.\frontend\start-frontend.ps1` |

Open these URLs after startup:

- Frontend: <http://localhost:5173>
- Backend health check: <http://127.0.0.1:8000/health>
- Interactive API docs: <http://127.0.0.1:8000/docs>

The frontend uses Vite's `/api` development proxy by default, so a tablet
that opens the displayed Network URL still reaches the backend running on the
laptop.

## Deploy it

One command builds both halves into a single container and ships it:

```powershell
.\deploy.ps1
```

It deploys to Cloud Run in the same Google Cloud project that serves the
recognition model, so the running service authenticates through its own
service account — there is no API key or credential file anywhere. The
deployment plan is written up in full at the bottom of `final_tasks.md`.

## Gemini authentication

The judging endpoints work without Google Cloud. Handwriting recognition
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
npm test
npm run build
```

CI runs the backend suite on Ubuntu and Windows plus frontend lint, tests,
and build on every pull request. Automated tests never make a live model
call; the scripts that do are run by hand:

```bash
python backend/scripts/live_chemistry_check.py
python backend/tests/transcription/run_chemistry_corpus.py
```

## Product rules

These do not bend, and a change that violates one is wrong regardless of how
well it works:

- The app never states the answer, at any hint level, under any phrasing.
- Where a deterministic engine can decide a step, its verdict is final and
  the model's is discarded. Where one cannot, the model's verdict is shown
  labelled as a model verdict, never as a proven one.
- A step the app cannot check is never presented as a student mistake.
- A wrong line is flagged once and gently. The student fixes it themselves;
  that is the learning.
- Anything that would make a teacher ban the app is out of scope by
  definition.
- `backend/schemas.py` is the shared frontend-backend contract. Keep changes
  to it additive and announce them in the pull request that needs them.

## Team

- Akshit Ganesh
- Kavin Karki
- Timothy Chen

## Workflow

Do not commit directly to `main`. Create a focused branch, push it, and open
a pull request for teammate review:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Before merging, confirm backend tests and frontend lint, tests, and build all
pass.

## Common problems

- `str | None` fails: the virtual environment uses an old Python; recreate it
  with the setup script.
- `DefaultCredentialsError`: run `gcloud auth application-default login`.
- `command not found: uvicorn`: run the backend setup script again.
- A tablet cannot open the frontend: use the Vite `Network` URL and keep the
  laptop and tablet on the same Wi-Fi.
- IUPAC naming reports "not supported": OPSIN needs a Java runtime. Install
  one, or leave naming out — every other feature is unaffected.
