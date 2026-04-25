# Implementation Plan: Reports Phased Delivery

**Branch**: `011-reports-phased-delivery` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-reports/spec.md`

## Summary

Deliver Feature 006 reports in three implementation phases in the requested order: Portfolio Summary first, Asset Class Summary second, and Activity Detail plus export completion last. The design introduces a dedicated reports read module in the API, a reports feature surface in the web app that reuses Atlas table and filter patterns, and a phased write path for inline edits with single-step undo and auditability. Phase 1 ships an end-to-end Portfolio Summary screen (including KPI strip, dense table states, inline original-commitment edits where eligible, and Phase 3 export availability messaging), Phase 2 adds grouped Asset Class Summary with the same filter and totals grammar, and Phase 3 completes Activity Detail depth and CSV/XLSX export across all three report views.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22 LTS runtime, SQL for PostgreSQL 15+  
**Primary Dependencies**:  
- API: Fastify 5, Zod 3, `pg` 8, existing auth/session middlewares, existing audit repository  
- Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, Framer Motion 12, `@tanstack/react-query` 5, Lucide  
- Testing: Vitest 2, React Testing Library + jsdom  
- Export implementation target: CSV streaming in API plus XLSX generation via a server-side workbook library (`xlsx` or `exceljs`, selected during implementation)  
**Storage**: PostgreSQL (`partnership_annual_activity`, `partnership_commitments`, `capital_activity_events`, `partnerships`, `entities`, `audit_events`) plus in-memory fallback parity for local no-DB mode  
**Testing**: API contract and integration tests in `apps/api/tests`, web unit and interaction tests in `apps/web/src/**/__tests__` and component-level test files  
**Target Platform**: Browser-based internal web app with Fastify API under `/v1`  
**Project Type**: Monorepo web application (frontend + backend + shared types)  
**Performance Goals**:  
- Portfolio Summary initial load under 1.5 s for typical scoped tenants  
- Inline edit round-trip plus visible save feedback under 750 ms p95  
- Asset Class Summary load under 1.5 s using same filter set  
- Activity Detail filter refresh under 2.0 s for 5k scoped rows  
- Phase 3 export generation under 10 s for normal operator-sized extracts  
**Constraints**:  
- Must follow `specs/000-constitution.md` data hierarchy rules (parsed/manual/calculated traceability)  
- Must follow `specs/001-ui-constitution.md` shared component and no-new-framework requirements  
- Must keep reports consistent with existing commitment/capital/FMV definitions introduced by Features 004/009/010  
- Must support Admin/User role visibility in a single UI system (no separate app shells)  
- Phase order is fixed: Portfolio Summary, then Asset Class Summary, then Activity Detail and full exports  
**Scale/Scope**: Single-tenant deployments, 100-2k entities in scope, 100-5k report rows depending on filters, three report screens plus shared toolbar/formatting behavior

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution sources used for gating:

- `specs/000-constitution.md` (system constitution, data hierarchy, activity detail invariants, editing/undo/audit requirements)
- `specs/001-ui-constitution.md` (UI stack, shared patterns, table and editing rules)
- `.specify/memory/constitution.md` is a placeholder template and is not independently enforceable

### Pre-Phase 0 gate

1. **Data source hierarchy and traceability**: PASS
  - Report values are explicitly modeled as parsed/manual/calculated. Inline edits are manual inputs and are audit logged.
2. **Activity detail row invariants**: PASS
  - Activity rows remain keyed by `(entity_id, partnership_id, tax_year)` and continue to sync from finalization and capital/FMV triggers.
3. **Inline edit and undo integrity**: PASS
  - Plan preserves immediate save feedback, single-step undo, and audit events for report edits.
4. **UI constitution compliance**: PASS
  - Reports reuse shared page header, filter toolbar, data table patterns, and avoid introducing a second UI framework.
5. **Role-based action visibility**: PASS
  - Admin write actions are gated; User role remains read-only for report edits and export privileges as policy dictates.

### Post-Phase 1 re-check

Re-evaluated after writing `research.md`, `data-model.md`, `contracts/reports.openapi.yaml`, and `quickstart.md`. Result: **PASS**.

- Design artifacts preserve parsed/manual/calculated separation and do not introduce unaudited mutation paths.
- API contracts keep report interfaces under authenticated, scoped `/v1` endpoints and do not bypass RBAC.
- Quickstart validation explicitly checks loading/empty/error/editing/undo states and role gating.

## Project Structure

### Documentation (this feature)

```text
specs/006-reports/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── reports.openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md              # Created later by /speckit.tasks
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/
│       ├── routes/
│       │   └── index.ts                              # registerReportsRoutes
│       ├── modules/
│       │   ├── reports/
│       │   │   ├── reports.routes.ts
│       │   │   ├── reports.handler.ts
│       │   │   ├── reports.repository.ts
│       │   │   ├── reports.export.ts
│       │   │   └── reports.zod.ts
│       │   ├── partnerships/
│       │   │   └── capital.repository.ts            # reused for commitment and activity detail source logic
│       │   ├── review/
│       │   │   └── approve.handler.ts               # continue activity sync triggers
│       │   └── audit/
│       │       └── audit.events.ts                  # report edit and undo events
│       └── tests/
│           ├── reports.portfolio-summary.contract.test.ts
│           ├── reports.asset-class-summary.contract.test.ts
│           ├── reports.activity-detail.contract.test.ts
│           ├── reports.inline-edit.integration.test.ts
│           └── reports.export.contract.test.ts
└── web/
   └── src/
      ├── pages/
      │   └── ReportsPage.tsx                        # route shell and report switching
      ├── features/
      │   └── reports/
      │       ├── api/
      │       │   └── reportsClient.ts
      │       ├── hooks/
      │       │   ├── usePortfolioSummary.ts
      │       │   ├── useAssetClassSummary.ts
      │       │   ├── useActivityDetail.ts
      │       │   └── useReportMutations.ts
      │       └── components/
      │           ├── PortfolioSummaryReport.tsx
      │           ├── AssetClassSummaryReport.tsx
      │           ├── ActivityDetailReport.tsx
      │           ├── EditableCell.tsx
      │           └── TotalsRow.tsx
      ├── components/
      │   ├── PageHeader.tsx
      │   ├── FilterToolbar.tsx
      │   └── DataTable.tsx                          # reused table pattern
      └── App.tsx                                    # replace /reports placeholder route

packages/
└── types/
   └── src/
      ├── reports.ts                                 # new report contract shapes
      └── index.ts                                   # export report types
```

**Structure Decision**: Use a dedicated `modules/reports` backend vertical and `features/reports` frontend vertical, while reusing shared UI and existing partnership/review compute primitives. This keeps report-specific read models cohesive, preserves existing partnership modules for write semantics, and allows phase-by-phase delivery without destabilizing current dashboard and partnership detail routes.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| - | - | - |

## Phase Outputs

- **Phase 0 (research)**: [research.md](./research.md) - records decisions for report API boundaries, edit/undo semantics, filter model, export strategy, and activity-detail data sourcing.
- **Phase 1 (design + contracts)**:
  - [data-model.md](./data-model.md) - defines report rows, filter sets, edit and undo entities, and schema extension strategy.
  - [contracts/reports.openapi.yaml](./contracts/reports.openapi.yaml) - documents report read, activity-detail edit/undo, and export interfaces.
  - [quickstart.md](./quickstart.md) - operator validation flow aligned to phase order.

## Phase 2 Task Generation Approach

*Not produced by `/speckit.plan`. `/speckit.tasks` will generate `tasks.md`.*

1. **Phase 1 tasks (Portfolio Summary first)**
  - API portfolio summary read endpoint and totals/kpi computation
  - web Portfolio Summary page section with filters, states, sticky totals, and inline edit wiring
  - original-commitment inline edit path using existing commitment update primitives where row eligibility exists
2. **Phase 2 tasks (Asset Class Summary second)**
  - grouped aggregation endpoint with same filter grammar
  - shared table/totals rendering parity with Phase 1
3. **Phase 3 tasks (Activity Detail last + exports)**
  - full activity detail endpoint and richer row columns
  - inline edit + undo endpoint and audit event integration
  - CSV and XLSX export for all report views with failure handling and filter parity

## Progress Tracking

- [x] Pre-Phase 0 Constitution Check: PASS
- [x] Phase 0 research drafted
- [x] Phase 1 data model drafted
- [x] Phase 1 contracts drafted
- [x] Phase 1 quickstart drafted
- [x] Agent context updated (`.github/copilot-instructions.md` SPECKIT block points to Feature 006 artifacts)
- [ ] `/speckit.tasks` run to generate task breakdown
- [ ] Implementation started
