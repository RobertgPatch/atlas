---
description: "Task list for Feature 006 - Reports Phased Delivery"
---

# Tasks: Reports Phased Delivery

**Input**: Design documents from `/specs/006-reports/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reports.openapi.yaml, quickstart.md

**Tests**: Included. The feature spec defines acceptance scenarios and measurable outcomes for each phase, so contract, integration, and web behavior tests are included per story.

**Organization**: Tasks are grouped by delivery phase and user story to keep each phase independently testable and releasable.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Parallelizable (different files, no dependency on incomplete tasks)
- **[US#]**: User story label (US1 = Portfolio Summary, US2 = Asset Class Summary, US3 = Activity Detail + export)
- Setup and Polish tasks intentionally have no story label

---

## Phase 0: Setup and Foundational (Blocking)

**Purpose**: Create shared scaffolding and cross-phase foundations required before delivery phases.

- [x] T001 [P] Create reports API module skeleton files in `apps/api/src/modules/reports/reports.routes.ts`, `apps/api/src/modules/reports/reports.handler.ts`, `apps/api/src/modules/reports/reports.repository.ts`, `apps/api/src/modules/reports/reports.zod.ts`, and `apps/api/src/modules/reports/reports.export.ts`
- [x] T002 [P] Create web reports feature skeleton in `apps/web/src/features/reports/api/reportsClient.ts`, `apps/web/src/features/reports/hooks/.gitkeep`, `apps/web/src/features/reports/components/.gitkeep`, and `apps/web/src/features/reports/utils/.gitkeep`
- [x] T003 [P] Add shared reports type module in `packages/types/src/reports.ts` and re-export it from `packages/types/src/index.ts`
- [x] T004 Register reports routes from `apps/api/src/routes/index.ts` by mounting `registerReportsRoutes`
- [x] T005 [P] Replace the `/reports` placeholder route by adding `apps/web/src/pages/ReportsPage.tsx` and wiring it in `apps/web/src/App.tsx`
- [x] T006 [P] Add shared report value-formatting helpers (currency, percent, multiple, N/A) in `apps/web/src/features/reports/utils/formatters.ts`
- [x] T007 Add common reports query and body validation schemas in `apps/api/src/modules/reports/reports.zod.ts`
- [x] T008 [P] Extend report audit event constants in `apps/api/src/modules/audit/audit.events.ts` for report edit and undo events
- [x] T009 [P] Add reports seed fixture script for tests in `apps/api/src/infra/db/seed/006_reports_fixtures.ts`
- [x] T010 [P] Add reports test helper utilities in `apps/api/tests/helpers/reportsTestHelpers.ts`

**Checkpoint**: Shared infrastructure is ready; delivery phases can proceed in requested order.

---

## Phase 1: Portfolio Summary (Priority: P1) - US1 MVP

**Goal**: Deliver an end-to-end Portfolio Summary with filters, KPIs, table states, sticky totals, inline monetary edits, single-step undo, conflict handling, and export placeholder messaging.

**Independent Test**: Open `/reports` as Admin and User, validate Portfolio Summary rendering and filters, perform eligible original commitment edit with undo, verify stale conflict handling, and confirm export action shows a non-blocking Phase 3 availability message without generating files.

### Tests for Phase 1 (US1)

- [x] T011 [P] [US1] Add Portfolio Summary contract test coverage for `/v1/reports/portfolio-summary` in `apps/api/tests/reports.portfolio-summary.contract.test.ts`
- [x] T012 [P] [US1] Add inline edit integration tests for monetary validation, stale conflict rejection, and totals recalculation in `apps/api/tests/reports.inline-edit.integration.test.ts`
- [x] T013 [P] [US1] Add web behavior tests for Portfolio Summary loading, empty, populated, sticky totals, and export placeholder message in `apps/web/src/features/reports/components/PortfolioSummaryReport.test.tsx`
- [x] T014 [P] [US1] Add web tests for monetary input validation and single-step undo behavior in `apps/web/src/features/reports/components/EditableCell.test.tsx`

### Implementation for Phase 1 (US1)

- [x] T015 [P] [US1] Define Portfolio Summary API and UI wire types in `packages/types/src/reports.ts`
- [x] T016 [US1] Implement Portfolio Summary query pipeline (rows, KPIs, totals, filters) in `apps/api/src/modules/reports/reports.repository.ts`
- [x] T017 [US1] Implement weighted metric aggregation rules that return `null` for undefined metrics and exclude undefined rows in `apps/api/src/modules/reports/reports.repository.ts`
- [x] T018 [US1] Implement Portfolio Summary handler logic in `apps/api/src/modules/reports/reports.handler.ts`
- [x] T019 [US1] Wire `GET /v1/reports/portfolio-summary` with auth and Zod validation in `apps/api/src/modules/reports/reports.routes.ts`
- [x] T020 [US1] Enforce monetary edit validation bounds (0 to 999999999999.99) and numeric-only rejection in `apps/api/src/modules/partnerships/capital.zod.ts`
- [x] T021 [US1] Add stale edit conflict handling (`expectedUpdatedAt` and `409`) for commitment updates in `apps/api/src/modules/partnerships/capital.handler.ts` and `apps/api/src/modules/partnerships/capital.repository.ts`
- [x] T022 [P] [US1] Implement Portfolio Summary read and edit client methods in `apps/web/src/features/reports/api/reportsClient.ts`
- [x] T023 [P] [US1] Implement Portfolio Summary query/mutation hooks with conflict error mapping in `apps/web/src/features/reports/hooks/usePortfolioSummary.ts` and `apps/web/src/features/reports/hooks/useReportMutations.ts`
- [x] T024 [P] [US1] Implement editable monetary cell with inline validation feedback in `apps/web/src/features/reports/components/EditableCell.tsx`
- [x] T025 [US1] Implement single-step undo session behavior that clears on next successful save or refresh in `apps/web/src/features/reports/hooks/useReportMutations.ts`
- [x] T026 [P] [US1] Build Portfolio Summary table and KPI strip with loading, empty, populated, sticky totals, and `N/A` rendering in `apps/web/src/features/reports/components/PortfolioSummaryReport.tsx`
- [x] T027 [US1] Implement Phase 1 export placeholder action (informational message only, no file download) in `apps/web/src/features/reports/components/ReportsHeaderActions.tsx` and compose it in `apps/web/src/pages/ReportsPage.tsx`
- [x] T028 [US1] Update Phase 1 validation steps and expected conflict/undo behaviors in `specs/006-reports/quickstart.md`

**Checkpoint**: Portfolio Summary is fully functional and independently testable.

---

## Phase 2: Asset Class Summary (Priority: P2) - US2

**Goal**: Deliver Asset Class Summary with grouped metrics, shared filter grammar, consistent table states/formatting, weighted `N/A` behavior, and continued export placeholder behavior.

**Independent Test**: Open Asset Class Summary, apply and clear filters, verify grouped totals and weighted `N/A` handling, verify loading/empty/populated states, and confirm export still shows Phase 3 placeholder messaging.

### Tests for Phase 2 (US2)

- [x] T029 [P] [US2] Add Asset Class Summary contract coverage for `/v1/reports/asset-class-summary` and filter parity in `apps/api/tests/reports.asset-class-summary.contract.test.ts`
- [x] T030 [P] [US2] Add integration tests for weighted metric `N/A` behavior in grouped and total calculations in `apps/api/tests/reports.weighted-metrics.integration.test.ts`
- [x] T031 [P] [US2] Add web behavior tests for grouped rows, table states, and `N/A` rendering in `apps/web/src/features/reports/components/AssetClassSummaryReport.test.tsx`
- [x] T032 [P] [US2] Add web tests confirming export action remains placeholder in Phase 2 in `apps/web/src/features/reports/components/ReportsHeaderActions.test.tsx`

### Implementation for Phase 2 (US2)

- [x] T033 [P] [US2] Extend shared report wire types for Asset Class Summary rows and totals in `packages/types/src/reports.ts`
- [x] T034 [US2] Implement Asset Class Summary aggregation and weighted totals pipeline in `apps/api/src/modules/reports/reports.repository.ts`
- [x] T035 [US2] Implement Asset Class Summary handler in `apps/api/src/modules/reports/reports.handler.ts`
- [x] T036 [US2] Wire `GET /v1/reports/asset-class-summary` and schema validation in `apps/api/src/modules/reports/reports.routes.ts` and `apps/api/src/modules/reports/reports.zod.ts`
- [x] T037 [P] [US2] Implement Asset Class Summary query hook in `apps/web/src/features/reports/hooks/useAssetClassSummary.ts`
- [x] T038 [P] [US2] Implement grouped Asset Class Summary UI component in `apps/web/src/features/reports/components/AssetClassSummaryReport.tsx`
- [x] T039 [US2] Update tab composition and shared filter synchronization in `apps/web/src/pages/ReportsPage.tsx` for Portfolio and Asset Class views
- [x] T040 [US2] Update Phase 2 validation flow and expected placeholder export behavior in `specs/006-reports/quickstart.md`

**Checkpoint**: Asset Class Summary is fully functional and independently testable.

---

## Phase 3: Activity Detail and Export Completion (Priority: P3) - US3

**Goal**: Deliver Activity Detail depth, edit/undo workflow, stale conflict handling, and full CSV/XLSX export for Portfolio Summary, Asset Class Summary, and Activity Detail.

**Independent Test**: Open Activity Detail, validate row keying and columns, execute edit and undo flow, validate stale conflict path, export all three reports in CSV/XLSX with active filters, and verify success/failure feedback.

### Tests for Phase 3 (US3)

- [ ] T041 [P] [US3] Add Activity Detail contract coverage for `/v1/reports/activity-detail` in `apps/api/tests/reports.activity-detail.contract.test.ts`
- [ ] T042 [P] [US3] Add edit/undo integration tests for single-step undo and audit events in `apps/api/tests/reports.activity-undo.integration.test.ts`
- [ ] T043 [P] [US3] Add export contract tests for CSV/XLSX filter parity and actionable failures in `apps/api/tests/reports.export.contract.test.ts`
- [ ] T044 [P] [US3] Extend sync integration coverage for activity row updates keyed by entity, partnership, and tax year in `apps/api/tests/activity-detail.sync.integration.test.ts`
- [ ] T045 [P] [US3] Add web behavior tests for Activity Detail edit, undo, and stale conflict refresh UX in `apps/web/src/features/reports/components/ActivityDetailReport.test.tsx`
- [ ] T046 [P] [US3] Add web tests for export success and failure feedback in `apps/web/src/features/reports/hooks/useReportExport.test.ts`

### Implementation for Phase 3 (US3)

- [ ] T047 [US3] Add Activity Detail schema migration in `apps/api/src/infra/db/migrations/011_reports_activity_detail_columns.sql`
- [ ] T048 [US3] Extend finalization and capital sync writers for new Activity Detail fields in `apps/api/src/modules/review/approve.handler.ts` and `apps/api/src/modules/partnerships/capital.repository.ts`
- [ ] T049 [US3] Implement Activity Detail read, patch, and undo repository methods with version checks in `apps/api/src/modules/reports/reports.repository.ts`
- [ ] T050 [US3] Implement Activity Detail handlers (`GET`, `PATCH`, `POST undo`) with `409` conflict mapping in `apps/api/src/modules/reports/reports.handler.ts`
- [ ] T051 [US3] Wire Activity Detail routes and validation in `apps/api/src/modules/reports/reports.routes.ts` and `apps/api/src/modules/reports/reports.zod.ts`
- [ ] T052 [US3] Implement CSV export generation for all report types in `apps/api/src/modules/reports/reports.export.ts`
- [ ] T053 [US3] Implement XLSX export generation and `/v1/reports/export` response handling in `apps/api/src/modules/reports/reports.export.ts` and `apps/api/src/modules/reports/reports.handler.ts`
- [ ] T054 [P] [US3] Extend shared report types for Activity Detail rows, edit payloads, undo payloads, and export request enums in `packages/types/src/reports.ts`
- [ ] T055 [P] [US3] Implement Activity Detail query and mutation hooks with stale conflict refresh affordance in `apps/web/src/features/reports/hooks/useActivityDetail.ts` and `apps/web/src/features/reports/hooks/useReportMutations.ts`
- [ ] T056 [P] [US3] Implement Activity Detail report component with edit/undo controls and conflict banner in `apps/web/src/features/reports/components/ActivityDetailReport.tsx`
- [ ] T057 [P] [US3] Implement real export hook and replace placeholder behavior for all reports in `apps/web/src/features/reports/hooks/useReportExport.ts` and `apps/web/src/features/reports/components/ReportsHeaderActions.tsx`
- [ ] T058 [US3] Update `apps/web/src/pages/ReportsPage.tsx` to include Activity Detail tab and enable export across all three report views

**Checkpoint**: Activity Detail and full exports are fully functional and independently testable.

---

## Phase 4: Polish and Cross-Cutting Concerns

**Purpose**: Documentation, guardrails, and validation after all delivery phases are complete.

- [ ] T059 [P] Align final API contract details (including conflict and export behaviors) in `specs/006-reports/contracts/reports.openapi.yaml`
- [ ] T060 [P] Update report screen and component usage documentation in `docs/ui/40-screen-map.md` and `docs/ui/46-component-catalog.md`
- [ ] T061 [P] Document reports API architecture boundaries and export pipeline in `docs/api/architecture/10-system-architecture.md`
- [ ] T062 Run full feature validation and capture final operator flow updates in `specs/006-reports/quickstart.md`
- [ ] T063 [P] Add a reports UI composition guard script in `scripts/ci/guard-reports-imports.mjs`
- [ ] T064 [P] Add report-focused test command aliases in `apps/api/package.json` and `apps/web/package.json`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 0 (Setup and Foundational) has no prerequisites and blocks all delivery phases.
- Phase 1 (Portfolio Summary / US1) depends on Phase 0 completion.
- Phase 2 (Asset Class Summary / US2) depends on Phase 1 completion.
- Phase 3 (Activity Detail + Export Completion / US3) depends on Phase 2 completion.
- Phase 4 (Polish) depends on completion of Phases 1, 2, and 3.

### User Story Dependencies

- **US1**: Foundation story and MVP slice; no dependency on later stories.
- **US2**: Depends on US1 shared filters, formatting, and report shell patterns.
- **US3**: Depends on US1 and US2 report contracts and completes export behavior for all report views.

### Within-Phase Ordering Rules

- Tests before implementation tasks in each user story.
- Shared types before handlers and UI composition.
- Repository and validation before route wiring.
- Route/API hooks before page-level composition.

---

## Parallel Execution Examples

### US1 Parallel Example

```text
Run in parallel after T019:
- T022 apps/web/src/features/reports/api/reportsClient.ts
- T023 apps/web/src/features/reports/hooks/usePortfolioSummary.ts and useReportMutations.ts
- T024 apps/web/src/features/reports/components/EditableCell.tsx
- T026 apps/web/src/features/reports/components/PortfolioSummaryReport.tsx
Then serialize:
- T027 apps/web/src/features/reports/components/ReportsHeaderActions.tsx and apps/web/src/pages/ReportsPage.tsx
```

### US2 Parallel Example

```text
Run in parallel after T036:
- T037 apps/web/src/features/reports/hooks/useAssetClassSummary.ts
- T038 apps/web/src/features/reports/components/AssetClassSummaryReport.tsx
- T032 apps/web/src/features/reports/components/ReportsHeaderActions.test.tsx
Then serialize:
- T039 apps/web/src/pages/ReportsPage.tsx
```

### US3 Parallel Example

```text
Run in parallel after T051:
- T052 apps/api/src/modules/reports/reports.export.ts
- T054 packages/types/src/reports.ts
- T055 apps/web/src/features/reports/hooks/useActivityDetail.ts and useReportMutations.ts
- T056 apps/web/src/features/reports/components/ActivityDetailReport.tsx
- T057 apps/web/src/features/reports/hooks/useReportExport.ts and ReportsHeaderActions.tsx
Then serialize:
- T058 apps/web/src/pages/ReportsPage.tsx
```

---

## Implementation Strategy

### MVP First (Phase 1 Only)

1. Complete Phase 0.
2. Complete Phase 1 (US1 Portfolio Summary).
3. Validate US1 independently with T011-T014 and quickstart checks.
4. Demo/release MVP.

### Incremental Delivery

1. Add Phase 2 (US2 Asset Class Summary) and validate independently.
2. Add Phase 3 (US3 Activity Detail + export completion) and validate independently.
3. Finish Phase 4 polish and documentation.

---

## Format Validation

All tasks follow the required checklist format:

- Checkbox prefix `- [ ]`
- Sequential task IDs `T001` to `T064`
- `[P]` markers only on parallelizable tasks
- `[US#]` labels on all user story tasks
- Explicit file path targets in every task description
