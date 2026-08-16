# MyScript Synthetic POC Evidence — 2026-08-16

## Scope and safety boundary

This was an internal synthetic technical POC under the MyScript free trial. It
used 30 deterministic linear-equation smoke fixtures followed by a predeclared
20-case paired `x/X` geometry probe, and no student, teacher, account, notebook,
page, or other personal data.

- Approved maximum: 50 total HTTP attempts, including retries and failures.
- Actual attempts: 50.
- Retries: 0.
- Remaining local run budget: 0. Any later provider request requires a new
  explicit authorization and run identity.
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

## Initial 30-case aggregate results

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

## Paired 20-case `x/X` geometry probe

Content-safe review showed that all four remaining initial-smoke errors were
the same substitution: synthetic lowercase `x` was returned as uppercase `X`.
The original generator drew `x` at full digit height, which makes handwritten
case visually ambiguous. Silently rewriting `X` to `x` would hide a real
mathematical distinction, so no normalization rule was added.

The remaining 20 authorized attempts were instead used for ten deterministic
pairs. Within each pair the equation, timestamps, jitter, and all non-`x`
strokes are identical. One member keeps the original full-height `x`; the other
uses an explicit lowercase x-height while retaining the same baseline.

| Probe group | Exact | Parse | Mean CER | Latency p50 / p95 |
|---|---:|---:|---:|---:|
| Explicit lowercase x-height | 10/10 (100%) | 10/10 (100%) | 0% | 143 / 245.55 ms |
| Full-height x | 9/10 (90%) | 9/10 (90%) | 2% | 135.5 / 505.7 ms |
| Overall paired probe | 19/20 (95%) | 19/20 (95%) | 1% | 139.5 / 398.7 ms |

All 20 calls succeeded with no retry, timeout, or error. The sole probe failure
was again a full-height `x` returned as uppercase `X`; the lowercase-height
member of that pair succeeded. The probe manifest SHA-256 is
`cc81fbed5a124331f45d992d2efd6ba4bb3f8b3eaefac593d72d84433c893fad`.
Raw results and the content-safe aggregate remain owner-only outside Git.

This is evidence that synthetic glyph geometry materially affects the observed
case error. It is not evidence that MyScript will reach 100% on real lowercase
handwriting: the corpus is deterministic, synthetic, single-reviewer, and has
no target-device or same-input control. The initial 30-case and paired-probe
metrics remain separate rather than being blended into a misleading global
accuracy number.

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
device corpus plus a same-input Gemini control. The approved 50-attempt ledger
is now exhausted. Real student ink remains blocked on privacy/legal approval,
consent, retention, authentication, and commercial production terms; any
further synthetic or decision-corpus request also requires a new explicit cap
and run identity.
