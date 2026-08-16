# Handwriting Provider Evaluation Report

**Status date:** 2026-08-16

**Evidence state:** `SYNTHETIC_DIAGNOSTICS_COMPLETE`; decision corpus `NOT_RUN`

**Provider decision:** `NO_DECISION`

This file is the authoritative Phase 4 decision checkpoint and report contract.
A decision-ineligible 30-case smoke, 20-case probe, and 300-case geometry
diagnostic are complete, but MyScript has
neither passed nor failed the VerityAI decision evaluation. Gemini remains the deployed control because
it is the safe default—not because a completed comparison proved it superior.

The three shape examples in `fixtures/cases.example.jsonl` and their copied
predictions are explicitly decision-ineligible. Their synthetic scorer output
must never be inserted here as accuracy, latency, request, or cost evidence.

## 1. Current decision table

| Path | Current state | Evidence-backed conclusion |
|---|---|---|
| Production primary | Gemini image transcription | Retain as rollback-safe control; no new provider traffic |
| MyScript vector candidate | 30-case smoke, 20-case paired `x/X` probe, and 300-case frozen geometry diagnostic complete; decision corpus blocked | `NO_DECISION`—technical boundary works and synthetic casing sensitivity is characterized, but the production accuracy gate is not established |
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
| Disabled Cloud Run revision | Complete | GCP project owner | Build `a5703e61-48d6-487a-8fe2-9e35c06aeb51`, current revision `verity-ai-00021-glp`, and [latest-main fail-closed evidence](current-main-disabled-deployment-evidence-2026-08-16.md) |
| MyScript trial/privacy terms | [Public facts frozen](myscript-public-terms-checkpoint-2026-08-16.md); blocked for student ink | MyScript and VerityAI privacy/legal | Internal approval and written reconciliation of trial-result research/technical-input access with DPA transient processing, plus FERPA/COPPA/student-data and acceptable attribution/publicity terms |
| Commercial rights and cost | Deferred production gate | MyScript and VerityAI commercial owner | Written billing unit, quota, minimum, overage, cancellation, production right, SLA, and quote before distribution |
| Approved smoke corpus | Complete for technical smoke | VerityAI engineering | 30 deterministic synthetic fixtures, MyScript-specific permission, provenance, retention, validation |
| Frozen decision corpus | Blocked | VerityAI data/privacy owner | Versioned 300–500 fixtures in restricted storage with approved deletion/access rules |
| Durable attempt store | Code merged; store not approved or mounted | GCP/data owner | Durable store identity, access policy, initialized ledger, restart proof, dashboard reconciliation procedure |
| Target devices | Blocked | Product/QA owner | Named tablet/browser groups and consented device-run exports |
| Authentication | Blocked for student traffic | Security/product owner | Review proving a real user-access boundary; shared browser header is insufficient |

## 3. Run identity

The completed technical smoke and targeted geometry probe are recorded in
[`myscript-synthetic-poc-2026-08-16.md`](myscript-synthetic-poc-2026-08-16.md):
the initial set had 30/30 provider successes and 86.67% normalized exact/parse;
the paired probe had 20/20 provider successes, 100% for ten explicit lowercase
x-height cases, and 90% for ten full-height cases. The shared ledger is 50/50
and exhausted. Both v1 aggregates are `decision_eligible=false` because they
have one reviewer, no target-device interaction, and no same-input Gemini
control. The separate [300-case v2 diagnostic](myscript-synthetic-v2-results-2026-08-16.md)
also remains decision-ineligible. It had 300/300 provider successes, 95.00%
overall exact match, and 96.33% parse success. Each of its four lowercase
geometry groups met the frozen exact/parse/latency gates; the descriptive
full-height group reached 85.00% exact and contained all eight case-only
mismatches.

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
| Synthetic POC cap / used / remaining | `50 / 50 / 0` local ledger; the v2 before-run dashboard snapshot reconciled this account total at 50 |
| Synthetic v2 cap / used / remaining | `1500 / 300 / 1200` separate local ledger; dashboard 50 → 350, discrepancy 0; 1,650 of 2,000 published free requests remain |
| Synthetic v2 success / timeout + error | 100% / 0% (`n=300`); diagnostic only |
| Synthetic v2 retry count | 0 |
| Synthetic v2 payload mean / p95 | 3,206.903 / 4,876.4 bytes |
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
and backend gates false. The synthetic diagnostics prove the live technical
boundary and show that explicit lowercase x-height is materially more reliable
than full-height crossing strokes, but their results are not an adoption
benchmark. The next provider decision action requires a reviewed target-device
corpus and same-input Gemini control;
student traffic additionally requires privacy/legal, commercial, data,
authentication, and rollout evidence.
