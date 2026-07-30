# CheckMate: Project Notes

Working doc for the team. Plain language, kept current as decisions change.
Last updated: July 19, 2026.

---

## 1. What we are building

CheckMate is a web app for tablets (iPad and Samsung). A student does their homework on it by writing with a stylus, the same way they would write in a paper notebook or a notes app. As they write, the app checks each line of their work. If a line contains a mistake, the app underlines that line and offers a small hint about where to look. It never shows the answer.

The product exists because current homework apps only check the final answer. Photomath and similar apps give the full solution, which is why schools ban them. Chat tutors like Khanmigo cannot see the student's written work at all. Nobody today can tell a student "your mistake is on line 3, and it is a sign error." That is the gap we fill.

## 2. What makes it different (in one sentence each)

- We see the student's work as they write it, not a photo of it afterward.
- The correctness decision is made by deterministic math software inside a clearly documented support scope, not by a generative AI model.
- The AI is currently used for one job where it is strong: reading handwriting. Hints are deterministic templates in the MVP.
- Hints never contain the answer. This is a product rule, not a technical limitation.

## 3. Known competition and our honest position

Products already exist that check math steps and claim "no hallucinations" (MathPad, Math-Tutor AI on iPad). Both work step by step and use the same class of math-verification software we do. We do not pretend otherwise.

Our differences are:

1. **Live stroke input.** Competitors work from a photo or a finished page. We work from the pen strokes themselves, live, which allows checking while the student writes.
2. **Chemistry.** No shipped product checks hand-drawn molecular structures live. This is our strongest demo moment.
3. **Teacher and parent visibility.** Later features (see roadmap) show which lines a student rewrote and struggled with. No product surfaces that today.

When presenting, lead with points 1 and 2. Do not claim "nobody checks steps," because that claim is false and easy to disprove.

## 4. How the system works, end to end

The pipeline has five stages. Each stage only depends on the one before it.

1. **Ink capture.** The browser records the stylus. A stroke is the set of points the pen touched between touching down and lifting up, with timing and pressure. This works the same on iPad and Samsung because it uses a web standard (Pointer Events), which is the reason we build a web app instead of two native apps.

2. **Line segmentation.** Strokes are grouped into written lines: line 1, line 2, line 3. The current MVP assigns each stroke to the ruled row containing its vertical center. The interface shows faint ruled lines to make that behavior visible and predictable. This stage remains the highest technical risk in the project.

3. **Transcription.** A finished line is converted to an image and sent to Gemini through Vertex AI, which returns the math as text. This is the only place AI currently touches the student's work, and its only job is reading, not judging.

4. **Verdict.** The transcribed line is checked by deterministic math software. For algebra, SymPy confirms whether a supported new line follows from the previous line. Chemistry with RDKit is planned but not implemented. The API separates a confirmed mistake from an unsupported or unparseable line, so product limitations are not shown as student errors.

5. **Hint.** Only after the checker flags a supported line, the app offers a deterministic template pointing the student toward the mistake. There are three hint levels: where to look, what kind of mistake, and a conceptual explanation. The student asks for each level; nothing is volunteered beyond the underline. The templates never receive the problem or solution.

## 5. Current state (as of this doc)

Done:
- Cross-platform setup and start scripts for macOS/Linux and Windows.
- React drawing canvas with Pointer Events, ruled-row segmentation, per-line PNG export, editable transcription, verdict display, and hint controls.
- FastAPI endpoints for health, transcription, checking, and hints.
- Gemini/Vertex AI line transcription with unreadable and service-error handling.
- A constrained SymPy judge for rational arithmetic and one-variable linear equations, with explicit `valid`, `invalid`, `unsupported`, and `parse_error` outcomes.
- Deterministic three-level hint templates that receive no problem or answer content.
- Automated backend tests plus frontend lint/build checks in CI.

Not started:
- Chemistry recognition/judging, real-student testing, and production deployment.

## 6. Build order and why

1. **Canvas (next).** A drawing surface in the browser that records strokes. Tested on a real tablet by opening the laptop's local address in the tablet browser over shared WiFi.
2. **Segmentation.** Group strokes into lines and draw faint boxes around each detected line so we can see mistakes in the grouping immediately.
3. **Transcription.** Send each finished line to the vision model, show the returned text next to the handwriting.
4. **Wire to the checker.** Connect transcription output to the existing `/check` endpoint. At this point the full loop works: write, check, flag.
5. **Hints, then chemistry, then polish.**

The verdict stage was built first, out of order, because it was the only stage with zero unknowns and it gives every later stage something real to connect to.

## 7. Technology choices and reasons

| Piece | Choice | Reason |
|---|---|---|
| App | Web app, React, canvas element | One codebase covers iPad and Samsung; no app store; demo by sharing a URL |
| Ink | Pointer Events API | Web standard; gives full stylus data including pressure; pen lift marks line ends |
| Transcription | Gemini on Vertex AI | Strokes render to clean images, so the team can test vision accuracy without training a model |
| Verdict | SymPy (algebra), RDKit + MolScribe (chemistry), plain Python (arithmetic) | Deterministic; cannot hallucinate |
| Hints | Deterministic templates keyed by error category | No model receives the problem or answer, so the MVP cannot leak a solution through hints |
| Backend | FastAPI HTTP endpoints | Simple local integration and an interactive `/docs` test surface |
| On-device (stretch) | Qualcomm edge hardware for transcription | Lower latency and privacy; only if weeks 1-6 go well |

## 8. Timeline (8 weeks total, demo-ready spine at week 4)

- **Week 1:** Prove the spine on one problem type: stroke in, verdict out. Nothing else.
- **Week 2:** Hint ladder and the canvas interface.
- **Week 3:** Chemistry judge. Put the app in front of five real students.
- **Week 4:** Polish, latency, demo script. This is the presentation checkpoint.
- **Weeks 5-6:** Expand algebra coverage to precalculus. Begin error-pattern tracking and the teacher/parent replay view.
- **Weeks 7-8:** On-device transcription on the Qualcomm hardware (stretch). Final report and demo. Cut anything not essential.

## 9. Risks, stated plainly

1. **Line segmentation.** Knowing where one written line ends and the next begins in freeform handwriting is the genuinely hard problem. Mitigation: the pen-lift-plus-gap rule, plus ruled lines in the interface that nudge students to write in rows. If week 1 shows this works, the rest of the project is execution.
2. **Handwriting variety.** The transcription model must handle messy real student writing, not just ours. Mitigation: test with deliberately bad handwriting early, and keep MathPix as a fallback reader.
3. **Chemistry recognition.** Reading hand-drawn molecules is an unsolved research problem beyond simple structures. Mitigation: the demo covers a narrow, rehearsed set of structure types, not open-ended organic chemistry.
4. **Latency.** "Checks as you write" requires fast round trips. Mitigation: the app only checks when a line is finished (pen lift), never on every stroke.
5. **Cross-platform development environments.** The team develops on both macOS and Windows, so local interpreters and virtual environments are not portable between teammates. Mitigation: standardize on Python 3.11, keep dependencies in `backend/requirements.txt`, and use the platform-specific setup scripts documented in `README.md`.

## 10. Product rules (do not violate these)

- The app never shows the answer, at any hint level, under any phrasing.
- The AI never decides whether work is correct. Only the deterministic checker does.
- A wrong line is flagged once and gently. The student fixes it themselves; that is the learning.
- Anything that would make a teacher ban the app is out of scope by definition.

## 11. Glossary

- **Stroke:** the path the stylus draws between touching the screen and lifting off.
- **Segmentation:** deciding which strokes belong to which written line.
- **Transcription:** converting a written line into typed math text.
- **Judge / checker:** the software that decides whether a line is mathematically valid.
- **SymPy:** a Python library that does exact symbolic math. Used to verify algebra steps.
- **RDKit:** a Python library for chemistry. Used to verify molecular structures.
- **Hint ladder:** the three escalating hint levels a student can request for a flagged line.
- **The spine:** shorthand for the minimal end-to-end path: stroke in, verdict out.

# 12. CheckMate Team Workflow and Task Split

## 1. Git Workflow for a Three-Person Team

Now that three people will be working on the project, nobody should commit directly to `main`.

The `main` branch should only contain finished, working code that has been reviewed through a pull request.

### Branches

Each person should create a branch for the part of the project they are working on.

Example branch names:

```bash
git checkout -b frontend-canvas
git checkout -b backend-judge
git checkout -b ai-transcription
```

When the work is ready:

1. Push the branch to GitHub.
2. Open a pull request into `main`.
3. Have at least one teammate review it.
4. Confirm that the code runs before merging.

The review does not need to be extremely detailed at this stage. The main goal is to have a second person check that the changes make sense and do not break the project.

### Starting Each Work Session

Before beginning new work, update your branch with the latest version of `main`:

```bash
git checkout main
git pull origin main
git checkout your-branch-name
git merge main
```

This reduces the chance of people working on outdated versions of the project for several days.

Do not use only:

```bash
git pull origin main
```

while on a feature branch unless you understand how Git will merge the remote branch into your current branch. Switching to `main`, updating it, and then merging it into your feature branch is easier to understand and keeps the process consistent.

This workflow adds a small amount of overhead now but helps prevent a major merge problem before the demo.

---

# 2. Task Split

The work should be divided by parts of the system rather than having multiple people edit the same files.

The CheckMate pipeline is:

```text
Ink Capture
    ↓
Line Segmentation
    ↓
Transcription
    ↓
Verdict
    ↓
Hint
```

Each person should own a different section of this pipeline.

---

## Person 1 — Frontend and Ink Capture

### Main Responsibilities

Person 1 owns the tablet interface and everything involving stylus input.

Tasks include:

* Building the drawing canvas
* Capturing stylus strokes
* Recording pen position, timing, and pressure
* Displaying the handwriting on the screen
* Grouping strokes into written lines
* Detecting when a line is finished
* Rendering each completed line as a PNG image
* Sending completed lines to the backend
* Underlining incorrect lines
* Displaying transcription results and hints
* Building the overall user interface

### Main Files

Person 1 primarily owns:

```text
frontend/
```

This person should avoid editing backend logic unless a frontend-backend contract needs to change.

### Primary Goal

Make it possible for a student to write on a tablet and send a completed handwritten line through the rest of the system.

---

## Person 2 — Backend and Deterministic Judges

### Main Responsibilities

Person 2 owns the FastAPI backend and the software that determines whether a step is correct.

Tasks include:

* Maintaining the FastAPI application
* Maintaining the `/check` endpoint
* Improving the common judge interface
* Extending algebra support
* Supporting additional equation types
* Testing valid and invalid algebra transformations
* Handling unsupported mathematical steps clearly
* Building the chemistry judge
* Integrating RDKit
* Defining how molecular structures are compared
* Maintaining backend routing

### Main Files

Person 2 primarily owns:

```text
backend/judge/
backend/main.py
```

Changes to `backend/main.py` should be kept small because it connects several parts of the system.

### Primary Goal

Make the verdict system accurate, predictable, and easy to expand from algebra into chemistry.

---

## Person 3 — AI Transcription, Hints, and Testing

### Main Responsibilities

Person 3 owns the parts of the system that use Gemini or another vision model.

Tasks include:

* Building and maintaining the `/transcribe` endpoint
* Sending handwritten line images to Gemini
* Returning structured typed math
* Testing transcription with messy handwriting
* Improving the transcription prompt
* Recording common transcription failures
* Adding confidence or error handling when handwriting cannot be read
* Building the hint-generation endpoint
* Designing the three-level hint ladder
* Ensuring hints do not reveal the answer
* Organizing real-student testing
* Logging problems found during testing

### Main Files

Person 3 primarily owns:

```text
backend/transcription.py
backend/hints.py
```

This person may also own a testing folder such as:

```text
tests/transcription/
```

### Primary Goal

Make handwriting transcription reliable enough for the demo and make hints useful without solving the problem for the student.

---

# 3. Shared Files and Communication

Some files define how the frontend and backend communicate.

For example:

```text
backend/schemas.py
```

This file may contain request and response formats shared across the project.

Everyone may need to read this file, but nobody should change it casually.

Before changing a shared schema, tell the team because the change may affect:

* The frontend request
* The transcription endpoint
* The checker
* The response displayed in the interface

A schema change should usually be made through its own pull request or clearly described in the pull request that requires it.

---

# 4. Frontend Improvement To-Do List

Person 1 owns the frontend and feedback experience. Person 2 owns backend
equation coverage and deterministic judging, and Person 3 owns transcription
and hint services. Adding support for quadratics, systems, inequalities, or
other equation types is therefore not a frontend task. The team should agree
on those types before the frontend exposes them.

Completed items stay visible and are crossed out so the team can track
progress without keeping the old Week 1–4 plan.

## Canvas and Tablet Experience

- [x] ~~Capture stylus strokes with palm rejection and pressure support.~~
- [x] ~~Provide pen, eraser, and scroll tools.~~
- [x] ~~Provide pen color and thickness controls.~~
- [x] ~~Add ruled writing rows and group handwriting by row.~~
- [x] ~~Export a completed handwritten line and send it for transcription.~~
- [ ] Add undo for the most recent stroke.
- [ ] Improve stroke smoothing so handwriting feels more natural.
- [ ] Highlight the active writing row.
- [ ] Improve automatic line completion while keeping the manual action as a fallback.
- [ ] Test the complete writing flow on iPad and Samsung tablets.

## Feedback Experience

- [x] ~~Show separate states for correct, incorrect, unsupported, and unreadable work.~~
- [x] ~~Underline the first confirmed incorrect line.~~
- [x] ~~Display transcribed lines in an editable feedback panel.~~
- [x] ~~Recheck the work after a transcription is corrected.~~
- [x] ~~Display the three-level hint flow.~~
- [ ] Rewrite feedback in student-friendly language.
- [ ] Tailor feedback readability to the agreed grade range.
- [ ] Make the next action obvious after a correct, incorrect, unsupported, or unreadable result.
- [ ] Improve loading, empty, offline, and API-error states.
- [ ] Add a subtle success animation without distracting from the student's work.

## Interface and Accessibility

- [ ] Finalize the visual hierarchy of the canvas, toolbar, and feedback panel.
- [ ] Check text size, contrast, button size, and keyboard focus states.
- [ ] Make the layout responsive across tablet and laptop screen sizes.
- [ ] Add clear labels or tooltips for unfamiliar controls.
- [ ] Ensure status is communicated with text and icons, not color alone.

## Integration and Validation

- [ ] Confirm the frontend handles every documented backend status safely.
- [ ] Keep unsupported equation types clearly separate from student mistakes.
- [ ] Test valid, invalid, unsupported, unreadable, and corrected-transcription flows.
- [ ] Run short usability sessions with students in the target grade range.
- [ ] Turn usability findings into prioritized frontend fixes.
- [ ] Verify the final demo flow on the actual presentation device.

## Team Decisions Needed

- [ ] Agree on the target grade range for the first version.
- [ ] Agree on the backend equation types supported in the first version.
- [ ] Agree on the exact demo problems and expected feedback.
- [ ] Confirm the API contract before adding subject-specific frontend flows.

---

# 5. Suggested Branches

The team can begin with these branches:

### Person 1

```bash
git checkout -b frontend-canvas
```

### Person 2

```bash
git checkout -b backend-judge
```

### Person 3

```bash
git checkout -b ai-transcription
```

After those branches are merged, create smaller branches for later tasks, such as:

```text
frontend-hints
frontend-chemistry
judge-algebra-expansion
judge-chemistry
ai-hints
transcription-testing
demo-bugfixes
```

Branches should focus on one clear piece of work rather than remaining open for the entire project.

---

# 6. Pull Request Expectations

Every pull request should include:

* What was changed
* Why it was changed
* How to run or test it
* Any files or behavior that may affect teammates
* A screenshot or example response when relevant

A simple pull request description could look like:

```text
Added canvas stroke capture and PNG export.

How to test:
1. Run the frontend.
2. Draw inside the canvas.
3. Press Finish Line.
4. Confirm that a PNG preview appears.

This does not yet call the transcription endpoint.
```

At least one teammate should confirm that the pull request runs before it is merged.

---

# 7. Ownership Section for PROJECT_NOTES.md

Add the following section to `PROJECT_NOTES.md`:

## Ownership

### Person 1 — Frontend and Ink

Owns:

```text
frontend/
```

Responsibilities:

* Canvas
* Stylus capture
* Segmentation
* PNG export
* User interface
* Displaying verdicts and hints

### Person 2 — Backend and Judges

Owns:

```text
backend/judge/
backend/main.py
```

Responsibilities:

* FastAPI routing
* Algebra judge
* Chemistry judge
* SymPy
* RDKit
* Judge testing

### Person 3 — AI and Testing

Owns:

```text
backend/transcription.py
backend/hints.py
tests/transcription/
```

Responsibilities:

* Gemini transcription
* Prompt testing
* Hint generation
* Handwriting failure analysis
* Student testing

### Shared Files

Shared files such as:

```text
backend/schemas.py
README.md
PROJECT_NOTES.md
```

should not be changed without notifying the rest of the team.

---

# 8. Immediate Next Steps

Before starting additional feature work:

1. Make sure nobody is committing directly to `main`.
2. Make sure each person creates their own branch.
3. Add the ownership section to `PROJECT_NOTES.md`.
4. Confirm that `/transcribe` appears in FastAPI `/docs`.
5. Test `/transcribe` with one sample image.
6. Connect the frontend PNG export to `/transcribe`.
7. Connect the transcription result to `/check`.
8. Get one complete algebra example working before expanding the scope.

The highest-priority objective is still the project spine:

```text
Stroke in
→ Transcription
→ Verdict out
```

Everything else should come after that works.
---

# 13. Status Update and Expanded Roadmap (July 19, 2026)

This section reflects what has actually been built and lays out a more
ambitious, more detailed plan than the original week-by-week sketch above.
Nothing above this line has been edited; where this section disagrees with
older sections, this section is current.

## 13.1 Corrections to earlier sections

- **Transcription model is Gemini 2.5 Flash via Vertex AI**, not Claude.
  Auth is Application Default Credentials through the gcloud CLI — never
  raw API keys. Cost per transcribed line is a fraction of a cent
  (thinking disabled, output capped at 64 tokens, temperature 0).
- **Hints are deterministic templates, not an AI call.** This is stronger
  than the original plan: the hint generator only ever receives a line
  number and an error category — it never sees the solution, the judge's
  internal detail, or the student's actual math — so it *structurally
  cannot* leak an answer. Zero cost, zero latency, zero hallucination
  risk. An AI-phrased layer can be added later on top of the same
  categories if we want friendlier wording.
- **The project lives in a shared 30-student GCP project** (`cs-sail-2b08`).
  Billing there includes many other workloads; CheckMate's own usage is
  cents. Long-term: move to a dedicated project with a budget alert.

## 13.2 What is DONE (verified working, July 19)

The full spine works end to end, plus most of Week 2:

- Canvas with stylus capture, palm rejection, coalesced pointer events.
- Row-based line segmentation with on-canvas debug boxes.
- Ruled lines drawn light-blue and thin, deliberately subordinate to ink
  (dark ruling was being misread by the vision model as `=`/`-` marks).
- Clean per-line PNG export (crop + paper background, debug overlay
  excluded) wired to `/transcribe` via a Finish Line button.
- `/transcribe`: Gemini 2.5 Flash, deterministic config, prompt hardened
  against ruled-line confusion and LaTeX/Greek output; output normalized
  (unicode minus/×/÷/superscripts → ASCII); explicit `unreadable` flag;
  invalid PNGs return 422 and service failures return a safe 503 without
  exposing credentials or provider internals.
- `/check`: SymPy equivalence checking with **deterministic error
  classification**. Proven mistakes can be categorized as `sign`,
  `division`, `distribution`, `arithmetic`, or generic `algebraic`.
  Unsupported and unparseable input are separate statuses and never count
  as a student mistake. Ambiguous causes stay generic rather than being
  guessed.
- `/hint`: three-level ladder (where to look → mistake type → concept),
  per-category templates matching every judge category, fallbacks for
  unknown categories, answer-leak tests in CI.
- Frontend verdict display: green for valid, red for confirmed mistakes,
  amber for unsupported/unparseable input, plus a red underline on flagged
  lines. A side panel lists every transcribed line with an
  **editable text field** — a misread line is a one-second typed fix that
  re-runs the (free) checker, which is also the demo safety net.
- 89 backend tests passing (judge scope, API contracts, transcription error
  handling, classification, and hint safety).
- Transcription failure log with real handwriting samples and identified
  patterns (`backend/tests/transcription/failures.md`).

## 13.3 Known caveats (honest list, check before demo)

- Error classification is ordered: sign is tested before distribution and
  exact one-side scaling. A mistake that fits no provable pattern stays
  `algebraic`; the checker does not invent a more specific cause.
- The distribution check requires the parenthesized form to still be the
  current reference line; once a student validly expands, later steps
  can't be classified as distribution errors (correct behavior, worth
  knowing).
- The `division` classifier only runs on single-variable linear steps.
- Segmentation is row-based: writing that drifts across ruled rows
  mis-groups. The pen-lift + vertical-gap rule from section 4 is NOT yet
  implemented — rows only.
- Multi-line rework: re-finishing a row replaces that row's transcription
  silently. There is no undo.
- Degenerate equations such as `12 = 12` are kept as equation objects instead
  of being auto-collapsed to booleans. Exponents, nonlinear work,
  multivariable equations, functions, and variable denominators are reported
  as `unsupported`; these boundaries have regression tests.
- The problem is still *typed* into a box, not handwritten (deliberate
  decision, July 18 — revisit only after student testing).

## 13.4 Expanded roadmap — algebra depth first, then breadth

### Milestone A — "Every mistake gets a precise hint" (Person 2 + 3)

- Judge: classify more mistake types deterministically:
  - combining unlike terms (`3x + 2 = 5x`)
  - dropped term (a term present in ref vanishes with no operation)
  - swapped sides without negation
  - multiplying only one side
- Judge: support fractions and decimals robustly (`x/2 + 3 = 7`,
  `0.5x = 4`), including classifying "cleared the fraction wrong."
- Judge: two-variable linear systems (substitution steps) — stretch.
- Hints: per-category level-1 variants that reference the *operation*
  between the two lines ("you subtracted something from both sides —
  check what you subtracted") — still template-only, still no values.
- Hint quality tests: for every classified category, an automated test
  asserting the hint never contains any token from the student's work.

### Milestone B — "The canvas feels like paper" (Person 1)

- Implement true pen-lift + vertical-gap segmentation (section 4's rule),
  replacing pure row-bucketing; keep rows as a fallback.
- Auto-finish: a line is sent automatically after N seconds of pen
  inactivity below it (no button press) — the button stays as backup.
- Active-line highlight while writing; subtle checkmark animation on a
  green verdict.
- Undo last stroke; erase mode; stroke smoothing (quadratic curves
  through coalesced points).
- Tablet testing over LAN (laptop IP + port on iPad/Samsung browser);
  document touch-action/pressure quirks per device.

### Milestone C — "Trustworthy transcription" (Person 3)

- Confidence surfacing: prompt Gemini for a per-line confidence token;
  below threshold, the UI pre-focuses the correction field.
- Failure-driven prompt iteration: every new failure goes into
  `failures.md` with expected/actual; prompt changes must cite which
  failure they fix and must not regress the sample set.
- Batch re-run harness against the sample folder with a diff report
  (already exists: `tests/transcription/run_samples.py`).
- Latency measurement: log server-side transcription time per call;
  target < 2s p95 on shared WiFi.
- Fallback path: if `/transcribe` errors twice in a row, the UI offers
  typed input for the line automatically (backup for live demo).

### Milestone D — "More than one problem" (team)

- Problem presets: a dropdown of rehearsed demo problems (each with known
  solution path and known judge coverage) instead of free typing.
- Multi-problem sessions: Clear becomes "next problem," with a session
  summary (lines written, mistakes made, hints used).
- Per-student session log (JSON download) — the seed of the
  teacher/parent visibility feature in section 3.

### Milestone E — Chemistry (unchanged from section 4/8 plan, after A–C)

- RDKit judge behind the same `Judge` interface; MolScribe or Gemini
  vision for structure recognition; narrow rehearsed molecule set only.

## 13.5 Working agreements added this week

- No live Gemini calls for plumbing/wiring tests — stub or use recorded
  samples; real calls only for genuine transcription-quality testing.
- All work goes through feature branches and PRs (current branch:
  `ai-transcription`); cross-ownership edits are allowed when they
  unblock the spine but must be called out in the PR description so the
  owner reviews them.
- `backend/schemas.py` changes are additive-only where possible and are
  announced in the PR that needs them.
