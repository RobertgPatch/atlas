# Implementation Plan: Plaid Refresh Policy

**Branch**: `codex/014-write-liquidity-page-prompt` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/014-plaid-refresh-policy/spec.md`

## Summary

Make the Liquidity page read from durable Plaid holdings snapshots instead of treating Plaid as part of the normal dashboard read path, and prepare the smallest production-capable AWS deployment needed to run Liquidity safely. Plaid API calls happen only through explicit refresh flows: an automatic daily refresh at 5:00 AM `America/Los_Angeles`, authorized manual refresh, or an operator-approved fallback when scheduling is unavailable. Each refresh is saved as a dated PostgreSQL snapshot before it is reported as successful, and older snapshots are retained for future historical trend reporting.

The AWS baseline deploys only the services required for Liquidity plus the auth/admin flows needed to access and operate it. The deployment starts as a manual AWS console learning path and produces equivalent Terraform for comparison and later codification. The plan now supports two AWS environments: `staging` and `production`. Staging is created first, mirrors production topology and security boundaries, and uses cheaper non-production sizing, shorter retention, sandbox Plaid credentials, and lower budgets where those reductions do not weaken production parity. The chosen AWS shape for each environment is S3-hosted web assets behind CloudFront, `/v1/*` routed through the same CloudFront distribution to an ECS Express Mode/Fargate API origin, private RDS PostgreSQL, Secrets Manager, EventBridge Scheduler, CloudWatch, AWS WAF, Route 53/ACM, AWS Budgets, and least-privilege IAM. Redis is not part of the initial design because PostgreSQL snapshots, database locks, client query reuse, and edge caching for static assets satisfy the expected 5-10 user scale.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+ runtime, SQL for PostgreSQL, Docker container image for the API, Terraform for generated comparison infrastructure.  
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, official Plaid Node package `plaid` 42.2.0, existing auth/RBAC/audit/report modules. Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, TanStack Query 5. AWS: S3, CloudFront, ECS Express Mode/Fargate, ECR, RDS PostgreSQL, Secrets Manager, EventBridge Scheduler, CloudWatch, AWS WAF, Route 53, ACM, AWS Budgets, IAM.  
**Storage**: PostgreSQL via `DATABASE_URL` remains the application source of truth. Extend existing `plaid_connections`, `plaid_investment_accounts`, `holdings_sync_snapshots`, and `source_holdings`; add a small refresh-policy table if runtime configurability is needed. S3 stores static web build artifacts only in the initial Liquidity deployment. K-1 PDF persistence is out of initial scope unless required by auth/admin/Liquidity. No Redis for v1.  
**Testing**: Vitest API contract/integration tests in `apps/api/tests`; focused web tests for freshness/status display in `apps/web/src/features/reports/components`; build checks with `npm run build:api` and `npm run build:web`; AWS deployment validation through staging-first manual runbook, health checks, CloudWatch logs/alarms, WAF test requests, budget-alert confirmation, and separate staging/production Terraform plan comparison.
**Target Platform**: Browser-based Atlas web app served from one public AWS app domain per environment, for example `staging.example.com` and `app.example.com`. CloudFront default behavior serves static web assets; `/v1/*` forwards to the API origin. API runs on ECS Express Mode/Fargate and reaches private RDS PostgreSQL. Automatic refresh uses EventBridge Scheduler.
**Project Type**: Monorepo web application with backend, frontend, shared TypeScript types, deployment runbook, Docker image, and Terraform comparison artifacts.  
**Performance Goals**: Liquidity read path returns persisted data without Plaid network calls; 95% of fresh-snapshot page loads complete under 2 seconds for the expected 5-10 user audience; static web assets are edge cached; authenticated `/v1/*` financial API responses are not placed in shared CDN cache; scheduled refresh completes within Plaid/API limits for selected accounts.  
**Constraints**: No Plaid access tokens or sensitive data in browser payloads, exports, diagnostics, logs, committed environment files, Terraform state outputs, or CloudFront cache. Refresh must not delete historical source holdings. Production must make missing scheduler infrastructure visible. Duplicate refreshes for the same selected account set must be prevented. First AWS deploy requires API/repository access scoping before launch; PostgreSQL RLS is a hardening follow-up, not a first-launch blocker. Staging must not reuse production databases, Plaid production credentials, scheduler tokens, admin bootstrap credentials, or Secrets Manager entries.
**Scale/Scope**: Small internal user base, daily refresh cadence, selected Plaid investment accounts, latest dashboard snapshot, manual refresh, refresh diagnostics, manual AWS deployment runbook, Terraform comparison, staging and production logging/alarms/budgets/security controls, and retention of historical dated snapshots for later trend views.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template constitution and does not define enforceable project-specific gates. Applied repository-local gates:

1. **Existing stack and module boundaries**: PASS. Application changes stay in existing Plaid, reports, admin/diagnostics, migrations, and Liquidity web modules; deployment changes are isolated to Docker, AWS runbook, and Terraform comparison artifacts.
2. **Durable production state**: PASS. Dashboard reads use PostgreSQL snapshots, not process memory or third-party live reads; RDS is private and reachable only from the API security group.
3. **Secret safety**: PASS. Plaid access tokens, session secrets, persistence encryption keys, scheduler tokens, and database credentials are stored in environment-isolated Secrets Manager entries or injected runtime secrets, not committed `.env` files.
4. **Backward-compatible user flow**: PASS. Users still open Liquidity and can manually refresh; the refresh rules only change when Plaid is called.
5. **Operational visibility**: PASS. CloudWatch logs/alarms, health checks, refresh diagnostics, budget alerts, WAF logging, and scheduler status are part of both the staging and production baselines.
6. **Infrastructure restraint**: PASS. Redis is rejected for v1. AWS scope is limited to Liquidity plus auth/admin basics, with K-1 PDF storage deferred.
7. **Security baseline**: PASS with planned hardening. First launch requires API/repository scoping, WAF/rate limiting, secure cookies, CSRF/XSS/SQL injection controls, least-privilege IAM, and secret rotation policy. PostgreSQL RLS is tracked as a post-launch hardening phase.

### Post-Phase 1 Re-check

Re-evaluated after refreshed `research.md`, `data-model.md`, `contracts/plaid-refresh-policy.openapi.yaml`, and `quickstart.md`. Result: **PASS**.

- Research resolves AWS service choices with current official AWS documentation.
- Data model covers refresh policy, historical snapshots, staging/production deployment environments, production security controls, and Terraform comparison.
- Contracts expose the read path, manual refresh, scheduler trigger, refresh diagnostics, and production-readiness diagnostics without secrets.
- Quickstart includes local validation, staging-first AWS manual deployment, Terraform comparison, security validation, budget/logging checks, and scheduler validation.

## Project Structure

### Documentation (this feature)

```text
specs/014-plaid-refresh-policy/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- tasks.md
|-- contracts/
|   `-- plaid-refresh-policy.openapi.yaml
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
apps/api/
|-- Dockerfile
|-- src/
|   |-- config.ts
|   |-- infra/db/migrations/
|   |   `-- 015_plaid_refresh_policy.sql
|   |-- modules/admin/
|   |   |-- admin.routes.ts
|   |   |-- plaid-refresh-status.handler.ts
|   |   `-- production-readiness.handler.ts
|   |-- modules/plaid/
|   |   |-- plaid.holdings-sync.ts
|   |   |-- plaid.refresh-policy.ts
|   |   |-- plaid.refresh-scheduler.ts
|   |   `-- plaid.repository.ts
|   |-- modules/reports/
|   |   |-- consolidatedHoldings.service.ts
|   |   |-- reports.handler.ts
|   |   |-- reports.repository.ts
|   |   |-- reports.routes.ts
|   |   `-- reports.zod.ts
|   `-- server.ts

apps/api/tests/
|-- plaid.refresh-policy.contract.test.ts
|-- plaid.refresh-policy.integration.test.ts
|-- reports.consolidated-holdings.freshness.contract.test.ts
|-- reports.consolidated-holdings.history.integration.test.ts
`-- production-readiness.contract.test.ts

apps/web/src/features/reports/
|-- api/reportsClient.ts
|-- components/
|   |-- ConsolidatedHoldingsReport.test.tsx
|   `-- ConsolidatedHoldingsSyncStatus.tsx
`-- hooks/useConsolidatedHoldings.ts

packages/types/src/
|-- plaid.ts
`-- reports.ts

infra/aws/
|-- README.md
|-- manual-liquidity-deployment.md
`-- terraform/
    |-- main.tf
    |-- variables.tf
    |-- outputs.tf
    |-- staging.tfvars.example
    |-- production.tfvars.example
    |-- versions.tf
    `-- modules/

docs/deployment/
`-- aws-liquidity-production-readiness.md
```

**Structure Decision**: Keep one API service and one static web app per AWS environment. Use S3 + CloudFront for the web/app edge because the selected single-domain-per-environment model requires `/v1/*` path routing to the API and static asset caching at the edge. Use ECS Express Mode/Fargate for the API because App Runner is not open to new customers and ECS Express Mode provisions the simpler managed service envelope around Fargate. Use RDS PostgreSQL for durable data, Secrets Manager for runtime secrets, EventBridge Scheduler for the 5:00 AM refresh, CloudWatch for logs/alarms, WAF for managed rules/rate limiting, Route 53/ACM for DNS/TLS, and AWS Budgets for cost alerts. Terraform remains one reusable root stack parameterized by environment-specific tfvars rather than duplicated staging and production code.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| One scheduler trigger for production automatic refresh | A 5:00 AM refresh must run even if no user opens the app | Lazy refresh on page view is simpler but does not satisfy a true scheduled 5:00 AM refresh |
| AWS deployment artifacts in this feature | The user wants the Liquidity feature deployed to AWS with manual setup and equivalent Terraform | Keeping deployment out of scope would leave the clarified production requirements unplanned |
| Production security controls before first launch | Financial/auth/Plaid data requires safe defaults for secrets, abuse protection, logging, and budgets | A minimal "just make it run" cloud deploy would create avoidable security and cost risk |
| Two AWS environments | Staging must validate the same AWS shape before production while remaining cheaper where possible | Railway or a generic hosting preview would not exercise CloudFront, WAF, RDS private networking, EventBridge Scheduler, IAM, Secrets Manager, or Terraform parity |
