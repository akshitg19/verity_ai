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

