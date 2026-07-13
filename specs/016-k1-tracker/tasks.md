# Tasks: Partnership Tracker

**Input**: Design documents from `/specs/016-k1-tracker/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/k1-tracker.openapi.yaml`, `quickstart.md`

**Tests**: Required by the specification. Write the listed tests first and confirm the intended failures before implementing each story.

**Organization**: Tasks are grouped by user story so each increment remains independently testable. These tasks describe updates from the already implemented K1 Tracker and partnership modules; they do not rebuild the existing calculation engine from scratch.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it targets different files and has no dependency on another incomplete task in the same group.
- **[Story]**: Maps the task to one of the six user stories in `spec.md`.
- Every task names the concrete file or directory it changes.

---

## Phase 1: Setup (Shared Structure)

**Purpose**: Establish the consolidated Partnership Tracker module and shared naming without changing production behavior yet.

- [X] T001 Create Partnership Tracker shared enums, exact-money primitives, identity summaries, and barrel exports in `packages/types/src/partnership-tracker.ts` and `packages/types/src/index.ts`
- [X] T002 [P] Create the API module entry files in `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`, `apps/api/src/modules/partnership-tracker/partnership-tracker.types.ts`, and `apps/api/src/modules/partnership-tracker/index.ts`
- [X] T003 [P] Create the web feature entry files in `apps/web/src/features/partnership-tracker/index.ts`, `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts`, `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`, and `apps/web/src/pages/PartnershipTrackerPage.tsx`
- [X] T004 [P] Create durable Partnership Tracker test fixtures and cleanup helpers in `apps/api/tests/helpers/partnershipTrackerFixture.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the migration, validation, audit vocabulary, scoped orchestration, and route/client foundations shared by every story.

**Critical**: No user-story implementation starts until this phase is complete.

- [X] T005 Implement `IN_PROGRESS` workflow migration, commitment effective-date indexes, and safe nonnegative constraints without deleting legacy import/source data in `apps/api/src/infra/db/migrations/019_partnership_tracker.sql`
- [X] T006 [P] Implement Partnership Type, exact two-decimal money, date, pagination, and optimistic-concurrency schemas in `apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts`
- [X] T007 [P] Add partnership, manual-year, commitment, NAV, recalculation, and sign-off audit event names in `apps/api/src/modules/audit/audit.events.ts`
- [X] T008 Implement the scoped Partnership Tracker repository foundation that composes existing partnership, commitment, FMV, and K1 tracker persistence without N+1 reads in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T009 Implement shared Admin guards, scoped resource checks, validation errors, stale-revision errors, and duplicate conflicts in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts`
- [X] T010 Register the `/partnership-tracker` API prefix with existing session and partnership-scope middleware in `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` and `apps/api/src/routes/index.ts`
- [X] T011 [P] Implement Partnership Tracker query keys, exact-money serialization, common API errors, and request helpers in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts`
- [X] T012 Add migration, shared-schema, decimal-string, and no-import-path foundation coverage in `apps/api/tests/partnership-tracker.foundation.test.ts`

**Checkpoint**: The new vertical compiles, applies its compatibility migration, and exposes only authenticated placeholder routes with the correct shared contracts.

---

## Phase 3: User Story 1 - Find and Manage a Partnership (Priority: P1) — Technical MVP

**Goal**: Users can search scoped partnerships, select one, inspect a concise Overview/K-1 & Basis/Capital & NAV shell, edit allowed identity fields, and follow legacy browser links into the same experience.

**Independent Test**: Seed 100 partnerships across multiple entity scopes, find and select one, verify its type/current commitment/latest NAV/latest K-1/latest basis summary, edit identity fields as an Admin, and verify old browser routes redirect with selection preserved.

### Tests for User Story 1

- [X] T013 [P] [US1] Write list, search, detail-summary, exact-money, pagination, and identity-PATCH contract tests in `apps/api/tests/partnership-tracker.contract.test.ts`
- [X] T014 [P] [US1] Write Admin mutation, scoped read, empty-scope, cross-entity, and stale-identity authorization tests in `apps/api/tests/partnership-tracker.authz.integration.test.ts`
- [X] T015 [P] [US1] Write navigation-label, active-state, `/partnerships`, `/partnerships/:id`, and `/k1-tracker` redirect tests in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx`
- [X] T016 [P] [US1] Write partnership search, selection, URL state, three-area layout, overview cards, and edit-dialog tests in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPageContent.test.tsx`

### Implementation for User Story 1

- [X] T017 [US1] Implement set-based scoped partnership list and selected-detail queries with current commitment, latest NAV, K-1 range, latest basis, workflow, and warning summaries in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T018 [US1] Serialize every Partnership Tracker summary amount as an exact two-decimal string while preserving nulls and deterministic ordering in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T019 [US1] Implement name, Partnership Type, status, and notes updates with `expectedUpdatedAt`, duplicate detection, and before/after audit in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T020 [US1] Complete list, detail, and identity-PATCH handlers and routes in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T021 [US1] Add list/detail/update requests, scoped query hooks, URL-selected partnership state, and targeted cache invalidation in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T022 [US1] Replace separate Partnerships and K1 Tracker navigation entries, add `/partnership-tracker`, and implement selection-preserving legacy redirects in `apps/web/src/components/shared/AppShell.tsx` and `apps/web/src/App.tsx`
- [X] T023 [US1] Implement the searchable picker, bounded three-area shell, overview cards, identity editor, and loading/empty/error states in `apps/web/src/features/partnership-tracker/components/PartnershipPicker.tsx`, `apps/web/src/features/partnership-tracker/components/PartnershipOverview.tsx`, `apps/web/src/features/partnership-tracker/components/EditPartnershipDialog.tsx`, and `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`
- [X] T024 [US1] Run all US1 tests and execute the navigation, search, selection, overview, edit, and redirect checks in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: A scoped, read-focused Partnership Tracker with identity editing works independently of new partnership creation, annual editing, commitment entry, or NAV entry.

---

## Phase 4: User Story 2 - Add a Partnership and Start Its First K-1 Year (Priority: P1)

**Goal**: An Admin creates a typed partnership in place, sees it selected immediately, and can start any supported manual tax year without leaving Partnership Tracker.

**Independent Test**: Create a Real Estate partnership, reject a duplicate normalized name, confirm the new empty workspace is selected, and open a noncurrent unused year in the manual editor.

### Tests for User Story 2

- [X] T025 [P] [US2] Write create contract tests for required entity/name/type, controlled type values, default Active status, duplicate normalization, next action, and non-Admin rejection in `apps/api/tests/partnership-tracker.lifecycle.integration.test.ts`
- [X] T026 [P] [US2] Write create-dialog tests for entity loading/error/empty states, controlled Partnership Type selection, validation, duplicate feedback, submission, and focus return in `apps/web/src/features/partnership-tracker/__tests__/PartnershipCreationFlow.test.tsx`
- [X] T027 [P] [US2] Write new-partnership selection, no-year next action, arbitrary 1900-2100 year, duplicate-year, and cancel-flow tests in `apps/web/src/features/partnership-tracker/__tests__/FirstK1YearFlow.test.tsx`

### Implementation for User Story 2

- [X] T028 [US2] Implement transactional partnership creation using `asset_class` as Partnership Type, normalized per-entity uniqueness, Active default, scope validation, audit, and `ADD_K1_YEAR` response in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T029 [US2] Complete the typed partnership POST handler and route with Admin-only validation and duplicate conflict responses in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T030 [US2] Implement the short entity/name/type/notes Add Partnership dialog by adapting entity queries without legacy status/export fields in `apps/web/src/features/partnership-tracker/components/AddPartnershipDialog.tsx`
- [X] T031 [US2] Add the create mutation, immediately select the returned partnership, update the scoped list cache, and expose the no-year next action in `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts` and `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`
- [X] T032 [US2] Adapt the existing arbitrary-year dialog and launch it from the newly-created empty state without automatic incrementing in `apps/web/src/features/partnership-tracker/components/AddYearDialog.tsx` and `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx`
- [X] T033 [US2] Run all US2 tests and execute the create-partnership and create-first-year checks in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: Admins can onboard a partnership and reach its first manual year entirely inside the new page.

---

## Phase 5: User Story 3 - Enter and Review Manual K-1 Years (Priority: P1)

**Goal**: Admins manually create, calculate, revise, and delete arbitrary K-1 years with carryforwards and audit history; the v1 experience exposes no automated ingestion path.

**Independent Test**: Enter nonconsecutive CPA fixture years manually, verify calculations and carryforwards, reject stale updates, invalidate dependent years, retain revisions, and confirm no import/upload/autosync action or new automated source revision exists.

### Tests for User Story 3

- [X] T034 [P] [US3] Write create/get/PATCH/delete/calculate and 1900-2100 validation contract tests for the new route prefix in `apps/api/tests/partnership-tracker.manual-years.contract.test.ts`
- [X] T035 [P] [US3] Write durable append-only revision, null-vs-zero, carryforward, stale update, downstream recalculation, deletion, and audit tests in `apps/api/tests/partnership-tracker.manual-years.integration.test.ts`
- [X] T036 [P] [US3] Write manual-only source-policy tests proving no workbook route, PDF route, finalized-source autosync, or new automated revision is created in `apps/api/tests/partnership-tracker.manual-source-policy.integration.test.ts`
- [X] T037 [P] [US3] Add manual CPA fixture, sign convention, loss/distribution limitation, liability, and Section L regression cases in `apps/api/tests/partnership-tracker.calculation.test.ts`
- [X] T038 [P] [US3] Write year navigation, grouped fields, live draft calculation, source history, arbitrary-year, and comparison tests in `apps/web/src/features/partnership-tracker/__tests__/ManualK1Workflow.test.tsx`
- [X] T039 [P] [US3] Write unsaved-navigation, stale-revision recovery, override-reason, keyboard, and no-import-control tests in `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx`

### Implementation for User Story 3

- [X] T040 [US3] Add manual-only year list/detail reads that preserve legacy sourced revisions without triggering finalized-document synchronization in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T041 [US3] Adapt existing tracker create/update/delete/draft-calculate transactions for the new route module, retaining append-only revisions, carryforwards, stale locking, downstream invalidation, and audits in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T042 [US3] Apply `NOT_STARTED`/`IN_PROGRESS`/`NEEDS_REVIEW`/`RECONCILED` transitions and map legacy `IMPORTED` display state without losing provenance in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts` and `packages/types/src/partnership-tracker.ts`
- [X] T043 [US3] Complete manual year CRUD and non-persistent calculate handlers/routes under `/partnership-tracker` without registering import or upload endpoints in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T044 [US3] Add manual year detail, create, update, delete, draft-calculate, and revision-conflict client methods and hooks in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T045 [US3] Move and adapt the compact year rail, selected-year tabs, summary cards, basis, K-1, liability, reconciliation, journal, and comparison components into `apps/web/src/features/partnership-tracker/components/`
- [X] T046 [US3] Adapt the guided year editor for manual and carryforward sources only, including sign guidance, live draft summaries, revision history, override reasons, and unsaved-change guards in `apps/web/src/features/partnership-tracker/components/EditYearDrawer.tsx`
- [X] T047 [US3] Integrate the manual K-1 workspace and remove Import Workbook actions and finalized-source conflict controls from `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx` and `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`
- [X] T048 [US3] Run all US3 tests and execute the manual-year, carryforward, concurrency, calculation, and manual-only boundary checks in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: US1-US3 form the usable v1 MVP: select or create a partnership and maintain its complete K-1 history manually.

---

## Phase 6: User Story 4 - Preserve Committed-Capital History (Priority: P2)

**Goal**: Admins maintain effective-dated total committed-capital values, including backdated entries and audited corrections, while users see deterministic current and historical values.

**Independent Test**: Record the three-value backdating example, verify current and as-of results, reject stale correction, delete one entry without changing later entries, and inspect audit evidence.

### Tests for User Story 4

- [X] T049 [P] [US4] Write effective-date, backdating, legacy-null-date fallback, current-marker, correction, deletion, and audit integration tests in `apps/api/tests/partnership-tracker.commitment-history.integration.test.ts`
- [X] T050 [P] [US4] Write exact-string, required-date, nonnegative, stale-token, scoped access, and Admin-only commitment contract tests in `apps/api/tests/partnership-tracker.commitment.contract.test.ts`
- [X] T051 [P] [US4] Write current commitment, chronological history, add/edit/delete confirmation, backdated explanation, permission, and stale-error UI tests in `apps/web/src/features/partnership-tracker/__tests__/CommitmentHistoryPanel.test.tsx`

### Implementation for User Story 4

- [X] T052 [US4] Implement effective-date ordering, as-of selection, legacy date fallback, and transactional ACTIVE marker recomputation in `apps/api/src/modules/partnerships/capital.repository.ts`
- [X] T053 [US4] Implement exact-money commitment create/correct/delete operations with `expectedUpdatedAt`, backdating preservation, scope, and before/after audit in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T054 [US4] Complete commitment list/create/PATCH/delete handlers and routes in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T055 [US4] Add commitment API methods, as-of queries, mutations, stale recovery, and precise overview/detail cache invalidation in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T056 [US4] Implement committed-capital current value, dated history, and accessible add/edit/delete workflows in `apps/web/src/features/partnership-tracker/components/CommitmentHistoryPanel.tsx` and `apps/web/src/features/partnership-tracker/components/CommitmentEntryDialog.tsx`
- [X] T057 [US4] Connect current committed capital to Overview and verify commitment mutations do not invalidate K-1 calculations or sign-offs in `apps/web/src/features/partnership-tracker/components/PartnershipOverview.tsx` and `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T058 [US4] Run all US4 tests and execute the committed-capital history and backdating checks in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: Commitment history is durable, auditable, and independently useful without NAV or sign-off work.

---

## Phase 7: User Story 5 - Record and Plot NAV History (Priority: P2)

**Goal**: Admins maintain multiple dated NAV observations per year, and every user can inspect the latest value, chronological plot, exact points, and equivalent accessible table.

**Independent Test**: Record four NAV points with two in one year, reject an exact-date duplicate, correct and remove points with concurrency checks, and verify visual order equals accessible table order.

### Tests for User Story 5

- [X] T059 [P] [US5] Write multiple-same-year, exact-date uniqueness, latest-by-valuation-date, legacy-source, correction, deletion, and audit integration tests in `apps/api/tests/partnership-tracker.nav-history.integration.test.ts`
- [X] T060 [P] [US5] Write exact-string, nonnegative, date, stale-token, scoped read, and Admin-only NAV contract tests in `apps/api/tests/partnership-tracker.nav.contract.test.ts`
- [X] T061 [P] [US5] Write date-proportional geometry, chronological ordering, empty, one-point, all-zero, duplicate-value, and responsive-domain tests in `apps/web/src/features/partnership-tracker/__tests__/NavHistoryChart.test.tsx`
- [X] T062 [P] [US5] Write keyboard-point, chart-summary, table-equivalence, add/edit/delete, duplicate-date, permission, and focus tests in `apps/web/src/features/partnership-tracker/__tests__/NavHistoryPanel.test.tsx`

### Implementation for User Story 5

- [X] T063 [US5] Implement chronological NAV reads, latest-by-valuation-date selection, deterministic legacy tie-breakers, and exact-money mapping over `partnership_fmv_snapshots` in `apps/api/src/modules/partnerships/fmv.repository.ts`
- [X] T064 [US5] Implement manual NAV create/correct/delete with exact-date uniqueness, `expectedUpdatedAt`, scope, and before/after audit in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T065 [US5] Complete NAV list/create/PATCH/delete handlers and routes using NAV terminology while preserving the FMV table in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T066 [US5] Add NAV API methods, mutations, duplicate/stale errors, and overview/detail cache invalidation in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T067 [US5] Implement a native responsive SVG line plot with actual-date x positions, value y positions, axes, focusable point details, textual trend summary, and reduced-motion behavior in `apps/web/src/features/partnership-tracker/components/NavHistoryChart.tsx`
- [X] T068 [US5] Implement the chronological accessible NAV table and add/edit/delete dialogs, including empty and permission-restricted states, in `apps/web/src/features/partnership-tracker/components/NavHistoryPanel.tsx` and `apps/web/src/features/partnership-tracker/components/NavEntryDialog.tsx`
- [X] T069 [US5] Connect latest NAV/date to Overview and run all US5 tests plus the NAV plot/history checks in `apps/web/src/features/partnership-tracker/components/PartnershipOverview.tsx` and `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: NAV history and its accessible visualization work independently of tax reconciliation and use no new chart dependency.

---

## Phase 8: User Story 6 - Reconcile and Sign Off a Year (Priority: P3)

**Goal**: Retained K-1 calculations, reconciliation panels, journal outputs, and revision-specific sign-off operate correctly inside Partnership Tracker for manual v1 data.

**Independent Test**: Complete a manual CPA fixture year, trace basis and Section L, balance journal entries, prepare/review with separate Admins, change an earlier K-1 year to invalidate later sign-off, and prove commitment/NAV changes do not invalidate it.

### Tests for User Story 6

- [X] T070 [P] [US6] Write draft-calculation, journal-balance, sign-off gate, distinct reviewer, stale revision, and invalidation contract tests under the new prefix in `apps/api/tests/partnership-tracker.signoff.contract.test.ts`
- [X] T071 [P] [US6] Write manual CPA result, earlier-year invalidation, commitment/NAV non-invalidation, restart persistence, and audit integration tests in `apps/api/tests/partnership-tracker.reconciliation.integration.test.ts`
- [X] T072 [P] [US6] Write basis drilldown, Section L, warning, journal copy, failed-gate, prepare/review, invalidation, and comparison UI tests in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerSignoff.test.tsx`

### Implementation for User Story 6

- [X] T073 [US6] Update calculation completeness and workflow evaluation for manual `IN_PROGRESS` years while retaining exact basis, loss, distribution, liability, Section L, book-tax, and journal rules in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts`
- [X] T074 [US6] Expose calculate and sign-off orchestration under the Partnership Tracker module with revision locks, separate reviewer enforcement, invalidation reasons, and audit in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts`, `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`, and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T075 [US6] Add calculate/sign-off client mutations, gate errors, and exact revision cache updates in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T076 [US6] Compose Outside Basis, K-1 Inputs, Liabilities, Reconciliation, Journal Entries, Sign-off, and three-year comparison within the new workspace in `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx`
- [X] T077 [US6] Complete accessible debit-positive/credit-negative journal copy, balance status, sign-off history, blocker explanations, and invalidation UI in `apps/web/src/features/partnership-tracker/components/JournalEntryPanel.tsx` and `apps/web/src/features/partnership-tracker/components/SignOffPanel.tsx`
- [X] T078 [US6] Display retained legacy imported/finalized revisions as read-only provenance and require a reason for manual override without offering new sync/import actions in `apps/web/src/features/partnership-tracker/components/EditYearDrawer.tsx`
- [X] T079 [US6] Run all US6 tests and execute the reconciliation, journal, sign-off, earlier-year invalidation, and non-tax-history checks in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: The complete manual Partnership Tracker v1 is functional and auditable.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Remove duplicate user-facing surfaces and validate accessibility, performance, security, persistence, and build quality across all stories.

- [X] T080 [P] Add end-to-end keyboard, focus return, visible focus, accessible-name, live-warning, chart alternative, and unsaved-navigation coverage in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx`
- [X] T081 [P] Add 100-partnership/50-year/50-commitment/200-NAV query-count and two-second fixture coverage in `apps/api/tests/partnership-tracker.performance.integration.test.ts` and `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPerformance.test.tsx`
- [X] T082 [P] Add cross-entity child-resource, malformed money/date, duplicate race, stale delete, and error-sanitization security tests in `apps/api/tests/partnership-tracker.security.integration.test.ts`
- [X] T083 Remove duplicate legacy navigation/page implementations and dead workbook-import UI wiring after redirects are covered, while preserving legacy APIs/data, in `apps/web/src/pages/PartnershipDirectory.tsx`, `apps/web/src/pages/PartnershipDetail.tsx`, `apps/web/src/pages/K1TrackerPage.tsx`, and `apps/web/src/features/k1-tracker/`
- [X] T084 Normalize responsive area overflow, compact year navigation, chart sizing, skeletons, empty/filtered-empty/new/error/restricted states, and reduced motion in `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`
- [X] T085 Verify migration upgrade, fresh database creation, API restart persistence, and legacy commitment/FMV/import/source readability in `apps/api/tests/partnership-tracker.persistence.integration.test.ts`
- [X] T086 Run all focused API tests with `npm run test:api -- partnership-tracker k1-tracker partnerships` and fix failures in `apps/api/src/modules/partnership-tracker/`, `apps/api/src/modules/k1-tracker/`, and `apps/api/src/modules/partnerships/`
- [X] T087 Run all focused web tests and quality checks with `npm run test:web -- PartnershipTracker`, `npm run build:api`, `npm run build:web`, and `npm run --workspace=web lint`, fixing failures in `apps/web/src/features/partnership-tracker/`, `apps/web/src/App.tsx`, `apps/web/src/components/shared/AppShell.tsx`, and `packages/types/src/partnership-tracker.ts`
- [ ] T088 Execute every v1 validation section in `specs/016-k1-tracker/quickstart.md` and document any intentional compatibility caveat without adding Excel/PDF/OCR work to v1

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: Starts immediately.
- **Phase 2 - Foundation**: Depends on Phase 1 and blocks every user story.
- **Phase 3 - US1**: Depends on Foundation and establishes the selected-partnership shell used by later web stories.
- **Phase 4 - US2**: Depends on US1 for the page shell and Foundation for create/year APIs.
- **Phase 5 - US3**: Depends on US1 for selection and US2 for the create-to-first-year journey; backend manual-year work can begin after Foundation.
- **Phase 6 - US4**: Backend work can begin after Foundation; UI integration depends on US1. It can run in parallel with US3 and US5.
- **Phase 7 - US5**: Backend work can begin after Foundation; UI integration depends on US1. It can run in parallel with US3 and US4.
- **Phase 8 - US6**: Depends on US3 manual-year behavior and the retained calculation/sign-off engine. It does not depend on US4 or US5 calculations, but its non-invalidation tests require those mutations.
- **Phase 9 - Polish**: Depends on every story selected for the release.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 Find/Manage
                         |-> US2 Create/First Year -> US3 Manual K-1 -> US6 Reconcile/Sign-off
                         |-> US4 Commitment History ----------------------|
                         `-> US5 NAV History -----------------------------|
```

### Within Each User Story

1. Write the story tests and confirm the expected failures.
2. Implement repository/storage behavior before handlers.
3. Implement handlers/routes before client integration.
4. Implement client/hooks before page composition.
5. Run the story checkpoint before declaring the story complete.

## Parallel Opportunities

- Setup tasks T002-T004 can run in parallel after T001 fixes the shared naming direction.
- Foundation schema, audit, and client helpers (T006, T007, T011) can run in parallel while T005 prepares the migration.
- All test tasks within a story marked `[P]` can be authored concurrently.
- US4 commitment backend tasks and US5 NAV backend tasks can proceed concurrently after Foundation.
- US3 manual-year UI work can proceed alongside US4/US5 history UI after the US1 page shell stabilizes.
- Polish accessibility, performance, and security tests (T080-T082) target separate files and can run in parallel.

## Parallel Examples

### User Story 1

```text
T013: API list/detail/PATCH contract tests
T014: Scope and authorization integration tests
T015: Navigation and redirect tests
T016: Picker/overview/edit UI tests
```

### User Story 2

```text
T025: Partnership create lifecycle API tests
T026: Add Partnership dialog tests
T027: First K-1 year flow tests
```

### User Story 3

```text
T034: Manual-year route contract tests
T035: Revision/carryforward integration tests
T036: Manual-only source-policy tests
T037: Calculation regression tests
T038-T039: Manual workspace and editor tests
```

### User Story 4

```text
T049: Effective-date and backdating integration tests
T050: Commitment contract tests
T051: Commitment history UI tests
```

### User Story 5

```text
T059: NAV persistence/integration tests
T060: NAV contract tests
T061: SVG geometry tests
T062: NAV panel accessibility tests
```

### User Story 6

```text
T070: Calculation/sign-off contract tests
T071: Reconciliation/invalidation integration tests
T072: Reconciliation and sign-off UI tests
```

## Implementation Strategy

### Technical MVP

1. Complete Setup and Foundation.
2. Complete US1.
3. Validate scoped selection, overview, editing, and redirects with seeded data.

### Usable V1 MVP

1. Complete Setup, Foundation, US1, US2, and US3.
2. Validate the full create-partnership-to-manual-K-1 journey.
3. Do not add Excel import, PDF upload, OCR, or automatic source sync to reach MVP.

### Incremental Delivery

1. **US1**: Consolidated scoped partnership management shell.
2. **US2**: In-page creation and first-year next step.
3. **US3**: Trusted manual annual K-1 workflow.
4. **US4**: Effective-dated committed-capital history.
5. **US5**: Manual NAV history and accessible plot.
6. **US6**: Reconciliation, journal, and sign-off integration.
7. **Polish**: Remove duplicate UI and validate the complete v1.

## Notes

- Existing `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts` is retained and adapted; do not rewrite approved formulas without a regression test.
- Existing commitment and partnership FMV tables remain the only sources for committed capital and NAV.
- `asset_class` remains the persisted/reporting field; Partnership Type is the new user-facing name.
- Existing imported/finalized tracker revisions remain readable but v1 creates only manual, override, and carryforward revisions.
- Legacy browser pages are redirected and may be removed from routing only after redirect tests pass; legacy APIs and stored data remain intact.
- `[P]` is valid only while shared contract shapes and prerequisite files are stable.
