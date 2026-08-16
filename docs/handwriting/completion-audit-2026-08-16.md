# Handwriting v2 Definition-of-Done Audit

**Audit date:** 2026-08-16  
**Audited through:** PR #52 merge `5dac97efadf456e5a98c443cf6d6f749b0f0d04e`
**Goal status:** active; production-ready completion is not yet proven.

This audit uses the 23-item Definition of Done from the user-approved completion
goal. `Complete` means current repository or runtime evidence directly proves
the item. `External evidence required` means the safe provider-neutral work is
complete but the item cannot be claimed without a named owner supplying new
evidence or approval.

## Current verified checkpoint

- Production recognizer remains Gemini image transcription.
- Current backend revision is `verity-ai-00020-zwl`, serving 100% of Cloud Run
  traffic with `MYSCRIPT_ENABLED=false` and
  `MYSCRIPT_POC_ROUTE_ENABLED=false`.
- Both MyScript environment variables reference reviewed Secret Manager numeric
  version `1`; no secret value was read for verification.
- The synthetic MyScript POC used its full approved 50-attempt ledger: the
  initial 30-case set reports 26/30 exact/parse (86.67%), while the paired
  `x/X` probe reports 10/10 for explicit lowercase x-height and 9/10 for
  full-height `x`. All 50 provider calls succeeded with zero retry/error.
- A separate [v2 synthetic authorization](myscript-synthetic-authorization-2026-08-16-v2.md)
  now permits at most 1,500 attempts. Its owner-only repository-external ledger
  is initialized at `1500 / 0 / 1500`; no v2 provider request has occurred.
  A MyScript dashboard snapshot proving sufficient free allowance remains a
  mandatory pre-request gate.
- Frontend and backend production health returned HTTP 200 at audit time.
- The original landing-page worktree still contains the same six unrelated
  modified/untracked paths and was not edited, stashed, reset, or merged.

## Requirement-by-requirement audit

| # | Requirement | Status | Authoritative evidence / missing proof |
|---:|---|---|---|
| 1 | Original dirty landing work remains intact | Complete | Read-only `git status` still shows the original three modified and three untracked landing files. All handwriting work used the clean goal worktree. |
| 2 | Phase 0–2 and historical paths are current | Complete | [README](README.md), [handoff](HANDOFF.md), and [implementation log](implementation-plan.md) record merged PRs and current safe state. |
| 3 | Measured Gemini baseline | External evidence required | Lifecycle instrumentation and export workflow exist in the [baseline report](baseline-report-2026-08-14.md), but no target-tablet p50/p95 export exists. |
| 4 | Documented teammate A/B path | Mechanism complete; results external | [Internal A/B comparison](internal-ab-comparison.md) provides tasks, consent boundary, metrics, rollback, and aggregation. Results from 3–5 teammates are not attached. |
| 5 | Reproducible validation/replay/scoring harness | Complete | Schemas, content-safe scorer, durable ledger, MyScript runner, normalization-version enforcement, and offline reprocessor are merged and tested. |
| 6 | Approved versioned decision corpus | External evidence required | The 30-case math smoke, 20-case paired geometry probe, and 10-case chemistry corpus are synthetic and single-reviewer. No approved 300–500-case, two-reviewer, target-device corpus with restricted-store policy exists. |
| 7 | Provider commercial/privacy/security terms verified | Public evidence complete; internal/vendor approval external | [Public terms checkpoint](myscript-public-terms-checkpoint-2026-08-16.md) verifies the 2,000-request internal-evaluation limit, trial-result research use, DPA cloud-recognition scope, transient content handling, 12-month IP logs, subprocessors/regions, no public uptime guarantee, and attribution/publicity terms. Written reconciliation of V.8 access clauses with the DPA, FERPA/COPPA/student-data approval, production quote, negotiated SLA/support, and acceptable publicity terms remain missing. |
| 8 | MyScript category evaluation or evidence-backed no-go | External evidence required | The bounded synthetic POC proves the REST boundary and shows full-height `x` is more case-ambiguous than explicit lowercase x-height, but both corpora are decision-ineligible. No category/device comparison against Gemini exists, so neither adoption nor rejection is justified. |
| 9 | Alternative evaluated if MyScript rejected | Not yet applicable | MyScript has not received a valid go/no-go decision. Provider-neutral alternative screening is documented, but no replacement benchmark is authorized. |
| 10 | Selected fast path passes accuracy/parse gate | External evidence required | Initial synthetic MyScript reaches 86.67%; the paired geometry probe reaches 100% for explicit lowercase x-height and 90% for full-height `x`. No predeclared production tolerance or eligible same-input Gemini category baseline exists. |
| 11 | Latency, stale, and duplicate gates measured | Partially complete; target evidence external | Stale and duplicate behavior is regression-tested and content-free lifecycle stages exist. Target-device provisional/final/verdict p50/p95 are unmeasured. |
| 12 | One-shot observable/correctable rollback-safe hybrid | Mechanism complete; enabled canary external | PR #47 proves one primary, at most one fallback, no normal-path PNG, timeout abort, cancellation, outage propagation, and no recursion. Component/workflow regressions prove each recognized math line is visibly editable, correction invalidates the old verdict, and only the edited transcription is rechecked. An approved authenticated enabled canary remains untested. |
| 13 | Evidence-backed image-fallback provider decision | External evidence required | Gemini remains the safe default. No approved difficult-fallback corpus or identical-image Gemini/Luna benchmark exists. |
| 14 | Written chemistry and structures are separate | Routing complete; recognition evidence external | Existing app tests plus [synthetic chemistry routing fixtures](fixtures/synthetic-chemistry-routing-v1/manifest.jsonl) separate `chemistry_text/text` from `chemistry_structure/smiles`. Target-device recognition accuracy/latency is missing. |
| 15 | No raw content in ordinary logs | Complete for implemented paths | Content-safe metrics, aggregate reports, adapter errors, reprocessor failures, and disabled verifier are covered by tests. Raw prediction artifacts remain outside Git in an owner-only directory. |
| 16 | No provider secret in Git/frontend/build/docs/logs | Complete for current state | Production bundle scan passes; secrets are backend Secret Manager references; local credential file is ignored and was never read or printed. |
| 17 | Relevant local and remote checks pass | Complete for merged work | Backend passes 1270 tests / 3 expected xfails; frontend's latest unchanged result is 394 tests across 41 files plus lint, App.jsx cap, production build/API-base check, and provider-secret bundle scan. Linux, Windows, frontend, and Vercel checks all passed for PR #51. |
| 18 | Reviewable PRs merged to current main | Complete for safe deliverables | PRs #31–#51 are merged; latest audited merge is `294d190005dcbe57cd744f451fadc3b8bda1e1fd`. |
| 19 | Preview/staging smoke tests pass | Partially complete | Vercel previews and disabled Cloud Run health/OpenAPI/route/frontend checks pass. No target-device enabled-provider preview is authorized. |
| 20 | Production rollout completed or fully rollout-ready | External evidence required | The safe state is fully disabled with exact activation gates documented, but provider selection, eligible categories, authentication, decision corpus, privacy/commercial approval, and canary evidence are missing. |
| 21 | Rollback commands verified | Mechanism complete; enabled rollback external | [Runbook](rollout-runbook.md) contains frontend/backend kill switches; every reviewed Cloud Build restores false flags; live disabled verifier passes. An enabled-provider rollback cannot be exercised before an enabled canary is approved. |
| 22 | Current architecture/status/results/risks/maintenance docs | Complete | Architecture, implementation log, evaluation report, POC evidence, readiness, rollout, and this audit are current. |
| 23 | Final Chinese handoff | Pending goal completion | A final production/provider decision handoff would be misleading until the external evidence above exists. |

## Exact external unblock package

| Owner | Required evidence or decision | Next action that unlocks engineering |
|---|---|---|
| Product/QA owner | Named tablet/browser matrix; 3–5 consenting internal testers; completed content-free Phase A/B exports | Run the documented baseline/A-B tasks and attach aggregate exports without handwriting content or identifiers. |
| Data/privacy owner | Approved restricted store; access list; retention/deletion policy; provenance/consent; 300–500 frozen cases; two reviewers for ambiguous cases | Approve the store and annotation protocol, then provide a manifest that passes `--decision-run`. Do not put real ink in Git. |
| MyScript legal/privacy/commercial owner | Internal approval of the [public terms checkpoint](myscript-public-terms-checkpoint-2026-08-16.md); written reconciliation of trial research/technical access with DPA transient processing; FERPA/COPPA/student-data terms; quote and negotiated production/SLA/support/publicity terms | Send the shortened vendor questionnaire only after user approval; attach the response and internal go/no-go review. No purchase or contract is authorized here. |
| Product/finance owner | The synthetic-only v2 identity and 1,500-attempt cap are approved and initialized at 0 used. A dashboard quota snapshot before and after remains missing; this approval does not cover real handwriting or paid usage. | Before any v2 request, attach a content-free dashboard snapshot proving at least 1,500 free requests remain. If fewer remain, lower the ledger cap before traffic. Then approve a useful predeclared synthetic manifest rather than spending the allowance by default. |
| Security/product owner | Real user authentication and internal-preview access boundary | Replace/review the shared browser header before any deployed provider route can open. |
| Product/model-cost owner | Approval for same-input Gemini control and, only if needed, a difficult-fallback Luna benchmark | Approve exact sample count, provider(s), cost cap, artifact path, and no-student-data boundary before any new model requests. |

## Resume order after unblocking

1. Capture the target-device Gemini baseline and internal scheduling A/B export.
2. Freeze and validate the two-reviewer decision corpus and durable-store ledger.
3. Reconcile provider dashboard quota and execute the predeclared same-input
   MyScript/Gemini comparison under the newly approved cap.
4. Record a category-specific MyScript go/no-go without weakening thresholds.
5. If a category passes, run an authenticated internal hybrid canary and prove
   visible correction, outage handling, and rollback; otherwise retain Gemini
   and evaluate only the best approved alternative through the same protocol.
6. Benchmark written chemistry, molecular structures, and difficult image
   fallback as separate categories before any expansion.

Until those owners attach evidence, keep all MyScript flags false, never modify
or reuse the exhausted v1 ledger, and do not send student handwriting to a new
provider. The v2 authorization permits bounded synthetic evaluation only after
its dashboard and manifest gates pass.
