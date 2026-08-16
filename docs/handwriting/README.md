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
- [Architecture](architecture-v2.md) defines responsibilities, contracts,
  data flow, fallback rules, metrics, privacy boundaries, and decisions.
- [Implementation plan](implementation-plan.md) divides the work into
  reviewable phases with acceptance criteria.
- [Evaluation plan](evaluation-plan.md) defines the corpus and the measurements
  used to compare recognizers.
- [Phase A baseline](baseline-report-2026-08-14.md) records the re-verified test
  baseline, lifecycle coverage, and the outstanding target-device evidence.
- [Internal A/B comparison](internal-ab-comparison.md) defines the consented
  Gemini scheduling comparison and content-free export workflow.
- [Provider readiness](provider-readiness.md) records current official-source
  licensing, privacy, pricing, secret mapping, POC budget, and rollout gates.
- [Provider evaluation report](provider-evaluation-report.md) records the
  current no-decision checkpoint and the mandatory category/device report
  contract; `NOT_MEASURED` fields must not be inferred from examples.
- [Rollout runbook](rollout-runbook.md) records the disabled deployment check,
  activation prerequisites, monitoring, outage response, and kill switches.
- [Disabled deployment evidence](disabled-deployment-evidence-2026-08-16.md)
  records the exact build, revision, false flags, secret references, image
  digest, and content-safe rollout checks without reading secret values.
- [Secret-version pinning evidence](secret-version-pinning-evidence-2026-08-16.md)
  records the reviewed numeric references, build guard, updated disabled
  revision, and repeated content-safe checks.
- [Fixture schema](fixtures/fixture.schema.json) defines the machine-readable
  test-case format.
- [Stroke schema](fixtures/stroke.schema.json) bounds replayable digital ink,
  and [prediction schema](fixtures/prediction.schema.json) defines restricted
  provider-run output.
- [Example fixtures](fixtures/cases.example.jsonl) show valid JSONL records. They
  are examples, not benchmark results.

## Status

- Architecture status: Phase 0–2 merged by PR #31 (`cfa06e0`), Phase A/B by PR
  #32 (`156d724`), and provider readiness/offline evaluation by PR #33
  (`e01d28e`). The disabled backend adapter was merged by PR #34 (`949e1ea`),
  PR #35 added the disabled frontend POC boundary, PR #36 added the durable
  attempt ledger, and PR #37 added the explicit evaluation checkpoint.
- Production recognizer: Gemini image transcription.
- Finalization: 750ms image policy; 350ms vector hypothesis with provisional
  support; at most two recognition workers with ordered final judgment.
- Vector recognizer: the backend MyScript REST adapter and internal route are
  deployed in disabled revision `verity-ai-00018-fdv`. PR #35 implements
  unreachable-by-default frontend POC wiring; no live call is enabled.
- Recommended vector POC: MyScript iink. The developer application, local
  credential file, GCP secrets, and runtime-service-account secret access are
  complete. Disabled deployment, numeric secret-version pinning, and
  revision-metadata verification are complete; licensing/privacy approval and
  evaluation remain.
- Image fallback candidate: current Gemini implementation.
- Alternative fallback candidate: GPT-5.6 Luna, pending a controlled benchmark.
- Current safe work: numeric secret-version pinning is deployed and verified
  with both provider gates false and no provider request.
- Next gates: target-device Phase A/B exports; written MyScript commercial and
  student-privacy answers; approved durable ledger storage and restart proof;
  and an approved consented raw-stroke corpus before live Phase 3 evaluation.

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
