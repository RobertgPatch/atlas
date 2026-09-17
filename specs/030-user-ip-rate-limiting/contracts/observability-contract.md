# Abuse observability and cost contract

## Goals

- Distinguish which fixed protection layer rejected or saturated.
- Notify the operator within five minutes for urgent conditions.
- Keep metric, log, database, and audit growth bounded under attack.
- Never expose Restricted subjects or credentials.

## Fixed telemetry vocabulary

Custom application metrics use only the `Environment` dimension. The
additional fields below are allowed in bounded structured logs and in the
in-process aggregation key, but never as CloudWatch custom-metric dimensions:

| Dimension | Allowed values |
|---|---|
| `Environment` | `local`, `test`, `production` |
| `RouteClass` | `liveness`, `auth`, `general_api`, `heavy_read`, `download`, `write`, `paid_work`, `internal` |
| `Scope` | `edge_source`, `edge_global`, `source`, `account`, `user`, `session`, `tenant`, `global`, `workload`, `capability` |
| `Reason` | `rate_window`, `concurrency`, `quota`, `backlog`, `disabled`, `store_unavailable`, `invalid_source`, `eviction`, `replay` |
| `Outcome` | `counted`, `blocked`, `throttled`, `unavailable`, `disabled`, `allowed` |
| `WorkloadKey` | Existing reviewed finite workload registry only |

Prohibited dimensions include raw/hashed IP, email, user ID, session ID, account fingerprint, request ID, URL/path parameter, header/cookie, arbitrary error, object key, and presigned operation.

## Application aggregation

- Increment in-process counters keyed only by the finite vocabulary.
- Flush at a bounded interval (target 60 seconds) and on graceful shutdown.
- Cap the buffer at the Cartesian set permitted by configuration; an unknown value maps to `invalid_configuration` and fails production startup rather than creating a new metric.
- Publish only nonzero, actionable environment-level metrics: `AbuseProtectionCritical`, `ProviderCalls`, `RetryAttempts`, `CostUnits`, and `CleanupFailures`.
- Keep routine health checks, successful cleanup detail, and ordinary admission decisions out of CloudWatch custom metrics; retain their bounded operational detail in structured logs.
- Repeated rejected requests do not create one audit/database row each.
- Sample rejection logs using a fixed maximum per class/window and emit one suppressed-count summary.
- Request IDs may appear in bounded sampled logs for correlation, never as metric dimensions.

## WAF logging

- Every custom rule has a stable label and CloudWatch metric.
- Count-mode observation is time-bounded and has an owner/expiry.
- Log filters retain managed security findings and bounded samples needed for tuning, while high-volume labeled rate blocks may be dropped after metrics/alarms are proven.
- Redact authorization, cookie, scheduler token, CSRF/idempotency headers, auth bodies, MFA values, query strings that can carry secrets, and presigned URLs.
- A log-filter test proves ordering so a broad keep rule cannot override the intended drop/redaction behavior.

## Required signals

| Signal | Source | Urgency |
|---|---|---|
| General/auth/paid WAF count and block | WAF rule metrics | Alarm on reviewed threshold |
| Local source/user/session throttle | Sampled/capped API log and critical rollup when protection fails | Dashboard investigation; urgent failures alarm through the rollup |
| Auth global/account/source rejection | API durable admission | Urgent auth alarm |
| Argon2 concurrency saturation | API semaphore | Urgent if sustained |
| Protection store unavailable | API/PostgreSQL | Urgent; paid/auth fail closed |
| Local bucket eviction/pinned saturation | API local store | Urgent under churn |
| Heavy-read concurrency | API semaphore | Dashboard/alarm |
| Paid quota/concurrency/backlog/disable | Existing admission metrics | Urgent |
| HMAC alias consolidation failure/age | API admission | Urgent before key retirement |
| Direct-origin/topology drift | CI/plan/config evaluation | Deployment blocker |
| S3 PUT/object-version/byte growth and replay | S3/CloudWatch/application | Urgent before K-1 enablement |
| ALB/ECS/RDS/queue/provider saturation | Existing infrastructure metrics | Urgent |
| Budget/anomaly | AWS cost tools | Advisory only; never admission authority |

Urgent alarms use evaluation windows totaling no more than five minutes and route to the tested operator notification destination.

## Runbook fields

Every alert documents:

- Owner and escalation contact.
- Dashboard/metric and fixed rule/policy key.
- How to distinguish false positive, single-source bot, distributed bot, stolen session, store failure, S3 replay, and origin drift.
- Safe containment: lower limit, disable new paid/upload work, move candidate WAF rule to Block, or restore from Block to Count.
- Prohibited containment: make origin public, detach WAF, log raw subjects, enable request autoscaling, or remove the hard global paid ceiling.
- Evidence location and post-incident cost reconciliation.

## Cost model inputs

The executable production cost model must count:

- Every WAF ACL, custom rule, managed rule group, and inspected-request assumption.
- Every added standard/high-resolution alarm and custom metric assumption.
- WAF/CloudWatch log retained GB after filters and retention.
- S3 request/object-version growth assumptions for capability testing.
- Any service-managed security-group change with a charge (expected zero, still inventoried).
- No Bot Control/CAPTCHA/Challenge/Redis unless a later approved ADR adds them.

Directional planning estimate: two custom WAF global rules plus two standard alarms add approximately $2.20/month, taking the prior approximately $104 upper estimate to about $106.20 before variable attack traffic/logs. Release evidence must refresh public prices and derive counts from the real plan.

## Residual cost statement

Rate limiting prevents attack traffic from automatically scaling ECS or creating unbounded provider, queue, storage-version, and database-heavy work. It does not make CloudFront/WAF inspection free. Budget/anomaly alerts may be delayed and do not contain traffic. This residual is accepted only within the ADR's operator and cost-model gate.

## Tests

- A large bounded synthetic burst produces no routine custom metrics, at most five environment-level actionable metric series, and capped log samples.
- Redaction fixtures include all prohibited headers/body values and presigned URLs.
- Every alarm class has an assertion for metric, threshold, evaluation period, destination, and runbook reference.
- Cost tests fail when WAF rule/alarm/log resources are added without model entries.
- The production dashboard exposes edge -> app admission -> downstream cost correlation without subject-cardinality dimensions.
