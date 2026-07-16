# Research: Partnership Tracker Revisions

## 1. IRR Precision and Older NAV Handling

**Decision**: Keep IRR as a server-calculated unit-ratio decimal string, increase solver serialization from four to at least eight decimal places, and render it as `(ratio * 100).toFixed(2)`. Build the XIRR series exactly as today for annual contributions and distributions, but place the latest NAV amount on `max(actual NAV date, latest combined cash-flow date)`. Continue returning the actual NAV valuation date separately and add an IRR terminal-date/carry-forward indicator to calculation metadata.

**Rationale**: The current solver returns `toFixed(4)` and the UI renders one decimal percentage place. More server precision prevents a second display rounding from operating on an already coarse value. Carrying the latest known NAV amount to the terminal date allows the normal case where cash is received before the next K-1/NAV statement without changing source provenance or manufacturing a new NAV record.

**Alternatives considered**:

- Reject NAV older than annual cash flows: rejected because it causes the reported production problem and makes current cash activity untrackable.
- Backdate newer distributions to the NAV date: rejected because it changes known cash-flow timing and distorts IRR.
- Create a new NAV snapshot at the terminal date: rejected because a calculation convention must not create false source evidence.
- Calculate IRR in the browser: rejected because the API is already the authoritative source and multiple screens consume the result.

## 2. Annualized Cash-on-Cash Yield

**Decision**: Add a derived metric with this formula:

```text
paidInCapital = sum(canonical capital_contributions with legacy yearly fallback)
cashReceived = sum(abs(box_19_distributions))
activeYears = max(1 day, calculationAsOfDate - inceptionDate) / 365.25 days
annualizedCashOnCashYield = (cashReceived / paidInCapital) / activeYears
```

Use the server current date as `calculationAsOfDate`, expose that date, return a fixed-decimal unit ratio, and display two percentage decimal places. Return explicit `MISSING_INCEPTION_DATE` or `MISSING_CONTRIBUTIONS` availability when needed. An explicit zero distribution produces an available `0.00%`.

**Rationale**: This is the simple life-to-date annualization described by the user, not a time-weighted return or IRR. A true inception date is required both here and for fee proration; `partnerships.created_at` is an application timestamp and cannot stand in for the economic start date.

**Alternatives considered**:

- Use inclusive tax-year count: rejected because a December investment would be treated as active for a full year and could not support day-based fee proration consistently.
- Use latest K-1 or NAV date as the as-of date: rejected because the metric is meant to answer life-to-date cash received per active year and should continue aging during reporting gaps.
- Use average paid-in capital: rejected because the requested example divides cumulative cash received by total paid-in capital.
- Treat this as another IRR: rejected because the user explicitly wants a simpler cash-on-cash measure based on paid-in capital rather than NAV.

## 3. Unfunded Commitment and Unrealized Gain

**Decision**: Extend the derived partnership summary with:

```text
unfundedCommitmentAmount = currentCommittedCapital - totalCapitalContributions
unfundedCommitmentPercentage = unfundedCommitmentAmount / currentCommittedCapital
unrealizedGain = latestNav - latestEndingOutsideBasis
```

Preserve signed values. Return unavailable status when commitment is absent/zero or either unrealized-gain operand is missing. Reuse the canonical annual contribution projection and its per-year legacy fallback, rather than the legacy `capital_activity_events` rollup.

**Rationale**: This matches the requested formulas and the v016 canonical paid-in-capital rule. Signed output exposes overfunding and negative unrealized gain rather than hiding it.

**Alternatives considered**:

- Clamp unfunded commitment to zero: rejected because it would conceal paid-in amounts above commitment and depart from the explicit subtraction formula.
- Read paid-in capital from `capital_activity_events`: rejected because Partnership Tracker v016 made K-1 `capital_contributions` canonical for this surface.
- Persist the derived amounts: rejected because each value is deterministic from current source records and would create synchronization risk.

## 4. Partnership Inception and Management-Fee Configuration

**Decision**: Add nullable `inception_date date` and `management_fee_rate numeric(9,8)` columns to `partnerships`. The rate is a unit ratio constrained to `0 <= rate <= 1`; for example, `0.02000000` means 2%. Expose both in the partnership identity and optimistic-concurrency PATCH. Existing partnerships remain valid with null settings.

**Rationale**: These are current partnership-level settings, not annual tax records. Columns on the existing identity avoid a second settings lifecycle and naturally use the partnership update token and audit event. Nullable fields permit a nonbreaking migration and honest unavailable states.

**Alternatives considered**:

- Use `created_at` as inception: rejected because it records when Atlas learned about the partnership, not when the investment began.
- Add a one-row management-fee settings table: rejected because the requested configuration has no independent history or ownership behavior and would add unnecessary concurrency and joins.
- Store a percentage such as `2.00`: rejected because all performance ratios already use unit-ratio semantics.

## 5. Management-Fee Estimation

**Decision**: Calculate the fee schedule server-side on read through an explicit `asOfDate` query parameter defaulting to the server current date. For each calendar year from inception through `asOfDate`:

1. Split the year at inception, each commitment effective date, and the day after year-end/as-of.
2. Resolve the commitment effective at the start of each segment.
3. Calculate `segmentFee = commitment * rate * activeSegmentDays / daysInCalendarYear`.
4. Round only the final annual and cumulative money outputs to cents using integer/rational arithmetic.

Return annual rows with year, active dates, active days, days in year, weighted fee base, annual rate, and estimated fee, plus cumulative total and availability status. The Capital & NAV tab displays configuration and schedule. Estimated values never write K-1 revisions.

**Rationale**: The algorithm reproduces the requested `151/365` behavior, handles leap years, and respects the repository's effective-dated commitment history. An explicit/defaulted through-date makes tests deterministic and the displayed result explainable.

**Alternatives considered**:

- Apply the latest commitment to every historical year: rejected because it rewrites historical fee estimates when commitment changes.
- Use one year-end commitment for the full year: rejected because it ignores midyear commitment changes even though effective dates already exist.
- Store every calculated annual fee: rejected because the schedule is deterministic and user-entered actual K-1 fees are a distinct concept.
- Automatically copy estimates into K-1 Line 13: rejected because estimated statement economics must not become tax evidence.

## 6. K-1 Line 13 Split and Compatibility

**Decision**: Add writable field keys `box_13_other_portfolio_deductions` and `box_13_management_fees`. Mark `box_13_other_deductions` deprecated for new writes but keep all historical revisions readable. Before calculation, normalize Line 13 as follows:

```text
if either new field key has an active revision:
  effectiveLine13 = otherPortfolioDeductions + managementFees
else:
  effectiveLine13 = legacyOtherDeductions
```

Use `effectiveLine13` everywhere the legacy key currently enters deductions, loss limitation, Section L reconciliation, book-tax reconciliation, and journal entries. Increment the calculation version. Draft calculation applies the same presence-based rule so clearing one new field to null does not reactivate the legacy total.

**Rationale**: The revision table already supports arbitrary controlled field keys, so no new value table is needed. Presence-based cutover prevents double-counting and allows users to split an old combined amount incrementally while preserving source history.

**Alternatives considered**:

- Rename the legacy key in place: rejected because field keys are stored provenance and historical imports depend on it.
- Treat the legacy field as an additional third Line 13 amount: rejected because it double-counts migrated years.
- Backfill old totals into one new field: rejected because it would invent classification that the historical source did not provide.

## 7. Compare Years Layout

**Decision**: Remove the three-year selection guard, initialize selection to all available years, retain user selection while the drawer is open, and allow one through all years. Show exactly three rows: Capital Contributed, Distributions, and Ending Outside Basis. Add nullable `capitalContributed` and `distributions` fields to the existing `K1TrackerYearSummary`; keep the existing `endingOutsideBasis`. Populate all three from the already-calculated partnership-year read model so opening Compare Years does not issue one request per year.

Use an adaptive comparison surface that grows to the available viewport instead of the current fixed `max-w-4xl` drawer. Reserve a 12rem minimum for metric labels and an 8rem minimum for each year. When `12rem + (selected year count * 8rem)` fits inside the table viewport, distribute the remaining width across year columns and do not render a horizontal scrollbar. When that minimum total exceeds the viewport, set the table to that minimum width, scroll only the table region horizontally, and keep the metric-label column sticky. Keep the header, year controls, table body, and close control inside a `100dvh` flex layout with `min-h-0` overflow boundaries so content is never cut off vertically or by sticky positioning.

**Rationale**: The current drawer is capped at `max-w-4xl`, defaults to one year, limits selection to three, and renders five summary rows that do not include the two requested cash-activity values. Adding two fields to the existing year summary is smaller and more reliable than fetching full year details in the browser. Fit-before-scroll uses the page efficiently for normal histories while stable minimum widths protect currency readability for longer histories. Explicit flex/overflow ownership fixes the reported clipping instead of relying on nested default overflow behavior.

**Alternatives considered**:

- Paginate years in groups of three: rejected because it prevents a single full-life comparison.
- Always show horizontal scrolling: rejected because typical histories can fit legibly in the available viewport and the user requested scrolling only when necessary.
- Shrink columns below 8rem to avoid all scrolling: rejected because formatted money would wrap or truncate and recreate the cut-off problem.
- Fetch each selected year detail when the drawer opens: rejected because it creates N+1 requests and avoidable loading/cut-off states for data already available during partnership composition.
- Show every K-1 input or the current five summary rows: rejected by clarification; the comparison is intentionally limited to Capital Contributed, Distributions, and Ending Outside Basis.
- Render a separate page: rejected because the existing drawer workflow is sufficient once it can use viewport width.

## 8. Owner Terminology and Rename Reliability

**Decision**: Use `Owner` in Partnership Tracker create/edit labels and messages while retaining the internal Entity model and `/entities` routes. When PostgreSQL is configured, make the database canonical for entity update lookup, duplicate validation, mutation, and returned value; use the in-memory repository only in no-database local fallback mode. Perform the database update in a transaction and return a conflict for a case-insensitive duplicate. After success, invalidate `entity`, `entities`, K-1 lookup, partnership tracker, legacy partnership, dashboard, and report query families.

**Rationale**: The deployed `PATCH /entities/:id` currently looks up the owner only in `k1Repository` before touching PostgreSQL. A database row absent from that process-local map incorrectly returns `ENTITY_NOT_FOUND`. Partnership summaries already join `entities.name`, so correcting the canonical write and cache refresh propagates a rename without copying names.

**Alternatives considered**:

- Synchronize the full database into the in-memory map before every write: rejected because it preserves two competing authorities and is vulnerable to multi-process drift.
- Copy the new name into partnerships and reports: rejected because normalized references already support propagation and copied names would drift.
- Rename tables and routes from Entity to Owner: rejected as a broad breaking change unrelated to the user-facing terminology request.

## 9. Owner Reassignment

**Decision**: Add `entityId` to `UpdateTrackedPartnershipRequest` and the edit dialog. Inside the existing optimistic-concurrency transaction:

1. Lock the partnership and validate the source and target owner, Admin role, and request scope.
2. Check normalized partnership-name uniqueness under the target owner.
3. Update `partnerships.entity_id`.
4. Update duplicated owner scope for this partnership in `document_versions`, `k1_reported_distributions`, `partnership_commitments`, `capital_activity_events`, `partnership_annual_activity`, `k1_tracker_years`, and `k1_tracker_import_batches` whose `target_partnership_id` matches.
5. Increment each affected tracker-year revision, move it to `NEEDS_REVIEW`, and append an `INVALIDATED` sign-off record with reason `Partnership owner changed` using the existing material-change pattern.
6. Record one partnership audit event with source/target owner and child-row counts, then commit.

Rows that reference only partnership or tracker-year IDs, including NAV snapshots, K-1 documents, value revisions, and sign-offs, retain their identifiers and need no foreign-key rewrite. On success, invalidate both source and target owner detail queries plus all partnership and reporting query families.

**Rationale**: The schema intentionally duplicates `entity_id` on several historical and projection tables for scope and indexing. Updating only `partnerships.entity_id` would split authorization and reporting. One transaction prevents partial moves and keeps the existing resource URLs stable.

**Alternatives considered**:

- Derive owner only through `partnerships` and leave duplicated columns unchanged: rejected because current queries and uniqueness constraints use those columns.
- Delete and recreate the partnership under the new owner: rejected because it would break history, provenance, bookmarks, and audit continuity.
- Preserve active sign-offs: rejected because ownership is part of the reviewed context and scope, even though financial amounts are unchanged.

## 10. Overview and Navigation Composition

**Decision**: Keep NAV in `PerformanceMetricStrip` and remove the duplicate Latest NAV overview card. Add the new return and capital metrics to the same compact performance surface, with amount/percentage pairs grouped as one metric where appropriate. Rename `K-1 & Basis` to `K1 Entry`; add URL area `assets` after `capital`; render a read-only Underlying Assets coming-soon band with no API calls or mutation controls.

**Rationale**: The existing overview renders NAV both in the metric strip and in `PartnershipOverview`. The requested navigation is a presentation change and should not prematurely bind to the separate legacy partnership-assets feature.

**Alternatives considered**:

- Remove NAV from the performance strip: rejected because NAV participates directly in TVPI, IRR, and unrealized gain and belongs with those metrics.
- Reuse the legacy assets module immediately: rejected because the request explicitly asks for a coming-soon section and does not define the new tracker asset contract.

## 11. API and Migration Strategy

**Decision**: Add migration `021_partnership_tracker_revisions.sql` after the current v016 migrations. It adds the two nullable partnership columns, their constraints, and supporting indexes only if query analysis requires them. Field-key expansion uses the revision table and needs no schema column. Extend the current `/v1/partnership-tracker` summary/detail/PATCH contracts and add `GET /v1/partnership-tracker/partnerships/{partnershipId}/management-fees?asOfDate=YYYY-MM-DD`; keep all monetary values as exact two-decimal strings and ratios as fixed-decimal unit-ratio strings.

**Rationale**: A dedicated read endpoint keeps the potentially multirow fee schedule out of list summaries while the detail page can fetch it only on Capital & NAV. Existing detail/summary contracts are the correct home for compact derived metrics and configuration.

**Alternatives considered**:

- Put the full fee schedule in every partnership list row: rejected because it adds avoidable set expansion and payload size.
- Add a management-fee persistence table: rejected because estimates are derived.
- Replace existing endpoints: rejected because additive contract evolution is sufficient.

## 12. Verification Strategy

**Decision**: Use focused Vitest unit, repository/route, and React Testing Library coverage, then run full API/web test and build gates. Add deterministic fixture dates for IRR, annualization, and fee proration. Include transaction rollback tests that inject a failure during owner reassignment, compatibility tests for legacy/new Line 13 presence, year-summary contract tests for null/zero Capital Contributed and Distributions, and desktop/mobile UI tests for four-year no-scroll fit, ten-year conditional overflow, complete three-row visibility, and tab routing.

**Rationale**: The change crosses shared financial calculations, database scope, API contracts, and responsive UI. Focused tests isolate formulas and compatibility; broader suites catch shared calculation and cache regressions.

**Alternatives considered**:

- Rely on UI smoke testing only: rejected because cent-level formulas and transactional scope cannot be verified reliably by visual inspection.
- Snapshot entire API responses: rejected because targeted assertions communicate the financial and ownership invariants more clearly.
