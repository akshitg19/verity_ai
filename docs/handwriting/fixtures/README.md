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
  --request-cap 650 \
  --output /approved/store/runs/myscript-rest-poc-1.plan.json \
  --decision-run
```

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
