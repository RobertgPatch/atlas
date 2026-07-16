---

description: "Implementation tasks for Partnership Tracker revisions"
---

# Tasks: Partnership Tracker Revisions

**Input**: Design documents from `/specs/017-partnership-tracker-revisions/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/partnership-tracker-revisions.openapi.yaml`, `quickstart.md`

**Tests**: Automated tests are required by SC-007 and SC-008. Within every user-story phase, write the listed tests first and confirm that they fail for the intended missing behavior before implementing the change.

**Organization**: Tasks are grouped by user story so each story can be implemented, verified, and delivered independently after the shared foundation is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks in the same group because it changes different files and has no unmet dependency.
- **[Story]**: Maps the task to a user story from `spec.md`.
- Every task names the exact file or files it changes or validates.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Prepare reusable fixtures for the cross-cutting financial, owner, and long-history scenarios.

- [X] T001 [P] Extend the API Partnership Tracker fixture builder with configurable inception dates, fee rates, effective commitments, multi-year cash flows, NAV dates, and source/target owners in `apps/api/tests/helpers/partnershipTrackerFixture.ts`
- [X] T002 [P] Extend web test fixtures with available/unavailable performance metrics, four-year and ten-year summaries, explicit-zero/null values, and multiple owners in `apps/web/src/features/partnership-tracker/__tests__/fixtures.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared partnership configuration and contract support required by the performance, fee, and owner stories.

**CRITICAL**: Complete this phase before starting any user-story implementation.

- [X] T003 [P] Write failing contract tests for creating, reading, updating, clearing, and validating partnership `inceptionDate` and `managementFeeRate` in `apps/api/tests/partnership-tracker.contract.test.ts`
- [X] T004 [P] Write failing PostgreSQL persistence tests for nullable inception dates, rate range enforcement, future-date rejection, and optimistic concurrency in `apps/api/tests/partnership-tracker.persistence.integration.test.ts`
- [X] T005 Add nullable `partnerships.inception_date`, nullable `partnerships.management_fee_rate numeric(9,8)`, and the inclusive 0-to-1 rate constraint in `apps/api/src/infra/db/migrations/021_partnership_tracker_revisions.sql`
- [X] T006 Add `inceptionDate` and `managementFeeRate` to partnership identity, create, update, and exact-decimal wire types in `packages/types/src/partnership-tracker.ts`
- [X] T007 Implement inception/rate request validation, database mapping, PATCH persistence, explicit-null clearing, future-date rejection, and response serialization in `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`, `apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts`, and `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`

**Checkpoint**: The additive migration and shared partnership configuration contract are ready for all stories.

---

## Phase 3: User Story 1 - Trust Current Partnership Returns (Priority: P1) MVP

**Goal**: Show precise IRR and reliable cash-on-cash, unfunded commitment, unrealized gain, and NAV metrics even when NAV predates newer cash flows.

**Independent Test**: Create a partnership with inception, canonical paid-in capital, distributions, commitment, ending outside basis, and an older NAV; verify `7.87%` IRR display, carried-forward terminal metadata, annualized cash-on-cash, signed unfunded/unrealized values, explicit missing states, and exactly one NAV presentation.

### Tests for User Story 1

- [X] T008 [P] [US1] Write failing deterministic tests for eight-decimal IRR serialization, stale-NAV terminal carry-forward, unique-root availability, annualized cash-on-cash day math, signed unfunded commitment, signed unrealized gain, and missing-input statuses in `apps/api/tests/partnership-tracker.performance.test.ts`
- [X] T009 [P] [US1] Write failing PostgreSQL summary tests for canonical contribution precedence, legacy contribution fallback, absolute distributions, latest basis/NAV selection, terminal-date metadata, and no NAV source mutation in `apps/api/tests/partnership-tracker.performance.integration.test.ts`
- [X] T010 [P] [US1] Write failing React tests for `7.87%` formatting, all new metric states, adjacent unfunded amount/percentage, actual NAV date display, and a single NAV metric in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPerformance.test.tsx`

### Implementation for User Story 1

- [X] T011 [US1] Add performance summary fields, per-metric availability statuses, as-of date, and IRR terminal metadata to `packages/types/src/partnership-tracker.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`
- [X] T012 [US1] Implement precise IRR solving/serialization, NAV terminal carry-forward without source mutation, actual-days/365.25 cash-on-cash annualization, and signed unfunded/unrealized formulas in `apps/api/src/modules/partnership-tracker/partnership-performance.ts`
- [X] T013 [US1] Compose the new metrics from canonical active K-1 revisions, current commitment, latest NAV, and latest ending outside basis in the existing set-based summary query in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T014 [P] [US1] Render IRR and ratio values with exactly two percentage decimals and add Annualized Cash on Cash Yield, adjacent Unfunded Commitment amount/percentage, and Unrealized Gain states in `apps/web/src/features/partnership-tracker/components/PerformanceMetricStrip.tsx`
- [X] T015 [P] [US1] Remove the duplicate overview NAV presentation and expose actual NAV/as-of provenance plus explicit unavailable states without substituting zero in `apps/web/src/features/partnership-tracker/components/PartnershipOverview.tsx`

**Checkpoint**: User Story 1 is independently functional and its focused API and web tests pass.

---

## Phase 4: User Story 2 - Compare Every Partnership Year (Priority: P1)

**Goal**: Compare any number of available years, selected all by default, using exactly Capital Contributed, Distributions, and Ending Outside Basis in a fit-before-scroll surface with no clipped content.

**Independent Test**: Open four-year and ten-year fixtures at desktop and mobile widths; verify all years initially selected, one-through-all selection, canonical/null/zero values, no scrollbar when readable minima fit, table-only scrolling when they do not, sticky metric labels, and complete controls/headers/three-row visibility.

### Tests for User Story 2

- [X] T016 [P] [US2] Write failing API contract tests for additive `capitalContributed` and `distributions` year-summary fields, canonical-versus-legacy precedence, absolute distributions, and missing-versus-explicit-zero serialization in `apps/api/tests/k1-tracker.contract.test.ts`
- [X] T017 [P] [US2] Write failing responsive and accessibility tests for all-years default selection, no three-year cap, exactly three rows, four-year fit, ten-year table-only overflow, sticky labels, nonconsecutive selection, and unclipped mobile/desktop content in `apps/web/src/features/k1-tracker/__tests__/CompareYearsDrawer.test.tsx`

### Implementation for User Story 2

- [X] T018 [US2] Add nullable `capitalContributed` and `distributions` fields to `K1TrackerYearSummary` while preserving `endingOutsideBasis` in `packages/types/src/k1-tracker.ts` and `apps/api/src/modules/k1-tracker/k1-tracker.contracts.ts`
- [X] T019 [US2] Populate annual canonical contribution/fallback and absolute distribution values with active-revision presence semantics in the existing partnership year-summary read in `apps/api/src/modules/k1-tracker/k1-tracker.projection.ts` and `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T020 [US2] Preserve the additive year-summary fields and null-versus-zero values in the existing detail response without per-year requests in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/__tests__/partnershipTrackerClient.test.ts`
- [X] T021 [US2] Replace the capped comparison UI with all-years selection, the exact three metric rows, 12rem/8rem minimum tracks, viewport-width growth, sticky labels, `100dvh` bounded layout, and table-only conditional horizontal overflow in `apps/web/src/features/k1-tracker/components/CompareYearsDrawer.tsx`

**Checkpoint**: User Story 2 works from the existing partnership detail payload and passes four-year, long-history, desktop, and mobile checks independently.

---

## Phase 5: User Story 3 - Configure and Track Management Fees (Priority: P1)

**Goal**: Configure and calculate transparent commitment-based management-fee estimates while splitting actual K-1 Line 13 portfolio deductions and management fees without changing historical results or double-counting.

**Independent Test**: Configure inception, fee rate, and effective commitments; verify normal/leap-year and midyear-change schedules, then save both new Line 13 fields and verify every calculation uses their sum exactly once while legacy-only years and Box 18C behavior remain unchanged.

### Tests for User Story 3

- [X] T022 [P] [US3] Write failing pure tests for inclusive active days, 365/366 denominators, effective commitment segments, zero rate, missing inputs, as-of validation, half-away-from-zero cent rounding, annual rows, and cumulative totals in `apps/api/tests/partnership-tracker.management-fee.test.ts`
- [X] T023 [P] [US3] Write failing management-fee endpoint contract, scoped-read, configuration persistence, and estimate-does-not-write-K-1 tests in `apps/api/tests/partnership-tracker.contract.test.ts` and `apps/api/tests/partnership-tracker.authz.integration.test.ts`
- [X] T024 [P] [US3] Write failing K-1 tests for split Line 13 writes, legacy presence fallback, explicit-null migration, deprecated legacy writes, exactly-once deductions across basis/reconciliation/journal output, calculation-version increment, and unchanged Box 18C treatment in `apps/api/tests/k1-tracker.calculation.test.ts`, `apps/api/tests/k1-tracker.contract.test.ts`, and `apps/api/tests/partnership-tracker.calculation-regression.test.ts`
- [X] T025 [P] [US3] Write failing React tests for fee configuration/schedule states and separate K-1 Line 13 editor fields with no estimate prefill in `apps/web/src/features/partnership-tracker/__tests__/ManagementFeePanel.test.tsx` and `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx`

### Implementation for User Story 3

- [X] T026 [US3] Add management-fee configuration, availability, annual-row, schedule, exact money/ratio, and optional `asOfDate` wire types in `packages/types/src/partnership-tracker.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`
- [X] T027 [US3] Implement the pure integer-cent/rational management-fee segment calculator with inclusive dates, leap years, effective commitments, and final annual/cumulative rounding in `apps/api/src/modules/partnership-tracker/management-fee.ts`
- [X] T028 [US3] Load inception, rate, and effective-dated commitments and return the derived detail-only schedule without persistence in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T029 [US3] Add validated `GET /v1/partnership-tracker/partnerships/{partnershipId}/management-fees`, optional `asOfDate`, scoped authorization, and explicit unavailable/error responses in `apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts`, `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts`, and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`
- [X] T030 [P] [US3] Add `box_13_other_portfolio_deductions` and `box_13_management_fees`, deprecate legacy writes, and expose labels/provenance in `packages/types/src/k1-tracker.ts`, `apps/api/src/modules/k1-tracker/k1-tracker.field-map.ts`, and `apps/api/src/modules/k1-tracker/k1-tracker.zod.ts`
- [X] T031 [US3] Implement presence-based effective Line 13 normalization, exactly-once downstream use, and the new calculation version in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts`
- [X] T032 [US3] Add fee schedule fetching, as-of query keys, configuration mutation wiring, and targeted invalidation in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T033 [US3] Build the Capital & NAV management-fee configuration and annual schedule surface with missing-input, zero-rate, through-date, and cumulative states in `apps/web/src/features/partnership-tracker/components/ManagementFeePanel.tsx` and integrate it in `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`
- [X] T034 [US3] Replace the editable legacy Line 13 control with `Other Portfolio Deductions` and `Management Fees` fields while preserving legacy provenance display in `apps/web/src/features/k1-tracker/k1FieldGroups.ts` and `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`

**Checkpoint**: User Story 3 independently produces reproducible fee estimates and backward-compatible actual K-1 calculations without coupling the two data sources.

---

## Phase 6: User Story 4 - Manage Owners Reliably (Priority: P1)

**Goal**: Use Owner terminology, repair PostgreSQL-backed owner rename, and atomically reassign partnerships and all owner-scoped child history with audit, sign-off, authorization, conflict, rollback, and cache guarantees.

**Independent Test**: Rename a database-backed owner and verify all reads refresh, then reassign a partnership through Edit Partnership and verify all child rows move, IDs/history remain, tracker years require review, sign-offs are invalidated, audit evidence is complete, and all conflict/failure cases roll back.

### Tests for User Story 4

- [X] T035 [P] [US4] Write failing database-backed owner rename tests for success, normalized duplicate conflict, not-found behavior, Admin authorization, before/after audit data, and immediate readback in `apps/api/tests/entities.detail.contract.test.ts`
- [X] T036 [P] [US4] Write failing owner reassignment tests for all eight owner-scoped table updates, unchanged financial/history IDs, revision increments, `NEEDS_REVIEW`, `Partnership owner changed` invalidations, child counts, no-op behavior, duplicate/stale/scope conflicts, and injected-failure rollback in `apps/api/tests/partnership-tracker.lifecycle.integration.test.ts`, `apps/api/tests/partnership-tracker.persistence.integration.test.ts`, and `apps/api/tests/partnership-tracker.authz.integration.test.ts`
- [X] T037 [P] [US4] Write failing React tests for owner rename error handling/cache refresh, Owner labels, initialized edit selection, reassignment submission, and source/target view refresh in `apps/web/src/pages/EntitiesPage.test.tsx` and `apps/web/src/features/partnership-tracker/__tests__/PartnershipCreationFlow.test.tsx`

### Implementation for User Story 4

- [X] T038 [P] [US4] Replace process-local entity lookup on deployed rename with a PostgreSQL-canonical locked transaction, normalized duplicate check, updated timestamp, and before/after audit write in `apps/api/src/modules/partnerships/entities.admin.routes.ts`
- [X] T039 [P] [US4] Add optional `entityId` to the partnership PATCH contract with UUID validation, Admin/scope requirements, and expected timestamp semantics in `packages/types/src/partnership-tracker.ts`, `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`, and `apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts`
- [X] T040 [US4] Implement the locked owner reassignment transaction across `partnerships`, `document_versions`, `k1_reported_distributions`, `partnership_commitments`, `capital_activity_events`, `partnership_annual_activity`, `k1_tracker_years`, and targeted `k1_tracker_import_batches`, including collision checks, revisions, review status, sign-off invalidations, row counts, and all-or-nothing rollback in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T041 [US4] Pass source/target scope and concurrency context through the update handler and emit owner before/after, affected child counts, and sign-off invalidation evidence through existing audit events in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/audit/audit.events.ts`
- [X] T042 [US4] Invalidate entity detail/list, K-1 lookups/tracker, Partnership Tracker, legacy partnership, source/target owner, dashboard, and report query families after rename or reassignment in `apps/web/src/features/partnerships/hooks/useEntityQueries.ts`, `apps/web/src/features/partnerships/hooks/usePartnershipMutations.ts`, and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T043 [US4] Relabel partnership create/edit selectors to `Owner`, add initialized owner reassignment to the tracker edit dialog, and submit the current optimistic-concurrency token in `apps/web/src/features/partnership-tracker/components/AddPartnershipDialog.tsx` and `apps/web/src/features/partnership-tracker/components/EditPartnershipDialog.tsx`
- [X] T044 [US4] Apply the same Owner labels/selectors to remaining shared partnership flows and keep rename failures visible on the owner page in `apps/web/src/features/partnerships/components/AddPartnershipDialog.tsx`, `apps/web/src/features/partnerships/components/EditPartnershipDialog.tsx`, and `apps/web/src/pages/EntitiesPage.tsx`

**Checkpoint**: User Story 4 independently supports durable owner rename and atomic reassignment with complete cache and audit propagation.

---

## Phase 7: User Story 5 - Use the Revised Tracker Navigation (Priority: P2)

**Goal**: Rename K-1 navigation and add a URL-addressable, read-only Underlying Assets placeholder immediately after Capital & NAV.

**Independent Test**: Open and bookmark `area=assets`; verify the tab order `Overview`, `K1 Entry`, `Capital & NAV`, `Underlying Assets`, restored URL state, a clear coming-soon view, and no asset mutation or request.

### Tests for User Story 5

- [X] T045 [P] [US5] Write failing navigation and accessibility tests for the revised label/order, `area=assets` parsing/restoration, read-only coming-soon content, and absence of asset mutation controls/requests in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx` and `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx`

### Implementation for User Story 5

- [X] T046 [US5] Create the compact read-only coming-soon state with no data hooks or mutation controls in `apps/web/src/features/partnership-tracker/components/UnderlyingAssetsPlaceholder.tsx`
- [X] T047 [US5] Rename `K-1 & Basis` to `K1 Entry`, add `Underlying Assets` after `Capital & NAV`, accept and emit `area=assets`, and render the placeholder in `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`

**Checkpoint**: User Story 5 is independently navigable, bookmarkable, accessible, and clearly nonfunctional beyond the placeholder.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Prove migration safety, regression compatibility, responsive behavior, and production build integrity across the complete feature.

- [X] T048 [P] Run the focused API suites with `ATLAS_TEST_DATABASE_URL` for performance, management fees, Partnership Tracker, K-1 Tracker, entities, authorization, persistence, and rollback scenarios in `apps/api/tests/partnership-tracker.performance.test.ts`, `apps/api/tests/partnership-tracker.management-fee.test.ts`, `apps/api/tests/partnership-tracker.persistence.integration.test.ts`, `apps/api/tests/k1-tracker.calculation.test.ts`, and `apps/api/tests/entities.detail.contract.test.ts`
- [X] T049 [P] Run the focused web suites for performance metrics, all-years comparison, management fees, owner workflows, navigation, and accessibility in `apps/web/src/features/partnership-tracker/__tests__/`, `apps/web/src/features/k1-tracker/__tests__/CompareYearsDrawer.test.tsx`, and `apps/web/src/pages/EntitiesPage.test.tsx`
- [X] T050 Apply Migration 021 against a clean and an existing PostgreSQL database, then run `npm run test:api`, `npm run test:web`, `npm run build:api`, and `npm run build:web`, resolving only feature-related regressions in `apps/api/src/`, `apps/web/src/`, and `packages/types/src/`
- [ ] T051 Execute the desktop/mobile browser checklist, including canvas-free screenshot inspection for four-year fit, ten-year table scrolling, no clipping/overlap, management-fee layout, owner dialogs, and `area=assets`, using `specs/017-partnership-tracker-revisions/quickstart.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1, Setup**: Starts immediately; T001 and T002 can run in parallel.
- **Phase 2, Foundational**: Depends on Phase 1. T003 and T004 must fail first; T005 and T006 may then proceed in parallel; T007 depends on both.
- **User Stories, Phases 3-7**: Depend on Phase 2. Their test tasks must be written and observed failing before their implementation tasks begin.
- **Phase 8, Polish**: Depends on every user story selected for release.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2 and has no dependency on another story.
- **US2 (P1)**: Starts after Phase 2 and has no behavioral dependency on another story; coordinate shared K-1 contract files with US3 if developed concurrently.
- **US3 (P1)**: Starts after Phase 2 and has no behavioral dependency on another story; its management-fee estimate remains independent of actual K-1 values.
- **US4 (P1)**: Starts after Phase 2 and has no dependency on another story; its partnership update shape reuses the foundational concurrency contract.
- **US5 (P2)**: Starts after Phase 2 and has no dependency on another story.

### Within Each User Story

- Write tests first and confirm they fail for the intended missing behavior.
- Add shared wire types and validation before services/repositories.
- Implement pure financial calculations before repository or route composition.
- Complete API behavior before wiring clients and UI.
- Run the story's focused tests at its checkpoint before merging with another story.

## Parallel Opportunities

- T001 and T002 can run together.
- T003 and T004 can run together; after both fail as expected, T005 and T006 can run together.
- US1 test tasks T008-T010 can run together; UI tasks T014 and T015 can run together after T013.
- US2 test tasks T016-T017 can run together.
- US3 test tasks T022-T025 can run together; T030 can proceed alongside fee-calculation work because it changes K-1 files rather than fee files.
- US4 test tasks T035-T037 can run together; T038 and T039 can run together.
- US5 test task T045 can be prepared independently while other story tests are running.
- Once the stories are implemented, T048 and T049 can run in parallel before T050 and T051.

## Parallel Examples

### User Story 1

```text
T008: API pure performance tests
T009: PostgreSQL performance summary tests
T010: React performance presentation tests
```

### User Story 2

```text
T016: K-1 year-summary contract tests
T017: Compare Years responsive/accessibility tests
```

### User Story 3

```text
T022: Pure management-fee tests
T023: Fee endpoint and authorization tests
T024: Split Line 13 calculation/contract tests
T025: Fee panel and K-1 editor tests
```

### User Story 4

```text
T035: Database-backed owner rename tests
T036: Atomic owner reassignment tests
T037: Owner UI and cache tests
```

### User Story 5

```text
T045: Navigation, URL restoration, and accessibility tests
```

## Implementation Strategy

### MVP First: User Story 1

1. Complete Phase 1 and Phase 2.
2. Complete T008-T015 for precise and current partnership returns.
3. Run the US1 checkpoint tests and validate the stale-NAV fixture independently.
4. Deploy or demo that increment before adding more stories if an early release is needed.

### Incremental Delivery

1. Setup + Foundation -> additive configuration contract is ready.
2. US1 -> trusted performance metrics and stale-NAV support.
3. US2 -> complete all-years comparison.
4. US3 -> management-fee estimates and split actual Line 13 values.
5. US4 -> reliable owner rename and reassignment.
6. US5 -> revised tracker navigation and placeholder.
7. Polish -> full regression, build, migration, and responsive browser gates.

### Parallel Team Strategy

After Phase 2, separate developers can own US1, US2, US3, US4, and US5. US2 and US3 both touch shared K-1 contract/calculation files, so sequence those specific tasks or coordinate their patches while the remaining story work proceeds independently.

## Notes

- `[P]` means the task changes different files and has no unmet dependency in its declared group.
- Exact money remains decimal-string cents; ratios remain fixed-decimal unit-ratio strings.
- Missing data must remain distinguishable from explicit zero in API and UI behavior.
- Management-fee estimates never create or overwrite K-1 revisions.
- Owner is a UI term; Entity remains the internal model and route noun.
- Commit after each task or cohesive task group, and stop at any checkpoint for independent validation.
