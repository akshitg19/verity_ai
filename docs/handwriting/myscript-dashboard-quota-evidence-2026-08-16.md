# MyScript Dashboard Quota Evidence — 2026-08-16

**Observed at:** `2026-08-16T19:25:19Z`  
**Surface:** authenticated MyScript Cloud `Counters` page  
**Operation:** read-only; no application settings, credentials, or provider
request were opened or changed

## Content-free counter snapshot

The dashboard's “Your total recognition consumption is” counter reported:

| Counter | Value |
|---|---:|
| Requests | 50 |
| Strokes | 407 |
| Bytes | 125,520 iB |

The 50-request dashboard total exactly matches the immutable v1 local ledger at
`50 / 50 / 0`. The separate v2 ledger remained `1500 / 0 / 1500` during this
read. No request was made to obtain the counter.

## Free-allowance reconciliation

MyScript's current public trial allowance is 2,000 account-wide requests:

```text
2,000 trial allowance - 50 observed requests = 1,950 remaining requests
1,950 remaining - 1,500 v2 cap = 450-request safety margin
```

The v2 before-run quota gate therefore passes for a maximum of 1,500 attempts
without crossing the published free allowance. This arithmetic does not
authorize paid use, a higher cap, student/end-user ink, production activation,
or distribution. The post-run dashboard counter must still be recorded and
reconciled to the v2 ledger before closing the run.

## Post-run reconciliation

**Observed at:** `2026-08-16T19:45:11Z`
**Operation:** read-only counter refresh after the single frozen v2 run

| Counter | Before | After | Change |
|---|---:|---:|---:|
| Requests | 50 | 350 | +300 |
| Strokes | 407 | 3,352 | +2,945 |
| Bytes | 125,520 iB | 1,087,591 iB | +962,071 iB |

The v2 append-only ledger reports exactly 300 attempts. The expected account
total is therefore `50 prior + 300 v2 = 350`, matching the dashboard with a
discrepancy of zero. The published 2,000-request free allowance has 1,650
requests remaining. No recognition request was made while reading either
counter snapshot.
