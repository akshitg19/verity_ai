# MyScript Synthetic Authorization — 2026-08-16 v2

## Approved boundary

The product owner approved run `myscript-synthetic-poc-20260816-v2` for at
most **1,500 MyScript HTTP attempts**. This replaces the earlier request for an
unspecified unlocked limit with a finite, auditable ceiling.

The approval is limited to:

- deterministic synthetic handwriting already permitted for MyScript;
- internal evaluation only;
- zero student, internal-tester, or other end-user ink;
- zero production-route or frontend-provider activation; and
- zero paid usage or contract action.

The existing v1 run remains immutable at `50 / 50 / 0`. The v2 owner-only,
repository-external ledger was initialized at `1500 / 0 / 1500`; initialization
does not contact MyScript or consume a request.

## Pre-request gate

MyScript's public free trial is account-wide and capped at 2,000 requests. The
[before-run dashboard evidence](myscript-dashboard-quota-evidence-2026-08-16.md)
reported 50 total requests, exactly matching v1 and leaving 1,950 free requests.
The quota gate therefore passes for v2's 1,500-attempt maximum with a 450-request
safety margin. Do not cross into paid usage, and reconcile the dashboard again
after the run.

The run also needs a predeclared, validated synthetic manifest and owner-only
prediction path. Do not spend requests merely because budget exists. The
ledger reserves before every HTTP attempt, including retries, and attempt 1,501
must fail before provider I/O.

## Completed use of this authorization

The frozen 300-case manifest was executed once on 2026-08-16. The run used 300
attempts with zero retry/error, leaving the ledger at `1500 / 300 / 1200`. The
read-only dashboard counter moved from 50 to 350 requests, exactly matching the
two local ledgers and leaving 1,650 of the published 2,000-request allowance.
The content-free result is recorded in
[`myscript-synthetic-v2-results-2026-08-16.md`](myscript-synthetic-v2-results-2026-08-16.md).
Unused capacity remains subject to this document's exclusions and does not
authorize a different corpus or purpose.

## What remains unapproved

This authorization is not evidence for provider adoption and does not approve:

- real handwriting, consented-user data, or a decision-eligible target-device
  corpus;
- an enabled Cloud Run POC route, frontend canary, or production rollout;
- distribution of an application using MyScript;
- vendor contact, commercial terms, payment, or a contract; or
- weakening privacy, authentication, accuracy, latency, correction, fallback,
  or rollback gates.
