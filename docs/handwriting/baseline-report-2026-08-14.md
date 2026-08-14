# Handwriting Phase A Baseline — 2026-08-14

## Scope and provenance

This report re-verifies the handwriting foundation on `origin/main` at
`cfa06e0` (PR #31), rather than treating the earlier handoff as evidence. The
Phase A/B measurement tooling is on `feat/handwriting-completion`, with the
scheduling-comparison implementation at `c784605`.

The original worktree at `/Users/anyixin/Desktop/VerityAI/verity_ai` remained on
`agent/frontend-reliability-ux` with its six pre-existing landing-page changes.
All work for this report used the separate clean worktree
`/Users/anyixin/Desktop/VerityAI/verity_ai-handwriting-goal`.

## Re-verified repository baseline

- `cfa06e0` is an ancestor of, and currently identical to, `origin/main`.
- Phase 0–2 code is present on `origin/main`.
- Gemini image transcription is the only configured production recognizer.
- The image quiet period is 750ms and the vector hypothesis is 350ms.
- `RecognitionCoordinator` defaults to at most two active recognition jobs.
- A recognition wave is committed in row order and judged from one final-only
  snapshot.
- Provisional results update `provisionalByLine`; they do not mutate finalized
  `lines` or call the judge.
- Row versions, page scope, abort signals, and coordinator invalidation cover new
  ink, erasing, undo/redo, clear, and navigation.
- Outside the explicit internal A/B variant, no `1500`/`1_500` literal remains
  in `frontend/src/canvas`, `frontend/src/math`, or the recognition runtime.

## Lifecycle evidence

The current code emits these content-free lifecycle stages:

| Stage | Runtime source |
|---|---|
| `pointer_up` | Canvas timing passed into `useMathWorkflow.queueRow` |
| `expression_ready` | `useCanvas.notifyRowReady` |
| `recognition_queued` | `useMathWorkflow.queueRow` |
| `recognition_start` | `useMathWorkflow.recognizeJob` |
| `recognition_finished` | `useMathWorkflow.recognizeJob` finalizer |
| `judge_start` | Final row commit before deterministic checking |
| `judge_end` | Deterministic checking completion |
| `result_painted` | The next animation frame after the verdict update |

`recognitionMetrics.js` enforces an allowlist both when a trace is created and
again at the browser event boundary. Raw strokes, images, problem text,
recognized text, page IDs, notebook IDs, and student identifiers are excluded.

## Deterministic validation results

Commands were run on 2026-08-14 from the clean worktree.

| Check | Result |
|---|---|
| `npm ci` | Completed; 201 packages installed; one pre-existing high-severity advisory reported; no automatic upgrade run |
| `npm test` before Phase A/B tooling | 38 files, 368 tests passed |
| `npm run lint` | Passed |
| `npm run check:app-lines` | Passed at 254/260 before tooling |
| `npm run build` | Passed |
| production Vite build | Passed with the production Cloud Run API base |
| `npm run check:production-build` | Passed; one built asset referenced the expected API base |
| backend full suite | 1185 passed, 3 expected xfailed, 3 existing OPSIN warnings |

After the Phase A/B implementation at `c784605` and export-boundary privacy
hardening at `6f3a972`, the frontend suite increased to 40 files and 374 passing
tests; lint and build also passed. Final PR validation is recorded in the
implementation-plan change log.

## Latency result and evidence gate

No target tablet was attached to this coding environment. Therefore this report
does **not** publish a p50/p95, claim that 750ms is perceived as twice as fast,
or claim that the Phase 2 change meets a production latency SLO. Deterministic
fake-timer tests prove policy behavior, not device latency.

The paired-row, content-free export and aggregation workflow in
[Internal A/B comparison](internal-ab-comparison.md) is the safe measurement
path. To close the device evidence gate, 3–5 consenting teammates must each run
both variants on the supported tablet/browser combinations, export both JSON
files, and aggregate them. Required evidence is:

- device/browser-class sample counts;
- pointer-up-to-ready, pointer-up-to-final-recognition,
  final-recognition-to-verdict, and pointer-up-to-painted-verdict p50/p95;
- provider-request p50/p95;
- recognition rating, correction, incomplete/flicker, responsiveness, and
  confidence totals by variant;
- any device-specific failures.

Owner: VerityAI product/QA teammate with access to the target tablets. This is
an external evidence gate, not an implementation failure.

## Baseline conclusion

The Phase 0–2 behavior and safety invariants are present and deterministic tests
remain green. The repository now has a reproducible device-measurement path, but
the measured production-device baseline remains pending until target-device
exports are supplied.
