# Feature Specification: Cash-Flow-Sourced Overview and Private Investment Tracker

**Feature Branch**: `020-overview-logic-from-cashflow`
**Created**: 2026-07-23
**Status**: Draft
**Input**: User description: "Source partnership Overview values from Net Cash Activity instead of K-1 inputs, add a default Private Investment Tracker page modeled on Private_Investment_Metrics.xlsx, support bottom-ledger filters that control the entity-fund summary, and export a column-selectable C-suite PDF."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust the Partnership Overview (Priority: P1)

An authenticated user opens a partnership workspace and sees investment-performance values derived only from the partnership's real-time Net Cash Activity, current commitment history, and NAV history. K-1 values remain tax-document facts and do not silently drive investment metrics.

**Why this priority**: The Overview is used to understand current investment performance. A tax document must not become the fallback source for cash activity when accounting bases or reporting periods differ.

**Independent Test**: Create a partnership whose K-1 contributions and distributions deliberately disagree with its dated cash activity, commitment, and NAV records; verify every investment metric on Overview follows the dated operational records and remains unchanged when K-1 fields are edited.

**Acceptance Scenarios**:

1. **Given** a partnership has both K-1 values and dated Net Cash Activity, **When** Overview loads, **Then** capital calls, non-recallable distributions, recallable distributions, remaining commitment, DPI, TVPI, and IRR use the dated activity and capital/NAV records only.
2. **Given** a partnership has K-1 values but no dated Net Cash Activity, **When** Overview loads, **Then** cash-derived metrics are unavailable or zero according to their documented availability rules and never fall back to the K-1.
3. **Given** a K-1 value changes, **When** the partnership summary is refreshed, **Then** no investment metric changes unless a Net Cash Activity, commitment, NAV, or partnership identity input also changed.
4. **Given** a recallable distribution exists, **When** metrics are calculated, **Then** it increases the effective commitment, is included as a positive dated cash flow for XIRR, and is excluded from non-recallable distributions, DPI, and TVPI.

---

### User Story 2 - Review the Private Investment Book (Priority: P1)

An authenticated user opens `Private Investment Tracker` and sees a workbook-inspired page with a top entity-fund summary and a bottom chronological activity ledger for every partnership in the user's permitted entity scope.

**Why this priority**: Executives and investment staff need one operational view that relates every owner-specific fund position to the dated activity behind its metrics.

**Independent Test**: Seed multiple entities that own the same and different funds, including calls, both distribution types, commitments, and NAV entries; verify one top row exists for each entity-partnership pair and the complete bottom ledger is ordered newest first.

**Acceptance Scenarios**:

1. **Given** multiple entities hold the same fund, **When** the page loads, **Then** each entity-fund pair receives its own summary row and its events never merge with another owner's position.
2. **Given** a partnership has cash and valuation history, **When** the bottom section renders, **Then** capital calls, non-recallable distributions, recallable distributions, and NAV valuations appear as dated rows ordered newest first with deterministic tie-breaking.
3. **Given** the top section renders, **When** metrics are shown, **Then** it includes the workbook-aligned identity, commitment, status, vintage, invested capital, distribution, valuation, and return fields.
4. **Given** the page is refreshed after a cash activity, commitment, NAV, or partnership change, **When** the request completes, **Then** the top summary and bottom ledger use the same current source data.
5. **Given** a K-1 field is edited, imported, reconciled, or signed off, **When** the Private Investment Tracker refreshes, **Then** its investment values do not change.

---

### User Story 3 - Filter Details and Control the Summary Population (Priority: P1)

An authenticated user filters the bottom ledger with autocomplete selectors and range inputs. The matching detail rows update, and the top section shows the complete lifetime position for each entity-fund pair represented by at least one matching detail row.

**Why this priority**: The bottom ledger is the page's investigative control surface; the top table must follow the selected population without exposing a second, conflicting filter system or producing distorted partial-period return ratios.

**Independent Test**: Apply every filter separately and in combination to a mixed event fixture; verify the bottom rows, active filters, top entity-fund row membership, URL, and PDF scope stay consistent.

**Acceptance Scenarios**:

1. **Given** the bottom ledger, **When** the user selects one or more event types, entities, or funds from autocomplete dropdowns, **Then** values within a filter combine with OR semantics and different filter categories combine with AND semantics.
2. **Given** optional minimum and maximum dates, **When** either or both are entered, **Then** the inclusive date range is applied and an invalid reversed range is rejected with an actionable message.
3. **Given** optional minimum and maximum dollar amounts, **When** either or both are entered, **Then** the inclusive range is applied to event magnitude so calls and inflows of the same dollar size can both match.
4. **Given** filtered detail rows, **When** the top section updates, **Then** it contains exactly the distinct entity-fund pairs represented in the complete filtered result, not just the current detail page.
5. **Given** an entity-fund pair matches the bottom filters, **When** its top metrics are calculated, **Then** calls, distributions, latest NAV, commitment, and ratios use the pair's complete operational history rather than only the filtered event subset.
6. **Given** no rows match, **When** the page updates, **Then** both sections show a clear no-results state and retain the active filters for correction.

---

### User Story 4 - Export a C-Suite PDF (Priority: P1)

An authenticated user chooses the summary and detail columns to include and exports the complete filtered Private Investment Tracker as a polished, landscape PDF modeled on the supplied workbook.

**Why this priority**: The page is intended to produce an executive artifact, not only an interactive working table.

**Independent Test**: Filter to a known entity and date range, select a nondefault column set, export, and verify the PDF contains only those columns, all matching entity-fund summaries and detail rows, filter context, generated date, repeated table headers, and no out-of-scope records.

**Acceptance Scenarios**:

1. **Given** the export dialog, **When** the user selects columns, **Then** summary and detail columns can be included or excluded independently and at least one column per included section is required.
2. **Given** a filtered result spanning multiple on-screen pages, **When** PDF export runs, **Then** the PDF contains the complete filtered result, not only visible rows.
3. **Given** a wide selected column set, **When** the PDF is generated, **Then** the layout uses landscape pages, readable scaling, repeated headers, non-clipped values, and explicit continuation pages.
4. **Given** missing values or negative outflows, **When** the PDF renders, **Then** missing remains distinct from zero and accounting-style signs/parentheses remain legible.
5. **Given** the export succeeds, **When** the response is received, **Then** the browser downloads a PDF with a descriptive filename and the application remains on the current filtered page.

---

### User Story 5 - Land on the Tracker after Login (Priority: P2)

An authenticated user sees `Private Investment Tracker` in the main navigation and lands there by default after a successful login or use of the existing authenticated dashboard redirect.

**Why this priority**: The new tracker is the primary portfolio operating view and should be the first surface users see.

**Independent Test**: Sign in, use the dashboard alias, navigate through every shell link, refresh the tracker, and verify protected-route, active-navigation, Back, and deep-link behavior.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** login succeeds, **Then** the user is sent to `/private-investment-tracker`.
2. **Given** an authenticated request to `/dashboard`, **When** routing resolves, **Then** it redirects to `/private-investment-tracker`.
3. **Given** any authenticated shell page, **When** navigation renders, **Then** a `Private Investment Tracker` link is visible and receives the correct active state on its route.
4. **Given** a user opens another valid protected deep link, **When** the app loads, **Then** the new default route does not replace that requested destination.

### Edge Cases

- A scoped user has no partnerships, no activity, no commitment, or no NAV entries.
- A partnership has calls but no NAV, distributions but no calls, a zero commitment, or a latest NAV older than its latest cash activity.
- True zero, unavailable, negative remaining commitment, and negative performance values must remain distinguishable.
- More than one event has the same entity, fund, date, type, and amount; stable event IDs prevent dropped or duplicated rows.
- A recallable distribution has already generated a linked commitment snapshot; calculations must not add it to commitment a second time.
- A commitment or NAV has a future effective date; current Overview excludes it, while an explicit historical/as-of calculation follows documented date semantics.
- Filter URL values are unknown, malformed, out of scope, or reversed; they are normalized or rejected without leaking facet data.
- An event or partnership changes while a user is on a later detail page; refreshed pagination returns a stable valid page.
- PDF column selection is too wide for one readable table; the export splits columns or pages predictably rather than clipping.
- The current workbook includes a K-1-derived example source row; the application must not reproduce that source because K-1 values are verification-only for this feature.

## Requirements *(mandatory)*

### Functional Requirements

#### Canonical Operational Sources

- **FR-001**: Investment metrics on Partnership Overview and Private Investment Tracker MUST use `capital_activity_events`, effective `partnership_commitments`, `partnership_fmv_snapshots`, and partnership identity/classification records as their only financial sources.
- **FR-002**: K-1 tracker years, active K-1 field revisions, Section L, Part III, annual K-1 projections, and K-1-derived fallbacks MUST NOT supply investment cash activity, commitment, NAV, or return metrics on either surface.
- **FR-003**: K-1 data MUST remain available for tax-basis calculation and later reconciliation against operational annual activity without being mutated by this feature.
- **FR-004**: Overview and the new tracker MUST reuse one canonical operational performance composer so call, distribution, recallable distribution, NAV, commitment, sign, missing-value, and ratio rules cannot drift.
- **FR-005**: All money MUST remain exact two-decimal decimal strings and all ratios MUST remain fixed-decimal unit-ratio strings at API boundaries; browser floating-point arithmetic MUST NOT be the source of truth.

#### Overview Derivations

- **FR-010**: Total invested MUST equal the positive magnitude sum of all dated `funded_contribution` Net Cash Activity entries for the entity-partnership record.
- **FR-011**: Non-recallable distributions MUST equal the positive magnitude sum of `distribution` entries and MUST exclude `recallable_distribution` entries.
- **FR-012**: Recallable distributions MUST be reported separately, included as positive dated XIRR cash flows, and excluded from DPI and TVPI distribution numerators.
- **FR-013**: Current total committed MUST equal the latest effective commitment snapshot on or before the calculation date; linked recallable-distribution snapshots already contain the cumulative increase and MUST NOT be incremented again by the metric composer.
- **FR-014**: Remaining commitment MUST equal current total committed less total invested and MAY be negative; missing commitment or missing calls MUST produce an explicit availability state rather than a fabricated value.
- **FR-015**: Latest valuation MUST equal the most recent eligible NAV snapshot, including its valuation date; the system MUST NOT substitute paid-in capital when NAV is absent.
- **FR-016**: DPI MUST equal non-recallable distributions divided by total invested when total invested is positive; otherwise it MUST be unavailable.
- **FR-017**: TVPI MUST equal non-recallable distributions plus latest NAV, divided by total invested when total invested is positive and NAV is known; otherwise it MUST be unavailable.
- **FR-018**: XIRR MUST use exact dates with calls as negative flows, both distribution types as positive flows, and the latest NAV as terminal value; its availability and any carried-forward-NAV condition MUST be disclosed.
- **FR-019**: Overview tax-position fields such as latest tax year, ending outside basis, K-1 workflow status, and K-1 warnings MAY remain visibly tax-sourced but MUST be visually separated from operational investment metrics.

#### Private Investment Tracker Page

- **FR-020**: The system MUST add an authenticated `/private-investment-tracker` page and a main-navigation item labeled `Private Investment Tracker`.
- **FR-021**: The page MUST contain a top entity-fund summary section and a bottom activity-detail section visually aligned with the supplied workbook while retaining Jackson typography, color, responsiveness, and accessibility conventions.
- **FR-022**: A top row MUST represent one scoped entity-partnership record and MUST expose both `entityId` and `partnershipId`; the stable row key MUST be their composite relationship and MUST NOT collapse the same fund across owners.
- **FR-023**: Top rows MUST include Entity, Fund, Asset Class, Total Committed, Remaining Commitment, Status, Vintage Year, Total Invested, Non-Recallable Distributions, Recallable Distributions, Latest Valuation and valuation date, DPI, and TVPI.
- **FR-024**: The design MUST support exact XIRR and simplified annualized return as optional summary columns, with unavailable states when inputs are insufficient.
- **FR-025**: Vintage Year MUST equal the year of the earliest dated capital call and MUST be unavailable when no capital call exists.
- **FR-026**: Simplified annualized return MUST use TVPI over the holding period from the earliest capital call to the performance as-of date and MUST be unavailable for insufficient or nonpositive inputs.
- **FR-027**: PDF exports MUST default to landscape orientation so the standard selected summary columns fit on one page when practical.
- **FR-028**: The bottom activity ledger MUST union only Net Cash Activity entries and NAV valuation entries. Current commitment history supplies top summary values but MUST NOT appear as a cash-flow row or duplicate capital calls.
- **FR-029**: Bottom rows MUST expose stable row ID, entity ID/name, partnership ID/name, date, signed display amount, positive magnitude, type, source surface, and source record metadata needed for deterministic sorting and links.
- **FR-030**: Bottom row types MUST be `CAPITAL_CALL`, `NON_RECALLABLE_DISTRIBUTION`, `RECALLABLE_DISTRIBUTION`, and `VALUATION`; the repeated distribution label in the original prompt is normalized to the distinct recallable option shown in the workbook and existing application model.
- **FR-031**: Capital calls MUST display as outflows, distributions as inflows, and valuations as point-in-time values rather than cash inflows, even though all stored source amounts remain positive magnitudes.
- **FR-032**: Bottom rows MUST sort by date descending, then source creation time descending, type order, and stable source ID so the newest records appear first without unstable ties.

#### Filters, Summary Population, and URL State

- **FR-040**: The bottom section MUST provide multi-select autocomplete filters for type, entity, and fund.
- **FR-041**: The bottom section MUST provide independently optional inclusive minimum and maximum date inputs and independently optional inclusive minimum and maximum amount-magnitude inputs.
- **FR-042**: Different filter categories MUST combine with AND semantics; multiple values within type, entity, or fund MUST combine with OR semantics.
- **FR-043**: Entity, fund, and facet options MUST be derived only after authorization scope is applied and MUST NOT reveal out-of-scope names or counts.
- **FR-044**: The complete filtered detail set MUST determine top-row membership: every distinct matching entity-partnership pair appears once, including pairs found outside the current detail page.
- **FR-045**: Top metrics for a matching pair MUST use its complete operational history, current effective commitment, and latest NAV; type/date/amount filters MUST NOT turn lifetime DPI, TVPI, or commitment into misleading partial-period metrics.
- **FR-046**: Active filters, detail page, and page size MUST be encoded in normalized URL query parameters so refresh, Back, and copied URLs restore the same view.
- **FR-047**: Invalid or out-of-scope URL values MUST be ignored or normalized, reversed ranges MUST return clear validation feedback, and every valid filter change MUST reset detail pagination to the first page.
- **FR-048**: The top section MUST NOT expose a separate filter system, but it MUST label its metrics as lifetime values for the entity-fund pairs selected by the detail filters.
- **FR-049**: Filtering and entity-fund aggregation MUST occur on the server across the complete scoped dataset before detail pagination.

#### PDF Export

- **FR-050**: Users MUST be able to open a PDF export dialog from the Private Investment Tracker and select summary columns and detail columns independently.
- **FR-051**: The export MUST include the complete filtered dataset and matching lifetime summary population, never only the current on-screen detail page.
- **FR-052**: Export requests MUST reapply authorization scope and the normalized filters on the server and MUST NOT trust client-supplied rows or calculated totals.
- **FR-053**: The generated PDF MUST use a workbook-inspired landscape layout with Jackson branding, report title, generated timestamp, active-filter summary, summary table before detail table, repeated table headers, page numbers, accounting-style numbers, and readable missing-value markers.
- **FR-054**: The export MUST honor the selected column order, reject unknown or empty required column selections, and avoid clipping by using documented page/column splitting rules.
- **FR-055**: Successful export MUST download `private-investment-tracker-YYYY-MM-DD.pdf` with `application/pdf`; failure MUST leave the page state intact and provide an actionable retry message.

#### Navigation, Authorization, and Consistency

- **FR-060**: Successful login and the existing authenticated `/dashboard` alias MUST route to `/private-investment-tracker`; valid explicit protected deep links MUST remain unchanged.
- **FR-061**: The existing session, role, and partnership entity-scope middleware MUST apply before every list, facet, summary, and export calculation.
- **FR-062**: The new page MUST provide distinct loading, base-empty, filtered-empty, error, stale-refresh, and export-progress states.
- **FR-063**: Tables MUST use local horizontal overflow, sticky identity columns where practical, tabular numerics, visible keyboard focus, labeled filters, announced result counts, 44px minimum interactive targets, and reduced-motion behavior.
- **FR-064**: Net Cash Activity, commitment, NAV, partnership create/update/delete, and entity reassignment mutations MUST invalidate Overview, existing aggregation, and Private Investment Tracker query families as applicable.
- **FR-065**: No persisted summary table, duplicated cash-flow record, or browser-maintained financial source of truth MUST be added.
- **FR-066**: The read path MUST use bounded set-based queries and MUST NOT issue one database query per entity-fund summary row.

### Key Entities *(include if feature involves data)*

- **Private Investment Activity Row**: Read-only projection of one cash activity event or NAV valuation with entity, fund, date, type, amount semantics, source metadata, and a stable source-specific ID.
- **Entity-Fund Position**: Read-only lifetime operational summary for one owner-specific partnership record, keyed by entity ID and partnership ID and containing commitment, cash, valuation, and return metrics.
- **Private Investment Filter Set**: Validated type/entity/fund selections, optional inclusive date and amount bounds, detail page, and page size represented in both API and browser URL state.
- **Private Investment Facet Set**: In-scope type, entity, and fund autocomplete options with counts derived without leaking unauthorized records.
- **PDF Column Selection**: Ordered, validated summary and detail column identifiers used to build the complete filtered executive artifact.
- **Operational Performance Input**: Exact dated calls/distributions, latest NAV, effective commitment, identity, and status inputs consumed by the shared performance composer; it contains no K-1 financial fallback.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In fixtures where K-1 values conflict with operational cash activity, 100% of Overview and Private Investment Tracker investment metrics match cash activity, commitment, and NAV sources and none match solely because of K-1 fallback.
- **SC-002**: For every test fixture, each scoped entity-partnership pair appears exactly once in the top section, events never cross entity scope, and all bottom rows appear exactly once across pagination.
- **SC-003**: Total invested, both distribution categories, remaining commitment, DPI, TVPI, XIRR inputs, valuation selection, and recallable-distribution treatment match exact expected values in 100% of calculation tests, including missing, zero, negative, and stale-NAV cases.
- **SC-004**: Every supported filter and valid combination returns the correct complete detail population, top row membership, facet scope, restored URL state, and export scope in automated contract tests.
- **SC-005**: A user can filter by entity, fund, type, date, and amount and identify a matching activity row without leaving the page; autocomplete and range controls remain keyboard-operable at 1440px, 1024px, 768px, and 390px.
- **SC-006**: A PDF generated from a multipage filtered fixture contains 100% of matching rows, only selected columns, repeated headers, filter context, readable values, no out-of-scope data, and valid PDF bytes.
- **SC-007**: A scoped read for 500 entity-fund positions and 10,000 activity/valuation rows returns the first detail page, full matching position summaries, and facets within 2 seconds in the integration-test environment without per-position query loops.
- **SC-008**: Successful login reaches Private Investment Tracker in one redirect, and navigation/deep-link automated tests show no redirect loop or regression to existing protected routes.

## Assumptions

- The supplied `Private_Investment_Metrics.xlsx` is the financial-model and visual reference; Jackson remains the application brand and existing accessible web conventions take precedence over pixel-for-pixel spreadsheet imitation.
- Capital calls come from Net Cash Activity. The phrase "Capital Call entries from the Capital & NAV tab" is interpreted using the workbook and current data model: NAV history joins the detail ledger, while commitment history supplies top Total Committed and does not become a cash-flow row.
- The duplicate `Non-Recallable Distribution` filter option in the prompt is interpreted as one non-recallable and one recallable distribution option because the workbook and existing Net Cash Activity model contain both.
- Bottom filters determine which entity-fund positions are represented, while top metrics stay lifetime-to-date for those positions. This mirrors the workbook's full-table formulas and prevents a date/type filter from producing misleading partial DPI/TVPI.
- Amount ranges apply to absolute magnitude, while accounting direction remains visible through type and signed display formatting.
- Commitment snapshots linked to recallable distributions already represent the increased commitment. No second recallable adjustment is applied by summary calculations.
- Existing partnership status and asset-class enumerations remain authoritative; the workbook's sample labels do not themselves create new classification values.
- K-1-to-operational reconciliation enhancements, editing activity from the new aggregate page, and saved filters are outside this feature.
