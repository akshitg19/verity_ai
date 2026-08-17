# VerityAI Handwriting v2 — Complete Handoff

**Handoff date:** 2026-08-17

**Status:** Safe provider-neutral foundations, disabled MyScript integration,
and one-shot REST submission scheduling are merged through PR #65. The
default-off Google ID-token identity boundary is merged through PR #67 and
validated locally, in PR CI, in post-merge `main` CI, and in a production
frontend smoke. It is not configured, security-approved, or exercised with a
real account. Current
disabled-deployment evidence is merged through PR #63. The 50-call v1
smoke/probe and separate
300-call v2 synthetic diagnostic completed with no production flag change; the
v2 run had 300/300 provider successes, 95.00% overall exact match, 96.33% parse
success, and zero ledger/dashboard discrepancy. These corpora remain
single-reviewer and decision-ineligible, so the provider decision is still
`NO_DECISION`. Current Cloud Run revision `verity-ai-00022-2vj` deploys exact
runtime source `3b1ca95c91e6da62ba8ca3c0dc42cea00a91bb83` and remains fully disabled; the repeatable verifier
returned `PASS`. Target-device, eligible decision-corpus,
privacy/legal, real-authentication approval/configuration, same-input control,
and enabled-canary evidence remain unavailable. PR #59 repaired and hardened
the internal Gemini
scheduling comparison so 3–5 anonymous paired device sessions can now produce
strict, content-free, machine-checked evidence rather than unverified exports.

**Resume branch:** `main`

**Deployed runtime source:** `3b1ca95c91e6da62ba8ca3c0dc42cea00a91bb83`

**Current deployment build/revision:**
`37fec1f2-8ed5-43dd-b1aa-d004e32bc760` / `verity-ai-00022-2vj`

**Current repository / Vercel frontend:** PR #68 at `3b1ca95`

**Working tree:** `/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal`

The current requirement-by-requirement status and named external unblock package
are maintained in `completion-audit-2026-08-16.md`. Treat that audit as the
authoritative completion checkpoint rather than inferring readiness from a green
CI run or the synthetic POC alone.

> Historical note: references below to `feat/handwriting-architecture-v2` and
> `/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2` describe the
> already-merged Phase 0–2 work. That temporary worktree was removed after PR
> #31 merged and must not be treated as the continuation location.

## 1. Executive summary

Before Phase 2, VerityAI captured good digital ink data but used it through a
slow image pipeline:

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

The recognition abstraction, Gemini-compatible foundation, and Phase 2
finalization/concurrency work are implemented. Default behavior remains
Gemini-only and now uses a named 750ms batch-image quiet period. A future
incremental vector provider receives a 350ms finalization policy and may produce
per-stroke provisional output that never reaches the judge.

The merged Phase 2 implementation removes the fixed 1500ms gate and serial
recognition queue, but it
does not claim a measured 300–500ms result. Target-device latency and live
corpus measurements remain outstanding. MyScript now has a mock-tested backend
adapter and disabled internal route. Direct vector-only frontend wiring is
merged behind two independent frontend gates, but there is no live integration;
GPT-5.6 Luna remains only a candidate. MyScript account/key/secret setup is
complete, and `provider-readiness.md` records the contractual and privacy
blockers that prevent student traffic.

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

That branch was 83 commits behind `origin/main` when re-verified on 2026-08-14.
It was not modified, stashed, merged, or overwritten.

The Phase 0–2 work used this historical worktree:

```text
/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-v2
branch: feat/handwriting-architecture-v2
tracking: origin/main
base commit: 786f4b6
```

The Phase 0/1 handwriting work was committed separately:

```text
317dee3 Build handwriting recognition adapter foundation
```

Phase 2 followed it and both changes were merged by PR #31 at `cfa06e0`. The
historical worktree was then removed. Current continuation work is isolated in
`/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal`; Phase A/B was
merged by PR #32 at `156d724`, and provider readiness/offline evaluation was
merged by PR #33 at `e01d28e`. The backend adapter was merged by PR #34 at
`949e1ea`, and the dual-gated frontend POC boundary was merged by PR #35 at
`5e40375`. The durable ledger, evaluation checkpoint, disabled deployment,
numeric secret-version guard, and runtime evidence were subsequently merged
through PR #40 at `c90a935`. The clean continuation worktree is on `main`; the
dirty landing-page worktree remains intact.

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

## 4. Verified baseline and Phase 2 branch state

The following baseline facts were verified directly against `origin/main` at
`786f4b6`:

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

On the handwriting branch after Phase 2:

- the two 1500ms literals are removed from the readiness path;
- Gemini/image recognition uses the named 750ms policy;
- an incremental vector recognizer may use a 350ms final quiet period and
  receive immediate per-stroke provisional requests;
- recognition runs with at most two workers;
- one concurrent wave is committed in row order and judged from one final-only
  snapshot;
- edits, undo/redo, clear, and page navigation invalidate or abort stale work;
- lifecycle metrics span pointer-up, readiness, recognition, judge, and the
  next painted frame without including content or page identifiers.

## 5. Documentation created

The source-of-truth set is under `docs/handwriting/`:

| File | Purpose |
|---|---|
| `README.md` | Index, current status, and AI working agreement |
| `architecture-v2.md` | Responsibilities, contracts, provider strategy, metrics, privacy, rollout |
| `implementation-plan.md` | Phase-by-phase work and acceptance criteria |
| `evaluation-plan.md` | Corpus, metrics, experiment protocol, and provider decision gates |
| `myscript-public-terms-checkpoint-2026-08-16.md` | Current public pricing/license/DPA facts and the reduced written-confirmation package |
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

The values are wired into `useCanvas` through a provider-derived finalization
policy. Gemini remains the image-policy default.

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

Phase 2 additionally records pointer-up, expression-ready, recognition start
and finish, judge start and finish, and result-painted stages. Both trace
creation and the browser event boundary enforce the content-free allowlist.

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

### 6.10 Provider-aware finalization

`frontend/src/recognition/finalizationPolicy.js` owns the named image and vector
quiet periods. Canvas timers are row-scoped, are cancelled on edits/navigation,
and are flushed immediately by Enter, Check Line, or Read Page. Starting a
lower row still finalizes the prior row without waiting for its timer.

### 6.11 Bounded recognition coordinator

`frontend/src/recognition/RecognitionCoordinator.js` runs at most two jobs,
supersedes stale versions, separates provisional results from final commits,
and batches a concurrent final-recognition wave into one row-sorted judge
snapshot. A page change or clear aborts all active jobs.

### 6.12 Two-dimensional grouping and provisional UI

The structured-expression height ceiling now accommodates tested fractions,
superscripts, and subscripts without removing stable row identity. Provisional
text is held separately from finalized `lines`, displayed as reading progress,
and never passed to `checkSteps`.

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
- 350ms vector and 750ms image finalization policies;
- two-worker concurrency with both completion orders;
- one ordered judge snapshot per concurrent wave;
- provisional output isolation from finalized lines and judgment;
- stale recognition and judge abort on edit/page navigation;
- Enter finalization and timer cancellation;
- fraction, superscript, subscript, erase, undo, and redo invalidation behavior.

## 8. Validation evidence

Frontend:

```text
38 test files passed
368 tests passed
ESLint passed
Vite production build passed
App.jsx line cap passed (254/260)
```

Backend:

```text
1185 tests passed
3 expected xfailed
3 existing OPSIN warnings
```

Documentation and fixtures:

```text
6 Markdown files validated for relative links
fixture schema JSON parsed
3 JSONL examples parsed and checked for required fields
git diff --check passed for tracked changes
```

During `npm ci`, npm reported one high-severity dependency advisory already
present in the lockfile. No automatic `npm audit fix` was run because dependency
upgrades are outside this handwriting change and can be breaking.

## 9. What is deliberately not finished

### Target-device latency is not measured yet

The fixed 1500ms gate is gone and the Gemini batch policy is now 750ms, but no
claim should be made about end-to-end p50/p95 improvement until the lifecycle
events are measured on target tablets. The 300–500ms target still requires a
working vector provider.

### Live adapter smoke complete; deployed integration remains disabled

The MyScript developer application and credentials exist. The credentials remain
only in the local ignored secret file and two GCP Secret Manager secrets; the
Cloud Run runtime service account has accessor permission. A backend protocol
client, typed route, shared normalizer, and Cloud Run secret mapping are merged
and deployed in disabled revision `verity-ai-00022-2vj`; both provider and route
flags are false. Runtime metadata proves the expected service account and the
two numeric version-`1` Secret Manager references without reading their values;
see `secret-version-pinning-evidence-2026-08-16.md`. A direct vector-only
frontend POC adapter is implemented behind two additional false-by-default gates;
it has no automatic image fallback. A local synthetic-only runner made 50/50
successful live REST calls under the exhausted durable cap. The initial
30-case set reached 86.67% exact/parse under normalization `v2`; the paired
20-case `x/X` probe reached 100% for explicit lowercase x-height and 90% for
full-height `x`. See
`myscript-synthetic-poc-2026-08-16.md`. This result did not enable the deployed
route or establish a provider decision. The route additionally requires
the existing API access-control header before it can open. Provider/legal
evidence, offline evaluation harness, and rollback procedure are in
`provider-readiness.md`, `fixtures/README.md`, `provider-evaluation-report.md`,
and `rollout-runbook.md`.

### No Luna integration

GPT-5.6 Luna remains an image-fallback benchmark candidate. No OpenAI API key,
request path, prompt, or production dependency was added.

### No provider decision corpus

The repository now has 30 deterministic vector smoke fixtures and 20 paired
synthetic `x/X` geometry fixtures, but not the required 300–500 consented,
two-reviewer decision fixtures. No
same-input Gemini control or target-device benchmark has been run.

### No general row-model rewrite

Stable row grouping remains. The height ceiling was relaxed only enough for
tested fractions and scripts; matrices, radicals, and out-of-order editing still
need real fixtures before broader grouping changes.

### No chemistry routing change

Written chemistry and molecular structures still use their existing paths.
They require separate recognition evaluation.

## 10. Phase 2 completion and next phase

Phase 2 is implemented as a separate reviewable change after the Phase 0/1
commit.

### Completed work

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

### Phase 2 acceptance evidence

- No unexplained 1500ms literal remains.
- The Gemini adapter contract and all existing deterministic suites remain
  green; a billed live corpus rerun is still an explicit measurement task.
- No stale recognition can paint after edit/navigation.
- No expression version is judged more than once.
- Bounded recognition concurrency cannot reorder judge input.
- Frontend tests, lint, and build pass.
- The backend contract is unchanged and the complete backend suite remains
  green.

The Phase 3 technical smoke is complete. The next provider-decision work is a
reviewed target-device corpus and same-input Gemini control. Student data and
production distribution still require privacy/legal, consent, retention,
authentication, and commercial approval.

## 11. MyScript POC after Phase 2

Completed synthetic-smoke preconditions:

- explicit approval for at most 50 free-trial attempts;
- synthetic-only fixture data with MyScript-specific permission;
- backend secret-to-environment mapping and adapter;
- owner-only repository-external attempt ledger and raw artifacts;
- normalization contract for LaTeX.

Recommended POC scope:

```text
one linear-equation topic
existing VerityAI canvas
raw strokes {x,y,t,p}
backend MyScript adapter
LaTeX normalization
existing deterministic judge
internal feature flag only
```

Do not begin by replacing the full canvas/editor.

The completed synthetic POC used all 50 authorized attempts: 30 initial
expressions plus a 20-case paired `x/X` geometry probe. Freeze a 300–500
expression decision corpus across writers and target devices only after a new
budget/run identity is approved and the provider/privacy gates close. Include
fractions, exponents, ambiguous symbols, edits, and writing-quality variation.

The product owner subsequently approved a separate synthetic-only run,
`myscript-synthetic-poc-20260816-v2`, capped at 1,500 attempts. Its independent
owner-only ledger is initialized at 0/1500; v1 remains immutable at 50/50. This
does not approve student/tester ink, production activation, distribution,
payment, or a contract. The read-only before-run MyScript dashboard counter
reports 50 total requests, exactly matching v1 and leaving 1,950 of the
account-wide 2,000-request allowance free. See
`myscript-synthetic-authorization-2026-08-16-v2.md` and
`myscript-dashboard-quota-evidence-2026-08-16.md`.

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
cd /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal/frontend
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
cd /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal/backend
/Users/anyixin/Desktop/VerityAI/verity_ai/backend/venv/bin/python -m pytest -q
```

Review the work:

```bash
cd /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal
git status --short --branch
git show --stat 317dee3
git diff HEAD -- frontend/src
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
Work in /Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal on the active
phase branch based on the latest `origin/main`.

Read docs/handwriting/HANDOFF.md, README.md, architecture-v2.md,
implementation-plan.md, and evaluation-plan.md. Inspect the current code and
tests. Confirm the Phase 3 external-call preconditions before enabling traffic:
approved MyScript licensing/privacy terms and a provider-approved raw-stroke
fixture corpus. Account credentials and backend secret storage already exist.
If external preconditions are absent, keep traffic disabled and implement only
safe mock-tested adapter, HMAC, error-mapping, deployment-metadata, and corpus
tooling work.

Once all preconditions exist, implement only the internal linear-equation
MyScript POC. Preserve the existing canvas, stable expression identity,
version/cancellation guards, deterministic judgment, Gemini fallback boundary,
and privacy rules. Do not claim provider accuracy or latency until the frozen
corpus and target devices have been measured.
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
- provider licensing/privacy evidence and explicit go/no-go gates exist;
- fixture/stroke/prediction schemas, provider-approved replay planning, and
  content-free aggregate scoring exist;
- math workflow is provider-decoupled;
- Gemini remains the safe default;
- hybrid and shadow routing are tested;
- provider-aware finalization and two-worker recognition are tested;
- provisional output is isolated from deterministic judgment;
- stale recognition and judge responses are rejected;
- pointer-to-paint lifecycle stages are locally observable;
- client reuse is implemented;
- disabled-revision metadata and smoke validation is reproducible through the
  content-safe verifier in `scripts/verify_disabled_myscript_revision.py`;
- all current frontend/backend validation passes.

Not safe to claim yet:

- MyScript is production-ready or accurate enough for adoption;
- PNG is no longer used;
- final handwriting latency is 300–500ms;
- live Gemini accuracy or target-device p95 improved by a measured amount;
- Luna is better than Gemini;
- complex chemistry or full undergraduate math is supported.

The current safe state is disabled revision `verity-ai-00022-2vj`, with both
provider flags false and both Secret Manager references pinned to reviewed
numeric version `1`. Further decision-corpus or student/deployed traffic remains
blocked on its separately applicable corpus, privacy/legal, commercial,
dashboard, target-device, authentication, and rollout gates in
`provider-readiness.md`.
