# Disabled MyScript Cloud Run Deployment Evidence

**Status date:** 2026-08-16

**Result:** `PASS` for the disabled-revision deployment gate only.

This checkpoint proves that the merged MyScript boundary can exist in Cloud
Run without opening provider traffic. It is not a provider evaluation, does not
change the `NOT_RUN` / `NO_DECISION` evaluation state, and does not authorize a
POC or student rollout.

## 1. Source and build identity

| Field | Evidence |
|---|---|
| GCP project | `cs-sail-2b08` |
| Source commit | `22ce718d1c0acebe273d4c78de6e95bd277d1b9c` |
| Source worktree | Clean before submission |
| Cloud Build ID | `1210e5a0-58fb-4a1f-9648-656b7d2e2f1a` |
| Build status | `SUCCESS` |
| Build duration | `3M50S` |
| Image tag | `22ce718-disabled` |
| Cloud Run revision | `verity-ai-00017-phb` |
| Revision image digest | `sha256:a535527fdd58f55ea2963d7f6ded8ebcbdbc24113323d19311a2e66bb0913041` |

The build used the repository's reviewed `cloudbuild.yaml`. No repository
trigger was configured when last inspected on 2026-08-14, so this one-time
manual build is not evidence that merges deploy automatically.

## 2. Runtime metadata

Only Cloud Run metadata was inspected. No Secret Manager version value was
accessed, printed, copied, or placed in a build substitution.

| Check | Observed value | Result |
|---|---|---|
| Runtime service account | `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com` | Pass |
| `MYSCRIPT_ENABLED` | `false` | Pass |
| `MYSCRIPT_POC_ROUTE_ENABLED` | `false` | Pass |
| `MYSCRIPT_APPLICATION_KEY` reference | `verity-myscript-application-key:latest` | Pass for a no-traffic revision |
| `MYSCRIPT_HMAC_KEY` reference | `verity-myscript-hmac-key:latest` | Pass for a no-traffic revision |

`latest` remains prohibited for an enabled POC. Both references must be pinned
to reviewed numeric versions before any provider traffic is approved.

## 3. Content-safe rollout checks

Checks were run against the revision's ready service URL. The production
frontend remained on its existing deployment.

| Check | Observed result |
|---|---|
| `GET /health` | HTTP 200, `{"status":"ok"}` |
| OpenAPI route | `/handwriting/myscript/recognize` present |
| Minimal valid synthetic stroke to `/api/handwriting/myscript/recognize` | HTTP 404, `{"detail":"Not Found"}` |
| Production frontend | HTTP 200 |

The container's static-frontend 404 exception handler deliberately normalizes
all HTTP 404 bodies to `{"detail":"Not Found"}`. Therefore the external body
does not repeat the internal gate message. The OpenAPI route's presence, a
schema-valid request, both false revision flags, and the resulting content-safe
404 together prove the fail-closed disabled state.

No MyScript request was initiated during this validation. A live Gemini
recognition smoke was also deliberately `NOT_RUN`; health and frontend checks
were used instead so this deployment checkpoint would not create an
unapproved model request or cost. Existing offline and CI coverage remains the
evidence for Gemini-path compatibility.

## 4. What remains blocked

This deployment closes only the disabled Cloud Run gate. Live MyScript work
still requires written privacy/legal and commercial answers, an approved
30–50-case smoke corpus, restricted artifact storage, numeric secret versions,
an approved durable attempt-ledger mount with restart proof, provider-dashboard
reconciliation, target devices, and a real user-access boundary. Keep all
frontend and backend MyScript gates false until those owners attach the required
evidence.
