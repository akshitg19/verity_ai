# Current-Main Disabled MyScript Deployment Evidence

**Status date:** 2026-08-16

**Result:** `PASS` for the latest-`main` disabled-revision deployment gate.

This checkpoint deploys the complete reviewed handwriting implementation from
current `main` while keeping MyScript unreachable from production. It does not
enable provider traffic, make a MyScript request, or change the continuing
`NO_DECISION` provider-selection state.

## 1. Source and build identity

| Field | Evidence |
|---|---|
| GCP project | `cs-sail-2b08` |
| Source commit | `b9b1d76a7bc103749dbfdb8561406606280884a2` |
| Source worktree | Clean before submission |
| Cloud Build ID | `a5703e61-48d6-487a-8fe2-9e35c06aeb51` |
| Build status / duration | `SUCCESS` / approximately `3M40S` |
| Build start / finish | `2026-08-16T23:31:23.473087441Z` / `2026-08-16T23:35:03.041742Z` |
| Image tag | `b9b1d76` |
| Cloud Run revision | `verity-ai-00021-glp` |
| Revision image digest | `sha256:63a3e7ed773a7e88d76c4b5df1eb6ff02b59dcc6821350689209d4003bad1cdc` |

The operator cloned `main` into a new temporary directory and verified the
full commit plus an empty `git status --short` before submitting the
repository's reviewed `cloudbuild.yaml`. That file hardcodes both MyScript
activation flags to `false`; the manual build overrode only the traceable image
tag. No local credential file was read or uploaded.

## 2. Runtime metadata

The repository verifier inspected allowlisted Cloud Run metadata only. It did
not access either Secret Manager value.

| Check | Observed value | Result |
|---|---|---|
| Serving traffic | 100% to `verity-ai-00021-glp` | Pass |
| Runtime service account | `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com` | Pass |
| Image tag | `verity-ai:b9b1d76` | Pass |
| `MYSCRIPT_ENABLED` | `false` | Pass |
| `MYSCRIPT_POC_ROUTE_ENABLED` | `false` | Pass |
| `MYSCRIPT_APPLICATION_KEY` reference | `verity-myscript-application-key:1` | Pass |
| `MYSCRIPT_HMAC_KEY` reference | `verity-myscript-hmac-key:1` | Pass |

## 3. Content-safe checks

`scripts/verify_disabled_myscript_revision.py` returned `PASS` with this
allowlisted sequence:

| Check | Observed result |
|---|---|
| `GET /health` | HTTP 200 |
| `GET /openapi.json` | HTTP 200; MyScript route present |
| Minimal synthetic stroke to the disabled MyScript route | HTTP 404 |
| Production frontend | HTTP 200 |

The verifier proves both activation flags are false before making any HTTP
request. The minimal route check stops inside VerityAI, so it creates no
MyScript request. No response body, secret value, student ink, or user content
was retained in this evidence.

## 4. Scope and remaining gates

This proves that the latest merged implementation is deployed and fail-closed;
it is not evidence that MyScript is production-ready. Gemini remains the only
enabled production recognizer. Provider activation still requires the frozen
target-device/same-input evidence, eligible consented corpus, real
authentication boundary, durable restricted store, five independent current
approvals, rollback evidence, and a manifest that passes the rollout-approval
validator against the exact future activation commit.
