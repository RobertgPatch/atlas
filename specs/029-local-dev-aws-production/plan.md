# Implementation Plan: Local Development to AWS Production

**Branch**: `029-local-dev-aws-production` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-local-dev-aws-production/spec.md`

## Summary

Replace the active AWS staging/development topology with two supported runtime classes: deterministic local development and one always-available AWS production environment. Preserve the existing managed production architecture and the last committed `us-west-2` target, but right-size the single-user workload, explicitly configure Single-AZ RDS, set a notification-only $125 AWS Budget, and prove the documented recurring estimate is at most $110 before any production apply.

The deployment path becomes an operator-run, production-only Plan/Bootstrap/Prepare/Apply/Rollback workflow. It binds a clean source commit, a committed production-target descriptor, an immutable API image, a hashed web bundle, a saved Terraform plan, live secret-version attestation, migration compatibility evidence, an exact confirmation phrase, and read-only retained-flow smoke checks. Bootstrap may hold application capacity at zero only before the first activation; routine production remains at one always-on API task and one always-on RDS instance.

## Technical Context

**Language/Version**: Node.js 22; API TypeScript 5.7/ES2022/NodeNext; web TypeScript 6.0; PowerShell 7-compatible deployment and policy tooling; Terraform 1.11.4 in CI (`>=1.11` constraint)

**Primary Dependencies**: Fastify 5.12, React 19.2, React Router 7.18, Vite 8.2, PostgreSQL client 8.23, Zod 3.25, AWS SDK v3, AWS provider `>=5.82,<6`, AWSCC `~>1.92`

**Storage**: Local PostgreSQL 16; production private encrypted Single-AZ RDS PostgreSQL `db.t4g.micro` with at least 35 days of point-in-time recovery; encrypted versioned S3 backend/web/K-1 buckets; isolated encrypted recovery copies; immutable ECR images; ignored local release bundles

**Testing**: Vitest 4.1, Node test runner, PowerShell fixture tests, Terraform native tests, Docker Linux image build, route/current-surface governance, read-only deployment simulations

**Target Platform**: Windows/PowerShell plus Docker for local development; Linux `amd64` ECS/Fargate behind ALB, CloudFront, and WAF for AWS production in committed target region `us-west-2`

**Project Type**: npm-workspaces web application with Fastify API, React/Vite web client, shared TypeScript packages, Terraform infrastructure, and operator deployment tooling

**Performance Goals**: One continuously available API task at 0.25 vCPU/0.5 GiB only after production-shaped validation; retained read flows remain usable for one concurrent interactive user; ECS reaches steady state and every required smoke check completes within documented deployment timeouts

**Constraints**: No AWS staging/development environment; no scheduled shutdown or scale-to-zero in normal production; retain private RDS, Fargate, ALB, NAT, CloudFront, and WAF; estimated recurring cost `<= $110/month` for the declared workload; $125 notification-only budget; 15-minute RPO; eight-hour RTO; quarterly isolated restore evidence; unique physical-person production identities and MFA; no unrelated tenant until isolation is proven; no silent region/backend/name migration; no committed secrets, Restricted data, tfvars, state, plans, or raw plan JSON
**Scale/Scope**: One human user, one concurrent browser session, at most 10,000 application requests/month, 20 GiB initial database storage, no more than 1 GiB/month through NAT, 1 GiB/month of logs, 2 GiB ECR, 5 GiB S3, one daily Plaid refresh and weekday market-close scheduling totaling under five Fargate task-hours/month, K-1 AWS ingestion disabled, and no paid BDA/Bedrock calls in the baseline

## Constitution Check

*GATE: Evaluated before Phase 0 research and re-checked after Phase 1 design.*

- **Security and privacy**: **CONDITIONAL PASS**. The target retains private encrypted RDS, KMS-encrypted private S3, secret preflight, redaction, WAF, immutable artifacts, and fail-closed deployment. A real Apply is blocked until the approximately five real K-1 OCR documents are inventoried and the WISP, incident procedure, and provider handling are evidenced.
- **Identity and least privilege**: **FAIL FOR REAL APPLY**. The release tooling preserves least-privilege infrastructure controls, but the shared admin login and disabled production MFA violate Principle II. Implementation and fixture-only work may continue; production use of Restricted data may not continue until Tony Patch has a unique MFA-protected account and Robert Patch has a separate operator identity.
- **Financial integrity and audit**: **PASS FOR FEATURE SCOPE**. This feature does not change authoritative financial calculations. It binds releases and migrations to append-only evidence and uses read-only retained-flow smoke checks.
- **Architecture and scale**: **PASS**. The design retains the smallest managed single-tenant production architecture, documents its one-user capacity, and adds no claim of shared multi-tenancy. Any unrelated-tenant onboarding remains a separate ADR, threat-model, isolation-test, and legal-review gate.
- **Verification and recovery**: **CONDITIONAL PASS**. Production-shaped, policy, migration, smoke, rollback, and protected-resource tests are designed. The prior seven-day backup requirement is superseded by at least 35 days of point-in-time recovery, a 15-minute RPO, an eight-hour RTO, isolated recovery copies, and quarterly restore evidence. T025, T031, T040, T059, and T080 carry the reconciliation.
- **Legal and incident readiness**: **FAIL FOR REAL APPLY**. The constitution requires an applicability register, WISP, incident response, breach-decision procedure, and service-provider inventory. These are operator prerequisites, not permission to infer legal compliance.

Post-design re-check: the architecture remains compatible with the ratified principles, but the named identity, MFA, Restricted-data inventory, incident-readiness, and recovery evidence are explicit activation blockers. No complexity justification can waive them. The plan may produce and test artifacts without AWS mutation; a real production Apply remains separately operator-authorized and constitution-gated.

## Cost Feasibility Gate

Cost feasibility is a design gate, not a post-implementation aspiration. The implementation must maintain `contracts/production-cost-model.md` as an executable or machine-verifiable estimate using the committed production region, 730 hours/month, the declared workload above, current public on-demand prices captured with retrieval date and source, and every recurring resource from the Terraform plan.

In canonical `us-west-2`, the current 0.5 vCPU/1 GiB shape is approximately $108.43 fixed and $109-$113 expected, so it can exceed the target. The primary candidate is one 0.25 vCPU/0.5 GiB x86 Fargate API task, one Single-AZ `db.t4g.micro` RDS instance with 20 GiB gp3, one ALB, one NAT gateway, one public IPv4 address, CloudFront PriceClass_100, WAF, required secrets, active-feature alarms, low-volume CloudWatch/S3/ECR/Route 53 usage, and 30-day API/WAF log retention. That candidate was approximately $98.02 fixed and $100-$104 expected before constitution ratification, so it showed useful headroom. ARM64 remains an optional later optimization, not a requirement or a prerequisite commitment.

T075 MUST refresh the model with 35-day point-in-time recovery, isolated recovery copies, restore-test operations, identity/MFA controls, and any new monitoring. The prior estimate is not release evidence until that refreshed all-in upper estimate passes or Robert Patch records an architecture/cost decision that preserves every non-negotiable safeguard.

Before Terraform right-sizing is accepted, a production-shaped Linux container must start, run all migrations, pass `/internal/readiness`, and complete retained-flow tests under the proposed 0.25 vCPU/0.5 GiB limits. If either capacity validation or the all-in estimate fails, implementation must stop for an explicit architecture/cost decision; it must not weaken the retained managed boundaries or pretend the $125 alert is a cap.

## Design Decisions

### Canonical production target

- Add a committed, non-secret `infra/aws/production-target.json` validated by `contracts/production-target.schema.json`.
- The descriptor fixes `environment=production`, `awsRegion=us-west-2`, `terraformWorkspace=default`, and the distinct CloudFront certificate region `us-east-1`.
- Account ID and backend coordinates remain operator-supplied/ignored because they are account-specific. Plan, Prepare, Apply, Bootstrap, and Rollback require the descriptor, ignored `production.tfvars`, backend configuration, requested assertion, and resulting plan to agree.
- Bind the descriptor SHA-256 into each prepared release. A target change invalidates the release and requires a separately reviewed migration when it affects region, backend, state, or physical resources.

### Local migrations and readiness

- Change `dev:local` to stub/local adapters and local object storage by default.
- Run database migrations synchronously before starting the worker or web client; keep API/worker migration calls idempotent under the existing PostgreSQL advisory lock.
- Treat migration failure, database failure, or `/internal/readiness` timeout as fatal. Do not downgrade these failures to a warning and continue opening the web application.
- Test a clean PostgreSQL volume, repeated startup, unavailable database, and a fixture migration failure without contacting AWS.

### Production policy ownership

- Create one authoritative `scripts/security/production-plan-policy.psm1` engine for plan parsing, action classification, protected resources, absolute controls, capacity mode, and redacted results.
- `validate-production-plan.ps1` is the release-oriented adapter. The existing `validate-terraform-guardrails.ps1` becomes a thin compatibility wrapper or is removed after callers migrate; it owns no duplicate rules.
- Policy mode is explicit: `Routine` requires API desired count exactly one; `Bootstrap` permits zero only for a create-only, never-before-activated stack.

### Live secret preflight

- A committed non-secret requirement matrix defines each runtime key, canonical Secrets Manager name suffix, consumers, and condition. Non-secret `PLAID_ENV` moves to normal ECS environment configuration.
- Terraform policy proves correct ECS/IAM wiring and absence from plaintext environment values.
- Prepare and Apply separately verify the live canonical secret, account/region, non-deleted state, exactly one `AWSCURRENT` version, nonempty value, and accessible VersionId in memory without logging any value or raw provider response.
- Apply requires the same VersionId attested by Prepare. Version drift invalidates the release and requires preparation again.

### Retained-flow verification

- Production smoke checks are read-only and use saved data only. They cover CloudFront homepage/assets, anonymous and authenticated session boundaries, dashboard, liquidity, investment tracker, TIC registry, entities list/detail, and logout.
- The contract derives from `apps/web/src/routeContract.ts` and representative API reads in `contracts/production-smoke-checks.md`; route-contract changes must update the smoke contract or fail governance.
- Smoke checks never use liquidity refresh, provider mutation, destructive routes, fixture reset, or production load/abuse tests.

## Project Structure

### Documentation (this feature)

```text
specs/029-local-dev-aws-production/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- environment-contract.md
|   |-- production-cost-model.md
|   |-- production-deployment-cli.md
|   |-- production-plan-policy.md
|   |-- production-release-manifest.schema.json
|   |-- production-secret-preflight.md
|   |-- production-smoke-checks.md
|   `-- production-target.schema.json
`-- tasks.md                         # regenerated later by /speckit.tasks
```

### Source Code (repository root)

```text
apps/
|-- api/
|   |-- src/
|   |   |-- config.ts
|   |   |-- server.ts
|   |   |-- infra/db/{migrate.ts,migrations/*.sql}
|   |   `-- modules/
|   `-- tests/
`-- web/
    |-- src/{routeContract.ts,auth/,features/,pages/}
    `-- tests/

packages/types/src/

scripts/
|-- dev-local.ps1
|-- deployment/
|   |-- production-release.psm1
|   `-- production-release.test.ps1
|-- deploy-to-aws-production.ps1
`-- security/
    |-- production-plan-policy.psm1
    |-- production-plan-policy.test.ps1
    |-- validate-production-plan.ps1
    |-- validate-terraform-guardrails.ps1
    `-- validate-environment-topology.mjs

infra/aws/
|-- production-target.json
`-- terraform/
    |-- bootstrap/
    |-- modules/{api,budgets,database,edge,k1_ingestion,network,observability,scheduler,secrets,security}/
    |-- tests/*.tftest.hcl
    |-- production-secrets.contract.json
    |-- production.tfvars.example
    |-- main.tf
    |-- outputs.tf
    |-- providers.tf
    `-- variables.tf

.github/workflows/security-ci.yml
docs/deployment/
docker-compose.dev.yml
```

**Structure Decision**: Keep the existing npm-workspaces and Terraform module structure. Add deployment helpers under `scripts/deployment`, place the single policy engine under `scripts/security`, and use committed non-secret JSON contracts for production target and runtime secret topology. No new runtime service or application database entity is introduced.

## Implementation Sequence

1. Reconcile the staged recovered infrastructure changes. Preserve safe scheduler-token, CA-bundle, conditional-resource, and metadata changes; exclude the AWS development example, `us-west-1` move, backend rename, and replacement-triggering physical renames. Do not inspect or alter ignored tfvars/state.
2. Add target, cost, secret, manifest, smoke, redaction, hashing, and policy contracts with fixture validation. Establish one production plan-policy engine before adding CLI wrappers.
3. Make local startup deterministic and fail closed around synchronous migrations and internal readiness. Prove clean and failing local database cases.
4. Add production Terraform invariant and cost tests before right-sizing implementation. Explicitly configure Single-AZ RDS, at least 35 days of point-in-time recovery, isolated recovery copies, and normal API desired count one; validate 0.25 vCPU/0.5 GiB and the 15-minute RPO/eight-hour RTO before adopting the profile.
5. Implement production Plan/Bootstrap/Prepare/Apply around the exact saved plan, target descriptor, immutable artifacts, and live secret attestation. Bootstrap is single-use and create-only.
6. Add rollback checkpoints and the read-only retained-flow smoke suite; make failed activation stop and select the previous compatible application artifacts.
7. After the production path is fixture-tested, remove active staging/development commands, examples, and current operational references. Historical specifications remain untouched.
8. Run all application, topology, policy, Terraform, Docker, migration, manifest, cost, and smoke-contract gates. After feature 028 merges, rebase on `origin/main`, rerun validation, and generate a real speculative production plan. AWS apply remains a separate operator-authorized action.

## Verification Strategy

- Repository: clean install, runtime dependency audit, API/web builds and tests, current-surface and reachability gates, topology governance, manifest/schema tests, deployment fixture tests, and redaction negative tests.
- Local runtime: reset local PostgreSQL, synchronous migration success, `/internal/readiness`, retained browser/API reads, repeated idempotent startup, and fail-closed database/migration fixtures.
- Terraform: formatting, backend-free initialization, validation, native tests, cost-envelope validation, plan-policy fixtures, 35-day point-in-time recovery policy, isolated restore evidence, and a real speculative plan only with operator-supplied production identity.
- Runtime shape: build the Linux `amd64` API image and exercise startup/migrations/retained reads at the proposed CPU/memory limits.
- Production release: fixture-only simulations for wrong target/account/backend/hash/version, secret version drift, bootstrap replay, protected replacement, confirmation mismatch, smoke failure, and compatible/incompatible rollback.

## Complexity Tracking

No constitution violation is accepted or justified. Single-AZ RDS is permitted only while measured restore evidence meets the ratified RPO/RTO and the workload remains the documented single-tenant profile. The additional release artifacts and policy module are required by the direct-to-production safety contract and consolidate currently duplicated validation. The identity, MFA, incident-readiness, data-inventory, and recovery blockers must be resolved rather than entered here as complexity exceptions.
