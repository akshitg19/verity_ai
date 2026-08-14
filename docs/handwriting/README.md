# VerityAI Handwriting v2

This directory is the source of truth for the handwriting-recognition redesign.
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
- [Fixture schema](fixtures/fixture.schema.json) defines the machine-readable
  test-case format.
- [Example fixtures](fixtures/cases.example.jsonl) show valid JSONL records. They
  are examples, not benchmark results.

## Status

- Architecture status: proposed and ready for implementation review.
- Production recognizer: Gemini image transcription.
- Vector recognizer: not integrated.
- Recommended vector POC: MyScript iink, pending credentials and evaluation.
- Image fallback candidate: current Gemini implementation.
- Alternative fallback candidate: GPT-5.6 Luna, pending a controlled benchmark.

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
