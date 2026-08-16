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
known VerityAI total would be at most 1,550 if v2 used its full authorization,
but the account dashboard has not been reconciled for calls outside the local
ledgers. Before the first v2 request, record a content-free dashboard snapshot
proving at least 1,500 free requests remain. If fewer remain, reduce the v2 run
cap before traffic; do not cross into paid usage.

The run also needs a predeclared, validated synthetic manifest and owner-only
prediction path. Do not spend requests merely because budget exists. The
ledger reserves before every HTTP attempt, including retries, and attempt 1,501
must fail before provider I/O.

## What remains unapproved

This authorization is not evidence for provider adoption and does not approve:

- real handwriting, consented-user data, or a decision-eligible target-device
  corpus;
- an enabled Cloud Run POC route, frontend canary, or production rollout;
- distribution of an application using MyScript;
- vendor contact, commercial terms, payment, or a contract; or
- weakening privacy, authentication, accuracy, latency, correction, fallback,
  or rollback gates.

