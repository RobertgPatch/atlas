# Feature Specification: Partnership Tracker Revisions

**Feature Branch**: `017-partnership-tracker-revisions`
**Created**: 2026-07-14
**Status**: Draft
**Input**: User-requested revisions to partnership performance metrics, year comparison, capital and NAV presentation, management fees, K-1 entry, and owner administration.

## Clarifications

### Session 2026-07-14

- Q: How should Compare Years fit its content, and which values must it show? → A: Fit one viewport without horizontal scrolling whenever the columns remain readable; otherwise scroll horizontally. Show only Capital Contributed, Distributions, and Ending Outside Basis, with no clipped data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust Current Partnership Returns (Priority: P1)

An investment administrator reviews a partnership and sees precise, usable return metrics even when the most recent cash-flow activity is newer than the latest available NAV statement.

**Why this priority**: IRR and cash-return metrics are central to tracking partnership performance, and the current stale-NAV rejection hides useful information during normal reporting delays.

**Independent Test**: Create a partnership with an inception date, paid-in capital, distributions, and a NAV dated before the latest cash-flow year; verify IRR, annualized cash-on-cash yield, unfunded commitment, and unrealized gain without changing the source records.

**Acceptance Scenarios**:

1. **Given** an IRR value of `0.0787`, **When** the overview renders it, **Then** it is displayed as `7.87%`.
2. **Given** a latest NAV whose valuation date precedes newer saved cash flows, **When** performance is calculated, **Then** the latest NAV amount is used as the terminal value and IRR is not blocked solely because of the older NAV date.
3. **Given** paid-in capital of `$100,000`, cumulative distributions of `$10,000`, and an active period of two years, **When** performance is calculated, **Then** annualized cash-on-cash yield is `5.00%`.
4. **Given** committed capital and canonical K-1 paid-in capital, **When** the overview renders, **Then** unfunded commitment amount and percentage appear together.
5. **Given** a latest NAV and latest ending outside basis, **When** the overview renders, **Then** unrealized gain equals latest NAV minus latest ending outside basis.
6. **Given** the overview already displays NAV in its performance metrics, **When** the page renders, **Then** no second overview NAV summary is shown.

---

### User Story 2 - Compare Every Partnership Year (Priority: P1)

An investment administrator compares every recorded K-1 year for a partnership in one table rather than selecting at most three years.

**Why this priority**: Long-lived partnerships require full-history comparison to identify changes and anomalies across the investment life.

**Independent Test**: Open Compare Years at desktop width for partnerships with four and ten years. Verify the four-year table fits without horizontal scrolling, the ten-year table scrolls only when its readable minimum column widths exceed the viewport, and every selected year displays complete Capital Contributed, Distributions, and Ending Outside Basis values.

**Acceptance Scenarios**:

1. **Given** more than three saved years, **When** Compare Years opens, **Then** all saved years are selected by default and no three-year limit is enforced.
2. **Given** the metric column and all selected year columns can remain readable within the available viewport, **When** the comparison renders, **Then** all columns fit on one page and no horizontal scrollbar is shown.
3. **Given** the selected columns cannot remain readable within the available viewport, **When** the comparison renders, **Then** only the table region scrolls horizontally and the metric labels remain visible while scrolling.
4. **Given** any selected year, **When** its comparison column renders, **Then** it contains complete values for Capital Contributed, Distributions, and Ending Outside Basis and no row, value, header, or control is clipped by the comparison surface.
5. **Given** a user deselects or reselects years, **When** the selection changes, **Then** any number from one through all available years can be compared.

---

### User Story 3 - Configure and Track Management Fees (Priority: P1)

An investment administrator records when a partnership began, configures its annual management-fee rate, reviews estimated fees under Capital & NAV, and records actual K-1 management fees separately from other portfolio deductions.

**Why this priority**: Management fees affect both investment economics and K-1 basis calculations and must be visible without conflating estimated fees with reported tax values.

**Independent Test**: Configure a partnership start date, fee rate, and commitment, verify the first-year prorated estimate, then enter separate Line 13 portfolio deductions and management fees and confirm both feed calculations exactly once.

**Acceptance Scenarios**:

1. **Given** a partnership start date with 151 active days in a 365-day year, committed capital, and an annual fee rate, **When** the first-year estimate is calculated, **Then** the fee equals annual fee times `151/365`.
2. **Given** a leap year, **When** a partial-year fee is calculated, **Then** the proration denominator is 366.
3. **Given** management fee settings, **When** Capital & NAV renders, **Then** it shows the configured rate, start date, annual schedule, calculation through-date, and cumulative estimated fee.
4. **Given** K-1 Line 13 entry, **When** the user edits the year, **Then** separate fields named `Other Portfolio Deductions` and `Management Fees` are available.
5. **Given** values in both new Line 13 fields, **When** basis and reconciliation calculations run, **Then** both amounts are included exactly once as deductions.
6. **Given** only a historical value in the legacy combined Line 13 field, **When** the year is read or calculated, **Then** that value remains effective until either new Line 13 field is explicitly saved and is not duplicated.
7. **Given** estimated management fees under Capital & NAV, **When** those estimates change, **Then** no K-1 Line 13 value is created or overwritten automatically.

---

### User Story 4 - Manage Owners Reliably (Priority: P1)

An administrator creates and edits partnerships using owner terminology, renames an owner, and reassigns a partnership to another owner with all affected views and records staying consistent.

**Why this priority**: Broken owner maintenance creates incorrect grouping and prevents users from trusting every page that identifies who owns an investment.

**Independent Test**: Rename a database-backed owner, verify all owner and partnership views refresh, then reassign a partnership in the edit dialog and verify its complete history is still accessible under the new owner.

**Acceptance Scenarios**:

1. **Given** the create-partnership dialog, **When** it renders, **Then** the owner selector is labeled `Owner`, not `Entity`.
2. **Given** a valid database-backed owner, **When** an administrator changes its name, **Then** the update succeeds and every page that displays the owner shows the new name after refresh or cache invalidation.
3. **Given** an administrator opens Edit Partnership, **When** the dialog renders, **Then** an Owner selector is available and initialized to the current owner.
4. **Given** a different valid owner is selected, **When** the partnership update succeeds, **Then** the partnership and all owner-scoped child records refer to the new owner in one transaction.
5. **Given** the target owner already has a partnership with the same normalized name, **When** reassignment is attempted, **Then** the request is rejected without partially moving records.
6. **Given** an owner rename or reassignment, **When** the mutation completes, **Then** it is recorded in the audit trail with before and after values.

---

### User Story 5 - Use the Revised Tracker Navigation (Priority: P2)

An investment administrator uses concise tracker labels and can see where future underlying-asset tracking will live without mistaking the placeholder for a functional feature.

**Why this priority**: The navigation changes improve clarity and establish the requested information architecture while preserving the current working flows.

**Independent Test**: Open a partnership and verify the tab order and labels, then open Underlying Assets and verify a non-editable coming-soon state.

**Acceptance Scenarios**:

1. **Given** the partnership tracker tabs, **When** they render, **Then** `K-1 & Basis` is renamed `K1 Entry`.
2. **Given** the tab order, **When** the partnership page renders, **Then** `Underlying Assets` appears immediately after `Capital & NAV`.
3. **Given** the user opens Underlying Assets, **When** the tab renders, **Then** it displays a clear coming-soon state and exposes no incomplete asset mutations.
4. **Given** a bookmarked Underlying Assets URL, **When** it is opened, **Then** the requested tab is restored.

### Edge Cases

- IRR remains unavailable when there is no positive flow, no negative flow, no NAV, or multiple supported roots; an older NAV date alone is no longer an unavailable condition.
- The displayed NAV valuation date remains the source date even when its amount is carried forward to the IRR terminal date.
- Annualized cash-on-cash yield is unavailable when inception date or positive paid-in capital is missing; explicit zero distributions produce `0.00%`.
- An inception date in the future is rejected. Same-day inception and calculation use a minimum one-day active interval.
- Unfunded commitment may be negative when paid-in capital exceeds commitment; the system shows the signed result rather than silently clamping it to zero.
- Unfunded percentage is unavailable when commitment is missing or zero.
- Unrealized gain may be negative and is unavailable when either NAV or ending outside basis is missing.
- Fee configuration is incomplete when rate, inception date, or commitment is missing; the UI identifies the missing input instead of treating it as zero.
- A `0%` management-fee rate is valid and produces zero estimated fees.
- Commitment changes are applied according to their effective dates when calculating the fee schedule.
- Compare Years supports a single year, nonconsecutive years, null values, and long histories; null values use an explicit unavailable placeholder and no selected year or required metric row is omitted.
- Owner reassignment preserves partnership IDs, tax years, revisions, imports, commitments, capital events, NAV, sign-offs, and audit history.
- Non-admin users cannot rename owners, reassign ownership, configure fees, or mutate K-1 data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST retain IRR as a unit ratio and display available IRR values with exactly two digits after the decimal percentage point.
- **FR-002**: The system MUST calculate IRR with sufficient precision that percentage display to one-hundredth of a percentage point is not based on an already coarsely rounded value.
- **FR-003**: The system MUST use the latest NAV amount in IRR even when its valuation date is earlier than newer saved annual cash flows.
- **FR-004**: For IRR only, the system MUST place that latest NAV amount at a terminal calculation date no earlier than the latest cash-flow date while retaining the actual NAV valuation date for display and provenance.
- **FR-005**: The system MUST no longer return an unavailable IRR solely because NAV precedes cash flows.
- **FR-006**: The system MUST expose a metric labeled `Annualized Cash on Cash Yield` and calculate it as `(cumulative distributions / cumulative paid-in capital) / active years`.
- **FR-007**: The system MUST calculate active years from the configured partnership inception date through the calculation as-of date using actual elapsed days divided by `365.25`, and MUST disclose the as-of date.
- **FR-008**: Annualized cash-on-cash yield MUST use canonical K-1 capital contributions as paid-in capital and absolute K-1 distributions as cash received, with the existing legacy contribution fallback only when no canonical contribution exists for that year.
- **FR-009**: The system MUST return metric availability reasons rather than substituting zero for missing inception date, paid-in capital, NAV, or basis inputs.
- **FR-010**: The overview MUST display only one NAV metric.
- **FR-011**: The system MUST calculate unfunded commitment amount as current committed capital minus cumulative paid-in capital.
- **FR-012**: The system MUST calculate unfunded commitment percentage as unfunded commitment amount divided by current committed capital and display the amount and percentage adjacent to one another.
- **FR-013**: The system MUST calculate unrealized gain as latest NAV amount minus latest ending outside basis.
- **FR-014**: Unfunded commitment and unrealized gain MUST preserve signed results.
- **FR-015**: Compare Years MUST allow any number of available years from one through all years and MUST initially select all available years.
- **FR-016**: Compare Years MUST first fit its metric column and selected year columns into the available viewport by distributing available width while preserving defined minimum readable widths; it MUST NOT show a horizontal scrollbar when those minimums can be met.
- **FR-017**: Compare Years MUST introduce horizontal scrolling only when the selected columns cannot fit at their minimum readable widths, MUST limit horizontal overflow to the table region, and MUST keep the metric-label column visible while scrolling.
- **FR-018**: The system MUST store a partnership inception date separately from the record creation timestamp.
- **FR-019**: The system MUST store a configurable nonnegative annual management-fee rate as a unit ratio.
- **FR-020**: The management-fee estimate MUST use effective-dated committed capital as its fee base.
- **FR-021**: The management-fee calculation MUST prorate partial calendar years by active days divided by the actual number of days in that year, including leap years.
- **FR-022**: The fee calculation MUST segment periods at partnership inception, commitment effective dates, calendar-year boundaries, and the calculation through-date so commitment changes are reflected for the days they are effective.
- **FR-023**: Capital & NAV MUST show management-fee configuration, an annual estimate schedule, a calculation through-date, and cumulative estimated management fees.
- **FR-024**: Estimated management fees MUST remain separate from actual K-1 Line 13 entries and MUST NOT populate or overwrite K-1 values.
- **FR-025**: K-1 Line 13 MUST expose separate editable values named `Other Portfolio Deductions` and `Management Fees`.
- **FR-026**: Both new Line 13 values MUST participate exactly once in deduction, outside-basis, reconciliation, and journal-entry calculations wherever the legacy combined Line 13 value participates today.
- **FR-027**: Historical combined Line 13 values MUST remain readable and effective when neither replacement field has an active value.
- **FR-028**: When either replacement Line 13 field has an active value, the two replacement fields MUST be authoritative as a set and the historical combined value MUST NOT also be counted.
- **FR-029**: The create-partnership Owner selector MUST use the visible label `Owner` while internal entity identifiers and existing relationships remain compatible.
- **FR-030**: Database-backed owner renames MUST use the deployed database as the canonical store and MUST not fail because an owner is absent from a process-local fallback store.
- **FR-031**: Owner names MUST be resolved through the owner relationship rather than copied into partnership records, so one successful rename propagates to all reads.
- **FR-032**: Successful owner renames MUST invalidate or refresh every affected owner, partnership, lookup, dashboard, and report query cache.
- **FR-033**: Edit Partnership MUST allow an administrator to select a valid owner within authorized scope.
- **FR-034**: Owner reassignment MUST update the partnership and every owner-scoped child row that duplicates the owner identifier in one database transaction.
- **FR-035**: Owner reassignment MUST preserve all financial values, source provenance, revisions, sign-offs, and resource identifiers.
- **FR-036**: Owner rename and reassignment MUST enforce normalized duplicate-name constraints, authorization scope, optimistic concurrency, and audit evidence.
- **FR-037**: Owner reassignment MUST invalidate active K-1 sign-offs because the reviewed ownership context changed, without deleting the sign-off history.
- **FR-038**: The partnership tracker MUST rename the `K-1 & Basis` tab to `K1 Entry`.
- **FR-039**: The partnership tracker MUST add an `Underlying Assets` tab immediately after `Capital & NAV`.
- **FR-040**: Underlying Assets MUST be addressable through the page URL and show a read-only coming-soon state; underlying-asset persistence and mutation are outside this feature.
- **FR-041**: All new financial calculations MUST be performed server-side from canonical active records and exposed as exact decimal strings with explicit availability status.
- **FR-042**: All changed write operations MUST retain current role checks, entity scope enforcement, conflict handling, and before/after audit logging.
- **FR-043**: Compare Years MUST show exactly three financial metric rows for every selected year: `Capital Contributed`, `Distributions`, and `Ending Outside Basis`; it MUST NOT omit, visually clip, or truncate those rows, their values, year headers, or comparison controls.

### Key Entities

- **Partnership**: Existing investment identity, extended with owner reassignment, inception date, and annual management-fee rate.
- **Owner**: Existing entity record displayed as the partnership owner; its name is normalized and referenced rather than copied.
- **Partnership Performance Summary**: Derived view containing paid-in capital, distributions, NAV, IRR, annualized cash-on-cash yield, unfunded commitment, and unrealized gain with availability metadata.
- **Management Fee Estimate**: Derived annual schedule based on inception date, fee rate, effective-dated commitments, and calculation through-date; it is not an actual tax value.
- **K-1 Year Value Revision**: Existing append-only annual field history, extended with separate Other Portfolio Deductions and Management Fees field keys plus a legacy fallback rule.
- **Owner-Scoped Child Record**: Existing partnership history rows that duplicate the owner identifier for scope and reporting and must move atomically when ownership changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In deterministic tests, available IRR values display to `0.01` percentage-point precision, including `7.87%` for a `0.0787` ratio.
- **SC-002**: A partnership with newer cash flows than its latest NAV produces the same IRR availability as an otherwise identical series whose NAV date equals the terminal cash-flow date.
- **SC-003**: Annualized cash-on-cash, unfunded commitment, unrealized gain, and management-fee fixtures match their specified formulas to within one cent for money and `0.01` percentage point for display.
- **SC-004**: At desktop width, a four-year fixture renders all three required metrics without horizontal scrolling; a ten-year fixture introduces table-only horizontal scrolling when required, and both desktop and mobile fixtures expose every selected year, metric value, header, and control without clipping.
- **SC-005**: Existing years containing only the legacy combined Line 13 value retain identical calculated basis results after deployment.
- **SC-006**: A database-backed owner can be renamed and a partnership can be reassigned, with all affected API reads returning the new owner immediately after cache refresh and no orphaned owner-scoped child rows.
- **SC-007**: Automated tests cover available and unavailable metric states, stale NAV carry-forward, leap-year and commitment-change fee proration, Line 13 compatibility, owner rename, owner reassignment rollback, and all-years comparison.
- **SC-008**: Existing authentication, authorization, optimistic concurrency, audit, and K-1 sign-off regression suites remain passing.

## Assumptions

- `Owner` is a presentation term for the existing Entity domain object; this feature does not rename database tables or public route nouns solely for terminology.
- The partnership inception date is the economic start date entered by an administrator, not `created_at`, and it is shared by cash-on-cash annualization and management-fee proration.
- The annual management-fee percentage applies to committed capital unless a later feature introduces a different fee basis.
- Management-fee estimates calculate through the current server date by default and return that date so results are reproducible in tests and understandable in the UI.
- Actual management fees reported on a K-1 are entered manually in the new Line 13 Management Fees field; estimates never become tax records automatically.
- Existing imported and manual K-1 provenance remains append-only, and legacy Line 13 data is preserved.
- Underlying Assets is navigation and placeholder content only in this feature.
- Existing session authentication, Admin mutation rules, entity membership scope, PostgreSQL storage, audit events, and optimistic concurrency patterns are reused.
