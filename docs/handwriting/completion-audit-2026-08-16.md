# Handwriting v2 Definition-of-Done Audit

**Audit date:** 2026-08-16; last verified 2026-08-17

**Audited repository/frontend source:** PR #71 merge `628ed62`; Vercel
production and protected schema-v3 preview deployments successful

**Audited backend runtime source:** `3b1ca95`, deployed as verified disabled
revision `verity-ai-00022-2vj`

**Deployment evidence:** build `37fec1f2-8ed5-43dd-b1aa-d004e32bc760`;
[content-safe record](current-main-disabled-deployment-evidence-2026-08-17.md)
**Goal status:** active; production-ready completion is not yet proven.

This audit uses the 23-item Definition of Done from the user-approved completion
goal. `Complete` means current repository or runtime evidence directly proves
the item. `External evidence required` means the safe provider-neutral work is
complete but the item cannot be claimed without a named owner supplying new
evidence or approval.

## Current verified checkpoint

- Production recognizer remains Gemini image transcription.
- PR #71's Vercel production deployment serves the default-off identity code;
  a read-only `/math` smoke still opened the Gemini workspace directly with no
  sign-in gate or console error.
- Current backend revision is `verity-ai-00022-2vj`, serving 100% of Cloud Run
  traffic with `MYSCRIPT_ENABLED=false` and
  `MYSCRIPT_POC_ROUTE_ENABLED=false`.
- Both MyScript environment variables reference reviewed Secret Manager numeric
  version `1`; no secret value was read for verification.
- The synthetic MyScript POC used its full approved 50-attempt ledger: the
  initial 30-case set reports 26/30 exact/parse (86.67%), while the paired
  `x/X` probe reports 10/10 for explicit lowercase x-height and 9/10 for
  full-height `x`. All 50 provider calls succeeded with zero retry/error.
- The separate [300-case v2 synthetic diagnostic](myscript-synthetic-v2-results-2026-08-16.md)
  completed with 300/300 provider successes, zero retry/error, 95.00% overall
  exact match, and 96.33% parse success. All four lowercase geometry groups
  passed their frozen exact/parse/latency gates. The owner-only ledger is now
  `1500 / 300 / 1200`; the dashboard moved from 50 to 350 requests, a
  discrepancy of zero, leaving 1,650 of the published 2,000-request allowance
  at that checkpoint. Subsequent owner-controlled local/manual ledgers are not
  included in that historical dashboard reconciliation, so no newer
  account-wide remaining total is claimed here.
- Frontend and backend production health returned HTTP 200 at audit time.
- PR #71 adds an explicit anonymous consent gate before A/B metric collection,
  schema-v3 exports, and complete-pair coverage checks for approved coarse
  target environments. Its protected Vercel preview deployed successfully;
  unauthenticated HTTP requests redirect to Vercel Authentication as intended.
- The original landing-page worktree still contains the same six unrelated
  modified/untracked paths and was not edited, stashed, reset, or merged.

## Requirement-by-requirement audit

| # | Requirement | Status | Authoritative evidence / missing proof |
|---:|---|---|---|
| 1 | Original dirty landing work remains intact | Complete | Read-only `git status` still shows the original three modified and three untracked landing files. All handwriting work used the clean goal worktree. |
| 2 | Phase 0–2 and historical paths are current | Complete | [README](README.md), [handoff](HANDOFF.md), and [implementation log](implementation-plan.md) record merged PRs and current safe state. |
| 3 | Measured Gemini baseline | External evidence required | Lifecycle instrumentation and a strict schema-v3 consent/readiness workflow exist in the [baseline report](baseline-report-2026-08-14.md), but no target-tablet p50/p95 export exists. |
| 4 | Documented teammate A/B path | Mechanism complete; results external | [Internal A/B comparison](internal-ab-comparison.md) provides the exact protected preview, frozen tasks, pre-collection anonymous consent, session-scoped pairing, policy/content validation, approved target-environment coverage, 3–5-pair readiness gates, metrics, rollback, and aggregation. Results from 3–5 voluntarily consenting teammates are not attached. |
| 5 | Reproducible validation/replay/scoring harness | Complete | Schemas, content-safe scorer, durable ledger, MyScript runner, normalization-version enforcement, and offline reprocessor are merged and tested. |
| 6 | Approved versioned decision corpus | External evidence required | A versioned 300-case synthetic v2 geometry corpus is frozen and MyScript-approved for diagnostic use, but it remains single-reviewer and decision-ineligible. No approved 300–500-case, two-reviewer, target-device corpus with restricted-store policy exists. |
| 7 | Provider commercial/privacy/security terms verified | Public evidence complete; internal/vendor approval external | [Public terms checkpoint](myscript-public-terms-checkpoint-2026-08-16.md) verifies the 2,000-request internal-evaluation limit, trial-result research use, DPA cloud-recognition scope, transient content handling, 12-month IP logs, subprocessors/regions, no public uptime guarantee, and attribution/publicity terms. Written reconciliation of V.8 access clauses with the DPA, FERPA/COPPA/student-data approval, production quote, negotiated SLA/support, and acceptable publicity terms remain missing. |
| 8 | MyScript category evaluation or evidence-backed no-go | External evidence required | The bounded synthetic POC and frozen 300-case diagnostic prove the REST boundary. Every lowercase geometry group passed its diagnostic gates, while the descriptive full-height group contained all eight case-only mismatches. The corpora remain decision-ineligible and no category/device comparison against Gemini exists, so neither adoption nor rejection is justified. |
| 9 | Alternative evaluated if MyScript rejected | Not yet applicable | MyScript has not received a valid go/no-go decision. Provider-neutral alternative screening is documented, but no replacement benchmark is authorized. |
| 10 | Selected fast path passes accuracy/parse gate | External evidence required | In the 300-case diagnostic, standard/narrow/wide/tall lowercase groups each passed predeclared 95% exact, 95% parse, and p95 <500 ms gates. This remains synthetic, single-reviewer evidence; no production tolerance or eligible same-input Gemini target-device baseline exists. |
| 11 | Latency, stale, and duplicate gates measured | Partially complete; target evidence external | Stale and duplicate behavior is regression-tested and content-free lifecycle stages exist. PR #65 additionally prevents the one-shot MyScript REST path from auto-submitting partial expressions after short pauses and disables repeat clicks while recognition is active. Target-device provisional/final/verdict p50/p95 are unmeasured. |
| 12 | One-shot observable/correctable rollback-safe hybrid | Mechanism complete; enabled canary external | PR #47 proves one primary, at most one fallback, no normal-path PNG, timeout abort, cancellation, outage propagation, and no recursion. PR #65 makes the non-streaming REST path explicitly finalize the active row while retaining automatic previous-row completion. Component/workflow regressions prove each recognized math line is visibly editable, correction invalidates the old verdict, and only the edited transcription is rechecked. An approved authenticated enabled canary remains untested. |
| 13 | Evidence-backed image-fallback provider decision | External evidence required | Gemini remains the safe default. No approved difficult-fallback corpus or identical-image Gemini/Luna benchmark exists. |
| 14 | Written chemistry and structures are separate | Routing complete; recognition evidence external | Existing app tests plus [synthetic chemistry routing fixtures](fixtures/synthetic-chemistry-routing-v1/manifest.jsonl) separate `chemistry_text/text` from `chemistry_structure/smiles`. Target-device recognition accuracy/latency is missing. |
| 15 | No raw content in ordinary logs | Complete for implemented paths | Content-safe metrics, aggregate reports, adapter errors, reprocessor failures, and disabled verifier are covered by tests. Raw prediction artifacts remain outside Git in an owner-only directory. |
| 16 | No provider secret in Git/frontend/build/docs/logs | Complete for current state | Production bundle scan passes; secrets are backend Secret Manager references; local credential file is ignored and was never read or printed. |
| 17 | Relevant local and remote checks pass | Complete for merged work | PR #71 passes 413 frontend tests across 44 files, lint, production build, and the production API/provider-secret check. Its Linux backend, Windows backend, frontend, and Vercel checks passed; post-merge main CI run `32000117180` also passed all three jobs. The access-boundary verifier has 20 focused tests and the full backend at 1324 / 3 expected xfails; its exact source also returns `PASS` against the live revision. |
| 18 | Reviewable PRs merged to current main | Complete for safe deliverables | The default-off identity mechanism is merged by PR #67 and backend deployment evidence by PRs #68–#70. PR #71 merges consent-gated target-device evidence tooling at `628ed62`. Cloud Run remains exact backend source `3b1ca95` as fully disabled revision `verity-ai-00022-2vj`; Vercel production is current through PR #71. |
| 19 | Preview/staging smoke tests pass | Partially complete | Vercel production for `628ed62`, the protected PR #71 schema-v3 preview, and Cloud Build `37fec1f2-8ed5-43dd-b1aa-d004e32bc760` pass. Unauthenticated preview requests return the expected authentication redirect. The enhanced Cloud Run verifier proves 100% traffic to disabled revision `verity-ai-00022-2vj`, false MyScript/shared-access flags, identity mode off, empty OAuth/API-secret/allow-list configuration, pinned secret references, and HTTP 200/200/404/200. No target-device authenticated enabled-provider preview is authorized. |
| 20 | Production rollout completed or fully rollout-ready | Mechanism complete; external evidence required | The safe state is fully disabled. A strict rollout manifest gate exists, and a default-off Google identity mechanism now verifies official ID tokens, audience/issuer/expiry, and exact allow-lists while refusing shared-key bypass. It still has no real OAuth client, configured reviewers, security approval, or real-account device canary. No valid rollout manifest exists because provider selection, eligible corpus/device evidence, privacy/commercial/security/data/product approvals, and canary evidence remain missing. |
| 21 | Rollback commands verified | Mechanism complete; enabled rollback external | [Runbook](rollout-runbook.md) contains frontend/backend kill switches; every reviewed Cloud Build restores false flags; live disabled verifier passes. An enabled-provider rollback cannot be exercised before an enabled canary is approved. |
| 22 | Current architecture/status/results/risks/maintenance docs | Complete | Architecture, implementation log, evaluation report, POC evidence, readiness, rollout, and this audit are current. |
| 23 | Final Chinese handoff | Pending goal completion | A final production/provider decision handoff would be misleading until the external evidence above exists. |

## Exact external unblock package

| Owner | Required evidence or decision | Next action that unlocks engineering |
|---|---|---|
| Product/QA owner | Named coarse tablet/browser matrix; 3–5 voluntarily consenting internal testers; completed schema-v3 content-free Phase A/B exports | Open the protected preview, record each locally displayed coarse environment for matrix approval, then run the documented baseline/A-B tasks and attach aggregate exports without handwriting content or identifiers. |
| Data/privacy owner | Approved restricted store; access list; retention/deletion policy; provenance/consent; 300–500 frozen cases; two reviewers for ambiguous cases | Approve the store and annotation protocol, then provide a manifest that passes `--decision-run`. Do not put real ink in Git. |
| MyScript legal/privacy/commercial owner | Internal approval of the [public terms checkpoint](myscript-public-terms-checkpoint-2026-08-16.md); written reconciliation of trial research/technical access with DPA transient processing; FERPA/COPPA/student-data terms; quote and negotiated production/SLA/support/publicity terms | Send the shortened vendor questionnaire only after user approval; attach the response and internal go/no-go review. No purchase or contract is authorized here. |
| Product/finance owner | The synthetic-only v2 run is complete at 300/1,500 attempts. Dashboard reconciliation passed at 350 total requests with zero discrepancy and 1,650 published free requests remaining. This approval does not cover real handwriting, paid usage, production, or a new corpus. | No further MyScript request is needed for this diagnostic. Retain the unused ledger capacity until a separately reviewed purpose is approved. |
| Security/product and OAuth owners | Review the [default-off Google identity boundary](google-identity-boundary-2026-08-16.md); approve the exact web OAuth audience/origins and exact-user policy; create the OAuth client only after approval; provide allowed subjects and real-account iPad/desktop allow/deny/expiry/sign-out evidence | Assign an authentication evidence ID and configure a stable non-production preview. The shared header cannot bypass Google mode and remains insufficient by itself. |
| Product/model-cost owner | Approval for same-input Gemini control and, only if needed, a difficult-fallback Luna benchmark | Approve exact sample count, provider(s), cost cap, artifact path, and no-student-data boundary before any new model requests. |

When these owners finish, assemble only content-free repository evidence and
run `scripts/validate_handwriting_rollout_approval.py` against the exact release
commit. A `PASS` summary is required for an activation PR but is not itself an
authorization to deploy or send student ink.

## Resume order after unblocking

1. Capture the target-device Gemini baseline and internal scheduling A/B export.
2. Freeze and validate the two-reviewer decision corpus and durable-store ledger.
3. Freeze the provider decision protocol, then execute a separately approved
   same-input MyScript/Gemini comparison on the eligible corpus.
4. Record a category-specific MyScript go/no-go without weakening thresholds.
5. If a category passes, run an authenticated internal hybrid canary and prove
   visible correction, outage handling, and rollback; otherwise retain Gemini
   and evaluate only the best approved alternative through the same protocol.
6. Benchmark written chemistry, molecular structures, and difficult image
   fallback as separate categories before any expansion.

Until those owners attach evidence, keep all MyScript flags false, never modify
or reuse the exhausted v1 ledger, and do not send student handwriting to a new
provider. The completed v2 authorization remains synthetic-only and does not
authorize a new corpus, real handwriting, paid usage, or production activation.
