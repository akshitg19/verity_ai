# Current Disabled MyScript Deployment Evidence

**Status date:** 2026-08-16

**Result:** `PASS` for the post-POC disabled-revision deployment gate.

This checkpoint deploys the reviewed synthetic-POC implementation from current
`main` while keeping MyScript unreachable from production. It does not enable
provider traffic, make another MyScript request, or change the `NO_DECISION`
evaluation state.

## 1. Source and build identity

| Field | Evidence |
|---|---|
| Source merge commit | `7bace8f3e3237de7df05f09e83f0d7998c8ff125` |
| Pull request | `#43` (`feat: add bounded synthetic MyScript POC`) |
| Cloud Build ID | `ff0cc228-807c-4f8f-98ef-697a43c50298` |
| Build status / duration | `SUCCESS` / `4M6S` |
| Image tag | `7bace8f-disabled` |
| Cloud Run revision | `verity-ai-00019-nj7` |
| Revision image digest | `sha256:f0ebbac989b01087f83e23e62c6e3bf6805d0ddcc1db46b702e206208a8e7482` |

The build used the repository's reviewed `cloudbuild.yaml`. The source clone
was checked against the exact merge commit before submission.

## 2. Runtime metadata

The repository verifier inspected allowlisted Cloud Run metadata only. It did
not access a Secret Manager value.

| Check | Observed value | Result |
|---|---|---|
| Serving traffic | 100% to `verity-ai-00019-nj7` | Pass |
| Runtime service account | `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com` | Pass |
| `MYSCRIPT_ENABLED` | `false` | Pass |
| `MYSCRIPT_POC_ROUTE_ENABLED` | `false` | Pass |
| `MYSCRIPT_APPLICATION_KEY` reference | `verity-myscript-application-key:1` | Pass |
| `MYSCRIPT_HMAC_KEY` reference | `verity-myscript-hmac-key:1` | Pass |

## 3. Content-safe checks

| Check | Observed result |
|---|---|
| `GET /health` | HTTP 200 |
| `GET /openapi.json` | HTTP 200; MyScript route present |
| Minimal valid synthetic stroke to the disabled MyScript route | HTTP 404 |
| Production frontend | HTTP 200 |

`scripts/verify_disabled_myscript_revision.py` returned `PASS`. Its mandatory
ordering proves both flags are false before it performs the HTTP checks. The
minimal route check stops inside VerityAI and does not contact MyScript.

## 4. Scope of this evidence

This proves deployment integrity and a fail-closed production state only. The
separate 30-call synthetic POC remains decision-ineligible at 66.67% normalized
exact match and 66.67% deterministic parse success. Student or production
provider traffic still requires the target-device/control corpus, privacy and
commercial approvals, real authentication, and rollout evidence named in
`provider-readiness.md`.
