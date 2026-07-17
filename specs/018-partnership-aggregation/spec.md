# Feature Specification: Partnership Aggregation

**Feature Branch**: `018-partnership-aggregation`
**Created**: 2026-07-16
**Status**: Draft
**Input**: User description: "Create a filterable summarization page of all partnerships that have been created, while retaining the ability to open and work with an individual partnership in the Partnership Tracker."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the Partnership Portfolio at a Glance (Priority: P1)

An authenticated investment administrator opens a dedicated aggregation view and sees every partnership in their permitted owner scope, together with portfolio totals and one comparable summary row per partnership.

**Why this priority**: The current tracker is optimized for editing one selected partnership. Users need a separate portfolio-level view to understand the complete partnership book without stepping through each record.

**Independent Test**: Seed partnerships owned by multiple in-scope owners with commitments, K-1 contributions and distributions, NAV entries, and missing values; open the aggregation page and verify the portfolio KPI band and partnership rows match the complete scoped dataset.

**Acceptance Scenarios**:

1. **Given** partnerships exist in the user's permitted owner scope, **When** the aggregation page loads, **Then** every scoped partnership is represented in the result set and out-of-scope partnerships are absent.
2. **Given** the current result set, **When** summary KPIs render, **Then** they show partnership count, committed capital, paid-in capital, distributions, latest NAV, unfunded commitment, portfolio DPI, and portfolio TVPI calculated from that same result set.
3. **Given** multiple partnerships with individual IRRs, **When** portfolio KPIs render, **Then** the system does not average those IRRs or present the average as a portfolio IRR.
4. **Given** a partnership row, **When** it renders, **Then** it identifies partnership, owner, type, status, latest reporting year, commitment, paid-in capital, distributions, latest NAV with valuation date, unfunded commitment, DPI, TVPI, IRR, and data-quality status.
5. **Given** some financial values are missing, **When** totals and rows render, **Then** missing values remain distinguishable from true zero and the interface discloses incomplete coverage rather than silently treating missing amounts as zero.

---

### User Story 2 - Filter and Sort the Complete Partnership Book (Priority: P1)

An investment administrator narrows the aggregation by partnership or owner name, owner, sector (the partnership type classification), lifecycle status, latest K-1 workflow status, and data-quality state, then sorts the remaining rows to answer review questions quickly.

**Why this priority**: Aggregation only becomes operationally useful when users can isolate a segment, find exceptions, and rank financial values without exporting or scanning every row.

**Independent Test**: Seed at least 30 varied partnerships, apply every filter separately and in combination, sort all supported columns in both directions, and verify the rows, result count, totals, and URL always describe the same filtered scope.

**Acceptance Scenarios**:

1. **Given** the aggregation page, **When** the user searches by partnership or owner name, **Then** matching rows, result count, and portfolio KPIs update to the matching scope.
2. **Given** active filters, **When** the user selects owner, sector/partnership type, lifecycle status, latest workflow status, or data-quality state, **Then** filters combine using AND semantics while multiple values within one category use OR semantics.
3. **Given** filtered results, **When** the user sorts by partnership, owner, type, status, commitment, paid-in capital, distributions, NAV, unfunded commitment, DPI, TVPI, IRR, latest tax year, or warning count, **Then** the complete filtered set is ordered consistently before pagination.
4. **Given** active filters, sort, and page state, **When** the URL is copied and opened in a new session with equivalent access, **Then** the same view state is restored.
5. **Given** one or more active filters, **When** the user clears all filters, **Then** the page returns to the complete permitted partnership scope and removes filter parameters from the URL.
6. **Given** more rows than fit on one page, **When** the user changes pages, **Then** filters, sort, totals, and column headers remain stable and no matching partnership is skipped or duplicated.

---

### User Story 3 - Move Between Portfolio and Individual Work (Priority: P1)

An investment administrator can move from an aggregate row into the existing Partnership Tracker workspace for that partnership and return to the same aggregate context.

**Why this priority**: The aggregate view should guide action, while the established detail workspace remains the place to review or edit a partnership's K-1, capital, NAV, fees, and identity.

**Independent Test**: Apply filters and sorting, open a partnership from the results, verify the existing tracker selects it, then return and verify the prior aggregate URL restores the same filters, sort, and page.

**Acceptance Scenarios**:

1. **Given** a partnership row, **When** the user activates its name or open action, **Then** the existing Partnership Tracker opens with that partnership selected.
2. **Given** either the aggregation page or individual tracker, **When** the page header renders, **Then** a clear view switcher distinguishes `All partnerships` from `Partnership workspace`.
3. **Given** a user entered the tracker from a filtered aggregate view, **When** they use browser Back, **Then** the aggregation view restores from the URL without losing its filters, sort, or page.
4. **Given** an Admin adds a partnership from the aggregate view, **When** creation succeeds, **Then** the existing individual tracker opens for the new partnership and the aggregation cache is invalidated.
5. **Given** a non-Admin user, **When** the aggregate view renders, **Then** read-only navigation remains available and create/edit actions remain absent according to existing permissions.

---

### User Story 4 - Review the Portfolio on Different Screen Sizes (Priority: P2)

An investment administrator can review aggregate totals and locate partnerships on desktop, tablet, or mobile without clipped controls or inaccessible data.

**Why this priority**: The wide financial comparison is primarily a desktop workflow, but filters, totals, and row access must remain usable at smaller widths.

**Independent Test**: Exercise the populated, empty, loading, and error states at 1440 px, 1024 px, 768 px, and 390 px widths using keyboard-only navigation and reduced motion.

**Acceptance Scenarios**:

1. **Given** a desktop viewport, **When** the page renders, **Then** the filter rail and KPI band remain visible while the table uses the available content width.
2. **Given** the table is wider than its container, **When** horizontal scrolling is required, **Then** only the table region scrolls and partnership identity remains visible through a sticky first column.
3. **Given** a narrow viewport, **When** the page renders, **Then** filters open in an accessible drawer, KPI cards remain readable, and each partnership can still be opened without depending on hover.
4. **Given** keyboard or assistive-technology use, **When** filters, sorting, pagination, and row links are operated, **Then** controls have labels, focus is visible, current sort is announced, and dynamic result counts are exposed without moving focus unexpectedly.
5. **Given** reduced-motion preference, **When** results or filters change, **Then** nonessential transitions are disabled.

---

### User Story 5 - Consolidate One Partnership Across Owners (Priority: P1)

An investment administrator sees one partnership-level row when the same investment is held by multiple owners, expands that row to review each owner record, and can deliberately add another owner record to an existing partnership aggregate.

**Why this priority**: Owner-specific K-1s, commitments, NAV, and notes must remain independent in the workspace, but repeating the partnership in the portfolio ledger obscures the true partnership count and totals.

**Independent Test**: Create two owner records for `AC Bell Investors, LLC` with different commitments, K-1 values, distributions, and NAV; verify one collapsed aggregate row shows exact summed values, expansion shows both linked owner records, and the individual workspace still lists two records.

**Acceptance Scenarios**:

1. **Given** two owner records share an aggregation group, **When** All Partnerships loads, **Then** one parent row represents the partnership and pagination counts it once.
2. **Given** a collapsed multi-owner row, **When** it renders, **Then** additive amounts and DPI/TVPI are recomputed from all in-scope owner records while IRR is identified as owner-detail-only.
3. **Given** a multi-owner row, **When** the user expands it, **Then** one child row per owner record shows that record's original values and links to its independent Partnership workspace.
4. **Given** the Add Partnership dialog, **When** the administrator chooses `Existing partnership, new owner`, **Then** they select an existing partnership and an owner who does not already have that record; name and type are inherited and the new record joins the selected aggregate.
5. **Given** the administrator chooses `New partnership`, **When** creation succeeds, **Then** a new aggregation identity is created even if a similarly named investment exists for another owner.
6. **Given** duplicate legacy owner records with the same normalized name and partnership type, **When** the grouping migration runs, **Then** they receive one durable aggregation identity without merging their K-1, commitment, NAV, or other owner-specific data.

### Edge Cases

- The scoped dataset is empty, or active filters match no partnerships.
- A partnership has no commitment, K-1 year, distribution, NAV, inception date, or outside-basis value.
- A true zero amount must not be displayed as unavailable.
- Different partnerships have NAV values from different valuation dates; the aggregate discloses per-row dates and portfolio coverage rather than implying one common valuation date.
- A partnership's latest workflow status is absent because it has no K-1 year.
- A saved URL contains an unknown owner, type, status, sort key, page, or malformed parameter; invalid values fall back safely without failing the page.
- A filter change makes the current page number invalid; the result returns to the first valid page.
- A partnership is created, renamed, reassigned, or deleted in another session while the aggregation page is open; refresh returns a stable, nonduplicated result set.
- Signed unfunded commitment or unrealized gain can be negative and must retain its sign in row and portfolio totals.
- Portfolio ratios are unavailable when the filtered set has no known, nonzero contributed capital; they are never coerced to zero.
- A multi-owner group can contain mixed lifecycle/workflow/quality states; the parent discloses the mixed state and child rows retain exact statuses.
- Filtering to one owner keeps the partnership group but recalculates its parent totals from only the matching owner records.
- A selected existing partnership already has records for every available owner; creation is disabled and the interface explains why.

## Requirements *(mandatory)*

### Functional Requirements

#### Navigation and Page Structure

- **FR-001**: The system MUST provide a dedicated authenticated Partnership Aggregation page without replacing the existing individual Partnership Tracker workspace.
- **FR-002**: The aggregation and individual pages MUST expose a consistent `All partnerships` / `Partnership workspace` view switcher.
- **FR-003**: Activating a partnership result MUST navigate to `/partnership-tracker?partnership={id}` and preserve standard browser Back behavior.
- **FR-004**: Admin users MUST be able to launch the existing add-partnership flow from the aggregation page; non-Admin users MUST NOT see the add action.

#### Scoped Aggregation

- **FR-010**: The aggregation endpoint MUST apply existing authentication, entity-membership scope, and Admin scope rules before filtering, sorting, aggregating, or returning partnership data.
- **FR-011**: The system MUST calculate portfolio KPIs from the complete filtered scope, not only the currently visible page.
- **FR-012**: Portfolio KPI output MUST include filtered partnership count, known committed capital, known paid-in capital, known distributions, known latest NAV, known unfunded commitment, portfolio DPI, and portfolio TVPI.
- **FR-013**: Portfolio DPI MUST equal filtered known distributions divided by filtered known paid-in capital when the denominator is nonzero; otherwise it MUST be unavailable.
- **FR-014**: Portfolio TVPI MUST equal filtered known distributions plus filtered known latest NAV, divided by filtered known paid-in capital when the denominator is nonzero; otherwise it MUST be unavailable.
- **FR-015**: The system MUST NOT calculate portfolio IRR by averaging or weighting partnership-level IRRs. A pooled IRR is outside this feature unless it is calculated from underlying dated cash flows in a later specification.
- **FR-016**: Each additive money KPI MUST include coverage metadata identifying how many filtered partnerships have a known source value. Missing values MUST be excluded from sums and MUST NOT be treated as zero.
- **FR-017**: The aggregate response MUST expose the server calculation/as-of date and the earliest and latest NAV valuation dates represented by known row values.

#### Partnership Rows

- **FR-020**: Every result row MUST include partnership ID/name, owner ID/name, partnership type, lifecycle status, latest K-1 tax year and workflow status, current commitment, cumulative paid-in capital, cumulative distributions, latest NAV and valuation date, unfunded amount, DPI, TVPI, IRR, warning count, and metric-availability states needed to explain missing values.
- **FR-021**: All money fields MUST remain exact two-decimal strings and all ratio fields MUST remain fixed-decimal unit-ratio strings at the API boundary.
- **FR-022**: The UI MUST format money, percentages, dates, status, negative values, true zero, and unavailable values consistently with the existing tracker.
- **FR-023**: A row with incomplete performance inputs MUST remain visible and MUST provide a human-readable data-quality indicator.
- **FR-024**: The system MUST distinguish grouped partnership count from the count of underlying owner records used for financial coverage.
- **FR-025**: Every persisted partnership owner record MUST have a durable aggregation-group identity that does not replace its independent partnership record ID.
- **FR-026**: The aggregation endpoint MUST group matching owner records before sorting and pagination and MUST return each grouped partnership with its complete matching member rows.
- **FR-027**: Parent-row commitment, paid-in capital, distributions, latest NAV, and unfunded commitment MUST be exact sums of known matching owner values; parent DPI and TVPI MUST be recomputed from grouped numerators and denominators.
- **FR-028**: The system MUST NOT average owner-level IRRs for a grouped partnership; a multi-owner parent MUST direct the user to owner details for IRR.
- **FR-029**: Filters MUST apply to owner records before grouped totals are composed so the parent row and rollup describe only the filtered scope.

#### Filters, Sort, Pagination, and URL State

- **FR-030**: The system MUST support case-insensitive search across partnership and owner name.
- **FR-031**: The system MUST support multi-select filters for owner, sector/partnership type, lifecycle status, latest K-1 workflow status (including no year), and data-quality state (complete, missing financial data, or warnings). The aggregation UI labels the existing partnership-type taxonomy as Sector and exposes its available values, including Private Equity, Real Estate, Hedge Fund, Venture Capital, Credit, Infrastructure, and Other.
- **FR-032**: Different filter categories MUST combine with AND semantics; multiple selected values within one category MUST combine with OR semantics.
- **FR-033**: The system MUST support ascending and descending server-side sorting across the complete filtered set for partnership, owner, type, status, current commitment, paid-in capital, distributions, latest NAV, unfunded commitment, DPI, TVPI, IRR, latest tax year, and warning count.
- **FR-034**: The aggregation endpoint MUST paginate only after scope, filters, totals, and sort have been applied and MUST return total matching row count plus stable next/previous navigation information.
- **FR-035**: The browser URL MUST encode nondefault search, filters, sort, direction, and page so refresh, history navigation, and copied URLs restore the view.
- **FR-036**: Invalid URL/query values MUST be ignored or normalized to documented defaults and MUST NOT cause an unhandled page or API error.
- **FR-037**: Changing any filter or page size MUST reset the result to the first page.
- **FR-038**: The aggregation response MUST provide filter-facet options and counts from the user's permitted base scope so the UI does not need separate owner or enumeration discovery requests.

#### Interface and Accessibility

- **FR-040**: The aggregation page MUST use a purpose-built portfolio layout with a compact KPI band, visible active-filter summary, filter rail on wide screens, and dense financial table; it MUST NOT embed the existing individual detail panels below the aggregate table.
- **FR-041**: The table MUST keep the partnership identity column sticky during table-region horizontal overflow and MUST not make the entire page scroll horizontally.
- **FR-042**: At narrow widths, filters MUST move into a labeled modal/drawer with focus trapping, Escape/close behavior, focus restoration, and a 44px minimum interactive target.
- **FR-043**: Sort controls MUST expose their current direction through text or accessible attributes, and result-count updates MUST be announced through a polite live region.
- **FR-044**: Loading, empty base scope, no filter matches, partial-data, error, and retry states MUST be distinct and actionable.
- **FR-045**: Meaningful data must be present without animation; any transitions MUST respect `prefers-reduced-motion`.
- **FR-046**: The visual treatment MUST stay within the established Atlas black, warm-white, gold, and gray palette while using tabular numerics, visible grid rules, and restrained motion to distinguish the aggregation surface from generic card dashboards.
- **FR-047**: The add flow MUST offer explicit `New partnership` and `Existing partnership, new owner` modes rather than requiring users to infer grouping from typed names.
- **FR-048**: Existing-partnership creation MUST inherit name, type, and aggregation identity from an in-scope source partnership and MUST reject an owner that already has that partnership.
- **FR-049**: The Partnership workspace MUST continue to list and edit every owner record independently after those records are grouped on All Partnerships.

#### Consistency and Performance

- **FR-050**: The server MUST use one bounded, set-based aggregation read per request and MUST NOT fetch detail endpoints once per partnership.
- **FR-051**: Aggregate and existing list/detail queries MUST share canonical source precedence and financial derivation rules so the same partnership value does not disagree between pages.
- **FR-052**: Existing partnership create, update, commitment, NAV, K-1, owner rename, and owner reassignment mutations MUST invalidate aggregation query caches.
- **FR-053**: No new persisted summary table or browser-calculated source of truth MUST be introduced for this feature.

### Key Entities *(include if feature involves data)*

- **Partnership Aggregate Row**: Read-only projection of one scoped partnership and its current identity, workflow, capital, NAV, return, and data-quality fields.
- **Partnership Portfolio Rollup**: Read-only filtered totals, derived DPI/TVPI, source coverage, as-of date, and NAV date range; never persisted.
- **Aggregation Filter Set**: Search, multi-value owner/type/lifecycle/workflow/data-quality filters, sort key/direction, page, and page size represented by validated API and URL parameters.
- **Aggregation Facet**: An available owner, type, lifecycle, workflow, or data-quality filter option with a count derived from the permitted base scope.
- **Metric Coverage**: Known partnership count and filtered partnership count for an aggregate money value, used to distinguish a complete total from a partial total.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixture of 200 scoped partnerships, every matching partnership appears exactly once across pagination and no out-of-scope partnership appears.
- **SC-002**: For every automated filter combination, the displayed result count, facet selection, portfolio KPIs, and rows describe the same filtered scope in 100% of contract tests.
- **SC-003**: Portfolio money totals and derived DPI/TVPI match exact expected values to the established money and ratio precision in 100% of calculation tests, including missing and zero inputs.
- **SC-004**: A user can filter to partnerships needing attention, identify the relevant row, and open its individual workspace in no more than three interactions after the page loads.
- **SC-005**: An aggregation request for 500 scoped partnerships returns its first page, complete filtered rollup, and facets within 2 seconds in the integration test environment and performs no per-partnership query loop.
- **SC-006**: At 1440px, 1024px, 768px, and 390px widths, filters, KPIs, table access, pagination, and partnership navigation remain usable with no page-level horizontal overflow.
- **SC-007**: Keyboard-only and automated accessibility tests find no critical violations in filter, sort, pagination, drawer, loading, empty, error, or row-navigation states.

## Assumptions

- Atlas reuses the existing React 19, React Router, TanStack Query, Tailwind, Fastify, Zod, PostgreSQL, session/RBAC, entity scope, and exact financial string conventions.
- The aggregation is a sibling page to the existing Partnership Tracker, not a replacement for the current selected-partnership editor.
- The first release is read-only except for reusing the existing Admin add-partnership dialog and links into the existing detail workspace.
- CSV/XLSX export, saved named views, bulk editing, pooled portfolio IRR, charts, and time-series trend analysis are outside this feature.
- Existing partnership status and type enumerations remain authoritative.
- Existing tracker summary derivations from spec 017 remain authoritative for row values; this feature adds portfolio-level composition and query behavior.
- The target scale is hundreds of partnerships, with 500 used as the primary performance fixture.
