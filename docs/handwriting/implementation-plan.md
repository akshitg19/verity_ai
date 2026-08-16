# Handwriting v2 Implementation Plan

**Status:** Phases 0–2 merged in PR #31 (`cfa06e0`), Phase A/B in PR #32
(`156d724`), Phase C/D safe tooling in PR #33 (`e01d28e`), and the disabled
Phase 3 backend adapter in PR #34 (`949e1ea`); unreachable-by-default frontend
POC wiring is implemented in PR #35, and durable attempt-ledger enforcement in
PR #36 (`a584368`). A 30-call synthetic-only live Phase 3 smoke completed on
2026-08-16; student/production and decision-corpus work remains gated
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

**Status:** Safe backend portion merged with both deploy flags false. Direct
vector-only frontend wiring is implemented behind two additional false-by-default
gates. PR #36 implements durable cross-restart attempt-ledger enforcement. A
separate local synthetic smoke completed without enabling deployed traffic;
decision-corpus and student/production evidence remain blocked.

### Preconditions

- Complete MyScript account/credentials and backend secret storage (complete).
- Explicit free-trial request budget and synthetic-only provider permission
  before the technical smoke (complete: 50 cap, 30 attempts).
- Written licensing/privacy approval before student data or deployed traffic.
- Reviewed target-device corpus before a provider decision.

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
- Raw stroke order and timestamp order are preserved; browser fractional
  milliseconds are rounded only to satisfy MyScript's integer REST schema.
- Output is compatible with the deterministic judge.
- Provider errors are typed and recoverable.
- Every live HTTP attempt must reserve a content-free durable ledger sequence;
  attempt 651 and every ledger integrity failure stop before provider I/O.
- Results can be reproduced from stored consented fixtures.

## Phase 4 — Shadow evaluation

**Status:** PR #37 implements the report contract and explicit
`NOT_RUN`/`NO_DECISION` checkpoint in `provider-evaluation-report.md`. Live
smoke, frozen-corpus, target-device, and provider-decision evidence remain
blocked by the recorded external gates.

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

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-myscript-adapter (Phase 3 safe backend change)
Phase: 3 safe/offline backend portion
Implemented: strict versioned stroke schemas; canonical MyScript Math payload;
exact-body HMAC-SHA-512; bounded streaming JIIX parsing; restricted linear-
equation normalization shared with the evaluator; typed content-safe failures;
one transient retry; a process-local 650-attempt fail-closed guard; a dual-
disabled internal API route that additionally requires the existing API header;
Cloud Run secret references; and idempotent Secret Manager metadata/IAM setup.
Tests and results: 41 focused adapter/evaluator/access-control tests passed;
full backend passed 1219 tests with 3 expected xfails and 3 existing OPSIN
warnings; frontend 375 tests, lint, normal/production builds, production API-base
inspection, and App.jsx line cap passed; `cloudbuild.yaml` parsed and its two
secret references, exact endpoint, and false flags passed semantic assertions;
`git diff --check` passed.
Measured metrics: only local mock latency and deterministic compatibility were
verified. No provider request, provider accuracy, target-device latency, quota,
or deployed-revision claim is made.
Known risks: Cloud Run revision metadata still needs read-only verification;
environment-variable secrets must be pinned to reviewed numeric versions before
traffic; the in-process request counter is not a durable POC ledger; vendor
privacy/commercial approvals and an approved frozen corpus remain blocked.
Next action: merge and deploy the disabled revision, verify only its secret
references and false flags, then add unreachable-by-default frontend POC wiring.
Do not make a live provider call until every external-call gate closes.
```

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-myscript-frontend (Phase 3 safe frontend change)
Phase: 3 safe/offline frontend portion
Implemented: direct MyScript vector adapter; ordered x/y/t/p translation with
presentation and identity fields removed; algebra-only profile; abort
propagation; content-safe typed HTTP failures; content-free request timing;
backend API helper; exact dual Vite gates; no automatic fallback in POC mode;
production-bundle provider-secret assertions; and a rollout/outage/rollback
runbook.
Tests and results: 39 focused adapter/config/API/hybrid/coordinator/workflow tests
passed; full frontend passed 387 tests across 41 files; lint and App.jsx cap
(256/260) passed; normal, default
production, and locally POC-gated production builds passed; both production
bundle inspections found the expected Cloud Run API base and no MyScript
provider-secret names. Full backend passed 1219 tests with 3 expected xfails
and 3 existing OPSIN warnings; the three shape-only fixture examples passed
manifest validation as intentionally decision-ineligible; all 9 handwriting
Markdown files passed relative-link validation; targeted frontend source/asset
scans found no MyScript credential names or local credential path.
Measured metrics: payload, cancellation, configuration, and content-free metric
behavior are deterministic only. No external provider request, recognition
accuracy, target-device latency, request count, or cost is claimed.
Known risks: PR/CI are pending; the disabled backend revision is not deployed
because the GCP project has no Cloud Build trigger and Cloud Shell authorization
requires explicit user approval; vendor privacy/commercial approval, an approved
corpus, numeric secret versions, and a durable run ledger remain blocked.
Next action: merge this safe PR when CI is green, then deploy and validate the
disabled revision after Cloud Shell authorization. Do not enable either frontend
gate in Vercel.
```

```text
Date: 2026-08-14
Branch/commit: feat/handwriting-poc-ledger at 8e921e4 (PR #36)
Phase: 3 safe/offline live-traffic guardrail
Implemented: repository-external owner-only append-only attempt ledger;
content-free run/provider/cap/sequence schema; atomic multi-worker lock and
reservation; restart persistence; fail-closed corruption, identity, symlink,
permission, stale-lock, and cap handling; MyScript 650-attempt maximum; CLI
init/status/reserve commands; restricted-artifact ignore rules; and production
factory enforcement requiring an approved durable ledger path and run ID before
the provider can be enabled.
Tests and results: 50 focused ledger/adapter/evaluator tests passed; full backend
passed 1235 tests with 3 expected xfails and 3 existing OPSIN warnings; full
frontend passed 387 tests across 41 files; lint and App.jsx cap (256/260)
passed; normal and production builds passed; production-bundle inspection found
the expected Cloud Run API base and no MyScript provider-secret names. The 3
shape-only fixtures passed schema validation as intentionally decision-
ineligible; all 10 handwriting Markdown files passed relative-link validation;
changed-diff and built-asset sensitive-token scans passed; `git diff --check`
passed.
Measured metrics: deterministic concurrent reservations 1–40 were unique and
bounded; a newly constructed ledger instance retained prior usage. These are
local integrity results only. No provider request, quota consumption, accuracy,
latency, target-device, or cost result is claimed.
Known risks: PR/CI are pending; an approved persistent ledger mount/store and
operator ownership evidence do not yet exist; the disabled Cloud Run revision
is not deployed because Cloud Shell authorization is awaiting explicit user
approval; vendor privacy/commercial approval and an approved corpus remain
blocked.
Next action: merge this safe guardrail PR when CI is green. Then deploy only the
disabled revision after Cloud Shell authorization. Do not initialize or mount a
live ledger, enable either backend flag, or call the provider until its storage,
vendor, corpus, and operator gates close.
```

```text
Date: 2026-08-14
Branch/commit: docs/handwriting-evaluation-checkpoint at e5feaf8 (PR #37)
Phase: 4 safe/offline decision checkpoint
Implemented: authoritative provider-evaluation report with explicit NOT_RUN and
NO_DECISION state; decision-eligibility gate; exact external owners and evidence;
run/corpus/configuration identity; category, device, browser, critical-symbol,
latency, lifecycle-integrity, operations, request, and cost tables; immutable
NOT_MEASURED semantics; and GO/CATEGORY_LIMITED_GO/NO_GO decision protocol.
Tests and results: all 11 handwriting Markdown files passed relative-link
validation; changed-diff sensitive-pattern scan and `git diff --check` passed.
The base `a584368` had green post-merge Linux backend, Windows backend, and
frontend CI before this documentation-only change.
Measured metrics: none. The fixture examples remain decision-ineligible and no
example output was promoted into the report. No provider accuracy, latency,
request count, cost, or go/no-go result is claimed.
Known risks: PR/CI are pending; disabled Cloud Run deployment, vendor/legal
answers, approved corpora and durable store, target devices, and live evaluation
remain externally blocked.
Next action: merge this report checkpoint when CI is green. Then deploy only the
disabled backend revision after explicit Cloud Shell authorization; keep all
provider gates false until every report eligibility row closes.
```

```text
Date: 2026-08-16
Source/build/revision: 22ce718 / 1210e5a0-58fb-4a1f-9648-656b7d2e2f1a / verity-ai-00017-phb
Phase: 3 disabled Cloud Run deployment checkpoint
Implemented: deployed the reviewed main commit through cloudbuild.yaml with
MYSCRIPT_ENABLED=false and MYSCRIPT_POC_ROUTE_ENABLED=false; mapped both
existing Secret Manager resources as backend-only environment references; and
preserved Gemini as the only enabled production recognizer.
Tests and results: Cloud Build succeeded in 3M50S; revision metadata showed the
expected runtime service account, both false flags, and the two expected secret
references at latest without reading values; /health and the production
frontend returned HTTP 200; OpenAPI contained the MyScript route; and a minimal
valid synthetic stroke returned a content-safe HTTP 404. The deployed image
digest was sha256:a535527fdd58f55ea2963d7f6ded8ebcbdbc24113323d19311a2e66bb0913041.
Measured metrics: deployment and fail-closed behavior only. No MyScript request,
Gemini live recognition request, provider accuracy, target-device latency,
quota, request count, or cost result is claimed.
Known risks: latest secret references are acceptable only while traffic is
impossible; numeric versions, vendor/legal and commercial approvals, approved
corpora and restricted storage, durable ledger mount/restart proof, dashboard
reconciliation, target devices, and real authentication remain blocked.
Next action: merge this evidence checkpoint. Keep every MyScript gate false and
obtain the remaining external evidence before an approved internal POC.
```

```text
Date: 2026-08-16
Source/revision: 7171a12bc768d7612140c434702babca6c01d107 / verity-ai-00018-fdv
Phase: 3 numeric Secret Manager version checkpoint
Implemented: pinned both MyScript environment references to reviewed numeric
version 1; added a pre-image-build validator that rejects empty, latest, zero,
leading-zero, and non-numeric values; documented the metadata-only rotation
procedure; and updated the disabled Cloud Run service without rebuilding the
previously verified image.
Tests and results: 36 focused MyScript tests passed; the full backend suite
passed 1244 tests with 3 expected failures; frontend lint, line-count guard,
387 tests, and build passed; the production-bundle API-base and provider-secret
scan passed; PR #39 passed five of five CI/Vercel checks. Revision metadata
showed the expected service account, both false flags, both secret references at
version 1, 100% traffic to the ready revision, and the unchanged image digest.
/health and the production frontend returned HTTP 200; OpenAPI contained the
MyScript route; and a minimal valid synthetic stroke returned HTTP 404.
Measured metrics: configuration and fail-closed behavior only. No secret value,
MyScript request, live Gemini recognition request, provider accuracy, target-
device latency, quota, request count, or cost result is claimed.
Known risks: vendor/legal and commercial approvals, approved corpora and
restricted storage, durable ledger mount/restart proof, dashboard
reconciliation, target devices, and real authentication remain blocked.
Next action: merge this evidence checkpoint. Keep every MyScript gate false and
obtain the remaining external evidence before an approved internal POC.
```

```text
Date: 2026-08-16
Source/revision: 44f2c4287469eca74537bb52a8e07df7a4dbfb56 / verity-ai-00018-fdv
Phase: 3 repeatable disabled-revision verification
Implemented: content-safe operator CLI that reads Cloud Run service/revision
metadata, emits only allowlisted identity and reference fields, requires the
latest ready/current revision to serve 100% traffic, verifies the expected
runtime account and image digest, rejects direct or mutable secret references,
and refuses all HTTP until both MyScript flags are exactly false. Only after
those gates pass does it check health, OpenAPI route presence, one minimal
synthetic disabled-route request, and the production frontend.
Tests and results: 12 focused tests prove metadata allowlisting, no runtime-value
echo, false-flag ordering, numeric-version enforcement, direct-value rejection,
traffic enforcement, content-safe CLI failure, and non-disabled-route failure.
The full backend suite passed 1256 tests with 3 expected failures; frontend lint,
line-count guard, 387 tests, production build, API-base verification, and
provider-secret bundle scan passed. The immutable script returned PASS from
authenticated Cloud Shell against revision verity-ai-00018-fdv with both false
flags, both version-1 references, 100% traffic, the expected runtime account,
unchanged image digest, and HTTP sequence 200/200/404/200. PR #42 contains the
reviewed change.
Measured metrics: deployment safety only. No MyScript or live Gemini recognition
request, provider output, student data, accuracy, latency, quota, request-count,
or cost claim is included.
Known risks: vendor/legal and commercial approvals, approved corpora and
restricted storage, durable ledger mount/restart proof, dashboard
reconciliation, target devices, and real authentication remain blocked.
Next action: merge PR #42 after CI. Keep every MyScript gate false and require
the named external owners' evidence before any POC traffic.
```

```text
Date: 2026-08-16
Branch/commit: feat/handwriting-myscript-synthetic-poc-50 at 9df19b7
Phase: 3 live synthetic smoke and Phase 4 non-decision checkpoint
Implemented: reviewed the merged MyScript boundary; changed the live Math
response to the currently documented application/x-latex format; added a
synthetic-only runner with a 50-total-attempt hard cap, fail-fast policy,
owner-only prediction output, and durable ledger; generated and validated 30
deterministic vector linear-equation fixtures; and ran the approved free-trial
smoke without changing Cloud Run or frontend flags.
Tests and results: 64 focused adapter, ledger, evaluator, and POC-runner tests
passed; the full backend suite passed 1261 tests with 3 expected xfails and 3
existing OPSIN warnings. Frontend passed 387 tests across 41 files, lint,
App.jsx cap (256/260), production build, API-base verification, and provider-
secret bundle scan. Fixture validation passed for 30 records. The live run
returned 30/30 successes, zero retries/errors, and used 30/50 ledger slots; a
fresh-process ledger status check reproduced the same total.
Measured metrics: normalized exact match 66.67%; deterministic algebra parse
success 66.67%; mean
character error 6.254%; provider latency p50 141ms and p95 266.15ms; mean/p95
request size 2,540.433/3,094.35 bytes. No paid cost was incurred under the free
trial.
Known risks: the aggregate is decision-ineligible because fixtures have one
reviewer, are generator-only, have no same-input Gemini control, and do not
measure target-device pointer-to-paint latency. Provider dashboard
reconciliation was not captured. Student/production traffic remains blocked.
Next action: review the 10 recognition mismatches in the restricted artifact,
freeze a reviewed target-device corpus, run an identical Gemini control, and
obtain student/privacy/commercial approvals only before those data/rollout
stages. Keep every production MyScript flag false.
```

```text
Date: 2026-08-16
Source/revision: 7bace8f3e3237de7df05f09e83f0d7998c8ff125 / verity-ai-00019-nj7
Phase: 3 post-POC disabled deployment verification
Implemented: deployed the exact PR #43 merge from current main with the reviewed
cloudbuild.yaml. The resulting image contains the corrected LaTeX adapter,
bounded synthetic runner, fixtures, tests, and aggregate POC evidence, but both
Cloud Run MyScript flags remain false.
Tests and results: Cloud Build ff0cc228-807c-4f8f-98ef-697a43c50298 completed
SUCCESS in 4M6S. The content-safe verifier returned PASS for the expected
runtime account, numeric version-1 secret references, revision image digest,
100% traffic to the latest ready revision, and HTTP sequence 200/200/404/200
for health, OpenAPI, the disabled synthetic route, and the production frontend.
Measured metrics: deployment safety only. This checkpoint made no MyScript or
Gemini recognition request and accessed no Secret Manager value.
Known risks: the 30-call synthetic result remains decision-ineligible; target
devices, a same-input control, reviewed real-ink corpus, privacy/commercial
approval, authentication, and rollout evidence remain blocked.
Next action: keep every MyScript gate false and review the restricted mismatch
set before requesting any separately authorized decision corpus.
```

```text
Date: 2026-08-16
Branch: feat/handwriting-normalization-v2
Phase: 4 synthetic-smoke mismatch review and normalization amendment
Implemented: content-safe review classified all 10 v1 failures without emitting
fixture IDs or provider text. Six were adjacent-digit TeX presentation spaces;
four were genuine letter-category substitutions. Normalization v2 removes only
digit-to-digit whitespace in LaTeX math mode, keeps ASCII/text semantics and
chemistry capitalization unchanged, and does not alter recognition errors. The
runner now preserves raw LaTeX in restricted artifacts, every scored prediction
must match the scorer's normalization version, and an owner-only offline
reprocessor migrates the legacy artifact without a provider call.
Tests and results: focused evaluator, adapter, runner, and reprocessor suite
passed 57 tests. The full backend suite passed 1267 tests with 3 expected xfails
and the existing OPSIN warnings. Frontend passed 387 tests across 41 files,
lint, App.jsx cap (256/260), production build, API-base verification, and the
provider-secret bundle scan. The original 30-record restricted artifact was
migrated and rescored under v2 with provider_request_count=0; schema/input
validation passed.
Measured metrics: exact match and deterministic parse success improved from
20/30 (66.67%) to 26/30 (86.67%); mean character error fell from 6.254% to
2.9206%. Provider latency and request metrics are unchanged because the same
provider responses were reused. The approved ledger remains at 30/50 attempts.
Known risks: four genuine letter substitutions remain; the synthetic corpus is
single-reviewer and has no target-device or same-input Gemini control evidence.
Next action: merge the v2 correction, deploy another disabled-only revision,
and preserve the 20 unused attempts unless a targeted provider question cannot
be answered offline. Student/production traffic remains blocked.
```

```text
Date: 2026-08-16
Source/revision: 3634598727067eae7c3c42b2a372b4a813ff37ee / verity-ai-00020-zwl
Phase: 3 normalization-v2 disabled deployment verification
Implemented: deployed the exact PR #45 merge with normalization v2, raw-LaTeX
restricted artifact preservation, prediction-version enforcement, and the
offline reprocessor. Both provider flags remain false.
Tests and results: Cloud Build d35149af-52e2-4145-9d54-786d09ddb5fb completed
SUCCESS in 3M39S. The content-safe verifier returned PASS for the expected
runtime account, version-1 secret references, image digest, 100% traffic to the
latest ready revision, and HTTP sequence 200/200/404/200.
Measured metrics: deployment safety only. The deployment and verifier made no
MyScript or Gemini recognition request and accessed no Secret Manager value.
Known risks: the corrected 86.67% synthetic result remains decision-ineligible;
four recognition errors, target devices, same-input control, reviewed real-ink
corpus, privacy/commercial approval, authentication, and rollout evidence remain.
Next action: preserve the 20 unused attempts and keep all MyScript gates false
until a separately approved evaluation closes the remaining evidence gaps.
```

```text
Date: 2026-08-16
Branch: test/handwriting-fallback-hardening
Phase: 5 provider-neutral hybrid outage and rollback hardening
Implemented: added direct proof that a usable vector result generates no PNG;
an eligible primary failure renders the original strokes once through Gemini;
primary timeout aborts its work before fallback; caller cancellation suppresses
fallback; and a fallback outage is propagated after exactly one primary and one
fallback attempt with no recursion.
Tests and results: 13 focused HybridRecognizer tests passed. The complete
frontend suite passed 392 tests across 41 files, plus lint, App.jsx line cap
(256/260), production build, API-base verification, and provider-secret bundle
scan.
Measured metrics: deterministic call counts only. No model request, student
data, provider output, production flag, or latency claim is involved.
Known risks: the production configuration still defaults to Gemini and does not
construct a hybrid. Category-level provider evidence, visible correction UX,
target-device latency, and explicit rollout approval remain required.
Next action: merge the provider-neutral hardening and keep Gemini-only rollback
as the shipped configuration.
```

```text
Date: 2026-08-16
Branch: feat/handwriting-chemistry-routing-fixtures
Phase: 7 provider-neutral chemistry routing fixtures
Implemented: added a deterministic standard-library generator and a committed
10-case corpus with both vector strokes and PNGs. Eight written-chemistry cases
cover Co/CO, Cl/C1, capitalization, subscript, superscript, charge, and reaction
arrows under chemistry_text/text. Two graph-shaped molecular drawings use the
separate chemistry_structure/smiles contract. MyScript is not approved for any
record, and the set cannot become decision evidence with only one reviewer.
Tests and results: 12 focused evaluator tests passed. The full backend suite
passed 1268 tests with 3 expected xfails and the existing OPSIN warnings.
Fixture schema, every stroke file, every PNG signature, domain/format
separation, input coverage, provider approval, and the decision-eligibility
guard are covered. Generator re-run is deterministic and the manifest SHA-256 is
9f520ce299514cfeda3ad1c8a5bf34d3b3753b3ed1fabe9587b74daf738b7a8b.
Measured metrics: 8 written and 2 structure fixtures; no provider request,
accuracy, latency, student-data, or cost claim.
Known risks: synthetic glyphs are not target-device handwriting, have one
engineering reviewer, and do not close chemistry recognition gates.
Next action: merge the routing fixtures, then require two-reviewer target-device
chemistry evidence before any provider or topic rollout.
```

```text
Date: 2026-08-16
Branch: docs/handwriting-completion-audit
Phase: cross-phase Definition-of-Done evidence audit
Implemented: mapped every one of the 23 user-approved completion requirements
to authoritative current evidence, partial evidence, or a named external owner.
Recorded the exact QA, corpus/privacy, MyScript legal/commercial, budget,
security/authentication, and model-control packages required to resume.
Tests and results: documentation relative links and git diff checks pass;
production frontend and backend health return HTTP 200; current main and the
untouched landing-page worktree were rechecked read-only.
Measured metrics: audit status only; no provider request, student data, secret
access, production flag, cost, accuracy, or latency measurement was added.
Known risks: the goal is not complete. Target-device/A-B exports, a two-reviewer
decision corpus, written vendor terms, same-input control, authentication,
category decisions, correction UX, and enabled-canary rollback evidence remain.
Next action: keep the goal active and resume in the six-step order documented in
completion-audit-2026-08-16.md when the named owners attach evidence.
```

```text
Date: 2026-08-16
Branch: test/handwriting-correction-terms-evidence
Phase: cross-phase correction UX and public-terms evidence hardening
Implemented: added direct UI proof that every recognized math line is exposed
in an editable field; added workflow proof that a correction removes its stale
verdict and submits the edited text for a fresh deterministic check. Rechecked
the current MyScript pricing page, V.8 license, and May 2026 DPA; froze a
fact-versus-open-question matrix and reduced the vendor confirmation package to
the exact remaining contract/privacy conflicts.
Tests and results: focused correction tests passed 9/9. The full frontend suite
passed 394 tests across 41 files, lint, App.jsx cap (256/260), production build,
production API-base verification, and provider-secret bundle scan. The full
backend suite passed 1268 tests with 3 expected xfails and the existing OPSIN
warnings. One intentionally misconfigured production build was rejected by the
API-base checker before the correct production configuration passed.
Measured metrics: deterministic UI callback, stale-verdict, and judge-input
behavior only. Public terms state was reviewed without any provider request.
No student data, secret access, paid action, production flag, accuracy result,
latency measurement, or additional use of the 50-attempt POC budget occurred.
Known risks: MyScript's public V.8 trial-result/technical-input access clauses
still need written reconciliation with the DPA's transient-content language;
FERPA/COPPA/student-data approval, a production quote/SLA, real auth, target
devices, a two-reviewer corpus, same-input control, and enabled canary remain.
Next action: merge the evidence hardening after remote gates. Keep all MyScript
flags false and retain the 30/50 ledger state.
```
