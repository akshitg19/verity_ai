# VerityAI Handwriting v2 — Complete Handoff

**Handoff date:** 2026-08-14  
**Status:** Architecture documentation and recognition foundation implemented
and reviewed; provider-aware finalization and vector-provider POC remain  
**Working branch:** `feat/handwriting-architecture-v2`  
**Base:** `origin/main` at `786f4b6`  
**Working tree:** `/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2`

## 1. Executive summary

VerityAI currently captures good digital ink data but uses it through a slow
image pipeline:

```text
raw strokes {x,y,t,p}
  -> wait 1500ms
  -> crop/render PNG
  -> Base64 JSON
  -> Gemini 2.5 Flash transcription
  -> deterministic SymPy/RDKit/custom judge
  -> UI verdict
```

The agreed target is a hybrid recognition architecture:

```text
raw vector strokes
  -> stable logical expression grouping
  -> incremental vector recognizer
  -> normalized LaTeX/JIIX/ASCII
  -> deterministic judge

If vector recognition cannot produce usable transcription:
  -> render PNG
  -> image-model fallback
  -> same normalizer and deterministic judge
```

The recognition abstraction and Gemini-compatible foundation have been
implemented. Default behavior remains Gemini-only, so the refactor is intended
to be production-compatible. MyScript and GPT-5.6 Luna are candidates, not
working integrations yet.

The remaining user-visible latency work begins with Phase 2: replacing the two
fixed 1500ms timers with provider-aware finalization and adding bounded
recognition concurrency. The current branch intentionally does not claim that
latency has already improved.

## 2. Workspace and Git state

The original repository worktree is:

```text
/Users/anyixin/Desktop/VerityAI/verity_ai
branch: agent/frontend-reliability-ux
```

It contains unrelated, uncommitted landing-page changes:

```text
M  frontend/src/landing/Landing.jsx
M  frontend/src/landing/NotebookMock.jsx
M  frontend/start-frontend.sh
?? frontend/src/landing/ArchitectureDiagram.jsx
?? frontend/src/landing/TechStackRoulette.jsx
?? frontend/src/landing/landing.css
```

That branch was also 80 commits behind `origin/main` when inspected. It was not
modified, stashed, merged, or overwritten.

To isolate handwriting work, a separate worktree was created:

```text
/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2
branch: feat/handwriting-architecture-v2
tracking: origin/main
base commit: 786f4b6
```

The Phase 0/1 handwriting work is contained in the first handwriting-v2 commit:

```text
M  backend/tests/test_transcription.py
M  backend/transcription.py
M  frontend/src/math/useMathWorkflow.js
?? docs/handwriting/
?? frontend/src/recognition/
```

The obsolete `verity_ai-frontend-polish` worktree was removed on 2026-08-14
after verifying that it was clean and its branch was already an ancestor of
`origin/main`. Its branch and commits remain recoverable in Git.

## 3. Product and architecture decisions from the discussion

### 3.1 Recognition and judgment remain separate

```text
MyScript/Gemini/Luna:
  What did the student write?

SymPy/RDKit/OPSIN/custom judges:
  Is that recognized work correct?
```

The recognizer must never secretly select the candidate that makes the student's
answer correct. A wrong but successfully recognized answer goes directly to the
judge and receives an appropriate verdict.

### 3.2 Use a hybrid recognition path

The recommended production direction is:

```text
Vector primary
  MyScript iink candidate

Image fallback
  Gemini initially
  GPT-5.6 Luna as a benchmark candidate

Deterministic judgment
  existing SymPy/RDKit/custom engines
```

“Fallback” means a one-time backup route used only when the primary recognition
path times out, fails, returns unreadable/empty content, uses an unsupported
format, or cannot be normalized/parsed.

Production must not permanently call multiple image models for every expression.
Temporary shadow mode may compare providers while only the control provider
affects the user.

### 3.3 Do not remove logical line/expression grouping

The old timer-driven concept is no longer the target:

```text
wait until a line is done -> crop it to PNG
```

But stable expression identity remains required for:

- solution-step order;
- first-wrong-line feedback;
- row-to-verdict mapping;
- edits and erasing;
- undo/redo;
- notebook persistence;
- cancellation and stale-response rejection.

MyScript should eventually understand the two-dimensional structure inside one
expression: fractions, superscripts, subscripts, radicals, bounds, and matrices.
Those structures must not be split into separate judged steps merely because
their y coordinates differ.

### 3.4 Keep SymPy and RDKit

SymPy and RDKit are not the current handwriting-latency bottleneck. They remain
the primary deterministic engines.

Potential future supplements are capability-specific:

- Sage/Maxima only for clearly unsupported advanced mathematics;
- OPSIN for systematic chemical name-to-structure;
- Open Babel for additional chemistry format conversion;
- existing VerityAI judges for balancing, stoichiometry, acid/base, redox,
  quantities, significant figures, and other domain rules.

No engine-voting system is planned for judgment.

### 3.5 Provider conclusions

#### MyScript iink

Recommended first vector POC because it accepts digital ink and supports
structured two-dimensional math, incremental recognition, LaTeX/JIIX export,
fractions, roots, scripts, integrals, and matrices.

Important limitation: the Web integration is server-backed and still depends on
network, credentials, licensing, and measured browser/device behavior.

The first POC should preserve the VerityAI canvas and send existing strokes to a
backend adapter. Do not replace the entire canvas with a vendor editor first.

#### Google ML Kit

Better than Apple Scribble if those are the only two native POC choices because
it exposes a digital-ink input and candidates. However, its official Digital Ink
API is native Android/iOS rather than a direct React Web solution, and it is not
the preferred choice for complex two-dimensional math.

#### Apple Scribble

Designed primarily to insert handwriting into native UIKit text-input elements.
It is not the preferred general-purpose math-stroke recognizer for VerityAI.

#### Gemini

Keep as the initial image fallback because the current implementation and corpus
already exist. Do not remove its PNG path until vector accuracy and fallback
rates justify removal.

#### GPT-5.6 Luna

Technically supports image input and structured output. It may be evaluated as
an image fallback, but there is no VerityAI handwriting evidence that it is
better than Gemini. Benchmark it on difficult fallback samples rather than
assuming model-family superiority.

## 4. Verified current code state on latest main

The following facts were verified directly against `origin/main`:

- `frontend/src/canvas/useCanvas.js` captures points as `{x, y, t, p}`.
- `useCanvas.js` still contains two 1500ms `rowIdleTimerRef` paths.
- Stable row keys and row versions already protect recognition snapshots.
- `frontend/src/math/useMathWorkflow.js` originally imported both
  `renderLineToPng` and `transcribeLine` and processed rows serially.
- `frontend/src/canvas/render.js` crops and renders row strokes to PNG.
- `frontend/src/api.js` sends Base64 PNG JSON to `/transcribe`.
- `backend/transcription.py` uses Gemini 2.5 Flash by default.
- Notebook persistence retains stroke objects and supports legacy strokes with
  only finite x/y points.
- The backend already includes SymPy, RDKit, and py2opsin.

## 5. Documentation created

The source-of-truth set is under `docs/handwriting/`:

| File | Purpose |
|---|---|
| `README.md` | Index, current status, and AI working agreement |
| `architecture-v2.md` | Responsibilities, contracts, provider strategy, metrics, privacy, rollout |
| `implementation-plan.md` | Phase-by-phase work and acceptance criteria |
| `evaluation-plan.md` | Corpus, metrics, experiment protocol, and provider decision gates |
| `fixtures/fixture.schema.json` | Machine-readable evaluation fixture schema |
| `fixtures/cases.example.jsonl` | Three synthetic example records |
| `fixtures/README.md` | Consent, retention, and storage rules |

The older workspace-level `handwriting_architecture_handoff.md` is historical
context. This directory is the current source of truth because it corrects the
oversimplified “remove all line segmentation” recommendation and distinguishes
candidate providers from tested integrations.

## 6. Code implemented

### 6.1 Recognition result and error contract

`frontend/src/recognition/recognitionTypes.js` defines:

- supported formats: ASCII, LaTeX, JIIX;
- fallback reason constants;
- typed `RecognitionError`;
- cancellation helpers;
- provider-result normalization;
- `formatSupported` handling so unknown formats cannot silently become ASCII.

Normalized result shape:

```js
{
  text,
  format,
  formatSupported,
  candidates,
  source,
  provisional,
  unreadable,
  parseable,
  fallbackUsed,
  fallbackReason,
  latencyMs,
  timings
}
```

### 6.2 Recognizer adapter

`frontend/src/recognition/RecognizerAdapter.js` defines the base contract and
runtime recognizer validation.

Conceptual request:

```js
recognize({
  strokes,
  expressionId,
  expressionVersion,
  pageId,
  writingArea,
  topic,
  previousText,
  signal,
  onProvisional
})
```

Not every provider uses every optional field yet.

### 6.3 Gemini image adapter

`frontend/src/recognition/GeminiImageRecognizer.js` now owns:

```text
strokes
  -> renderLineToPng
  -> validate/extract Base64 PNG
  -> transcribeLine
  -> normalized recognition result
```

This removes image-provider details from the math workflow while preserving the
existing backend contract.

### 6.4 Hybrid router

`frontend/src/recognition/HybridRecognizer.js`:

- runs a configured primary recognizer;
- uses a bounded primary timeout;
- propagates caller cancellation;
- calls fallback at most once;
- records an explicit fallback reason;
- does not receive a judge verdict and therefore cannot fallback because the
  answer is wrong.

Fallback reasons currently include:

```text
empty
timeout
service_error
unreadable
unparseable
unsupported_format
```

### 6.5 Shadow router

`frontend/src/recognition/ShadowRecognizer.js` runs the candidate without letting
candidate output alter the control result. Candidate failures are reported to an
optional observer and do not break the user's control path.

No production candidate provider is configured yet.

### 6.6 Configuration

`frontend/src/recognition/recognitionConfig.js` defines:

```text
VITE_HANDWRITING_MODE=gemini
VITE_HANDWRITING_MODE=shadow
VITE_HANDWRITING_MODE=hybrid
```

Safe behavior:

- Gemini is the default.
- Shadow/hybrid without a configured primary safely return the Gemini adapter.
- No fake MyScript endpoint is called.

Initial hypothesis values are documented:

```text
VECTOR_QUIET_PERIOD_MS = 350
IMAGE_QUIET_PERIOD_MS = 750
DEFAULT_RECOGNITION_TIMEOUT_MS = 3000
```

The quiet-period values are not wired into `useCanvas` yet; that is Phase 2.

### 6.7 Privacy-safe recognition metrics

`frontend/src/recognition/recognitionMetrics.js` records provider/mode/version
and stage durations. Its allowlist drops raw strokes, recognized text, problem
content, and page identifiers.

Current adapter stages:

```text
recognition_queued
png_encode_start
png_encode_end
request_start
transcription_received
normalization_finished
```

Pointer and judge lifecycle metrics still need Phase 2 integration.

### 6.8 Math workflow refactor

`frontend/src/math/useMathWorkflow.js` now accepts an injectable recognizer and
defaults to the configured Gemini adapter.

It no longer directly imports:

```js
renderLineToPng
transcribeLine
```

Existing request IDs, AbortController, page scope, row version checks, ordered
line updates, and deterministic recheck behavior remain.

### 6.9 Gemini client reuse

`backend/transcription.py` wraps `_create_client` in an `lru_cache(maxsize=1)`.
The shared client is reused by transcription and the existing model helper while
keeping tests able to patch/clear it.

## 7. Tests added

New recognition tests cover:

- result normalization;
- unreadable handling;
- cancellation before work;
- PNG rendering/API encapsulation;
- cancellation during PNG encoding;
- hybrid success without fallback for a wrong answer;
- one-shot fallback for unreadable, empty, unparseable, unknown-format, timeout,
  and service-error conditions;
- no fallback on caller cancellation;
- safe mode defaults;
- shadow candidate isolation;
- privacy allowlisting for metrics;
- backend Gemini client reuse.

## 8. Validation evidence

Frontend:

```text
34 test files passed
348 tests passed
ESLint passed
Vite production build passed
```

Backend:

```text
1185 tests passed
3 expected xfailed
3 existing OPSIN warnings
```

Documentation and fixtures:

```text
5 Markdown files validated for relative links
fixture schema JSON parsed
3 JSONL examples parsed and checked for required fields
git diff --check passed for tracked changes
```

During `npm ci`, npm reported one high-severity dependency advisory already
present in the lockfile. No automatic `npm audit fix` was run because dependency
upgrades are outside this handwriting change and can be breaking.

## 9. What is deliberately not finished

### User-visible latency is not improved yet

The two 1500ms timer paths remain in `useCanvas.js`. The recognition adapter
refactor is architectural preparation. Do not report 300–500ms latency until it
is measured on a working vector path.

### No MyScript integration

There is no MyScript credential, backend route, REST/WebSocket client, LaTeX/JIIX
normalizer, or measured result. A clean adapter boundary exists for the POC.

### No Luna integration

GPT-5.6 Luna remains an image-fallback benchmark candidate. No OpenAI API key,
request path, prompt, or production dependency was added.

### No recognition concurrency change

Math row processing remains serial. Bounded concurrency belongs in Phase 2 and
must retain ordered judgment and stale-version safety.

### No row-model rewrite

Stable row grouping remains unchanged. Fractions, scripts, radicals, matrices,
and out-of-order editing need fixtures before relaxing row-height rules.

### No chemistry routing change

Written chemistry and molecular structures still use their existing paths.
They require separate recognition evaluation.

## 10. Next implementation phase: provider-aware finalization

Phase 2 should be a separate reviewable change.

### Required work

1. Replace both 1500ms literals with named, provider-aware policies.
2. Preserve immediate previous-row finalization when writing moves to a new row.
3. Preserve explicit Read Page/submit finalization.
4. Add a provisional-recognition hook without judging provisional results.
5. Increment expression versions and abort stale work on every relevant edit.
6. Add at most two concurrent recognition workers.
7. Commit recognized lines in row order before deterministic judgment.
8. Add pointer-to-recognition-to-paint metrics.
9. Test fractions, superscripts, subscripts, erase, undo, navigation, and
   duplicate-judgment prevention.

### Important timing rule

Do not use one universal timer for every provider:

```text
vector path:
  recognition can start after each stroke;
  quiet period helps finalization only

image path:
  batch request should wait longer to avoid repeatedly sending incomplete ink
```

Initial timing hypotheses:

```text
vector quiet period: 350ms
image quiet period: 750ms
```

Tune these with real metrics rather than treating them as final product truth.

### Phase 2 acceptance

- No unexplained 1500ms literal remains.
- Existing Gemini corpus accuracy does not regress.
- No stale recognition can paint after edit/navigation.
- No expression version is judged more than once.
- Bounded recognition concurrency cannot reorder judge input.
- Frontend tests, lint, and build pass.
- Backend suite remains green if backend code changes.

## 11. MyScript POC after Phase 2

Preconditions:

- MyScript credentials and licensing review;
- backend secret-storage decision;
- consented fixture corpus;
- normalization contract for LaTeX/JIIX;
- approved provider privacy policy.

Recommended POC scope:

```text
one linear-equation topic
existing VerityAI canvas
raw strokes {x,y,t,p}
backend MyScript adapter
LaTeX/JIIX normalization
existing deterministic judge
internal feature flag only
```

Do not begin by replacing the full canvas/editor.

POC dataset should include at least 300–500 expressions across writers and
target devices, with fractions, exponents, ambiguous symbols, edits, and writing
quality variation.

The vector provider becomes primary only if category-level exact match,
parse-success rate, latency, privacy, licensing, and fallback-rate gates pass.

## 12. Image fallback evaluation

After MyScript generates real failure cases, compare Gemini and GPT-5.6 Luna on
that hard distribution.

Measure:

- normalized exact match;
- parser success;
- symbol error rate;
- unreadable precision/recall;
- p50/p95 latency;
- timeout/error rate;
- cost per 1,000 fallback expressions.

Accuracy and parse success should decide the fallback first; small cost
differences are secondary because fallback traffic should be rare.

## 13. Local development commands

Frontend:

```bash
cd /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2/frontend
npm ci
npm run dev
```

Vite normally serves at:

```text
http://localhost:5173
```

Frontend verification:

```bash
npm test
npm run lint
npm run build
```

Backend verification using the existing virtual environment:

```bash
cd /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2/backend
/Users/anyixin/Desktop/VerityAI/verity_ai/backend/venv/bin/python -m pytest -q
```

Review the work:

```bash
cd /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2
git status --short --branch
git diff -- backend/transcription.py backend/tests/test_transcription.py \
  frontend/src/math/useMathWorkflow.js
```

New untracked files can be reviewed with:

```bash
find docs/handwriting frontend/src/recognition -type f -print | sort
```

## 14. Recommended AI-assisted workflow

Use one phase per implementation pass:

```text
architect/plan
  -> implement one phase
  -> run focused and full tests
  -> independent review pass
  -> benchmark/evaluate
  -> update source-of-truth docs
```

Use a fresh review context to look specifically for:

- stale-response races;
- fallback loops;
- duplicate judgment;
- answer leakage;
- erased/undone ink reappearing;
- page navigation races;
- raw handwriting in logs;
- secrets in frontend bundles;
- false claims that untested providers work.

Continuation prompt:

```text
Work in /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2 on branch
feat/handwriting-architecture-v2.

Read docs/handwriting/HANDOFF.md, README.md, architecture-v2.md,
implementation-plan.md, and evaluation-plan.md. Inspect the current code and
tests. Implement only Phase 2: provider-aware finalization, provisional
recognition hooks, bounded two-row recognition concurrency, and end-to-end
latency stages.

Preserve stable row/expression identity, version guards, cancellation, ordered
deterministic judgment, Gemini compatibility, unrelated work, and privacy
boundaries. Do not integrate MyScript or GPT-5.6 Luna in this phase. Add tests
for timer policies, edits, erase/undo, page navigation, fractions/scripts, stale
responses, ordering, and duplicate judgment. Run frontend tests, lint, build,
and relevant backend tests. Update implementation-plan.md with evidence and
remaining risks. Do not claim latency improvement without measurements.
```

## 15. Reference links

- MyScript iink Web documentation:
  `https://developer.myscript.com/docs/interactive-ink/latest/web/iinkts/`
- MyScript math elements and rules:
  `https://developer.myscript.com/docs/interactive-ink/latest/overview/math-elements-and-rules/`
- Google ML Kit Digital Ink:
  `https://developers.google.com/ml-kit/vision/digital-ink-recognition`
- Apple handwriting recognition:
  `https://developer.apple.com/documentation/uikit/handwriting-recognition`
- GPT-5.6 Luna model page:
  `https://developers.openai.com/api/docs/models/gpt-5.6-luna`
- SymPy solvers:
  `https://docs.sympy.org/latest/guides/solving/index.html`
- RDKit documentation:
  `https://rdkit.org/docs/RDKit_Book.html`

## 16. Final handoff state

Safe to review now:

- architecture decisions are documented;
- fixture/evaluation structure exists;
- math workflow is provider-decoupled;
- Gemini remains the safe default;
- hybrid and shadow routing are tested;
- client reuse is implemented;
- all current frontend/backend validation passes.

Not safe to claim yet:

- MyScript works;
- PNG is no longer used;
- the 1.5-second delay is gone;
- final handwriting latency is 300–500ms;
- Luna is better than Gemini;
- complex chemistry or full undergraduate math is supported.

The next change should implement Phase 2 separately before starting the
MyScript POC.
