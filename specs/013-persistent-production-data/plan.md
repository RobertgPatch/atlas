# Implementation Plan: Persistent Production Data

**Branch**: `013-fixing-database-being-temporary` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-persistent-production-data/spec.md`

## Summary

Make production authentication and Plaid/Liquidity workflows durable across Railway deployments. Railway Postgres is already provisioned and `atlas-api` already receives `DATABASE_URL`; deploy logs show migrations running successfully. The remaining work is to replace process-local auth and Plaid repositories with PostgreSQL-backed implementations, preserve display-safe Plaid account state and holdings snapshots, protect sensitive server-side secrets, and add startup/health diagnostics so production cannot silently run with temporary storage for critical workflows.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+ runtime, SQL for PostgreSQL.
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, `@fastify/cookie`, existing auth/session/RBAC/audit modules, official Plaid Node package `plaid` 42.2.0. Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, TanStack Query 5.
**Storage**: PostgreSQL on Railway via `DATABASE_URL`; existing in-memory stores remain only for local/test fallback where explicitly allowed. Sensitive MFA/Plaid credential material requires server-side protection before persistence.
**Testing**: Vitest API contract/integration tests in `apps/api/tests`; focused web tests only if diagnostics or user-facing persistence warnings change; build checks with `npm run build:api` and `npm run build:web`.
**Target Platform**: Browser-based Atlas web app with Fastify API under `/v1`, deployed as Railway `atlas-api` and `atlas-web` services with Railway Postgres.
**Project Type**: Monorepo web application with backend, frontend, and shared TypeScript types.
**Performance Goals**: Auth session lookup and MFA verification remain effectively instant for users; Plaid account listing returns under 1 second for typical connected-account counts; Liquidity report reloads latest persisted holdings within 5 seconds after deploy.
**Constraints**: No Plaid access tokens, MFA secrets, password hashes, or session tokens may reach browser payloads, exports, or logs; production must not silently fall back to in-memory auth/Plaid state; routine migrations and deploys must not wipe durable user/Plaid state.
**Scale/Scope**: Production persistence for auth users/sessions/MFA, admin user changes, Plaid connections/accounts, selected Liquidity accounts, holdings sync snapshots, source holdings, and persistence diagnostics.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template constitution and does not define enforceable project-specific gates. Applied repository-local conventions and production-safety gates:

1. **Existing stack and module boundaries**: PASS. Plan stays within existing Fastify API, auth, admin, Plaid, reports, migrations, and Railway deployment model.
2. **Durable production state**: PASS. The plan makes Postgres the source of truth for auth/Plaid workflows that currently reset after deploy.
3. **Secret safety**: PASS. Sensitive MFA/Plaid/session material remains server-side and must not appear in browser payloads or logs.
4. **Backward-compatible user flows**: PASS. Existing login, MFA, Plaid Link, account-selection, and Liquidity endpoints keep their external behavior while changing persistence.
5. **Operational visibility**: PASS. Production unsafe-storage states become visible through startup/health diagnostics.

### Post-Phase 1 Re-check

Re-evaluated after `research.md`, `data-model.md`, `contracts/persistent-production-data.openapi.yaml`, and `quickstart.md`. Result: **PASS**.

- Research confirms Railway is configured; current reset behavior is caused by process-local repositories.
- Data model uses existing auth/Plaid tables where possible and adds only the persistence metadata needed to close gaps.
- Contracts keep secrets out of responses while preserving current auth/Plaid endpoint shapes.
- Quickstart includes a redeploy validation path proving data survives service replacement.

## Project Structure

### Documentation (this feature)

```text
specs/013-persistent-production-data/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- persistent-production-data.openapi.yaml
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
apps/api/src/
|-- app.ts
|-- config.ts
|-- infra/db/
|   |-- client.ts
|   `-- migrations/
|       |-- 000_base_schema.sql
|       |-- 001_auth_access.sql
|       `-- 013_persistent_production_data.sql
`-- modules/
    |-- auth/
    |   |-- auth.repository.ts
    |   |-- login.handler.ts
    |   |-- mfa-enroll-complete.handler.ts
    |   |-- mfa-verify.handler.ts
    |   |-- session.handler.ts
    |   `-- session.middleware.ts
    |-- admin/
    |   |-- admin.handlers.ts
    |   `-- user-admin.repository.ts
    |-- plaid/
    |   |-- plaid.repository.ts
    |   |-- plaid.handler.ts
    |   `-- plaid.holdings-sync.ts
    |-- reports/
    |   |-- consolidatedHoldings.service.ts
    |   `-- reports.repository.ts
    `-- health/
        |-- persistence.handler.ts
        `-- persistence.routes.ts

apps/api/tests/
|-- auth.persistence.integration.test.ts
|-- auth.session.persistence.integration.test.ts
|-- plaid.persistence.integration.test.ts
|-- reports.consolidated-holdings.persistence.integration.test.ts
`-- production-persistence.guard.contract.test.ts
```

**Structure Decision**: Keep one API service and one web app. Persistence changes belong in existing API repositories and migrations; no new service or database project is introduced. A small health/diagnostics module may be added only to expose production persistence status cleanly.

## Complexity Tracking

No constitution violations or extra deployable projects are introduced. The work is cross-module because the bug spans auth, admin, Plaid, reports, and deployment diagnostics, but each change follows an existing module boundary.
