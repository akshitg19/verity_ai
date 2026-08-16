# Internal Gemini Scheduling A/B Comparison

**Status:** Validated schema-v2 tooling ready; teammate/device runs pending

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

## Fixed 12-expression script

Run the expressions in this order for both variants, as six paired rounds. In
each pair, write the second row immediately after the first without waiting for
the first recognition request. Wait for both results only after the second row.
This makes the comparison exercise both the quiet-period policy and the
one-worker/two-worker policy.

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
text, notebook/page IDs, names, or email addresses. Export schema v2 adds one
random UUID held only in the browser tab's session storage so the offline tool
can prove that Legacy and Current came from the same anonymous session. The
token is not a participant identity, does not survive the tab session, and is
not copied into the aggregate report.

## Teammate instructions

1. Open the PR #32 preview link above with one variant query and complete the
   existing Vercel team sign-in if prompted.
2. Confirm the panel heading names the intended variant.
   If the panel says session storage is unavailable, enable session storage for
   this internal preview and reload; export stays disabled until anonymous
   pairing can be retained.
3. Use the math notebook. For each pair, write row 1 and row 2 exactly as shown,
   with no pause to wait for recognition between them.
4. After row 2, wait for both recognition results and verdict painting.
5. Rate row 1, select **Save row 1 rating**, then rate the already-written row 2
   without drawing it again.
6. Select **Save row 2 & next pair**, then use **New Question** before drawing
   the next pair.
7. After all 12 expressions are rated, export the JSON file.
8. In the **same browser tab**, change only the query to the other variant and
   repeat. Keeping the tab open preserves the anonymous pair token; a new tab
   intentionally creates a different token and will fail the pairing gate.
   Alternate which variant comes first across teammates to reduce order bias.
9. Share only the exported JSON files in the approved internal project
   location. Do not add handwriting screenshots or notebook exports.

Participation must be voluntary. These are deliberately synthetic prompts; do
not substitute real student work or identifying content.

## Aggregate results

From `frontend/`, run:

```bash
npm run handwriting:aggregate -- \
  --require-ready \
  /approved/path/verity-hwr-legacy-*.json \
  /approved/path/verity-hwr-current-*.json \
  > /approved/path/handwriting-ab-summary.json
```

The command rejects unsupported schemas, policy drift, missing/duplicated task
ratings, out-of-range values, unsafe fields, invalid environment classes, and
malformed metrics before aggregation. `--require-ready` returns nonzero unless
there are 3–5 anonymous Legacy/Current pairs from matching device/browser
classes, every run has exactly 12 committed painted results and 12 provider
requests, stale/error counts are zero, and first-variant order is balanced to
within one pair with no equal/ambiguous export timestamps.

The machine-readable report contains readiness codes, run/task counts, p50/p95
lifecycle and provider-request durations, mean responsiveness/confidence,
exact-recognition rating, unreadable rate, correction count, and
incomplete/flicker count. It includes the same aggregates broken down by the
validated coarse browser/device class. It contains neither pair tokens nor
input filenames. Inspect every device-class breakdown before drawing a
conclusion; do not turn this small internal exercise into provider-selection
evidence.

Running without `--require-ready` is allowed only to diagnose an incomplete
collection. Such output must not be attached as completed Phase A/B evidence.

## Rollback and cleanup

- Immediate rollback: remove the query string or open the production URL; both
  return to the normal Gemini configuration.
- The experiment cannot enable a new recognizer or production data transfer.
- After device evidence is recorded, remove the panel import/mount, query
  resolver, legacy 1500ms policy, and experiment-only aggregation UI in a
  reviewed cleanup change. Keep only the aggregate report and reusable
  content-free measurement utilities that production monitoring still needs.
