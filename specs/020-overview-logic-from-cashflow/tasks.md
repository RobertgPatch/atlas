---

description: "Dependency-ordered implementation tasks for operational investment metrics and the Private Investment Tracker"
---

# Tasks: Cash-Flow-Sourced Overview and Private Investment Tracker

**Input**: Design documents from `/specs/020-overview-logic-from-cashflow/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/private-investment-tracker.openapi.yaml`, `quickstart.md`

**Tests**: The specification explicitly requires financial-source regression, exact calculation, authorization, filter, pagination, PDF, routing, accessibility, responsive, and performance verification. Each user-story phase begins with failing tests for its independently testable behavior.

**Organization**: Tasks are grouped by user story so the operational Overview correction, unfiltered investment book, filter workflow, PDF artifact, and default navigation can be implemented and validated as coherent increments.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on another incomplete task in the same phase.
- **[Story]**: Maps directly to User Story 1 through User Story 5 in `spec.md`.
- Every task names the exact implementation, test, configuration, or verification path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one export dependency and reusable fixture surfaces required across the feature.

- [X] T001 Install `pdfkit` and its TypeScript declarations for server-generated PDF downloads in `apps/api/package.json` and update `package-lock.json`.
- [X] T002 [P] Create reusable scoped entities, owner-specific partnerships, calls, both distribution classes, commitment snapshots, NAV snapshots, and mismatched K-1 builders in `apps/api/tests/helpers/privateInvestmentTrackerFixture.ts`.
- [X] T003 [P] Extend `apps/web/src/features/partnership-tracker/__tests__/fixtures.ts` with private-investment response, facet, position, activity, missing-value, multipage, and PDF-column fixtures.

**Checkpoint**: Dependencies install and both API and web suites can construct the same representative operational investment book.

---

## Phase 2: Foundational (Blocking Contracts and Validation)

**Purpose**: Establish the shared wire contract and validated request boundary used by every story.

**CRITICAL**: Complete this phase before user-story implementation so API, web, and PDF work use one exact contract.

- [X] T004 Define operational performance inputs/results, activity types, entity-fund positions, normalized filters, facets, page metadata, PDF column IDs, and export requests in `packages/types/src/partnership-tracker.ts`.
- [X] T005 [P] Mirror the operational performance, private tracker, and PDF contracts for the API compiler in `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`.
- [X] T006 Implement canonical comma-list parsing, scoped UUID normalization, inclusive date/amount range validation, 25/50/100 pagination, and ordered PDF-column validation in `apps/api/src/modules/partnership-tracker/partnership-tracker.zod.ts`.

**Checkpoint**: Shared and API-local contracts match the OpenAPI document, and malformed/reversed ranges or invalid export columns fail at the boundary.

---

## Phase 3: User Story 1 - Trust the Partnership Overview (Priority: P1) MVP

**Goal**: Make Overview investment metrics use only dated Net Cash Activity, effective commitment history, and real NAV history while keeping K-1 values tax-only.

**Independent Test**: Seed operational calls/distributions/commitment/NAV that disagree with K-1 values; confirm Overview follows only operational values, remains unchanged after K-1 edits, and treats recallable distributions correctly.

### Tests for User Story 1

> Write these tests first and confirm they fail for the current K-1 fallback and combined-distribution behavior.

- [X] T007 [P] [US1] Rewrite operational performance unit cases for exact calls, separate distribution classes, linked recallable commitment snapshots, real/missing/stale NAV, DPI, TVPI, XIRR, simplified return, zero, missing, negative remaining commitment, and ambiguous roots in `apps/api/tests/partnership-tracker.performance.test.ts`.
- [X] T008 [P] [US1] Add PostgreSQL regressions proving K-1 disagreement and K-1-only edits cannot change investment metrics, no-activity rows never fall back, future commitment/NAV dates are excluded, and recallable increases are not doubled in `apps/api/tests/partnership-tracker.performance.integration.test.ts`.
- [X] T009 [P] [US1] Add Overview rendering regressions for separate recallable/non-recallable totals, missing versus zero, real valuation dates, carried-forward NAV disclosure, and visually separated tax-position facts in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPerformance.test.tsx`.

### Implementation for User Story 1

- [X] T010 [US1] Refactor the canonical operational input, exact totals, availability states, XIRR, simplified return, and recallable rules in `apps/api/src/modules/partnership-tracker/partnership-performance.ts` without accepting annual K-1 cash values.
- [X] T011 [US1] Replace the K-1 annual-performance fallback in the shared summary projection with set-based operational event aggregates, effective commitment, and latest actual NAV while retaining separately labeled tax metadata in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`.
- [X] T012 [US1] Adapt aggregate row/rollup composition to the new operational summary fields and ensure portfolio distributions exclude recallable amounts in `apps/api/src/modules/partnership-tracker/partnership-aggregation.ts` and `apps/api/tests/partnership-tracker.aggregation.test.ts`.
- [X] T013 [US1] Render the operational metric strip and explicit tax-position separation, including recallable totals and valuation/availability details, in `apps/web/src/features/partnership-tracker/components/PerformanceMetricStrip.tsx` and `apps/web/src/features/partnership-tracker/components/PartnershipOverview.tsx`.
- [X] T014 [US1] Run and fix the US1 suites in `apps/api/tests/partnership-tracker.performance.test.ts`, `apps/api/tests/partnership-tracker.performance.integration.test.ts`, `apps/api/tests/partnership-tracker.aggregation.test.ts`, and `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPerformance.test.tsx` until the independent source-policy test passes.

**Checkpoint**: Overview and existing aggregation investment values are operational-only; K-1 data remains visible solely as tax metadata.

---

## Phase 4: User Story 2 - Review the Private Investment Book (Priority: P1)

**Goal**: Provide an authenticated workbook-inspired page with one lifetime row per entity-partnership position and one newest-first ledger of calls, both distribution types, and valuations.

**Independent Test**: Seed the same fund under two entities plus another fund, then verify distinct owner-specific top rows, complete exact lifetime metrics, deterministic bottom rows, scope isolation, empty states, and refresh after operational mutations.

### Tests for User Story 2

> Write these tests first and confirm they fail before adding the read model and page.

- [X] T015 [P] [US2] Add pure mapping/composition tests for stable row IDs, four normalized activity types, accounting direction, valuation semantics, entity-partnership keys, vintage year, lifetime metrics, extended executive fields, and deterministic ties in `apps/api/tests/private-investment-tracker.test.ts`.
- [X] T016 [P] [US2] Add PostgreSQL integration tests for the unfiltered set-based read, distinct same-fund owners, current effective commitment, latest NAV, newest-first pagination, base-empty behavior, and no K-1 influence in `apps/api/tests/private-investment-tracker.integration.test.ts`.
- [X] T017 [P] [US2] Add Admin/member authorization tests proving position rows, activities, and facets never cross entity scope in `apps/api/tests/private-investment-tracker.authz.integration.test.ts`.
- [X] T018 [P] [US2] Add page tests for the workbook-inspired top/bottom structure, lifetime scope disclosure, all core/extended values, accounting signs, valuation rows, loading, base-empty, stale-refresh, error/retry, and local table overflow in `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerPage.test.tsx`.
- [X] T019 [P] [US2] Add cache tests proving partnership identity, entity reassignment, cash activity, commitment, NAV, and deletion mutations invalidate the private tracker while K-1-only edits cannot alter returned investment values in `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerCache.test.tsx`.

### Implementation for User Story 2

- [X] T020 [US2] Implement pure source-row mapping, activity ordering, entity-partnership identity, lifetime position composition, facets, and response/page assembly in `apps/api/src/modules/partnership-tracker/private-investment-tracker.ts`.
- [X] T021 [US2] Add the scoped set-based union of `capital_activity_events` and `partnership_fmv_snapshots`, matching position discovery, and complete operational position projection in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`.
- [X] T022 [US2] Add the authenticated `GET /partnership-tracker/private-investments` handler and route using existing session and partnership-scope middleware in `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`.
- [X] T023 [US2] Add exact response typing, basic page query serialization, the `privateInvestments` query-key family, and keep-previous-data fetching in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`.
- [X] T024 [P] [US2] Implement shared accounting money, ratio, date, source, and availability presentation helpers in `apps/web/src/features/partnership-tracker/components/private-investment/privateInvestmentFormatting.ts`.
- [X] T025 [P] [US2] Implement the lifetime entity-fund summary table with workbook-aligned core columns, optional executive columns, sticky identities, tabular numerics, missing states, and valuation dates in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentSummaryTable.tsx`.
- [X] T026 [P] [US2] Implement the newest-first activity table with Entity, Fund, Date, accounting Amount, Type, Source, point-in-time valuation semantics, stable row keys, and local overflow in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentActivityTable.tsx`.
- [X] T027 [US2] Compose the page header, lifetime-scope explanation, summary/detail sections, result count, pagination, and distinct loading/base-empty/stale/error states in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentTrackerPageContent.tsx`.
- [X] T028 [US2] Add the wide-shell page wrapper and protected `/private-investment-tracker` route without changing login defaults yet in `apps/web/src/pages/PrivateInvestmentTrackerPage.tsx` and `apps/web/src/App.tsx`.
- [X] T029 [US2] Invalidate the private tracker query family after operational identity, cash, commitment, NAV, and deletion mutations while preserving K-1 editing behavior in `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`.

**Checkpoint**: The unfiltered Private Investment Tracker is independently usable and scoped, with exact lifetime position metrics and a deterministic activity/valuation ledger.

---

## Phase 5: User Story 3 - Filter Details and Control the Summary Population (Priority: P1)

**Goal**: Make the bottom ledger's type/entity/fund/date/amount controls determine top-row membership while preserving complete lifetime metrics for every matching position.

**Independent Test**: Apply every filter alone and in combination; verify inclusive magnitude/date semantics, base-scope facets, complete matching position membership outside the visible page, lifetime top calculations, normalized URL restoration, and clear no-match/range-error behavior.

### Tests for User Story 3

> Write these tests first and confirm they fail before adding filter behavior.

- [X] T030 [P] [US3] Extend `apps/api/tests/private-investment-tracker.integration.test.ts` with OR-within/AND-across filters, inclusive date/amount-magnitude bounds, complete matched-position membership before pagination, lifetime metrics under distribution-only filters, stable page transitions, and invalid-page normalization.
- [X] T031 [P] [US3] Extend `apps/api/tests/private-investment-tracker.test.ts` with canonical filter ordering, facet counts, out-of-scope selection removal, reversed ranges, duplicate values, fixed type ordering, and filtered-empty composition cases.
- [X] T032 [P] [US3] Add client and URL tests for canonical comma lists, dates, exact amount strings, page reset, Back/refresh restoration, invalid-value cleanup, response-normalized truth, and no floating-point conversion in `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerUrlState.test.tsx` and `apps/web/src/features/partnership-tracker/__tests__/partnershipTrackerClient.test.ts`.
- [X] T033 [P] [US3] Add keyboard and screen-reader tests for three multi-select autocompletes, inclusive range labels/errors, active-filter summary, polite result counts, clear-all, filtered-empty state, and focus persistence in `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerAccessibility.test.tsx`.

### Implementation for User Story 3

- [X] T034 [US3] Implement canonical filter normalization, base-scope facet composition, matching position-set derivation, page clamping, and lifetime-for-matched-position semantics in `apps/api/src/modules/partnership-tracker/private-investment-tracker.ts`.
- [X] T035 [US3] Apply authorized type/entity/partnership/date/amount filters before matching-position aggregation and detail pagination without N+1 reads in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`.
- [X] T036 [US3] Implement canonical private tracker parameter serialization, response-normalized query state, URL parsing, filter-driven page reset, and Back/refresh restoration in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts`, `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`, and `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentTrackerPageContent.tsx`.
- [X] T037 [P] [US3] Implement the reusable labeled Headless UI multi-select autocomplete with search, selected chips, duplicate fund-name owner context, keyboard removal, no-results, and scoped facet counts in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentFilterCombobox.tsx`.
- [X] T038 [P] [US3] Implement type/entity/fund selectors, independent date and amount bounds, active-filter summary, clear-all, reversed-range feedback, and responsive filter layout in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentFilters.tsx`.
- [X] T039 [US3] Integrate filters with both tables so detail results drive top membership, lifetime scope remains explicit, filtered-empty and validation states stay distinct, and pagination counts the complete filtered ledger in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentTrackerPageContent.tsx`.
- [X] T040 [US3] Run and fix the US3 suites in `apps/api/tests/private-investment-tracker.test.ts`, `apps/api/tests/private-investment-tracker.integration.test.ts`, `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerUrlState.test.tsx`, `apps/web/src/features/partnership-tracker/__tests__/partnershipTrackerClient.test.ts`, and `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerAccessibility.test.tsx`.

**Checkpoint**: Bottom filters are the sole population controls, URL state is reproducible, and top ratios remain financially meaningful lifetime metrics.

---

## Phase 6: User Story 4 - Export a C-Suite PDF (Priority: P1)

**Goal**: Download a Jackson-branded, workbook-inspired landscape PDF containing the complete authorized filtered summary/detail result and only the ordered columns selected by the user.

**Independent Test**: Filter a multipage fixture, choose nondefault summary/detail columns, export, and verify valid PDF bytes, complete rows, selected order, filter/as-of context, repeated headers, accounting values, filename, and scope isolation.

### Tests for User Story 4

> Write these tests first and confirm they fail before adding the renderer or export route.

- [X] T041 [P] [US4] Add pure report-model and renderer tests for selected column order, complete rows, filter/as-of labels, lifetime scope, missing/negative values, page/column splitting, repeated headers, and page numbers in `apps/api/tests/private-investment-tracker.pdf.test.ts`.
- [X] T042 [P] [US4] Add HTTP contract and authorization tests for valid PDF bytes, `application/pdf`, content disposition, complete filtered scope beyond the current page, unknown/duplicate/empty columns, reversed ranges, and out-of-scope IDs in `apps/api/tests/private-investment-tracker.pdf.contract.test.ts`.
- [X] T043 [P] [US4] Add web tests for independent ordered summary/detail selection, all/clear/default actions, disabled invalid export, progress, binary download filename, error/retry, focus restoration, sticky actions, and retained page filters in `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerPdf.test.tsx`.

### Implementation for User Story 4

- [X] T044 [US4] Implement the pure complete report model, column definitions, accounting formatting, Jackson/workbook landscape styling, repeated headers, continuation/page numbering, and PDFKit renderer in `apps/api/src/modules/partnership-tracker/private-investment-tracker.pdf.ts`.
- [X] T045 [US4] Reapply scope and filters, load all matching rows without UI pagination, validate column order, render the artifact, and stream the dated filename from `apps/api/src/modules/partnership-tracker/partnership-tracker.handler.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts`.
- [X] T046 [US4] Add the authenticated binary PDF request, content-disposition filename extraction, Blob URL download, and safe cleanup/error handling in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`.
- [X] T047 [US4] Implement the focus-managed column-selection dialog with ordered summary/detail groups, defaults, all/clear actions, sticky Cancel/Export actions, progress, and retry feedback in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentPdfExportDialog.tsx`.
- [X] T048 [US4] Integrate PDF export with the current normalized filters and nonpaged report scope without replacing the interactive page state in `apps/web/src/features/partnership-tracker/components/private-investment/PrivateInvestmentTrackerPageContent.tsx`.
- [X] T049 [US4] Run and fix `apps/api/tests/private-investment-tracker.pdf.test.ts`, `apps/api/tests/private-investment-tracker.pdf.contract.test.ts`, and `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerPdf.test.tsx` until the multipage executive artifact independent test passes.

**Checkpoint**: Users can download a complete, scoped, readable PDF artifact with an intentional column set and no reliance on popup printing or client-calculated totals.

---

## Phase 7: User Story 5 - Land on the Tracker after Login (Priority: P2)

**Goal**: Expose Private Investment Tracker in the main navigation and make it the post-login and `/dashboard` destination without breaking protected deep links.

**Independent Test**: Sign in, open `/dashboard`, use the navbar, refresh existing protected routes, navigate Back, and verify the new destination/active state with no redirect loop.

### Tests for User Story 5

> Write these tests first and confirm they fail for the current Liquidity default.

- [X] T050 [P] [US5] Add login, dashboard-alias, navbar active-state, protected-route, valid deep-link, Back, and sign-out regressions in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx` and `apps/web/src/pages/LoginPage.test.tsx`.

### Implementation for User Story 5

- [X] T051 [P] [US5] Add the `Private Investment Tracker` navigation item, icon, and exact active-state behavior without grouping it under the Partnership workspace route in `apps/web/src/components/shared/AppShell.tsx`.
- [X] T052 [US5] Change successful login and authenticated `/dashboard` to `/private-investment-tracker` while preserving explicit protected routes and fallbacks in `apps/web/src/pages/LoginPage.tsx` and `apps/web/src/App.tsx`.
- [X] T053 [US5] Run and fix `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx` and `apps/web/src/pages/LoginPage.test.tsx` until default landing and deep-link behavior pass independently.

**Checkpoint**: Private Investment Tracker is the primary landing page, and all existing protected destinations remain directly navigable.

---

## Phase 8: Polish & Cross-Cutting Verification

**Purpose**: Prove set-based performance, responsive/accessibility quality, complete regression safety, and documentation accuracy across all selected stories.

- [X] T054 Add the 500-position/10,000-row timing fixture, query-count assertion, captured `EXPLAIN (ANALYZE, BUFFERS)` plan, and PDF-scale smoke test in `apps/api/tests/private-investment-tracker.performance.integration.test.ts`, adding a migration under `apps/api/src/infra/db/migrations/` only if the measured plan proves a specific index is required.
- [X] T055 [P] Complete 1440/1024/768/390-pixel, 200%-zoom, keyboard-only, reduced-motion, sticky-column, local-overflow, live-region, 44-pixel-target, and PDF-dialog checks in `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerAccessibility.test.tsx` and `apps/web/src/features/partnership-tracker/__tests__/PrivateInvestmentTrackerResponsive.test.tsx`.
- [X] T056 Run the focused and complete API/web tests plus production builds from `package.json`, fix in-scope regressions, and record the verified commands/results in `specs/020-overview-logic-from-cashflow/quickstart.md`.
- [X] T057 Execute every financial, filter, PDF, routing, scope, and responsive scenario in `specs/020-overview-logic-from-cashflow/quickstart.md`, then document any as-built contract deviation in `specs/020-overview-logic-from-cashflow/contracts/private-investment-tracker.openapi.yaml` and `specs/020-overview-logic-from-cashflow/plan.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: Starts immediately. T002 and T003 can run in parallel with each other after the fixture shape is agreed.
- **Phase 2 - Foundation**: Depends on Phase 1 and blocks all user stories. T005 can mirror T004 in parallel from the approved contract; T006 follows the contract constants.
- **Phase 3 - US1**: Depends on Foundation. T007-T009 are written first and may run in parallel; T010 precedes T011-T013; T014 closes the source-policy MVP.
- **Phase 4 - US2**: Depends on US1 because its lifetime positions reuse the canonical operational composer. T015-T019 are written first in parallel; T020-T023 establish the server/client path; T024-T026 can proceed in parallel; T027-T029 integrate and refresh it.
- **Phase 5 - US3**: Depends on US2's page/read model. T030-T033 are parallel failing tests; T034-T036 establish server and URL semantics; T037 and T038 are parallel controls; T039-T040 integrate and close.
- **Phase 6 - US4**: Depends on US3's normalized filters and US2's complete position/detail projections. T041-T043 are parallel failing tests; T044 and T046 may proceed in parallel after contracts; T045, T047, and T048 integrate; T049 closes.
- **Phase 7 - US5**: Depends on the US2 route existing but is otherwise independent of US3/US4. T050 is written first; T051 can proceed in parallel with the login half of T052; T053 closes.
- **Phase 8 - Polish**: Depends on every user story selected for release. T054 and T055 can run in parallel; T056 precedes the final manual/as-built audit T057.

### User Story Completion Order

```text
Setup T001-T003
   |
Foundation T004-T006
   |
US1 T007-T014  Operational-only Overview MVP
   |
US2 T015-T029  Unfiltered entity-fund book
   |
US3 T030-T040  Filters, URL state, and top membership
   |
US4 T041-T049  Complete filtered PDF artifact

US5 T050-T053  Navigation/default landing
   `-- starts after the US2 route exists and may overlap US3/US4

Polish T054-T057
```

- **US1 (P1)** is the suggested MVP and establishes the nonnegotiable financial source policy.
- **US2 (P1)** is the first independently usable Private Investment Tracker page and depends only on the operational composer delivered by US1.
- **US3 (P1)** extends US2 without changing lifetime financial definitions.
- **US4 (P1)** consumes the same scoped query/filter model and does not introduce a second reporting source.
- **US5 (P2)** can be delivered once the US2 route exists, even if filter/PDF work is still in progress.

### Within Each User Story

- Write the listed tests first and confirm they fail for the intended missing behavior.
- Establish exact server financial/query behavior before client rendering.
- Implement leaf formatting/table/filter/dialog components before page-level integration.
- Complete the focused closeout task before declaring the story independently done.
- Never use K-1 values as an investment fallback, browser-calculated totals as source of truth, or the current detail page as PDF export scope.

## Parallel Opportunities

### User Story 1

After Foundation:

```text
T007 performance unit tests
  || T008 PostgreSQL source-policy tests
  || T009 Overview rendering tests
```

Then complete T010 -> T011/T012 -> T013 -> T014.

### User Story 2

After US1:

```text
T015 pure read-model tests
  || T016 PostgreSQL read tests
  || T017 authorization tests
  || T018 page tests
  || T019 cache tests

After T023 and T024:
T025 summary table
  || T026 activity table
```

Then complete T027 -> T028/T029.

### User Story 3

After US2:

```text
T030 integration filter tests
  || T031 pure normalization/facet tests
  || T032 URL/client tests
  || T033 accessibility tests

After T036:
T037 autocomplete control
  || T038 filter/range panel
```

Then complete T039 -> T040.

### User Story 4

After US3:

```text
T041 report-model/render tests
  || T042 PDF HTTP/authz tests
  || T043 PDF dialog/download tests

After the request/column contracts are stable:
T044 server report renderer
  || T046 web binary client
```

Then complete T045/T047 -> T048 -> T049.

### User Story 5

After the US2 route exists:

```text
T051 navbar item/active state
  || T052 login and dashboard destination
```

Then complete T053.

## Implementation Strategy

### MVP First

1. Complete T001-T006.
2. Complete T007-T014 for User Story 1.
3. Stop and validate the mismatched K-1 fixture: operational Overview values must remain unchanged after K-1 edits.
4. Deploy/demo the corrected source policy before adding a new reporting surface.

### Incremental Delivery

1. **US1**: Correct operational financial truth across Overview and existing aggregation.
2. **US2**: Deliver the unfiltered, scoped two-section Private Investment Tracker.
3. **US3**: Add autocomplete/range filters, URL state, and filter-driven top membership.
4. **US4**: Add the complete, column-selectable executive PDF.
5. **US5**: Make the stable tracker route the default landing page.
6. **Polish**: Prove scale, accessibility, responsive behavior, and full regression safety.

### Parallel Team Strategy

After Foundation:

- Team A owns US1 operational performance and repository correction.
- Team B prepares US2 API/web tests and fixtures, then implements the read model after US1's composer stabilizes.
- Team C prepares US3 filter/URL and US4 export tests against the approved contracts.
- Team D can implement US5 navigation after the US2 protected route lands.

## Notes

- `[P]` tasks operate on different files after the stated prerequisite and can be assigned concurrently.
- No task adds a reporting table, materialized view, duplicated event, live market-data call, K-1 fallback, or commitment row in the bottom ledger.
- Existing asset-class and partnership-status enumerations remain authoritative.
- A NAV snapshot keeps its persisted provenance label, but no K-1 field revision is read as a valuation.
- Add a database migration only if T054's measured query plan demonstrates a concrete index gap.
- Commit after each task or cohesive task group only when using the optional Git workflow.
