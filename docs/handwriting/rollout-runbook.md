# Handwriting Recognition Rollout Runbook

**Status date:** 2026-08-14
**Current decision:** Gemini remains the only enabled production recognizer.
**MyScript status:** backend merged but not deployed; frontend POC wiring is
disabled by default; live traffic is prohibited until the readiness gates pass.

## 1. Safety model

Recognition and judgment remain separate. A recognizer transcribes visible ink;
the existing deterministic math and chemistry engines decide correctness. No
flag in this runbook permits a provider to select the answer that makes a
student correct.

The MyScript POC is protected by independent layers:

| Layer | Setting | Shipped value | Effect |
|---|---|---:|---|
| Frontend mode | `VITE_HANDWRITING_MODE` | unset / `gemini` | Uses the existing Gemini PNG path |
| Frontend POC gate | `VITE_MYSCRIPT_POC_ENABLED` | unset / false | A `myscript-poc` mode request still resolves to Gemini |
| Frontend access header | `VITE_API_SECRET` | unset | Must match the backend access-control value for an internal preview; it is visible in the browser and is not authentication |
| Backend route gate | `MYSCRIPT_POC_ROUTE_ENABLED` | `false` | Returns a content-safe disabled response before adapter lookup |
| Backend provider gate | `MYSCRIPT_ENABLED` | `false` | Prevents the adapter from opening a provider connection |
| API access control | `VERITY_API_SECRET` | empty | The route gate cannot open without the existing access-control configuration |
| Provider credentials | Secret Manager references | mapped in deploy config | Values remain backend-only and are never read for metadata verification |

The direct `myscript-poc` frontend mode has no automatic Gemini fallback. This
proves that the vector POC path generates no PNG and prevents fallback traffic
from contaminating latency and accuracy measurements. Generic hybrid and shadow
classes remain testable infrastructure, but the environment configuration does
not construct them for MyScript.

## 2. Preconditions before any live provider call

All items must have an owner and attached evidence:

1. MyScript written privacy/legal answer reconciles trial research access,
   transient processing, minor/student use, FERPA/COPPA, subprocessors,
   retention, deletion, residency, attribution, and publicity terms.
2. VerityAI privacy/legal owner records approval for the exact POC data class.
3. A 30–50-case synthetic or expressly approved internal smoke corpus passes
   fixture validation; every record names MyScript in `approved_providers`.
4. The restricted artifact store, access list, retention date, and deletion
   procedure are approved and exercised.
5. The vendor dashboard's remaining trial quota is checked without exposing
   credentials.
6. The replay plan and a durable run ledger enforce the 650-attempt maximum
   across process restarts. The adapter's in-process counter is secondary only.
7. Both Secret Manager environment references are pinned to reviewed numeric
   versions, and Cloud Run revision metadata proves the references without
   reading values.
8. Real user authentication is reviewed. The existing shared browser header is
   only a crawler deterrent and is not sufficient for a student rollout.

If any item is missing, leave every MyScript flag false and do not make a smoke
request.

## 3. Deployment sequence

### Disabled revision

1. Deploy the current `main` with `cloudbuild.yaml`.
2. Inspect Cloud Run revision metadata only. Verify:
   - runtime identity is
     `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com`;
   - `MYSCRIPT_ENABLED=false`;
   - `MYSCRIPT_POC_ROUTE_ENABLED=false`;
   - the two environment variables reference the expected Secret Manager names;
   - no secret value appears in command output or screenshots.
3. POST one minimal synthetic stroke to
   `/api/handwriting/myscript/recognize` and require the disabled response.
4. Verify `/health`, the production frontend, and the existing Gemini math flow.

The GCP project had no Cloud Build trigger when inspected on 2026-08-14. Until a
repository connection is separately approved and configured, merging `main`
does not deploy Cloud Run; use the reviewed one-time manual build path and record
the build and revision IDs.

### Approved internal POC

Only after every precondition passes:

1. Create a reviewed deployment change with numeric secret versions.
2. Enable backend provider and route gates only on one controlled internal
   revision.
3. Configure a non-production frontend preview with both frontend gates:

   ```text
   VITE_HANDWRITING_MODE=myscript-poc
   VITE_MYSCRIPT_POC_ENABLED=true
   ```

4. Confirm the preview is inaccessible to ordinary student traffic.
5. Run the validated replay plan, beginning with one synthetic fixture and then
   the bounded 30–50-case smoke set.
6. Stop on any permission, retention, authentication, budget, schema, timeout,
   or logging discrepancy.

Do not enable shadow fan-out, hybrid fallback, a percentage rollout, or student
traffic during this stage.

## 4. Observability and alerts

Ordinary metrics may contain only provider, mode, expression version, lifecycle
stage durations, fallback state/reason, and content-free outcome. They must not
contain strokes, images, transcription, expected answer, problem text, page or
notebook identifiers, student identifiers, request bodies, JIIX, LaTeX, keys,
or HMAC values.

During an approved POC, stop the run and disable both backend flags when any of
the following occurs:

- authentication or access-denied response;
- quota/budget response or ledger mismatch;
- unexpected retry count;
- response schema/content-type failure;
- p95 timeout or error rate outside the predeclared smoke threshold;
- raw content found in normal logs or analytics;
- stale result or duplicate judgment count above zero.

## 5. Immediate rollback

Frontend rollback is the primary switch:

```text
VITE_HANDWRITING_MODE=gemini
VITE_MYSCRIPT_POC_ENABLED=false
```

Rebuild the frontend, verify the production bundle points to the Cloud Run API,
and run one existing Gemini transcription smoke test.

Backend kill switch:

```bash
gcloud run services update verity-ai \
  --project cs-sail-2b08 \
  --region us-central1 \
  --update-env-vars=MYSCRIPT_ENABLED=false,MYSCRIPT_POC_ROUTE_ENABLED=false
```

The next normal `cloudbuild.yaml` deployment also restores both values to false.
After rollback, require the MyScript route's disabled response and verify health.
Do not remove or read secret versions during an incident; disabling both flags
ends provider traffic without exposing credential material.

## 6. Provider outage procedure

1. Set both frontend gates to Gemini/false and redeploy the preview or affected
   frontend.
2. Set both backend gates false.
3. Confirm request count stops increasing in the provider dashboard.
4. Preserve only content-free build, revision, response-class, and timing
   evidence for the incident review.
5. Do not retry a failed corpus automatically. Reconcile the durable ledger and
   dashboard before a reviewed restart.

## 7. Expansion gates

Moving beyond the internal POC requires a category-level evaluation report with
sample counts, exact match, parse success, critical-symbol failures, p50/p95,
request count, cost estimate, and a written go/no-go decision. A production
hybrid requires an additional PR proving one-shot fallback, visible correction,
outage behavior, and immediate Gemini rollback. No flag change substitutes for
those evidence gates.
