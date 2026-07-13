# Implementation Plan: Partnership Tracker

**Branch**: `016-k1-tracker` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)
**Input**: Revised feature specification from `/specs/016-k1-tracker/spec.md`

## Summary

Rename the visible K1 Tracker experience to Partnership Tracker and make `/partnership-tracker` the focused workspace for partnership identity, manual annual K-1/basis tracking, dated committed-capital history, and dated NAV history. Admins can create a partnership in place by selecting its entity and one of the existing asset-class types, then move directly to manual K-1 entry for any tax year. The selected partnership uses three bounded areas—Overview, K-1 & Basis, and Capital & NAV—rather than combining every section from the legacy partnership page or rendering all years at once.

The implementation reuses existing PostgreSQL partnerships, `asset_class`, commitments, partnership FMV snapshots, tracker years/value revisions/sign-offs, authorization, and audit infrastructure. Existing FMV records are presented as NAV, and commitments become explicitly effective-dated total-commitment entries. The pure K-1 calculation engine remains, while workbook import and finalized-document synchronization are removed from the v1 route/UI surface. A small Partnership Tracker orchestration layer composes scoped partnership summaries without duplicating business rules. Legacy browser routes redirect to the new workspace; legacy APIs and stored data remain compatible unless a v1 route is explicitly retired.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, SQL for PostgreSQL migrations.
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, existing auth/session/RBAC/scope/audit modules. Web: React 19, React Router 7, TanStack Query 5, Headless UI 2, Tailwind CSS 3, lucide-react, native responsive SVG for the NAV plot.
**Storage**: Existing PostgreSQL via `DATABASE_URL`; reuse `partnerships.asset_class`, `partnership_commitments`, `partnership_fmv_snapshots`, `k1_tracker_years`, `k1_tracker_value_revisions`, and `k1_tracker_signoffs`. Add `019_partnership_tracker.sql` only for safe effective-date indexes, validation constraints, and manual-workflow status migration; do not introduce a parallel partnership, commitment, or NAV table.
**Testing**: Vitest API contract/integration/calculation tests; Testing Library/Vitest web workflow, chart accessibility, navigation, and client tests; `npm run build:api`; `npm run build:web`; durable tests through `ATLAS_TEST_DATABASE_URL`.
**Target Platform**: Existing Atlas browser app and Fastify API; local Docker PostgreSQL and deployed durable PostgreSQL.
**Project Type**: Monorepo web application with backend API, React frontend, shared TypeScript wire contracts, and SQL migrations.
**Performance Goals**: A 100-row scoped partnership picker and a selected partnership containing 50 K-1 years, 50 commitment entries, and 200 NAV entries become usable within 2 seconds under normal staging conditions; selecting a cached year or tab feels immediate.
**Constraints**: V1 is manual K-1 entry only; no Excel import, PDF upload, OCR, or finalized-document autosync in the new surface. Admin-only mutations; exact decimal-string API money; server calculations use integer cents; $1 reconciliation tolerance; missing differs from zero; one primary year; up to three comparison years; no browser or process-memory source of truth.
**Scale/Scope**: Internal Atlas users, hundreds of partnerships, up to 50 K-1 years per partnership, dozens of annual fields, up to 50 commitment changes and 200 NAV observations per partnership, one consolidated page, and compatibility redirects for two old web routes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still an unfilled template and defines no enforceable project-specific gates. Applied repository-local and financial-workflow gates:

1. **Existing stack and boundaries**: PASS. Work stays inside the current Fastify API, React app, shared types, and migration directory.
2. **One durable source of truth**: PASS. Existing PostgreSQL tables are reused; no duplicate partnership, commitment, NAV, or tracker store is introduced.
3. **Scoped authorization**: PASS. Reads use existing entity scope; partnership, K-1, commitment, NAV, correction, deletion, and sign-off mutations remain Admin-only.
4. **Financial correctness**: PASS. Exact money strings, integer-cent calculations, effective-date rules, deterministic ordering, and $1 reconciliation tolerance are specified.
5. **Auditability**: PASS. Manual K-1 revisions, partnership edits, effective-dated commitment changes, NAV changes, calculations, and sign-offs retain actor and before/after evidence.
6. **Focused UI and accessibility**: PASS. Three bounded areas replace the legacy long-form page; the NAV SVG has equivalent accessible summary/table data and all controls require keyboard/focus coverage.
7. **Backward compatibility**: PASS. Old browser routes redirect, existing asset/report APIs and data remain, and stored imported/source values are not destroyed even though v1 no longer creates them.
8. **Infrastructure restraint**: PASS. Native SVG avoids a charting dependency, and the design uses existing Fastify, React Query, and PostgreSQL capabilities.
9. **Testing coverage**: PASS. The plan includes contract, authorization, durable history, backdating, calculation, navigation, accessibility, and performance-sized fixtures.

### Post-Phase 1 Re-check

Re-evaluated after updating [research.md](./research.md), [data-model.md](./data-model.md), [contracts/k1-tracker.openapi.yaml](./contracts/k1-tracker.openapi.yaml), and [quickstart.md](./quickstart.md). Result: **PASS**.

- Research resolves terminology, route consolidation, manual-only boundaries, effective-date semantics, NAV chart technology, and compatibility behavior.
- The data model reuses existing durable records and defines deterministic current-value and historical-series projections.
- The contract exposes the consolidated Partnership Tracker resources without exposing Excel/PDF ingestion in v1.
- The quickstart proves create-to-first-year flow, arbitrary manual years, backdated commitment behavior, multiple same-year NAV points, accessibility, redirects, and absence of automated-import controls.

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
|-- checklists/
|   `-- requirements.md
`-- tasks.md                 # regenerated separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
|-- src/
|   |-- infra/db/migrations/
|   |   `-- 019_partnership_tracker.sql
|   |-- modules/partnerships/
|   |   |-- partnerships.repository.ts       # identity/type and legacy detail
|   |   |-- capital.repository.ts            # effective-dated commitments
|   |   `-- fmv.repository.ts                # persisted NAV/FMV history
|   |-- modules/k1-tracker/
|   |   `-- k1-tracker.calculation.ts        # retained pure tax engine
|   |-- modules/partnership-tracker/
|   |   |-- partnership-tracker.contracts.ts
|   |   |-- partnership-tracker.handler.ts
|   |   |-- partnership-tracker.repository.ts # scoped composed read model
|   |   |-- partnership-tracker.routes.ts
|   |   |-- partnership-tracker.types.ts
|   |   `-- partnership-tracker.zod.ts
|   `-- routes/index.ts
`-- tests/
    |-- partnership-tracker.contract.test.ts
    |-- partnership-tracker.authz.integration.test.ts
    |-- partnership-tracker.lifecycle.integration.test.ts
    |-- partnership-tracker.commitment-history.integration.test.ts
    |-- partnership-tracker.nav-history.integration.test.ts
    |-- partnership-tracker.calculation.test.ts
    `-- partnership-tracker.persistence.integration.test.ts

apps/web/src/
|-- App.tsx
|-- components/shared/AppShell.tsx
|-- pages/PartnershipTrackerPage.tsx
`-- features/partnership-tracker/
    |-- api/partnershipTrackerClient.ts
    |-- hooks/usePartnershipTracker.ts
    |-- components/
    |   |-- PartnershipTrackerPageContent.tsx
    |   |-- PartnershipPicker.tsx
    |   |-- AddPartnershipDialog.tsx
    |   |-- EditPartnershipDialog.tsx
    |   |-- PartnershipOverview.tsx
    |   |-- K1BasisWorkspace.tsx
    |   |-- AddYearDialog.tsx
    |   |-- EditYearDrawer.tsx
    |   |-- CommitmentHistoryPanel.tsx
    |   |-- CommitmentEntryDialog.tsx
    |   |-- NavHistoryPanel.tsx
    |   |-- NavHistoryChart.tsx
    |   `-- NavEntryDialog.tsx
    `-- __tests__/
        |-- PartnershipTrackerNavigation.test.tsx
        |-- PartnershipCreationFlow.test.tsx
        |-- ManualK1Workflow.test.tsx
        |-- CommitmentHistoryPanel.test.tsx
        |-- NavHistoryChart.test.tsx
        `-- PartnershipTrackerAccessibility.test.tsx

packages/types/src/
|-- index.ts
|-- partnership-management.ts       # retained legacy types
`-- partnership-tracker.ts          # consolidated v1 wire contract
```

**Structure Decision**: Create a thin Partnership Tracker vertical for the consolidated user-facing contract and page while reusing the existing partnership repositories and pure K-1 calculation engine. This avoids making the legacy partnership detail component the new foundation and avoids copying commitment/NAV persistence. The existing `k1-tracker` module is narrowed to calculation and durable year/revision behavior; Excel import and finalized-document sync are not registered in the v1 Partnership Tracker route surface. Existing browser pages become redirects after the new page reaches parity for the explicitly retained workflows.

## Phase 0: Research Outcomes

1. Treat the current `asset_class` values as controlled Partnership Type options; keep storage/report compatibility and change user-facing language only.
2. Use an in-page create-to-first-year flow: create and select the partnership, then offer an optional immediate Add K-1 Year action rather than one oversized wizard transaction.
3. Model committed capital as effective-dated total snapshots in the existing commitments table. Query history by effective date, preserve later entries when backdating, and maintain the latest-effective record as current.
4. Present existing partnership FMV snapshots as NAV entries. Permit multiple values per calendar year, reject duplicate exact valuation dates, and choose latest NAV by valuation date.
5. Render a small native SVG line plot with semantic summary and an always-available data table instead of adding a chart library.
6. Keep manual K-1 values and carryforwards as the only v1 write sources. Retain legacy provenance columns/data for future PDF/OCR work without exposing import endpoints.
7. Redirect `/partnerships`, `/partnerships/:id`, `/k1-tracker`, and `/k1-tracker?partnershipId=...` into the corresponding Partnership Tracker state.

## Phase 1: Design Outcomes

- Add a consolidated partnership summary response so the frontend does not issue N+1 calls for current commitment, latest NAV, K-1 range, and latest basis.
- Add API mutations for commitment and NAV correction/removal with optimistic concurrency and audit coverage, while reusing the existing tables.
- Standardize new Partnership Tracker monetary payloads on exact two-decimal strings even where legacy endpoints still return JavaScript numbers.
- Keep annual field revisions append-only and introduce `IN_PROGRESS` as the manual-workflow status, mapping legacy `IMPORTED` rows without destroying provenance.
- Use URL state (`partnershipId`, active area, `taxYear`) for bookmarkable selection without duplicating server state in browser storage.
- Preserve legacy stored imports and finalized-source revisions as readable history; prevent new automated source creation through the v1 route surface.

## Complexity Tracking

No constitution violations are introduced. The thin orchestration module is justified because one selected-partnership response must combine identity, manual tracker years, commitment history, and NAV history under one scoped authorization boundary. It calls existing repositories and does not create a second business or persistence layer.
