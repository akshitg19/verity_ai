# MyScript Synthetic POC Evidence — 2026-08-16

## Scope and safety boundary

This was an internal technical smoke run under the MyScript free trial. It used
30 deterministic repository-generated linear-equation stroke fixtures and no
student, teacher, account, notebook, page, or other personal data.

- Approved maximum: 50 total HTTP attempts, including retries and failures.
- Actual attempts: 30.
- Retries: 0.
- Remaining local run budget: 20.
- Production Cloud Run provider and route flags: unchanged at `false`.
- Frontend MyScript gates: unchanged at `false`/unset.
- Raw predictions and the append-only ledger are stored outside the repository
  in an owner-only directory. This report contains aggregate evidence only.

The live adapter requested the Math recognizer's documented
`application/x-latex` response and never rendered or transmitted a PNG. A
post-run review found that normalization `v1` treated TeX math-mode whitespace
between adjacent digits as content. Normalization `v2` removes only that
presentation whitespace. The original restricted artifact remains unchanged;
an owner-only derived artifact was rescored offline with zero provider requests.

## Reproducible run identity

| Field | Value |
|---|---|
| Run ID | `myscript-synthetic-poc-20260816-v1` |
| Corpus | `synthetic-myscript-smoke-v1` |
| Corpus manifest SHA-256 | `9220095c4e0889d350e5bbe97f4fe376b252c9ce3ceeced25493a069fa7612b9` |
| Provider/model | `myscript` / `iink-recognize-v4` |
| Configuration | `math-latex-rest-v1` |
| Normalization | `v2` offline amendment; original run used `v1` |
| Samples | 30 synthetic vector expressions |
| Decision eligibility | `false` — smoke corpus has one reviewer and no control/device run |

## Aggregate results

| Metric | Result |
|---|---:|
| Provider success | 30/30 (100%) |
| Timeout/error | 0/30 (0%) |
| Normalized exact match | 26/30 (86.67%) |
| Deterministic algebra parse success | 26/30 (86.67%) |
| Mean character error rate | 2.9206% |
| Provider request latency p50 | 141 ms |
| Provider request latency p95 | 266.15 ms |
| Request bytes mean | 2,540.433 |
| Request bytes p95 | 3,094.35 |
| Observed paid cost | $0 under the free trial |

Basic fixtures reached 83.33% exact match (`n=12`); intermediate fixtures
reached 88.89% (`n=18`). These labels describe synthetic generator complexity,
not a student population or target-device result.

For auditability, the superseded `v1` aggregate was 20/30 exact and parse
success with 6.254% mean character error. Content-safe mismatch review showed
six failures were adjacent-digit TeX spacing and four were genuine
letter-category substitutions. The `v2` amendment fixes only the six
presentation differences and does not rewrite the four recognition errors.

## Interpretation

The smoke closes the narrow technical question: the backend can authenticate,
sign exact request bytes, send bounded raw strokes, receive the documented
LaTeX response, normalize it, and enforce a durable total-attempt cap without
exposing credentials or enabling production traffic.

It does **not** justify provider adoption. Exact match is below a reasonable
production gate, deterministic parsing still fails for 4 cases, the corpus is
synthetic and single-reviewer, no Gemini control
was run on identical visible handwriting, and offline provider latency excludes
canvas finalization, network conditions on target tablets, judgment, and paint.

Decision remains `NO_DECISION`. The next accuracy action is a reviewed target-
device corpus plus a same-input Gemini control. The unused 20-attempt allowance
was deliberately preserved because offline reprocessing answered the
normalization question without another provider call. Real student ink remains
blocked on privacy/legal approval, consent, retention, authentication, and
commercial production terms.
