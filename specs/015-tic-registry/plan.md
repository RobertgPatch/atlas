# Implementation Plan: TIC Registry Page

**Branch**: `015-tic-registry` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/015-tic-registry/spec.md`

## Summary

Add a new Atlas page at `/tic-registry` and expose it in the side navigation next to Liquidity. Use `tic-registry.html` as the functional reference for registry workflows: properties, TIC interests, underlying owners, acquisition origin, exchange lineage, allocation bars, percentage warnings, and summary counts. Do not copy the standalone local-storage app directly. Rebuild it as an Atlas React feature using the existing AppShell, Tailwind/shared components, React Query patterns, authenticated API calls, and RDS-backed PostgreSQL persistence.

The backend adds a `tic-registry` Fastify module with Zod validation, entity-scoped authorization, Admin-only mutations, and a new `016_tic_registry.sql` migration. Registry data is stored in RDS through the existing `DATABASE_URL` PostgreSQL connection and is never sourced from browser local storage or an in-process memory store. The first version supports nested reads, CRUD for properties/interests/owners, allocation derivations, and exchange source lineage. Import/export workflows are out of scope because durable RDS persistence replaces the HTML backup workaround.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, SQL for PostgreSQL migrations.  
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, existing auth/session/RBAC/scope/audit patterns. Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, TanStack Query 5, lucide-react, existing shared Atlas components.  
**Storage**: AWS RDS PostgreSQL via existing `DATABASE_URL`. Add `tic_properties`, `tic_interests`, and `tic_owners` in `apps/api/src/infra/db/migrations/016_tic_registry.sql`. Browser local storage and API process memory are not supported as TIC Registry sources of truth.  
**Testing**: Vitest API contract/integration tests in `apps/api/tests`; Vitest/Testing Library web tests in `apps/web/src/features/tic-registry`; build checks with `npm run build:api` and `npm run build:web`; targeted tests with `npm run test:api -- tic-registry` and `npm run test:web -- tic-registry`.  
**Target Platform**: Existing Atlas browser app and Fastify API. Local development uses Docker Postgres; staging/production use RDS PostgreSQL behind the API. TIC Registry CRUD requires a configured PostgreSQL connection in every environment.  
**Project Type**: Monorepo web application with backend API, frontend React app, shared TypeScript types, and database migration.  
**Performance Goals**: Initial registry view for 100 properties, 500 TIC interests, and 1,000 owners loads in under 2 seconds under normal staging test conditions. Allocation summaries are derived without client-side N+1 API calls.  
**Constraints**: Reuse existing authenticated session cookies and entity scope middleware; Admin-only create/update/delete unless the authorization model is later expanded; scoped users can only see permitted entity records; percentages allow up to four decimals; dollar values use two-decimal precision; allocation totals are flagged but not required to equal 100%; deletes require confirmation and cascade intentionally.  
**Scale/Scope**: Internal Atlas user base, small-to-medium TIC registry dataset, one page plus API module, no import/export workflows in v1, no new AWS services beyond the existing RDS-backed app infrastructure.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template constitution and does not define enforceable project-specific gates. Applied repository-local gates:

1. **Existing stack and module boundaries**: PASS. Changes stay in the existing Fastify API, React web app, shared type package, and migration directory.
2. **Durable production state**: PASS. Registry records are persisted in PostgreSQL/RDS, not local storage or process memory, with no in-memory fallback for this module.
3. **Authorization and entity scope**: PASS. Reads and writes reuse the existing authenticated request and entity scope pattern; mutations are Admin-only for v1.
4. **UI consistency**: PASS. The standalone HTML is treated as a workflow reference; production UI uses Atlas AppShell, route, spacing, tables/cards, status badges, and form/dialog conventions.
5. **Data integrity**: PASS. Required fields, percentages, currency values, exchange lineage, and dependent delete behavior are validated through API schemas and database constraints.
6. **Testing coverage**: PASS. Contract, integration, and component tests are planned for persistence, scope, allocations, CRUD, and navigation.
7. **Infrastructure restraint**: PASS. No new persistence service is introduced; existing RDS PostgreSQL is extended.

### Post-Phase 1 Re-check

Re-evaluated after `research.md`, `data-model.md`, `contracts/tic-registry.openapi.yaml`, and `quickstart.md`. Result: **PASS**.

- Research resolves storage, scoping, permissions, lineage, precision, UI translation, and import/export scope decisions.
- Data model captures records, validations, cascades, derived allocation fields, and state transitions.
- Contracts define the registry API without exposing implementation-only details to the web app.
- Quickstart includes local RDS-equivalent persistence validation, focused API/web tests, and build checks.

## Project Structure

### Documentation (this feature)

```text
specs/015-tic-registry/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- tic-registry.openapi.yaml
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
apps/api/
|-- src/
|   |-- infra/db/migrations/
|   |   `-- 016_tic_registry.sql
|   |-- modules/tic-registry/
|   |   |-- tic-registry.handler.ts
|   |   |-- tic-registry.repository.ts
|   |   |-- tic-registry.routes.ts
|   |   |-- tic-registry.types.ts
|   |   `-- tic-registry.zod.ts
|   `-- routes/index.ts
`-- tests/
    |-- tic-registry.contract.test.ts
    |-- tic-registry.authz.integration.test.ts
    `-- tic-registry.persistence.integration.test.ts

apps/web/src/
|-- App.tsx
|-- components/shared/AppShell.tsx
|-- pages/TicRegistryPage.tsx
`-- features/tic-registry/
    |-- api/ticRegistryClient.ts
    |-- components/
    |   |-- TicRegistryPageContent.tsx
    |   |-- TicPropertyCard.tsx
    |   |-- TicInterestBlock.tsx
    |   |-- TicOwnerRow.tsx
    |   |-- TicRegistryDialogs.tsx
    |   `-- allocation.ts
    |-- hooks/useTicRegistry.ts
    `-- __tests__/
        |-- TicRegistryPageContent.test.tsx
        |-- allocation.test.ts
        `-- ticRegistryClient.test.ts

packages/types/src/
|-- index.ts
`-- tic-registry.ts
```

**Structure Decision**: Keep TIC Registry as one conventional Atlas feature module. The API owns persistence, validation, scope checks, and derived nested responses. The web app owns presentation, forms, and optimistic/loading/error states. Shared request/response contracts live in `packages/types` so API tests and web client stay aligned.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations are introduced.
