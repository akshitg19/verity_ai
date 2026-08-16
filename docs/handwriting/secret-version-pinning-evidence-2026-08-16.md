# MyScript Secret-Version Pinning Evidence

**Status date:** 2026-08-16

**Result:** `PASS` for the numeric Secret Manager version and disabled-runtime
gate only.

This checkpoint removes mutable `latest` references without enabling MyScript,
running a provider corpus, or changing the `NOT_RUN` / `NO_DECISION` evaluation
state.

## 1. Reviewed configuration

| Field | Evidence |
|---|---|
| Source merge commit | `7171a12bc768d7612140c434702babca6c01d107` |
| Pull request | `#39` (`chore: pin MyScript secret versions`) |
| Application-key version | `1` |
| HMAC-key version | `1` |
| Build guard | `scripts/validate_myscript_secret_versions.py` runs before the image build |
| Rejected inputs | Empty, `latest`, zero, leading-zero, and non-numeric versions |
| Repository checks | Five of five required CI/Vercel checks passed |

The version numbers were obtained from Secret Manager metadata. No secret value
was accessed, printed, copied, or placed in a build substitution. A rotation
now requires a reviewed source change; a mutable version override fails before
an image is built or a Cloud Run revision is changed.

## 2. Runtime identity

After the configuration merge, the service specification created a new
revision with the two reviewed numeric references and the existing image.
Avoiding an unnecessary image rebuild kept this metadata-only change bounded
and preserved the previously verified image.

| Check | Observed value | Result |
|---|---|---|
| Cloud Run revision | `verity-ai-00018-fdv` | Pass |
| Serving traffic | 100% to `verity-ai-00018-fdv` | Pass |
| Runtime service account | `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com` | Pass |
| Image tag | `22ce718-disabled` | Pass |
| Image digest | `sha256:a535527fdd58f55ea2963d7f6ded8ebcbdbc24113323d19311a2e66bb0913041` | Pass |
| `MYSCRIPT_ENABLED` | `false` | Pass |
| `MYSCRIPT_POC_ROUTE_ENABLED` | `false` | Pass |
| `MYSCRIPT_APPLICATION_KEY` reference | `verity-myscript-application-key:1` | Pass |
| `MYSCRIPT_HMAC_KEY` reference | `verity-myscript-hmac-key:1` | Pass |

The revision metadata contained references only. It did not expose either
credential value.

## 3. Content-safe checks

| Check | Observed result |
|---|---|
| `GET /health` | HTTP 200, `{"status":"ok"}` |
| OpenAPI route | `/handwriting/myscript/recognize` present |
| Minimal valid synthetic stroke to `/api/handwriting/myscript/recognize` | HTTP 404, `{"detail":"Not Found"}` |
| Production frontend | HTTP 200 |

The generic 404 body is produced by the container's static-frontend exception
normalizer. Route presence, a schema-valid request, both false flags, and the
404 together prove that the provider path remains fail closed.

No MyScript request was initiated. No live Gemini recognition request was run,
so this checkpoint adds no provider/model accuracy, latency, quota, request, or
cost claim.

## 4. Remaining gates

Numeric secret pinning is complete. Live provider work remains blocked on
written privacy/legal and commercial approval, an approved 30–50-case corpus,
restricted artifact storage, an approved durable attempt-ledger mount with
restart proof, provider-dashboard reconciliation, target devices, and a real
user-access boundary. Keep all MyScript flags false until those owners attach
the required evidence.
