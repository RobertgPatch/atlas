# Tasks: Consolidated Holdings Report

**Input**: Design documents from `/specs/012-consolidated-holdings-report/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/consolidated-holdings.openapi.yaml, quickstart.md

**Tests**: Included because the feature specification defines acceptance scenarios and measurable contract/export outcomes, and Atlas already uses API contract/integration tests plus React component tests for reports.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependencies, configuration, and shared wire types needed by the Plaid and report work.

- [X] T001 Add Plaid runtime dependencies in apps/api/package.json and apps/web/package.json
- [X] T002 Add Plaid environment fields to apps/api/src/config.ts and apps/api/.env.example
- [X] T003 [P] Add Plaid account and connection wire types in packages/types/src/plaid.ts
- [X] T004 [P] Extend report wire types for consolidated holdings in packages/types/src/reports.ts
- [X] T005 Export new shared type modules from packages/types/src/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create persistence, validation, and module skeletons that all user stories build on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Add consolidated holdings database migration in apps/api/src/infra/db/migrations/012_consolidated_holdings.sql
- [X] T007 [P] Create Plaid validation schemas in apps/api/src/modules/plaid/plaid.zod.ts
- [X] T008 [P] Create Plaid API client wrapper in apps/api/src/modules/plaid/plaid.client.ts
- [X] T009 Create Plaid repository for connections, accounts, snapshots, and source holdings in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T010 Create Plaid handler skeleton in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T011 Create Plaid routes skeleton in apps/api/src/modules/plaid/plaid.routes.ts
- [X] T012 Register Plaid routes in apps/api/src/routes/index.ts
- [X] T013 [P] Extend reports validation schemas for consolidated holdings queries in apps/api/src/modules/reports/reports.zod.ts
- [X] T014 [P] Add consolidated holdings fixture helpers in apps/api/tests/helpers/consolidatedHoldingsTestHelpers.ts
- [X] T015 [P] Add web fixture data matching the report contract in apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Connect and Select Investment Accounts (Priority: P1) MVP

**Goal**: Users can launch Plaid Link, exchange public tokens server-side, view connected investment accounts, and select which accounts are included in the report.

**Independent Test**: Open the Consolidated Holdings Report, launch Plaid Link in sandbox or mocked mode, select multiple accounts, and confirm only selected account ids are persisted for reporting.

### Tests for User Story 1

- [X] T016 [P] [US1] Add contract tests for POST /v1/plaid/link-token and POST /v1/plaid/exchange-public-token in apps/api/tests/plaid.link.contract.test.ts
- [X] T017 [P] [US1] Add contract tests for GET/PATCH /v1/plaid/investment-accounts in apps/api/tests/plaid.investment-accounts.contract.test.ts
- [X] T018 [P] [US1] Add web component tests for account selection modal behavior in apps/web/src/features/reports/components/PlaidAccountSelector.test.tsx

### Implementation for User Story 1

- [X] T019 [US1] Implement Plaid link token creation and update-mode handling in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T020 [US1] Implement public token exchange and account persistence in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T021 [US1] Implement investment account listing and selected-account updates in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T022 [US1] Wire authenticated Plaid endpoints in apps/api/src/modules/plaid/plaid.routes.ts
- [X] T023 [US1] Add audit events for Plaid connect, reconnect, and selection changes in apps/api/src/modules/audit/audit.events.ts
- [X] T024 [P] [US1] Add Plaid client methods to apps/web/src/features/reports/api/reportsClient.ts
- [X] T025 [P] [US1] Implement Plaid Link hook in apps/web/src/features/reports/hooks/usePlaidLink.ts
- [X] T026 [P] [US1] Implement account selection hook in apps/web/src/features/reports/hooks/usePlaidAccounts.ts
- [X] T027 [US1] Implement Plaid account selector using the provided modal design reference in apps/web/src/features/reports/components/PlaidAccountSelector.tsx
- [X] T028 [US1] Add Consolidated Holdings tab entry and account connect action to apps/web/src/pages/ReportsPage.tsx

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Consolidate Holdings Into One Row Per Asset (Priority: P1)

**Goal**: Selected account holdings sync from Plaid or fixtures and render one parent row per normalized asset with account/custodian detail rows underneath.

**Independent Test**: Seed 20 shares of GOOGL in Brokerage A and 50 shares in Brokerage B, then verify one parent row shows quantity 70 with both child rows preserved.

### Tests for User Story 2

- [X] T029 [P] [US2] Add integration tests for selected-account holdings sync in apps/api/tests/plaid.holdings-sync.integration.test.ts
- [X] T030 [P] [US2] Add contract tests for GET /v1/reports/consolidated-holdings in apps/api/tests/reports.consolidated-holdings.contract.test.ts
- [X] T031 [P] [US2] Add rollup integration tests for duplicate symbols, weighted average cost basis, and child rows in apps/api/tests/reports.consolidated-holdings.rollup.integration.test.ts
- [X] T032 [P] [US2] Add web tests for expandable parent/detail rows in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx

### Implementation for User Story 2

- [X] T033 [US2] Implement holdings retrieval and snapshot persistence in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T034 [US2] Implement holdings refresh handler for selected accounts in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T035 [US2] Wire POST /v1/reports/consolidated-holdings/refresh in apps/api/src/modules/reports/reports.routes.ts
- [X] T036 [P] [US2] Implement security identity normalization helpers in apps/api/src/modules/reports/consolidatedHoldings.service.ts
- [X] T037 [US2] Implement consolidated holdings aggregation and detail-row mapping in apps/api/src/modules/reports/consolidatedHoldings.service.ts
- [X] T038 [US2] Add consolidated holdings repository query pipeline in apps/api/src/modules/reports/reports.repository.ts
- [X] T039 [US2] Add consolidated holdings handler in apps/api/src/modules/reports/reports.handler.ts
- [X] T040 [US2] Wire GET /v1/reports/consolidated-holdings in apps/api/src/modules/reports/reports.routes.ts
- [X] T041 [P] [US2] Add consolidated holdings query client method in apps/web/src/features/reports/api/reportsClient.ts
- [X] T042 [P] [US2] Implement consolidated holdings query hook in apps/web/src/features/reports/hooks/useConsolidatedHoldings.ts
- [X] T043 [P] [US2] Implement holdings row component based on the provided HoldingsRow reference in apps/web/src/features/reports/components/ConsolidatedHoldingsRow.tsx
- [X] T044 [US2] Implement holdings table component based on the provided HoldingsTable reference in apps/web/src/features/reports/components/ConsolidatedHoldingsTable.tsx
- [X] T045 [US2] Compose fixture-backed Consolidated Holdings report view in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.tsx
- [X] T046 [US2] Replace fixture data with API-backed data in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.tsx

**Checkpoint**: User Story 2 is fully functional and testable independently.

---

## Phase 5: User Story 3 - Review, Filter, and Export the Report (Priority: P2)

**Goal**: Users can scan the modern report UI with KPIs, filters, sorting, expandable rows, and CSV/XLSX export parity.

**Independent Test**: Load mixed holdings data, filter by custodian/account/type/symbol/gain-loss state, sort the table, expand rows, and export matching CSV/XLSX output.

### Tests for User Story 3

- [X] T047 [P] [US3] Add API tests for consolidated holdings filters and sorting in apps/api/tests/reports.consolidated-holdings.filters.integration.test.ts
- [X] T048 [P] [US3] Add export contract tests for CSV/XLSX parent/detail rows in apps/api/tests/reports.consolidated-holdings.export.contract.test.ts
- [X] T049 [P] [US3] Add web tests for summary cards, filters, sorting, loading, empty, and populated states in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx

### Implementation for User Story 3

- [X] T050 [US3] Add server-side consolidated holdings filters and sort handling in apps/api/src/modules/reports/reports.repository.ts
- [X] T051 [US3] Add consolidated holdings export generation to apps/api/src/modules/reports/reports.export.ts
- [X] T052 [US3] Wire GET /v1/reports/consolidated-holdings/export in apps/api/src/modules/reports/reports.routes.ts
- [X] T053 [US3] Add export client support for consolidated holdings in apps/web/src/features/reports/api/reportsClient.ts
- [X] T054 [P] [US3] Implement summary cards based on the provided SummaryCards reference in apps/web/src/features/reports/components/ConsolidatedHoldingsSummaryCards.tsx
- [X] T055 [P] [US3] Implement report filter toolbar in apps/web/src/features/reports/components/ConsolidatedHoldingsFilters.tsx
- [X] T056 [US3] Integrate summary cards, filter toolbar, refresh action, and export action in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.tsx
- [X] T057 [US3] Add consolidated holdings export feedback to apps/web/src/pages/ReportsPage.tsx

**Checkpoint**: User Story 3 is fully functional and testable independently.

---

## Phase 6: User Story 4 - Handle Sync Status and Exceptions (Priority: P3)

**Goal**: Operators can see partial sync failures, reconnect/update states, and low-confidence security normalization exceptions without losing usable data.

**Independent Test**: Seed successful, failed, stale, missing-symbol, and low-confidence holdings; verify warnings, badges, reconnect actions, and successful rows render together.

### Tests for User Story 4

- [X] T058 [P] [US4] Add sync exception integration tests in apps/api/tests/plaid.holdings-sync-exceptions.integration.test.ts
- [X] T059 [P] [US4] Add normalization-confidence tests in apps/api/tests/reports.consolidated-holdings.identity.integration.test.ts
- [X] T060 [P] [US4] Add web tests for partial sync warnings, reconnect prompt, and confidence badges in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx

### Implementation for User Story 4

- [X] T061 [US4] Persist Plaid item/account error states and needs-user-action status in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T062 [US4] Map Plaid sync errors into partial-success report warnings in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T063 [US4] Expose sync warning and identity-confidence metadata in apps/api/src/modules/reports/reports.handler.ts
- [X] T064 [US4] Add reconnect/update-mode API support in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T065 [P] [US4] Add sync status banner component in apps/web/src/features/reports/components/ConsolidatedHoldingsSyncStatus.tsx
- [X] T066 [P] [US4] Add identity confidence badges to apps/web/src/features/reports/components/ConsolidatedHoldingsRow.tsx
- [X] T067 [US4] Integrate reconnect/update actions into apps/web/src/features/reports/components/PlaidAccountSelector.tsx

**Checkpoint**: User Story 4 is fully functional and testable independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, security hardening, and quality pass across all stories.

- [X] T068 [P] Document Plaid setup and sandbox validation in docs/api/architecture/10-system-architecture.md
- [X] T069 [P] Update specs/012-consolidated-holdings-report/quickstart.md with final route names and test commands
- [X] T070 Review token storage and logging to ensure Plaid access tokens never appear in browser payloads or logs in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T071 Run quickstart validation commands from specs/012-consolidated-holdings-report/quickstart.md
- [X] T072 Run full API and web builds with npm run build:api and npm run build:web

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion.
- **Polish (Phase 7)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational; no dependency on other stories.
- **User Story 2 (P1)**: Starts after Foundational; can use fixture-selected accounts at first, then integrate with US1 selection.
- **User Story 3 (P2)**: Depends on US2 report rows for meaningful UI filtering and export.
- **User Story 4 (P3)**: Depends on US1 connection state and US2 sync/report metadata.

### Within Each User Story

- Tests come before implementation.
- Validation schemas and shared types come before handlers and UI hooks.
- Repository/service logic comes before route handlers.
- API client/hooks come before composed React report components.
- Each story checkpoint should pass before moving to the next priority.

### Parallel Opportunities

- T003 and T004 can run in parallel after T001 starts.
- T007, T008, T013, T014, and T015 can run in parallel after setup.
- US1 tests T016, T017, and T018 can run in parallel.
- US2 tests T029, T030, T031, and T032 can run in parallel.
- US2 backend service work T036 and frontend row work T043 can proceed in parallel after shared types exist.
- US3 summary cards T054 and filters T055 can run in parallel.
- US4 banner T065 and confidence badge T066 can run in parallel.

---

## Parallel Example: User Story 2

```text
Task: "Add integration tests for selected-account holdings sync in apps/api/tests/plaid.holdings-sync.integration.test.ts"
Task: "Add contract tests for GET /v1/reports/consolidated-holdings in apps/api/tests/reports.consolidated-holdings.contract.test.ts"
Task: "Add rollup integration tests for duplicate symbols, weighted average cost basis, and child rows in apps/api/tests/reports.consolidated-holdings.rollup.integration.test.ts"
Task: "Add web tests for expandable parent/detail rows in apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx"
```

```text
Task: "Implement security identity normalization helpers in apps/api/src/modules/reports/consolidatedHoldings.service.ts"
Task: "Implement holdings row component based on the provided HoldingsRow reference in apps/web/src/features/reports/components/ConsolidatedHoldingsRow.tsx"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1 for account connection and selection.
4. Complete Phase 4: User Story 2 for the first analytically useful consolidated report.
5. Stop and validate: account selection, refresh, one parent row per asset, and child custodian rows.

### Incremental Delivery

1. Setup and foundation create shared schema, routing, and fixtures.
2. US1 connects/selects investment accounts.
3. US2 syncs and consolidates holdings into parent/detail rows.
4. US3 adds review ergonomics, filters, sorting, KPIs, and export.
5. US4 adds partial failure, reconnect, and identity-confidence handling.

### Parallel Team Strategy

1. Complete Setup and Foundational tasks together.
2. Assign one developer to Plaid connection/account selection, one to consolidation/report APIs, and one to fixture-backed UI components.
3. Integrate by shared wire contracts and the checkpoint tests for each story.

---

## Notes

- [P] tasks use different files or can proceed without depending on incomplete tasks.
- [US1], [US2], [US3], and [US4] labels map directly to the feature specification user stories.
- Preserve existing report module patterns unless a task explicitly creates a new Plaid boundary module.
- Use the pasted generated UI as visual and interaction reference, not as a separate app entry point.
- Avoid logging Plaid access tokens, public tokens, or raw credentials in tests or application logs.
