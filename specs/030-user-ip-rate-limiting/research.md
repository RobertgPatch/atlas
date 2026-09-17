# Research: User and IP Rate-Limit Hardening

**Feature**: 030-user-ip-rate-limiting  
**Date**: 2026-08-29  
**Scope**: Application admission, authentication abuse, trusted proxy identity, AWS edge/origin isolation, bounded observability, presigned capabilities, and AWS cost exposure.

## Existing Baseline

Feature 027 already provides more than a simple middleware limiter:

- A canonical route-protection registry and startup coverage gate.
- A bounded process-local Fastify rate store with HMAC subject keys and IPv6 prefix normalization.
- PostgreSQL-backed atomic rate windows, quotas, concurrency leases, idempotency, retries, cleanup, and expiring protection overrides.
- Paid-work admission before provider, queue, S3, export, and other cost drivers.
- Process-local authentication account windows and password-hash concurrency.
- WAF rate rules for general API, authentication, paid-source, and paid-global traffic.

Feature 029 provides CloudFront with WAF, a CloudFront VPC origin, an internal ALB, private ECS tasks, RDS reachable only from the API security group, fixed one-task application capacity, and a production cost envelope. The correct design extends these controls rather than installing Redis, exposing a new API gateway, or enabling paid bot products.

## Decision 1: Enforce source and user as separate decisions

**Decision**: Every non-liveness external request consumes a source-prefix bucket before authentication. A valid authenticated request then independently consumes its user bucket and, when required, its session bucket. A combined user+IP key is prohibited.

**Why**: The current local plugin chooses either a raw session-cookie fingerprint or source IP. An attacker can rotate arbitrary cookie values before authentication to evade a source bucket, and a user can rotate sessions to evade what policy metadata describes as a user limit. A combined key is also evadable by changing either dimension and unfairly resets user history when networks change.

**Implementation consequence**: Derive user and session only after trusted session validation, using stable server-side IDs rather than the raw cookie. Several users behind a NAT share the independent source allowance but keep distinct user allowances. One user across many addresses keeps one user allowance.

**Alternative rejected**: Address-only enforcement cannot bound a compromised identity and harms shared NATs. User-only enforcement cannot protect public/auth routes. Session-only enforcement is reset by session creation. Combined keys do not satisfy either independent ceiling.

## Decision 2: Aggregate local rates by risk class

**Decision**: Use shared class keys such as `auth.source`, `general_api.source`, `read.user`, `read.session`, `heavy_read.user`, and `paid_work.user`. Retain route-specific keys only for a documented route-specific risk.

**Why**: The current key includes the route policy key. A bot can route-hop across many endpoints and receive a new allowance on each. A class aggregate prevents route multiplication while keeping auth and paid traffic separately tunable.

**State rule**: Keep one global memory ceiling, but reserve finite global/class and authenticated-subject partitions so source churn is evicted first and cannot reopen global/user capacity.

## Decision 3: Use three atomic durable dimensions for authentication

**Decision**: Before password hashing, MFA verification, enrollment completion, session creation, or amplified audit work, atomically reserve:

1. A non-sensitive global environment bucket.
2. A normalized source-prefix fingerprint bucket.
3. A normalized account-identifier fingerprint bucket.

The global reservation is evaluated first inside the transaction. PostgreSQL `abuse_rate_windows` remains authoritative. A short local `global exhausted until` signal may reject repeated calls without another database transaction, but it can only deny and never grant.

**Why**: Process-local account state resets on restart and multiplies during rolling deployments. Source-only control is bypassed by botnets, account-only control by rotating identifiers, and neither closes the rotating-source plus rotating-account case. Atomic global-first reservation caps how many attacker-chosen source/account rows can be created in one window.

**Cardinality bound**: The number of successful per-source/account insertions is bounded by the global auth allowance. Expired rows use the existing cleanup process. Early WAF/local source shedding prevents a single source from generating repeated database work.

**Alternative rejected**: Persisting an IP row for every general request would turn an attack into database writes. Durable source state is limited to the tightly capped auth class; ordinary routes use bounded local source shedding and exact downstream workload admission.

## Decision 4: Keep hash concurrency local and non-queued at one task

**Decision**: Retain a per-process password-hash semaphore because production is fixed at one API task. Acquire it immediately before Argon2 and release it immediately after hashing; reject rather than queue when full.

**Why**: This directly protects the CPU/memory resource that performs the hash without creating a durable operation record per bot attempt. The durable global/account/source rate reservation closes restart and distributed-request gaps. Production-shaped measurement must confirm whether the current concurrency of four is safe at 0.25 vCPU/0.5 GiB; reducing it is preferred if memory/latency evidence requires it. If production ever permits more than one steady-state API task, the concurrency design must be revisited before capacity changes.

**Current defect to correct**: The semaphore is currently held across database lockout checks and later auth/audit work, which unnecessarily reduces availability.

## Decision 5: Treat account limiting as an explicit availability tradeoff

**Decision**: Reconcile the existing three-failure/30-minute lockout with the durable account window. Keep only bounded temporary restriction, add an audited operator recovery path, alert on account/global exhaustion, and tune from count-only/bounded evidence. Preserve identical public responses for known and unknown identifiers.

**Why**: Any limit applied before identity proof can be filled by an attacker who knows the account identifier. Rate limiting reduces guessing and cost but cannot simultaneously guarantee that a targeted account is never temporarily denied. Permanent or attacker-escalating lockout makes that tradeoff worse.

**Look out for**: Do not advertise “always available” authentication under a targeted denial-of-service event. The safe objective is bounded disruption, observable recovery, and no expensive work amplification.

## Decision 6: Remove raw identifiers from protection state

**Decision**: Replace raw lowercase email in authentication-attempt/failed-login evidence with a keyed, versioned account fingerprint. When the user is known, audit by stable user ID; otherwise use the fingerprint. Never record raw IP, cookie, password, TOTP, MFA secret/QR, presigned URL, or attacker request body.

**Migration**: Use expand/contract compatibility: add fingerprint/version fields and indexes, deploy dual-compatible reads, switch writes, redact or expire legacy raw protection fields, verify, then remove legacy dependence after the rollback window. Business records are not migrated.

**Why**: These values are Restricted. Protection decisions need equality within a bounded window, not recovery of the source value.

## Decision 7: Preserve HMAC continuity across rotations

**Decision**: Rate, quota, lockout, and cost lookups consider the active fingerprint version plus retained previous versions. A transaction consolidates current-window usage to the active version, and a prior key cannot be retired until the longest rate/quota/cost window it protected has expired. Use a stable versioned constant for the non-sensitive global scope.

**Why**: The current previous-key support covers idempotency but not every admission counter. Rotating the HMAC key can otherwise reset user rates and daily/monthly cost ceilings.

## Decision 8: Resolve tenant and cost subjects from authority

**Decision**: Production uses one deployment-owned tenant identity. User/session IDs come from validated session state. Entity/account/provider scope is added only after the resource is resolved and authorized. Cost admission accepts explicit structured subjects rather than cloning one principal value into every scope.

**Why**: Request parameters such as `tenantId`, `entityId`, or `partnershipId` are not an authorization source and can let clients manufacture new buckets. Distinct fingerprints of the same underlying value are not distinct identities.

## Decision 9: Bound heavy reads without fake durable work

**Decision**: Add bounded, no-queue process-local route-class semaphores for database-heavy reads/downloads, while retaining existing durable per-user/global rates. Paid/queued/idempotent workloads keep durable capacity leases.

**Why**: A current policy may declare concurrency, but `AdmissionService` creates a durable lease only with a workload operation. Ordinary heavy reads therefore do not receive the declared concurrency protection. Creating idempotency/workload rows for every read would add unnecessary state and change response behavior.

## Decision 10: WAF is an absorber, not the cost authority

**Decision**: Maintain separate WAF rules for general API source, auth source, heavy/paid source, general API global emergency, auth global emergency, and paid global emergency. Include `/health` in a cheap/cache-aware edge rule while keeping internal health probes separate. Introduce changed thresholds in Count mode, review evidence, then promote to Block. Use WAF's CloudFront viewer source IP aggregation, not a forwarded header.

**Why**: AWS documents WAF rate-based rules as approximate and potentially delayed. Current WAF supports 60, 120, 300, and 600 second windows, with a minimum rate limit of 10. WAF cannot identify the authenticated application user and still incurs request-processing charges. Exact application ceilings are therefore required after the edge.

**Sources**:

- [AWS WAF rate-based rule high-level settings](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-high-level-settings.html)
- [AWS WAF rate aggregation options](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-aggregation-options.html)
- [AWS WAF forwarded-IP caveats](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-forwarded-ip-address.html)
- [AWS WAF rate-rule caveats](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-caveats.html)

**Alternative rejected**: WAF-only enforcement is approximate, has no validated user identity, does not cover internal callers, and cannot authoritatively cap paid work.

## Decision 11: Use a generated viewer address only on the trusted path

**Decision**: At WAF, retain `aggregate_key_type = IP`. At the API, replace the broad managed origin request policy with a Terraform-owned policy that forwards only required application headers/cookies/query strings and adds CloudFront's generated `CloudFront-Viewer-Address`. CloudFront overwrites a same-named viewer input; the API accepts the generated IP/port value only when the connection arrived through the trusted ALB/CloudFront topology, strips the port, validates strictly, normalizes IPv6, and fingerprints before storage.

`X-Forwarded-For` remains covered by right-to-left trusted-chain tests for framework/client-IP behavior, but an arbitrary leftmost forwarded value is never the rate-limit identity. `TRUSTED_PROXY_CIDRS` narrows from the entire VPC to the exact private proxy subnet/path.

**Why**: CloudFront and ALB append forwarding hops. Blindly trusting the leftmost or any client-supplied forwarding value enables arbitrary limiter keys. A CloudFront-generated header configured in the origin request policy is derived from the viewer connection and overwrites a supplied header, but it is trustworthy only when direct origin access is impossible.

**Sources**:

- [CloudFront-generated request headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html)
- [CloudFront request behavior for custom origins and `X-Forwarded-For`](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html)
- [ALB `X-Forwarded-For` processing modes and trust warning](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html)

## Decision 12: Keep the origin private and validate every bypass path

**Decision**: Retain CloudFront VPC origin, internal ALB, private ECS networking, and RDS ingress only from the API security group. Deployment policy fails for a public load balancer/task/database, broad backend ingress, API Gateway or Function URL, direct-origin DNS, a route to internal endpoints, missing WAF attachment, or request-based autoscaling.

AWS documents that VPC origins can use internal ALBs and a CloudFront service-managed security group. Evaluate the service-managed group as a staged tightening: establish and verify the managed relationship before removing the current CloudFront origin-facing prefix-list ingress. No shared origin secret header is needed for an internal VPC origin.

**Source**: [Restrict access with CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)

## Decision 13: Harden the intentional direct-to-S3 capability path

**Decision**: K-1 upload slots remain disabled by default. Before enabling them, issue a presigned PUT only after exact user/source/global slot and byte admission; shorten signature validity; sign `If-None-Match: *`; require conditional writes for the quarantine prefix; enforce a bounded `s3:signatureAge`; and alarm on PUT/object-version growth. Reuse of the same URL/key must fail with a precondition response and create no new S3 object version.

**Why**: A presigned URL is a bearer capability and the client uses it directly against S3, outside CloudFront/WAF after issuance. With bucket versioning, repeated successful PUTs to the same key could otherwise create additional paid versions.

**Sources**:

- [S3 presigned URL capabilities and `s3:signatureAge`](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)

## Decision 14: Remove distribution-wide SPA error rewriting

**Decision**: Preserve API error contracts by removing CloudFront distribution-wide 403/404 substitution to `/index.html` with status 200. Implement SPA fallback only for eligible static navigation on the default S3 behavior, and add tests that `/v1/*` preserves 401, 403, 404, and 429 responses.

**Why**: CloudFront custom error responses operate at distribution level and replace configured 4xx/5xx status responses. In a multi-origin distribution, a 403/404 from the API can therefore be replaced with the SPA shell, hiding auth/rate errors and potentially causing cache/confusion defects.

**Sources**:

- [CloudFront CustomErrorResponse API](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CustomErrorResponse.html)
- [How CloudFront processes custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html)

## Decision 15: Keep telemetry finite and cheap

**Decision**: Aggregate counters by a fixed vocabulary of route class, scope, reason, and outcome in process. Publish only nonzero environment-level alarm signals to CloudWatch custom metrics; keep routine decision detail in sampled/capped structured logs. Flush on a bounded interval, cap/snapshot local-store saturation, and filter WAF logs by fixed action/labels so an attack cannot require one retained log per request. No attacker-controlled metric dimensions.

**Why**: Perfect per-request security logging can itself become a CloudWatch/WAF ingestion bill and may store Restricted identifiers. Zero-valued placeholder metrics and fixed route/workload dimensions also create billable custom series even during routine health checks. The operator needs actionable alarm totals and bounded samples, not unlimited raw evidence or metric cardinality.

**Alarms**: Edge general/auth/paid count/block, auth global/account/source saturation, hash concurrency, local store eviction, protection-store failure, paid quota/concurrency/backlog, S3 PUT/object growth, provider/queue/database saturation, and cost anomaly. AWS Budget remains a delayed alert, not a real-time control.

**Sources**:

- [CloudWatch metric dimensions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html)
- [AWS WAF logging configuration and filtering](https://docs.aws.amazon.com/waf/latest/developerguide/logging-management-configure.html)
- [AWS WAF logging pricing](https://docs.aws.amazon.com/waf/latest/developerguide/logging-pricing.html)
- [AWS Budgets cost data update behavior](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)

## Decision 16: Do not add paid bot controls in this iteration

**Decision**: Do not enable Bot Control, CAPTCHA, Challenge, Redis/ElastiCache, another public gateway, or a CloudFront flat-rate Business plan in feature 030.

**Why**: The existing private architecture plus custom WAF rules, bounded memory, and PostgreSQL admission covers the one-user scale with less fixed cost. Bot Control and challenge features add request pricing, browser behavior, privacy, accessibility, and false-positive considerations. The flat-rate CloudFront tiers below Business do not support private VPC origins, while Business is materially above the current production cost target. They remain separate ADRs if attack evidence later justifies them.

**Sources**:

- [AWS WAF pricing](https://aws.amazon.com/waf/pricing/)
- [AWS WAF Bot Control](https://docs.aws.amazon.com/waf/latest/developerguide/waf-bot-control.html)
- [AWS WAF CAPTCHA and Challenge](https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge.html)
- [CloudFront flat-rate plan features](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)

## Candidate production tuning, not an approved constant

Count-mode evidence should begin near existing application contracts rather than an arbitrary large allowance. A reviewable starting envelope is:

| Layer | Scope | Candidate | Purpose |
|---|---|---:|---|
| WAF | auth source | 20 requests / 5 min | Shed obvious single-source bots before the origin |
| WAF | auth global | 50 requests / 5 min | Emergency distributed-bot ceiling |
| WAF | general API source | 300 requests / 5 min | Lower current broad source burst after evidence |
| WAF | general API global | 500 requests / 5 min | Bound distributed origin traffic for one-user scale |
| WAF | paid source/global | 20 source and 50 global / 5 min | Shed expensive-route traffic before origin |
| App durable | auth source | 20 requests / 5 min | Exact source limit across restart/deploy overlap |
| App durable | account | Existing 5 requests / 15 min, subject to lockout reconciliation | Bound guessing while reviewing targeted-DoS risk |
| App durable | auth global | 50 admitted attempts / 5 min plus reviewed low-and-slow daily cap | Bound rotating source/account work |
| App local | Argon2 | At most existing 4 concurrent hashes, no queue | Bound per-task CPU/memory; reduce if shape test requires |

These values are deliberately not normative. Implementation must place them in validated versioned configuration, run Count mode and bounded legitimate-flow tests, document false-positive review, and set final values no lower than five times the measured legitimate five-minute burst unless a stricter documented safety reason is accepted. Global caps can be weaponized into temporary denial of service, so the final auth value must preserve the two-step password/MFA flow plus retry headroom.

## Cost conclusion

The lowest-cost candidate adds two global WAF rules and approximately two alarms. At the public prices captured during this research, that is roughly +$2.20/month, moving feature 029's approximately $104 upper estimate to about $106.20 before any other 030 metric/log usage. This is directional, not release evidence; the machine-verifiable cost profile must be refreshed from the actual plan, dated prices, actual rule/group count, alarms, logs, and S3 controls before Apply.

The current pay-as-you-go choice bounds ALB/ECS/RDS/S3/provider amplification but cannot mathematically guarantee that arbitrary Internet traffic creates zero CloudFront/WAF request charge. A CloudFront flat-rate plan with private VPC-origin support is substantially above the approved one-user cost envelope. Retaining pay-as-you-go with hard origin/downstream limits is the recommended tradeoff for this iteration; the residual edge-request exposure must remain visible in the ADR and incident runbook.

## Threats that remain after implementation

- WAF/CloudFront still process and may charge for attack requests; controls cannot make the public edge free.
- A targeted account/global limit can temporarily deny the legitimate user before identity is proven.
- A sufficiently large distributed attack may require AWS support/Shield response or a later paid bot-control decision.
- A trusted generated viewer header is safe only while the direct-origin boundary remains intact.
- A fixed one-task process-local hash/concurrency control becomes insufficient if fleet capacity changes without redesign.
- Presigned S3 operations still incur request charges even when a conditional replay is rejected.
- Budget and anomaly alerts are too delayed to replace hard admission.

These are explicit residual risks, not reasons to remove the hard ceilings.
