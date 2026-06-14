# Implementation Plan: Consolidated Holdings Report

**Branch**: `012-consolidated-holdings-report` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-consolidated-holdings-report/spec.md`

## Summary

Build a Consolidated Holdings Report in the existing Reports area that lets users connect/select Plaid investment accounts, sync investment holdings, normalize securities, and display one parent row per asset with expandable account/custodian detail rows. The implementation will add a Plaid integration module to the Fastify API, shared holdings report types, report repository endpoints for consolidation/export, and a modern React report surface that can be adapted to the user's pasted design components.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+ runtime, SQL for PostgreSQL-backed deployments
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, `exceljs` 4, official Plaid Node package `plaid` 42.2.0, existing auth/session/RBAC/audit modules. Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, TanStack Query 5, Lucide, `react-plaid-link` 4.1.1.
**Storage**: PostgreSQL migrations for Plaid items/accounts, encrypted token reference or encrypted token column, holdings sync snapshots, source holdings, normalized securities, and optional export audit metadata; in-memory/local fallback only if existing module patterns require it for tests.
**Testing**: Vitest API contract/integration tests in `apps/api/tests`, React Testing Library/jsdom tests in `apps/web/src/features/reports/components`, shared type build checks, export contract tests.
**Target Platform**: Browser-based internal Atlas web app with Fastify API under `/v1`.
**Project Type**: Monorepo web application with backend, frontend, and shared TypeScript types.
**Performance Goals**: Report refresh returns first page under 2 seconds for 1,000 source holdings; consolidation is deterministic and completes under 1 second for 5,000 source holdings in API tests; Plaid Link opens only after a valid link token is ready; CSV/XLSX export completes under 10 seconds for normal operator-sized reports.
**Constraints**: Plaid access tokens never reach the browser; selected accounts scope all holdings retrieval; raw Plaid snapshots remain auditable; parent totals distinguish unknown values from zero; UI must support dozens of accounts and hundreds/thousands of holdings without unreadable nesting or layout shift.
**Scale/Scope**: One report page, Plaid connection/account-selection workflow, holdings sync, consolidation service, CSV/XLSX export, and tests for dozens of custodians/accounts and 1,000+ holdings.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template constitution and does not define enforceable project-specific gates. Applied repository-local conventions from existing specs and code as operational gates:

1. **Existing stack and module boundaries**: PASS. Plan uses existing Fastify, React, shared types, Reports page, auth/session, and audit patterns.
2. **Financial data traceability**: PASS. Raw Plaid sync snapshots are preserved separately from normalized report holdings and exported rows.
3. **Token safety**: PASS. Access tokens are exchanged and stored server-side only; browser receives link tokens and non-secret account/report data.
4. **Report consistency**: PASS. Consolidated holdings live beside existing reports and reuse formatting/export patterns.
5. **Design integration**: PASS. User-provided React components are expected as design reference before implementation of the final UI composition.

### Post-Phase 1 Re-check

Re-evaluated after `research.md`, `data-model.md`, `contracts/consolidated-holdings.openapi.yaml`, and `quickstart.md`. Result: **PASS**.

- Contracts keep all Plaid secret-bearing operations server-side.
- Data model preserves source snapshots, normalized identities, and derived report rows as separate concepts.
- Quickstart validates account selection, duplicate asset rollups, partial sync failures, and export parity.

## Project Structure

### Documentation (this feature)

```text
specs/012-consolidated-holdings-report/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── consolidated-holdings.openapi.yaml
```

### Source Code (repository root)

```text
apps/api/src/
├── config.ts
├── routes/index.ts
└── modules/
    ├── plaid/
    │   ├── plaid.client.ts
    │   ├── plaid.handler.ts
    │   ├── plaid.repository.ts
    │   ├── plaid.routes.ts
    │   └── plaid.zod.ts
    └── reports/
        ├── reports.export.ts
        ├── reports.handler.ts
        ├── reports.repository.ts
        ├── reports.routes.ts
        └── reports.zod.ts

apps/api/src/infra/db/migrations/
└── 012_consolidated_holdings.sql

apps/api/tests/
├── plaid.link.contract.test.ts
├── plaid.holdings-sync.integration.test.ts
├── reports.consolidated-holdings.contract.test.ts
├── reports.consolidated-holdings.rollup.integration.test.ts
└── reports.consolidated-holdings.export.contract.test.ts

apps/web/src/
├── pages/ReportsPage.tsx
└── features/reports/
    ├── api/reportsClient.ts
    ├── components/
    │   ├── ConsolidatedHoldingsReport.tsx
    │   ├── PlaidAccountSelector.tsx
    │   └── ConsolidatedHoldingsReport.test.tsx
    └── hooks/
        ├── useConsolidatedHoldings.ts
        └── usePlaidLink.ts

packages/types/src/
├── reports.ts
└── plaid.ts
```

**Structure Decision**: Extend the existing `reports` module for report read/export surfaces and add a narrow `plaid` API module for token exchange, account selection, and holdings sync. Shared wire types live in `packages/types/src` so API, web, and tests agree on row and account payload shapes.

## Complexity Tracking

No constitution violations or extra projects are introduced. The new Plaid module is justified by a clear integration boundary: it owns external Plaid calls and token/account state, while the reports module owns consolidated report queries and exports.
