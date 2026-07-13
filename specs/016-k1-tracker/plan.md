# Implementation Plan: K1 Tracker

**Branch**: `016-k1-tracker` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/016-k1-tracker/spec.md`

## Summary

Add a visible Atlas page at `/k1-tracker` for partnership-specific, multi-year K-1 outside-basis tracking. The page uses a searchable partnership picker, compact status-aware year rail, one selected-year workspace, summary cards, focused tabs, a guided Admin editor, and an optional three-year comparison. It preserves the supplied workbook's outside-basis rollforward, loss limitation, distribution analysis, liability detail, Section L validation, book-tax reconciliation, journal entries, and sign-off while removing the 174-row by 10-column layout and correcting its known reconciliation defects.

The backend adds a durable `k1-tracker` Fastify module and PostgreSQL migration. It reuses Atlas partnerships, entity scope, sessions, Admin mutation rules, audit events, finalized K-1 field vocabulary, and `partnership_annual_activity` as a downstream summary projection. Canonical tracker years and append-only field revisions live in dedicated tables; they never depend on browser storage or the current process-local K-1/review repositories. Excel import uses the existing server-side ExcelJS dependency in a preview/commit workflow with explicit partnership/year conflict decisions, atomic commit, source-cell provenance, and regression coverage against the CPA-approved supplied workbook.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, SQL for PostgreSQL migrations.  
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, ExcelJS 4, existing auth/session/RBAC/scope/audit patterns. Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, TanStack Query 5, Headless UI 2, lucide-react, existing Atlas shared components.  
**Storage**: Existing PostgreSQL via `DATABASE_URL`; add `k1_tracker_years`, `k1_tracker_value_revisions`, `k1_tracker_import_batches`, and `k1_tracker_signoffs` in `apps/api/src/infra/db/migrations/018_k1_tracker.sql`. Continue projecting compatible annual summaries into `partnership_annual_activity`.  
**Testing**: Vitest calculation, contract, authz, persistence, import, source-sync, concurrency, and projection tests in `apps/api/tests`; Vitest/Testing Library component, navigation, accessibility, and client tests under `apps/web/src/features/k1-tracker`; build checks with `npm run build:api` and `npm run build:web`.  
**Target Platform**: Existing Atlas browser application and Fastify API. Local development uses Docker PostgreSQL; deployed environments use the configured durable PostgreSQL service.  
**Project Type**: Monorepo web application with backend API, React frontend, shared wire types, and SQL migrations.  
**Performance Goals**: A scoped partnership list and a selected partnership with 50 years load into a usable state within 2 seconds under normal staging conditions; selecting a cached year feels immediate; import preview for the supplied workbook completes within 5 seconds.  
**Constraints**: One selected year is primary; comparison is capped at three years; Admin-only mutations; all monetary API values use exact decimal strings and server calculations operate in integer cents; $1 reconciliation tolerance; imports are previewed before atomic commit; missing is distinct from zero; earlier-year changes invalidate dependent sign-off; no tracker source of truth in browser or process memory.  
**Scale/Scope**: Internal Atlas users, hundreds of partnerships, up to 50 years per partnership, roughly 50 tracked fields per year, one page plus API module, workbook migration import, finalized K-1 source reuse, journal-entry display/copy, and no accounting-system posting export or HTML prototype portfolio/NAV analytics in v1.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific gates. Applied repository-local and financial-workflow gates:

1. **Existing stack and boundaries**: PASS. Work stays in the current Fastify API, React app, shared types package, and migration directory.
2. **Durable production state**: PASS. PostgreSQL is authoritative; the plan explicitly excludes browser and process-memory persistence.
3. **Scoped authorization**: PASS. Reads use existing entity membership scope; imports, edits, deletes, overrides, and sign-off are Admin-only.
4. **Financial correctness and auditability**: PASS. Exact decimal values, deterministic server calculations, source-cell/document provenance, append-only value revisions, audit events, and visible checks are required.
5. **Workbook translation, not duplication**: PASS. The workbook is the functional source; the UI is redesigned around selected-year tasks and corrects two identified workbook defects.
6. **UI consistency and accessibility**: PASS. The page reuses Atlas shell/shared patterns, provides complete UI states, and plans keyboard/focus tests.
7. **Legacy safety**: PASS. Useful field semantics and infrastructure are reused; unused MUI surfaces, the 21-column report layout, and in-memory K-1 repositories are not adopted as tracker foundations.
8. **Testing coverage**: PASS. Golden calculation fixtures, import atomicity, source conflicts, rollover continuity, authz, persistence, responsive layout, and accessibility are included.
9. **Infrastructure restraint**: PASS. No new service is introduced; existing PostgreSQL and ExcelJS are reused.

### Post-Phase 1 Re-check

Re-evaluated after `research.md`, `data-model.md`, `contracts/k1-tracker.openapi.yaml`, and `quickstart.md`. Result: **PASS**.

- Research resolves UI information architecture, legacy reuse, persistence, source conflict behavior, import processing, calculations, known workbook defects, permissions, and scope exclusions.
- The data model separates canonical tracker detail from the existing annual summary projection and preserves revision/source history.
- The contract defines scoped reads, exact-decimal calculations, Admin-only writes, preview/commit import, concurrency, and sign-off without exposing process-local state.
- Quickstart validates the supplied workbook's five populated years, blank future-year handling, the net-income defect fix, atomicity, persistence, and UI behavior.

## Project Structure

### Documentation (this feature)

```text
specs/016-k1-tracker/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- k1-tracker.openapi.yaml
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
apps/api/
|-- src/
|   |-- infra/db/migrations/
|   |   `-- 018_k1_tracker.sql
|   |-- modules/k1-tracker/
|   |   |-- k1-tracker.calculation.ts
|   |   |-- k1-tracker.field-map.ts
|   |   |-- k1-tracker.handler.ts
|   |   |-- k1-tracker.import.ts
|   |   |-- k1-tracker.projection.ts
|   |   |-- k1-tracker.repository.ts
|   |   |-- k1-tracker.routes.ts
|   |   |-- k1-tracker.types.ts
|   |   `-- k1-tracker.zod.ts
|   `-- routes/index.ts
`-- tests/
    |-- fixtures/k1-tracker-basis-template.xlsx
    |-- k1-tracker.calculation.test.ts
    |-- k1-tracker.contract.test.ts
    |-- k1-tracker.authz.integration.test.ts
    |-- k1-tracker.import.integration.test.ts
    |-- k1-tracker.persistence.integration.test.ts
    |-- k1-tracker.source-sync.integration.test.ts
    `-- k1-tracker.projection.integration.test.ts

apps/web/src/
|-- App.tsx
|-- components/shared/AppShell.tsx
|-- pages/K1TrackerPage.tsx
`-- features/k1-tracker/
    |-- api/k1TrackerClient.ts
    |-- hooks/useK1Tracker.ts
    |-- components/
    |   |-- K1TrackerPageContent.tsx
    |   |-- PartnershipPicker.tsx
    |   |-- YearRail.tsx
    |   |-- YearSummaryCards.tsx
    |   |-- YearStatusPanel.tsx
    |   |-- OutsideBasisPanel.tsx
    |   |-- K1InputsPanel.tsx
    |   |-- LiabilitiesPanel.tsx
    |   |-- ReconciliationPanel.tsx
    |   |-- JournalEntryPanel.tsx
    |   |-- SignOffPanel.tsx
    |   |-- EditYearDrawer.tsx
    |   |-- ImportWorkbookDialog.tsx
    |   `-- CompareYearsDrawer.tsx
    `-- __tests__/
        |-- K1TrackerNavigation.test.tsx
        |-- K1TrackerPageContent.test.tsx
        |-- YearRail.test.tsx
        |-- ImportWorkbookDialog.test.tsx
        |-- EditYearDrawer.test.tsx
        `-- k1TrackerClient.test.ts

packages/types/src/
|-- index.ts
`-- k1-tracker.ts
```

**Structure Decision**: Use a dedicated K1 Tracker vertical rather than expanding the document-processing `/k1` page or the reports module. The API owns exact calculations, source resolution, import parsing, transactions, scope, concurrency, sign-off rules, audit, and annual-summary projection. The web app owns compact navigation, progressive disclosure, input guidance, draft calculation requests, and complete page/dialog states. Shared request/response types live in `packages/types`; no new deployable project is introduced.

## Complexity Tracking

No constitution violations or additional services are introduced. Dedicated tracker tables are justified because `partnership_annual_activity` is a lossy annual summary without complete line items, liability detail, suspended-loss continuity, field provenance, or revisions; it remains a downstream compatibility projection rather than being duplicated or replaced.
