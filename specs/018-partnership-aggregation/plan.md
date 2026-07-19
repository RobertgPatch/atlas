# Implementation Plan: Partnership Aggregation

**Branch**: `018-partnership-aggregation` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-partnership-aggregation/spec.md`

## Summary

Add a dedicated `/partnership-aggregation` portfolio ledger beside the existing individual Partnership Tracker. The authenticated page will show complete filtered-scope KPIs, coverage, facets, and one sortable row per partnership, while row links and a shared view switcher preserve the established `/partnership-tracker?partnership={id}` editing workflow.

Implement one additive `GET /v1/partnership-tracker/aggregation` contract. Refactor the existing set-based partnership summary projection so aggregation reuses canonical performance derivations, then group independent owner records by a durable partnership aggregation identity before composing exact-cent totals, partial-coverage metadata, recomputed DPI/TVPI, derived filters, stable sort, and pagination. No portfolio or multi-owner IRR is inferred and no summary data is persisted. The React page uses a Jackson-aligned industrial ledger treatment: gold index rail, compact segmented KPI band, desktop filter rail/mobile drawer, expandable parent/owner rows, tabular numerics, a sticky identity column, table-local overflow, URL-owned query state, and accessible loading/empty/error behavior.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, PostgreSQL SQL reads.
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, existing session/RBAC/scope middleware and `composePartnershipPerformance`. Web: React 19, React Router 7, TanStack Query 5, Tailwind CSS 3, Headless UI 2, Framer Motion 12, Lucide, existing Jackson shared components.
**Storage**: Existing PostgreSQL `partnerships`, `entities`, commitment, FMV snapshot, K-1 tracker year, and active value-revision tables, plus migration 022's `partnerships.aggregation_group_id`. No aggregate table, materialized view, calculated-total persistence, or saved-filter persistence.
**Testing**: Vitest pure aggregation/contract tests; PostgreSQL integration and authz tests via `ATLAS_TEST_DATABASE_URL`; React Testing Library/Vitest for URL state, filters, sort, pagination, cache invalidation, responsive structure, and accessibility; API/web builds.
**Target Platform**: Existing Jackson browser application and Fastify `/v1` API, local Docker PostgreSQL, and AWS staging/production PostgreSQL deployments.
**Project Type**: npm-workspace monorepo with Fastify backend, React frontend, shared TypeScript wire contracts, and versioned SQL migrations.
**Performance Goals**: A 500-partnership scoped request returns the requested page, complete filtered rollup, and base facets within 2 seconds in integration tests; one set-based database statement supplies candidates; the browser renders only a 25/50/100-row page and makes no per-partnership requests.
**Constraints**: Exact decimal-string money; fixed-decimal unit ratios; missing differs from zero; coverage accompanies partial totals; group and portfolio DPI/TVPI are recomputed from totals; partnership IRRs are never averaged; owner filtering precedes grouping; groups sort and paginate as units; no browser or persisted summary source of truth; no page-level horizontal overflow; existing individual tracker records and unsaved-change guard remain intact.
**Scale/Scope**: Internal Jackson users, hundreds of partnerships (500-row primary fixture), one new web page/route, one additive read endpoint, five multi-select facet families, 14 sortable row fields, exact portfolio rollups, shared navigation, and focused cache/accessibility changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific principles. Applied repository-local and financial-workflow gates:

1. **Existing stack and module ownership**: PASS. Work remains in the current Partnership Tracker API/web feature, shared types, routes, and shared shell; no new service or framework is introduced.
2. **One durable source of truth**: PASS. PostgreSQL and active tracker revisions remain canonical; aggregate rows, facets, totals, and query state are derived reads and are not persisted.
3. **Financial correctness**: PASS. Money is composed in integer cents, missing is not zero, ratios are recalculated from totals, partial coverage is explicit, and invalid averaged IRR is prohibited.
4. **Scoped authorization**: PASS. Existing authenticated partnership scope is applied before candidate loading, facet counting, filtering, sorting, totals, and response pagination.
5. **Cross-view consistency**: PASS. Aggregate rows reuse the current summary mapping and `composePartnershipPerformance`; no duplicate metric implementation is planned.
6. **Deterministic query behavior**: PASS. Query parameters are validated and normalized, nulls sort last, ties use normalized name and stable ID, and filtering precedes pagination.
7. **Backward compatibility**: PASS. The endpoint, route, types, query keys, and shell width option are additive; current picker/detail APIs and legacy redirects remain unchanged.
8. **Focused and accessible UI**: PASS. Aggregation is a separate page, table overflow is local, identity remains sticky, mobile filters use a focus-managed dialog, sort is announced, and reduced motion is honored.
9. **Performance discipline**: PASS. One complete set-based candidate projection replaces N+1 reads; only the selected page is serialized to the browser; 500-row behavior has an explicit integration target.
10. **Testing coverage**: PASS. The plan covers pure arithmetic, missing/zero/negative values, filter/sort/page consistency, scope leakage, cache refresh, responsive structure, keyboard semantics, and full builds.

### Post-Phase 1 Re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/partnership-aggregation.openapi.yaml](./contracts/partnership-aggregation.openapi.yaml), and [quickstart.md](./quickstart.md). Result: **PASS**.

- Research selects an additive route/endpoint, canonical shared projection, exact arithmetic, explicit coverage, deterministic quality/facet behavior, and a focused ledger interface.
- The data model contains read projections only and defines money, ratio, coverage, classification, filter, sort, facet, and page invariants without adding persistence.
- The API contract applies scope before every returned fact, normalizes multi-select query state, returns totals and facets with the page, and preserves exact wire types.
- The quickstart verifies complete/partial rollups, no averaged IRR, base-scope facets, combined filters, null-last sorting, pagination stability, row-to-detail navigation, cache invalidation, responsive overflow, and accessibility.

## Project Structure

### Documentation (this feature)

```text
specs/018-partnership-aggregation/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- partnership-aggregation.openapi.yaml
`-- tasks.md                         # created separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
|-- src/modules/partnership-tracker/
|   |-- partnership-aggregation.ts            # pure quality, filter, exact rollup, sort, page composition
|   |-- partnership-tracker.contracts.ts      # aggregate API mirror types
|   |-- partnership-tracker.repository.ts     # shared complete candidate projection and aggregate read
|   |-- partnership-tracker.zod.ts            # aggregate query validation/normalization
|   |-- partnership-tracker.handler.ts        # aggregate handler
|   `-- partnership-tracker.routes.ts         # GET /partnership-tracker/aggregation
`-- tests/
    |-- partnership-tracker.aggregation.test.ts
    |-- partnership-tracker.aggregation.integration.test.ts
    |-- partnership-tracker.aggregation.authz.integration.test.ts
    `-- partnership-tracker.contract.test.ts

apps/web/src/
|-- App.tsx                                   # /partnership-aggregation route
|-- pages/
|   |-- PartnershipAggregationPage.tsx
|   `-- PartnershipTrackerPage.tsx            # existing route and shared view switcher
|-- components/shared/
|   `-- AppShell.tsx                           # optional wide content class, default unchanged
`-- features/partnership-tracker/
    |-- api/partnershipTrackerClient.ts        # aggregate query serialization/read
    |-- hooks/usePartnershipTracker.ts         # aggregate keys/query and mutation invalidation
    |-- components/
    |   |-- PartnershipViewSwitcher.tsx
    |   |-- PartnershipTrackerPageContent.tsx  # switcher integration only
    |   `-- aggregation/
    |       |-- PartnershipAggregationPageContent.tsx
    |       |-- PartnershipAggregationKpis.tsx
    |       |-- PartnershipAggregationFilters.tsx
    |       `-- PartnershipAggregationTable.tsx
    `-- __tests__/
        |-- PartnershipAggregationPage.test.tsx
        |-- PartnershipAggregationUrlState.test.tsx
        |-- PartnershipAggregationAccessibility.test.tsx
        |-- PartnershipTrackerNavigation.test.tsx
        `-- partnershipTrackerClient.test.ts

packages/types/src/
`-- partnership-tracker.ts                    # aggregate row/query/rollup/facet/page contracts
```

**Structure Decision**: Extend the existing Partnership Tracker vertical module rather than create a separate domain module. Add one pure aggregation composer so arithmetic, classification, derived filters, sorting, and pagination can be tested independently; refactor the existing repository summary projection for reuse so individual and aggregate pages cannot drift. Keep the wide UI in an `aggregation/` component group, reuse existing create/detail flows, and make the AppShell width override opt-in so all existing pages retain their layout.

## Phase 0: Research Outcomes

1. Use a dedicated `/partnership-aggregation` route and a shared two-view switcher; do not combine portfolio state with the individual editor.
2. Add one purpose-built aggregation endpoint returning normalized query, page rows, complete filtered rollup, and base-scope facets in one response.
3. Reuse the existing set-based summary source precedence and TypeScript performance composer; load the complete expected-hundreds candidate set once so derived sorts remain globally correct.
4. Sum exact integer cents and recompute portfolio DPI/TVPI from totals; never average row ratios or IRRs.
5. Pair every rollup with coverage and ratio availability; true zero is known, missing is excluded, and different NAV dates are disclosed as a range.
6. Use exclusive quality buckets with warning priority, then missing data, then complete.
7. Encode validated, canonical comma-separated multi-select filters and explicit page/sort state in the URL; sort nulls last and use stable name/ID ties.
8. Return stable base-scope facets, including `NO_K1_YEAR`, without a separate entity/facet request.
9. Use a Jackson industrial ledger aesthetic with a gold index rail, segmented KPI band, desktop filter rail, mobile filter drawer, dense ruled table, and tabular numerics.
10. Invalidate the aggregate query family from every mutation that changes identity, scope, capital, NAV, K-1 facts, or warnings.
11. Add only the durable group-identity migration; add no summary table, materialized view, saved view, chart, bulk edit, or pooled IRR.

## Phase 1: Design Outcomes

- `PartnershipAggregationQuery` defines search, five multi-select filter sets, 14 sort keys, direction, 1-based page, and page sizes 25/50/100; the response echoes normalized state.
- `PartnershipAggregateRow` reuses `PartnershipTrackerSummary` facts and adds one exclusive `dataQuality` classification; `PartnershipAggregateGroup` wraps matching owner rows with exact derived parent totals.
- `PartnershipPortfolioRollup` provides five covered money totals, two covered derived ratios, as-of date, and NAV date range for the complete filtered set.
- `PartnershipAggregationFacetSet` returns stable owner/type/lifecycle/workflow/quality values and counts after authorization scope but before active filters.
- The repository executes one complete set-based summary projection; a pure composer filters derived properties, sorts exact money/ratios with null-last behavior, composes the rollup, and slices the requested page.
- Facet counts cannot leak out-of-scope owners or records, and unknown requested owner IDs are removed from normalized state.
- The aggregate web client sends canonical query strings, keys TanStack Query by normalized view state, keeps previous page data during transitions, and uses the response query as the rendered truth.
- The page owns filters in `useSearchParams`; search is debounced for requests while URL changes remain replace-based until explicit navigation/page changes.
- Desktop uses a wide `AppShell` content option, a sticky 17rem filter rail, responsive KPI grid, and table-local scroll; mobile uses a focus-managed filter dialog and persistent row links.
- Aggregate create reuses `AddPartnershipDialog`, then routes to the individual tracker; all relevant mutation refresh paths invalidate aggregation keys.
- One durable `aggregation_group_id` is added to partnership records so grouping survives spelling differences after explicit existing-partnership creation; calculated aggregate values remain authenticated read projections.

## Implementation Sequence

1. Add shared aggregate query/row/coverage/rollup/facet/page contracts and mirror them in the API module.
2. Implement pure exact-cent aggregation, quality classification, multi-filter composition, null-last stable sorting, rollup coverage, and page slicing with deterministic unit tests.
3. Refactor the repository summary projection for complete candidate reuse, add aggregate query Zod validation, handler, route, and contract/integration/authz coverage.
4. Add aggregate client serialization, TanStack Query family, keep-previous-data behavior, and cross-mutation invalidation tests.
5. Add the `/partnership-aggregation` page, opt-in wide shell, shared view switcher, and Admin create-to-detail flow.
6. Build the filter rail/drawer, KPI coverage band, active-filter summary, dense sticky-column table, page controls, and distinct loading/empty/no-match/error states.
7. Verify combined URL filters, base facets, exact partial totals, null/zero/negative display, global sort before pagination, Back navigation, and concurrent refresh behavior.
8. Run focused API/web suites, full API/web tests and builds, the 500-row PostgreSQL performance check, and desktop/tablet/mobile keyboard and reduced-motion verification from quickstart.

## Complexity Tracking

No constitution violations are introduced. The dedicated endpoint is justified by its complete-scope rollup/facet/query contract and prevents the detail picker from paying the aggregation cost. The pure aggregation module centralizes exact arithmetic and globally correct derived sorting; it does not create a new source of truth. Complete in-process composition is bounded by the specified hundreds-of-partnerships scale and avoids duplicating the existing IRR/availability rules in SQL.
