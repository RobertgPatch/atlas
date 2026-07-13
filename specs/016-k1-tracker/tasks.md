# Tasks: K1 Tracker

**Input**: Design documents from `/specs/016-k1-tracker/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/k1-tracker.openapi.yaml`, `quickstart.md`

**Tests**: Required by the specification and plan for financial correctness, workbook regression, import atomicity, persistence, authorization, accessibility, and performance. Write each listed test before its corresponding implementation and confirm it fails for the expected reason.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an incremental slice. Shared calculation, persistence, scope, audit, and type work is placed in Setup and Foundational phases because every story depends on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on another incomplete task in the same group.
- **[Story]**: Maps the task to User Story 1-5 from `spec.md`.
- Every task includes an exact repository path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared contracts, deterministic reference fixtures, and feature test helpers.

- [X] T001 Record the CPA-approved supplied workbook plus expected 2021-2025 values in `apps/api/tests/fixtures/k1-tracker-basis-template.xlsx` and `apps/api/tests/fixtures/k1-tracker-basis-template.expected.json`
- [X] T002 [P] Define exact-decimal request/response types, field keys, workflow statuses, source types, checks, imports, revisions, calculations, and sign-offs in `packages/types/src/k1-tracker.ts`
- [X] T003 Export the K1 Tracker wire contract from `packages/types/src/index.ts`
- [X] T004 [P] Add reusable partnership/year/value/import factories and database cleanup helpers in `apps/api/tests/helpers/k1TrackerFixture.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the durable ledger, authoritative calculation core, validation, projection boundary, audit vocabulary, and route registration required by every user story.

**CRITICAL**: No user-story implementation begins until this phase passes its focused tests.

- [X] T005 [P] Write failing exact-cents, liability-change, carryforward, IRS worksheet ordering, suspended-category allocation, missing-vs-zero, and $1-tolerance tests in `apps/api/tests/k1-tracker.calculation.test.ts`
- [ ] T006 [P] Write failing migration, append-only active-revision, import-batch, sign-off, and restart-persistence tests in `apps/api/tests/k1-tracker.persistence.integration.test.ts`
- [X] T007 Create `k1_tracker_years`, `k1_tracker_import_batches`, `k1_tracker_value_revisions`, and `k1_tracker_signoffs` with constraints, partial indexes, foreign keys, and rollback-safe ordering in `apps/api/src/infra/db/migrations/018_k1_tracker.sql`
- [X] T008 Implement the canonical field registry, workbook aliases, Azure K-1 aliases, sign normalization, completeness rules, calculation roles, and version identifiers in `apps/api/src/modules/k1-tracker/k1-tracker.field-map.ts`
- [X] T009 Implement integer-cent parsing/formatting and the authoritative ordered multi-year calculation engine in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts`
- [X] T010 [P] Define API-internal tracker records, calculation inputs, source-conflict records, transaction contexts, and repository result types in `apps/api/src/modules/k1-tracker/k1-tracker.types.ts`
- [X] T011 [P] Implement Zod schemas for UUIDs, years, exact money strings, field changes, import decisions, revision checks, and sign-off actions in `apps/api/src/modules/k1-tracker/k1-tracker.zod.ts`
- [X] T012 Implement scoped PostgreSQL reads, transactional year locking, append-only value revision activation, conflict lookup, and ordered-year loading in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T013 Implement atomic recalculation of the changed year and all later years plus compatible `partnership_annual_activity` upserts in `apps/api/src/modules/k1-tracker/k1-tracker.projection.ts`
- [X] T014 Add tracker audit event names and before/after payload builders in `apps/api/src/modules/audit/audit.events.ts`
- [X] T015 Create authenticated tracker route scaffolding with entity-scope reads, Admin-only mutation guards, normalized errors, and transaction boundaries in `apps/api/src/modules/k1-tracker/k1-tracker.routes.ts`
- [X] T016 Create shared request-context, validation-error, stale-revision, and not-found handler helpers in `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [X] T017 Register the K1 Tracker routes under `/v1/k1-tracker` in `apps/api/src/routes/index.ts`
- [X] T018 Run `apps/api/tests/k1-tracker.calculation.test.ts` and `apps/api/tests/k1-tracker.persistence.integration.test.ts`, then fix the foundation until both pass without process-memory fallback

**Checkpoint**: Durable schema, exact calculations, scope, audit vocabulary, transaction boundaries, and route registration are ready.

---

## Phase 3: User Story 1 - Review a Partnership Across All K-1 Years (Priority: P1) MVP

**Goal**: A scoped user can find one partnership, navigate every available year through a compact rail, and review summary and detailed sourced values without a giant all-year grid.

**Independent Test**: Seed a partnership with at least ten years, select it from K1 Tracker, reach the oldest and newest years without expanding all years, and verify summary values, statuses, detailed tabs, source links, and read-only permissions.

### Tests for User Story 1

- [ ] T019 [P] [US1] Write failing contract tests for partnership list, tracker overview, and selected-year GET responses in `apps/api/tests/k1-tracker.contract.test.ts`
- [X] T020 [P] [US1] Write failing scoped-read, cross-entity denial, unauthenticated denial, and User read-only integration tests in `apps/api/tests/k1-tracker.authz.integration.test.ts`
- [ ] T021 [P] [US1] Write failing route, navbar-active-state, partnership selection, and complete page-state tests in `apps/web/src/features/k1-tracker/__tests__/K1TrackerNavigation.test.tsx`
- [X] T022 [P] [US1] Write failing 1-year, 10-year, 50-year, nonconsecutive-year, keyboard, and status-chip tests in `apps/web/src/features/k1-tracker/__tests__/YearRail.test.tsx`

### Implementation for User Story 1

- [X] T023 [US1] Implement scoped partnership summary, tracker overview, and selected-year read queries in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T024 [US1] Implement GET handlers and response mapping for `/partnerships`, `/partnerships/{partnershipId}`, and `/years/{taxYear}` in `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [ ] T025 [US1] Complete the three GET route contracts, query parsing, limits, and response schemas in `apps/api/src/modules/k1-tracker/k1-tracker.routes.ts`
- [X] T026 [P] [US1] Implement exact-decimal parsing, list/detail/year requests, typed errors, and source links in `apps/web/src/features/k1-tracker/api/k1TrackerClient.ts`
- [X] T027 [US1] Add partnership-list, overview, selected-year, cache-key, retry, and year-prefetch queries in `apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts`
- [X] T028 [P] [US1] Implement the searchable scoped partnership selector with empty and filtered-empty states in `apps/web/src/features/k1-tracker/components/PartnershipPicker.tsx`
- [X] T029 [P] [US1] Implement the bounded, keyboard-operable, status-aware year rail in `apps/web/src/features/k1-tracker/components/YearRail.tsx`
- [X] T030 [P] [US1] Implement ending-basis, annual-change, suspended-loss, excess-distribution, Section L difference, and warning cards in `apps/web/src/features/k1-tracker/components/YearSummaryCards.tsx`
- [X] T031 [P] [US1] Implement check summaries, source conflicts, workflow status, and source-document links in `apps/web/src/features/k1-tracker/components/YearStatusPanel.tsx`
- [X] T032 [P] [US1] Implement read-only K-1 line grouping and compact zero-line disclosure in `apps/web/src/features/k1-tracker/components/K1InputsPanel.tsx`
- [X] T033 [US1] Compose partnership selection, year URL state, summary, focused tab navigation, loading/empty/error/restricted states, and a maximum-three-year comparison shell in `apps/web/src/features/k1-tracker/components/K1TrackerPageContent.tsx` and `apps/web/src/features/k1-tracker/components/CompareYearsDrawer.tsx`
- [X] T034 [US1] Create the authenticated page shell and connect session/logout behavior in `apps/web/src/pages/K1TrackerPage.tsx`
- [X] T035 [US1] Add the protected `/k1-tracker` route without changing the existing `/k1` processing route in `apps/web/src/App.tsx`
- [X] T036 [US1] Add the visible `K1 Tracker` AppShell item and prefix-aware active-state handling for tracker subroutes in `apps/web/src/components/shared/AppShell.tsx`
- [ ] T037 [US1] Run the US1 API and web tests, then verify the independent User Story 1 flow with seeded 50-year data using `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: User Story 1 is a deployable read-only MVP for already-populated tracker data.

---

## Phase 4: User Story 2 - Import Existing Basis Workbooks Safely (Priority: P1)

**Goal**: An Admin can preview the supplied workbook, distinguish populated from formula-only years, resolve partnership/year conflicts, and commit selected years atomically with cell-level provenance.

**Independent Test**: Preview the CPA-approved workbook, confirm 2021-2025 are populated and 2026-2030 are not complete, commit five years, verify provenance and idempotency, and prove a forced failure leaves no partial data.

### Tests for User Story 2

- [X] T038 [P] [US2] Write failing parser tests for row aliases, source cells, signed values, hidden/renamed rows, unsupported sheets, formula-only future years, and known workbook warnings in `apps/api/tests/k1-tracker.import.test.ts`
- [ ] T039 [P] [US2] Write failing preview/commit contract, Admin-only, expiry, conflict-decision, idempotency, and upload-limit tests in `apps/api/tests/k1-tracker.import.contract.test.ts`
- [X] T040 [P] [US2] Write failing atomic rollback, merge/replace/skip, audit, revision, and source-provenance integration tests in `apps/api/tests/k1-tracker.import.integration.test.ts`
- [ ] T041 [P] [US2] Write failing preview, conflict-choice, progress, failure, retry, focus, and confirmation tests in `apps/web/src/features/k1-tracker/__tests__/ImportWorkbookDialog.test.tsx`

### Implementation for User Story 2

- [X] T042 [US2] Implement bounded ExcelJS parsing, workbook hashing, sheet/year detection, literal-vs-formula classification, field mapping, and sanitized warnings in `apps/api/src/modules/k1-tracker/k1-tracker.import.ts`
- [X] T043 [US2] Implement preview-batch persistence, expiry, idempotency lookup, and commit-decision reads in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [ ] T044 [US2] Implement atomic multi-year merge/replace/skip commits, append-only workbook revisions, conflict creation, recalculation, projection, and audit in `apps/api/src/modules/k1-tracker/k1-tracker.import.ts`
- [X] T045 [US2] Implement multipart preview and JSON commit handlers with file-size, MIME, scope, expiry, and error sanitization in `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [X] T046 [US2] Complete `/imports/preview` and `/imports/{importBatchId}/commit` route schemas and Admin guards in `apps/api/src/modules/k1-tracker/k1-tracker.routes.ts`
- [X] T047 [P] [US2] Add import preview/commit client methods, upload progress, and typed conflict/expiry errors in `apps/web/src/features/k1-tracker/api/k1TrackerClient.ts`
- [X] T048 [US2] Add import preview/commit mutations and targeted partnership/year cache invalidation in `apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts`
- [X] T049 [US2] Implement the accessible staged workbook preview, partnership confirmation, year decisions, warnings, and atomic commit UX in `apps/web/src/features/k1-tracker/components/ImportWorkbookDialog.tsx`
- [X] T050 [US2] Connect Admin-only import actions and successful-year selection to the tracker page in `apps/web/src/features/k1-tracker/components/K1TrackerPageContent.tsx`
- [ ] T051 [US2] Run all US2 tests and execute the workbook-import sections of `specs/016-k1-tracker/quickstart.md`, including forced rollback and repeated commit

**Checkpoint**: The practical P1 release can migrate historical workbooks without silent overwrite or false future-year completeness.

---

## Phase 5: User Story 3 - Enter, Correct, and Roll Forward a K-1 Year (Priority: P2)

**Goal**: An Admin can add, calculate, edit, override, and delete a year through a guided workflow with carryforwards, source conflict visibility, stale-write protection, and downstream invalidation.

**Independent Test**: Add the year after the latest record, verify four carryforward categories, preview and save changes, reject a stale concurrent update, preserve the original source during override, and mark all affected later years for review.

### Tests for User Story 3

- [ ] T052 [P] [US3] Write failing create, patch, delete, and non-persistent calculate contract tests in `apps/api/tests/k1-tracker.mutations.contract.test.ts`
- [ ] T053 [P] [US3] Write failing stale-revision, append-only override, carryforward, cascading recalculation, deletion, audit, and sign-off invalidation tests in `apps/api/tests/k1-tracker.mutations.integration.test.ts`
- [X] T054 [P] [US3] Write failing finalized/amended K-1 fill-missing, identical-source, differing-source-conflict, and restart-safe backfill tests in `apps/api/tests/k1-tracker.source-sync.integration.test.ts`
- [ ] T055 [P] [US3] Write failing guided sections, sign guidance, draft preview, override reason, source history, unsaved-close, stale-conflict, and keyboard tests in `apps/web/src/features/k1-tracker/__tests__/EditYearDrawer.test.tsx`

### Implementation for User Story 3

- [X] T056 [US3] Implement transactional create, patch, explicit null revision, override, delete, expected-revision locking, and audit methods in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T057 [US3] Implement prior-year basis, capital, three liability classes, and suspended-category carryforward generation in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts`
- [X] T058 [US3] Implement create/patch/delete orchestration, downstream recalculation, workflow downgrade, sign-off invalidation, and annual projection in `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [X] T059 [US3] Implement non-persistent draft calculation using the current locked revision and existing prior-year context in `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [X] T060 [US3] Complete year POST/PATCH/DELETE and `/calculate` routes with Admin guards and `409` responses in `apps/api/src/modules/k1-tracker/k1-tracker.routes.ts`
- [X] T061 [US3] Implement idempotent finalized K-1 field synchronization, source equality checks, conflict creation, source links, and load-time backfill in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts` and `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [X] T062 [P] [US3] Add create, patch, delete, draft-calculate, and source-resolution client methods in `apps/web/src/features/k1-tracker/api/k1TrackerClient.ts`
- [ ] T063 [US3] Add mutation hooks, optimistic revision checks, stale-data recovery, downstream-year invalidation, and precise cache refresh in `apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts`
- [X] T064 [US3] Implement the accessible Source, Capital, Income/Gains, Losses/Deductions/Distributions, Liabilities, and Review steps in `apps/web/src/features/k1-tracker/components/EditYearDrawer.tsx`
- [ ] T065 [US3] Connect Admin-only add/edit/delete, source conflict resolution, live draft summaries, unsaved-change guards, and stale-revision recovery in `apps/web/src/features/k1-tracker/components/K1TrackerPageContent.tsx`
- [ ] T066 [US3] Run all US3 tests and execute the edit, concurrency, source-sync, restart, and downstream-invalidation sections of `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: User Story 3 supports durable annual maintenance without destroying source evidence or later-year integrity.

---

## Phase 6: User Story 4 - Reconcile Outside Basis and Section L (Priority: P2)

**Goal**: Users can trace the IRS-ordered basis rollforward, loss and distribution limitations, liabilities, Section L components, book-tax explanations, and complete check set for each year.

**Independent Test**: Recalculate the CPA-approved 2021-2025 fixture within $1, prove the inception contribution is excluded from net income, prove a component variance prevents reconciliation, and exercise suspended-loss and taxable-distribution cases.

### Tests for User Story 4

- [X] T067 [P] [US4] Add failing CPA-workbook golden-value, contribution/net-income defect, false-reconciliation defect, pro-rata loss category, excess distribution, and transaction-version regression cases in `apps/api/tests/k1-tracker.calculation.test.ts`
- [ ] T068 [P] [US4] Write failing annual-summary projection, recalculation rollback, source flag, and report compatibility tests in `apps/api/tests/k1-tracker.projection.integration.test.ts`
- [ ] T069 [P] [US4] Write failing basis drilldown, liability continuity, Section L component variance, book-tax explanation, zero suppression, warning visibility, and three-year comparison tests in `apps/web/src/features/k1-tracker/__tests__/K1TrackerPageContent.test.tsx`

### Implementation for User Story 4

- [ ] T070 [US4] Complete category-level IRS worksheet calculations, versioned CPA rule selection, diagnostics, and readable check decomposition in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts`
- [ ] T071 [US4] Complete all compatible `partnership_annual_activity` projections, source flags, finalized document links, and transaction rollback behavior in `apps/api/src/modules/k1-tracker/k1-tracker.projection.ts`
- [X] T072 [P] [US4] Implement increases, distributions, allowed/suspended categories, ending basis, source drilldown, and warnings in `apps/web/src/features/k1-tracker/components/OutsideBasisPanel.tsx`
- [X] T073 [P] [US4] Implement beginning/ending amounts, category changes, continuity failures, and source drilldown in `apps/web/src/features/k1-tracker/components/LiabilitiesPanel.tsx`
- [X] T074 [P] [US4] Implement Section L reported/calculated component variances, book-tax explanations, unexplained variance, and individual check results in `apps/web/src/features/k1-tracker/components/ReconciliationPanel.tsx`
- [X] T075 [US4] Complete selected-year and maximum-three-year comparison rendering with sticky labels and warnings in `apps/web/src/features/k1-tracker/components/K1TrackerPageContent.tsx` and `apps/web/src/features/k1-tracker/components/CompareYearsDrawer.tsx`
- [ ] T076 [US4] Run all US4 tests and verify golden basis values, defect regressions, loss limitations, distributions, liabilities, and reconciliation using `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: User Story 4 reproduces the workbook's intended tax workflow with authoritative ordering and corrected reconciliation behavior.

---

## Phase 7: User Story 5 - Prepare Year-End Journal Entries and Sign Off (Priority: P3)

**Goal**: A preparer can review balanced tax-versus-book journal entries, explain remaining differences, and complete revision-specific preparation and independent review sign-off.

**Independent Test**: Produce a zero-sum five-account journal, prevent sign-off when any gate fails, prepare and review as different Admins, then change an input and verify both sign-offs are invalidated.

### Tests for User Story 5

- [ ] T077 [P] [US5] Write failing journal calculation, zero-balance, copy-format, sign-off gate, separate-preparer/reviewer, stale-revision, and invalidation contract tests in `apps/api/tests/k1-tracker.signoff.contract.test.ts`
- [ ] T078 [P] [US5] Write failing Journal Entry and Sign-off panel rendering, copy, permission, focus, failed-gate, distinct-user, and invalidation tests in `apps/web/src/features/k1-tracker/__tests__/K1TrackerSignoff.test.tsx`

### Implementation for User Story 5

- [X] T079 [US5] Complete interest, dividend, realized-gain/loss, general partnership income, balancing investment entry, and zero-check calculations in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts`
- [X] T080 [US5] Implement append-only prepare/review/invalidate reads and writes linked to exact year revisions in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T081 [US5] Implement sign-off gating, distinct-user enforcement, invalidation reasons, workflow transition, and audit handlers in `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`
- [X] T082 [US5] Complete `/years/{taxYear}/signoffs` route validation and conflict responses in `apps/api/src/modules/k1-tracker/k1-tracker.routes.ts`
- [ ] T083 [P] [US5] Implement debit-positive/credit-negative rows, balance check, source detail, and accessible clipboard format in `apps/web/src/features/k1-tracker/components/JournalEntryPanel.tsx`
- [X] T084 [P] [US5] Implement preparation/review state, failed-gate explanations, distinct-reviewer guidance, history, and invalidation state in `apps/web/src/features/k1-tracker/components/SignOffPanel.tsx`
- [X] T085 [US5] Add sign-off client/hook mutations and integrate Journal Entries and Sign-off tabs into `apps/web/src/features/k1-tracker/api/k1TrackerClient.ts`, `apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts`, and `apps/web/src/features/k1-tracker/components/K1TrackerPageContent.tsx`
- [ ] T086 [US5] Run all US5 tests and execute the journal-entry and sign-off sections of `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: All five user stories are independently functional and the full CPA workflow is available.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate resilience, security, accessibility, performance, and full-stack consistency across completed stories.

- [ ] T087 [P] Add end-to-end keyboard, focus-trap/return, accessible-name, warning-announcement, and unsaved-dismiss regression coverage in `apps/web/src/features/k1-tracker/__tests__/K1TrackerAccessibility.test.tsx`
- [ ] T088 [P] Add 50-year response/query-count, selected-year payload, cached navigation, and five-second workbook-preview performance coverage in `apps/api/tests/k1-tracker.performance.integration.test.ts` and `apps/web/src/features/k1-tracker/__tests__/K1TrackerPerformance.test.tsx`
- [ ] T089 [P] Add malicious workbook, oversized preview JSON, formula/external-link handling, filename/error sanitization, expired-batch cleanup, and cross-entity import security tests in `apps/api/tests/k1-tracker.import-security.integration.test.ts`
- [ ] T090 Verify tracker data, source revisions, import results, conflicts, audit events, projections, and sign-offs survive an API restart in `apps/api/tests/k1-tracker.persistence.integration.test.ts`
- [ ] T091 Normalize responsive spacing, tab overflow, sticky comparison labels, loading skeletons, empty/filtered-empty/error/restricted states, and reduced motion in `apps/web/src/features/k1-tracker/components/K1TrackerPageContent.tsx`
- [X] T092 Run all focused tests with `npm run test:api -- k1-tracker` and `npm run test:web -- k1-tracker`, fixing every failure under `apps/api/src/modules/k1-tracker/`, `apps/api/tests/`, and `apps/web/src/features/k1-tracker/`
- [ ] T093 Run `npm run build:api`, `npm run build:web`, and `npm run --workspace=web lint`, fixing type, bundle, and lint errors under `apps/api/src/modules/k1-tracker/`, `apps/web/src/features/k1-tracker/`, and `packages/types/src/k1-tracker.ts`
- [ ] T094 Execute every validation section in `specs/016-k1-tracker/quickstart.md` and record any intentional calculation-version or environment caveats in `specs/016-k1-tracker/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: Starts immediately.
- **Phase 2 - Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 - US1**: Depends on Phase 2; establishes the shared read page and is the technical MVP.
- **Phase 4 - US2**: Backend work can start after Phase 2; page integration tasks T049-T050 depend on the US1 page shell.
- **Phase 5 - US3**: Backend work can start after Phase 2; editor integration tasks T064-T065 depend on the US1 page shell.
- **Phase 6 - US4**: Depends on the foundational calculator and US1 read surface; it does not require workbook import or manual editing to validate against fixtures.
- **Phase 7 - US5**: Depends on US4 check calculations and US3 sign-off invalidation plumbing.
- **Phase 8 - Polish**: Depends on all user stories selected for the release.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (read-only technical MVP)
                      |---> US2 (workbook migration)
                      |---> US3 (manual maintenance)
                      `---> US4 (basis/reconciliation depth) -> US5 (journal/sign-off)

Practical P1 release: US1 + US2
Full release: US1 + US2 + US3 + US4 + US5
```

### Within Each User Story

1. Write the listed tests and confirm expected failures.
2. Complete repository/calculation work before handlers.
3. Complete handlers before route/client integration.
4. Complete UI primitives before page composition.
5. Run the story's focused tests and independent quickstart checkpoint before starting the next sequential story.

## Parallel Opportunities

- T002 and T004 can run while T001 prepares the deterministic workbook fixture.
- T005, T006, T010, and T011 touch independent foundation files and can start together after shared types exist.
- US1 API tests, authz tests, navigation tests, and YearRail tests (T019-T022) can be written in parallel.
- US1 UI primitives T028-T032 can be implemented in parallel after T026-T027 establish client/hook shapes.
- US2 parser, contract, integration, and dialog tests (T038-T041) can be written in parallel.
- US2 web client work T047 can run alongside API parser/repository work T042-T044.
- US3 tests T052-T055 can be written in parallel, and client work T062 can run alongside API orchestration T056-T061 once contract types are fixed.
- US4 tests T067-T069 and panels T072-T074 operate in separate files and can run in parallel within their dependency groups.
- US5 API and UI tests T077-T078 can run in parallel; Journal and Sign-off panels T083-T084 can also run in parallel.
- Polish tasks T087-T089 target distinct test files and can run in parallel.

## Parallel Examples

### User Story 1

```text
T019: Contract tests in apps/api/tests/k1-tracker.contract.test.ts
T020: Authorization tests in apps/api/tests/k1-tracker.authz.integration.test.ts
T021: Navigation/page-state tests in apps/web/src/features/k1-tracker/__tests__/K1TrackerNavigation.test.tsx
T022: Year rail tests in apps/web/src/features/k1-tracker/__tests__/YearRail.test.tsx
```

### User Story 2

```text
T038: Workbook parser tests
T039: Import contract tests
T040: Import transaction tests
T041: Import dialog tests
```

### User Story 3

```text
T052: Mutation contract tests
T053: Revision/carryforward integration tests
T054: Finalized K-1 source-sync tests
T055: Guided editor tests
```

### User Story 4

```text
T067: Golden calculation and defect regression tests
T068: Annual projection tests
T069: Reconciliation UI tests
```

### User Story 5

```text
T077: Journal/sign-off API contract tests
T078: Journal/sign-off UI tests
T083: JournalEntryPanel implementation
T084: SignOffPanel implementation
```

## Implementation Strategy

### Technical MVP First

1. Complete Setup and Foundation.
2. Complete US1.
3. Stop and validate the read-only partnership/year experience with seeded data.
4. Add US2 for the practical P1 release that can migrate the real workbook history.

### Incremental Delivery

1. **US1**: Compact partnership/year review.
2. **US2**: Safe historical workbook migration.
3. **US3**: Controlled annual entry, overrides, and rollover maintenance.
4. **US4**: Full basis, loss, liability, Section L, and book-tax reconciliation.
5. **US5**: Journal entries and revision-specific sign-off.
6. **Polish**: Security, restart persistence, performance, accessibility, and full quickstart validation.

### Suggested Commit Boundaries

- Commit Setup + Foundation after T018 passes.
- Commit each user story only after its checkpoint task passes.
- Keep CPA-workbook fixture changes separate from production calculation changes so golden inputs remain reviewable.
- Do not combine unrelated legacy K-1 cleanup with this feature unless a listed task requires it.

## Notes

- `[P]` tasks are safe only when their prerequisite contract shapes are already fixed.
- All tracker money remains decimal strings at interfaces and integer cents in authoritative calculations.
- `partnership_annual_activity` is a downstream projection, not the tracker source of truth.
- Existing `/k1` processing, `/reports` Activity Detail, unused MUI K1 dashboards, and process-local K-1 repositories must not become tracker dependencies.
- Workbook-specific tax departures require a named CPA-approved calculation version and tests; they must not be introduced as unreviewed magic formulas.
