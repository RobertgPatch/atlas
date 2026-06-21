# Tasks: Plaid Refresh Policy And AWS Liquidity Deployment

**Input**: Design documents from `/specs/014-plaid-refresh-policy/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included because the feature specification defines independent tests and the plan calls for API contract/integration tests, focused web tests, deployment validation, and production readiness checks.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after the foundational work. AWS deployment and Terraform comparison tasks are included as cross-cutting production work because they support the whole Liquidity release.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or does not depend on incomplete tasks.
- **[Story]**: Which user story the task belongs to: US1, US2, US3, or US4.
- Each task includes an exact file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared application, container, documentation, and Terraform locations for the Liquidity refresh and AWS deployment work.

- [ ] T001 Confirm `AGENTS.md` points to `specs/014-plaid-refresh-policy/plan.md`
- [ ] T002 Confirm `.specify/feature.json` points to `specs/014-plaid-refresh-policy`
- [ ] T003 [P] Add Plaid refresh response metadata types in `packages/types/src/reports.ts`
- [ ] T004 [P] Add Plaid refresh diagnostics and production readiness types in `packages/types/src/plaid.ts`
- [ ] T005 [P] Add refresh policy, scheduler, security, and AWS runtime configuration fields in `apps/api/src/config.ts`
- [ ] T006 Create the API production container definition in `apps/api/Dockerfile`
- [ ] T007 [P] Create the AWS infrastructure overview document in `infra/aws/README.md`
- [ ] T008 [P] Create the manual AWS Liquidity deployment runbook in `infra/aws/manual-liquidity-deployment.md`
- [ ] T009 [P] Create the production readiness checklist document in `docs/deployment/aws-liquidity-production-readiness.md`
- [ ] T010 Create Terraform version constraints in `infra/aws/terraform/versions.tf`
- [ ] T011 Create Terraform provider configuration in `infra/aws/terraform/providers.tf`
- [ ] T012 Create Terraform root input variables in `infra/aws/terraform/variables.tf`
- [ ] T013 Create Terraform root module wiring in `infra/aws/terraform/main.tf`
- [ ] T014 Create Terraform root outputs in `infra/aws/terraform/outputs.tf`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared storage, policy, locking, request validation, and security primitives that all user stories depend on.

**CRITICAL**: No user story work should begin until this phase is complete.

- [ ] T015 Implement refresh policy tables, snapshot metadata columns, attempt fields, and indexes in `apps/api/src/infra/db/migrations/015_plaid_refresh_policy.sql`
- [ ] T016 Add `PlaidRefreshPolicy`, `HoldingsRefreshAttempt`, `HoldingsSnapshotMetadata`, and `ProductionReadinessDiagnostic` interfaces in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T017 Add database row mappers for refresh policies, refresh attempts, snapshot metadata, and safe diagnostic fields in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T018 Implement default refresh policy configuration fallback from environment values in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T019 Implement refresh policy load and update methods in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T020 Implement refresh-attempt create, finalize, latest, active, and selected-account lookup methods in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T021 Implement holdings snapshot create, latest, by-account, and metadata lookup methods in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T022 Implement duplicate refresh prevention with PostgreSQL advisory locks or row locks in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T023 Create cutoff, freshness, stale/fresh status, and next-refresh calculations in `apps/api/src/modules/plaid/plaid.refresh-policy.ts`
- [ ] T024 Create the scheduled refresh runner service shell in `apps/api/src/modules/plaid/plaid.refresh-scheduler.ts`
- [ ] T025 Add request schemas for manual refresh force mode, scheduler payloads, and scheduler token validation in `apps/api/src/modules/reports/reports.zod.ts`
- [ ] T026 Add no-shared-cache headers, secure header defaults, and production rate-limit wiring for authenticated API routes in `apps/api/src/app.ts`
- [ ] T027 [P] Add API test helpers for seeded dated Plaid snapshots in `apps/api/tests/helpers/consolidatedHoldingsTestHelpers.ts`
- [ ] T028 [P] Add API test helpers for policy time control, lock simulation, and Plaid call spying in `apps/api/tests/helpers/plaidRefreshPolicyTestHelpers.ts`
- [ ] T029 [P] Add API test helpers for production readiness diagnostics in `apps/api/tests/helpers/productionReadinessTestHelpers.ts`

**Checkpoint**: Database schema, refresh policy calculations, refresh locks, security defaults, and test helpers are ready.

---

## Phase 3: User Story 1 - Load Liquidity From Saved Data (Priority: P1) MVP

**Goal**: Liquidity opens from the latest saved snapshot, ordinary dashboard reads do not call Plaid, and users see data-as-of and freshness status.

**Independent Test**: Seed saved holdings for selected accounts, open or call Liquidity repeatedly, and verify saved rows plus data-as-of status are returned without initiating Plaid refresh.

### Tests for User Story 1

- [ ] T030 [P] [US1] Add contract test proving `GET /reports/consolidated-holdings` returns saved snapshot metadata in `apps/api/tests/reports.consolidated-holdings.freshness.contract.test.ts`
- [ ] T031 [US1] Add integration test proving repeated Liquidity reads do not call Plaid in `apps/api/tests/reports.consolidated-holdings.freshness.contract.test.ts`
- [ ] T032 [P] [US1] Add integration test proving user, entity, and selected-account scoping prevents cross-user holdings leakage in `apps/api/tests/reports.consolidated-holdings.identity.integration.test.ts`
- [ ] T033 [P] [US1] Add web test for fresh saved snapshot status display in `apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx`

### Implementation for User Story 1

- [ ] T034 [US1] Update current snapshot selection queries for dashboard-eligible saved snapshots in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T035 [US1] Update `listSourceHoldingsForSelectedAccounts` to read only latest saved snapshots for selected accounts in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T036 [US1] Enforce user, entity, and account scoping on consolidated holdings queries in `apps/api/src/modules/reports/reports.repository.ts`
- [ ] T037 [US1] Add saved snapshot metadata to consolidated holdings assembly in `apps/api/src/modules/reports/consolidatedHoldings.service.ts`
- [ ] T038 [US1] Return freshness, data-as-of, fetched-at, next-refresh, warnings, and active-refresh metadata in `apps/api/src/modules/reports/reports.repository.ts`
- [ ] T039 [US1] Ensure `getConsolidatedHoldingsHandler` performs no Plaid sync work during ordinary reads in `apps/api/src/modules/reports/reports.handler.ts`
- [ ] T040 [US1] Update consolidated holdings response type definitions for extended `sync` metadata in `packages/types/src/reports.ts`
- [ ] T041 [US1] Update the reports client to preserve extended sync metadata in `apps/web/src/features/reports/api/reportsClient.ts`
- [ ] T042 [US1] Configure TanStack Query reuse for saved Liquidity responses in `apps/web/src/features/reports/hooks/useConsolidatedHoldings.ts`
- [ ] T043 [US1] Render fresh, stale, refreshing, failed, unavailable, data-as-of, and next-refresh labels in `apps/web/src/features/reports/components/ConsolidatedHoldingsSyncStatus.tsx`
- [ ] T044 [US1] Wire the updated sync status component into the Liquidity report surface in `apps/web/src/features/reports/components/ConsolidatedHoldingsReport.tsx`

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Refresh Holdings On A Daily Policy (Priority: P1)

**Goal**: Plaid refreshes only through explicit refresh paths, defaults to daily 5:00 AM `America/Los_Angeles`, skips when fresh, prevents duplicates, and falls back to the last successful snapshot on failure.

**Independent Test**: Configure a 5:00 AM Pacific policy, create fresh and stale snapshots, and verify scheduled/manual refresh behavior matches the policy.

### Tests for User Story 2

- [ ] T045 [P] [US2] Add contract tests for cutoff, freshness, and next-refresh calculations in `apps/api/tests/plaid.refresh-policy.contract.test.ts`
- [ ] T046 [US2] Add integration test for stale scheduled refresh creating a new saved snapshot in `apps/api/tests/plaid.refresh-policy.integration.test.ts`
- [ ] T047 [US2] Add integration test for fresh scheduled refresh skipping Plaid calls in `apps/api/tests/plaid.refresh-policy.integration.test.ts`
- [ ] T048 [US2] Add integration test for failed refresh retaining the previous saved snapshot in `apps/api/tests/plaid.refresh-policy.integration.test.ts`
- [ ] T049 [P] [US2] Add contract test for manual refresh force mode in `apps/api/tests/reports.consolidated-holdings.freshness.contract.test.ts`
- [ ] T050 [US2] Add contract test for scheduler token authentication and duplicate-refresh conflict behavior in `apps/api/tests/plaid.refresh-policy.contract.test.ts`

### Implementation for User Story 2

- [ ] T051 [US2] Update manual refresh handler and route validation to parse force mode and return `HoldingsRefreshAttempt` metadata in `apps/api/src/modules/reports/reports.handler.ts` and `apps/api/src/modules/reports/reports.routes.ts`
- [ ] T052 [US2] Update `plaidHoldingsSync.syncSelectedHoldings` to evaluate freshness before calling Plaid in `apps/api/src/modules/plaid/plaid.holdings-sync.ts`
- [ ] T053 [US2] Update `plaidHoldingsSync.syncSelectedHoldings` to create pending attempts and finalize success, partial success, failed, or skipped states in `apps/api/src/modules/plaid/plaid.holdings-sync.ts`
- [ ] T054 [US2] Update `plaidHoldingsSync.syncSelectedHoldings` to save holdings snapshots before reporting a successful refresh in `apps/api/src/modules/plaid/plaid.holdings-sync.ts`
- [ ] T055 [US2] Add duplicate refresh conflict behavior using refresh locks in `apps/api/src/modules/plaid/plaid.holdings-sync.ts`
- [ ] T056 [US2] Implement daily scheduler execution and selected-account refresh orchestration in `apps/api/src/modules/plaid/plaid.refresh-scheduler.ts`
- [ ] T057 [US2] Add protected scheduler endpoint handler in `apps/api/src/modules/admin/plaid-refresh-status.handler.ts`
- [ ] T058 [US2] Register `POST /admin/plaid-refresh/run` in `apps/api/src/modules/admin/admin.routes.ts`
- [ ] T059 [US2] Add safe audit events for manual, scheduled, skipped, failed, and duplicate refresh attempts in `apps/api/src/modules/audit/audit.events.ts`
- [ ] T060 [US2] Emit CloudWatch-friendly structured refresh logs without Plaid tokens in `apps/api/src/modules/plaid/plaid.refresh-scheduler.ts`
- [ ] T061 [US2] Update the web refresh mutation to send force mode when requested in `apps/web/src/features/reports/hooks/useConsolidatedHoldings.ts`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Preserve Historical Liquidity Snapshots (Priority: P2)

**Goal**: Every successful refresh keeps dated snapshot data so future trend views can use historical values without Plaid.

**Independent Test**: Save holdings for multiple dates, verify older rows remain, and verify current Liquidity uses the latest eligible snapshot.

### Tests for User Story 3

- [ ] T062 [US3] Add history integration test proving source holdings are append-only across refreshes in `apps/api/tests/reports.consolidated-holdings.history.integration.test.ts`
- [ ] T063 [US3] Add history integration test proving current dashboard chooses the latest eligible snapshot in `apps/api/tests/reports.consolidated-holdings.history.integration.test.ts`
- [ ] T064 [US3] Add history integration test proving data-as-of dates remain distinguishable by snapshot in `apps/api/tests/reports.consolidated-holdings.history.integration.test.ts`

### Implementation for User Story 3

- [ ] T065 [US3] Remove account-level source holding delete behavior from normal refresh persistence in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T066 [US3] Persist `data_as_of_date`, min/max as-of dates, and fetched timestamp for each successful snapshot in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T067 [US3] Compute snapshot-level as-of dates from Plaid holdings and securities in `apps/api/src/modules/plaid/plaid.holdings-sync.ts`
- [ ] T068 [US3] Add repository methods to list historical snapshots by account and date range in `apps/api/src/modules/plaid/plaid.repository.ts`
- [ ] T069 [US3] Ensure consolidated holdings current queries ignore failed, skipped, and empty snapshots in `apps/api/src/modules/reports/reports.repository.ts`
- [ ] T070 [US3] Update export generation to include displayed snapshot data-as-of metadata in `apps/api/src/modules/reports/reports.export.ts`

**Checkpoint**: User Stories 1, 2, and 3 all work independently.

---

## Phase 6: User Story 4 - Make Refresh Configuration Visible (Priority: P3)

**Goal**: Admins can see active refresh policy, scheduler readiness, last attempted refresh, last successful refresh, next refresh, production-readiness warnings, and no secret values.

**Independent Test**: Call diagnostics with and without scheduler configuration and verify policy, freshness, scheduler status, production readiness, and security warnings are reported without exposing secrets.

### Tests for User Story 4

- [ ] T071 [P] [US4] Add admin diagnostics contract test for `GET /admin/plaid-refresh-status` in `apps/api/tests/plaid.refresh-policy.contract.test.ts`
- [ ] T072 [US4] Add integration test for missing scheduler warning in `apps/api/tests/plaid.refresh-policy.integration.test.ts`
- [ ] T073 [US4] Add integration test proving diagnostics do not expose Plaid tokens, scheduler token, database URL, or persistence secret in `apps/api/tests/plaid.refresh-policy.integration.test.ts`
- [ ] T074 [P] [US4] Add admin diagnostics contract test for `GET /admin/production-readiness` in `apps/api/tests/production-readiness.contract.test.ts`
- [ ] T075 [US4] Add production readiness test for no-shared-cache policy, secure cookies, allowed origin, and secret presence booleans in `apps/api/tests/production-readiness.contract.test.ts`
- [ ] T076 [US4] Add production readiness test for launch-required API/repository scoping and deferred Postgres RLS status in `apps/api/tests/production-readiness.contract.test.ts`

### Implementation for User Story 4

- [ ] T077 [US4] Implement refresh diagnostic aggregation in `apps/api/src/modules/admin/plaid-refresh-status.handler.ts`
- [ ] T078 [US4] Register `GET /admin/plaid-refresh-status` in `apps/api/src/modules/admin/admin.routes.ts`
- [ ] T079 [US4] Add scheduler configuration warnings to startup diagnostics in `apps/api/src/server.ts`
- [ ] T080 [US4] Add admin-only diagnostic response types in `packages/types/src/plaid.ts`
- [ ] T081 [US4] Add API client support for refresh diagnostics in `apps/web/src/features/reports/api/reportsClient.ts`
- [ ] T082 [US4] Create the production readiness handler in `apps/api/src/modules/admin/production-readiness.handler.ts`
- [ ] T083 [US4] Register `GET /admin/production-readiness` in `apps/api/src/modules/admin/admin.routes.ts`
- [ ] T084 [US4] Implement app-visible durable persistence, scheduler, secrets, secret rotation warning, cookie, origin, cache, and scoping diagnostics in `apps/api/src/modules/admin/production-readiness.handler.ts`
- [ ] T085 [US4] Add startup warning logs for missing production guardrails without secret values in `apps/api/src/server.ts`
- [ ] T086 [US4] Document Postgres RLS as deferred hardening with required API/repository scoping evidence in `docs/deployment/aws-liquidity-production-readiness.md`

**Checkpoint**: All user stories are independently functional.

---

## Phase 7: AWS Deployment, Terraform Comparison, And Cross-Cutting Validation

**Purpose**: Complete the production deployment artifacts, security/cost guardrails, manual setup guidance, Terraform comparison, and release validation.

- [ ] T087 Update `apps/api/Dockerfile` to build the Node 22 API image, install production dependencies, and copy SQL migrations beside the runtime output
- [ ] T088 Confirm Docker build context excludes local secrets and transient files in `.dockerignore`
- [ ] T089 Create Terraform network resources for VPC, public subnets, private subnets, routing, and security-group boundaries in `infra/aws/terraform/modules/network/main.tf`
- [ ] T090 Create Terraform network variables and outputs in `infra/aws/terraform/modules/network/variables.tf`
- [ ] T091 Create Terraform RDS PostgreSQL resources with private access from the API security group in `infra/aws/terraform/modules/database/main.tf`
- [ ] T092 Create Terraform database variables and outputs in `infra/aws/terraform/modules/database/variables.tf`
- [ ] T093 Create Terraform Secrets Manager resources and rotation metadata placeholders in `infra/aws/terraform/modules/secrets/main.tf`
- [ ] T094 Create Terraform secrets variables and non-secret outputs in `infra/aws/terraform/modules/secrets/variables.tf`
- [ ] T095 Create Terraform ECR, ECS/Fargate API service, task definition, IAM roles, log group, and health check resources in `infra/aws/terraform/modules/api/main.tf`
- [ ] T096 Create Terraform API variables and outputs in `infra/aws/terraform/modules/api/variables.tf`
- [ ] T097 Create Terraform S3 web bucket, CloudFront default static behavior, `/v1/*` API behavior, ACM, and Route 53 resources in `infra/aws/terraform/modules/edge/main.tf`
- [ ] T098 Create Terraform edge variables and outputs in `infra/aws/terraform/modules/edge/variables.tf`
- [ ] T099 Create Terraform WAF managed rules, rate-based rules, and logging resources in `infra/aws/terraform/modules/security/main.tf`
- [ ] T100 Create Terraform security variables and outputs in `infra/aws/terraform/modules/security/variables.tf`
- [ ] T101 Create Terraform EventBridge Scheduler resources for daily 5:00 AM `America/Los_Angeles` refresh in `infra/aws/terraform/modules/scheduler/main.tf`
- [ ] T102 Create Terraform scheduler variables and outputs in `infra/aws/terraform/modules/scheduler/variables.tf`
- [ ] T103 Create Terraform CloudWatch log retention, health alarms, API error alarms, scheduler alarms, RDS alarms, and WAF alarms in `infra/aws/terraform/modules/observability/main.tf`
- [ ] T104 Create Terraform observability variables and outputs in `infra/aws/terraform/modules/observability/variables.tf`
- [ ] T105 Create Terraform AWS Budgets resources and notification variables in `infra/aws/terraform/modules/budgets/main.tf`
- [ ] T106 Create Terraform budgets variables and outputs in `infra/aws/terraform/modules/budgets/variables.tf`
- [ ] T107 Wire all Terraform modules together with least-privilege inputs in `infra/aws/terraform/main.tf`
- [ ] T108 Add sanitized example Terraform variables without secret values in `infra/aws/terraform/terraform.tfvars.example`
- [ ] T109 Document manual DNS, ACM, VPC, RDS, Secrets Manager, ECR, ECS, S3, CloudFront, WAF, EventBridge, CloudWatch, Route 53, and Budgets steps in `infra/aws/manual-liquidity-deployment.md`
- [ ] T110 Document manual-to-Terraform comparison fields and drift review process in `infra/aws/README.md`
- [ ] T111 Document production validation for logs, alarms, WAF, rate limiting, DDoS baseline, budget alerts, secret rotation enforcement, CSRF, XSS, SQL injection, and token minimization in `docs/deployment/aws-liquidity-production-readiness.md`
- [ ] T112 Update OpenAPI examples after implementation in `specs/014-plaid-refresh-policy/contracts/plaid-refresh-policy.openapi.yaml`
- [ ] T113 Update quickstart AWS verification commands after implementation in `specs/014-plaid-refresh-policy/quickstart.md`
- [ ] T114 Add the no-Redis and no-shared-CDN-cache decisions to system architecture notes in `docs/api/architecture/10-system-architecture.md`
- [ ] T115 Run focused API tests listed in `specs/014-plaid-refresh-policy/quickstart.md`
- [ ] T116 Run focused web tests listed in `specs/014-plaid-refresh-policy/quickstart.md`
- [ ] T117 Run API and web production builds from `package.json`
- [ ] T118 Run local API container build and migration-file presence check from `specs/014-plaid-refresh-policy/quickstart.md`
- [ ] T119 Run `terraform fmt`, `terraform validate`, and `terraform plan` for `infra/aws/terraform/main.tf`
- [ ] T120 Complete the manual AWS deployment evidence checklist in `infra/aws/manual-liquidity-deployment.md`
- [ ] T121 Record Terraform plan comparison results and intentional differences in `infra/aws/README.md`
- [ ] T122 Add production secret exclusion patterns to `.gitignore` and record no-secret verification evidence in `docs/deployment/aws-liquidity-production-readiness.md`
- [ ] T123 Review completed implementation against success criteria in `specs/014-plaid-refresh-policy/spec.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; this is the recommended MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and integrates with US1 metadata, but can be tested through refresh endpoints.
- **User Story 3 (Phase 5)**: Depends on Foundational and the US2 refresh write path.
- **User Story 4 (Phase 6)**: Depends on Foundational and the shared refresh policy, attempt repository methods, and app configuration.
- **AWS Deployment and Validation (Phase 7)**: Can begin documentation and Terraform scaffolding after Setup, but final validation depends on the desired user stories being complete.

### User Story Dependencies

- **US1 Load Liquidity From Saved Data**: Start after Phase 2; no dependency on US2 for ordinary saved reads.
- **US2 Refresh Holdings On A Daily Policy**: Start after Phase 2; shares metadata with US1 and owns refresh execution.
- **US3 Preserve Historical Liquidity Snapshots**: Start after Phase 2, but final behavior depends on the US2 refresh write path.
- **US4 Make Refresh Configuration Visible**: Start after Phase 2; depends on refresh policy, attempt repository methods, and production config readers.

### Within Each User Story

- Write the listed tests first and confirm they fail before implementation.
- Repository and schema work before service and handler work.
- Services before route registration and web integration.
- Security and diagnostics must not expose Plaid tokens, database URLs, scheduler tokens, or persistence keys.
- Story implementation must reach the checkpoint before treating the story as complete.

### Parallel Opportunities

- T003, T004, T005, T007, T008, and T009 can run in parallel after T001 and T002 are confirmed.
- T027, T028, and T029 can run in parallel once foundational schemas are understood.
- US1 tests T030, T032, and T033 can run in parallel; T031 shares a file with T030.
- US2 tests T045 and T049 can run in parallel; T046 through T048 share an integration test file.
- US4 tests T071 and T074 can run in parallel; T072 and T073 share an integration test file.
- Terraform module tasks T089, T091, T093, T095, T097, T099, T101, T103, and T105 can be drafted in parallel after root variables are stable.
- Documentation tasks T109, T110, T111, T112, T113, and T114 can run in parallel after implementation behavior is stable.

---

## Parallel Example: User Story 1

```text
Task: "T030 [P] [US1] Add contract test proving GET /reports/consolidated-holdings returns saved snapshot metadata in apps/api/tests/reports.consolidated-holdings.freshness.contract.test.ts"
Task: "T032 [P] [US1] Add integration test proving user, entity, and selected-account scoping prevents cross-user holdings leakage in apps/api/tests/reports.consolidated-holdings.identity.integration.test.ts"
Task: "T033 [P] [US1] Add web test for fresh saved snapshot status display in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx"
```

## Parallel Example: User Story 2

```text
Task: "T045 [P] [US2] Add contract tests for cutoff, freshness, and next-refresh calculations in apps/api/tests/plaid.refresh-policy.contract.test.ts"
Task: "T046 [US2] Add integration test for stale scheduled refresh creating a new saved snapshot in apps/api/tests/plaid.refresh-policy.integration.test.ts"
Task: "T049 [P] [US2] Add contract test for manual refresh force mode in apps/api/tests/reports.consolidated-holdings.freshness.contract.test.ts"
```

## Parallel Example: User Story 4

```text
Task: "T071 [P] [US4] Add admin diagnostics contract test for GET /admin/plaid-refresh-status in apps/api/tests/plaid.refresh-policy.contract.test.ts"
Task: "T074 [P] [US4] Add admin diagnostics contract test for GET /admin/production-readiness in apps/api/tests/production-readiness.contract.test.ts"
```

## Parallel Example: AWS Terraform Work

```text
Task: "T089 Create Terraform network resources for VPC, public subnets, private subnets, routing, and security-group boundaries in infra/aws/terraform/modules/network/main.tf"
Task: "T091 Create Terraform RDS PostgreSQL resources with private access from the API security group in infra/aws/terraform/modules/database/main.tf"
Task: "T097 Create Terraform S3 web bucket, CloudFront default static behavior, /v1/* API behavior, ACM, and Route 53 resources in infra/aws/terraform/modules/edge/main.tf"
Task: "T103 Create Terraform CloudWatch log retention, health alarms, API error alarms, scheduler alarms, RDS alarms, and WAF alarms in infra/aws/terraform/modules/observability/main.tf"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 for US1.
3. Validate that Liquidity reads from saved snapshots and makes no Plaid calls on ordinary reads.
4. Demo or deploy the read-path fix before adding scheduled refresh automation.

### Incremental Delivery

1. Setup plus Foundational work makes refresh policy primitives, security defaults, and deployment scaffolds available.
2. US1 makes Liquidity fast and saved-data based.
3. US2 adds daily/manual refresh behavior, duplicate protection, and failure fallback.
4. US3 protects history for future trend reporting.
5. US4 adds operator visibility, production readiness diagnostics, and scheduler warnings.
6. Phase 7 completes AWS manual deployment guidance, Terraform comparison, and release validation.

### Parallel Team Strategy

1. One developer handles migration and repository primitives in Phase 2.
2. Another developer writes failing API/web tests for US1 and US2.
3. A third developer drafts AWS runbook and Terraform modules after Setup.
4. After Phase 2, US1 UI/read work and US2 refresh execution work can proceed in parallel with careful coordination on shared repository methods.

---

## Notes

- Do not add Redis for this task set unless new requirements invalidate the research decision.
- Preserve historical `source_holdings`; do not replace older successful snapshots during normal refresh.
- Static web assets can be edge cached, but authenticated `/v1/*` financial API responses must not use shared CDN caching.
- Production secrets must stay in Secrets Manager or local development-only `.env` files, never in committed docs, Terraform outputs, logs, browser payloads, or diagnostics.
- API/repository scoping is launch-required; Postgres RLS remains a documented hardening follow-up after the access model stabilizes.
- Stop at each checkpoint to validate the story independently.
