# Handwriting Evaluation Fixtures

This directory contains the fixture, stroke, and provider-prediction schemas plus
synthetic shape examples. Do not commit real student handwriting here merely
because it matches a schema.

## Format

- Store the manifest as JSONL: one fixture object per line.
- Validate every record against `fixture.schema.json`.
- Validate referenced stroke JSON against `stroke.schema.json`.
- Store provider output as JSONL matching `prediction.schema.json` in the
  approved restricted artifact store.
- Keep stroke and image paths relative to the approved fixture-store root.
- Version the manifest and normalization rules used for every benchmark run.
- Every scored prediction must declare the exact `normalization_version` used
  for its cached parser metric. The scorer rejects missing, mixed, or stale
  versions rather than silently combining incompatible evidence.
- Name every provider that may process a fixture in
  `consent.approved_providers`; the replay planner fails closed for any other
  provider.
- Reference an approved retention rule with `consent.retention_policy_id`.
- Link each record to non-PII provenance evidence with
  `consent.provenance_id`; keep the underlying consent or generation record in
  the restricted governance store.

## Data handling

- Synthetic and intentionally created internal fixtures may be committed after
  review.
- Consented user fixtures require the approved restricted storage location,
  retention period, deletion process, and access policy.
- Never include account IDs, notebook IDs, names, email addresses, or free-form
  notes that can identify a student.
- Ordinary application and latency logs must not contain strokes, images,
  expected answers, or provider transcriptions.
- Treat replay plans and prediction JSONL as restricted raw artifacts. Aggregate
  reports are intentionally content-free.

`cases.example.jsonl` demonstrates the record shape only. Its referenced sample
files do not exist and its records must not be included in accuracy totals.
`predictions.example.jsonl` copies the example truth solely to exercise the
scoring pipeline. Its records set `benchmark_eligible` to false and must never be
reported as provider evidence.

`synthetic-myscript-smoke-v1/` contains the original 30 deterministic
single-line vector fixtures. `synthetic-myscript-x-case-v1/` adds ten paired
full-height/lowercase-height `x` comparisons. Within a pair the equation,
timestamps, jitter, and every non-`x` stroke are identical. Both sets are
synthetic, one-reviewer, MyScript-approved technical POC evidence and remain
ineligible for a provider decision. Their live aggregate is documented in
`../myscript-synthetic-poc-2026-08-16.md`; raw predictions are not in Git.

`synthetic-myscript-linear-v2/` contains the separately authorized 300-case
diagnostic: 60 linear equations across five controlled `x` geometries. Within
each five-way group only the two `x` strokes may differ. Generate it with
`python scripts/generate_synthetic_myscript_linear_v2.py`; its frozen manifest
hash and reporting gates are in
[`../myscript-synthetic-v2-plan-2026-08-16.md`](../myscript-synthetic-v2-plan-2026-08-16.md).
It remains single-reviewer synthetic evidence and is not production accuracy.

`synthetic-chemistry-routing-v1/` is a committed, deterministic routing corpus
with eight written-chemistry and two molecular-structure records. Every record
contains both bounded vector strokes and a generated PNG. It covers chemistry
capitalization, letter/digit ambiguity, subscripts, superscripts, ionic charge,
reaction arrows, and graph-shaped molecular input. Written records use the
`chemistry_text`/`text` contract; drawings use the separate
`chemistry_structure`/`smiles` contract. MyScript is deliberately absent from
`approved_providers`. The one-reviewer synthetic set validates routing and
harness behavior only and is not provider-decision evidence.

## Offline evaluation CLI

Run from `backend/` after installing `requirements.txt`.

Validate the shape-only examples without opening their intentionally missing
inputs:

```bash
python -m handwriting_eval.cli validate \
  --manifest ../docs/handwriting/fixtures/cases.example.jsonl \
  --manifest-only
```

Validate a real restricted corpus, including stroke/PNG files and decision
review gates:

```bash
python -m handwriting_eval.cli validate \
  --manifest /approved/store/corpus-v1.jsonl \
  --fixture-root /approved/store \
  --decision-run
```

Create a provider-specific, ground-truth-free replay plan. This does not make
network calls. It verifies every input, checks provider approval, enforces the
request cap, and writes the raw plan with owner-only permissions on POSIX:

```bash
python -m handwriting_eval.cli plan \
  --manifest /approved/store/corpus-v1.jsonl \
  --fixture-root /approved/store \
  --provider myscript \
  --run-id myscript-rest-poc-1 \
  --request-cap 1500 \
  --output /approved/store/runs/myscript-rest-poc-1.plan.json \
  --decision-run
```

Create the separate content-free attempt ledger on the approved durable store,
outside the repository. Its identity and cap must exactly match the replay run:

```bash
python -m handwriting_eval.cli ledger-init \
  --ledger /approved/store/runs/myscript-rest-poc-1.handwriting-ledger.jsonl \
  --provider myscript \
  --run-id myscript-rest-poc-1 \
  --request-cap 1500
```

Every replay executor must reserve exactly one ledger sequence immediately
before each HTTP attempt, including retries and failed attempts. The MyScript
production factory does this internally through the Python API. The standalone
command below is an integration/diagnostic hook for an executor that does not
call that factory; never run both mechanisms for the same attempt, or it will be
counted twice:

```bash
python -m handwriting_eval.cli ledger-reserve \
  --ledger /approved/store/runs/myscript-rest-poc-1.handwriting-ledger.jsonl \
  --provider myscript \
  --run-id myscript-rest-poc-1 \
  --request-cap 1500
```

Use `ledger-status` with the same arguments for a content-free before/after
record. The append-only sequence survives executor restarts and stops before
attempt 1501. It fails closed on corruption, identity mismatch, owner-permission
violations, an existing lock, or an exhausted cap. A reservation abandoned by a
crash still consumes budget. Do not delete a stale lock or edit/reset a ledger
without a recorded operator review and reconciliation with the provider
dashboard. The MyScript production factory also refuses to enable without
`MYSCRIPT_EVAL_LEDGER_PATH` and `MYSCRIPT_EVAL_RUN_ID`; the path must reference
this approved durable store, not an ephemeral container filesystem.

After an approved adapter writes predictions matching
`prediction.schema.json`, produce a content-free aggregate report:

```bash
python -m handwriting_eval.cli score \
  --manifest /approved/store/corpus-v1.jsonl \
  --fixture-root /approved/store \
  --predictions /approved/store/runs/myscript-rest-poc-1.predictions.jsonl \
  --corpus-version corpus-v1 \
  --verify-inputs \
  --decision-run \
  --output /approved/reports/myscript-rest-poc-1.aggregate.json
```

The scorer reports exact match, top-k inclusion, character error, parser and
unreadable metrics, p50/p95 latency, failures, payload size, correction/fallback
rates, observed cost, and category/device/browser breakdowns. It omits raw
outputs, expected expressions, fixture IDs, and absolute restricted-store paths.

Legacy MyScript smoke predictions can be migrated without another provider
request. The source and output must be distinct JSONL files in the same
owner-only directory outside the repository:

```bash
cd backend
python -m handwriting_eval.myscript_reprocess \
  --source /approved/store/predictions-v1.jsonl \
  --output /approved/store/predictions-v2.jsonl
```

The command preserves the source, writes an owner-only derived artifact,
recomputes deterministic algebra parse success, and emits content-free counts
only. It accepts MyScript math artifacts only.
