# MyScript Synthetic Linear v2 Results — 2026-08-16

## Scope and immutable identity

This is the result of the single predeclared run in
[`myscript-synthetic-v2-plan-2026-08-16.md`](myscript-synthetic-v2-plan-2026-08-16.md).
It used deterministic synthetic vector strokes only. No student, tester,
teacher, account, notebook, or other personal content was sent.

| Field | Value |
|---|---|
| Run ID | `myscript-synthetic-poc-20260816-v2` |
| Corpus | `synthetic-myscript-linear-v2` |
| Manifest SHA-256 | `891311d9a3b8939c741ddbe5c92276f39a2431fad42f00784d8a93e58369dd20` |
| Provider / model | `myscript` / `iink-recognize-v4` |
| Configuration / normalization | `math-latex-rest-v1` / `v2` |
| Fixtures | 300 synthetic vector expressions |
| Decision eligibility | `false` — synthetic, single reviewer, no target-device or control run |

Raw predictions, the append-only ledger, and the aggregate JSON remain outside
Git in the owner-only v2 directory with mode `0600`. This report contains only
content-free aggregate evidence. Production and POC-route feature flags were
not changed.

## Execution and quota reconciliation

| Check | Result |
|---|---:|
| Provider successes | 300/300 (100%) |
| Timeout + errors | 0/300 (0%) |
| Retries | 0 |
| Ledger before / after | `0 / 1500` → `300 / 1500` used |
| Authorized ledger capacity remaining | 1,200 attempts |
| MyScript dashboard before / after | 50 → 350 total requests |
| Expected dashboard after | 50 prior + 300 v2 = 350 |
| Ledger/dashboard discrepancy | 0 |
| Published free allowance remaining | 2,000 - 350 = 1,650 requests |

The run consumed exactly one request per fixture and did not use its permitted
single transient retry. The unused ledger capacity is not permission to send
real handwriting, enable production, incur paid usage, or run a new corpus.

## Frozen-gate results

| Geometry group | Exact | Parse | Latency p50 / p95 | Gate result |
|---|---:|---:|---:|---|
| Lowercase standard | 59/60 (98.33%) | 59/60 (98.33%) | 143.5 / 237.30 ms | Pass |
| Lowercase narrow | 58/60 (96.67%) | 60/60 (100%) | 142.5 / 236.05 ms | Pass |
| Lowercase wide | 57/60 (95.00%) | 58/60 (96.67%) | 139.5 / 224.25 ms | Pass |
| Lowercase tall | 60/60 (100%) | 60/60 (100%) | 141.5 / 237.20 ms | Pass |
| Full height, descriptive only | 51/60 (85.00%) | 52/60 (86.67%) | 140.0 / 238.05 ms | No threshold |
| Overall | 285/300 (95.00%) | 289/300 (96.33%) | 141.0 / 237.00 ms | Diagnostic only |

All four lowercase geometry groups met the predeclared 95% exact, 95% parse,
and sub-500 ms provider-latency p95 gates. Provider success, error rate, and
ledger reconciliation also passed their frozen gates. The full-height group
was intentionally excluded from pass/fail because its case is visually
ambiguous.

## Content-free mismatch classification

Of the 15 non-exact primary transcriptions:

- 8 were case-only mismatches, all in the full-height group;
- 4 were other mismatches whose primary transcription still parsed; and
- 3 were other mismatches whose primary transcription did not parse.

No `X` → `x` rewrite was introduced. The paired result supports using an
explicit lowercase x-height as the synthetic/default geometry and treating
full-height crossing strokes as case-ambiguous. It does not establish accuracy
for real writers or target tablets.

## Decision

`NO_DECISION` remains correct. This run closes the bounded synthetic geometry
diagnostic and demonstrates a reliable technical boundary, but it cannot select
a production provider. A provider decision still requires a consented target-
device corpus in approved restricted storage, two-reviewer annotations,
same-input Gemini control, privacy/legal approval before student traffic, real
authentication, and an enabled canary with rollback evidence.
