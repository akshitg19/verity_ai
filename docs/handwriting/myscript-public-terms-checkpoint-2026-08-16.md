# MyScript Public Terms Checkpoint — 2026-08-16

**Scope:** engineering due diligence for VerityAI's cloud-recognition POC and
release gates. This is not legal advice and does not approve student traffic,
production distribution, or a purchase.

## Verified public facts

The following facts are stated directly in MyScript's current public materials
as reviewed on 2026-08-16:

| Topic | Public evidence | Engineering consequence |
|---|---|---|
| Free allowance | The pricing page and V.8 terms list 2,000 cloud requests. A REST call counts as one request. | The account-level allowance is not a VerityAI run budget. The approved synthetic run is exhausted at its separate 50-attempt cap. |
| Trial purpose | V.8 Section 7.1 limits the free trial to internal testing and evaluation. | Synthetic internal POC work fits the stated purpose; distribution does not. |
| Trial-result use | V.8 Section 7.1 permits MyScript to access trial recognition results for internal research and service improvement, subject to confidentiality. | Do not send student or otherwise sensitive ink under the trial without written reconciliation and internal approval. |
| Commercial use | V.8 Section 7.2 requires contacting MyScript for a commercial agreement before distributing an application using the service or exceeding 2,000 requests. Public pricing above the free allowance is quote-only. | No purchase is needed for the completed synthetic smoke. A written commercial agreement and quote remain production gates. |
| DPA applicability | The May 2026 DPA says it is binding for a MyScript account and expressly includes cloud recognition through the developer portal. MyScript is the processor and the customer is the controller. | The DPA is relevant evidence, but VerityAI privacy/legal still needs to approve it for the intended student use. |
| Recognition content retention | DPA Schedule 3 says unstructured handwriting sent for cloud recognition is returned after processing and is not stored unless the customer expressly requests storage in writing. | This narrows the content-retention question, but does not supersede the separate trial-result and technical-error access clauses without legal/vendor confirmation. |
| Metadata retention and location | The DPA says end-user IP addresses remain in log records for 12 months. It lists AWS in Oregon, USA with SCCs and Brevo in the EU for developer-portal cloud recognition. | The product must document the backend/network identity seen by MyScript and privacy/legal must approve the 12-month metadata retention and transfers. |
| Operational access | V.8 Section 18.3 permits MyScript to access end-user input temporarily to analyze reported or detected technical errors and improve recognition, and places express-permission responsibility on the customer. | Consent and opt-out behavior require written clarification before student traffic. |
| Deletion | The DPA provides deletion on express request/account deletion and a cessation backstop; V.8 says deleting the account permanently deletes account data. | Legal/privacy must confirm the practical request path and which logs, backups, results, and derived research data are covered. |
| Service level/support | V.8 provides the cloud service as-is with no uptime guarantee and directs technical questions to a public forum. | The public trial is unsuitable as a production SLA. Availability, support, incident response, and remedies must be negotiated. |
| Attribution/publicity | V.8 requires discoverable copyright attribution and “Powered by MyScript®”, grants customer-list/logo publicity rights, and restricts trademark use. | Product/legal must approve or negotiate the exact attribution and make publicity/logo use opt-in before release. |

## What the public documents do not close

Public evidence does not establish:

- FERPA, COPPA, or US state student-data commitments;
- a student-data privacy agreement or school/parent consent model;
- exclusion of inputs, outputs, or derived data from trial research, technical
  analysis, human review, or recognition-engine improvement;
- whether the DPA's transient-content language controls over the V.8 access and
  improvement clauses for this account and endpoint;
- a shorter or disableable IP-log retention period;
- production price, minimum commitment, overage handling, negotiated quota,
  support, incident response, or SLA;
- acceptable changes to attribution, trademark, customer-logo, and publicity
  rights; or
- a supported browser WebSocket design that does not expose permanent keys.

These are contract/privacy questions, not engineering gaps. Until the written
answers and internal approval exist, all MyScript production and POC-route
flags stay false and no student ink is sent.

## Minimal written confirmation package

The vendor/privacy owner should now ask MyScript only to:

1. reconcile V.8 Sections 7.1 and 18.3 with DPA Schedule 3 for inputs, results,
   derived data, research, technical review, storage, deletion, and opt-out;
2. state the FERPA/COPPA/student-data and minor-consent terms available for the
   intended US education use;
3. confirm the exact metadata, network identity, regions, subprocessors,
   retention, deletion, breach-notification, and audit process for the proposed
   configuration;
4. provide production distribution rights, price, request accounting, caps,
   overage behavior, cancellation, SLA, support, and incident-response terms;
5. confirm or negotiate attribution, trademark, logo/publicity, and end-user
   notice requirements; and
6. describe a supported ephemeral-session or backend-relay design for future
   WebSocket recognition, if offered.

## Primary sources

- Pricing and request accounting:
  https://developer.myscript.com/pricing
- V.8 August 2025 license terms:
  https://developer.myscript.com/pdf/License-terms-of-use-and-sale.pdf
- May 2026 DPA:
  https://www.myscript.com/dpa/
