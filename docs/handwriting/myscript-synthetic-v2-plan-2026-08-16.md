# MyScript Synthetic Linear v2 Plan — 2026-08-16

## Question and eligibility

This run asks one narrow question: across more varied linear-equation contexts,
how sensitive is MyScript's lowercase `x` transcription to controlled height
and width changes when every digit, operator, timestamp, and jitter sample is
held constant within a group?

It is a **decision-ineligible synthetic diagnostic**, not a production accuracy
benchmark. It cannot substitute for multiple writers, target tablets/browsers,
two reviewers, consent, privacy approval, or a same-input Gemini control.

## Frozen corpus

| Field | Predeclared value |
|---|---|
| Corpus | `synthetic-myscript-linear-v2` |
| Manifest SHA-256 | `891311d9a3b8939c741ddbe5c92276f39a2431fad42f00784d8a93e58369dd20` |
| Expressions | 60 unique linear equations |
| Geometry variants per expression | 5 |
| Fixtures / planned provider calls | 300 / 300 |
| Reviewer / source | one / deterministic synthetic |
| Provider permission | MyScript only |
| Input | ordered vector strokes only; no PNG or identifiers |
| Run ID | `myscript-synthetic-poc-20260816-v2` |
| Durable ledger before run | `1500 / 0 / 1500` |
| Account counter before run | 50 used / 1,950 free |

The five 60-case groups are `lowercase-standard`, `lowercase-narrow`,
`lowercase-wide`, `lowercase-tall`, and `full-height`. Within each five-way
group, exactly the two `x` strokes may differ. Non-`x` stroke objects and all
timestamps must be byte-equivalent after JSON parsing.

The generator is `scripts/generate_synthetic_myscript_linear_v2.py`. Re-running
it must reproduce the manifest hash and leave the original v1 smoke and paired
probe unchanged.

## Execution and stop rules

- Do not initialize or reset the already-created v2 ledger.
- Run the frozen manifest once and write raw predictions only to the owner-only
  v2 directory outside Git.
- Every HTTP attempt, including the adapter's one permitted transient retry,
  reserves the ledger first. Three hundred fixtures therefore have a maximum
  first-execution exposure of 600 attempts; do not rerun automatically.
- Stop the run on authentication, access, quota, ledger, or credential failure.
- Keep `MYSCRIPT_ENABLED=false` and `MYSCRIPT_POC_ROUTE_ENABLED=false` in Cloud
  Run. This execution is local evaluation only.
- Do not read, print, log, or copy the credential values. No student/tester
  content is allowed.

## Frozen reporting gates

Report each geometry group separately. Do not average full-height ambiguity
into the lowercase groups and do not normalize `X` to `x`.

| Metric | Predeclared diagnostic gate |
|---|---:|
| Provider success rate | at least 99% overall |
| Timeout + error rate | at most 1% overall |
| Exact match, each lowercase group | at least 95% |
| Parse success, each lowercase group | at least 95% |
| Provider latency p95, each lowercase group | below 500 ms |
| Ledger/dashboard discrepancy after run | exactly 0 |

`full-height` has no pass threshold because the earlier evidence already shows
that its case is visually ambiguous. Its result is descriptive and must be
compared against its four paired lowercase geometries. Any case-only mismatch
is reported without rewriting provider text.

After execution, score with normalization `v2`, classify every mismatch,
record the content-free aggregate and post-run dashboard counter, and leave the
unused v2 ledger capacity intact for a separately reviewed purpose.

