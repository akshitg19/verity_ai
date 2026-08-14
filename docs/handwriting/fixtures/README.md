# Handwriting Evaluation Fixtures

This directory contains the fixture schema and synthetic examples. Do not commit
real student handwriting here merely because it matches the schema.

## Format

- Store the manifest as JSONL: one fixture object per line.
- Validate every record against `fixture.schema.json`.
- Keep stroke and image paths relative to the approved fixture-store root.
- Version the manifest and normalization rules used for every benchmark run.

## Data handling

- Synthetic and intentionally created internal fixtures may be committed after
  review.
- Consented user fixtures require the approved restricted storage location,
  retention period, deletion process, and access policy.
- Never include account IDs, notebook IDs, names, email addresses, or free-form
  notes that can identify a student.
- Ordinary application and latency logs must not contain strokes, images,
  expected answers, or provider transcriptions.

`cases.example.jsonl` demonstrates the record shape only. Its referenced sample
files do not exist and its records must not be included in accuracy totals.
