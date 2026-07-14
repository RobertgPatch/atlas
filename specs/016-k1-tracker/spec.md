# Feature Specification: Partnership Tracker

**Feature Branch**: `016-k1-tracker`
**Created**: 2026-07-11
**Revised**: 2026-07-13
**Status**: Draft
**Input**: Rename K1 Tracker to Partnership Tracker and make it the focused place to create and manage partnerships, enter annual K-1 values manually, preserve dated committed-capital history, and record multiple dated NAV values per year. Revise annual entry so every K-1 field is editable on one screen without a stepper or Next button. Exclude liabilities from calculated sums and performance aggregates, unify the duplicate contribution inputs, and expand Overview with cumulative paid-in capital, distributions, capital account, NAV, outside basis, DPI, TVPI, and IRR. Excel import and PDF extraction are deferred; v1 is intentionally manual so the workflow and calculations can be validated first.

## Clarifications

### Session 2026-07-13

- Q: When should K-1 currency inputs apply US formatting? -> A: Format on blur; accept plain numbers, comma grouping, an optional dollar sign, up to two optional decimal places, and accounting-style negatives, then normalize before preview or save.
- Q: Which money fields should use the clarified parsing and formatting behavior? -> A: All Partnership Tracker money fields, including annual K-1 values, committed capital, and NAV.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find and Manage a Partnership (Priority: P1)

An authorized user opens Partnership Tracker, searches the partnerships within their entity scope, selects one, and sees a concise overview without navigating to a separate directory or a page containing every legacy partnership section.

**Why this priority**: Partnership selection and context are the entry point for every K-1, commitment, and NAV workflow.

**Independent Test**: Load 100 scoped partnerships, find one by name, select it, and verify the overview shows its entity, type, status, current committed capital, cumulative capital contributions and distributions, latest capital account, latest NAV, latest K-1 year and outside basis, DPI, TVPI, and IRR availability.

**Acceptance Scenarios**:

1. **Given** the user can access multiple partnerships, **When** they search by partnership or entity name, **Then** only matching scoped partnerships appear.
2. **Given** a partnership is selected, **When** its workspace opens, **Then** the user sees Overview, K-1 & Basis, and Capital & NAV areas without a long page of unrelated legacy sections.
3. **Given** an Admin edits a partnership, **When** the change is saved, **Then** its name, type, status, and notes update in place and the action is audited.
4. **Given** an old `/partnerships` or `/k1-tracker` browser link, **When** it is opened, **Then** it redirects to the equivalent Partnership Tracker location.
5. **Given** a partnership has multiple saved K-1 years, **When** Overview loads, **Then** it presents a compact performance strip based on all active annual revisions and the latest NAV without requiring the user to inspect each year.

---

### User Story 2 - Add a Partnership and Start Its First K-1 Year (Priority: P1)

An Admin adds a partnership from Partnership Tracker by choosing its owning entity, name, and partnership type. The new partnership becomes selected immediately and the page guides the Admin to enter its first K-1 tax year manually.

**Why this priority**: A tracker cannot be adopted if users must leave the page or use a hidden legacy workflow to create the partnership first.

**Independent Test**: Create a Real Estate partnership, confirm it becomes the selected partnership, add a noncurrent tax year, and reach the manual K-1 editor without returning to the directory.

**Acceptance Scenarios**:

1. **Given** an Admin is on Partnership Tracker, **When** they choose Add Partnership, **Then** the form requires an entity, a unique partnership name within that entity, and one of the supported partnership types.
2. **Given** a valid partnership is submitted, **When** creation succeeds, **Then** it is selected and an empty-state next step offers Add K-1 Year.
3. **Given** a duplicate name exists for the selected entity, **When** the Admin submits it, **Then** creation is rejected with a clear inline explanation.
4. **Given** a new partnership has no K-1 years, **When** the Admin adds a year, **Then** they can enter any tax year from 1900 through 2100 rather than an automatically incremented year.

---

### User Story 3 - Enter and Review Manual K-1 Years (Priority: P1)

An Admin manually enters every supported annual K-1, opening-balance, Item K liability, Section L, and book-tax field for any available tax year on one continuous screen. Atlas calculates outside basis, suspended losses, excess distributions, Section L reconciliation, and journal-entry outputs while keeping liabilities available for manual reference but outside calculated sums.

**Why this priority**: K-1 values drive most of the useful partnership information and v1 must establish trusted calculations before automated extraction is introduced.

**Independent Test**: Add nonconsecutive years, enter and edit every supported annual field without changing tabs or advancing a stepper, and verify the rollforward, reconciliation, liability exclusion, and selected-year experience without Excel or PDF upload controls.

**Acceptance Scenarios**:

1. **Given** a partnership has no years or nonconsecutive years, **When** an Admin adds a year, **Then** any unused supported tax year can be selected.
2. **Given** a prior year exists, **When** a later year is created, **Then** ending outside basis, ending capital, liability balances, and suspended losses are offered as carried values, with liabilities clearly marked as reference-only.
3. **Given** an Admin enters or corrects K-1 values, **When** the draft is calculated, **Then** basis and reconciliation effects update before saving, liability changes do not alter any sum, and prior revisions remain auditable.
4. **Given** the selected partnership has many years, **When** the user changes years, **Then** one year remains primary and every year is reachable without a multi-column worksheet or endless vertical cards.
5. **Given** v1 is running, **When** the user opens the tracker, **Then** there is no Excel import, PDF upload, OCR, or automatic finalized-document synchronization action.
6. **Given** an annual year is selected, **When** the Admin edits it, **Then** every editable field is present in one grouped form with Preview and Save actions and no Back, Next, step tabs, or category tabs.
7. **Given** a year contains a legacy `section_l_capital_contributed` value, **When** it is displayed or edited, **Then** it resolves to the single canonical Capital contributions field without presenting a duplicate input.
8. **Given** an Admin enters `1000`, `1,000`, `$1,000`, `1000.5`, `-1000`, or `(1,000)` in an applicable K-1 money field, **When** the field loses focus, **Then** the value displays in US currency format and preview/save receives the equivalent exact two-decimal amount without requiring trailing zeros.

---

### User Story 4 - Preserve Committed-Capital History (Priority: P2)

An Admin records committed capital as effective-dated entries. The tracker shows the amount effective as of today and preserves prior entries so users can understand how the commitment changed over time.

**Why this priority**: Committed capital cannot be reliably derived from K-1 values and must be maintained explicitly.

**Independent Test**: Record three dated commitment amounts, including a backdated correction, and verify the current value and chronological history are deterministic and audited.

**Acceptance Scenarios**:

1. **Given** a selected partnership, **When** an Admin adds committed capital, **Then** an amount and effective date are required and an optional note may be recorded.
2. **Given** multiple commitment entries, **When** the overview is calculated for a date, **Then** the entry with the latest effective date on or before that date is used.
3. **Given** a backdated commitment is added, **When** it is saved, **Then** later entries remain intact and the current amount changes only when the backdated entry is the latest effective value.
4. **Given** an entry is corrected or removed, **When** the Admin confirms the action, **Then** the before-and-after value is audited and the remaining dated history is preserved.
5. **Given** an Admin enters a committed-capital amount without decimals or trailing zeros, **When** the field loses focus, **Then** it formats as US currency and saves the normalized exact amount.

---

### User Story 5 - Record and Plot NAV History (Priority: P2)

An Admin records manual NAV values with exact valuation dates, including multiple observations in the same calendar year. The tracker displays the latest NAV and an accessible historical line plot paired with a tabular history.

**Why this priority**: NAV is the other required manual input and its trend is more useful visually than as a single latest-value field.

**Independent Test**: Record at least four NAV values, including two in one year, and verify all points are ordered, plotted, keyboard discoverable, and listed in the history table.

**Acceptance Scenarios**:

1. **Given** a selected partnership, **When** an Admin records NAV, **Then** a nonnegative amount and exact valuation date are required.
2. **Given** multiple NAV entries share a year but have different dates, **When** the chart loads, **Then** every entry appears as its own point in chronological order.
3. **Given** an entry already exists for the exact valuation date, **When** another is submitted, **Then** the user is asked to edit the existing entry rather than create an ambiguous duplicate.
4. **Given** the chart cannot be perceived visually, **When** the user navigates with assistive technology, **Then** equivalent dates and values are available in an accessible table and chart summary.
5. **Given** an Admin enters a NAV amount without decimals or trailing zeros, **When** the field loses focus, **Then** it formats as US currency and saves the normalized exact amount.

---

### User Story 6 - Reconcile and Sign Off a Year (Priority: P3)

The preparer traces outside basis and Section L, reviews tax-versus-book journal adjustments, resolves warnings, and records preparation and review sign-off for the selected year.

**Why this priority**: The tracker must remain an auditable CPA workpaper rather than a passive data-entry screen.

**Independent Test**: Enter a complete year manually, verify calculated rollforwards and balanced journal entries, then complete preparer and reviewer sign-off.

**Acceptance Scenarios**:

1. **Given** complete manual K-1 values, **When** the year is calculated, **Then** beginning basis, increases, decreases, limitations, ending basis, and contributing fields are traceable.
2. **Given** losses or distributions exceed basis, **When** calculations run, **Then** suspended loss and taxable excess distribution warnings are shown without allowing negative ending basis.
3. **Given** Section L or the journal check differs by more than $1, **When** sign-off is attempted, **Then** the year remains Needs Review.
4. **Given** all checks pass, **When** preparer and reviewer sign-off are completed, **Then** identities, dates, and the reviewed revision are retained.

### Edge Cases

- A user has no scoped partnerships, one partnership, or hundreds of partnerships.
- An entity has two partnerships whose names differ only by case or surrounding whitespace.
- A legacy partnership has an asset-class value outside the controlled v1 list.
- A partnership is created but the Admin chooses not to add a K-1 year immediately.
- A partnership has no K-1 years, one year, more than ten years, or nonconsecutive years.
- A year earlier than the recorded inception context is entered.
- The first available K-1 year has unknown opening basis or suspended losses.
- A prior year changes after later years exist and later calculations or sign-offs become stale.
- Missing values, explicit zeros, negative source values, and accounting-style decrease signs must remain distinguishable.
- A money field contains no decimal point, one decimal digit, comma grouping, a dollar sign, surrounding whitespace, an accounting-style negative, malformed grouping, or more than two decimal digits.
- A legacy year has only `section_l_capital_contributed`, has both contribution keys with equal values, or has conflicting values under both keys.
- Total capital contributions are zero, so DPI and TVPI have no valid denominator.
- Annual cash flows do not include both an investment outflow and a return inflow, or produce no unique IRR solution.
- Liabilities change materially between years but remain excluded from basis, distribution, performance, warning-count, and sign-off aggregates.
- A commitment entry is backdated, future-dated, or shares an effective date with an existing entry.
- NAV has multiple observations in one year, dates arrive out of order, or an exact date is duplicated.
- NAV or commitment values include cents, are zero, are extremely large, or exceed supported precision.
- A legacy FMV snapshot has a non-manual source; it remains readable as historical NAV but new v1 entries are manual.
- Another Admin updates the selected partnership or year after the current user opened it.
- A user loses entity access while the page is open.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST expose one visible `Partnership Tracker` navigation item at `/partnership-tracker`.
- **FR-002**: The separate `Partnerships` and `K1 Tracker` navigation items MUST be removed; their browser routes MUST redirect to Partnership Tracker while preserving a partnership selection when possible.
- **FR-003**: Users MUST be able to search and select only partnerships within their permitted entity scope.
- **FR-004**: The selected partnership workspace MUST use focused Overview, K-1 & Basis, and Capital & NAV areas and MUST NOT reproduce every section from the legacy partnership detail page.
- **FR-005**: The selected partnership header MUST show name, owning entity, partnership type, status, available K-1 year range, and latest workflow status.
- **FR-006**: The Overview MUST show current committed capital, total capital contributions (Paid-in capital), cumulative K-1 distributions, latest Section L capital account, latest NAV with valuation date, latest ending outside basis, latest K-1 year, DPI, TVPI, IRR or an unavailability state, and outstanding warning count when available.
- **FR-007**: Admins MUST be able to create a partnership without leaving Partnership Tracker.
- **FR-008**: Partnership creation MUST require an owning entity, a trimmed name unique within that entity, and a partnership type.
- **FR-009**: Supported partnership types MUST be `Private Equity`, `Real Estate`, `Hedge Fund`, `Venture Capital`, `Credit`, `Infrastructure`, and `Other`.
- **FR-010**: The existing `asset_class` persistence field MUST remain the source for partnership type so reports and existing records do not diverge.
- **FR-011**: A newly created partnership MUST default to Active, become selected immediately, and present Add K-1 Year as the recommended next step.
- **FR-012**: Admins MUST be able to edit a partnership's name, type, status, and notes in the selected workspace; non-Admins MAY view them.
- **FR-013**: The K-1 workspace MUST support any unused tax year from 1900 through 2100 and MUST NOT force automatic year increments.
- **FR-014**: V1 K-1 values MUST be entered manually through one continuous, grouped, sign-aware selected-year form; Excel import, PDF upload, OCR, and automatic extraction MUST NOT be exposed in Partnership Tracker v1.
- **FR-015**: V1 MUST NOT automatically synchronize finalized document-review fields into tracker values; the design MUST retain provenance seams for a future PDF/OCR version.
- **FR-016**: Manual field changes MUST preserve append-only revisions, actor, timestamp, and optional explanation; stale updates MUST be rejected.
- **FR-017**: Missing values MUST remain distinct from explicit zero values.
- **FR-018**: A later year MUST offer carried opening outside basis, Section L capital, liability categories, and suspended losses from the nearest prior year while identifying them as carryforwards.
- **FR-019**: Changes to an earlier year MUST recalculate dependent later years and invalidate materially affected sign-off.
- **FR-020**: The selected-year summary MUST show ending outside basis, annual basis change, cumulative suspended losses, taxable excess distribution, Section L difference, and warning count.
- **FR-021**: Every editable annual field MUST be reachable on the same selected-year page without category tabs, step tabs, Back, or Next controls; derived basis, reconciliation, journal, and sign-off results MAY follow the form on that page.
- **FR-022**: Outside basis, loss limitation, distribution analysis, Section L reconciliation, book-tax differences, and journal entries MUST use deterministic server calculation rules, except liability balances and changes MUST be display-only and MUST NOT participate in arithmetic totals or status gates.
- **FR-023**: Ending outside basis MUST never be below zero; before-limit results and applied limitations MUST be displayed separately.
- **FR-024**: Reconciliation and journal checks MUST use a $1 tolerance and MUST NOT mark missing or incomplete years as reconciled.
- **FR-025**: A year MUST NOT be reconciled until required values are present, warnings are resolved or explained, journal entries balance, and required sign-off is complete.
- **FR-026**: The page MUST show one primary year at a time, keep all years reachable in compact navigation, and MAY compare up to three years.
- **FR-027**: Admins MUST be able to add an effective-dated committed-capital entry with a nonnegative amount and optional note.
- **FR-028**: Committed-capital history MUST preserve multiple dated entries; the value effective for a date MUST be the latest entry whose effective date is on or before that date.
- **FR-029**: Adding a backdated commitment MUST NOT overwrite later entries.
- **FR-030**: Corrections and removals of commitment entries MUST require confirmation where destructive and MUST be audited.
- **FR-031**: Admins MUST be able to add manual NAV entries containing a nonnegative amount, exact valuation date, and optional note.
- **FR-032**: NAV history MUST allow multiple entries in one year but only one current entry for the same partnership and exact valuation date.
- **FR-033**: The latest NAV MUST be selected by valuation date, with creation time and ID used only as deterministic tie-breakers for legacy duplicates.
- **FR-034**: NAV history MUST be plotted chronologically in a responsive line chart and MUST also be available as an accessible table.
- **FR-035**: Users MUST be able to inspect exact NAV date and value for every plotted point without relying on color alone.
- **FR-036**: Partnership, K-1 year, commitment, NAV, correction, deletion, recalculation, and sign-off mutations MUST be auditable.
- **FR-037**: Only Admins MAY create or mutate partnership tracker data; scoped authenticated users MAY view it.
- **FR-038**: All monetary API values introduced or revised by this feature MUST use exact two-decimal strings; server calculations MUST avoid binary floating-point arithmetic.
- **FR-039**: Tracker records MUST use PostgreSQL as the authoritative store and MUST NOT depend on browser or process-local memory.
- **FR-040**: Existing assets, capital-activity, expected-distribution, CSV-export, and whole-partnership detail APIs MAY remain for compatibility but MUST NOT appear as primary Partnership Tracker v1 sections.
- **FR-041**: Existing workbook-import records MAY remain readable for compatibility, but no workbook import endpoint or control may be part of the v1 Partnership Tracker contract.
- **FR-042**: A partnership list of 100 records and a selected partnership with 50 K-1 years, 50 commitment entries, and 200 NAV points MUST become usable within 2 seconds under normal staging conditions.
- **FR-043**: The page MUST provide loading, empty, filtered-empty, error, permission-restricted, newly-created, no-year, and populated states.
- **FR-044**: Search, top-level workspace navigation, year navigation, the single-page K-1 form, dialogs, the NAV chart, and data tables MUST be keyboard accessible with meaningful assistive labels and visible focus.
- **FR-045**: Unsaved manual K-1 changes MUST prompt before partnership, year, top-level area, or route navigation discards them.
- **FR-046**: `capital_contributions` MUST be the only editable and calculated annual contribution value; `section_l_capital_contributed` MUST remain readable only as legacy provenance and MUST NOT appear as a second input or be double-counted.
- **FR-047**: Total capital contributions MUST equal the sum of canonical `capital_contributions` amounts across all active saved K-1 years, and cumulative distributions MUST equal the sum of the absolute `box_19_distributions` amounts across those years. An aggregate MUST remain missing until at least one corresponding annual value exists; an explicitly entered zero MUST aggregate as zero.
- **FR-048**: DPI MUST equal cumulative distributions divided by total capital contributions, and TVPI MUST equal cumulative distributions plus latest NAV divided by total capital contributions; either metric MUST be unavailable when its required denominator or NAV is unavailable.
- **FR-049**: Liability beginning balances, ending balances, and changes MAY be entered, edited, carried, and displayed, but MUST be excluded from outside-basis increases, distribution decreases, taxable excess distributions, overview totals, DPI, TVPI, IRR, warning counts, and sign-off blockers.
- **FR-050**: IRR MUST use canonical annual contributions as negative tax-year-end cash flows, annual distributions as positive tax-year-end cash flows, and the latest NAV as a terminal positive cash flow on its valuation date. Missing years MUST preserve elapsed time, and insufficient or ambiguous cash-flow series MUST return an explicit unavailable status rather than a fabricated percentage.
- **FR-051**: Overview performance values MUST be composed server-side from active tracker revisions and the latest NAV so the browser does not independently recalculate financial metrics or issue per-year requests.
- **FR-052**: Every Partnership Tracker monetary input, including annual K-1 values, committed capital, and NAV, MUST accept plain digits with no decimal point or trailing zeros, optional valid US comma grouping, an optional leading dollar sign, and zero, one, or two decimal places. Fields whose domain allows negative amounts MUST also accept a leading minus sign or accounting parentheses; nonnegative fields MUST reject negative forms inline. On blur, valid input MUST display as `en-US` USD currency with two fraction digits; before preview/save it MUST normalize to the exact two-decimal API string. Missing decimal places alone MUST NOT produce a validation error, while malformed grouping, nonnumeric content, or more than two decimal places MUST produce an inline field error without submitting.

### Key Entities

- **Partnership**: Existing scoped investment relationship with owning entity, name, controlled partnership type stored in `asset_class`, status, and notes.
- **Partnership Tracker Summary**: Read model combining partnership identity, current effective commitment, cumulative annual contribution/distribution performance, latest capital account, latest NAV, K-1 year range, latest outside basis, return metrics, and warning status.
- **Tracker Year**: One manually maintained tax year for a partnership, including workflow status, revision, calculations, and sign-off.
- **Tracker Value Revision**: Append-only manual or carryforward field value with effective amount, actor, source, and prior-revision link.
- **Committed Capital Entry**: An effective-dated total committed-capital amount retained as part of the partnership's history.
- **NAV Entry**: A dated partnership-level net asset value, stored in the existing partnership FMV snapshot infrastructure and presented using NAV terminology.
- **Basis Rollforward**: Ordered calculation from beginning basis through increases, decreases, limitations, distributions, and ending outside basis.
- **Section L Reconciliation**: Reported capital movements, calculated movements, component variances, book-tax explanations, and status.
- **Year Sign-off**: Preparer and reviewer identities, timestamps, reviewed revision, and invalidation state.
- **Tracker Audit Event**: Immutable evidence of relevant create, update, delete, recalculate, and sign-off actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Admin can create a partnership and open its first manual K-1 year in under two minutes without leaving Partnership Tracker.
- **SC-002**: A user can find a partnership and reach any one of 50 K-1 years in no more than three interactions without scrolling through unrelated partnership sections.
- **SC-003**: Manually entered CPA fixture values reproduce the approved ending outside-basis results within $1 and preserve missing values as missing.
- **SC-004**: A backdated committed-capital entry produces the correct as-of history without deleting or modifying later entries.
- **SC-005**: A NAV series containing at least 200 points, including multiple entries per year, renders in chronological order and every point has an equivalent accessible table row.
- **SC-006**: Every relevant mutation can be traced to the actor, time, affected partnership or year, and before-and-after value.
- **SC-007**: Journal-entry summaries balance within $1 for reconciled years, and no incomplete or failed year can be signed off as reconciled.
- **SC-008**: A 100-partnership directory and a selected partnership with 50 years, 50 commitment entries, and 200 NAV entries becomes usable within 2 seconds under normal staging conditions.
- **SC-009**: Keyboard-only users can create or select a partnership, add a year, navigate annual fields, record commitment and NAV values, inspect chart-equivalent data, and save without a focus trap.
- **SC-010**: Partnership Tracker v1 contains no Excel import, PDF upload, OCR, or automated K-1 extraction control.
- **SC-011**: An Admin can enter or edit every supported field for one K-1 year and save it without opening another category view or using a Next button.
- **SC-012**: A fixture with `$3,000,000.00` total contributions, `$190,773.00` total distributions, and `$3,000,000.00` latest NAV produces DPI `0.0636x`, TVPI `1.0636x`, and an IRR consistent with the documented annual cash-flow dates, without including liabilities.
- **SC-013**: A legacy year containing both contribution field keys contributes at most once to Section L, outside basis, and overview performance totals.
- **SC-014**: Every Partnership Tracker money control accepts the equivalent values `1000`, `1,000`, `$1,000`, and `1000.00`, formats each as `$1,000.00` on blur, and submits `1000.00`; applicable signed K-1 fields also normalize `-1000` and `(1,000)` to `-1000.00`, while committed-capital and NAV controls reject negative forms inline.

## Assumptions

- Existing Atlas entities, sessions, roles, entity membership scope, audit conventions, and PostgreSQL remain authoritative.
- `asset_class` is retained as the persistence and reporting field while the UI labels it `Partnership Type`.
- The existing partnership commitment table is reused as an effective-dated total-commitment history; a new entry represents the total commitment effective on its date, not an incremental capital call.
- Existing partnership FMV snapshots are the authoritative partnership-level NAV history; the UI and new contract use NAV terminology without destructively renaming stored data.
- Legacy non-manual FMV snapshots remain visible with their source label, while v1 creates manual NAV entries only.
- Existing assets, capital-activity, distribution-history, and report integrations remain stored and callable but are omitted from the focused v1 page.
- Existing K-1 calculation and sign-off logic remains in scope except for the explicit removal of liability effects from calculations and status gates. Excel import and automatic finalized-document synchronization are removed from the v1 interaction and API contract.
- `capital_contributions` is the canonical annual paid-in value. The legacy Section L contribution key remains only for backward-compatible provenance and is projected into the canonical value when needed.
- Overview return metrics use active saved K-1 revisions, not legacy manual capital-activity rows. Committed capital remains a separate effective-dated total and is never treated as paid-in capital.
- PDF upload, OCR, model-assisted field extraction, confidence scoring, and human review are planned for v2 and will populate the existing revision/provenance model rather than changing the annual calculation model.
- The legacy `/partnerships` and `/k1-tracker` browser routes are compatibility redirects, not separate maintained experiences.
