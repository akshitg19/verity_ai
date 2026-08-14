# Internal Gemini Scheduling A/B Comparison

**Status:** Tooling ready; teammate/device runs pending

**Experiment:** `gemini-scheduling-ab-v1`

**Audience:** 3–5 consenting VerityAI teammates

**Evidence class:** Qualitative/internal scheduling evidence only

This comparison isolates scheduling. Both variants use the same Gemini image
recognizer, prompts, PNG renderer, normalizer, and deterministic judge.

| Variant | Query | Image quiet period | Recognition workers |
|---|---|---:|---:|
| Legacy control | `?hwr_ab=legacy` | 1500ms | 1 |
| Current | `?hwr_ab=current` | 750ms | 2 |

The query is accepted only on localhost or a non-production Vercel preview. It
is explicitly disabled on `verity-ai-lovat.vercel.app`, even if somebody adds
the query there. An absent or unknown query keeps the normal safe behavior.

## URLs

Local:

- `http://localhost:5173/math?hwr_ab=legacy`
- `http://localhost:5173/math?hwr_ab=current`

Vercel preview base URL for PR #32:
`https://verity-ai-git-feat-handwriting-completion-verity-ai2.vercel.app`.
Use that same base URL followed by `/math?hwr_ab=legacy` or
`/math?hwr_ab=current`; do not compare two different code revisions or
providers. The preview is protected by Vercel Authentication, so each teammate
must have access to the `verity-ai2` Vercel team and sign in before the app is
shown. Teammates without that access should use the local URLs instead; do not
disable preview protection for this experiment.

## Fixed 12-task script

Run the tasks in this order for both variants:

1. `3x + 2 = 5`
2. `3x = 3`
3. `x = 1`
4. `2(x - 3) = 10`
5. `2x - 6 = 10`
6. `2x = 16`
7. `x = 8`
8. `4 - x = 9`
9. `-x = 5`
10. `x = -5`
11. `0.5x + 1 = 3`
12. `x/2 + 3 = 7`

The experiment panel displays the same list. It records only task IDs, coarse
browser/device classes, content-free lifecycle metrics, and the teammate's
ratings. It never exports ink, images, recognized text, expected text, problem
text, notebook/page IDs, names, email addresses, or a persistent participant
identifier.

## Teammate instructions

1. Open the PR #32 preview link above with one variant query and complete the
   existing Vercel team sign-in if prompted.
2. Confirm the panel heading names the intended variant.
3. Use the math notebook. Write exactly the displayed expression and wait for
   recognition and verdict painting.
4. Rate perceived responsiveness, recognition accuracy, confidence,
   corrections, and any incomplete/flickering transcription.
5. Select **Save & next**, then use **New Question** before drawing the next
   task.
6. After all 12 tasks are saved, export the JSON file.
7. Repeat on the other variant on the same device/browser. Alternate which
   variant comes first across teammates to reduce order bias.
8. Share only the exported JSON files in the approved internal project
   location. Do not add handwriting screenshots or notebook exports.

Participation must be voluntary. These are deliberately synthetic prompts; do
not substitute real student work or identifying content.

## Aggregate results

From `frontend/`, run:

```bash
npm run handwriting:aggregate -- \
  /approved/path/verity-hwr-legacy-*.json \
  /approved/path/verity-hwr-current-*.json \
  > /approved/path/handwriting-ab-summary.json
```

The machine-readable report contains run/task counts, p50/p95 lifecycle and
provider-request durations, mean responsiveness/confidence, exact-recognition
rating, unreadable rate, correction count, and incomplete/flicker count. Inspect
results by device class before drawing a conclusion; do not turn this small
internal exercise into provider-selection evidence.

## Rollback and cleanup

- Immediate rollback: remove the query string or open the production URL; both
  return to the normal Gemini configuration.
- The experiment cannot enable a new recognizer or production data transfer.
- After device evidence is recorded, remove the panel import/mount, query
  resolver, legacy 1500ms policy, and experiment-only aggregation UI in a
  reviewed cleanup change. Keep only the aggregate report and reusable
  content-free measurement utilities that production monitoring still needs.
