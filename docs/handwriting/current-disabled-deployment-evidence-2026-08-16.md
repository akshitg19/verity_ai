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
| Source merge commit | `3634598727067eae7c3c42b2a372b4a813ff37ee` |
| Pull request | `#45` (`fix: version MyScript normalization evidence`) |
| Cloud Build ID | `d35149af-52e2-4145-9d54-786d09ddb5fb` |
| Build status / duration | `SUCCESS` / `3M39S` |
| Image tag | `3634598-disabled` |
| Cloud Run revision | `verity-ai-00020-zwl` |
| Revision image digest | `sha256:c2f329e9b121fd25c401b58b998cd7d158acb706c316fb6b8a7323bae082fa07` |

The build used the repository's reviewed `cloudbuild.yaml`. The source clone
was checked against the exact merge commit before submission.

## 2. Runtime metadata

The repository verifier inspected allowlisted Cloud Run metadata only. It did
not access a Secret Manager value.

| Check | Observed value | Result |
|---|---|---|
| Serving traffic | 100% to `verity-ai-00020-zwl` | Pass |
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
separate initial 30-case synthetic POC remains decision-ineligible at 86.67%
normalized exact/parse after the zero-request `v2` amendment. A later 20-case
paired `x/X` geometry probe exhausted the same 50-attempt ledger without
changing this deployed revision or its false flags. Student or production
provider traffic still requires the target-device/control corpus, privacy and
commercial approvals, real authentication, and rollout evidence named in
`provider-readiness.md`.
