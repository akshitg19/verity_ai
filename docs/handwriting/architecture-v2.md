# Handwriting Recognition Architecture v2

**Status:** Source of truth; implemented through Phase 2 on `origin/main` by
PR #31 (`cfa06e0`)
**Last updated:** 2026-08-14

**Applies to:** VerityAI `origin/main` at and after `786f4b6`

## 1. Objective

Deliver live, correctable handwriting recognition without coupling the canvas,
recognition vendor, and deterministic judges. The fast path should consume raw
digital ink. Image recognition remains a recoverable fallback until production
data proves it is unnecessary.

Target user experience:

- Ink rendering never waits for recognition.
- Provisional recognition can update while the student writes.
- A stable expression is judged promptly without a fixed 1.5-second gate.
- Edits, erasing, undo, page navigation, and retries cannot paint stale results.
- Ambiguous transcription is visible and correctable.
- The system never changes a transcription merely because a different candidate
  would make the student's mathematics correct.

## 2. Responsibility boundary

The architecture has three distinct responsibilities:

```text
Ink capture and grouping
  What strokes belong to the same logical expression?

Recognition
  What did the student write?

Deterministic judgment
  Is the recognized step valid, and what kind of error occurred?
```

Provider responsibilities:

| Component | Responsibility | Must not do |
|---|---|---|
| Canvas and ink model | Capture raw points; maintain stable expression IDs | Decide mathematical correctness |
| Vector recognizer | Convert strokes to structured math/text | Select the answer that passes the judge |
| Image recognizer | Recover transcription when the vector path cannot | Become the unconditional primary path |
| Normalizer/parser | Convert provider output to a stable internal grammar | Invent missing student work |
| SymPy/RDKit/custom judges | Verify recognized work deterministically | Read pixels or silently repair transcription |

SymPy, RDKit, OPSIN, and the existing topic-specific judges remain in place.
Replacing them is not part of the handwriting-latency project.

## 3. Verified baseline and implemented branch state

The historical pre-redesign baseline at `786f4b6` had these properties:

- `frontend/src/canvas/useCanvas.js` captures point coordinates, event time, and
  pressure as `{x, y, t, p}`.
- The canvas maintains stable row buckets, row versions, a spatial index, undo
  history, and page-scoped readiness callbacks.
- Two code paths use a 1500ms row-idle timer before `notifyRowReady`.
- `frontend/src/math/useMathWorkflow.js` renders each row to PNG, removes the
  data-URL prefix, calls `/transcribe`, and then calls the deterministic checker.
- Math rows are transcribed serially.
- `backend/transcription.py` decodes Base64 PNG and creates a Gemini client for
  the transcription call.
- The notebook stores the raw stroke collection and accepts legacy strokes with
  only finite `x` and `y` values.

Current math path:

```text
pointer events
  -> raw strokes {x,y,t,p}
  -> stable row bucket
  -> 1500ms idle gate
  -> renderLineToPng
  -> Base64 JSON
  -> POST /transcribe
  -> Gemini text
  -> normalization
  -> POST /check
  -> deterministic verdict
```

The current row identity is used by recognition snapshots, verdict maps, edits,
undo, notebook persistence, and stale-response protection. It must not be
removed as part of eliminating PNG segmentation.

Current `origin/main` through `949e1ea` implements the target foundation,
offline readiness work, and the disabled backend MyScript boundary:

- recognizer, hybrid fallback, and shadow-control adapters;
- named provider-aware 350ms vector and 750ms image finalization policies;
- per-stroke provisional hooks that cannot mutate finalized judge state;
- at most two recognition jobs with one row-ordered final snapshot per wave;
- edit, erase, undo/redo, clear, and navigation invalidation;
- content-free pointer-to-paint lifecycle events.

Gemini image recognition remains the only enabled provider. The MyScript REST
adapter and internal route are merged, but provider and route flags remain
false. PR #35 implements a direct, no-fallback frontend POC mode behind two more
false-by-default gates; the vector primary and its measured service objectives
therefore remain future work.

## 4. Target architecture

```text
Pointer events
  -> immutable raw strokes
  -> stable ExpressionGroup
  -> provider-aware finalization policy
  -> RecognizerRouter
       -> vector primary (MyScript candidate)
       -> image fallback (Gemini initially)
       -> optional shadow provider (GPT-5.6 Luna candidate)
  -> normalized internal expression
  -> ordered deterministic judge
  -> verdict associated with expression ID and version
```

The target is hybrid by capability, not by unconditional fan-out. Production
requests call one primary provider. A fallback is called only for an explicit
recognition failure. Shadow mode may call two providers temporarily to collect
evaluation data, but only the control provider affects the user.

## 5. Ink and expression contracts

Raw point:

```js
{
  x: number,
  y: number,
  t?: number,
  p?: number,
  tiltX?: number,
  tiltY?: number
}
```

Raw stroke:

```js
{
  id: string,
  points: Point[],
  pointerType?: "pen" | "mouse" | "touch",
  color?: string,
  width?: number,
  startedAt?: number,
  endedAt?: number
}
```

Optional fields preserve backward compatibility. Raw points are never mutated by
render smoothing or recognizer-specific normalization.

Logical expression:

```js
{
  id: string,
  rowKey: number,
  pageId: string | null,
  version: number,
  strokeIds: string[],
  bounds: { minX, minY, maxX, maxY },
  state: "writing" | "provisional" | "finalizing" | "final" | "error"
}
```

`rowKey` may remain the first implementation of `ExpressionGroup.id`. The key
requirement is stable identity and monotonic versioning, not a naming migration.

## 6. Grouping is retained; timer-driven PNG segmentation is not

VerityAI still needs to know which strokes form each solution step. It no longer
needs to wait for a row to be complete before recognition can begin.

Grouping rules:

- Starting a clearly lower logical row finalizes the previous row immediately.
- Adding a superscript, subscript, numerator, denominator, radical, or matrix
  cell should extend the current expression when spatial evidence supports it.
- The recognizer receives all strokes needed to understand the expression's 2D
  layout.
- Tiny partial clusters such as one bar of `=` are not independently judged.
- Structure-drawing regions remain a separate content type and are not forced
  through math row semantics.

`getStrokeBounds`, the spatial index, row versions, and row-to-verdict mapping
remain useful. Height ceilings and fixed y-band rules must be tested against
fractions, matrices, superscripts, and subscripts before being relaxed.

## 7. Finalization policy

Recognition readiness and judgment readiness are separate.

Recognition may update provisionally after each completed stroke when the
provider supports incremental input. Judgment occurs only for a stable,
normalizable, syntactically complete result.

Finalization signals, strongest first:

1. Explicit Enter, Read Page, or submit action.
2. The student begins a distinct subsequent expression.
3. A stable high-quality candidate plus a short quiet period.
4. A provider-specific batch-image quiet period.

Initial values are hypotheses and must be tuned through metrics:

```text
vector quiet period: 350ms
batch-image quiet period: 750ms
recognition timeout: environment/configuration driven
```

A new stroke increments the expression version and invalidates pending
provisional/final results for the previous version.

## 8. Recognizer contract

Conceptual request:

```js
recognize({
  strokes,
  expressionId,
  expressionVersion,
  pageId,
  writingArea,
  topic,
  previousText,
  signal,
  onProvisional
})
```

Normalized result:

```js
{
  text: string,
  format: "ascii" | "latex" | "jiix",
  candidates: [{ text: string, confidence?: number }],
  source: "gemini" | "myscript" | "openai" | "mock",
  provisional: boolean,
  unreadable: boolean,
  formatSupported: boolean,
  parseable: boolean,
  fallbackUsed: boolean,
  fallbackReason: string | null,
  latencyMs: number
}
```

Confidence is optional because providers do not expose equivalent confidence
semantics. Routing must not fabricate a comparable score.

## 9. Provider strategy

### Vector primary

MyScript iink is the recommended first POC because it accepts digital ink and
supports structured 2D math. This is a candidate decision, not a production
claim. Credentials, protocol, browser behavior, accuracy, latency, cost, and
privacy must pass the evaluation plan.

The first POC reuses VerityAI's existing canvas and sends collected strokes to
the backend adapter. The adapter accepts only the `linear-equation-v1` profile,
signs canonical REST bytes server-side, disables solver and JIIX stroke export,
and is unreachable while either deploy flag is false. The frontend direct POC
requires both `VITE_HANDWRITING_MODE=myscript-poc` and
`VITE_MYSCRIPT_POC_ENABLED=true`; it sends ordered point data without rendering
PNG and deliberately has no automatic fallback before evaluation. It does not
replace the canvas/editor and is not production evidence until the frozen corpus
is replayed.

### Image fallback

Gemini remains the initial fallback because it is implemented and covered by
existing transcription tests. PNG generation and `/transcribe` remain available
until measured fallback traffic is negligible and a removal decision is made.

Fallback triggers are recognition failures only:

- timeout or provider service error;
- empty result;
- explicit unreadable result;
- unsupported output format;
- normalization or syntax parsing failure.

Fallback must not trigger because the recognized mathematics is incorrect.
Fallback runs at most once per expression version.

### Alternative image fallback

GPT-5.6 Luna is an evaluation candidate because it accepts image input and
structured output. It does not replace Gemini without a benchmark on the hard
samples that actually reach fallback. Accuracy and parse success take priority
over small cost differences because fallback traffic should be rare.

## 10. Concurrency and consistency

- Recognition may process up to two independent expressions concurrently after
  measurement confirms the device and provider can support it.
- Judgment always consumes an ordered snapshot of finalized expressions.
- Every request carries page ID, expression ID, and expression version.
- Responses are ignored when any identity/version no longer matches.
- Page navigation aborts or invalidates in-flight work from the prior page.
- A fallback inherits the same abort signal and identity guard.
- A primary failure may invoke fallback once; fallback cannot recursively route.
- Provisional results never mutate finalized judge state.

## 11. Metrics and service objectives

Required timestamp stages:

```text
pointer_down
pointer_up
expression_ready
recognition_queued
png_encode_start / png_encode_end
request_start
transcription_received
normalization_finished
judge_start / judge_end
result_painted
```

Required dimensions:

- provider and mode;
- topic and content type;
- device/browser class without a persistent personal identifier;
- primary/fallback/shadow status;
- fallback reason;
- expression and page version for local correlation only.

Initial target SLOs:

| Metric | Target |
|---|---:|
| Ink rendering | p95 < 16ms |
| Provisional vector result | p95 < 300ms |
| Final vector recognition | p95 < 500ms |
| Fast-path verdict | p95 < 600ms |
| Fallback behavior | Non-blocking to ink rendering |
| Stale result rate | 0 |

Raw strokes, recognized answers, problem text, student identifiers, and images
must not be written to ordinary latency logs.

## 12. Feature flags and rollout

Proposed modes:

```text
gemini   Current behavior through the adapter.
shadow   Control provider drives UI; candidate provider is measured only.
hybrid   Vector primary with one image fallback.
```

Rollout order:

1. Adapter architecture with Gemini-only behavior.
2. Internal MyScript POC for one linear-equation topic.
3. Shadow comparison on consented/internal fixtures.
4. Hybrid for a small percentage of eligible sessions.
5. Expand by topic and device after acceptance gates pass.
6. Retain an instant provider flag rollback.

## 13. Content-specific routing

| Content | Primary candidate | Fallback/correction |
|---|---|---|
| Math expressions | MyScript vector | Image recognizer, then user correction |
| Constrained numeric input | Vector/local candidate after POC | Image recognizer |
| Written chemistry | Separate constrained POC | Chemistry-specific Gemini prompt |
| Molecular structures | Dedicated structure path | Gemini structure recognition/user confirmation |
| Correctness judgment | SymPy/RDKit/custom judges | Explicit `unsupported`; no model guessing |

Freehand molecular structures are graphs, not ordinary text or math. They must
not inherit math-recognizer assumptions.

## 14. Decisions

| ID | Decision | Rationale |
|---|---|---|
| HWR-001 | Use a hybrid provider architecture | Gains vector latency without deleting a proven recovery path |
| HWR-002 | Preserve stable expression/row identity | Required for ordered feedback, edits, undo, and stale-response safety |
| HWR-003 | Separate recognition from judgment | Prevents answer leakage and keeps verdicts deterministic |
| HWR-004 | Evaluate MyScript before adopting it | Vendor capability is not equivalent to product accuracy |
| HWR-005 | Keep Gemini as initial image fallback | Existing tested recovery path enables safe rollout |
| HWR-006 | Benchmark Luna rather than assume superiority | No cross-provider handwriting result exists for this corpus |
| HWR-007 | Keep SymPy/RDKit | They are not the current handwriting-latency bottleneck |
| HWR-008 | Use eval fixtures as decision evidence | Model and prompt choices must be reproducible |

## 15. Non-goals for the foundation phase

- Replacing the full canvas with a vendor editor.
- Removing PNG rendering or the existing transcription endpoint.
- Replacing SymPy, RDKit, OPSIN, or topic judges.
- Adding Sage/Maxima.
- Claiming full undergraduate-math support.
- Sending production student ink to multiple vendors without a reviewed privacy
  and consent policy.
- Choosing a provider based only on general model reputation.

## 16. Open questions

- Which MyScript protocol and credential architecture meets production security
  requirements?
- What is the baseline exact-match and parse-success rate by topic?
- How should ambiguous top candidates be presented without interrupting writing?
- Which expressions require an explicit submit rather than quiet-period finalization?
- What retention and consent policy applies to handwriting evaluation fixtures?
- Does a Luna or other image model materially outperform Gemini on actual
  fallback samples?
- At what measured fallback rate is PNG-path removal worth considering?
