# Google Identity Boundary Evidence

**Status date:** 2026-08-17

**Implementation state:** merged by PR #67 at `94b3e0d`; local, PR, post-merge
CI, Vercel, and production-frontend smoke evidence complete; external
configuration, security review, and a real-account canary are not complete

**Production state:** the Vercel frontend contains the default-off code, with no
OAuth client configured. Cloud Build history has no PR #67 build, and Cloud Run
still sends 100% traffic to disabled revision `verity-ai-00021-glp` from backend
source `b9b1d76`; no identity allow-list is deployed.

## Purpose and decision boundary

The previous `X-Verity-Key` browser header is visible in a JavaScript bundle and
is only a deterrent against crawlers or casually shared links. It cannot prove
who is using the service. This implementation adds an optional real-user
identity boundary for a future internal handwriting preview without changing
the current disabled production state.

The mechanism does not approve MyScript, student data, a paid plan, an OAuth
client, or production activation. It creates the code path that a security and
product owner can review before any provider route opens.

## Implemented flow

1. When `VITE_GOOGLE_CLIENT_ID` is configured, the workspace is replaced by a
   Google Identity Services sign-in gate. The public landing page remains
   available.
2. The Google callback places the returned ID token only in module memory. The
   token is never written to local storage, IndexedDB, notebook data, analytics,
   or logs.
3. API calls send the token as `Authorization: Bearer ...`. A rejected or
   expired token is cleared immediately after an HTTP 401.
4. When `VERITY_AUTH_MODE=google`, the backend uses the official `google-auth`
   verifier to check the signature, OAuth client audience, Google issuer, and
   expiry. It then requires a verified email and an explicit stable Google
   `sub`, authoritative email, or Workspace `hd` allow-list match.
5. Google public signing certificates use an HTTP `Cache-Control` aware memory
   cache. This avoids an extra certificate-download round trip on each student
   action while respecting key rotation. Tokens are not cached.
6. A valid identity is attached only to request-local state. No token or claim
   is logged. A valid but unapproved identity receives HTTP 403; missing,
   malformed, wrong-audience, wrong-issuer, or expired credentials receive a
   content-safe HTTP 401; signing-key transport failure receives HTTP 503.

The health endpoint and CORS preflight remain open so Cloud Run health checks
and browser preflight continue to work. API endpoints are protected. If Google
identity is enabled, the old shared browser header cannot bypass it.

## Fail-closed configuration

Authentication is off by default. `cloudbuild.yaml` explicitly deploys:

```text
VERITY_AUTH_MODE=off
VERITY_GOOGLE_CLIENT_ID=
VERITY_AUTH_ALLOWED_SUBJECTS=
VERITY_AUTH_ALLOWED_DOMAINS=
```

Enabling `VERITY_AUTH_MODE=google` without a web OAuth client ID and at least
one explicit allow-list fails service startup. Unknown authentication modes and
malformed allow-list values also fail startup. `MYSCRIPT_POC_ROUTE_ENABLED=true`
requires this reviewed identity boundary in a deployment. A shared-key local
POC must additionally opt into `MYSCRIPT_ALLOW_SHARED_ACCESS=true`; Cloud Build
hardcodes that escape hatch and both MyScript flags to `false`.

For a narrow internal canary, exact stable Google subjects are preferred over
an entire Workspace domain. Subjects are persistent pseudonymous identifiers,
so deployment-metadata access must remain restricted. An exact email can bootstrap a controlled preview
only when Google is authoritative for that address. Obtain stable subjects
through an approved identity-admin workflow; never paste ID tokens into source,
issues, chat, build variables, or this task.

The Vite production build also fails if a Google client ID and
`VITE_API_SECRET` are configured together. This prevents the old shared value
from remaining in a production bundle after real identity is enabled.

## Verification completed

- Backend identity and middleware tests cover configuration failure, exact
  subject/email/domain authorization, Gmail and Workspace authority rules,
  issuer/audience/expiry/email verification, malformed headers, provider
  outage, health, CORS preflight, shared-key non-bypass, and the MyScript route
  gate.
- Full backend: 1,316 passed, 3 expected xfails, and 3 pre-existing OPSIN
  warnings across 1,319 collected tests.
- Frontend token-store, API, and component tests cover the disabled default,
  in-memory bearer header, HTTP-401 clearing, Google gate, accepted callback,
  and sign-out.
- Full frontend: 410 passed across 43 files; lint passed.
- Production builds passed with identity unset and with a syntactically valid
  synthetic web OAuth client ID. API-base and provider-secret scans passed.
- A negative production build with both Google identity and `VITE_API_SECRET`
  failed with the expected guard.
- A local production-preview browser smoke displayed only the team sign-in
  gate on `/math`, then rendered the official Google button. The workspace was
  not mounted, there were no console warnings/errors, and no MyScript action was
  possible. The synthetic client ID was not used to sign in.
- PR #67 passed Linux backend, Windows backend, frontend, Vercel preview, and
  Vercel production checks. Post-merge `main` CI run `31996768597` passed all
  three jobs. The Vercel deployment status pins exact merge `94b3e0d`.
- A read-only Vercel production `/math` smoke opened the existing Gemini
  workspace directly, proving `VITE_GOOGLE_CLIENT_ID` remains unset. The page
  had no console warning/error and no recognition action was invoked.
- Read-only Google Cloud consoles showed the newest build remains
  `a5703e61-48d6-487a-8fe2-9e35c06aeb51` and revision
  `verity-ai-00021-glp` still receives 100% of Cloud Run traffic. Therefore the
  merged backend identity code is not represented as deployed evidence.

No real user credential, OAuth client, Google account claim, student ink,
MyScript request, or production flag was created or transmitted by these tests.

## External evidence still required

| Owner | Required evidence | Unlock action |
|---|---|---|
| Security/product | Written approval of Google Identity Services, the exact audience, exact-user policy, token lifetime behavior, and access-removal process | Approve this boundary or request changes; assign a durable authentication-boundary evidence ID |
| GCP/OAuth administrator | OAuth consent configuration and a Web OAuth client with only reviewed HTTPS JavaScript origins | Create it only after explicit approval; record the public client ID and origin list without exposing any credential |
| Identity/access owner | Exact internal reviewer subjects or a separately approved Workspace domain; offboarding owner | Store the reviewed list in deployment configuration and prove an allowed and denied account |
| Frontend operator | Matching `VITE_GOOGLE_CLIENT_ID` on one non-production stable preview origin | Deploy only after the backend audience and allow-list are already fail-closed |
| QA owner | Desktop and iPad real-account evidence for sign-in, expiry/re-authentication, denied account, API 401/403/503, sign-out, and no token persistence/logging | Attach content-free results to the authentication approval artifact |

Google OAuth setup is not performed by this change because it creates a
persistent external access configuration and needs an approved origin and
access policy. Until the owners above provide evidence, keep authentication and
both MyScript flags disabled and do not treat this mechanism as a completed
security review.

## Primary references

- [Google: verify the ID token on the server](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Google: display the Sign in with Google button](https://developers.google.com/identity/gsi/web/guides/display-button)
- [google-auth ID-token verification and certificate caching](https://google-auth.readthedocs.io/en/latest/reference/google.oauth2.id_token.html)
