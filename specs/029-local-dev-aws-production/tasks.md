# Tasks: Local Development to AWS Production

**Input**: Design documents from specs/029-local-dev-aws-production/
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The specification requires clean-local-startup acceptance, automated negative tests, deployment and plan-policy fixtures, Terraform safety tests, production-shaped capacity validation, and retained-flow smoke evidence. Test tasks are listed before the behavior they verify.

**Organization**: Tasks are grouped by user story so local development, direct production deployment, recovery, and topology governance can be implemented and accepted as distinct increments.

## Format: [ID] [P?] [Story] Description

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same group.
- **[Story]**: Maps the task to a user story from spec.md.
- Every task names the exact file or files it changes or verifies.

## Phase 1: Setup and Recovery Reconciliation

**Purpose**: Protect the dirty recovered branch and establish safe fixture/artifact locations before implementation.

- [X] T001 [P] Classify each staged recovered infrastructure change as retain, revise, supersede, or separate migration without reading ignored tfvars/state, explicitly rejecting the staged us-west-1, AWS-development example, backend-prefix, and replacement-triggering physical-name changes in specs/029-local-dev-aws-production/reconciliation.md
- [X] T002 [P] Add .artifacts/production-releases/, opaque saved plans, transient plan JSON, execution records, smoke credential files, and cost-price caches to .gitignore while preserving existing ignore rules
- [X] T003 [P] Create sentinel-safe fixture conventions and document prohibited secrets, credentials, account-specific values, and raw plan content in scripts/deployment/fixtures/README.md and scripts/security/fixtures/production-plans/README.md

---

## Phase 2: Foundational Release and Policy Primitives

**Purpose**: Establish target identity, artifact integrity, redaction, and one authoritative plan-policy engine used by all production stories.

**CRITICAL**: Complete this phase before production Plan, Prepare, Apply, Bootstrap, or Rollback implementation.

- [X] T004 Add failing tests for production-target schema validation, manifest schema validation, path containment, SHA-256 binding, backend fingerprints, clean-worktree checks, and sensitive-output redaction in scripts/deployment/production-release.test.ps1
- [X] T005 [P] Add failing core fixtures for Routine/Bootstrap action classification, protected-resource deletion/replacement, absolute production controls, unknown actions, Terraform JSON version rejection, and sentinel redaction in scripts/security/production-plan-policy.test.ps1 and scripts/security/fixtures/production-plans/
- [X] T006 Implement the committed non-secret us-west-2/default-workspace/us-east-1-certificate authority in infra/aws/production-target.json and make the T004 tests validate it against specs/029-local-dev-aws-production/contracts/production-target.schema.json
- [X] T007 Implement strict-mode target, schema, hashing, contained-path, redaction, artifact, manifest, migration-set, checkpoint, and execution-record helpers in scripts/deployment/production-release.psm1 until T004 passes
- [X] T008 Implement the only Terraform plan-policy engine, including Routine/Bootstrap capacity modes, absolute controls, protected actions, cost/secret contract inputs, and redacted results in scripts/security/production-plan-policy.psm1 until T005 passes

**Checkpoint**: Shared production identity, release, and policy primitives are fixture-tested and contain no AWS mutation.

---

## Phase 3: User Story 1 - Develop Entirely Locally (Priority: P1) - MVP

**Goal**: Run the retained application locally with PostgreSQL and deterministic local/stub adapters, fail closed on migrations/readiness, and refuse production resources before any provider call.

**Independent Test**: From a clean checkout with production credentials absent, reset the local database, run npm run dev:local, require successful migrations and /internal/readiness before worker/web startup, exercise retained flows, and prove production database/provider/account/resource fixtures exit nonzero before child processes or AWS calls.

### Tests for User Story 1

- [X] T009 [P] [US1] Add failing API configuration tests for local stub defaults, loopback database enforcement, explicit production runtime validation, and implicit AWS-provider refusal in apps/api/tests/environment-boundary.test.ts
- [X] T010 [P] [US1] Add failing clean-volume, repeated-run, advisory-lock, unavailable-database, and broken-migration tests in apps/api/tests/local-migration-startup.integration.test.ts
- [X] T011 [P] [US1] Add failing PowerShell launcher tests for migration ordering, /internal/readiness gating, fatal timeout, production markers, production AWS identities/resources, mutation flags, and child-process suppression in scripts/dev-local.test.ps1

### Implementation for User Story 1

- [X] T012 [P] [US1] Add a synchronous migration entry point using the existing ordered transaction and advisory-lock runner in apps/api/src/scripts/run-migrations.ts and expose it from apps/api/package.json
- [X] T013 [P] [US1] Implement explicit local/production runtime validation plus stub extractor, local queue, and local object-store defaults in apps/api/src/config.ts
- [X] T014 [US1] Start PostgreSQL, run migrations synchronously, start the API, require /internal/readiness, then start worker and web while treating any failure as fatal in scripts/dev-local.ps1
- [X] T015 [US1] Make dev:local canonical, remove implicit BDA activation, and retain any real-provider launcher only as an explicitly sandbox-only production-refusing command in package.json
- [X] T016 [P] [US1] Document safe local defaults and production-only variables without values in apps/api/.env.example
- [X] T017 [P] [US1] Document clean local startup, migration failure behavior, stub adapters, and optional sandbox-only provider use in apps/api/README.md
- [X] T018 [P] [US1] Rewrite the current environment strategy around local development and sole AWS production in docs/deployment/environment-strategy.md
- [X] T019 [US1] Run the clean-volume startup, retained-flow reads, repeated migrations, and all production-refusal fixtures and record commands plus sanitized outcomes in specs/029-local-dev-aws-production/quickstart.md

**Checkpoint**: User Story 1 runs entirely locally and demonstrates zero required production AWS calls.

---

## Phase 4: User Story 2 - Deploy Directly to AWS Production (Priority: P1)

**Goal**: Prepare and apply one immutable reviewed release to the sole AWS production target using exact target, secret, cost, artifact, and saved-plan evidence plus explicit confirmation.

**Independent Test**: Exercise fixture-backed Plan, Bootstrap, Prepare, and Apply modes; verify every target/account/backend/hash/secret/cost/confirmation mismatch stops before mutation, Bootstrap is single-use, and Apply consumes only the reviewed saved plan and immutable artifacts without performing a real AWS apply during implementation.

### Tests for User Story 2

- [X] T020 [US2] Extend failing CLI tests for parameters, tool versions, clean commits, STS identity, target descriptor binding, backend/workspace/tfvars hashes, mode mutation boundaries, exact confirmations, immutable artifacts, and exit codes in scripts/deployment/production-release.test.ps1
- [X] T021 [P] [US2] Add failing secret tests for missing/duplicate names, pending deletion, AWSCURRENT cardinality, empty string/binary, missing VersionId, wrong account/region, version drift, retired alias, consumer wiring, broad IAM, and sentinel leakage in scripts/deployment/production-secret-preflight.test.ps1
- [X] T022 [P] [US2] Add failing cost tests for workload assumptions, current regional rate metadata, recurring-resource coverage, disabled paid features, arithmetic/rounding, estimates above $110, wrong $125 threshold, and Budget actions in scripts/security/validate-production-cost.test.mjs
- [X] T023 [P] [US2] Add failing adapter tests for target/plan/tfvars/backend/source hashes, policy-result binding, Routine/Bootstrap forwarding, and wrapper redaction in scripts/security/validate-production-plan.test.ps1
- [X] T024 [P] [US2] Add failing Terraform tests for the us-west-2 target, retained NAT/ALB/CloudFront/WAF/RDS/Fargate boundaries, Routine desired count one, 256/512 task inputs, active-feature alarm gating, immutable ECR, ten-release retention, and notification-only $125 Budget in infra/aws/terraform/tests/production_cost_profile.tftest.hcl
- [X] T025 [P] [US2] Update the failing Terraform tests for explicit Single-AZ db.t4g.micro, 20 GiB gp3, encryption, private networking, deletion protection, at least 35 days of point-in-time recovery, final snapshots, and least-privilege access in infra/aws/terraform/tests/production_database_safety.tftest.hcl
- [X] T026 [P] [US2] Add failing Terraform tests for the preserved remote backend identity, KMS encryption, versioning, native lockfile, default workspace, and non-replacement bootstrap outputs in infra/aws/terraform/tests/production_state_safety.tftest.hcl
- [X] T027 [P] [US2] Add a production-shaped Linux image harness that starts with 0.25 vCPU/0.5 GiB, runs migrations, reaches /internal/readiness, and completes retained read fixtures in scripts/deployment/production-shape.test.ps1

### Implementation for User Story 2

- [X] T028 [P] [US2] Define canonical runtime keys, name suffixes, consumers, feature conditions, and persistence compatibility without values in infra/aws/terraform/production-secrets.contract.json
- [X] T029 [P] [US2] Restrict Terraform environment inputs to production and enforce descriptor/tfvars/provider/availability-zone agreement without changing the preserved backend or physical names in infra/aws/terraform/variables.tf, infra/aws/terraform/providers.tf, and infra/aws/terraform/main.tf
- [X] T030 [P] [US2] Implement fixture-rate and live-rate production cost calculation with dated sources, complete recurring-resource mapping, unpriced-resource failure, and redacted JSON evidence in scripts/security/validate-production-cost.mjs
- [X] T031 [P] [US2] Make Single-AZ db.t4g.micro and 20 GiB gp3 explicit while retaining encryption, private subnets, deletion protection, at least 35 days of point-in-time recovery, final snapshots, and access controls in infra/aws/terraform/modules/database/main.tf and infra/aws/terraform/modules/database/variables.tf
- [X] T032 [US2] After T027 passes, configure one always-on 256 CPU/512 MiB x86 API task, deployment capacity limits, immutable commit tags, and bounded ECR lifecycle in infra/aws/terraform/modules/api/main.tf, infra/aws/terraform/modules/api/variables.tf, and infra/aws/terraform/main.tf
- [X] T033 [P] [US2] Gate K-1 worker/queue/workflow alarms on k1_aws_ingestion_enabled while retaining all active API, database, edge, scheduler, security, and budget alarms in infra/aws/terraform/modules/observability/main.tf and infra/aws/terraform/modules/observability/variables.tf
- [X] T034 [P] [US2] Configure a $125 monthly AWS Budget with notification subscribers and zero service actions in infra/aws/terraform/modules/budgets/main.tf and infra/aws/terraform/modules/budgets/variables.tf
- [X] T035 [P] [US2] Preserve the approved S3 backend coordinates while requiring KMS encryption, bucket versioning, native locking, and safe outputs in infra/aws/terraform/bootstrap/main.tf, infra/aws/terraform/bootstrap/variables.tf, and infra/aws/terraform/bootstrap/outputs.tf
- [X] T036 [US2] Consume the secret contract for exact ECS/scheduler/worker secret wiring and least-privilege IAM, move PLAID_ENV to non-secret environment configuration, and retain legacy secret metadata without deletion in infra/aws/terraform/main.tf, infra/aws/terraform/modules/api/main.tf, infra/aws/terraform/modules/scheduler/main.tf, infra/aws/terraform/modules/k1_ingestion/iam.tf, and infra/aws/terraform/modules/secrets/main.tf
- [X] T037 [P] [US2] Complete the PROJECT_JACKSON_SCHEDULER_TOKEN configuration cutover and reject the retired alias in apps/api/src/config.ts, apps/api/src/modules/plaid/plaid.refresh-scheduler.ts, and apps/api/.env.example
- [X] T038 [US2] Implement in-memory Secrets Manager existence, pending-deletion, unique-AWSCURRENT, nonempty-value, VersionId attestation, Apply drift, and total-output-redaction checks in scripts/deployment/production-release.psm1 until T021 passes
- [X] T039 [US2] Implement the release-oriented validator that binds target/backend/source/tfvars/plan hashes and delegates exactly once to the shared policy engine in scripts/security/validate-production-plan.ps1 until T023 passes
- [X] T040 [P] [US2] Reconcile production.tfvars.example to us-west-2, one API task, 256/512 resources, Single-AZ database, at least 35 days of point-in-time recovery, disabled K-1 ingestion baseline, 30-day logs, and $125 notification-only Budget without copying ignored tfvars in infra/aws/terraform/production.tfvars.example
- [X] T041 [US2] Implement common production preflight and non-mutating Plan mode with descriptor, STS, region, workspace, backend, tfvars, tool, policy, secret-wiring, and cost validation in scripts/deploy-to-aws-production.ps1
- [X] T042 [US2] Implement single-use Bootstrap mode with create-only API capacity zero, workers zero, schedules disabled, no web activation, saved-plan hash, dedicated evidence, replay refusal, and BOOTSTRAP PRODUCTION confirmation in scripts/deploy-to-aws-production.ps1
- [X] T043 [US2] Implement Prepare mode to run all gates, validate live secrets, build/push the commit-addressed image, archive/hash the built web output, inventory backward-compatible migrations, save/validate the plan, calculate cost, and write the schema-valid manifest in scripts/deploy-to-aws-production.ps1
- [X] T044 [US2] Implement Apply mode to revalidate every identity/hash/VersionId/cost result, require DEPLOY PRODUCTION confirmation, apply only the saved plan, deploy only prepared artifacts, preserve API desired count one, and append execution evidence in scripts/deploy-to-aws-production.ps1
- [X] T045 [US2] Add deploy:aws:production and production deployment/policy/cost self-test commands while retaining deploy:aws:staging only until User Story 4 removal passes in package.json
- [X] T046 [P] [US2] Reconcile and verify the checksum-pinned RDS CA bundle without changing application behavior outside the release contract in apps/api/Dockerfile
- [X] T047 [P] [US2] Document the retained resources, dated us-west-2 unit prices, $98.02 fixed subtotal, $104 upper estimate, assumptions, $110 target, and $125 notification alert in infra/aws/README.md
- [X] T048 [US2] Run fixture-backed Plan, Bootstrap, Prepare, and Apply flows plus production-shaped capacity and Terraform story tests without AWS mutation and record redacted outcomes in specs/029-local-dev-aws-production/quickstart.md

**Checkpoint**: User Story 2 can prepare and fixture-apply one exact direct-to-production release; no real production apply is authorized.

---

## Phase 5: User Story 3 - Protect and Recover Production (Priority: P2)

**Goal**: Stop failed activation, verify every retained flow, and restore the last known-good compatible API/web artifacts without reversing Terraform state or durable data.

**Independent Test**: Simulate Terraform, ECS, web, authentication, database, scheduler, worker, log/alarm, and each named smoke failure; verify activation stops, the previous compatible API/web checkpoint is selected, data/state remain untouched, and the full smoke suite passes after rollback.

### Tests for User Story 3

- [X] T049 [US3] Add failing deployment fixtures for activation failure, migration incompatibility, corrupted/missing checkpoints, exact rollback confirmation, append-only evidence, API desired count one, and prohibited Terraform/database rewind in scripts/deployment/production-release.test.ps1
- [X] T050 [P] [US3] Add failing read-only smoke fixtures for edge-home/assets, anonymous/authenticated session boundaries, dashboard, saved liquidity, investment aggregation, TIC properties, entities list/detail, logout, prohibited provider/mutation calls, MFA input safety, and body/cookie redaction in scripts/deployment/production-smoke.test.ps1
- [X] T051 [P] [US3] Add failing readiness contract tests for database connectivity, scheduler/worker configuration, logs, alarms, and the named retained-flow result set in apps/api/tests/production-readiness.contract.test.ts
- [X] T052 [P] [US3] Add failing Terraform tests for ECS circuit-breaker rollback, ALB/RDS deletion protection, versioned web recovery, CloudFront/WAF routing, log retention, and rollback-capable immutable artifacts in infra/aws/terraform/tests/production_release_safety.tftest.hcl

### Implementation for User Story 3

- [X] T053 [P] [US3] Enable ECS deployment circuit breaker and automatic rollback while preserving stable desired count one in infra/aws/terraform/modules/api/main.tf
- [X] T054 [P] [US3] Enable private versioned web-artifact recovery and prior-bundle restoration without public S3 access in infra/aws/terraform/modules/edge/main.tf
- [X] T055 [US3] Implement migration compatibility evidence, previous checkpoint validation, artifact-only recovery metadata, and append-only execution records in scripts/deployment/production-release.psm1
- [X] T056 [US3] Implement the ordered production smoke contract with secure in-memory credentials, minimal response-shape checks, prohibited-call enforcement, redacted results, and complete post-rollback rerun in scripts/deployment/production-release.psm1 until T050 passes
- [X] T057 [US3] Implement Rollback mode with identity/checkpoint/schema validation, ROLLBACK PRODUCTION TO confirmation, prior API/web restoration, ECS/CloudFront stability waits, and no Terraform/database rewind in scripts/deploy-to-aws-production.ps1
- [X] T058 [P] [US3] Expose non-secret scheduler/worker/log/alarm readiness while preserving authorization and response redaction in apps/api/src/modules/admin/production-readiness.handler.ts and apps/api/src/modules/admin/admin.routes.ts
- [X] T059 [P] [US3] Document activation-stop behavior, smoke checks, artifact rollback, Single-AZ recovery downtime, the 15-minute RPO and eight-hour RTO, quarterly isolated restore exercises, schema escalation, and state-lock recovery in docs/deployment/aws-liquidity-production-readiness.md and infra/aws/manual-liquidity-deployment.md
- [X] T060 [US3] Run the complete failed-activation and rollback fixture simulation and record only named redacted results in specs/029-local-dev-aws-production/quickstart.md

**Checkpoint**: User Story 3 proves bounded activation and compatible application recovery while preserving database contents and Terraform state.

---

## Phase 6: User Story 4 - Maintain One Unambiguous Environment Model (Priority: P2)

**Goal**: Expose exactly local development and AWS production across active scripts, CI, examples, security gates, and operator documentation.

**Independent Test**: Run topology and smoke-contract governance; verify exactly one active AWS target named production, no active staging/AWS-development entry point/example/parity dependency, complete current-route smoke coverage, and no false failures from historical specifications or retained compatibility identifiers.

### Tests for User Story 4

- [X] T061 [US4] Add failing topology fixtures for staging/development scripts, package commands, Terraform examples/validations, CI references, current runbooks, parity validators, and allowed historical/legacy identifiers in scripts/security/validate-environment-topology.test.mjs
- [X] T062 [P] [US4] Add failing drift fixtures that compare apps/web/src/routeContract.ts with the production smoke contract and require an explicit decision for every retained route in scripts/security/validate-production-smoke-contract.test.mjs

### Implementation for User Story 4

- [X] T063 [US4] Implement active-surface scanning, exact target counts, historical-spec exclusions, compatibility allowlists, and deterministic file/line/rule diagnostics in scripts/security/validate-environment-topology.mjs
- [X] T064 [P] [US4] Implement route-to-smoke coverage validation and prohibited production smoke-method checks in scripts/security/validate-production-smoke-contract.mjs
- [X] T065 [US4] Convert scripts/security/validate-terraform-guardrails.ps1 into a zero-rule compatibility wrapper over production-plan-policy.psm1 and reduce scripts/security/validate-terraform-guardrails.test.ps1 to delegation/exit-code tests
- [X] T066 [US4] After T041-T045 pass, delete scripts/deploy-to-aws-staging.ps1 and remove deploy:aws:staging plus any active AWS-development deployment command from package.json
- [X] T067 [P] [US4] Remove committed staging/development Terraform examples and restore production.tfvars.example as the sole remote example without reading, moving, overwriting, or deleting ignored staging.tfvars, production.tfvars, or state files in infra/aws/terraform/development.tfvars.example, infra/aws/terraform/terraform.tfvars.example, and infra/aws/terraform/production.tfvars.example
- [X] T068 [P] [US4] Make bounded-abuse, destructive, fixture-reset, and real-provider tools refuse production while keeping bounded-abuse execution local-only in scripts/security/run-bounded-abuse-tests.mjs and scripts/security/run-bounded-abuse-tests.test.mjs
- [X] T069 [P] [US4] Rewrite current operational documentation to use local/production terminology and label retained legacy physical identifiers in docs/deployment/environment-strategy.md, infra/aws/README.md, infra/aws/manual-liquidity-deployment.md, and infra/aws/cost-abuse-response-runbook.md
- [X] T070 [US4] Add topology, smoke-contract, shared policy, deployment, cost, Terraform, and current-surface gates to package.json and .github/workflows/security-ci.yml, then record the one-production/zero-staging/zero-AWS-development result in specs/029-local-dev-aws-production/quickstart.md

**Checkpoint**: User Story 4 independently proves that active operational surfaces support only local development and AWS production.

---

## Phase 7: Polish and Cross-Cutting Verification

**Purpose**: Validate the complete repository-only implementation and hand it off without applying production infrastructure.

- [X] T071 [P] Run npm ci, runtime dependency audit, route-policy coverage, API/web builds, API/web tests, current-surface tests, pruning tests, and reachability checks from package.json and record sanitized results in specs/029-local-dev-aws-production/evidence/application-gates.md
- [X] T072 [P] Run terraform fmt -check -recursive, backendless init, validate -no-tests, and all Terraform native tests in infra/aws/terraform/ and record sanitized results in specs/029-local-dev-aws-production/evidence/terraform-gates.md
- [X] T073 [P] Run target/schema, shared policy, wrapper, topology, smoke-contract, cost, secret-preflight, and deployment fixture suites from scripts/deployment/ and scripts/security/ and record sanitized results in specs/029-local-dev-aws-production/evidence/deployment-gates.md
- [X] T074 Run scripts/deployment/production-shape.test.ps1 against the final linux/amd64 image at 0.25 vCPU/0.5 GiB and record migration, readiness, retained-read, and pinned-CA evidence in specs/029-local-dev-aws-production/quickstart.md
- [X] T075 Refresh every us-west-2 public unit price, reconcile every recurring planned resource, require the upper estimate at or below $110, and update specs/029-local-dev-aws-production/contracts/production-cost-model.md plus infra/aws/README.md
- [X] T076 Verify Git tracks no real tfvars, state, saved plan, raw plan JSON, credentials, smoke secrets, or release bundles and record only the sanitized result in specs/029-local-dev-aws-production/quickstart.md
- [X] T077 Exercise Plan and fixture-backed Bootstrap, Prepare, Apply, failed activation, and Rollback end to end without AWS mutation and record exit codes plus named redacted evidence in specs/029-local-dev-aws-production/quickstart.md
- [ ] T078 After feature 028 merges, rebase 029-local-dev-aws-production onto origin/main, rerun T071-T077, and update specs/029-local-dev-aws-production/reconciliation.md without dropping the original infrastructure stash prematurely
- [ ] T079 With operator-supplied production identity/backend inputs, generate and review a speculative plan only, stop on empty state, deletion, replacement, region/backend/name drift, secret/cost failure, or missing safeguards, and record non-sensitive findings in specs/029-local-dev-aws-production/quickstart.md
- [X] T080 Verify every FR-001 through FR-027 and SC-001 through SC-012 has passing repository evidence; record constitution blockers for unique Tony and Robert identities, production MFA, the real K-1 inventory, WISP/incident readiness, and recovery proof; document operator-only follow-up in specs/029-local-dev-aws-production/quickstart.md; and explicitly leave real production Apply outside implementation authorization

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: No dependencies; T001-T003 can start immediately.
- **Phase 2 - Foundation**: Depends on Setup and blocks all production release, policy, and recovery work.
- **Phase 3 - US1**: Depends on Foundation and is the suggested MVP; it does not require another story.
- **Phase 4 - US2**: Depends on Foundation and may proceed alongside US1. T032 requires the production-shape proof from T027.
- **Phase 5 - US3**: Depends on US2 because rollback consumes its manifest, immutable artifacts, CLI, and checkpoint format.
- **Phase 6 - US4**: Governance implementation can start after Foundation; removal tasks T065-T067 wait for the tested US2 replacement path.
- **Phase 7 - Polish**: Depends on all selected stories. T078 also depends on feature 028 merging; T079 depends on operator-supplied production identity/backend inputs.

### User Story Dependency Graph

    Setup -> Foundation -> US1
                        -> US2 -> US3
                        -> US4

    US2 tested replacement -> US4 removal tasks
    US1 + US2 + US3 + US4 -> Cross-cutting verification

### User Story Independence

- **US1 (P1)**: Complete local-only runtime with an independent clean-checkout and refusal test.
- **US2 (P1)**: Exact-plan direct production workflow accepted entirely through fixtures; no real Apply required.
- **US3 (P2)**: Independent failed-activation and artifact-rollback simulation built on US2 release artifacts.
- **US4 (P2)**: Independent topology/smoke governance result; obsolete entry points are removed only after replacements pass.

### Within Each User Story

- Write the listed tests first and confirm they fail for the intended missing behavior.
- Implement contracts/helpers before orchestration.
- Implement non-mutating modes before apply-capable modes.
- Prove target, secret, cost, artifact, and saved-plan evidence before confirmation.
- Complete the independent test before marking the story complete.

## Parallel Opportunities

- T001-T003 can run in parallel.
- T004 and T005 can run in parallel; T007 and T008 can then proceed on separate modules.
- T009-T011 can run in parallel; T012-T013 and T016-T018 can use separate files.
- T021-T027 can run in parallel; T028-T035 and T037 can be split by file ownership after their tests exist.
- T049-T052 can run in parallel; T053-T054 and T058-T059 can be split across infrastructure, API, and documentation.
- T061-T062 can run in parallel; T063-T064 and T067-T069 can run in parallel after prerequisites.
- T071-T073 can run in parallel because they write separate evidence files.

## Parallel Example: User Story 1

    Task T009: Test API environment boundaries in apps/api/tests/environment-boundary.test.ts
    Task T010: Test clean and failing migration startup in apps/api/tests/local-migration-startup.integration.test.ts
    Task T011: Test launcher ordering and production refusal in scripts/dev-local.test.ps1

## Parallel Example: User Story 2

    Task T021: Test live secret preflight in scripts/deployment/production-secret-preflight.test.ps1
    Task T022: Test cost calculation in scripts/security/validate-production-cost.test.mjs
    Task T023: Test plan adapter binding in scripts/security/validate-production-plan.test.ps1
    Task T024: Test the Terraform production cost profile in infra/aws/terraform/tests/production_cost_profile.tftest.hcl
    Task T025: Test database safety in infra/aws/terraform/tests/production_database_safety.tftest.hcl
    Task T026: Test state safety in infra/aws/terraform/tests/production_state_safety.tftest.hcl
    Task T027: Test the production-shaped API in scripts/deployment/production-shape.test.ps1

## Parallel Example: User Story 3

    Task T050: Test read-only retained-flow smoke behavior in scripts/deployment/production-smoke.test.ps1
    Task T051: Test readiness evidence in apps/api/tests/production-readiness.contract.test.ts
    Task T052: Test Terraform release safety in infra/aws/terraform/tests/production_release_safety.tftest.hcl

## Parallel Example: User Story 4

    Task T061: Test environment topology governance in scripts/security/validate-environment-topology.test.mjs
    Task T062: Test route/smoke drift governance in scripts/security/validate-production-smoke-contract.test.mjs

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundation.
2. Add the US1 tests and confirm intended failures.
3. Implement synchronous migrations, readiness gating, deterministic local adapters, and production refusal.
4. Stop and accept the clean local stack independently before production tooling.

### Incremental Delivery

1. **Increment 1**: Local-only development and fail-closed startup (US1).
2. **Increment 2**: Direct production target, cost, secret, immutable artifact, and exact-plan workflow through fixtures (US2).
3. **Increment 3**: Retained-flow verification and artifact-only rollback (US3).
4. **Increment 4**: Remove obsolete staging/development surfaces and enforce governance (US4).
5. **Final verification**: Run all repository gates and, only with operator inputs, review a speculative production plan.

### Safety Boundary

- Completing these tasks does not authorize Terraform Apply, ECS activation, database mutation, web upload, CloudFront invalidation, or any other real production mutation.
- A real production Apply remains a separate operator-approved action using the completed workflow.
- Never read, print, overwrite, move, delete, or commit ignored staging.tfvars, production.tfvars, Terraform state, provider credentials, smoke credentials, or sensitive release artifacts while implementing this list.

## Notes

- [P] tasks use different files and can be worked concurrently only when their stated prerequisites are complete.
- [US1] through [US4] provide direct traceability to the four specification stories.
- Preserve unrelated user changes and reconcile the staged recovery rather than accepting or discarding it wholesale.
- Tests must fail for the intended missing behavior before implementation begins.
- Commit after each task or coherent group; do not auto-commit the current staged recovery with generated planning artifacts.
