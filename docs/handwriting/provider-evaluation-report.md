# Handwriting Provider Evaluation Report

**Status date:** 2026-08-16

**Evidence state:** `SYNTHETIC_SMOKE_COMPLETE`; decision corpus `NOT_RUN`

**Provider decision:** `NO_DECISION`

This file is the authoritative Phase 4 decision checkpoint and report contract.
A decision-ineligible 30-case synthetic smoke is complete, but MyScript has
neither passed nor failed the VerityAI decision evaluation. Gemini remains the deployed control because
it is the safe default—not because a completed comparison proved it superior.

The three shape examples in `fixtures/cases.example.jsonl` and their copied
predictions are explicitly decision-ineligible. Their synthetic scorer output
must never be inserted here as accuracy, latency, request, or cost evidence.

## 1. Current decision table

| Path | Current state | Evidence-backed conclusion |
|---|---|---|
| Production primary | Gemini image transcription | Retain as rollback-safe control; no new provider traffic |
| MyScript vector candidate | 30-case synthetic live POC complete; decision corpus blocked | `NO_DECISION`—technical boundary works, accuracy gate not established |
| Hybrid vector → Gemini | One-shot fallback and visible-correction mechanisms regression-tested; no enabled canary | Not eligible for production configuration |
| Image fallback candidate | Gemini retained; GPT-5.6 Luna not evaluated | `NO_DECISION` |
| Written chemistry | Separate deterministic routing exists | No recognition-provider decision |
| Structure drawings | Dedicated structure path retained | Must not enter the math recognizer |

## 2. Evidence eligibility

A report may change from `NOT_RUN` only when all rows below have attached,
reviewed evidence. An aggregate with `decision_eligible=false` cannot close any
measurement row.

| Gate | Current state | Owner | Evidence required |
|---|---|---|---|
| Disabled Cloud Run revision | Complete | GCP project owner | Build `d35149af-52e2-4145-9d54-786d09ddb5fb`, current revision `verity-ai-00020-zwl`, and [post-POC fail-closed evidence](current-disabled-deployment-evidence-2026-08-16.md) |
| MyScript trial/privacy terms | [Public facts frozen](myscript-public-terms-checkpoint-2026-08-16.md); blocked for student ink | MyScript and VerityAI privacy/legal | Internal approval and written reconciliation of trial-result research/technical-input access with DPA transient processing, plus FERPA/COPPA/student-data and acceptable attribution/publicity terms |
| Commercial rights and cost | Deferred production gate | MyScript and VerityAI commercial owner | Written billing unit, quota, minimum, overage, cancellation, production right, SLA, and quote before distribution |
| Approved smoke corpus | Complete for technical smoke | VerityAI engineering | 30 deterministic synthetic fixtures, MyScript-specific permission, provenance, retention, validation |
| Frozen decision corpus | Blocked | VerityAI data/privacy owner | Versioned 300–500 fixtures in restricted storage with approved deletion/access rules |
| Durable attempt store | Code merged; store not approved or mounted | GCP/data owner | Durable store identity, access policy, initialized ledger, restart proof, dashboard reconciliation procedure |
| Target devices | Blocked | Product/QA owner | Named tablet/browser groups and consented device-run exports |
| Authentication | Blocked for student traffic | Security/product owner | Review proving a real user-access boundary; shared browser header is insufficient |

## 3. Run identity

The completed technical smoke is recorded in
[`myscript-synthetic-poc-2026-08-16.md`](myscript-synthetic-poc-2026-08-16.md):
30/30 provider successes, 86.67% normalized exact match and deterministic parse success,
141 ms p50 and 266.15 ms p95 provider latency, and 30/50 ledger attempts used.
Its aggregate is `decision_eligible=false` because it has one reviewer, no
target-device interaction, and no same-input Gemini control.

All values remain `NOT_MEASURED` until a decision-eligible aggregate is
attached. Do not use `0`, an empty cell, or a copied example value to mean
“not measured.”

| Field | Value |
|---|---|
| Run ID | `NOT_MEASURED` |
| Test window | `NOT_MEASURED` |
| Corpus version and SHA-256 | `NOT_MEASURED` |
| Normalization version | `NOT_MEASURED` |
| Provider/model/configuration | `NOT_MEASURED` |
| Control provider/configuration | `NOT_MEASURED` |
| Warm/cold policy | `NOT_MEASURED` |
| Device/browser groups | `NOT_MEASURED` |
| Attempt-ledger before/after | `NOT_MEASURED` |
| Provider-dashboard before/after | `NOT_MEASURED` |
| Aggregate report artifact | `NOT_MEASURED` |

## 4. Accuracy and parsing

The completed report must add one row for every observed domain, topic, critical
tag, device group, and browser group. A global result alone is invalid.

| Category | Sample count | Exact match | Parse success | Top-k | Character error | Unreadable precision/recall | Decision |
|---|---:|---:|---:|---:|---:|---:|---|
| Linear equations | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |
| Fractions/nested fractions | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |
| Exponents/roots/scripts | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |
| Calculus/trigonometry/Greek | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |
| Ambiguous symbols | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |
| Written chemistry | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |
| Editing/overwriting | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` | `NO_DECISION` |

The final report must separately list critical-symbol regressions such as
`1/l/I`, `0/O`, `x/×`, `-/=`, decimal points, chemistry capitalization,
subscripts, superscripts, charges, arrows, and coefficients. Ground truth must
remain what was visibly written, including incorrect answers.

## 5. Latency and lifecycle integrity

| Metric | Target | Candidate | Control | Sample count |
|---|---:|---:|---:|---:|
| Ink rendering p95 | `<16 ms` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |
| Pointer-up → provisional p50/p95 | p95 `<300 ms` | `NOT_MEASURED` | Not applicable to image control | `NOT_MEASURED` |
| Pointer-up → final recognition p50/p95 | p95 `<500 ms` vector target | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |
| Provider request p50/p95 | Predeclared before run | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |
| Final recognition → verdict p50/p95 | Included in `<600 ms` fast path | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |
| Pointer-up → painted verdict p50/p95 | Fast path p95 `<600 ms` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |
| Stale-result count | `0` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |
| Duplicate-judgment count | `0` | `NOT_MEASURED` | `NOT_MEASURED` | `NOT_MEASURED` |

Offline provider latency cannot substitute for target-device pointer-to-paint
measurement. Report both and identify warm/cold conditions.

## 6. Operations and cost

| Metric | Result |
|---|---|
| Synthetic smoke planned / used / remaining | `50 / 30 / 20` local ledger; dashboard reconciliation not recorded |
| Success / timeout / error rates | `NOT_MEASURED` |
| Retry count | `NOT_MEASURED` |
| Payload mean / p95 | `NOT_MEASURED` |
| Correction rate | `NOT_MEASURED` |
| Fallback rate and reasons | `NOT_MEASURED` |
| Observed test cost | `NOT_MEASURED` |
| Estimated cost per 1,000 expressions | `NOT_MEASURED` |
| Production quote and billing unit | `NOT_MEASURED` |

No price estimate may extrapolate the public trial quota as a production price.
Ledger totals and the provider dashboard must be reconciled before reporting a
request count.

## 7. Decision protocol

1. Predeclare tolerance and smoke stop thresholds before viewing final results.
2. Run 30–50 approved smoke cases and fix harness defects before the frozen run.
3. Attach the content-free aggregate with `decision_eligible=true`, corpus hash,
   run identity, normalizer version, and sample counts.
4. Review every category, device, browser, and critical tag; do not average away
   a failure.
5. Record privacy, commercial, security, cost, correction, fallback, and outage
   reviews alongside accuracy and latency.
6. Choose `GO`, `CATEGORY_LIMITED_GO`, or `NO_GO` with written rationale. Do not
   weaken a gate after seeing results without an explicit product decision.
7. If MyScript is `NO_GO`, evaluate the selected alternative or improved Gemini
   policy through the same frozen protocol.

## 8. Current recommendation

`NO_DECISION`: keep Gemini-only production behavior and all MyScript frontend
and backend gates false. The synthetic smoke proves the live technical boundary
but its 86.67% `v2` exact match is not an adoption result. The next provider decision
action requires a reviewed target-device corpus and same-input Gemini control;
student traffic additionally requires privacy/legal, commercial, data,
authentication, and rollout evidence.
