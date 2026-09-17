# Threat model: rate limiting, origin bypass, and cost abuse

## Assets

- Availability of password/MFA and retained application flows.
- Restricted credentials, session/MFA data, source/account identifiers, and presigned URLs.
- Fixed ECS/RDS capacity and exact provider/queue/storage/export budgets.
- Integrity of audit, financial, and workload records.
- Private origin topology and operator recovery capability.
- Accepted AWS monthly cost envelope.

## Trust boundaries

1. Internet viewer -> CloudFront/WAF.
2. CloudFront VPC origin -> internal ALB.
3. ALB -> ECS API.
4. API authentication -> validated user/session context.
5. Authorization -> tenant/entity/provider context.
6. API -> PostgreSQL/provider/SQS/S3/export.
7. API-issued bearer capability -> direct S3 conditional operation.
8. Metrics/logs -> CloudWatch/operator notification.

## Threats and controls

| Threat | Existing gap | Required control | Verification |
|---|---|---|---|
| Cookie rotation bypasses IP | Local limiter chooses cookie or IP | Source always, user/session separately after validation | Invalid-cookie rotation test |
| Session/address rotation | No single independent user+source chain | Independent user, session, and source decisions | 10 sessions/10 addresses test |
| Route hopping | Local key is per policy route | Shared risk-class keys | Multi-route class test |
| Credential stuffing/password spraying | Account state process-local; WAF only per IP | WAF auth source/global; atomic durable global/source/account; no-queue hash | 100 rotating pairs; zero-hash rejection |
| Targeted account denial | Three failures can cause 30-minute lockout | Bounded cooldown, uniform response, alarm, audited recovery; no permanent escalation | Known/unknown and recovery tests |
| IPv6/privacy-address rotation | Address cardinality | Strict mapping and `/64`, global ceilings | Mapped/within-/64 tests |
| Spoofed forwarded headers | Whole VPC trusted; XFF attacker input | Generated viewer address only on trusted path; narrowed proxies; strict parser | Header spoof/malformed tests |
| Direct origin | Edge can be bypassed if ALB/task becomes public | VPC origin, internal ALB, SG chain, plan-policy blockers | Terraform negative mutations |
| Alternate public service | New API Gateway/Function URL/DNS | One-public-edge inventory and plan rejection | Plan fixtures |
| SPA error masks API denial | Distribution-wide 403/404 -> 200 | Static-only fallback; API error preservation | 401/403/404/429 edge tests |
| Paid/provider/storage amplification | Edge approximate | Exact app quotas/idempotency/leases/kill switches | Zero-side-effect rejections |
| Heavy read concurrency | Policy declaration does not create lease without workload | Bounded no-queue heavy-read semaphore | Saturation test |
| S3 presigned replay | Bearer PUT bypasses gateway; versioning | Exact slot admission, short age, signed conditional PUT, one key/version | Replay/precondition test |
| High-cardinality state attack | Source/account churn | Global-first durable auth, bounded/pinned local partitions, expiry | Bucket/row bound test |
| Log/metric bill amplification | Per-rejection WAF/app records | Fixed dimensions, aggregation, sampling, WAF filters | Burst cardinality/cost test |
| HMAC rotation resets ceilings | Previous keys incomplete | Alias-aware atomic consolidation and retirement floor | Rotation across rate/day/month test |
| Request-derived tenant bucket | Parameters used as identity | Deployment/authz-derived subjects only | Parameter mutation test |
| Protection store outage | Accidental unlimited work | Auth/paid fail closed; approved cheap read degrade only | Fault injection |
| Abuse triggers fleet scaling | Potential future autoscaling | Fixed one-task invariant; no request-driven scaling | Terraform/plan test |

## Abuse cases that must be bounded

- Many IPs, one account.
- One IP, many accounts.
- Many IPs and many accounts.
- Many invalid cookies from one IP.
- One authenticated user across many sessions and networks.
- Several legitimate users behind one NAT.
- Low-and-slow auth below a five-minute WAF threshold.
- High-cardinality paths/query/body values.
- Repeated duplicate paid operations.
- Direct calls to discovered hostnames and internal routes.
- Reuse of an issued presigned URL.
- Attack during application restart, deployment overlap, HMAC rotation, and window boundary.

## Security invariants

- Rate admission never grants authentication or authorization.
- Every external non-liveness request has an independent source decision.
- Every authenticated external request has a validated user decision.
- Auth and paid global ceilings cannot be removed by runtime override.
- Attacker-controlled input cannot choose a user/session/tenant/resource/global identity.
- A rejection precedes the cost driver named by its policy.
- State/log/metric growth is bounded independently of attack volume.
- The origin remains private during rollout and rollback.

## Residual risks

- WAF/CloudFront edge request charges remain variable under pay-as-you-go.
- Any pre-auth account/global limit can temporarily block the legitimate user.
- Conditional rejected S3 operations still have request cost.
- Very large attacks may require AWS support/Shield escalation or a separately approved paid service.
- One fixed task prioritizes cost containment over unlimited availability.
- Budget/anomaly notification is delayed.

The operator must see these in the runbook and ADR; they must not be presented as eliminated.

