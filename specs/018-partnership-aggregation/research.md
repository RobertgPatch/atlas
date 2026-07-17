# Research: Partnership Aggregation

## Decision 1: Use a Dedicated Aggregation Page

**Decision**: Add a sibling web route at `/partnership-aggregation` and keep the existing individual workspace at `/partnership-tracker`. Both pages expose a shared `All partnerships` / `Partnership workspace` switcher. Aggregate row links continue to use `/partnership-tracker?partnership={id}`.

**Rationale**: The two surfaces have different jobs. Aggregation is a read-oriented portfolio ledger with filters, totals, sorting, and pagination; the tracker is a selected-record editor with K-1 unsaved-change protection and area/year URL state. Keeping separate routes prevents portfolio query state from colliding with detail selection and edit guards, while normal browser Back restores the aggregate URL.

**Alternatives considered**:

- Put an aggregate tab inside `PartnershipTrackerPageContent`: rejected because it would combine two large state machines, make the selected partnership implicit even while looking at all partnerships, and complicate the current unsaved K-1 guard.
- Replace the picker with an aggregate table on the current route: rejected because the persistent picker is efficient for editing several individual partnerships and should remain intact.
- Add a second primary sidebar item: rejected for the first release because the view switcher provides discovery without crowding the four-item application navigation.

## Decision 1A: Persist Group Identity, Not Group Totals

**Decision**: Add `partnerships.aggregation_group_id`, backfill legacy same-name/same-type owner records into one group, and reuse the selected group ID when an Admin chooses `Existing partnership, new owner`.

**Rationale**: Name-only grouping solves the immediate duplicate display but is fragile under whitespace, renames, and deliberate same-name investments. A durable identity preserves independent owner records while making the aggregate relationship explicit. Financial totals stay request-derived so K-1, commitment, and NAV source-of-truth rules remain unchanged.

**Alternatives considered**:

- Group only by normalized name and type: rejected as the long-term identity because later renames could split one partnership and unrelated same-name investments could merge.
- Merge owner records into one partnership row: rejected because K-1s, commitments, NAV, workflow, notes, and workspace navigation are owner-specific.
- Persist aggregate totals: rejected because every owner-record mutation would create synchronization and audit risk.

## Decision 2: Add a Purpose-Built Aggregate Read Contract

**Decision**: Add `GET /v1/partnership-tracker/aggregation` rather than overloading the existing paged partnership directory endpoint. The response contains one page of aggregate rows, a rollup for the complete filtered scope, base-scope filter facets, normalized query state, and pagination metadata.

**Rationale**: The current list endpoint returns only `items`, `total`, and `nextCursor` and is optimized for the picker. Aggregation needs multi-select filters, complete-scope totals, sortable derived metrics, coverage metadata, facets, page numbers, and stable URL normalization. An additive endpoint leaves existing clients unchanged and makes the stronger consistency contract explicit.

**Alternatives considered**:

- Extend `GET /partnership-tracker/partnerships`: rejected because every picker request would inherit a heavier payload and query contract.
- Fetch the current list repeatedly in the browser and aggregate there: rejected because the existing limit is 200, browser loops could omit records, and authorization/financial composition must remain server canonical.
- Add separate endpoints for rows, totals, and facets: rejected because independently timed reads can disagree after concurrent changes and add avoidable request coordination.

## Decision 3: Reuse the Canonical Summary Projection, Then Compose Once

**Decision**: Factor the existing `summaryRows` query/mapping so the aggregate repository loads the complete scoped candidate set in one set-based PostgreSQL statement, uses the existing `mapSummary`/`composePartnershipPerformance` source precedence for every row, then applies derived workflow/data-quality filters, exact sorting, rollup composition, and page slicing in the API process.

**Rationale**: Several sort/filter fields—especially IRR and availability states—are already calculated deterministically in TypeScript. Reimplementing them in SQL would create a second financial source of truth. The expected scope is hundreds of rows (500 in the performance fixture), which is appropriate for one complete projection in API memory while returning only the requested page to the browser. Lateral subqueries remain set-based; there is no per-partnership network or repository loop.

**Alternatives considered**:

- Recalculate all performance metrics in SQL: rejected because the IRR root solver and missing-state rules already live in tested TypeScript utilities.
- Sort only the requested SQL page: rejected because pagination would be incorrect for derived sort keys.
- Persist aggregate values or introduce a materialized view: rejected because writes would need synchronization and the requested scale does not justify another source of truth.

## Decision 4: Sum Exact Money and Recompute Ratios

**Decision**: Compose rollups from exact two-decimal money strings using integer cents (`bigint` in TypeScript). Sum known current commitment, paid-in capital, distributions, latest NAV, and unfunded commitment. Recompute portfolio DPI as total known distributions / total known paid-in and portfolio TVPI as (total known distributions + total known latest NAV) / total known paid-in. Serialize ratios to eight decimal places.

**Rationale**: Decimal strings and integer cents avoid binary floating-point drift. Ratios are meaningful only when recomputed from their financial numerators and denominators. Averaging row DPI/TVPI overweights smaller partnerships.

**Alternatives considered**:

- Sum with JavaScript `number`: rejected because exact cents are an existing application invariant.
- Average or commitment-weight row ratios: rejected because that is not equivalent to the portfolio formula when denominators or coverage differ.
- Return only PostgreSQL aggregate numerics: rejected because shared pure composition is easier to exercise for missing/zero/negative cases and keeps row and rollup formatting aligned.

## Decision 5: Never Present an Averaged Portfolio IRR

**Decision**: Keep IRR as a sortable partnership-row field and omit it from portfolio KPIs. A future pooled IRR must be calculated from all dated underlying cash flows and a documented terminal-value convention.

**Rationale**: IRR is not additive, and an arithmetic or weighted average of partnership IRRs is not a portfolio return. Omitting a misleading number is preferable to giving a false summary.

**Alternatives considered**:

- Arithmetic average: rejected as financially invalid.
- Weight row IRRs by commitment or NAV: rejected because neither reproduces the result of pooled dated cash flows.
- Implement pooled IRR now: rejected because the requested feature is a current-state summarization page and pooled return conventions deserve their own product specification.

## Decision 6: Carry Coverage and Availability with Every Rollup

**Decision**: Each aggregate money value is `{ amount, knownCount, totalCount }`; `amount` is null only when no filtered row has a known value. Aggregate ratios carry `AVAILABLE`, `PARTIAL_COVERAGE`, `NO_DATA`, or `ZERO_DENOMINATOR`, plus numerator and denominator coverage. True zero counts as known. NAV rollup also includes the earliest/latest contributing valuation dates.

**Rationale**: Different partnerships can have missing K-1, commitment, or NAV values. Treating missing as zero understates totals, while hiding partial totals removes useful information. Coverage makes the tradeoff explicit and testable.

**Alternatives considered**:

- Refuse to show a total unless coverage is 100%: rejected because known totals still provide operational value.
- Treat null as zero: rejected because it violates the existing tracker financial contract.
- Put one page-level warning beside unqualified totals: rejected because coverage differs by metric.

## Decision 7: Use Exclusive, Deterministic Data-Quality Buckets

**Decision**: Classify each row in priority order:

1. `WARNINGS` when `warningCount > 0`;
2. `MISSING_DATA` when no warning exists and any of current commitment, paid-in capital, distributions, latest NAV, unfunded commitment, DPI, TVPI, or IRR is unavailable;
3. `COMPLETE` otherwise.

**Rationale**: Exclusive buckets produce facet counts that add to the scoped total and avoid a row appearing twice. Warnings take precedence because they indicate review work even if the row also lacks values. Metric-specific availability remains on the row for explanation.

**Alternatives considered**:

- Overlapping warning and missing-data tags: rejected because facet counts become hard to interpret.
- Treat only warning count as quality: rejected because missing financial sources are a core use case.
- Consider no IRR acceptable/complete: rejected because the aggregate table promises a performance-completeness filter; users can still see the precise missing reason.

## Decision 8: Validate Multi-Select URL State with Stable Sort Semantics

**Decision**: Encode list filters as comma-separated canonical query values: `ownerIds`, `partnershipTypes`, `statuses`, `workflowStatuses`, and `dataQuality`. Also encode `search`, `sort`, `direction`, `page`, and `pageSize`. The server validates, deduplicates, and returns normalized query state. Default sort is partnership name ascending; null sort values always appear last; ties resolve by normalized partnership name and stable ID.

**Rationale**: A canonical query string is shareable, refresh-safe, and compact. Server-returned normalization keeps the browser and API aligned. Null-last behavior ensures incomplete records do not unexpectedly jump to the top when direction changes; users can find them through the quality filter.

**Alternatives considered**:

- Keep filters only in React state: rejected because refresh and browser history would lose context.
- Use repeated query parameters: workable, but comma-separated values are easier to normalize with the current `URLSearchParams` client and Fastify query parser.
- Offset cursor only: rejected because users need explicit page state in copied URLs; the dataset is small enough for page-number pagination.

## Decision 9: Keep Facets Stable Across Active Filters

**Decision**: Return owner, type, lifecycle, workflow, and quality facet options/counts from the user's permitted base scope, before active filters. Unknown owner IDs from the URL are dropped during normalization. Workflow includes `NO_K1_YEAR`.

**Rationale**: Stable facet options prevent selected controls from disappearing and let users change combinations without extra discovery requests. Base-scope counts also avoid leaking out-of-scope values.

**Alternatives considered**:

- Recalculate facets after all active filters: rejected because options can vanish and strand query state.
- Fetch entities separately: rejected because generic entity lists may not reflect partnership counts or the exact permitted partnership scope.

## Decision 10: Use an Industrial Financial-Ledger Interface

**Decision**: Within the established Atlas palette and typography, use a wide industrial/editorial ledger: a black rule and gold index accent, compact segmented KPI band, sticky left filter rail on wide screens, active-filter chips, and a dense ruled table with tabular numerics and a sticky partnership column. Use a filter drawer below the wide breakpoint and a table-local horizontal scroller at narrow widths.

**Rationale**: The interface is data-dense and benefits from visible alignment, strong numeric hierarchy, and minimal decoration. The signature gold index rail connects the aggregation view to Atlas without turning it into a generic grid of floating cards. Existing Inter/Playfair font assets avoid an additional web-font dependency.

**Alternatives considered**:

- Reuse the current picker/detail two-column layout: rejected because the right side would still imply one selected partnership.
- Render one card per partnership: rejected because 10+ comparable financial fields become slow to scan and sort visually.
- Add charts in the first release: rejected because valuation dates and missing coverage need careful treatment; exact values and exceptions are the primary job.

## Decision 11: Treat Accessibility and Responsive Behavior as Contracts

**Decision**: Use semantic table headers and `aria-sort`, labeled form fields, a polite result-count live region, focus-visible controls, and Headless UI's dialog behavior for the mobile filter drawer. The desktop filter rail is sticky but not independently scroll-trapped. Table overflow is local, the identity column remains sticky, all targets are at least 44px on touch layouts, and motion is limited to short opacity/position changes guarded by `prefers-reduced-motion`.

**Rationale**: Filters, sort, and wide financial tables are common accessibility failure points. Explicit focus and overflow rules keep the page usable for keyboard, screen-reader, zoom, and small-screen users.

**Alternatives considered**:

- Convert the table to cards on mobile: rejected because it removes column comparison and creates two semantic/rendering implementations.
- Use hover-only row actions or tooltips: rejected because touch and keyboard users need persistent affordances and visible missing-state text.

## Decision 12: Extend Existing Cache Invalidation Families

**Decision**: Add `partnershipTrackerKeys.aggregations()` and a parameterized aggregation key. All existing partnership, commitment, NAV, K-1 year, owner rename, and owner reassignment success/error refresh paths invalidate the aggregation family. The aggregate add flow reuses `AddPartnershipDialog`, invalidates list and aggregation families, and routes to the new detail.

**Rationale**: The aggregate response derives from every tracker source shown in a row or rollup. Family invalidation prevents stale totals after edits while preserving normal TanStack Query request deduplication.

**Alternatives considered**:

- Give the aggregation a short polling interval: rejected because mutations already know when cached facts changed and background polling adds avoidable load.
- Optimistically patch every aggregate/filter page: rejected because one mutation can affect filters, facet counts, sort order, totals, and pagination simultaneously.

## Decision 13: No Schema Migration or Persisted View

**Decision**: Introduce only shared/API read contracts, query validation, pure aggregation helpers, and UI components. Continue reading `partnerships`, `entities`, commitments, FMV snapshots, K-1 tracker years, and active revisions through the existing tracker repository projection.

**Rationale**: All required facts already exist after spec 017. The new page changes how those facts are scoped, summarized, and presented, not the durable domain model.

**Alternatives considered**:

- Add a summary table: rejected because it introduces staleness and write-path coupling.
- Store saved filters: rejected because named/persistent views are outside the first release; URL state is sufficient.
