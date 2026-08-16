# Handwriting Recognizer Evaluation Plan

## 1. Purpose

Choose recognition providers and finalization policies using VerityAI-specific
evidence. General model rankings are not substitutes for handwritten math and
chemistry evaluation.

The evaluation answers:

- Does a vector provider recognize supported expressions at least as accurately
  as the current image baseline?
- Does it materially reduce provisional and final recognition latency?
- Which categories still require image fallback or user correction?
- Is an alternative image model better on the hard fallback distribution?

## 2. Corpus design

Start with 300–500 consented expressions across multiple writers and target
devices. Expand before production rollout.

Required categories:

| Domain | Cases |
|---|---|
| Linear algebraic steps | Variables, signs, distribution, parentheses |
| Rational arithmetic | Fractions, nested fractions, fraction bars |
| Exponents | Superscripts, negative exponents, roots |
| Calculus notation | Limits, derivatives, integrals, bounds |
| Trigonometry | Function names, Greek symbols, powers |
| Written chemistry | Capitalization, subscripts, charges, arrows |
| Ambiguity | `1/l/I`, `0/O`, `x/×`, lowercase/full-height `x/X`, `-/=`, decimal points |
| Writing quality | Neat, fast, cursive, cramped, overwritten |
| Editing | Erased/replaced symbols and out-of-order correction strokes |

Device groups should include the actual tablet/browser combinations targeted by
the product. Do not store names, email addresses, or persistent personal IDs in
fixtures.

## 3. Ground truth

Each fixture contains:

- raw stroke JSON whenever available;
- PNG rendered by the current production renderer when image comparison applies;
- canonical expected expression;
- accepted equivalent transcriptions that differ only in harmless formatting;
- topic, difficulty, and relevant ambiguity tags;
- annotation status and reviewer count.

Ground truth describes what was visibly written, not the mathematically correct
answer. If the student intentionally wrote a wrong sign, the expected
transcription contains the wrong sign.

Two reviewers should adjudicate ambiguous production-decision fixtures. Mark
truly unreadable ink as unreadable instead of forcing a transcription.

## 4. Test modes

### Offline fixture mode

Replay identical stored strokes/images against each provider. Use this for
reproducible accuracy, normalization, and cost comparisons.

### Interactive device mode

Measure pointer-to-provisional and pointer-to-final timing on target hardware.
Offline replay cannot measure perceived writing latency or event scheduling.

### Shadow mode

The production/control provider drives the user experience. A candidate provider
runs only on approved traffic and cannot affect transcription or verdicts.

## 5. Metrics

Accuracy:

- normalized exact-match rate;
- top-k inclusion rate when candidates exist;
- character/symbol error rate;
- parser success rate;
- unreadable precision and recall;
- correction rate;
- fallback rate and fallback reason distribution.

Latency:

- pointer-up to first provisional result, p50/p95;
- pointer-up to final recognition, p50/p95;
- recognition request duration, p50/p95;
- final recognition to verdict, p50/p95;
- full pointer-up to painted verdict, p50/p95.

Operations:

- request success/timeout/error rate;
- average and p95 payload size;
- cost per 1,000 expressions;
- provider availability by test window.

Always report sample count by category. A global average must not hide failures
on fractions, superscripts, chemistry capitalization, or a specific device.

## 6. Normalization rules

Apply one versioned normalization layer after provider output. Examples:

- harmless whitespace differences may be ignored;
- provider-specific multiplication tokens may map to one internal token;
- LaTeX presentation commands may be removed without changing semantics;
- capitalization remains significant for chemistry;
- a minus sign may normalize across Unicode forms but must not become equals;
- the normalizer may not insert missing operands or choose a correct answer.

Record both raw provider output and normalized output in secured offline test
artifacts. Ordinary production metrics contain neither.

## 7. Decision gates

Before making a vector provider primary for a topic:

- normalized exact-match and parse-success rates match or exceed the current
  Gemini baseline within an agreed statistical tolerance;
- no critical symbol category regresses without a correction or fallback plan;
- final vector recognition targets p95 under 500ms on target devices;
- stale-result and duplicate-judgment counts are zero;
- privacy, credential, licensing, and cost reviews pass;
- the fallback rate is low enough to preserve the latency benefit.

Before replacing the image fallback:

- evaluate only the difficult distribution that actually invokes fallback;
- prefer transcription/parse accuracy over small cost differences;
- require a bounded timeout and identical output contract;
- document category-level wins and losses;
- retain a feature-flag rollback.

Thresholds may be tightened after the baseline is measured. Do not weaken a
gate after seeing results without recording the product decision and rationale.

## 8. Experiment protocol

1. Freeze a corpus version and normalization version.
2. Warm providers consistently or record cold/warm status.
3. Run identical fixtures with fixed prompts/configuration.
4. Repeat latency-sensitive calls enough times to expose variance.
5. Store provider/model/configuration identifiers.
6. Score automatically, then manually review disagreements.
7. Publish aggregate results and failure examples permitted by consent.
8. Record a go/no-go decision in the architecture decision table.

The repository's offline tooling implements the validation, replay-plan, and
aggregate-scoring boundary described here. See
`docs/handwriting/fixtures/README.md`. Provider adapters consume a
ground-truth-free plan and create restricted prediction JSONL; the scorer is the
only step that combines predictions with truth. The tooling makes no provider
calls by itself.

## 9. Privacy and retention

- Use explicit consent for retained handwriting samples.
- Remove account and notebook identifiers before fixture creation.
- Store fixtures outside ordinary application logs.
- Restrict access to raw ink and images.
- Define a retention/deletion policy before collecting production samples.
- Do not send one student's ink to multiple providers outside an approved
  evaluation or fallback policy.
- List each permitted processor in `consent.approved_providers`; a generic
  “external provider” consent is not sufficient for the replay planner.

## 10. Required report

Each comparison produces:

```text
Corpus version:
Normalization version:
Provider/model/configuration:
Sample count by category:
Exact match and parse success by category:
Top ambiguity failures:
p50/p95 latency:
Timeout/error rate:
Fallback rate:
Estimated cost:
Privacy/licensing notes:
Recommendation:
Known uncertainty:
```
