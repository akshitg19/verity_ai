# Current-Main Disabled MyScript Deployment Evidence

**Status date:** 2026-08-17

**Result:** `PASS` for the current-`main` disabled-revision deployment gate.

This checkpoint deploys repository commit
`3b1ca95c91e6da62ba8ca3c0dc42cea00a91bb83`, including the merged default-off
Google identity boundary, while keeping MyScript unreachable from production.
It does not configure an OAuth client or allow-list, enable provider traffic,
make a MyScript request, or change the continuing `NO_DECISION` provider state.

## 1. Source and build identity

| Field | Evidence |
|---|---|
| GCP project | `cs-sail-2b08` |
| Source commit | `3b1ca95c91e6da62ba8ca3c0dc42cea00a91bb83` |
| Source worktree | Fresh Cloud Shell temporary clone; detached exact commit; clean before submission |
| Cloud Build ID | `37fec1f2-8ed5-43dd-b1aa-d004e32bc760` |
| Build status | `SUCCESS` |
| Build start / finish | `2026-08-17T05:24:30.694805142Z` / `2026-08-17T05:28:22.269303Z` |
| Image tag | `3b1ca95` |
| Cloud Run revision | `verity-ai-00022-2vj` |
| Revision created | `2026-08-17T05:27:50.697015Z` |
| Revision image digest | `sha256:4d2d749c486d6ffd4c4d8fa32bd08975c6d2cdedecc626bf78b0c793016af77f` |

The operator cloned the public repository into a new temporary Cloud Shell
directory, checked out the full source commit, required an empty
`git status --porcelain`, and ran the numeric secret-version validator before
submitting the reviewed `cloudbuild.yaml`. The manual build overrode only the
traceable image tag. The local credential file was not read or uploaded.

## 2. Runtime metadata

The repository verifier inspected allowlisted Cloud Run metadata only. It did
not access either Secret Manager value.

| Check | Observed value | Result |
|---|---|---|
| Serving traffic | 100% to `verity-ai-00022-2vj` | Pass |
| Runtime service account | `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com` | Pass |
| Image tag | `verity-ai:3b1ca95` | Pass |
| `MYSCRIPT_ENABLED` | `false` | Pass |
| `MYSCRIPT_POC_ROUTE_ENABLED` | `false` | Pass |
| `MYSCRIPT_APPLICATION_KEY` reference | `verity-myscript-application-key:1` | Pass |
| `MYSCRIPT_HMAC_KEY` reference | `verity-myscript-hmac-key:1` | Pass |
| `MYSCRIPT_ALLOW_SHARED_ACCESS` | `false` | Pass |
| `VERITY_AUTH_MODE` | `off` | Pass |
| `VERITY_API_SECRET` configured | no | Pass |
| Google OAuth client configured | no | Pass |
| Subject/email/domain allow-list configured | no | Pass |

`cloudbuild.yaml` also deploys `MYSCRIPT_ALLOW_SHARED_ACCESS=false`,
`VERITY_AUTH_MODE=off`, an empty Google client ID, and empty identity
allow-lists. The merged identity verifier is therefore present but inactive;
no account identity is required or collected in the current production state.
The enhanced verifier at source `a9eab64` later re-read the live revision and
machine-checked these access-boundary values rather than inferring them only
from `cloudbuild.yaml`; it returned `PASS` without reading a credential value.

## 3. Content-safe checks

`scripts/verify_disabled_myscript_revision.py` returned `PASS` before and after
the access-boundary hardening, with this
allowlisted sequence:

| Check | Observed result |
|---|---|
| `GET /health` | HTTP 200 |
| `GET /openapi.json` | HTTP 200; MyScript route present |
| Minimal synthetic stroke to the disabled MyScript route | HTTP 404 |
| Production frontend | HTTP 200 |

The verifier proves both activation flags are false before making any HTTP
request. The minimal route check stops inside VerityAI, so it creates no
MyScript request. No response body, secret value, student ink, Google token,
provider output, or user content was retained in this evidence.

## 4. Scope and remaining gates

This proves the current backend and default-off identity mechanism are deployed
fail-closed. It is not evidence that MyScript or identity-gated traffic is
production-ready. Gemini remains the only enabled production recognizer.
Provider activation still requires target-device and same-input evidence, an
eligible consented corpus, approved real-account identity configuration,
privacy/legal/commercial/security/data/product approvals, a restricted durable
store, authenticated canary and rollback evidence, and a rollout manifest that
passes against the exact future activation commit.
