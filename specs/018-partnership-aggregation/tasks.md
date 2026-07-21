# Tasks: Partnership Aggregation

**Input**: Design documents from `/specs/018-partnership-aggregation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/partnership-aggregation.openapi.yaml, quickstart.md

**Tests**: Test tasks are included because the specification requires calculation, contract, integration, authorization, performance, responsive, and accessibility verification. Write each story's tests first and confirm they fail for the intended reason before implementation.

**Organization**: Tasks are grouped by user story so each story produces an independently testable increment. Exact paths follow the existing Jackson API/web/shared-type structure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated prerequisites because it changes a different file and does not depend on another incomplete task in the same group.
- **[Story]**: Maps the task to US1, US2, US3, or US4 from spec.md.
- Every checklist item contains an exact repository-relative file path.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Establish deterministic aggregate fixtures used across story-level tests without changing production behavior.

- [X] T001 Create deterministic Alpha/Beacon/Cedar/Delta/External aggregate seed helpers, scoped users, cleanup, and bulk-row generation in apps/api/tests/helpers/partnershipAggregationFixture.ts
- [X] T002 [P] Add complete, missing-data, warning, partial-coverage, zero, and negative aggregate response fixtures in apps/web/src/features/partnership-tracker/__tests__/fixtures.ts

---

## Phase 2: Foundational (Blocking Contracts)

**Purpose**: Define the additive wire model consumed by every user story.

**Critical**: Complete this phase before any user-story implementation so API, tests, and web compile against one contract.

- [X] T003 Add aggregation enums, normalized query, aggregate row, covered money/ratio, rollup, facet, page-info, and response types plus public exports in packages/types/src/partnership-tracker.ts and packages/types/src/index.ts
- [X] T004 Mirror the shared aggregation constants and response interfaces inside the API compiler boundary in apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts

**Checkpoint**: Shared and API-local contracts represent contracts/partnership-aggregation.openapi.yaml with exact money/ratio strings and no aggregate IRR field.

---

## Phase 3: User Story 1 - See the Partnership Portfolio at a Glance (Priority: P1) — MVP

**Goal**: Deliver an authenticated aggregate page showing every permitted partnership, complete filtered-scope KPIs with coverage, and comparable financial rows without averaging IRR.

**Independent Test**: Seed the quickstart Alpha/Beacon/Cedar/Delta/External dataset, load `/partnership-aggregation`, and verify the four permitted rows, exact KPI totals/coverage/DPI/TVPI, NAV date range, data-quality labels, missing-versus-zero display, and absence of External Fund and portfolio IRR.

### Tests for User Story 1

- [X] T005 [P] [US1] Add failing pure tests for warning-first quality classification, integer-cent sums, known-zero coverage, signed unfunded totals, partial/full/no-data/zero-denominator DPI and TVPI, NAV date range, default name order, page slicing, and absence of aggregate IRR in apps/api/tests/partnership-tracker.aggregation.test.ts
- [X] T006 [P] [US1] Add failing HTTP contract tests for authentication, default normalized query, exact response shape, money/ratio precision, loading-database failure behavior, and static aggregation route resolution in apps/api/tests/partnership-tracker.contract.test.ts
- [X] T007 [P] [US1] Add failing PostgreSQL integration tests proving canonical tracker row parity, full-scope rollup before pagination, one set-based candidate projection, and a 500-partnership response under two seconds in apps/api/tests/partnership-tracker.aggregation.integration.test.ts
- [X] T008 [P] [US1] Add failing authorization tests proving member scope, Admin scope, base facets, totals, and NAV ranges never disclose External Fund or Outside Owner in apps/api/tests/partnership-tracker.aggregation.authz.integration.test.ts
- [X] T009 [P] [US1] Add failing web tests for populated KPI/table rendering, coverage labels, true zero, negative values, missing-value reasons, no portfolio IRR, loading, base-empty, partial-data, error, and retry states in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationPage.test.tsx

### Implementation for User Story 1

- [X] T010 [US1] Implement exact-cent parsing/serialization, exclusive data-quality classification, covered money, covered DPI/TVPI, NAV date range, default stable name ordering, and page slicing in apps/api/src/modules/partnership-tracker/partnership-aggregation.ts
- [X] T011 [US1] Refactor the existing summaryRows/mapSummary pipeline into a reusable complete scoped candidate projection without changing list/detail output in apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts
- [X] T012 [US1] Add aggregation query defaults and safe base parsing for search, sort, direction, page, and pageSize in apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts
- [X] T013 [US1] Compose default aggregation candidates, base-scope facets, complete rollup, and requested page through the shared summary projection in apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts
- [X] T014 [US1] Add the authenticated GET /partnership-tracker/aggregation handler and register the static route without colliding with partnershipId routes in apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts and apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts
- [X] T015 [US1] Add the aggregation GET client, query-key family, and basic TanStack Query hook in apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts and apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts
- [X] T016 [P] [US1] Build the segmented Jackson KPI band with exact money/ratio formatting, metric coverage, partial status, NAV range, and no IRR card in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationKpis.tsx
- [X] T017 [P] [US1] Build the semantic aggregate table with every required partnership/owner/workflow/capital/NAV/return/quality field and explicit missing-state text in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx
- [X] T018 [US1] Compose the gold-index ledger header, base result count, KPI band, table, and distinct loading/base-empty/partial/error/retry states in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx and apps/web/src/features/partnership-tracker/components/aggregation/index.ts
- [X] T019 [US1] Add the authenticated `/partnership-aggregation` page wrapper and application route while preserving the current tracker route in apps/web/src/pages/PartnershipAggregationPage.tsx and apps/web/src/App.tsx

**Checkpoint**: US1 independently renders a correct read-only portfolio ledger from one scoped aggregate request and passes T005–T009.

---

## Phase 4: User Story 2 - Filter and Sort the Complete Partnership Book (Priority: P1)

**Goal**: Add complete-scope search, multi-select facets, all 14 sort keys, stable pagination, canonical URL state, and clear-all behavior while keeping rows, totals, facets, and result counts consistent.

**Independent Test**: Seed 30+ varied partnerships, exercise every filter alone and in combination, sort every supported column both ways, traverse all pages, copy/refresh the URL, and verify results, rollup, base facets, normalized query, and pagination describe one consistent scope.

### Tests for User Story 2

- [X] T020 [P] [US2] Add failing pure tests for case-insensitive search, AND-between/OR-within filters, NO_K1_YEAR, stable base facets, all 14 asc/desc sort keys, null-last behavior, stable name/ID ties, invalid query normalization, and final-page clamping in apps/api/tests/partnership-tracker.aggregation.test.ts
- [X] T021 [P] [US2] Add failing 130-row integration tests for combined filters, out-of-scope owner removal, full rollup before page slicing, no duplicate/skipped IDs, unchanged facets across pages, and zero-match page metadata in apps/api/tests/partnership-tracker.aggregation.integration.test.ts
- [X] T022 [P] [US2] Add failing comma-separated query serialization, canonical defaults, invalid-value handling, and response parsing tests in apps/web/src/features/partnership-tracker/__tests__/partnershipTrackerClient.test.ts
- [X] T023 [P] [US2] Add failing browser-state tests for URL restoration, replace-based search/filter updates, clear-all removal, filter/page-size reset to page 1, sort direction, page history, server-normalized state, and the distinct no-filter-match result state in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationUrlState.test.tsx

### Implementation for User Story 2

- [X] T024 [US2] Extend aggregation query parsing to canonical comma-separated owner/type/lifecycle/workflow/quality arrays, safe enum/UUID removal, search trimming, sort defaults, and 25/50/100 page sizes in apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts
- [X] T025 [US2] Implement base-scope facet counting, normalized owner filtering, combined filters, all exact money/ratio/integer/string comparators, null-last stable sorting, page clamping, and empty-page metadata in apps/api/src/modules/partnership-tracker/partnership-aggregation.ts
- [X] T026 [US2] Pass normalized aggregate query state through the handler/repository and return facets, complete filtered rollup, globally sorted page items, and echoed normalized query in apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts and apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts
- [X] T027 [US2] Implement canonical aggregation parameter serialization, parameterized query keys, keep-previous-data transitions, and response-query reconciliation in apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts and apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts
- [X] T028 [P] [US2] Build labeled desktop search and multi-select owner/sector-type/lifecycle/workflow/quality controls with facet counts and clear-all behavior in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationFilters.tsx
- [X] T029 [P] [US2] Add accessible sort controls for all required columns plus stable previous/next/page-size controls to apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx
- [X] T030 [US2] Own canonical filters/sort/page in useSearchParams, debounce search requests, show active-filter chips, reset pages correctly, render the distinct no-filter-match state, and announce result-count changes in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx

**Checkpoint**: US2 independently answers filtered portfolio questions with globally correct sorting/pagination and passes T020–T023 without changing US1 arithmetic.

---

## Phase 5: User Story 3 - Move Between Portfolio and Individual Work (Priority: P1)

**Goal**: Connect aggregation and individual tracker through a shared view switcher, stable row links/Back behavior, role-aware add flow, and comprehensive aggregate cache invalidation.

**Independent Test**: Apply aggregate filters/sort/page, open a partnership, verify `/partnership-tracker?partnership={id}`, use Back to restore the aggregate URL, switch views directly, create a partnership as Admin, verify read-only User behavior, and confirm every relevant mutation invalidates aggregate queries.

### Tests for User Story 3

- [X] T031 [P] [US3] Add failing route, row-link, view-switcher selected-state, and browser-Back restoration tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx
- [X] T032 [P] [US3] Add failing Admin add-to-detail, new-row refresh, and non-Admin read-only action tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationPage.test.tsx
- [X] T033 [P] [US3] Add failing query-client tests covering aggregate invalidation after partnership, owner, commitment, NAV, K-1 year, workflow/sign-off, and reassignment mutations in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationCache.test.tsx

### Implementation for User Story 3

- [X] T034 [P] [US3] Build an accessible `All partnerships` / `Partnership workspace` route switcher with selected-state semantics in apps/web/src/features/partnership-tracker/components/PartnershipViewSwitcher.tsx
- [X] T035 [US3] Integrate the shared view switcher into aggregate and individual page headers without disturbing the tracker unsaved-K-1 guard in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx and apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx
- [X] T036 [P] [US3] Add aggregation-family invalidation to partnership create/update/reassignment, commitment, NAV, K-1 year, and sign-off refresh paths in apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts
- [X] T037 [P] [US3] Invalidate aggregation queries after owner rename and other owner mutations that change aggregate labels/facets in apps/web/src/features/partnerships/hooks/useEntityQueries.ts
- [X] T038 [US3] Reuse AddPartnershipDialog on the aggregate page, hide it for non-Admins, route successful creation to the selected individual workspace, and make partnership identity links persistent in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx and apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx

**Checkpoint**: US3 preserves aggregate context while moving into individual work and prevents stale aggregate rows, totals, facets, or ordering after mutations.

---

## Phase 6: User Story 4 - Review the Portfolio on Different Screen Sizes (Priority: P2)

**Goal**: Make the wide financial ledger usable and accessible at desktop, tablet, and mobile sizes with local overflow, a focus-managed filter drawer, visible focus, live status, and reduced-motion support.

**Independent Test**: Exercise populated/loading/empty/error states at 1440, 1024, 768, and 390 pixels using keyboard-only navigation and reduced motion; verify no page-level horizontal overflow, sticky partnership identity, labeled sort/filter/page controls, drawer focus lifecycle, and persistent row access.

### Tests for User Story 4

- [X] T039 [P] [US4] Add failing accessibility tests for one h1, labeled filter groups, aria-sort, polite result announcements, focus-visible controls, drawer focus trap/Escape/restoration, role-aware actions, and reduced motion in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationAccessibility.test.tsx
- [X] T040 [P] [US4] Add failing responsive structure tests for wide filter rail, mobile drawer trigger, wrapping KPI coverage, 44px touch targets, sticky identity column, table-local overflow, and loading/empty/error layouts in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationResponsive.test.tsx

### Implementation for User Story 4

- [X] T041 [P] [US4] Add an opt-in wide content-width class API while preserving every existing page default in apps/web/src/components/shared/AppShell.tsx and apply it in apps/web/src/pages/PartnershipAggregationPage.tsx
- [X] T042 [P] [US4] Add the sticky 17rem desktop rail and Headless UI focus-managed mobile filter drawer with 44px controls in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationFilters.tsx
- [X] T043 [P] [US4] Finalize responsive KPI wrapping, tabular numerics, contrast, coverage text, and partial-state semantics in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationKpis.tsx
- [X] T044 [P] [US4] Constrain horizontal scrolling to the table viewport, keep partnership identity sticky, preserve semantic headers/aria-sort, and expose touch/keyboard row actions in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx
- [X] T045 [US4] Finalize the industrial Jackson gold-index layout, responsive filter trigger, focus order, one-h1 hierarchy, live result status, retry/empty states, and reduced-motion guards in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx

**Checkpoint**: US4 passes automated accessibility/responsive tests and the manual viewport/keyboard checks in quickstart.md.

---

## Phase 7: Polish & Cross-Cutting Verification

**Purpose**: Eliminate contract drift and verify financial, security, performance, cache, responsive, and regression gates across all stories.

- [X] T046 Reconcile implemented query/response schemas and examples with specs/018-partnership-aggregation/contracts/partnership-aggregation.openapi.yaml and shared types in packages/types/src/partnership-tracker.ts
- [X] T047 [P] Audit the aggregate server path for one set-based candidate read, canonical summary reuse, exact arithmetic, scope-before-facets, and absence of persisted summaries in apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts and apps/api/src/modules/partnership-tracker/partnership-aggregation.ts
- [X] T048 [P] Audit the aggregate browser path for no client-computed financial source of truth, complete mutation invalidation, URL restoration, and no averaged IRR in apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts and apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts
- [X] T049 Run every focused API/web, 500-row performance, viewport, keyboard, reduced-motion, and cache scenario defined in specs/018-partnership-aggregation/quickstart.md and document any environment-only skips in that file
- [X] T050 Run `npm run test:api`, `npm run test:web`, `npm run build:api`, and `npm run build:web`, then record final pass evidence in specs/018-partnership-aggregation/quickstart.md

---

## Phase 8: Multi-Owner Partnership Grouping

**Goal**: Represent one investment once on All Partnerships while preserving every owner-specific Partnership workspace record and supporting intentional new-owner creation.

- [X] T051 Add migration 022 with durable aggregation group IDs and legacy same-name/same-type backfill in apps/api/src/infra/db/migrations/022_partnership_aggregation_groups.sql
- [X] T052 Extend shared/API/OpenAPI contracts with group identity, grouped response items, member rows, grouped totals, and owner-record coverage counts
- [X] T053 Group filtered owner records before sorting/pagination and recompute exact group totals, DPI, and TVPI without averaging IRR in apps/api/src/modules/partnership-tracker/partnership-aggregation.ts
- [X] T054 Add pure aggregation regression coverage for two AC Bell owner records producing one exact parent group in apps/api/tests/partnership-tracker.aggregation.test.ts
- [X] T055 Build accessible expandable partnership parent rows and owner-detail child rows with individual workspace links in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx
- [X] T056 Add `New partnership` / `Existing partnership, new owner` creation modes, inherited identity, unavailable-owner filtering, and focused UI coverage in AddPartnershipDialog.tsx and PartnershipCreationFlow.test.tsx
- [X] T057 Validate existing-partnership references server-side, inherit their group/name/type, preserve independent owner records, and add group-aware repository projection behavior
- [X] T058 Reconcile spec, plan, research, data model, quickstart, and OpenAPI documentation with grouped partnership semantics

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: No dependencies; T001 and T002 can run in parallel.
- **Phase 2 — Foundational**: Depends on Phase 1 fixture shapes; T003 precedes T004 and blocks production story work.
- **Phase 3 — US1**: Depends on Phase 2 and delivers the MVP endpoint/page with default portfolio read behavior.
- **Phase 4 — US2**: Depends on US1's endpoint, pure composer, client hook, table, and page shell; extends them with complete query behavior.
- **Phase 5 — US3**: Basic switcher/cache work depends on US1; the full filtered Back-restoration scenario depends on US2.
- **Phase 6 — US4**: Depends on the US1 page/component skeleton and can proceed in parallel with US2/US3 after component props stabilize.
- **Phase 7 — Polish**: Depends on every story selected for release; T047 and T048 can run in parallel before final verification.

### User Story Dependencies

```text
Setup -> Foundational -> US1 (MVP)
                            |-> US2 -> US3 filtered-context validation
                            |-> US3 basic navigation/cache
                            `-> US4 responsive/accessibility
US1 + US2 + US3 + US4 -> Polish
```

- **US1 (P1)**: First independently deployable increment; no other story dependency after Foundation.
- **US2 (P1)**: Builds on US1's aggregate read/page but remains independently testable through complete filter/sort/page scenarios.
- **US3 (P1)**: Basic navigation and cache invalidation build on US1; filtered context restoration additionally consumes US2 URL state.
- **US4 (P2)**: Builds on US1's components and can be implemented alongside US2/US3; no API behavior dependency.

### Within Each User Story

- Add story tests and confirm they fail before modifying production files.
- Keep shared/API contracts ahead of service, handler, and web-client work.
- Keep pure calculation/query composition ahead of repository/endpoint integration.
- Keep web data hooks ahead of page composition.
- Build independent components in parallel only after their prop/response contracts are stable.
- Complete the story checkpoint before relying on its behavior in a later story.

## Parallel Opportunities

- **Setup**: T001 and T002 use separate API/web fixture files.
- **US1 tests**: T005–T009 use distinct API and web test files.
- **US1 UI**: T016 and T017 can build KPI/table components in parallel after T003/T004.
- **US2 tests**: T020–T023 use distinct pure, integration, client, and URL-state files.
- **US2 UI**: T028 and T029 can build filters and sortable table controls in parallel after T027.
- **US3 tests**: T031–T033 cover separate navigation, page-role, and cache files.
- **US3 implementation**: T034, T036, and T037 touch separate switcher/tracker-hook/entity-hook files.
- **US4 tests**: T039 and T040 use separate accessibility and responsive suites.
- **US4 implementation**: T041–T044 touch the shell, filters, KPI, and table independently before T045 integrates them.
- **Polish**: T047 server audit and T048 browser audit can run in parallel.

## Parallel Example: User Story 1

```text
Task T005: Pure rollup and quality tests in apps/api/tests/partnership-tracker.aggregation.test.ts
Task T006: HTTP contract tests in apps/api/tests/partnership-tracker.contract.test.ts
Task T007: PostgreSQL/performance tests in apps/api/tests/partnership-tracker.aggregation.integration.test.ts
Task T008: Scope-leakage tests in apps/api/tests/partnership-tracker.aggregation.authz.integration.test.ts
Task T009: Portfolio page tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationPage.test.tsx
```

After the response types stabilize:

```text
Task T016: KPI band in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationKpis.tsx
Task T017: Aggregate table in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx
```

## Parallel Example: User Story 2

```text
Task T020: Pure query/sort/facet tests in apps/api/tests/partnership-tracker.aggregation.test.ts
Task T021: Multi-page integration tests in apps/api/tests/partnership-tracker.aggregation.integration.test.ts
Task T022: Client serialization tests in apps/web/src/features/partnership-tracker/__tests__/partnershipTrackerClient.test.ts
Task T023: URL-state tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationUrlState.test.tsx
```

After T027:

```text
Task T028: Faceted filters in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationFilters.tsx
Task T029: Sort/pagination controls in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx
```

## Parallel Example: User Story 3

```text
Task T031: Navigation/Back tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx
Task T032: Admin/User flow tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationPage.test.tsx
Task T033: Cache invalidation tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationCache.test.tsx
```

Implementation split:

```text
Task T034: Shared view switcher in apps/web/src/features/partnership-tracker/components/PartnershipViewSwitcher.tsx
Task T036: Tracker mutation invalidation in apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts
Task T037: Owner mutation invalidation in apps/web/src/features/partnerships/hooks/useEntityQueries.ts
```

## Parallel Example: User Story 4

```text
Task T039: Accessibility tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationAccessibility.test.tsx
Task T040: Responsive tests in apps/web/src/features/partnership-tracker/__tests__/PartnershipAggregationResponsive.test.tsx
```

Then T041–T044 can proceed in parallel across AppShell, filters, KPIs, and table before T045 integrates the page.

## Implementation Strategy

### MVP First — User Story 1

1. Complete Setup and Foundational contracts.
2. Write and fail T005–T009.
3. Complete T010–T019.
4. Run the US1 checkpoint against the quickstart four-row scoped fixture.
5. Demo/deploy the read-only portfolio overview before adding query complexity.

### Incremental Delivery

1. **Foundation**: Shared fixtures and additive contracts.
2. **US1**: Accurate scoped portfolio ledger and KPIs — MVP.
3. **US2**: Complete filters, sort, pagination, facets, and URL restoration.
4. **US3**: Detail navigation, shared switcher, Admin add flow, and cache coherence.
5. **US4**: Responsive layout, mobile drawer, keyboard semantics, and reduced motion.
6. **Polish**: Contract reconciliation, source-of-truth audits, performance, full regression, and builds.

### Parallel Team Strategy

After Foundation and US1 response props stabilize:

- API owner: T010–T014, then T024–T026.
- Data/web owner: T015, T027, T030, and T036–T038.
- UI owner: T016–T019, T028–T029, T034–T035, and T041–T045.
- Test owner: story test groups first, then quickstart and full regression gates.

## Notes

- `[P]` means file-level parallelism after prerequisites, not permission to ignore dependency order.
- Every user-story task includes its `[US#]` traceability label; Setup, Foundational, and Polish tasks intentionally do not.
- Migration 022 persists only group identity; all financial totals remain read projections.
- There is no export, chart, saved-view, bulk-edit, pooled-IRR, or persisted-summary task because those are explicitly out of scope.
- Commit after each task or coherent test/implementation group; stop at each checkpoint to validate the story independently.
