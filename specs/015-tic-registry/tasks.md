# Tasks: TIC Registry Page

**Input**: Design documents from `/specs/015-tic-registry/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/tic-registry.openapi.yaml](./contracts/tic-registry.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Included because the implementation plan and quickstart explicitly require API contract/integration tests, web component tests, build checks, and staging/RDS smoke validation.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as an independently useful increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on incomplete tasks in the same phase
- **[Story]**: User story label, only present for user story phases
- Every task includes exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature skeleton and shared entry points.

- [x] T001 [P] Create the API module placeholder files in `apps/api/src/modules/tic-registry/tic-registry.routes.ts`, `apps/api/src/modules/tic-registry/tic-registry.handler.ts`, `apps/api/src/modules/tic-registry/tic-registry.repository.ts`, `apps/api/src/modules/tic-registry/tic-registry.types.ts`, and `apps/api/src/modules/tic-registry/tic-registry.zod.ts`
- [x] T002 [P] Create the web feature placeholder files in `apps/web/src/features/tic-registry/api/ticRegistryClient.ts`, `apps/web/src/features/tic-registry/hooks/useTicRegistry.ts`, and `apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx`
- [x] T003 [P] Create the web component placeholder files in `apps/web/src/features/tic-registry/components/TicPropertyCard.tsx`, `apps/web/src/features/tic-registry/components/TicInterestBlock.tsx`, `apps/web/src/features/tic-registry/components/TicOwnerRow.tsx`, `apps/web/src/features/tic-registry/components/TicRegistryDialogs.tsx`, and `apps/web/src/features/tic-registry/components/allocation.ts`
- [x] T004 [P] Create the page wrapper placeholder in `apps/web/src/pages/TicRegistryPage.tsx`
- [x] T005 [P] Create the shared type placeholder in `packages/types/src/tic-registry.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish schema, shared contracts, validation, routing, and client infrastructure required by all user stories.

**CRITICAL**: No user story implementation should begin until this phase is complete.

- [x] T006 Create RDS/PostgreSQL migration for `tic_properties`, `tic_interests`, and `tic_owners` in `apps/api/src/infra/db/migrations/016_tic_registry.sql`
- [x] T007 Define TIC Registry request/response types and enums in `packages/types/src/tic-registry.ts`
- [x] T008 Export TIC Registry shared types from `packages/types/src/index.ts`
- [x] T009 Implement Zod params, query, create, update, and delete validation schemas in `apps/api/src/modules/tic-registry/tic-registry.zod.ts`
- [x] T010 Define API row, scope, mutation, and derived allocation types in `apps/api/src/modules/tic-registry/tic-registry.types.ts`
- [x] T011 Implement base scoped nested-read repository functions in `apps/api/src/modules/tic-registry/tic-registry.repository.ts`
- [x] T012 Implement base list/detail handlers with validation and scoped read behavior in `apps/api/src/modules/tic-registry/tic-registry.handler.ts`
- [x] T013 Register initial `/tic-registry/properties` and `/tic-registry/properties/:propertyId` read routes in `apps/api/src/modules/tic-registry/tic-registry.routes.ts`
- [x] T014 Register the TIC Registry route group in `apps/api/src/routes/index.ts`
- [x] T015 Implement the web API request helper and list/detail client methods in `apps/web/src/features/tic-registry/api/ticRegistryClient.ts`
- [x] T016 Implement React Query keys and read hooks in `apps/web/src/features/tic-registry/hooks/useTicRegistry.ts`
- [ ] T017 [P] Create API test helpers for users, entity scope, and TIC fixtures in `apps/api/tests/helpers/ticRegistryTestHelpers.ts`
- [x] T018 [P] Create web test fixtures for empty, loaded, and read-only registry states in `apps/web/src/features/tic-registry/__tests__/ticRegistryFixtures.ts`

**Checkpoint**: Database schema, API read path, shared types, and web read hooks are ready for user story work.

---

## Phase 3: User Story 1 - Navigate to the Registry (Priority: P1) MVP

**Goal**: Authenticated users can find TIC Registry in the side navigation and land on an Atlas-consistent page with loading, empty, error, or loaded shell states.

**Independent Test**: Sign in, use the side navigation to open TIC Registry, and confirm the page displays its own title, empty state or saved records, and Atlas-consistent controls without requiring a direct URL.

### Tests for User Story 1

- [x] T019 [P] [US1] Add navigation and route tests for `/tic-registry` in `apps/web/src/features/tic-registry/__tests__/TicRegistryNavigation.test.tsx`
- [x] T020 [P] [US1] Add loading, empty, error, and loaded shell tests in `apps/web/src/features/tic-registry/__tests__/TicRegistryPageContent.test.tsx`

### Implementation for User Story 1

- [x] T021 [US1] Add the TIC Registry sidebar destination and active state logic in `apps/web/src/components/shared/AppShell.tsx`
- [x] T022 [US1] Import and register the protected `/tic-registry` route in `apps/web/src/App.tsx`
- [x] T023 [US1] Implement the authenticated page shell using `AppShell` in `apps/web/src/pages/TicRegistryPage.tsx`
- [x] T024 [US1] Implement Atlas-consistent page header, loading state, empty state, error state, and disclaimer copy in `apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx`
- [x] T025 [US1] Connect `TicRegistryPageContent` to the read hook from `apps/web/src/features/tic-registry/hooks/useTicRegistry.ts`

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Maintain TIC Property Records (Priority: P1)

**Goal**: Authorized users can create, view, edit, and delete properties, TIC interests, and underlying owners, with records persisted to PostgreSQL/RDS.

**Independent Test**: Create a property, add at least one TIC interest, add at least one owner, refresh the browser, and confirm the records still appear.

### Tests for User Story 2

- [x] T026 [P] [US2] Add API contract tests for property, interest, and owner CRUD in `apps/api/tests/tic-registry.contract.test.ts`
- [x] T027 [P] [US2] Add RDS/PostgreSQL persistence tests for nested registry records in `apps/api/tests/tic-registry.persistence.integration.test.ts`
- [ ] T028 [P] [US2] Add entity-scope and Admin-only mutation tests in `apps/api/tests/tic-registry.authz.integration.test.ts`
- [ ] T029 [P] [US2] Add web dialog and CRUD mutation tests in `apps/web/src/features/tic-registry/__tests__/TicRegistryCrud.test.tsx`

### Implementation for User Story 2

- [x] T030 [US2] Implement create, update, delete, stale-update, and cascade-aware repository methods for properties in `apps/api/src/modules/tic-registry/tic-registry.repository.ts`
- [x] T031 [US2] Implement create, update, delete, stale-update, and cascade-aware repository methods for TIC interests in `apps/api/src/modules/tic-registry/tic-registry.repository.ts`
- [x] T032 [US2] Implement create, update, delete, stale-update, and cascade-aware repository methods for owners in `apps/api/src/modules/tic-registry/tic-registry.repository.ts`
- [x] T033 [US2] Implement property CRUD handlers with Admin role checks and entity-scope checks in `apps/api/src/modules/tic-registry/tic-registry.handler.ts`
- [x] T034 [US2] Implement TIC interest CRUD handlers with Admin role checks and parent property scope checks in `apps/api/src/modules/tic-registry/tic-registry.handler.ts`
- [x] T035 [US2] Implement owner CRUD handlers with Admin role checks and parent interest scope checks in `apps/api/src/modules/tic-registry/tic-registry.handler.ts`
- [x] T036 [US2] Wire POST, PATCH, and DELETE endpoints from the OpenAPI contract in `apps/api/src/modules/tic-registry/tic-registry.routes.ts`
- [x] T037 [US2] Add create, update, delete, and invalidation methods in `apps/web/src/features/tic-registry/api/ticRegistryClient.ts`
- [x] T038 [US2] Add React Query mutation hooks for properties, interests, and owners in `apps/web/src/features/tic-registry/hooks/useTicRegistry.ts`
- [x] T039 [US2] Implement add/edit/delete dialogs with validation messaging in `apps/web/src/features/tic-registry/components/TicRegistryDialogs.tsx`
- [x] T040 [US2] Implement property record rendering and edit/delete actions in `apps/web/src/features/tic-registry/components/TicPropertyCard.tsx`
- [x] T041 [US2] Implement TIC interest rendering and edit/delete actions in `apps/web/src/features/tic-registry/components/TicInterestBlock.tsx`
- [x] T042 [US2] Implement owner row rendering and edit/delete actions in `apps/web/src/features/tic-registry/components/TicOwnerRow.tsx`
- [x] T043 [US2] Connect CRUD dialogs, mutations, confirmations, and success/error states in `apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx`

**Checkpoint**: User Stories 1 and 2 work independently, and records persist after refresh/sign-in.

---

## Phase 5: User Story 3 - Reconcile Ownership Percentages (Priority: P2)

**Goal**: Users can see whether property-level TIC shares and TIC-level owner shares are fully allocated, under-allocated, or over-allocated.

**Independent Test**: Create allocations that total under, exactly, and over 100%, then confirm the registry labels each state clearly.

### Tests for User Story 3

- [x] T044 [P] [US3] Add allocation utility tests for under, exact, over, and fractional percentages in `apps/web/src/features/tic-registry/__tests__/allocation.test.ts`
- [ ] T045 [P] [US3] Add API allocation derivation tests for summaries and effective owner percentages in `apps/api/tests/tic-registry.allocation.integration.test.ts`
- [ ] T046 [P] [US3] Add web allocation display tests in `apps/web/src/features/tic-registry/__tests__/TicRegistryAllocation.test.tsx`

### Implementation for User Story 3

- [x] T047 [US3] Implement allocation status and percentage formatting helpers in `apps/web/src/features/tic-registry/components/allocation.ts`
- [x] T048 [US3] Add property allocation, owner allocation, effective owner percentage, and summary derivations in `apps/api/src/modules/tic-registry/tic-registry.repository.ts`
- [x] T049 [US3] Return derived allocation fields in list/detail handlers in `apps/api/src/modules/tic-registry/tic-registry.handler.ts`
- [x] T050 [US3] Render registry summary metrics in `apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx`
- [x] T051 [US3] Render property allocation bars and under/over/ok messages in `apps/web/src/features/tic-registry/components/TicPropertyCard.tsx`
- [x] T052 [US3] Render TIC owner allocation warnings in `apps/web/src/features/tic-registry/components/TicInterestBlock.tsx`
- [x] T053 [US3] Render effective property percentage for each owner in `apps/web/src/features/tic-registry/components/TicOwnerRow.tsx`

**Checkpoint**: Allocation reconciliation works for under, exact, and over cases without blocking partial records.

---

## Phase 6: User Story 4 - Track Exchange Lineage (Priority: P2)

**Goal**: Users can mark TIC interests as cash purchase or 1031 exchange, record a relinquished source, and roll a source interest into a new exchange interest while preserving history.

**Independent Test**: Create a TIC interest from a cash purchase, then create another from an exchange source, and confirm the registry displays the correct origin and source context.

### Tests for User Story 4

- [ ] T054 [P] [US4] Add API lineage transaction tests for source-interest references and rolled status in `apps/api/tests/tic-registry.lineage.integration.test.ts`
- [ ] T055 [P] [US4] Add web origin/source form behavior tests in `apps/web/src/features/tic-registry/__tests__/TicRegistryLineage.test.tsx`

### Implementation for User Story 4

- [x] T056 [US4] Implement source-interest scope validation, source label snapshots, and rolled-source updates in `apps/api/src/modules/tic-registry/tic-registry.repository.ts`
- [x] T057 [US4] Implement cash versus exchange handler validation and lineage response mapping in `apps/api/src/modules/tic-registry/tic-registry.handler.ts`
- [x] T058 [US4] Ensure lineage fields are validated and documented in `apps/api/src/modules/tic-registry/tic-registry.zod.ts`
- [x] T059 [US4] Add relinquished source payload support in `apps/web/src/features/tic-registry/api/ticRegistryClient.ts`
- [x] T060 [US4] Implement cash/exchange segmented control and relinquished source selector/text input in `apps/web/src/features/tic-registry/components/TicRegistryDialogs.tsx`
- [x] T061 [US4] Render cash, exchange, rolled, exited, and source labels in `apps/web/src/features/tic-registry/components/TicInterestBlock.tsx`

**Checkpoint**: Cash and exchange acquisition origins display correctly, and source lineage survives later source deletion or inaccessibility.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate the full feature, improve reliability/accessibility, and prepare staging/RDS smoke testing.

- [ ] T062 [P] Add automated accessibility coverage for core page landmarks, dialogs, form labels, and action buttons in `apps/web/src/features/tic-registry/__tests__/TicRegistryAccessibility.test.tsx`
- [ ] T063 [P] Add responsive/mobile layout assertions for the sidebar and registry content in `apps/web/src/features/tic-registry/__tests__/TicRegistryResponsive.test.tsx`
- [x] T064 Review and align final visual spacing, status badges, icon buttons, and text wrapping in `apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx`, `apps/web/src/features/tic-registry/components/TicPropertyCard.tsx`, `apps/web/src/features/tic-registry/components/TicInterestBlock.tsx`, and `apps/web/src/features/tic-registry/components/TicOwnerRow.tsx`
- [x] T065 Run focused API tests from `package.json` with `npm run test:api -- tic-registry`
- [x] T066 Run focused web tests from `package.json` with `npm run test:web -- tic-registry`
- [x] T067 Run API and web build checks from `package.json` with `npm run build:api` and `npm run build:web`
- [ ] T068 Execute and record the local acceptance flow from `specs/015-tic-registry/quickstart.md`
- [ ] T069 Execute and record the staging/RDS smoke check from `specs/015-tic-registry/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user story phases.
- **Phase 3 US1**: Depends on Phase 2. This is the first MVP slice.
- **Phase 4 US2**: Depends on Phase 2 and can begin after US1 page shell exists for easiest UI integration.
- **Phase 5 US3**: Depends on US2 data records and nested response shape.
- **Phase 6 US4**: Depends on US2 interest CRUD and can run in parallel with US3 after US2 repository/handlers exist.
- **Phase 7 Polish**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 Navigate to the Registry**: Starts after Foundational; no dependency on other user stories.
- **US2 Maintain TIC Property Records**: Starts after Foundational; depends on schema/shared/API foundations.
- **US3 Reconcile Ownership Percentages**: Depends on US2 records and nested reads.
- **US4 Track Exchange Lineage**: Depends on US2 TIC interest CRUD.

### Within Each User Story

- Tests should be written first and fail before implementation where practical.
- API validation/types before repository writes.
- Repository methods before handlers.
- Handlers before route wiring.
- Web client methods before hooks.
- Hooks before page/component integration.
- Story checkpoint should pass before moving to the next priority when working sequentially.

### Parallel Opportunities

- T001-T005 can run in parallel after the feature skeleton is accepted.
- T017 and T018 can run in parallel with T006-T016 because they create test fixture files.
- T019 and T020 can run in parallel for US1.
- T026-T029 can run in parallel for US2 tests.
- T044-T046 can run in parallel for US3 tests.
- T054 and T055 can run in parallel for US4 tests.
- T062 and T063 can run in parallel for polish tests.
- After US2 is complete, US3 and US4 can be implemented by separate developers with coordination around shared files.

---

## Parallel Example: User Story 2

```text
Task: "Add API contract tests for property, interest, and owner CRUD in apps/api/tests/tic-registry.contract.test.ts"
Task: "Add RDS/PostgreSQL persistence tests for nested registry records in apps/api/tests/tic-registry.persistence.integration.test.ts"
Task: "Add entity-scope and Admin-only mutation tests in apps/api/tests/tic-registry.authz.integration.test.ts"
Task: "Add web dialog and CRUD mutation tests in apps/web/src/features/tic-registry/__tests__/TicRegistryCrud.test.tsx"
```

## Parallel Example: User Story 3

```text
Task: "Add allocation utility tests for under, exact, over, and fractional percentages in apps/web/src/features/tic-registry/__tests__/allocation.test.ts"
Task: "Add API allocation derivation tests for summaries and effective owner percentages in apps/api/tests/tic-registry.allocation.integration.test.ts"
Task: "Add web allocation display tests in apps/web/src/features/tic-registry/__tests__/TicRegistryAllocation.test.tsx"
```

## Parallel Example: User Story 4

```text
Task: "Add API lineage transaction tests for source-interest references and rolled status in apps/api/tests/tic-registry.lineage.integration.test.ts"
Task: "Add web origin/source form behavior tests in apps/web/src/features/tic-registry/__tests__/TicRegistryLineage.test.tsx"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) so users can navigate to an Atlas-native TIC Registry shell.
3. Complete Phase 4 (US2) so the page delivers durable RDS-backed registry CRUD.
4. Stop and validate the independent tests and quickstart steps for US1 and US2.

### Incremental Delivery

1. Deliver US1 for navigation and page shell.
2. Deliver US2 for durable property/interest/owner records.
3. Deliver US3 for allocation reconciliation.
4. Deliver US4 for exchange lineage.
5. Finish Phase 7 verification and staging smoke checks.

### Notes

- `[P]` tasks are intended to touch different files or independent test files.
- Tasks that touch shared files such as `tic-registry.repository.ts`, `tic-registry.handler.ts`, `TicRegistryPageContent.tsx`, and `ticRegistryClient.ts` should be sequenced carefully.
- Browser local storage from `tic-registry.html` must not become production source of truth.
- TIC Registry must not implement an API in-memory fallback; CRUD operations require PostgreSQL/RDS through `DATABASE_URL`.
- Import/export workflows are out of scope because registry records persist to RDS.
- Existing user changes and untracked reference files should not be reverted while implementing these tasks.
