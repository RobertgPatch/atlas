# Observability and WAF rollout evidence

**Feature**: 030 user/IP rate-limit hardening  
**Recorded**: 2026-08-29  
**Owner**: Production security/operator role; the named human owner must be supplied in each rollout evidence file  
**AWS mutation performed**: No

## Bounded local alarm exercises

The following exercises use finite unit/Terraform fixtures. They do not send load to production and do not assert that an SNS email has been delivered in the real AWS account.

| Exercise | Command | Result | Proven bound |
|---|---|---|---|
| Application aggregation/redaction | `npm run test:api -- --run tests/abuse-protection/abuse-observability.test.ts` | PASS | Routine health and successful cleanup create no custom metric; actionable signals use only the environment dimension and at most five metric names; samples cap; one suppression total is emitted; raw email, IP, cookie-like, UUID, and presigned values are absent. |
| Override safety | `npm run test:api -- --run tests/abuse-protection/protection-controls.contract.test.ts` | PASS | Only expiring disable/lower-limit workload rows are accepted; auth/paid globals and temporary allows are unavailable. |
| WAF/CloudWatch assertions | `terraform -chdir=infra/aws/terraform test` | PASS (23/23 on 2026-08-29) | Rule labels/metrics, drop-first filters, redaction, alarm windows `<= 300s`, SNS actions, S3 growth alarm, and dashboard signals are present. |
| Rollout/rollback evidence | `node --test scripts/security/validate-waf-rollout.test.mjs` | PASS (4/4) | Owner, expiry under 24 hours, retained-flow checks, monitoring, one-action scope, WAF attachment, private origin, and hard ceilings are mandatory. |
| Terraform-derived cost | `npm run test:production:cost` | PASS (6/6) | WAF/alarm/metric-log/SPA/S3 inventory is derived; Bot Control, CAPTCHA, Challenge, Redis, drift, and totals above $110 fail. |

## Notification timing and real-account gate

Every urgent CloudWatch alarm uses a period/evaluation product no greater than five minutes and has the confirmed SNS topic as its alarm action. The native tests verify configuration, not email delivery latency. Before the first production Apply, the operator must create a harmless metric/alarm test signal, record the CloudWatch transition and SNS receipt timestamps, confirm receipt within five minutes, and place the non-sensitive timestamps and incident/change reference here or in the production activation evidence.

Required urgent coverage:

- API/auth WAF source-rate blocks and aggregate WAF blocks.
- Hash/concurrency saturation, admission-store failure, local eviction, HMAC failure, capability replay, backlog/quota/disable critical application decisions.
- S3 `PutRequests`, object/version growth correlation, queue/provider saturation, ECS/RDS/ALB health.

## Redaction sample

The synthetic input contains values shaped like `owner@example.test`, `203.0.113.9`, `atlas_session=...`, a UUID, and `X-Amz-Signature=...`. The emitted application sample contains `[REDACTED]`; no subject value is a metric dimension. WAF logs redact authorization, cookie, scheduler token, CSRF, idempotency, and query-string fields. AWS WAF request logs do not serialize inspected request-body contents; auth rate blocks are additionally handled by the labeled high-volume drop filters after their rule metrics/alarms are proven.

## Count-to-Block / rollback evidence

Production defaults are `block`. A temporary `count` input is invalid without a named Terraform owner/expiry and the external evidence below. Validate the JSON with:

```powershell
node scripts/security/validate-waf-rollout.mjs --evidence .security/waf-rollout.json
```

The ignored operator evidence must contain one reviewed target rule, a `count_to_block` or `rollback_to_count` transition, an observation window of no more than 24 hours, confirmed WAF metrics/alarm destination/redaction, and passing below-limit checks for homepage, dashboard, liquidity, investment tracker, TIC registry, and entities. `changedInputs` must contain only `waf.<targetRule>.action`.

Rollback may return only the candidate rule from Block to Count. It may not detach the web ACL, expose or add an origin, remove the hard auth/paid global ceilings, enable request-count autoscaling, or alter another rule. The validator performs no Terraform Apply.

## Operator ownership

| Responsibility | Owner | Evidence |
|---|---|---|
| Count observation and expiry | Named production operator in the evidence JSON | owner, `generatedAt`, `expiresAt`, ticket |
| Retained-flow verification | Application owner | six finite `retainedFlows` results |
| Alarm destination / redaction review | Security operator | `observability` attestations and SNS timestamps |
| Count-to-Block approval and rollback | Production operator with code-review approval | saved plan/change record; one changed input |
| Cost reconciliation | Production owner | Cost Explorer comparison at containment, day 7, and day 30 |

No item in this document authorizes production load testing or AWS Apply. The constitutional exception `EX-030-001` permits implementation/testing/review/merge only until C1 and C2 are remediated.
