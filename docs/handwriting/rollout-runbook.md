# Handwriting Recognition Rollout Runbook

**Status date:** 2026-08-16
**Current decision:** Gemini remains the only enabled production recognizer.
**MyScript status:** backend deployed in disabled revision
`verity-ai-00020-zwl`; frontend POC wiring is disabled by default. A separate
local 30-call synthetic smoke completed without changing Cloud Run traffic.

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

## 2. Preconditions before student or deployed provider traffic

All items must have an owner and attached evidence:

1. MyScript written privacy/legal answer reconciles trial research access,
   transient processing, minor/student use, FERPA/COPPA, subprocessors,
   retention, deletion, residency, attribution, and publicity terms.
2. VerityAI privacy/legal owner records approval for the exact POC data class.
3. A reviewed target-device corpus passes fixture validation; every record
   names MyScript in `approved_providers`.
4. The restricted artifact store, access list, retention date, and deletion
   procedure are approved and exercised.
5. The vendor dashboard's remaining trial quota is checked without exposing
   credentials.
6. The replay plan and initialized owner-only durable run ledger enforce the
   explicitly approved attempt maximum across process restarts. Its status is reconciled with
   the provider dashboard before and after the run. The adapter's in-process
   counter is secondary only.
7. Both Secret Manager environment references are pinned to reviewed numeric
   versions, and Cloud Run revision metadata proves the references without
   reading values.
8. Real user authentication is reviewed. The existing shared browser header is
   only a crawler deterrent and is not sufficient for a student rollout.

If any item is missing, leave every MyScript deployment flag false and do not
send student or production traffic. The completed synthetic-only local smoke is
documented separately and does not close these rollout gates.

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

The disabled sequence completed on 2026-08-16. Build
`1210e5a0-58fb-4a1f-9648-656b7d2e2f1a` deployed revision
`verity-ai-00017-phb` from commit
`22ce718d1c0acebe273d4c78de6e95bd277d1b9c`; metadata showed the expected runtime
identity, both false flags, and only the two expected Secret Manager references.
Health and the production frontend returned HTTP 200, the OpenAPI route was
present, and a minimal valid synthetic stroke returned a content-safe HTTP 404.
See [the deployment evidence](disabled-deployment-evidence-2026-08-16.md).

PR #39 then pinned both references to numeric version `1` and added a pre-build
guard against mutable or malformed versions. Revision `verity-ai-00018-fdv`
serves the same verified image with both flags false and both numeric references;
the repeated health, OpenAPI, disabled-route, and frontend checks passed. See
[the pinning evidence](secret-version-pinning-evidence-2026-08-16.md).

After PR #43 merged the bounded synthetic runner and reviewed adapter changes,
build `ff0cc228-807c-4f8f-98ef-697a43c50298` deployed exact merge commit
`7bace8f3e3237de7df05f09e83f0d7998c8ff125` as disabled revision
`verity-ai-00019-nj7`. The repeatable verifier returned `PASS`: 100% traffic to
the ready revision, both flags false, both secret references pinned to version
`1`, the expected runtime service account and image digest, and HTTP sequence
200/200/404/200. No MyScript request occurred. See
[the current deployment evidence](current-disabled-deployment-evidence-2026-08-16.md).

PR #45 then merged normalization `v2`, prediction-version enforcement, and the
zero-request offline reprocessor. Build
`d35149af-52e2-4145-9d54-786d09ddb5fb` deployed exact merge commit
`3634598727067eae7c3c42b2a372b4a813ff37ee` as disabled revision
`verity-ai-00020-zwl`. The same verifier returned `PASS` for the new digest,
100% traffic, false flags, version-`1` references, and HTTP sequence
200/200/404/200. No Secret Manager value or MyScript response was accessed.

### Repeatable disabled-revision verification

From an authenticated Cloud Shell or operator workstation with `gcloud`, run:

```bash
python3 scripts/verify_disabled_myscript_revision.py
```

The verifier calls only `gcloud run services describe` and
`gcloud run revisions describe`; it never invokes Secret Manager version access.
It emits an allowlisted JSON report containing revision identity, runtime service
account, image identity, false flags, numeric secret references, traffic percent,
and HTTP status classes. Other runtime environment values and response bodies
are not emitted.

Safety ordering is mandatory: the verifier exits before any HTTP request unless
the latest-created and latest-ready revision match, that revision serves 100% of
traffic, the expected runtime identity and image digest exist, both MyScript
flags equal `false`, and both expected Secret Manager references use positive
numeric versions. Only then does it check `/health`, OpenAPI route presence, a
minimal synthetic disabled-route HTTP 404, and the production frontend. Any
failure returns a stable content-safe code and a nonzero exit status.

### Secret-version rotation

`cloudbuild.yaml` pins both MyScript Secret Manager references to reviewed
positive numeric versions and rejects `latest`, empty values, zero, leading
zeroes, and non-numeric overrides before the image build starts. Version
numbers are metadata; secret values must never enter source control, build
substitutions, logs, or frontend code.

For a rotation, create the new Secret Manager version outside this repository,
then use metadata-only commands to identify its numeric version and confirm it
is enabled. Update the two `_MYSCRIPT_*_VERSION` substitutions in a reviewed PR,
keeping both provider flags false. After merge, deploy the disabled revision,
verify the revision references the expected numeric versions without accessing
their values, run the content-safe checks below, and only then disable the old
versions. Never use `latest` as a temporary shortcut.

### Future deployed internal POC

Only after every precondition passes:

1. Create a reviewed deployment change with numeric secret versions.
2. Mount the approved durable replay store, initialize its content-free attempt
   ledger outside the repository, and configure `MYSCRIPT_EVAL_LEDGER_PATH` and
   `MYSCRIPT_EVAL_RUN_ID`. Prove one reservation survives an executor restart;
   do not use an ephemeral container path.
3. Enable backend provider and route gates only on one controlled internal
   revision.
4. Configure a non-production frontend preview with both frontend gates:

   ```text
   VITE_HANDWRITING_MODE=myscript-poc
   VITE_MYSCRIPT_POC_ENABLED=true
   ```

5. Confirm the preview is inaccessible to ordinary student traffic.
6. Run the validated replay plan, beginning with one synthetic fixture and then
   the bounded 30–50-case smoke set.
7. Stop on any permission, retention, authentication, budget, schema, timeout,
   or logging discrepancy.

Do not enable shadow fan-out, hybrid fallback, a percentage rollout, or student
traffic during this stage.

### Completed local synthetic POC

On 2026-08-16 an explicitly approved, synthetic-only runner used an owner-only
repository-external ledger capped at 50 total HTTP attempts. It sent 30
validated vector fixtures, used 30 attempts with no retries or errors, and left
all Cloud Run and frontend gates unchanged. See
[`myscript-synthetic-poc-2026-08-16.md`](myscript-synthetic-poc-2026-08-16.md).

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
ends provider traffic without exposing credential material. Preserve the
attempt ledger for dashboard reconciliation; never reset it as part of rollback.

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
