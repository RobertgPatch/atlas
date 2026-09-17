# Implementation Plan: User and IP Rate-Limit Hardening

**Branch**: `030-user-ip-rate-limiting` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-user-ip-rate-limiting/spec.md`

**2026-09-16 release-policy amendment**: The constitution-check findings below record the original design decision. [EX-030-002](./evidence/EX-030-002.md) later permits a time-limited AWS production release when the exact current `main` commit passes both named GitHub security jobs. The listed identity, MFA, inventory, incident, legal, and restore items remain open risks and remediation work, but are not separate pre-deployment sign-off gates during that exception. AWS release execution safeguards remain mandatory.

**Subsequent owner decision**: [EX-030-003](./evidence/EX-030-003.md) supersedes the time limit and extra manual approval steps. Current `main` plus the two successful named GitHub jobs is the sole release-eligibility rule. Technical execution still must target the actual live AWS stack and produce a healthy service.

## Summary

Harden the existing CloudFront/WAF, private ALB/ECS, and Fastify/PostgreSQL protection stack so every external request is independently bounded by a verified source identity and, after authentication, by the trusted user and session identities. Authentication receives atomic source, account, and global admission before password hashing or MFA work; resource-heavy and paid routes retain exact PostgreSQL-backed user, tenant, workload, concurrency, idempotency, and cost ceilings.

The design reuses the managed architecture and the abuse-protection store delivered by features 027 and 029. It adds no Redis cluster, bot-control subscription, CAPTCHA, public gateway, or request-driven scaling. Edge rules absorb obvious traffic and roll out in count mode before block mode, while application admission remains the authoritative cost boundary. Terraform and policy tests prove that CloudFront with WAF is the only Internet entry, presigned S3 capabilities cannot be replayed into unbounded storage, and API errors cannot be rewritten into the SPA shell.

## Technical Context

**Language/Version**: Node.js 22; API TypeScript 5.7/ES2022/NodeNext; PowerShell 7-compatible policy tooling; Terraform 1.11.4 in CI (`>=1.11` constraint)

**Primary Dependencies**: Fastify 5.12, `@fastify/rate-limit` 11.2, PostgreSQL client 8.13, Argon2 0.45, Zod 3.24, AWS provider `>=5.82,<6`, AWSCC `~>1.92`, CloudFront, AWS WAF v2, ALB, ECS/Fargate, RDS PostgreSQL, S3, and CloudWatch

**Storage**: Existing bounded process-local maps for early shedding and semaphores; existing PostgreSQL `abuse_rate_windows`, workload quota, lease, idempotency, override, audit, and authentication-attempt state; versioned S3 K-1 quarantine paths; no Redis/ElastiCache or new stateful service

**Testing**: Vitest 4.1 unit/contract/integration/benchmark tests, Node and PowerShell security-policy tests, Terraform native tests, Terraform plan validation, bounded synthetic abuse fixtures, and read-only production smoke contracts

**Target Platform**: Local Windows/PowerShell and Docker development; one fixed Linux `amd64` ECS/Fargate API task behind an internal ALB and CloudFront VPC origin with WAF in AWS production (`us-west-2`, WAF/CloudFront global)

**Project Type**: npm-workspaces web application with a Fastify API, React/Vite client, PostgreSQL, Terraform modules, CI security gates, and operator deployment tooling

**Performance Goals**: Below-limit retained flows remain usable for one interactive user; protection overhead stays within the larger of 5% or 1 ms at p95 in a controlled repeatable benchmark; excess auth performs zero additional Argon2, MFA, session, provider, queue, storage, or export work; urgent abuse alarms evaluate within five minutes

**Constraints**: Independent source and user decisions; verified proxy-derived source only; no raw restricted identifiers in limiter/audit telemetry; bounded cardinality and expiry; exact paid-work fail-closed admission; fixed one-task production capacity; WAF rate rules are approximate; no production load testing; count-before-block rollout; no new paid bot capability; real AWS mutation remains operator-authorized through feature 029's production release workflow

**Scale/Scope**: One production human user and one family-office tenant; approximately 125 API routes in the current registry; at most 10,000 normal application requests/month; bounded tests cover at least 100 rotating sources/accounts and 10 sessions/addresses for one user; attack traffic is untrusted and must not determine memory, database, log, metric, storage-version, or fleet growth

**Data Classification**: Raw IP addresses, emails/account identifiers, cookies, session identifiers, auth outcomes, MFA values, HMAC material, presigned URLs, and detailed security events are Restricted; keyed non-reversible fingerprints remain Restricted security state; finite route-class/scope/reason counts are Internal

**Identity/Tenancy**: Tony Patch is the current application user; Robert Patch is the separate operator; schedulers/workloads use dedicated service identities. Production is one tenant. User/session identities come only from validated sessions, tenant identity is deployment-owned rather than request input, and entity/provider scopes are set only after authorization

**Recovery Objectives**: Expiring limiter state is disposable after its window; authoritative paid-work state remains compatible with feature 029's 15-minute RPO, eight-hour RTO, 35-day point-in-time recovery, isolated recovery copies, and quarterly restore evidence. Protection-state schema changes use expand/contract compatibility and do not rewrite business data

**Compliance/Providers**: No new processor or provider. Existing AWS/CloudWatch/WAF/S3 handling remains in scope. Paid bot management, challenge, or CAPTCHA requires a separate privacy, accessibility, false-positive, and recurring-cost review. WISP, incident, cost-abuse, and breach-assessment procedures must receive the new signals/runbook before activation

## Constitution Check

*GATE: Evaluated before Phase 0 research and re-checked after Phase 1 design.*

- **Security and privacy**: **CONDITIONAL PASS**. The design minimizes stored subjects to keyed fingerprints, rejects malformed/untrusted source chains, bounds attacker-controlled state and presigned capabilities, and fails closed before expensive work. Existing raw email use in authentication-attempt state and failed-login audit must be removed through the planned compatible migration before 030 is complete.
- **Identity and least privilege**: **FAIL FOR REAL APPLY**. Rate decisions use validated users/sessions and deployment-owned tenant identity, never request-supplied tenancy. However, feature 029 records shared human credentials and production MFA as unresolved non-negotiable activation blockers. Repository implementation and bounded testing may continue; real production activation cannot.
- **Financial integrity and audit**: **PASS FOR FEATURE SCOPE**. No financial formula changes. Paid-work admission, idempotency, quotas, kill switches, conditional upload issuance, and append-only redacted evidence remain authoritative, and rejection tests prove zero downstream cost work.
- **Architecture and scale**: **PASS**. The plan preserves the one-user managed architecture, adds no stateful service or paid bot feature, fixes the fleet at one task, and records the material edge/admission decision in [architecture-decision.md](./contracts/architecture-decision.md). The cost model must be refreshed before Apply.
- **Verification and recovery**: **CONDITIONAL PASS**. Contract, integration, migration, benchmark, Terraform, plan-policy, redaction, upload-replay, and alarm tests are specified. Expand/contract rollback preserves authentication protection during deployment. Feature 029's real restore evidence remains an activation prerequisite.
- **Legal and incident readiness**: **FAIL FOR REAL APPLY**. No new processor is introduced, but the required applicability register, WISP, incident procedure, breach decision procedure, service-provider inventory, and abuse-response ownership remain operator prerequisites.

Post-design re-check: the planned contracts make the trusted source chain, identity sources, decision order, data lifecycle, failure modes, rollout, rollback, cost bounds, and negative tests explicit. [EX-030-001](./evidence/EX-030-001.md) permits implementation, bounded local/CI testing, review, and merge while C1 and C2 are remediated in subsequent changes. It does not authorize an AWS production plan/apply, production traffic, or continued production use of Restricted data. The existing 029 identity, MFA, Restricted-data inventory, legal/incident-readiness, and recovery-evidence failures remain production blockers.

## Documented Exceptions

- **EX-030-001**: Temporarily defers the implementation-stop effect of C1 and the missing explicit authorization matrix in C2 for repository implementation, bounded local/CI tests, review, and merge only. Robert Patch owns the remediation. Compensating controls and prohibited actions are defined in [EX-030-001.md](./evidence/EX-030-001.md); the exact follow-up work is defined in [c1-c2-remediation.md](./evidence/c1-c2-remediation.md). Approved 2026-08-29 and expires 2026-09-28.

## Design Decisions

### Independent admission dimensions

- Replace the current mutually exclusive raw-session-cookie-or-source key with an unconditional source-prefix decision before authentication and separate user/session decisions only after a valid session resolves.
- Use shared route-class keys (`auth`, `general_api`, `heavy_read`, `paid_work`, `download`) so route hopping cannot multiply allowances; preserve a route-specific limit only when the route contract documents why.
- Partition the bounded local store so finite global/class and authenticated-subject buckets cannot be evicted by source churn. Local state remains an optimization; durable ceilings remain authoritative where exactness matters.
- Add no combined user-and-IP identity. Both independent decisions must allow the request.

### Authentication work admission

- For password login, MFA verification, and enrollment completion, atomically reserve durable global, normalized source-prefix, and account-fingerprint windows before Argon2, TOTP/QR work, audit amplification, or session creation. Global-first policy ordering bounds attacker-created source/account rows per window.
- Cache a short-lived local global-exhaustion signal only to shed repeated traffic after PostgreSQL reports the ceiling; the database remains authoritative and the cache cannot grant work.
- Acquire the non-queued, process-local password-hash semaphore immediately before Argon2 and release it immediately after hashing. Its scope is one fixed API task; a future capacity increase requires a new distributed-concurrency decision.
- Reconcile the existing three-failure lockout with the account window, keep recovery bounded and observable, and document that any pre-verification account limit trades credential-stuffing resistance against targeted temporary denial of service. Do not add permanent or escalating attacker-controlled lockout.
- Store authentication protection subjects and failed-attempt evidence as key-versioned fingerprints, not raw emails. Preserve indistinguishable public behavior for known and unknown identifiers.

### Exact cost, heavy-work, and capability control

- Retain PostgreSQL-backed user/session/tenant/global rates, quotas, idempotency, leases, retry budgets, and kill switches for heavy or cost-producing work.
- Replace request-derived tenant/account/entity limiter inputs with explicit trusted subjects: validated user/session, deployment-owned tenant, and entity/provider identities only after authorization.
- Add bounded no-queue process-local semaphores for database-heavy reads/downloads whose current policy declares concurrency without creating a durable workload operation. Paid workloads retain durable leases.
- Make HMAC rotation continuous: active and retained key versions participate in lookup/reservation until the longest applicable window expires, so rotating the key cannot reset a rate, daily quota, or monthly cost counter.
- Treat a presigned S3 URL as a Restricted bearer capability. Rate/quota-limit its issuance, shorten validity, sign and require `If-None-Match: *`, enforce `s3:signatureAge` and conditional-write policy, and prove replay creates no additional object version.

### Edge, source trust, and origin isolation

- Keep WAF at CloudFront as the coarse absorber. Separate general API source, auth source, heavy/paid source, general API global emergency, auth global emergency, and paid global emergency rules. Include cheap `/health` in the applicable edge envelope without sharing its internal probe bucket.
- Use viewer connection IP for WAF. At the API, use a Terraform-owned origin request policy that overwrites a viewer-supplied `CloudFront-Viewer-Address` with CloudFront's generated viewer connection address, then trust it only on the proven ALB/CloudFront path.
- Introduce or materially tighten WAF rules in `COUNT`, review bounded synthetic/normal evidence, then promote to `BLOCK`. Candidate thresholds belong in versioned Terraform configuration and are not accepted solely from this plan.
- Narrow `TRUSTED_PROXY_CIDRS` from the whole VPC to the exact proxy subnets/path and validate generated-header syntax/port stripping, right-to-left append semantics, malformed/duplicate headers, IPv4-mapped IPv6, and IPv6 `/64` normalization.
- Preserve the private CloudFront VPC origin, internal ALB, private ECS tasks, and RDS ingress from the immediate upstream security group. Evaluate the CloudFront VPC-origin service-managed security group as a staged tightening; never remove the current prefix-list ingress before the managed relationship is verified.
- Remove distribution-wide SPA error substitution that can turn API 403/404 responses into `/index.html` with status 200. Use an SPA-only routing mechanism on the static default behavior and prove `/v1/*` preserves 401/403/404/429 status, body, headers, and no-store behavior.

### Bounded observability and cost

- Aggregate a finite `route_class + scope + reason + outcome` vocabulary in process, but publish only nonzero environment-level alarm signals as CloudWatch custom metrics. Keep detailed decisions in sampled/capped logs, cap WAF log delivery, and never dimension metrics by IP, email, user, request path, cookie, or arbitrary attacker input.
- Add API/auth global exhaustion, hash saturation, durable-store unavailable, source-store eviction, HMAC migration, edge count/block, S3 PUT/object-version growth, direct-origin drift, and downstream cost alarms to the existing dashboard/runbook. AWS Budget remains delayed notification, not admission control.
- Refresh feature 029's production cost model with every extra WAF rule, alarm, metric/log volume, and optional security-group change. No Bot Control, CAPTCHA, Challenge, Redis, ElastiCache, or request-count autoscaling is in scope.
- Record the residual cost fact: edge filtering bounds ALB/ECS/RDS/provider/storage amplification, but pay-as-you-go CloudFront/WAF still charge for inspected attack requests. The no-overage CloudFront plan that supports private VPC origins is materially more expensive and is not selected by this plan.

## Project Structure

### Documentation (this feature)

```text
specs/030-user-ip-rate-limiting/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/requirements.md
`-- contracts/
    |-- architecture-decision.md
    |-- observability-contract.md
    |-- origin-boundary.md
    |-- rate-limit-response.openapi.yaml
    |-- route-rate-policy.md
    `-- threat-model.md
```

### Source Code (repository root)

```text
apps/api/
|-- src/
|   |-- app.ts
|   |-- config.ts
|   |-- infra/db/migrations/
|   `-- modules/
|       |-- abuse-protection/
|       |   |-- admission.repository.ts
|       |   |-- admission.service.ts
|       |   |-- abuseObservability.ts
|       |   |-- localRateLimiter.plugin.ts
|       |   |-- policy.defaults.ts
|       |   |-- protection.types.ts
|       |   |-- requestBoundaries.plugin.ts
|       |   |-- routePolicy.registry.ts
|       |   `-- subjectFingerprint.ts
|       `-- auth/
|           |-- authAdmission.service.ts
|           |-- lockout.service.ts
|           `-- session.middleware.ts
`-- tests/
    |-- abuse-protection/
    |-- auth.security.test.ts
    `-- proxy-trust.security.test.ts

infra/aws/terraform/
|-- main.tf
|-- variables.tf
|-- production-cost-profile.json
|-- modules/
|   |-- api/
|   |-- edge/
|   |-- k1_ingestion/
|   |-- network/
|   |-- observability/
|   `-- security/
`-- tests/
    |-- abuse_protection.tftest.hcl
    |-- observability_cost_backstops.tftest.hcl
    |-- production_cost_profile.tftest.hcl
    `-- runtime_capacity_hardening.tftest.hcl

scripts/security/
|-- generate-route-protection-inventory.mjs
|-- run-bounded-abuse-tests.mjs
|-- validate-environment-topology.mjs
|-- validate-production-cost.mjs
|-- validate-production-plan.ps1
`-- validate-terraform-guardrails.ps1

.github/workflows/security-ci.yml
docs/deployment/
```

**Structure Decision**: Extend the current Fastify abuse-protection/auth modules and existing Terraform security, edge, network, K-1, and observability modules. Reuse PostgreSQL and bounded process memory; do not introduce another deployable service or datastore. Security-policy fixtures remain under the existing application and Terraform test trees.

## Implementation Sequence

1. Add failing contracts for canonical route classes, independent source/user/session dimensions, trusted subject origins, standard 429 behavior, bounded telemetry vocabulary, one-edge origin topology, and presigned-capability constraints.
2. Refactor the local limiter into class-aggregated independent source and authenticated-principal decisions. Partition/pin bounded state, reject arbitrary cookie rotation, and add no-queue heavy-read semaphores.
3. Move auth account/global/source admission to the atomic PostgreSQL rate-window path, place hash concurrency immediately around Argon2, add the local exhausted-global circuit, reconcile temporary lockout/recovery, and prove zero expensive work after rejection.
4. Introduce the compatible fingerprint migration for authentication-attempt state and audit evidence; add key-version-aware subject continuity so HMAC rotation cannot reset active rate/quota/cost windows.
5. Replace request-derived tenant and overloaded cost-work subjects with explicit validated identities; verify current paid/heavy paths still reject before provider, queue, S3, export, and aggregation work. Harden presigned upload issuance, age, conditional writes, replay, and alarms.
6. Tighten Terraform WAF class/global rules and trusted proxy inputs, preserve the private origin chain, add negative public-entry/drift assertions, and fix distribution-wide SPA error substitution for API paths.
7. Add bounded aggregated metrics, filtered/sampled logs, alarms, dashboard panels, count-to-block evidence, rollback instructions, and cost-model entries. Keep paid bot capabilities disabled.
8. Run the bounded application, migration, benchmark, topology, Terraform, plan-policy, redaction, S3 replay, cost, and retained-flow suites. Rebase onto `origin/main` after feature 029 merges and rerun all gates. A real AWS plan/apply remains separately authorized.

## Verification Strategy

- **Application contracts**: every external route has exactly one class; invalid cookie rotation cannot escape the source bucket; one user across 10 sessions/addresses hits the user ceiling; several users behind one NAT retain user fairness while sharing an IP ceiling.
- **Authentication**: login, MFA verification, and enrollment share the appropriate source/global class; 100 rotating sources/accounts cannot exceed the global work ceiling; durable limits survive restart/two simulated tasks; all rejected paths show zero new Argon2, TOTP/QR, session, provider, or high-volume audit work.
- **Source trust and privacy**: untrusted/malformed/duplicate forwarding headers fail closed; the generated viewer address is accepted only on the trusted path and normalizes IPv4, mapped IPv4, and IPv6 `/64`; no raw address, email, cookie, password, session token, MFA value, presigned URL, or provider secret reaches state, shared logs, metrics, or responses.
- **Cost and workload safety**: user/session/tenant/global, idempotency, retry, concurrency, backlog, daily/monthly, and kill-switch tests remain green; HMAC rotation preserves active windows; rejected heavy/paid work creates no downstream side effect; upload replay returns a precondition failure and creates no new S3 version.
- **Infrastructure**: Terraform fmt/init/validate/test plus plan policy fail for public ALB/ECS/RDS, broad ingress, alternate gateway/function URL, direct-origin DNS, missing WAF, internal-route forwarding, request-driven scaling, API response rewriting, or weak presigned-upload policy. Bounded edge tests verify Count then Block and rollback.
- **Operations and performance**: metric/log cardinality stays finite under burst fixtures; every alarm class is testable and owned; the repeatable controlled benchmark uses the larger-of-5%-or-1-ms p95 criterion rather than an unstable dual threshold; the refreshed all-in production cost upper estimate remains within the approved feature 029 envelope.

## Complexity Tracking

EX-030-001 is the only approved constitutional exception. It authorizes repository implementation, bounded testing, review, and merge while C1/C2 follow-up work is prepared; it does not authorize production. The additional application layers are independent decisions over existing bounded memory and PostgreSQL, not new infrastructure. The authentication-protection migration is necessary to remove Restricted raw identifiers and is expand/contract compatible. Existing feature 029 activation failures remain explicit production blockers.
