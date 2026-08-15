# Handwriting Provider Readiness Review

**Evidence date:** 2026-08-14
**Decision scope:** vector handwriting recognition, image fallback, evaluation
corpus, credentials, privacy, licensing, and bounded proof of concept (POC)
**Legal status:** engineering due diligence, not legal advice

## 1. Decision summary

MyScript remains the preferred **vector-recognition POC**, using its REST API
from the VerityAI backend. It is not approved for student traffic or production
distribution yet. The current free-trial license is limited to internal testing
and evaluation, permits MyScript to access trial results for internal research,
and requires a separate commercial agreement before distribution. The current
DPA describes transient ink processing, but does not expressly address FERPA or
COPPA. Those points require written vendor answers and an internal privacy/legal
approval before any real student ink is sent.

Mathpix is the most practical hosted contingency because `v3/strokes` accepts
digital ink and supports short-lived client tokens. It also remains unapproved
for student traffic pending contractual and privacy review.

The existing Gemini 2.5 Flash image path is retained only as the current
engineering baseline and controlled fallback. Google Cloud's current Service
Specific Terms prohibit use of Generative AI Services in an application directed
to, or likely to be accessed by, people under 18. VerityAI must therefore not
treat this path as cleared for a student-facing rollout without a written
contractual exception or a documented determination that the restriction does
not apply.

GPT-5.6 Luna is an optional image-baseline candidate, not an approved dependency.
There is no VerityAI OpenAI API credential or approved traffic budget in scope.
Its live benchmark remains gated on account authorization, parental-consent
design for minors, retention controls, and privacy/legal review.

UniMERNet and TexTeller are useful self-hosted image-recognition candidates for a
later GPU experiment. Neither provides the incremental vector interaction that
motivates the MyScript POC. Google MathWriting is a dataset, not a recognizer;
its CC BY-NC-SA 4.0 data license requires legal review before use in a commercial
product evaluation.

## 2. Verified VerityAI state

These prerequisites are complete and must not be repeated:

- MyScript Developer application created.
- Google Cloud project: `cs-sail-2b08`.
- Secret Manager secrets created:
  `verity-myscript-application-key` and `verity-myscript-hmac-key`.
- Cloud Run runtime service account:
  `verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com`.
- The runtime service account has Secret Manager Secret Accessor on both
  secrets.
- Local credentials are held outside source control in `.secrets/myscript.env`.
  Their values must never be printed, logged, committed, returned by an API, or
  placed in frontend code.

Account creation, key creation, and secret storage are therefore not POC tasks.

## 3. Bounded provider screen

| Candidate | Input / interaction | Current evidence | Readiness decision |
|---|---|---|---|
| MyScript iink Cloud | Native strokes; REST after collection or incremental WebSocket | REST signs the exact body with HMAC-SHA-512 and can return JIIX/LaTeX. Free trial is 2,000 requests for internal evaluation only; production distribution requires a commercial agreement. | **Preferred POC; no student/prod traffic.** Start with backend REST. Ask for a vendor-approved ephemeral WebSocket design before considering incremental client traffic. |
| Mathpix Convert API | Native strokes; one-shot or live session | `v3/strokes` accepts x/y stroke arrays. Short-lived app tokens and stroke-session IDs allow client calls without exposing the permanent key. Non-live calls are currently $0.002/request; first 1,000 live sessions/month are listed as free, after a $19.99 setup with $29 test credit. | **Hosted contingency; no student traffic yet.** Technically strong, but retention, minor/education terms, contract, and spend approval remain open. |
| Gemini 2.5 Flash on Vertex AI | Rendered PNG, final-only | Existing VerityAI baseline. Current standard pricing lists $0.30/M input tokens and $2.50/M output tokens. Google says customer data is not used for model training without permission, but current service terms contain an under-18 application restriction. | **Internal baseline only.** Do not label student-facing production compliant without written legal/contractual resolution. |
| GPT-5.6 Luna API | Image input, text output, final-only | Official model page lists image input, structured output, and $0.20/M input, $0.02/M cached input, $1.20/M output tokens. API data is not used for training by default; default abuse-monitoring retention can be up to 30 days and eligible customers may request ZDR. OpenAI's Services Agreement requires parental/guardian consent for minors. | **Optional benchmark only.** No key, approved spend, consent flow, DPA/SDPA review, or retention approval exists in scope. |
| UniMERNet | Rendered image to LaTeX, self-hosted | Apache-2.0 repository; published base/small/tiny checkpoints are approximately 1.3 GB/773 MB/441 MB. The project reports handwritten-expression support. | **Later self-hosted experiment.** Verify checkpoint/dataset licenses independently, benchmark CPU/GPU cold starts, and do not expect provisional vector results. |
| TexTeller 3 | Rendered image to LaTeX, self-hosted | Apache-2.0 repository; project documents handwritten-formula support and a Ray Serve deployment with configurable CPU/GPU replicas. | **Later self-hosted experiment.** Verify checkpoint and training-data provenance; measure GPU cost and handwritten accuracy on the VerityAI corpus. |
| Google MathWriting | Online stroke dataset, not a service | Google publishes digital inks and labels under CC BY-NC-SA 4.0; repository code is Apache-2.0. | **Dataset candidate only; legal hold.** NonCommercial and ShareAlike obligations make it unsuitable for automatic adoption into a commercial benchmark or training pipeline. |

Published benchmark claims are discovery evidence only. They are not substitutes
for replaying the same frozen VerityAI corpus through every candidate.

## 4. MyScript POC architecture

### 4.1 Start with backend REST

The first POC should use:

```text
browser strokes
  -> VerityAI recognition endpoint
  -> backend validates and bounds the stroke payload
  -> backend builds one canonical MyScript request body
  -> backend computes HMAC over those exact bytes
  -> MyScript /api/v4.0/iink/recognize
  -> backend parses JIIX math label / candidate output
  -> existing frontend recognition contract
```

Reasons:

- The permanent application and HMAC keys never cross the backend boundary.
- REST matches the current “recognize a completed expression” POC and needs one
  counted call per case/configuration.
- JIIX can carry structured results and a math LaTeX label in one response, so
  the evaluator must not make a second request merely to obtain another output
  format.
- WebSocket can eventually improve provisional latency, but MyScript's public
  browser examples require an HMAC-capable client. VerityAI will not copy the
  permanent HMAC key into JavaScript. Incremental use requires written vendor
  guidance for ephemeral credentials or a separately reviewed backend relay.

### 4.2 Request and response guardrails

- Accept only the versioned VerityAI stroke schema and supported math topic.
- Enforce bounded expression, stroke, point, body-size, and coordinate limits
  before signing.
- Serialize once; compute HMAC and send the same byte string.
- Do not send local stroke IDs, pointer IDs, presentation styles, page IDs, or
  expression IDs to MyScript. Translate only ordered coordinate arrays and
  valid optional time/pressure arrays.
- Request JIIX with `export.jiix.strokes=false`, keep the math solver disabled,
  and return only the restricted linear-equation normalization from the API
  route. The provider's raw JIIX/LaTeX is never written to normal logs.
- Use a short connect/read timeout and an abort signal.
- Retry at most once for a transient `429`/`5xx`, and count the retry against
  the evaluation budget. Do not retry authentication, quota, or validation
  failures.
- The online API route does not persist raw provider output. During an approved
  evaluator run, store raw provider output only in the restricted run artifact
  named by the validated replay plan, then normalize it for scoring.
- Never put ink, JIIX, LaTeX, expected answers, keys, HMACs, request bodies, or
  student identifiers in normal application logs.
- Log only content-free fields such as provider, mode, fixture category,
  duration bucket, response class, and trace identifier generated by VerityAI.
- Keep Gemini as a feature-flagged fallback during experiments; candidate output
  must not affect the user's verdict in shadow mode.

### 4.3 Secrets and Cloud Run mapping

Runtime environment names:

| Environment variable | Secret Manager source | Exposure |
|---|---|---|
| `MYSCRIPT_APPLICATION_KEY` | `verity-myscript-application-key` | backend only |
| `MYSCRIPT_HMAC_KEY` | `verity-myscript-hmac-key` | backend only |

Non-secret configuration should use explicit environment variables:

```text
MYSCRIPT_ENABLED=false
MYSCRIPT_POC_ROUTE_ENABLED=false
MYSCRIPT_RECOGNITION_URL=https://cloud.myscript.com/api/v4.0/iink/recognize
MYSCRIPT_TIMEOUT_SECONDS=3
MYSCRIPT_EVAL_REQUEST_CAP=650
```

`cloudbuild.yaml` maps the two existing Secret Manager resources to the two
runtime environment names with Cloud Run's `--update-secrets` option. The first
disabled revision uses `latest` because no MyScript traffic is possible. Before
an approved POC, override both version substitutions with reviewed numeric
versions, matching Google's recommendation to pin environment-variable secrets.
Cloud Run checks the runtime identity's secret access during deployment and
resolves environment-variable secrets before an instance starts. Do not run a
command that reads a secret version's value merely to verify the mapping;
inspect Cloud Run metadata and exercise the disabled route check instead.

The provider flag and the separate POC-route flag stay false in production until
the privacy, commercial, corpus, and release gates below are signed off. Even
then, the HTTP route fails closed unless VerityAI's existing API access-control
header is also configured. That shared header is not real user authentication;
student rollout requires a separate authentication review.

### 4.4 Frontend POC gates

The frontend adapter is direct vector-only and ships unreachable. It requires
both of these build-time settings:

```text
VITE_HANDWRITING_MODE=myscript-poc
VITE_MYSCRIPT_POC_ENABLED=true
```

Either setting alone resolves to the current Gemini recognizer. The POC mode
sends only ordered x/y and valid optional t/p point fields, allowed pointer type,
fixed schema/profile, and CSS-pixel DPI to VerityAI's backend route. It omits
local stroke IDs, page/expression IDs, previous transcription, pen color, width,
images, and Base64 data. It does not contain or reference the provider
application/HMAC keys. It also has no automatic Gemini fallback, so vector-only
measurements cannot silently include PNG work. See `rollout-runbook.md` before
changing any gate.

## 5. Privacy and licensing findings

### 5.1 MyScript

The current MyScript DPA states that MyScript is the processor and the customer
is the controller. For developer-portal cloud recognition it lists unstructured
handwriting and end-user IP addresses, says handwriting is returned after
processing and not stored unless expressly requested in writing, and says IP
addresses remain in logs for 12 months. It lists AWS in Oregon, USA (with SCCs)
and Brevo in the EU as subprocessors.

The license and DPA need reconciliation before student data is used. The free
trial license allows MyScript to access recognition results for internal use and
research to improve the service, while the DPA describes transient handwriting
processing. No official document reviewed here expressly commits to FERPA,
COPPA, a US student-data agreement, a minimum end-user age for the developer
API, or exclusion of trial results from model/service improvement.

The current license also requires a discoverable MyScript copyright attribution,
states that production distribution requires a commercial agreement, contains
“Powered by MyScript”/publicity language, provides no uptime guarantee for the
free service, and requires MyScript approval before using its trademarks or
claiming collaboration. Product and legal must approve the exact attribution and
negotiate any publicity terms.

### 5.2 Mathpix

Permanent Mathpix API keys are server credentials. Its official authentication
guide explicitly warns against putting them in client code and documents
short-lived app tokens for direct client requests. Its privacy guide says
`metadata.improve_mathpix=false` prevents storage of input/results for the
image/stroke endpoint family, while billing/audit metadata is retained. Default
QA retention can otherwise be up to 90 days. The public privacy policy says the
service does not knowingly solicit data from children under 13, but the reviewed
materials do not provide a FERPA/COPPA commitment or a student-data agreement.

### 5.3 Current Gemini baseline

Google documents a training restriction and optional controls toward zero data
retention, but its current Service Specific Terms also prohibit using a
Generative AI Service in an application directed to or likely to be accessed by
people under 18. That contractual restriction is a release blocker independent
of model accuracy or the existing implementation.

### 5.4 OpenAI optional baseline

OpenAI states that API business data is not used to train models by default.
Most API inputs and outputs may be retained up to 30 days for abuse monitoring;
qualifying customers can request Zero Data Retention for eligible endpoints.
Its current Services Agreement prohibits allowing minors to use the services
without parent or guardian consent. A DPA and a published Student Data Privacy
Agreement exist, but applicability to VerityAI and GPT-5.6 Luna requires an
approved account/order and legal review.

## 6. Evaluation request budget

The public MyScript trial quota is 2,000 requests. REST accounting is one API
call per request. Before any POC, the operator must inspect the dashboard's
remaining quota without exposing credentials; this document does not assume the
account is still at 2,000.

Use one fixed POC configuration and one JIIX response per fixture:

| Stage | Planned fixtures/calls | Maximum |
|---|---:|---:|
| Adapter/auth smoke with synthetic or approved internal ink | 30–50 | 50 |
| Frozen evaluation corpus | 300–500 | 500 |
| Explicit transient retry allowance | at most 10% | 55 |
| Configuration/debug reserve | bounded | 45 |
| **Hard POC cap** |  | **650** |

Rules:

- Stop automatically before call 651, regardless of dashboard quota.
- A retry and a failed request both consume the local budget counter.
- The adapter's in-process counter is a secondary fail-closed guard, not a
  durable cross-restart ledger. An approved live POC must also use the frozen
  replay plan, a durable run total, one controlled revision, and before/after
  dashboard checks. Never rely on a restarted Cloud Run process to remember
  prior requests.
- Run neither the 30–50 smoke nor the 300–500 corpus until each fixture's
  source, retention, reviewer status, and provider permission pass validation.
- Do not fan one writer's ink out to multiple providers unless the consent and
  evaluation protocol expressly allow each named provider.
- Preserve at least 1,350 nominal trial requests for follow-up, minus any usage
  already shown in the vendor dashboard.
- Obtain a written commercial quote before forecasting production cost. “Free
  to 2,000” is a trial quota, not production pricing.

## 7. Readiness checklist and gates

| Gate | Current status | Evidence required to close |
|---|---|---|
| Developer account, app, keys | Complete | User-verified 2026-08-14 |
| GCP secret storage and runtime IAM | Complete | User-verified 2026-08-14 |
| Backend REST adapter with mock tests | Implemented; live call blocked | Fixed HMAC vector, exact-body mock, timeout/error/retry/cap tests, bounded schemas, content-safe logging |
| Cloud Run secret-to-environment mapping | Implemented in deploy config; runtime verification pending | Revision metadata showing both mappings and both false flags, never values |
| Direct frontend POC adapter | Implemented in PR #35 | Dual-gate config tests, ordered vector payload, no-PNG/no-local-metadata assertion, cancellation and safe-error tests, production-bundle secret scan |
| Synthetic/internal smoke corpus (30–50) | Blocked | Approved sources, two-reviewer truth for decision cases, schema validation |
| Frozen external corpus (300–500) | Blocked | Consent/provenance, restricted store, retention/deletion policy, target devices |
| MyScript trial data-use clarification | Blocked | Written answer reconciling trial research access with DPA transient processing |
| FERPA/COPPA/minor use | Blocked | Written vendor answer plus VerityAI privacy/legal approval |
| Commercial production right and price | Blocked | Signed agreement/quote; attribution and publicity terms approved |
| POC accuracy/latency report | Blocked by corpus/vendor gates | Reproducible aggregate report; raw artifacts remain restricted |
| Student-facing rollout | Blocked | All prior gates, canary/rollback proof, observability, support/runbook |
| Gemini student-facing fallback | Blocked | Written contractual/legal resolution of current under-18 restriction |

“Blocked” here prevents external traffic or rollout; it does not prevent merging
offline adapter code, mocks, schema validation, scorer tooling, or deployment
configuration with `MYSCRIPT_ENABLED=false`.

## 8. Vendor contact draft — do not send automatically

**To:** MyScript Sales / Legal / Privacy
**Subject:** VerityAI education handwriting recognition — cloud POC and
production terms

> We are evaluating MyScript iink Cloud for a student-facing math and chemistry
> learning application. We have created a developer application and plan an
> initial internal evaluation under 650 REST calls using synthetic or expressly
> approved fixtures. Before sending any student handwriting or enabling
> production traffic, please confirm the following in writing:
>
> 1. Does the May 2026 DPA apply to math recognition through
>    `/api/v4.0/iink/recognize/`, even though its Services definition refers to
>    “text recognition” and its processing schedule describes handwritten notes
>    transformed to typed text?
> 2. During the 2,000-request free trial, can handwriting, JIIX/LaTeX results, or
>    derived data be accessed, retained, or used to improve models/services?
>    Please reconcile Section 7.1 of the V.8 license with DPA Section 13.3.2's
>    statement that unstructured data is not stored.
> 3. Can trial and paid accounts contractually opt out of all training, research,
>    human review, QA retention, and secondary use of inputs and outputs?
> 4. What exact content and metadata are retained, where, for how long, and by
>    which subprocessors? Can the 12-month end-user IP retention be disabled or
>    replaced by the backend service IP?
> 5. Do you offer FERPA, COPPA, and US state student-privacy terms or a student
>    data privacy agreement? What age restrictions and parental/school consent
>    requirements apply to end users?
> 6. Is US-only or another chosen processing region available? Please identify
>    all subprocessors and cross-border transfers for our configuration.
> 7. What production pricing, request accounting, rate limits, SLA, support, and
>    overage controls apply at our expected volume?
> 8. What exact copyright attribution, “Powered by MyScript” display, trademark
>    approval, customer-logo/publicity right, and end-user EULA terms would a
>    commercial agreement require? Can publicity/logo use be opt-in?
> 9. Is there a supported ephemeral-token or session-credential design for
>    browser WebSocket recognition that never exposes the permanent application
>    or HMAC key? If not, do you recommend a backend WebSocket relay?
> 10. Please confirm API version support/deprecation notice, deletion request
>     process, breach-notification terms, audit materials, and availability of a
>     security report or questionnaire.
>
> We will not send real student data or launch commercially until these items
> are resolved in an executed agreement and our internal review is complete.

## 9. Primary sources

All sources below were accessed 2026-08-14.

### MyScript

- Pricing and request accounting:
  https://developer.myscript.com/pricing
- Production-readiness guidance:
  https://developer.myscript.com/support/account/being-production-ready
- V.8 August 2025 license terms:
  https://developer.myscript.com/legal-docs/License-terms-of-use-and-sale.pdf
- May 2026 DPA:
  https://www.myscript.com/dpa/
- REST architecture and HMAC:
  https://developer.myscript.com/doc/interactive-ink/4.0/web/rest/architecture/
- Current recognize request guide and raw OpenAPI schema:
  https://developer.myscript.com/doc/interactive-ink/4.3/web/rest/new-api/ and
  https://cloud.myscript.com/api/v4.0/iink/batch/api-docs
- REST versus WebSocket:
  https://developer.myscript.com/doc/interactive-ink/4.0/web/overview/http-rest-or-websocket/
- JIIX reference:
  https://developer.myscript.com/docs/interactive-ink/4.3/reference/web/jiix/

### Mathpix

- Stroke guide and endpoint:
  https://docs.mathpix.com/guides/strokes and
  https://docs.mathpix.com/reference/post-v3-strokes
- Authentication and app tokens:
  https://docs.mathpix.com/reference/authentication
- API pricing:
  https://website.mathpix.com/pricing/api
- Privacy and retention:
  https://website.mathpix.com/docs/convert/privacy and
  https://docs.mathpix.com/concepts/data-retention
- Security:
  https://mathpix.com/security
- Terms and privacy policy:
  https://website.mathpix.com/terms and https://mathpix.com/privacy

### Current image baseline and alternatives

- Vertex AI pricing:
  https://cloud.google.com/vertex-ai/generative-ai/pricing
- Vertex AI data retention/training controls:
  https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention
- Current Google Cloud Service Specific Terms:
  https://cloud.google.com/terms/service-terms
- GPT-5.6 Luna model page:
  https://developers.openai.com/api/docs/models/gpt-5.6-luna
- OpenAI API business privacy and data controls:
  https://openai.com/enterprise-privacy/ and
  https://platform.openai.com/docs/models/default-usage-policies-by-endpoint
- OpenAI Services Agreement:
  https://openai.com/policies/services-agreement/
- UniMERNet official repository:
  https://github.com/opendatalab/UniMERNet
- TexTeller official repository:
  https://github.com/OleehyO/TexTeller
- Google MathWriting repository and data license:
  https://github.com/google-research/google-research/tree/master/mathwriting

### Google Cloud deployment

- Cloud Run secret environment-variable mapping, version pinning, startup
  behavior, and runtime identity access:
  https://cloud.google.com/run/docs/configuring/services/secrets
- `gcloud run deploy` flag reference:
  https://cloud.google.com/sdk/gcloud/reference/run/deploy
- Cloud Build to Cloud Run deployment configuration:
  https://cloud.google.com/build/docs/deploying-builds/deploy-cloud-run
