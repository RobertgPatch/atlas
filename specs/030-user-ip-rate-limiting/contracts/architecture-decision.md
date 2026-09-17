# ADR-030: Layered rate limiting on the existing private AWS origin

**Status**: Accepted for implementation planning; production activation remains gated by the acknowledgements and feature 029 prerequisites below  
**Date**: 2026-08-29  
**Decision owners**: Application owner and production operator

## Context

The application has one production user and a low normal request volume, but its public authentication routes, resource-heavy reads, provider integrations, queues, S3 capabilities, and database can still be targeted by automated traffic. The current application local limiter chooses a session cookie or source rather than enforcing both independent dimensions. Authentication account state is process-local, WAF has no global auth/general API emergency rule, and some protection/audit state stores raw account identifiers.

The existing AWS topology already uses CloudFront/WAF, a VPC origin, an internal ALB, private ECS, and private RDS. Feature 029 targets approximately $104/month at its upper estimate and requires production to remain continuously available with one fixed API task.

## Decision

Use three complementary layers on the existing architecture:

1. **CloudFront/WAF** for approximate, low-latency source and constant-global absorption by route class.
2. **Bounded process memory** for independent source, validated user/session, hash, and heavy-read shedding.
3. **Existing PostgreSQL admission** for atomic auth source/account/global windows and exact paid/heavy rates, quotas, idempotency, concurrency, backlog, and cost ceilings.

Keep CloudFront/WAF as the only public application entry. Preserve the private VPC origin, internal ALB, private tasks, private RDS, fixed one-task fleet, and no request-driven autoscaling. Add conditional/replay-safe controls to presigned S3 uploads because those capabilities intentionally leave the HTTP gateway after issuance.

Use a CloudFront-generated viewer-address header at the API only when it arrived through the trusted private origin path. At WAF, aggregate on the viewer connection IP, not a forwarded header. User/session/tenant identity is resolved only inside the application from authentication/configuration/authorization authority.

Keep pay-as-you-go CloudFront/WAF for this iteration. Add two custom global WAF rules and approximately two alarms, refresh the executable cost model, and require it to remain under feature 029's approved upper envelope.

## Consequences

### Positive

- Rotating cookies, sessions, addresses, account identifiers, or routes cannot bypass every dimension.
- Exact downstream spend remains bounded even when WAF is delayed or an internal caller reaches the app.
- The current private-origin bypass protection remains intact.
- No Redis/ElastiCache cluster or new operational dependency is introduced.
- Source/account state creation is bounded by the global auth reservation.
- A bot cannot turn request volume into additional ECS tasks.
- Presigned upload replay cannot create repeated S3 object versions.

### Costs and tradeoffs

- WAF rate rules are approximate and edge requests may still incur CloudFront/WAF charges.
- An account/global ceiling applied before identity proof can be weaponized into temporary denial of service. The system provides bounded cooldown, alarms, and operator recovery, not a false guarantee of uninterrupted sign-in during a targeted attack.
- PostgreSQL receives one bounded auth-admission transaction for attempts that pass edge/local shedding.
- Two additional custom WAF rules and alarms are estimated at approximately +$2.20/month before variable request/log usage; release evidence must derive the actual amount from the plan.
- HMAC rotation and raw-identifier removal require a compatible protection-state migration.

## Alternatives considered

### WAF only — rejected

WAF cannot trust an application user identity, is approximate, and cannot enforce exact provider/queue/storage/cost limits or protect internal callers.

### Process-local only — rejected

State resets on restart and is multiplied during deployment overlap. It cannot be the authority for exact global or paid-work limits.

### Redis/ElastiCache — rejected for current scale

It adds fixed cost, networking, backups, patching, and another availability dependency. Existing PostgreSQL plus bounded memory satisfies the one-user design.

### Combined user + IP key — rejected

Changing either half creates a fresh bucket, and shared NAT behavior becomes unfair. Independent decisions are required.

### Public API Gateway, Lambda URL, or second WAF — rejected

They create another public/billable entry and duplicate controls while weakening the simple one-edge invariant.

### Bot Control, CAPTCHA, or Challenge — deferred

They add fixed/variable cost, privacy, accessibility, browser integration, and false-positive risk. They require separate evidence and ADR.

### CloudFront flat-rate Business plan — not selected

Lower tiers do not support the required private VPC origin; the tier that does is materially above the one-user cost envelope. It could reduce overage uncertainty but is not cost-justified now.

### Replace private origin to use a cheaper flat tier — rejected

That would weaken the strongest direct-origin bypass control to address a billing concern.

## Production activation gates

- The actual Terraform-derived cost model stays within the approved envelope.
- The operator acknowledges residual pay-as-you-go edge request exposure.
- Count-mode evidence and retained-flow tests approve every new blocking threshold.
- Raw authentication identifiers are removed from final protection writes/logs.
- Origin, generated-viewer-address, S3 replay, redaction, alarm, and zero-downstream-work tests pass.
- Feature 029's unique human identities, production MFA, Restricted-data inventory, WISP/incident readiness, and recovery evidence are complete.

## Rollback

- Move a false-positive candidate WAF rule from Block back to Count; never detach the ACL or expose the origin.
- Roll application protection code back only to the fingerprint-compatible release after the protection-state cutover.
- Disable new presigned slot issuance without making existing buckets public.
- Restore prior versioned thresholds while retaining the hard paid/global ceilings and fixed capacity.

## Future review triggers

- More than one steady-state API task.
- An unrelated tenant or more production users.
- Sustained edge attack charges materially exceed the accepted envelope.
- Enabling K-1 ingestion or another presigned capability.
- Enabling a paid WAF managed feature.
- Changing CloudFront VPC-origin or service-managed security-group behavior.

