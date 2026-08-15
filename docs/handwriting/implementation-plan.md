# Handwriting v2 Implementation Plan

**Status:** Phases 0–2 merged in PR #31 (`cfa06e0`) and Phase A/B merged in PR
#32 (`156d724`); Phase C/D safe tooling is implemented on
`feat/handwriting-provider-readiness`; live Phase 3 still requires written
licensing/privacy and approved-corpus evidence
**Rule:** One phase per reviewable change unless scope expansion is explicit

## Phase 0 — Source of truth and safe workspace

### Deliverables

- Architecture, implementation, and evaluation documents.
- Machine-readable fixture schema and example records.
- A clean branch/worktree based on current `origin/main`.

### Acceptance

- Existing dirty worktrees are untouched.
- Current behavior is verified against code, not copied from the old handoff.
- Undecided providers are labeled as candidates.

### Status

Complete. No production code changes are included in this phase.

## Phase 1 — Recognition foundation

**Status:** Complete and merged to `origin/main` through PR #31.

### Scope

Create frontend recognition modules:

```text
frontend/src/recognition/
  recognitionTypes.js
  RecognizerAdapter.js
  GeminiImageRecognizer.js
  HybridRecognizer.js
  recognitionConfig.js
  recognitionMetrics.js
```

Refactor the existing math flow so `useMathWorkflow` depends on an adapter and
no longer owns PNG/Gemini-specific logic. Preserve Gemini-only behavior as the
default. Add explicit fallback reasons, abort propagation, and identity/version
guards. Add provider modes without inventing an unconfigured MyScript endpoint.

On the backend, reuse the Gemini client if this can be done safely with test
injection and without changing the `/transcribe` contract.

### Tests

- Adapter contract and result normalization.
- Gemini adapter success, unreadable, service error, and abort.
- Hybrid fallback exactly once.
- No fallback because an answer is mathematically wrong.
- Page/expression/version stale-result rejection.
- Metrics omit student content.
- Existing transcription and API tests remain green.

### Acceptance

- Gemini mode behaves like production before the refactor.
- `useMathWorkflow` does not import both `renderLineToPng` and `transcribeLine`.
- No provider secret is present in frontend code.
- Feature flags have a documented safe default and rollback.

## Phase 2 — Provider-aware finalization and concurrency

**Status:** Code complete and deterministically verified. Live provider corpus
and target-device latency measurement remain explicit follow-up evidence.

### Scope

- Replace duplicate 1500ms literals with documented policies.
- Preserve immediate finalization of a previous row when writing moves forward.
- Add explicit finalization for Enter/Read Page.
- Support provisional recognition hooks for future incremental providers.
- Keep stable row identity while testing tall 2D expressions.
- Allow at most two independent recognition jobs concurrently.
- Keep judgment ordered and final-only.

### Tests

- Fake-timer coverage for image and vector quiet periods.
- New ink supersedes old versions.
- Fractions, superscripts, and subscripts remain one logical expression.
- Two rows recognize concurrently without reordering judge input.
- No duplicate judgment per expression version.
- Erase, undo, and page navigation cancel stale work.

### Acceptance

- No unexplained 1500ms literal remains in the handwriting readiness path.
- Stale-result rate is zero in tests.
- Current Gemini accuracy does not regress on the existing corpus.
- Latency stages are visible for local measurement.

## Phase 3 — MyScript vector POC

### Preconditions

- Complete MyScript account/credentials and backend secret storage (complete).
- Written licensing/privacy approval before external calls or student data.
- Fixture corpus with provider-specific consent and expected canonical outputs
  before live evaluation.

The backend adapter, HMAC fixtures, error mapping, request caps, and disabled
Cloud Run configuration may be implemented with mocks before the external-call
preconditions close.

### Scope

- Keep the existing VerityAI canvas.
- Send raw stroke groups through a backend `MyScriptRecognizer` adapter.
- Normalize LaTeX/JIIX to the existing math grammar.
- Limit eligibility to one linear-equation topic behind an internal flag.
- Implement no automatic production fallback decision before evaluation.

### Acceptance

- No PNG is generated on the MyScript test path.
- Raw stroke order and timestamps are preserved.
- Output is compatible with the deterministic judge.
- Provider errors are typed and recoverable.
- Results can be reproduced from stored consented fixtures.

## Phase 4 — Shadow evaluation

### Scope

- Control provider continues to drive the UI.
- MyScript candidate runs only for approved test traffic.
- Record content-free aggregate metrics and fixture-linked offline results.
- Compare accuracy, parse success, latency, ambiguity, and cost by topic.

### Acceptance

- Evaluation follows `evaluation-plan.md`.
- No candidate output changes a student's verdict.
- Results include confidence intervals or sample counts, not only averages.
- A written go/no-go decision identifies failing categories.

## Phase 5 — Hybrid production rollout

### Scope

- MyScript becomes primary only for categories that passed the gate.
- Gemini remains one-shot image fallback.
- Add visible correction for ambiguous/unreadable transcription.
- Roll out internally, then by percentage and topic.

### Acceptance

- Fast-path SLOs meet the architecture targets on supported devices.
- Accuracy matches or exceeds the Gemini control for eligible topics.
- Fallback rate and reasons are observable.
- Provider rollback is immediate and tested.
- Ink rendering remains independent of provider availability.

## Phase 6 — Image fallback benchmark

### Scope

- Evaluate GPT-5.6 Luna against Gemini on the difficult samples that reached
  fallback, not only on ordinary handwriting.
- Use transcription-only prompts and structured outputs.
- Keep deterministic judgment outside both models.

### Acceptance

- Same image, expected output, normalization, timeout, and scoring rules.
- Winner is selected by accuracy/parse success first, then latency and cost.
- Production uses one image fallback; it does not fan out permanently.

## Phase 7 — Chemistry specialization

### Scope

- Separate written chemistry from freehand molecular structures.
- Evaluate constrained written-formula recognition with capitalization,
  subscripts, charges, and arrows.
- Preserve the dedicated structure-recognition path.
- Use OPSIN for supported name-to-structure cases and RDKit for structure
  judgment; retain existing deterministic chemistry judges.

### Acceptance

- `Co`/`CO`, `Cl`/`C1`, subscripts, and ionic charges have explicit fixtures.
- Math recognition settings cannot silently alter chemical capitalization.
- Structure drawings are not routed through the math recognizer.

## Verification commands

Frontend:

```bash
cd frontend
npm test
npm run lint
npm run build
```

Backend:

```bash
cd backend
pytest -q
```

Use narrower tests during development, then run the full relevant suite before
hand-off. Report pre-existing failures separately from regressions.

## Change log template

Append an entry after each phase:

```text
Date:
Branch/commit:
Phase:
Implemented:
Tests and results:
Measured metrics:
Known risks:
Next action:
```

## Change log

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-architecture-v2 (Phase 0/1 commit)
Phase: 0 and 1
Implemented: source-of-truth docs, fixture schema, recognizer contract,
Gemini image adapter, hybrid and shadow routers, safe configuration defaults,
content-free adapter metrics, useMathWorkflow adapter injection, cached Gemini
client.
Tests and results: frontend 348 passed; frontend lint passed; frontend build
passed; backend 1185 passed, 3 xfailed; recognition-focused 19 passed after the
unsupported-format case was added.
Measured metrics: architecture is instrumented at adapter stages; production
latency baseline and device measurements remain Phase 2 work.
Known risks: no vector provider is configured; default behavior remains Gemini
image recognition.
Next action: implement Phase 2 as a separate change.
```

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-architecture-v2 (Phase 2 commit)
Phase: 2
Implemented: named 350ms vector and 750ms image policies, row-scoped timer
cancellation, Enter/Read Page finalization, provisional isolation, a bounded
two-worker recognition coordinator, row-ordered final commit batches, stale
recognition and judge cancellation, pointer-to-paint lifecycle events, and
taller 2D-expression grouping coverage.
Tests and results: frontend 368 passed across 38 files; lint, production build,
and App.jsx line cap passed; backend 1185 passed with 3 expected xfails.
Measured metrics: lifecycle stages are emitted through a content-free browser
event. No target-tablet p50/p95 or billed live-provider corpus run is claimed.
Known risks: Gemini remains the only configured provider; the 750ms/350ms
values are hypotheses; matrices/radicals need real fixtures; the required
300–500 consented raw-stroke corpus does not exist yet.
Historical next action at merge time: obtain MyScript credentials/licensing
approval, choose backend secret storage, and build the consented corpus before
Phase 3. Account credentials and GCP secret storage were subsequently completed;
licensing/privacy evidence and the approved corpus remain.
```

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-completion / c784605..6f3a972
Phase: A and B
Implemented: re-verified the merged Phase 0–2 baseline; added an internal-only,
scheduling-only Gemini comparison between 1500ms/one worker and 750ms/two
workers; added the fixed 12-task panel, content-free JSON export, aggregation,
privacy gates, and baseline/A-B documentation.
Tests and results: pre-change frontend 368 passed across 38 files; after tooling
375 passed across 40 files; lint, normal build, production build,
production-build inspection, and App.jsx line cap passed; backend 1185 passed
with 3 expected xfails and 3 existing OPSIN warnings. Local browser smoke passed
for legacy, current, and query-free math routes; task save/advance worked and no
browser console error was recorded.
Measured metrics: lifecycle stages and aggregation are verified
deterministically. No target tablet was available, so no device p50/p95 or
perceived-improvement claim is made.
Known risks: the 3–5 teammate/device exports are an external evidence gate; the
preview requires existing `verity-ai2` Vercel team access; the internal query
variant must be cleaned up after the comparison.
Next action: use the documented PR #32 preview to collect paired target-device
exports, then continue provider-readiness and corpus-harness work.
```

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-provider-readiness
Phase: C and D safe/offline portion
Implemented: official-source provider, pricing, privacy, licensing, and minor-
use review; MyScript REST/HMAC/secret-mapping design; 650-call POC budget;
vendor-question draft; Draft 2020-12 fixture/stroke/prediction schemas; strict
path, size, review, retention, provider-approval, and PII guards; a
ground-truth-free replay planner; and content-free aggregate scoring with
category/device/browser breakdowns.
Tests and results: 10 handwriting-evaluation tests passed on Python 3.12;
shape-only example validation and example scoring passed. A clean full backend
rerun passed 1195 tests with 3 expected xfails and 3 existing OPSIN warnings.
An earlier run exposed one pre-existing random-ID test flake when its opaque
session ID happened to contain the answer string; it passed alone and in the
clean full rerun.
Measured metrics: tooling behavior is verified; the included fixture-echo
example is explicitly benchmark-ineligible and supplies no provider evidence.
Known risks: no approved 30–50 smoke or 300–500 decision corpus exists;
MyScript free-trial result use, FERPA/COPPA/minor terms, commercial price, and
attribution/publicity terms remain unresolved; current Google Generative AI
terms contain an under-18 application restriction relevant to the Gemini
baseline.
Next action: merge the safe tooling, implement the disabled-by-default MyScript
backend adapter with mocks, map secrets to a non-traffic Cloud Run revision,
and obtain the external approvals/corpus before making a live call.
```
