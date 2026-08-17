# VerityAI Handwriting v2

This directory is the source of truth for the handwriting-recognition redesign.

Provider licensing, privacy, credential mapping, and POC go/no-go evidence are
tracked in `provider-readiness.md`. Corpus and scorer commands are documented in
`fixtures/README.md`.
It replaces chat history and the older workspace-level handoff as the authority
for implementation decisions.

## Documents

- [Complete handoff](HANDOFF.md) consolidates the discussion, implemented work,
  validation evidence, workspace state, and exact continuation steps.
- [Definition-of-Done audit](completion-audit-2026-08-16.md) maps all 23 goal
  requirements to current evidence, named external owners, and exact unblock
  actions without claiming production readiness prematurely.
- [Architecture](architecture-v2.md) defines responsibilities, contracts,
  data flow, fallback rules, metrics, privacy boundaries, and decisions.
- [Implementation plan](implementation-plan.md) divides the work into
  reviewable phases with acceptance criteria.
- [Evaluation plan](evaluation-plan.md) defines the corpus and the measurements
  used to compare recognizers.
- [Phase A baseline](baseline-report-2026-08-14.md) records the re-verified test
  baseline, lifecycle coverage, and the outstanding target-device evidence.
- [Internal A/B comparison](internal-ab-comparison.md) defines the consented
  Gemini scheduling comparison, schema-v3 consent-gated content-free export,
  anonymous session pairing, target-environment coverage, and strict 3–5-pair
  evidence-readiness workflow.
- [Provider readiness](provider-readiness.md) records current official-source
  licensing, privacy, pricing, secret mapping, POC budget, and rollout gates.
- [MyScript public terms checkpoint](myscript-public-terms-checkpoint-2026-08-16.md)
  separates facts verified from the current pricing, V.8 license, and May 2026
  DPA from the shorter set of written vendor/internal approvals still missing.
- [Provider evaluation report](provider-evaluation-report.md) records the
  current synthetic-smoke/no-decision checkpoint and the mandatory category/device report
  contract; `NOT_MEASURED` fields must not be inferred from examples.
- [MyScript synthetic POC evidence](myscript-synthetic-poc-2026-08-16.md)
  records the approved 50-call synthetic-only run: the initial 30-case smoke,
  paired 20-case `x/X` geometry probe, and separate aggregate results.
- [MyScript synthetic v2 authorization](myscript-synthetic-authorization-2026-08-16-v2.md)
  records the separate 1,500-attempt synthetic-only ceiling, initial ledger,
  dashboard pre-request gate, and exclusions for student data, production, and
  paid usage.
- [MyScript dashboard quota evidence](myscript-dashboard-quota-evidence-2026-08-16.md)
  reconciles the read-only account counter before (50) and after (350) the v2
  run to both ledgers with zero discrepancy.
- [MyScript synthetic linear v2 plan](myscript-synthetic-v2-plan-2026-08-16.md)
  freezes the 300-case five-way geometry corpus, manifest hash, stop rules, and
  reporting gates before any v2 provider result is observed.
- [MyScript synthetic linear v2 results](myscript-synthetic-v2-results-2026-08-16.md)
  records the content-free 300-case aggregate, frozen-gate outcomes, mismatch
  classes, quota reconciliation, and continuing `NO_DECISION` boundary.
- [Rollout runbook](rollout-runbook.md) records the disabled deployment check,
  executable content-free approval gate, activation prerequisites, monitoring,
  outage response, and kill switches.
- [Google identity boundary evidence](google-identity-boundary-2026-08-16.md)
  records the default-off real-user authentication mechanism, fail-closed
  allow-list, token handling, tests, and exact external activation evidence.
- [Rollout approval schema](rollout-approval.schema.json) defines the strict
  evidence contract that a future activation manifest must satisfy, including
  the exact governance ID and governance-artifact hash approved by the
  data-governance owner. The validator must also load the actual external
  governance JSON and restricted corpus manifest metadata and cross-check both
  artifacts; no valid real approval manifest exists while the current decision
  is `NO_DECISION`.
- [Disabled deployment evidence](disabled-deployment-evidence-2026-08-16.md)
  records the exact build, revision, false flags, secret references, image
  digest, and content-safe rollout checks without reading secret values.
- [Secret-version pinning evidence](secret-version-pinning-evidence-2026-08-16.md)
  records the reviewed numeric references, build guard, updated disabled
  revision, and repeated content-safe checks.
- [Current disabled deployment evidence](current-disabled-deployment-evidence-2026-08-16.md)
  records the historical post-POC build, image digest, revision, false flags,
  numeric secret references, and repeated content-safe checks.
- [Current-main disabled deployment evidence](current-main-disabled-deployment-evidence-2026-08-16.md)
  records the historical `b9b1d76` disabled deployment.
- [2026-08-17 current-main disabled deployment evidence](current-main-disabled-deployment-evidence-2026-08-17.md)
  records build `37fec1f2-8ed5-43dd-b1aa-d004e32bc760`, revision
  `verity-ai-00022-2vj`, exact source `3b1ca95`, false flags, numeric secret
  references, the deployed default-off identity boundary, and the repeated
  fail-closed verifier result.
- `scripts/verify_disabled_myscript_revision.py` reproduces the allowlisted
  revision-metadata and fail-closed smoke checks without accessing Secret
  Manager values. It also proves the shared-access escape hatch and Google
  identity mode are off and that no API secret, OAuth client, or identity
  allow-list is configured before making any HTTP request.
- [Fixture schema](fixtures/fixture.schema.json) defines the machine-readable
  test-case format.
- [Stroke schema](fixtures/stroke.schema.json) bounds replayable digital ink,
  and [prediction schema](fixtures/prediction.schema.json) defines restricted
  provider-run output.
- [Corpus governance schema](fixtures/corpus-governance.schema.json) binds an
  exact corpus hash and count to content-free storage, consent, retention,
  deletion, provider, dual-review, and approval-window evidence; every decision
  run must pass it before planning or scoring.
- [Example fixtures](fixtures/cases.example.jsonl) show valid JSONL records. They
  are examples, not benchmark results.
- [Synthetic chemistry routing fixtures](fixtures/synthetic-chemistry-routing-v1/manifest.jsonl)
  provide real stroke/PNG files for written-chemistry versus molecular-structure
  routing tests; they are single-reviewer synthetic evidence, not a benchmark.

## Status

- Architecture status: Phase 0–2 merged by PR #31 (`cfa06e0`), Phase A/B by PR
  #32 (`156d724`), and provider readiness/offline evaluation by PR #33
  (`e01d28e`). The disabled backend adapter was merged by PR #34 (`949e1ea`),
  PR #35 added the disabled frontend POC boundary, PR #36 added the durable
  attempt ledger, PR #37 added the explicit evaluation checkpoint, PRs #38–#40
  deployed and pinned the disabled boundary, and PR #42 adds repeatable
  disabled-revision verification. PR #43 adds the bounded synthetic POC and its
  reviewed adapter/evaluation fixes; PR #44 documents the disabled deployment;
  PR #45 adds normalization `v2`, versioned prediction evidence, and
  zero-request offline reprocessing; PR #46 records the exact post-POC disabled
  revision; PR #47 hardens the one-shot hybrid fallback; PR #48 adds synthetic
  chemistry routing evidence; PR #49 adds the 23-item completion audit; PR #50
  proves visible correction and freezes public MyScript terms; and PR #51
  completes the bounded paired `x/X` geometry probe. PR #52 finalizes the
  cross-phase audit; PRs #53–#55 authorize and align the 1,500-attempt v2
  boundary; PR #56 freezes the deterministic 300-case v2 corpus and gates; and
  PR #57 records the completed run, reconciliation, and content-free results.
  PR #59 repaired schema-v2 paired target-device A/B evidence; PR #71 replaces
  it with an explicit pre-collection consent gate, schema-v3 exports, and
  required coarse target-environment coverage. PR #72 records the exact
  protected preview and exposes a local-only coarse environment preflight label
  before consent. PR #73 requires exact content-free corpus governance for
  every decision validate/plan/score path and binds the governance artifact to
  rollout approval. PR #74 requires the activation validator to load the actual
  external corpus manifest and governance JSON and cross-check every frozen
  decision/retention/deletion field without opening ink/image inputs. PR
  #61 adds the fail-closed production activation evidence gate; PR #63 records
  the historical disabled deployment of runtime source `b9b1d76`; and PR #65 prevents one-shot MyScript REST from
  auto-submitting partial expressions between pen strokes. PR #67 adds the
  default-off, exact-allow-list Google identity boundary and removes the shared
  header as a sufficient deployed-MyScript access condition. Build
  `37fec1f2-8ed5-43dd-b1aa-d004e32bc760` deploys backend source `3b1ca95` as
  fully disabled revision `verity-ai-00022-2vj` and passes the repeatable
  verifier.
- Production recognizer: Gemini image transcription.
- Finalization: 750ms image policy; 350ms vector hypothesis with provisional
  support; at most two recognition workers with ordered final judgment.
- Vector recognizer: the backend MyScript REST adapter and internal route are
  deployed in disabled revision `verity-ai-00022-2vj`. A separate local,
  synthetic-only 50-call POC proved the live REST boundary and characterized
  `x/X` geometry sensitivity. The separate v2 synthetic diagnostic completed
  300/300 calls with a 300/1500 ledger; the account-wide counter reconciles at
  350 used with zero discrepancy and 1,650 published free requests remaining
  at that checkpoint. Later owner-controlled local/manual attempts use separate
  content-free ledgers and require a new dashboard reconciliation before any
  remaining-account-total claim. Cloud Run and production frontend MyScript
  traffic remain disabled.
- Recommended vector POC: MyScript iink. The developer application, local
  credential file, GCP secrets, and runtime-service-account secret access are
  complete. Disabled deployment, numeric secret-version pinning, and
  revision-metadata verification are complete; licensing/privacy approval and
  evaluation remain.
- Image fallback candidate: current Gemini implementation.
- Alternative fallback candidate: GPT-5.6 Luna, pending a controlled benchmark.
- Current safe work: numeric secret-version pinning is deployed and verified;
  a fail-closed verifier checks future disabled revisions before any provider
  request can be possible. A default-off Google ID-token boundary is implemented
  and fully tested locally, but has no OAuth client, allow-list, external
  security approval, real-account canary, or production activation.
- Next gates: voluntary schema-v3 target-device Phase A/B exports; internal approval of the public
  terms checkpoint plus written MyScript reconciliation/commercial and
  student-privacy answers before student/production use; an approved consented
  raw-stroke decision corpus; same-input Gemini control evidence; and a reviewed
  separately approved eligible corpus and same-input control protocol before
  any new provider evaluation.

## Working agreement for AI-assisted changes

Every implementation task must:

1. Read this index, the architecture, and the relevant phase in the
   implementation plan.
2. Inspect the current code and tests instead of assuming the documents are
   perfectly current.
3. Work on one phase only unless the user explicitly expands the scope.
4. Preserve recognition/judgment separation and stable expression identities.
5. Add tests for changed behavior and run the documented verification commands.
6. Update the implementation plan with evidence, risks, and follow-up work.
7. Never claim that a provider works without a tested integration and measured
   results.

Recommended task prompt:

```text
Read docs/handwriting/README.md, architecture-v2.md,
implementation-plan.md, and evaluation-plan.md. Inspect the relevant current
code and tests. Implement only Phase <N>. Preserve unrelated changes and the
recognition/judgment boundary. Run the phase's verification commands, report
pre-existing failures separately, and update the implementation plan with
evidence and remaining risks.
```
