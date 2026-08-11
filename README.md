# verity.ai

Live: <https://verity-ai-lovat.vercel.app>

verity.ai is a tablet-first homework workspace. A student writes their work
by hand with a stylus, exactly as they would on paper. As each line is
finished, the app reads it, checks it, and flags the first line where the
reasoning broke, while the student is still writing.

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
it distinguishes a proven mistake from a step it could not verify, so it
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
A student can draw the general ester `R-C(=O)-O-R'` with R groups standing
for "any substituent", and it is judged as the general case rather than
rejected as unreadable.

Every structure a student draws is rendered back to them as a picture, so a
misreading is caught at a glance instead of being discovered after the
verdict.

## Math

Deterministic verdicts over linear equations and rational arithmetic, with
mistakes classified into named categories (`sign`, `arithmetic`,
`division`, `distribution`) rather than a bare "wrong". A step that fails
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
   same engine that checks the student's own work before it is ever shown,
   so a wrong worked example cannot reach a student.
3. **Their own step**, reasoned through with them until that step is
   finished.

Every level is generated for the problem in front of the student, and level
2 is shown one step at a time with the atom counts moving as the equation
comes into balance, rather than printed as a paragraph.

## Which engine decides

Where a chemistry engine can prove a step, its verdict is final and the
model's opinion is discarded. Where nothing can prove it, predicting a
reaction product for instance, the model's judgement is shown **labelled as
such**, so a student and a teacher can always see which engine spoke. If two
independent reads disagree, the app asks the student to confirm the line
rather than guessing at a verdict.

Four outcomes, never three: `valid`, `invalid`, `unsupported` and
`parse_error`. The last two are our limitations rather than the student's
mistakes, and they are rendered as four different things so "we could not
check this" can never read as "you got this wrong".

## How much the hints give away

The backend solves every problem before it writes a hint, and holds that
solution server side where no response model can carry it. Every hint at
levels 1 and 2 passes through a single deterministic checkpoint that
compares it against every form of the answer, at any precision, as a
balanced equation, or as an equivalent structure.

**Level 3 is currently allowed to finish the step it is working**, including
on the last step of a problem. That is a deliberate product decision:
functionality first. The machinery that withholds is still present and still
tested, switched off behind one flag, and comes back with
`VERITY_WITHHOLD_ANSWER=1`. See the withholding section in `final_tasks.md`
before repeating any stronger claim about what the product refuses to say.

## Notebook

Notes, folders you create inside each subject, and pages shown as a strip
of thumbnails. It is built to be somewhere a student keeps a term of
homework, not a single canvas that grows forever.
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
frontend/         React + Vite client, landing page and workspace
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
service account, so there is no API key or credential file anywhere. The
deployment plan is written up in full at the bottom of `final_tasks.md`.

The public UI is served separately from Vercel, which builds `frontend/` and
points it at the Cloud Run API through `VITE_API_BASE_URL`:

| Piece | URL | |
|---|---|---|
| Frontend (Vercel) | <https://verity-ai-lovat.vercel.app> | **the link to share** |
| API (Cloud Run) | <https://verity-ai-389644353290.us-central1.run.app> | also serves a full fallback UI |

**Use the Vercel link.** `https://verity-ai-lovat.vercel.app` is the address
to share, put in a deck, and open on a tablet. Cloud Run still serves its own
copy of the frontend at the API URL, so that address remains a complete,
self-contained fallback if Vercel is ever in the way, but it is not the link
anyone should be given.

The two are separate origins, so the browser sends a CORS preflight before
every API call. Vercel mints a fresh hostname for every deployment and every
branch, so `CORS_ORIGINS` listing aliases by name allowed the production one
and blocked all the rest: opening a build from the Vercel dashboard loaded
the page and then failed every request with "Failed to fetch". The service
now also accepts `CORS_ORIGIN_REGEX`, defaulting to
`https://verity-ai[a-z0-9-]*\.vercel\.app`, which covers every deployment
this project will ever produce. `deploy.ps1` sets both, and
`tests/test_api.py` pins the behaviour.

The service runs with `--min-instances 1`, so the link is live the moment
anyone opens it rather than booting a container first. That is the only
setting that bills while idle; the command to turn it off is printed at the
end of every deploy.

Ship a frontend change with:

```powershell
cd frontend
vercel deploy --prod
```

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

## Check it against the live service

Every automated test in this repo mocks the model, which means they prove the
judges reach the right verdict on a clean string and nothing at all about
whether the product works. This drives the deployed service the way a student
does: open a problem, submit the correct working, submit a wrong line, then
ask for all three hint levels.

```bash
python backend/scripts/student_walkthrough.py
python backend/scripts/student_walkthrough.py --topic balancing
python backend/scripts/student_walkthrough.py --base http://127.0.0.1:8000
```

It makes real model calls and costs real money, so it is never part of
pytest. It reports how often each hint level generates rather than falling
back to a template, and it exits non-zero if any correct answer was judged
wrong or any wrong answer was judged correct. That last number has a target
of zero, and it is the one to look at first: it has already caught three
cases the 576 mocked tests could not.

Run it before a demo, and after any change to a judge, a vault, or a prompt.

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
  one, or leave naming out. Every other feature is unaffected.
