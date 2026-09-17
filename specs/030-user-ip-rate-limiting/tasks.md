# Tasks: User and IP Rate-Limit Hardening

**Input**: Design documents from `/specs/030-user-ip-rate-limiting/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required for every behavior change because the specification defines explicit independent, negative, migration, infrastructure, cost, privacy, performance, and recovery criteria. Write each story's tests first and verify they detect the missing or incorrect protection before implementing it.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as a bounded increment. No task authorizes production load testing or an AWS Apply.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same phase.
- **[Story]**: Maps the task to User Story 1-5 from `spec.md`.
- Every task names the exact file or directory it changes.

---

## Phase 1: Setup and Baseline

**Purpose**: Isolate feature 030 on the merged production-infrastructure baseline and capture reproducible pre-change evidence.

- [X] T001 After PR 37 merges, rebase `030-user-ip-rate-limiting` onto `origin/main` without applying the existing user stashes and record the old/new base SHAs in `specs/030-user-ip-rate-limiting/evidence/implementation-baseline.md`
- [X] T002 Run the existing API, route-policy, bounded-abuse, Terraform, production-policy, and production-cost gates before changing behavior and record commands/results plus any pre-existing failure in `specs/030-user-ip-rate-limiting/evidence/implementation-baseline.md`
- [X] T003 [P] Map FR-001 through FR-031 and SC-001 through SC-013 to the owning story, contract, implementation path, and verification evidence in `specs/030-user-ip-rate-limiting/evidence/requirements-traceability.md`
- [X] T004 [P] Generate and review the current canonical route/protection inventory, including auth and K-1 capability routes, and store the bounded baseline in `specs/030-user-ip-rate-limiting/evidence/route-protection-baseline.md`

---

## Phase 2: Foundational Protection Contracts

**Purpose**: Establish the shared policy, configuration, source-identity, response, fingerprint, and test-helper contracts required by every story.

**Critical**: No user-story implementation begins until this phase is green.

### Foundational tests

- [X] T005 [P] Add failing coverage for multiple independent local limits, shared route-class limit keys, required owners, prohibited combined source/user keys, and unclassified-route startup failure in `apps/api/tests/abuse-protection/route-policy-coverage.contract.test.ts`
- [X] T006 [P] Add failing production configuration tests for auth/API source and global minimums, explicit windows, fixed one-task assumptions, generated viewer-source requirements, deployment tenant identity, HMAC key versions, and fail-closed malformed/missing values in `apps/api/tests/abuse-protection.config.test.ts`
- [X] T007 [P] Add strict trusted-source tests for missing, duplicate, spoofed, malformed, IPv4, IPv4-mapped IPv6, bracketed IPv6-with-port, and IPv6 `/64` viewer identities in `apps/api/tests/proxy-trust.security.test.ts`
- [X] T008 [P] Extend rejection contract tests for the OpenAPI status/body/header bounds, `Cache-Control: no-store`, uniform auth responses, and zero Restricted fields in `apps/api/tests/abuse-protection/protection-errors.contract.test.ts`
- [X] T009 [P] Add active/retained HMAC alias, stable global identity, retirement-window, and invalid-version tests in `apps/api/tests/abuse-protection/protection-foundations.test.ts`

### Foundational implementation

- [X] T010 Extend `RouteProtectionPolicy`, local-rate arrays/partitions, shared limit keys, source scope, concurrency classes, and fixed decision/reason vocabularies in `apps/api/src/modules/abuse-protection/protection.types.ts`
- [X] T011 Implement validated production configuration for the new application/edge ceilings, viewer-source contract, proxy ranges, deployment tenant, HMAC versions, local partitions, auth daily cap, and capability TTL in `apps/api/src/config.ts`
- [X] T012 Implement canonical class aggregation and the strengthened route invariants in `apps/api/src/modules/abuse-protection/policy.defaults.ts`, `apps/api/src/modules/abuse-protection/routePolicy.registry.ts`, and `scripts/security/generate-route-protection-inventory.mjs`
- [X] T013 Align bounded 429/503 bodies and headers with `contracts/rate-limit-response.openapi.yaml`, including `Cache-Control: no-store`, in `apps/api/src/modules/abuse-protection/protection.errors.ts`
- [X] T014 Implement strict CloudFront viewer-address parsing, trusted-path validation, IPv4 mapping, IPv6 `/64` normalization, and production fail-closed behavior in `apps/api/src/modules/abuse-protection/requestSourceIdentity.ts` and `apps/api/src/modules/abuse-protection/requestBoundaries.plugin.ts`
- [X] T015 Implement key-versioned fingerprints, retained aliases, non-sensitive stable global subjects, and retirement validation in `apps/api/src/modules/abuse-protection/subjectFingerprint.ts`
- [X] T016 Extend bounded clocks, subject fixtures, side-effect spies, multi-process admission doubles, and redaction assertions for all five stories in `apps/api/tests/helpers/abuseProtectionTestHelpers.ts`

**Checkpoint**: Policy/config/source/response/fingerprint foundations are green and can support every story without trusting viewer-controlled identity.

---

## Phase 3: User Story 1 - Keep Authentication Usable During Bot Traffic (Priority: P1) — MVP

**Goal**: Reject single-source, single-account, distributed, and concurrent authentication abuse before Argon2, MFA, session creation, or amplified audit work while retaining uniform public behavior and bounded operator recovery.

**Independent Test**: Run legitimate password and MFA flows alongside excessive one-source, rotating-source, rotating-account, restart/overlap, and store-failure fixtures; confirm every excess attempt returns the bounded contract and causes zero additional hash, TOTP/QR, session, provider, or per-request audit work.

### Tests for User Story 1

- [X] T017 [P] [US1] Add migration tests for fingerprinted auth-attempt reads/writes, compatibility rollback, legacy expiry/redaction, and restartable cleanup in `apps/api/tests/auth-protection-fingerprint.migration.integration.test.ts`
- [X] T018 [P] [US1] Extend auth admission integration tests for atomic global-source-account ordering, 100 rotating source/account pairs, global daily limits, two simulated tasks, restart continuity, bounded rows, local global-exhaustion shedding, and store-failure rejection in `apps/api/tests/abuse-protection/auth-admission.integration.test.ts`
- [X] T019 [P] [US1] Extend password tests for known/unknown-account equivalence, source/account/global/hash rejection, precise hash lease lifetime, zero post-rejection Argon2/session/audit work, and bounded retry headers in `apps/api/tests/auth.login.test.ts`
- [X] T020 [P] [US1] Extend MFA verification and enrollment tests so invalid challenges consume source/global limits, resolvable challenges consume the account limit, QR/TOTP work is skipped after rejection, and public results stay uniform in `apps/api/tests/auth.mfa-verify.test.ts` and `apps/api/tests/auth.mfa-enroll.test.ts`
- [X] T021 [P] [US1] Add bounded cooldown, no permanent/escalating attacker lockout, successful recovery, fingerprint-only evidence, retention, and suppressed-repeat tests in `apps/api/tests/abuse-protection/auth-state-retention.test.ts`

### Implementation for User Story 1

- [X] T022 [US1] Add the expand/compatibility/cutover schema for `source_prefix` rate windows and fingerprinted auth protection attempts, with indexes/checks/cleanup and no destructive legacy drop, in `apps/api/src/infra/db/migrations/040_auth_rate_limit_hardening.sql`
- [X] T023 [US1] Implement global-first atomic auth rate reservations, source scope support, retained-fingerprint consolidation, row-cardinality bounds, and precise retry calculation in `apps/api/src/modules/abuse-protection/admission.repository.ts`
- [X] T024 [US1] Expose fail-closed auth admission with fixed source/account/global/store reason codes and no workload/idempotency row creation in `apps/api/src/modules/abuse-protection/admission.service.ts`
- [X] T025 [US1] Replace the process-local account map with asynchronous durable global/source/account admission plus the deny-only global-exhaustion circuit in `apps/api/src/modules/auth/authAdmission.service.ts`
- [X] T026 [US1] Move the non-queued Argon2 semaphore immediately around password hashing, release it in `finally`, and expose bounded saturation evidence in `apps/api/src/modules/auth/password.service.ts`
- [X] T027 [US1] Reorder login admission, lockout lookup, hashing, audit, MFA setup, and session creation so rejection precedes every expensive/identifying operation in `apps/api/src/modules/auth/login.handler.ts`
- [X] T028 [P] [US1] Apply the shared durable auth admission and uniform rejection ordering to MFA verification in `apps/api/src/modules/auth/mfa-verify.handler.ts`
- [X] T029 [P] [US1] Apply the shared durable auth admission and zero-QR/TOTP-after-rejection ordering to enrollment completion in `apps/api/src/modules/auth/mfa-enroll-complete.handler.ts`
- [X] T030 [US1] Replace raw email/source protection writes with key-versioned fingerprints, bounded cooldown, suppressed repeat evidence, stable user IDs when known, and an audited recovery method in `apps/api/src/modules/auth/lockout.service.ts` and `apps/api/src/modules/audit/audit.repository.ts`
- [X] T031 [US1] Register the asynchronous auth admission lifecycle and validate one-task hash-concurrency assumptions at startup in `apps/api/src/app.ts` and `apps/api/src/server.ts`

**Checkpoint**: Authentication is independently usable and testable with exact distributed-bot and zero-expensive-work bounds, even without the later edge-tightening story.

---

## Phase 4: User Story 2 - Enforce Independent User and Network Fairness (Priority: P1)

**Goal**: Apply source, validated user, and optional session ceilings independently so cookie/session/address rotation cannot reset all usage and shared NAT clients remain fair.

**Independent Test**: Exercise one user over at least 10 sessions and 10 source networks, several users behind one NAT, route hopping, invalid cookie rotation, and high-cardinality source churn; verify every independent ceiling and bounded store partition behaves as declared.

### Tests for User Story 2

- [X] T032 [P] [US2] Add invalid-cookie rotation, authenticated-source persistence, shared class-key route hopping, and independent source/user rejection tests in `apps/api/tests/abuse-protection/local-rate-limiter.test.ts`
- [X] T033 [P] [US2] Rewrite fairness integration coverage for one user across 10 sessions/addresses and several users behind one NAT, proving user and source ceilings do not merge or reset each other, in `apps/api/tests/abuse-protection/fair-limits.integration.test.ts`
- [X] T034 [P] [US2] Add bounded source-churn tests proving pinned global/class and authenticated partitions cannot be evicted by source buckets and that eviction never authorizes durable paid work in `apps/api/tests/abuse-protection/local-rate-store-partitions.test.ts`

### Implementation for User Story 2

- [X] T035 [US2] Partition the bounded local store into pinned-global, authenticated, and source budgets with deterministic source-first eviction and bounded stats in `apps/api/src/modules/abuse-protection/localRateLimiter.plugin.ts`
- [X] T036 [US2] Replace the session-or-source key with unconditional pre-auth source decisions using shared class keys and no raw cookie identity in `apps/api/src/modules/abuse-protection/localRateLimiter.plugin.ts`
- [X] T037 [US2] Implement reusable validated user/session rate decisions with fixed class keys and bounded response handling in `apps/api/src/modules/abuse-protection/principalRateLimiter.ts`
- [X] T038 [US2] Enforce user and optional session limits only after session validation, keep source usage intact across network/session changes, and reject request-derived tenant identities in `apps/api/src/modules/auth/session.middleware.ts`
- [X] T039 [US2] Define deployment-owned tenant and explicit validated user/session/resource subject context without request-parameter fallbacks in `apps/api/src/modules/abuse-protection/subjectContext.ts`
- [X] T040 [US2] Assign independent source/user/session class limits to every external route class and keep liveness/internal exceptions explicit in `apps/api/src/modules/abuse-protection/policy.defaults.ts`
- [X] T041 [US2] Register the principal limiter after trusted session resolution and before authorization/business handlers in `apps/api/src/app.ts`

**Checkpoint**: Authenticated fairness is independently demonstrable without relying on an edge cookie/user identity.

---

## Phase 5: User Story 3 - Make the Protected Edge the Only Internet Entry (Priority: P1)

**Goal**: Preserve CloudFront/WAF as the only public API path, add distributed source/global edge ceilings, derive source from a generated trusted header, prevent internal-route forwarding, and preserve API error responses.

**Independent Test**: Render/inspect Terraform and negative plan fixtures, exercise spoofed headers and API errors, and prove zero public ALB/task/database/alternate gateway/internal route plus exact CloudFront/WAF attachment and private-hop ingress.

### Tests for User Story 3

- [X] T042 [P] [US3] Extend Terraform tests for general/auth/paid per-IP and constant-global rules, explicit 300-second windows, `/health` coverage, exact path/method scopes, Count/Block actions, fixed one-task capacity, and prohibition of `FORWARDED_IP` in `infra/aws/terraform/tests/abuse_protection.tftest.hcl`
- [X] T043 [P] [US3] Add native Terraform assertions for one VPC API origin, internal ALB/private subnets, no public task/RDS, immediate-upstream SG ingress, private static origin, no internal behavior, no direct-origin DNS/output, and no alternate public gateway in `infra/aws/terraform/tests/origin_boundary.tftest.hcl`
- [X] T044 [P] [US3] Add rendered-plan pass/fail fixtures for public ALB/ECS/RDS, broad ingress, API Gateway/Function URL, alternate DNS, missing WAF, custom public API origin, internal forwarding, request autoscaling, and origin output in `scripts/security/production-plan-policy.test.ps1` and `scripts/security/fixtures/production-plans/README.md`
- [X] T045 [P] [US3] Add topology validator fixtures for the generated viewer-address policy, narrowed proxy path, exact `/v1/*` and `/health` behaviors, and prohibited distribution-wide SPA custom errors in `scripts/security/validate-environment-topology.test.mjs`
- [X] T046 [P] [US3] Add an edge response contract test proving `/v1/*` 401/403/404/429 status/body/`Retry-After`/`no-store` are never converted to SPA HTML 200 while static deep links still resolve in `apps/api/tests/abuse-protection/edge-response-contract.test.ts`

### Implementation for User Story 3

- [X] T047 [US3] Add labeled auth-global and general-API-global WAF rules, explicit windows, `/health` scope, Count-to-Block variables, and reviewed source/paid limits in `infra/aws/terraform/modules/security/main.tf` and `infra/aws/terraform/modules/security/variables.tf`
- [X] T048 [US3] Wire validated WAF thresholds/actions and generated-viewer-source settings through production root inputs and outputs in `infra/aws/terraform/main.tf`, `infra/aws/terraform/variables.tf`, and `infra/aws/terraform/production.tfvars.example`
- [X] T049 [US3] Replace the managed broad API origin request policy with a Terraform-owned allowlist that adds `CloudFront-Viewer-Address` and preserves only required API cookies/query/headers in `infra/aws/terraform/modules/edge/main.tf` and `infra/aws/terraform/modules/edge/variables.tf`
- [X] T050 [US3] Replace distribution-wide 403/404 SPA substitution with a static-default-behavior-only viewer rewrite while leaving `/v1/*` and `/health` untouched in `infra/aws/terraform/modules/edge/main.tf`
- [X] T051 [US3] Expose exact private proxy subnet/path inputs and enforce ALB-from-CloudFront, API-from-ALB, and RDS-from-API ingress without broad CIDRs in `infra/aws/terraform/modules/network/main.tf` and `infra/aws/terraform/modules/network/variables.tf`
- [X] T052 [US3] Enforce all origin, route, WAF, DNS/output, alternate-service, and fixed-capacity invariants against rendered production plans in `scripts/security/production-plan-policy.psm1`
- [X] T053 [US3] Enforce source-header, cache-behavior, trusted-proxy, SPA-error, and one-public-edge invariants in `scripts/security/validate-environment-topology.mjs`
- [X] T054 [US3] Make WAF credential-route scope derive from or fail against the canonical auth route inventory so future recovery/password routes cannot escape edge protection in `scripts/security/generate-route-protection-inventory.mjs` and `scripts/security/validate-terraform-guardrails.ps1`

**Checkpoint**: Knowing an origin hostname/address yields no Internet API response, and edge/API response/source contracts remain intact.

---

## Phase 6: User Story 4 - Bound Cost-Producing Work After Edge Admission (Priority: P2)

**Goal**: Ensure every heavy/paid/internal/capability path uses authoritative subjects and exact admission before database aggregation, provider, queue, export, S3, or background work.

**Independent Test**: Exceed user/global/concurrency/quota/idempotency/capability ceilings and inject protection-store failure; verify zero provider calls, queue messages, object versions, exports, heavy aggregation, or fleet growth after rejection.

### Tests for User Story 4

- [X] T055 [P] [US4] Add tests proving cost admission receives distinct validated user/session/deployment-tenant/authorized-resource/provider/global subjects and ignores tenant/entity request-parameter spoofing in `apps/api/tests/abuse-protection/cost-subject-context.test.ts`
- [X] T056 [P] [US4] Add bounded no-queue heavy-read/download concurrency, saturation retry, release-on-error, and zero-aggregation-after-rejection tests in `apps/api/tests/abuse-protection/heavy-read-concurrency.integration.test.ts`
- [X] T057 [P] [US4] Extend protected workflow regression coverage so every paid/heavy rejection creates zero provider, SQS, S3, export, database-heavy, or retry side effect in `apps/api/tests/abuse-protection/protected-workflows.regression.test.ts`
- [X] T058 [P] [US4] Add upload-slot tests for exact admitted key/bytes/type, short expiry, signed `If-None-Match: *`, `s3:signatureAge`, replay 412, one-version maximum, no URL after rejection, and disabled issuance in `apps/api/tests/k1.batch-upload.integration.test.ts`
- [X] T059 [P] [US4] Add HMAC rotation tests proving active rate, daily quota, monthly cost, idempotency, and retained aliases cannot reset or double-count during rotation in `apps/api/tests/abuse-protection/hmac-rotation.integration.test.ts`

### Implementation for User Story 4

- [X] T060 [US4] Replace the overloaded principal input with explicit validated subject context and require authorization-resolved resource scopes in `apps/api/src/modules/abuse-protection/costWorkloadAdmission.ts`
- [X] T061 [P] [US4] Pass explicit user/session/tenant/provider subjects and preserve zero-call rejection in `apps/api/src/modules/plaid/plaid.handler.ts`, `apps/api/src/modules/market-data/market-data.service.ts`, and `apps/api/src/modules/admin/plaid-refresh-status.handler.ts`
- [X] T062 [P] [US4] Pass explicit user/session/tenant/entity subjects and preserve zero-work rejection in `apps/api/src/modules/reports/reports.handler.ts` and `apps/api/src/modules/review/session.handler.ts`
- [X] T063 [P] [US4] Pass explicit user/session/tenant/document/provider subjects through K-1 route, completion, start-work, and worker admission in `apps/api/src/modules/k1/k1.routes.ts`, `apps/api/src/modules/k1/ingestion/k1UploadCompletion.service.ts`, `apps/api/src/modules/k1/worker/k1StartWork.handler.ts`, and `apps/api/src/modules/k1/worker/k1Completion.handler.ts`
- [X] T064 [US4] Implement bounded no-queue class semaphores with idempotent release and finite saturation metrics in `apps/api/src/modules/abuse-protection/localConcurrency.ts`
- [X] T065 [US4] Acquire heavy-read/download class capacity after auth/authorization and durable rates but before aggregation/stream generation in `apps/api/src/modules/auth/session.middleware.ts` and `apps/api/src/modules/abuse-protection/workloadAdmission.ts`
- [X] T066 [US4] Issue only short-lived exact-key conditional K-1 PUT capabilities with signed `If-None-Match: *`, admitted byte/type bounds, redaction, and one-operation reuse prevention in `apps/api/src/modules/k1/ingestion/k1UploadSlots.service.ts`
- [X] T067 [US4] Enforce quarantine-prefix TLS/encryption, bounded `s3:signatureAge`, required conditional writes, no public access, and replay-safe versioning policy in `infra/aws/terraform/modules/k1_ingestion/storage.tf`
- [X] T068 [US4] Add validated upload TTL/signature-age/byte/request quotas and keep K-1 capability issuance hard-disabled by default in `infra/aws/terraform/modules/k1_ingestion/variables.tf` and `infra/aws/terraform/main.tf`

**Checkpoint**: Application admission remains the exact spend boundary even if edge enforcement is delayed or an approved internal caller reaches the API.

---

## Phase 7: User Story 5 - Detect and Safely Tune Abuse Controls (Priority: P2)

**Goal**: Provide finite redacted signals, tested five-minute alarms, time-boxed Count-to-Block rollout, safe rollback, expiring lower-risk overrides, and an updated executable cost envelope.

**Independent Test**: Trigger every fixed rejection/saturation class with bounded synthetic traffic; verify finite metric series, capped/redacted logs, alarm routing, override expiry, Count/Block transitions, rollback, and cost-model coverage without raw subjects or production abuse traffic.

### Tests for User Story 5

- [X] T069 [P] [US5] Extend observability tests for finite in-process route-class/scope/reason/outcome aggregation, at most five nonzero environment-level CloudWatch metric names, capped samples, suppression totals, source-store eviction, auth saturation, HMAC failures, S3 replay, and zero raw identifiers in `apps/api/tests/abuse-protection/abuse-observability.test.ts`
- [X] T070 [P] [US5] Extend protection control tests so overrides can only lower risk, are scoped/audited/expiring, and cannot raise or disable hard auth/paid global ceilings in `apps/api/tests/abuse-protection/protection-controls.contract.test.ts`
- [X] T071 [P] [US5] Add Terraform assertions for rule-specific metrics/labels, filtered/redacted WAF logs, auth/API block alarms, hash/store/eviction/S3 growth alarms, no more than five-minute evaluation, destinations, and dashboard panels in `infra/aws/terraform/tests/observability_cost_backstops.tftest.hcl`
- [X] T072 [P] [US5] Update cost tests to derive every WAF rule, alarm, metric/log, SPA function, and S3 protection component and reject Bot Control/CAPTCHA/Challenge/Redis or an over-envelope total in `scripts/security/validate-production-cost.test.mjs`

### Implementation for User Story 5

- [X] T073 [US5] Implement a fixed-vocabulary in-process counter buffer, bounded flush/shutdown, capped rejection samples, and suppression summaries in `apps/api/src/modules/abuse-protection/abuseObservability.ts`
- [X] T074 [US5] Instrument edge-equivalent source, auth durable, user/session, heavy-read, paid quota/concurrency/backlog, store failure, eviction, HMAC, capability, and disable decisions without attacker-controlled dimensions in `apps/api/src/modules/abuse-protection/index.ts`
- [X] T075 [US5] Add stable WAF labels, ordered keep/drop filters, header/body/query redaction, and time-bounded Count observation controls in `infra/aws/terraform/modules/security/main.tf`
- [X] T076 [US5] Add five-minute auth/API edge, hash, admission-store, local-eviction, HMAC, S3 PUT/object-version, and downstream saturation alarms plus correlation panels in `infra/aws/terraform/modules/observability/main.tf` and `infra/aws/terraform/modules/observability/variables.tf`
- [X] T077 [US5] Refresh Terraform-derived resource counts, dated public prices, normal/attack-variable assumptions, approximately $106.20 directional comparison, and residual pay-as-you-go edge exposure in `infra/aws/terraform/production-cost-profile.json` and `specs/029-local-dev-aws-production/contracts/production-cost-model.md`
- [X] T078 [US5] Extend authentication, distributed-bot, source-churn, store-failure, S3 capability, origin-drift, false-positive rollback, AWS escalation, and cost reconciliation procedures in `infra/aws/cost-abuse-response-runbook.md`
- [X] T079 [US5] Implement a no-Apply Count-to-Block evidence/rollback validator with owner, under-24-hour expiry, retained-flow checks, and prohibition on ACL detach/origin exposure in `scripts/security/validate-waf-rollout.mjs` and `scripts/security/validate-waf-rollout.test.mjs`
- [X] T080 [US5] Record bounded alarm exercises, notification timing, redaction samples, Count/Block evidence requirements, and operator ownership in `specs/030-user-ip-rate-limiting/evidence/observability-and-rollout.md`

**Checkpoint**: Controls can be tuned and rolled back without hiding attack cost, logging Restricted identities, or disabling hard cost ceilings.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Reconcile all stories, prove performance/privacy/migration/topology/cost gates, and prepare a reviewable branch without authorizing production mutation.

- [X] T081 [P] Change the controlled p95 benchmark to the single “within the larger of 5% or 1 ms” acceptance rule, retain repeatable samples, and document CI noise controls in `apps/api/tests/abuse-protection/protection-overhead.benchmark.test.ts`
- [X] T082 [P] Add cross-artifact redaction fixtures covering IP/email/cookie/session/password/MFA/presigned URL/scheduler/CSRF/idempotency values in `apps/api/tests/abuse-protection/security-redaction.regression.test.ts`
- [X] T083 Run API/web builds, full tests, current-surface/pruning, route-policy, bounded-abuse, dependency, topology, and benchmark gates and record exact results in `specs/030-user-ip-rate-limiting/evidence/application-gates.md`
- [X] T084 Run Terraform fmt/init-without-backend/validate/native tests plus production plan-policy, cost, origin, observability, and state-safety fixture gates and record results in `specs/030-user-ip-rate-limiting/evidence/terraform-gates.md`
- [X] T085 Exercise the expand/compatibility/cutover/rollback migration path on disposable PostgreSQL and record legacy redaction, counter continuity, RPO/RTO compatibility, and rollback artifact constraints in `specs/030-user-ip-rate-limiting/evidence/migration-and-recovery.md`
- [X] T086 Execute every local step in `specs/030-user-ip-rate-limiting/quickstart.md`, including retained homepage/dashboard/liquidity/investment tracker/TIC registry/entities checks below final limits, and record deviations/fixes in `specs/030-user-ip-rate-limiting/evidence/quickstart-validation.md`
- [X] T087 Re-check the constitution and keep real Apply blocked until unique Tony/Robert identities, production MFA, Restricted-data inventory, WISP/incident readiness, operator edge-cost acknowledgement, and recovery evidence are complete in `specs/030-user-ip-rate-limiting/evidence/production-activation-gates.md`
- [X] T088 Rebase the completed implementation onto current `origin/main`, rerun T083-T087, verify no user stash was applied, and record final base SHA/change scope/PR readiness without pushing or applying AWS changes in `specs/030-user-ip-rate-limiting/evidence/review-handoff.md`

---

## Dependencies and Execution Order

### Phase dependencies

- **Phase 1 — Setup**: Starts immediately; T002 depends on T001.
- **Phase 2 — Foundations**: Depends on Phase 1 and blocks all user stories. Test tasks T005-T009 may run in parallel; implementation follows their failing evidence.
- **Phase 3 — US1**: Depends on Phase 2. This is the recommended MVP.
- **Phase 4 — US2**: Depends on Phase 2 and can be developed alongside US1 after shared contracts stabilize; its session integration must reconcile with US1 auth lifecycle before merge.
- **Phase 5 — US3**: Depends on Phase 2 and can run parallel to US1/US2 because it primarily changes Terraform and policy tooling.
- **Phase 6 — US4**: Depends on Phase 2 plus the validated subject context from US2 for final handler integration; its S3 work can begin in parallel.
- **Phase 7 — US5**: Depends on the decision/reason vocabulary from Phase 2; final instrumentation and alarms depend on the completed rejection paths from US1-US4.
- **Phase 8 — Polish**: Depends on all selected stories and produces the final review evidence.

### User-story dependency graph

```text
Setup -> Foundations
              |---> US1 Authentication (MVP) ---------|
              |---> US2 User/IP fairness ---> US4 ----|---> US5 final instrumentation -> Polish
              |---> US3 Edge/origin ------------------|
              `---> US4 S3 test/policy subset --------|
```

### Within each user story

- Write the story's tests first and prove they fail for the missing/incorrect behavior.
- Apply schema/type/config changes before services that consume them.
- Implement admission before moving or enabling downstream work.
- Integrate endpoints/handlers only after unit/service behavior is green.
- Complete the independent test and checkpoint before treating the story as deliverable.

### Parallel opportunities

- T003 and T004 can run parallel after branch setup.
- T005-T009 are independent foundational test files.
- T017-T021 are independent US1 test suites; T028 and T029 change separate MFA handlers.
- T032-T034 are independent US2 test suites.
- T042-T046 cover separate Terraform, plan-policy, topology, and API-edge contracts.
- T055-T059 are independent US4 tests; T061-T063 update separate workload call-site groups.
- T069-T072 cover application controls, Terraform observability, and cost tooling separately.
- T081 and T082 can run while evidence templates for T083-T087 are prepared.

---

## Parallel Execution Examples

### User Story 1

```text
T017: auth protection migration test
T018: distributed/durable auth admission integration test
T019: password/login zero-work test
T020: MFA verification/enrollment test
T021: cooldown/retention test
```

After T025, T028 and T029 can implement the two MFA handlers concurrently.

### User Story 2

```text
T032: invalid cookie and route-hopping tests
T033: 10-session/10-address and shared-NAT fairness tests
T034: bounded local-store partition tests
```

### User Story 3

```text
T042: WAF Terraform tests
T043: private-origin Terraform tests
T044: rendered-plan policy fixtures
T045: environment-topology fixtures
T046: API/SPA response contract
```

### User Story 4

```text
T055: explicit cost-subject tests
T056: heavy-read concurrency tests
T057: zero-downstream-side-effect regression
T058: S3 capability/replay tests
T059: HMAC rotation continuity tests
```

After T060, T061-T063 can update independent workload call-site groups concurrently.

### User Story 5

```text
T069: bounded application observability tests
T070: safe override tests
T071: Terraform alarm/log/dashboard tests
T072: executable production-cost tests
```

---

## Implementation Strategy

### MVP first: User Story 1

1. Complete Phase 1 and Phase 2.
2. Complete T017-T031 for durable, globally bounded authentication.
3. Run US1's independent test and the existing retained login/MFA tests.
4. Stop for review; do not deploy merely because the MVP is green.

This MVP closes the highest-cost public authentication gaps without waiting for every observability and edge-polish item.

### Incremental delivery

1. **Foundation**: trusted subjects, policy classes, bounded responses, and key versions.
2. **US1**: durable auth source/account/global admission and bounded lockout.
3. **US2**: independent source/user/session fairness.
4. **US3**: edge global limits and enforceable private-origin invariants.
5. **US4**: exact structured cost admission, heavy concurrency, and replay-safe S3 capabilities.
6. **US5**: bounded observability, alarms, rollout, rollback, and refreshed cost envelope.
7. **Polish**: complete evidence and final rebase/review handoff.

### Safe rollout strategy

- Application exact auth/paid limits are implemented and tested before edge candidates are enforced.
- Existing WAF Block protection stays enabled while new lower/global candidates observe in Count.
- Count observation is owned, redacted, and expires in under 24 hours.
- Rollback returns only the candidate to Count; it never exposes the origin, detaches WAF, enables request autoscaling, or removes hard global paid/auth ceilings.
- Production Apply remains a separate operator-authorized feature 029 action after all constitutional gates pass.

---

## Notes

- `[P]` marks genuinely separate files/work, not merely desirable concurrency.
- Every story task includes an exact repository path and traceable story label.
- Synthetic abuse inputs are bounded; providers and S3 are faked unless a disposable local/test environment is explicitly used.
- Never send an abuse/load test to production.
- Preserve the user's existing stashes throughout this feature.
- Commit after logical, green groups only when explicitly requested; task generation itself does not commit or push.
