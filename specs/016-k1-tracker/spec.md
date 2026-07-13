# Feature Specification: K1 Tracker

**Feature Branch**: `016-k1-tracker`  
**Created**: 2026-07-11  
**Status**: Draft  
**Input**: User description: "Create a user-friendly K1 Tracker page and navbar item that imports and tracks every available K-1 year for a specific partnership, preserving the tax-basis workbook's purpose without its endless rows and columns, and use the CPA HTML prototype and hidden legacy Atlas features as references where useful."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review a Partnership Across All K-1 Years (Priority: P1)

An authorized user opens K1 Tracker, finds a partnership, and immediately understands which tax years are available, the latest ending outside basis, suspended losses, taxable excess distributions, and any years that need attention. The user can move between years without scrolling through every partnership or every year at once.

**Why this priority**: The core business need is a durable, partnership-specific multi-year rollforward that is easier to understand than the workbook.

**Independent Test**: Load a partnership with at least ten years of records, move from the oldest to the newest year, and verify that every year remains accessible while only the chosen year or a small comparison set is expanded.

**Acceptance Scenarios**:

1. **Given** the user can access multiple partnerships, **When** the user searches for and selects one partnership, **Then** the page shows only that partnership's K-1 tracker and all available tax years.
2. **Given** a partnership has more years than fit in the visible year selector, **When** the user moves through the year selector, **Then** every year is reachable without a page-length grid or one full card per year.
3. **Given** a partnership has complete and incomplete years, **When** the tracker loads, **Then** each year is visibly labeled as not started, imported, needs review, or reconciled.
4. **Given** the user selects a year, **When** the year workspace opens, **Then** summary values appear first and the detailed basis, K-1, liabilities, capital, reconciliation, and journal-entry sections are available as focused views.

---

### User Story 2 - Import Existing Basis Workbooks Safely (Priority: P1)

An Admin imports the existing tax-basis workbook and reviews a staged preview of detected partnerships, years, values, unmapped rows, validation issues, and possible existing-record conflicts before anything is saved.

**Why this priority**: Existing workbooks contain the historical record; a reliable migration path is required to make the application useful without rekeying years of data.

**Independent Test**: Import the supplied workbook into a selected partnership, confirm the preview, and verify that 2021 through 2025 are created with the workbook values while blank 2026 through 2030 columns are not treated as completed years.

**Acceptance Scenarios**:

1. **Given** a supported workbook, **When** an Admin uploads it, **Then** the preview shows the detected sheet, proposed partnership match, populated tax years, mapped fields, source cells, and all warnings before commit.
2. **Given** blank future-year columns contain formulas but no entered source values, **When** the workbook is previewed, **Then** those years are identified as blank and are not imported as complete or "OK."
3. **Given** an imported tax year already exists, **When** the Admin reviews the conflict, **Then** the Admin can skip, merge, or replace that year and no value is overwritten silently.
4. **Given** any selected year fails validation, **When** the Admin attempts to commit, **Then** the import is rejected without partially changing the partnership and the preview identifies what must be fixed.
5. **Given** a successful import, **When** the year is viewed later, **Then** each imported value retains workbook, sheet, cell, import time, and importing-user provenance.

---

### User Story 3 - Enter, Correct, and Roll Forward a K-1 Year (Priority: P2)

An Admin can add a missing year or correct a sourced value in a guided year editor. The editor groups related fields, explains sign conventions, carries forward prior-year balances, and previews the effect on basis and reconciliation before saving.

**Why this priority**: Workbooks and extracted K-1s are not always complete; controlled manual correction is necessary for a working tax-basis record.

**Independent Test**: Add the year after the latest record, confirm prior ending balances and liabilities prefill correctly, enter K-1 values, and verify that the new ending values become the next year's opening values.

**Acceptance Scenarios**:

1. **Given** a prior year exists, **When** an Admin adds the next year, **Then** prior ending outside basis, ending capital, ending liabilities, and cumulative suspended losses are offered as the new year's opening values.
2. **Given** an imported or finalized K-1 value, **When** an Admin overrides it, **Then** the original remains visible, an override reason is required, and the change is attributed to the Admin.
3. **Given** a value represents a loss, deduction, distribution, or journal credit, **When** the Admin enters it, **Then** the editor clearly shows the expected sign and stores a consistent normalized amount.
4. **Given** unsaved changes, **When** the Admin tries to close or change years, **Then** the user is warned before the work is discarded.

---

### User Story 4 - Reconcile Outside Basis and Section L (Priority: P2)

The user can trace how beginning outside basis changes through contributions, K-1 income and loss items, liabilities, deductions, distributions, loss limitations, and book-tax reconciling items. The page clearly distinguishes calculated tax basis from the K-1 Section L capital account.

**Why this priority**: The tracker must preserve the workbook's auditable tax-basis and capital-account purpose, not merely store annual values.

**Independent Test**: Recreate the populated years from the supplied workbook and verify the ending outside-basis rollforward, loss and distribution analyses, Section L component variances, and book-tax reconciliation.

**Acceptance Scenarios**:

1. **Given** a year with K-1 inputs, **When** the tracker calculates the rollforward, **Then** it shows beginning basis, total increases, total decreases, ending basis before limitation, ending outside basis, and the contributing line items.
2. **Given** losses exceed available basis, **When** the year is calculated, **Then** allowed losses and cumulative suspended losses are shown and carried into later years.
3. **Given** distributions and liability relief exceed the applicable basis, **When** the year is calculated, **Then** the taxable excess distribution is shown as a warning.
4. **Given** Section L values differ from calculated movements by more than $1, **When** reconciliation is evaluated, **Then** the differing components and overall year status are marked as needing review.
5. **Given** an inception-year capital contribution, **When** calculated net income is compared with Section L, **Then** the contribution is excluded from net income and cannot create the workbook's erroneous contribution-sized variance.

---

### User Story 5 - Prepare Year-End Journal Entries and Sign Off (Priority: P3)

The preparer reviews tax-versus-book adjustments by income type, sees a balanced journal-entry summary, explains remaining book-tax differences, and records preparation and review sign-off for the selected year.

**Why this priority**: These outputs are part of the supplied workbook's end goal and make the tracker useful in the CPA's year-end accounting workflow.

**Independent Test**: Enter book balances and K-1 values for one year, verify the interest, dividend, capital-gain, general-partnership-income, and investment-account entries sum to zero, explain the book-tax difference, and complete preparer/reviewer sign-off.

**Acceptance Scenarios**:

1. **Given** book and tax values, **When** the journal-entry view opens, **Then** it shows the adjustment for each supported income account and the balancing Investment in Partnership entry.
2. **Given** the journal-entry summary does not equal zero within $1, **When** the user reviews the year, **Then** the year cannot be marked reconciled.
3. **Given** Section L ending capital differs from ending tax basis, **When** the preparer enters Section 704(c), Section 754, timing, and other permanent differences, **Then** the unexplained variance updates immediately.
4. **Given** all required data and checks pass, **When** the preparer and a reviewer sign off, **Then** the year records their identities and dates and is marked reconciled.

### Edge Cases

- A partnership has no K-1 years, one year, more than ten years, nonconsecutive years, or a year earlier than its recorded inception year.
- A workbook has multiple partnership sheets, renamed rows, missing labels, unsupported formulas, duplicate years, hidden data, malformed amounts, or a proposed match to the wrong partnership.
- A workbook contains formula-generated zeros for future years but no source entries.
- A finalized K-1, workbook import, and manual override provide different values for the same partnership, year, and field.
- A K-1 is amended or superseded after a tracker year was previously reconciled.
- A prior year changes after later years exist, requiring all dependent years to be recalculated and re-reviewed.
- Losses or adjustments are negative even though the workbook expected positive-entry decrease amounts.
- Liability balances decrease below zero, beginning liabilities do not match the prior ending balances, or a liability category is absent.
- Section L withdrawals use a negative source sign while basis distributions use a positive decrease sign.
- The first tracked year has an unknown opening outside basis or suspended-loss carryforward.
- Basis reaches zero, distributions exceed basis, losses remain suspended for multiple years, or previously suspended losses become allowable.
- Currency values exceed supported precision, contain cents, or differ only within the $1 reconciliation tolerance.
- Another Admin edits the same year after it was opened.
- A user loses entity access while the page is open.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST expose a visible `K1 Tracker` navigation item and a protected K1 Tracker page distinct from the existing K-1 document processing page.
- **FR-002**: The tracker MUST let users search and select only partnerships within their permitted entity scope.
- **FR-003**: The selected partnership header MUST identify the partnership, owning entity, partner, available year range, and latest tracker status.
- **FR-004**: The tracker MUST support any number of tax years and MUST NOT impose the workbook's ten-year limit.
- **FR-005**: The primary workspace MUST show one selected year at a time and MAY show a comparison of up to three selected years; it MUST NOT render every partnership and every full year as one continuous page.
- **FR-006**: Every available year MUST remain reachable through a compact year selector with status indicators.
- **FR-007**: The selected-year summary MUST surface ending outside basis, annual basis change, cumulative suspended losses, taxable excess distribution, Section L difference, and warning count before detailed line items.
- **FR-008**: Detailed information MUST be separated into focused views for Outside Basis, K-1 Inputs, Liabilities, Section L and Book-Tax Reconciliation, Journal Entries, and Sign-off.
- **FR-009**: Zero or unused line items MUST be collapsible while remaining discoverable, and warning-producing values MUST never be hidden by default.
- **FR-010**: Admins MUST be able to upload supported Excel workbooks and review a non-persistent import preview before committing changes.
- **FR-011**: Import preview MUST report detected sheets, proposed partnership matches, populated years, field mappings, source cells, unmapped data, invalid values, and conflicts.
- **FR-012**: Import MUST distinguish missing values from true zero values and MUST ignore formula-only future years unless the Admin explicitly chooses to create them.
- **FR-013**: Duplicate-year imports MUST require an explicit per-year skip, merge, or replace decision; replace MUST preserve the prior revision in the audit history.
- **FR-014**: A multi-year import MUST commit atomically so validation or persistence failure cannot leave a partially imported partnership.
- **FR-015**: Imported values MUST retain workbook, sheet, source-cell, import-batch, importing-user, and import-time provenance.
- **FR-016**: Values from finalized Atlas K-1 documents MUST be reusable as sourced tracker inputs and MUST link back to the source document and reviewed field when available.
- **FR-017**: The tracker MUST preserve the source value, effective value, source type, and override history for every editable annual field.
- **FR-018**: Only Admins MAY import, add, edit, override, delete, or sign off tracker data; scoped authenticated users MAY view tracker data.
- **FR-019**: Manual overrides of imported or finalized K-1 values MUST require a reason and MUST record the actor and time.
- **FR-020**: Saving a change MUST reject stale edits and allow the user to reload the latest revision without silently overwriting another Admin's work.
- **FR-021**: The tracker MUST support the workbook's K-1 income, gain, loss, deduction, distribution, contribution, liability, Section L, book-value, and reconciling-item inputs with explicit labels and sign guidance.
- **FR-022**: Signed finalized K-1 fields MUST be normalized into income or loss effects without requiring duplicate positive-entry income and loss fields.
- **FR-023**: The next year MUST carry forward prior ending outside basis, Section L ending capital, each ending liability category, and cumulative suspended loss, while clearly identifying carried values.
- **FR-024**: Changes to an earlier year MUST recalculate every dependent later year and mark any materially changed reconciled year as needing review.
- **FR-025**: Outside basis MUST calculate from beginning basis plus contributions, included income items, and liability increases, less losses, deductions, distributions, and liability decreases.
- **FR-026**: Ending outside basis MUST not fall below zero; the tracker MUST separately show the before-limit result and the adjustment applied by loss or distribution limitations.
- **FR-027**: Loss limitation MUST show the current loss pool, prior suspended loss, basis available, allowed loss, current suspended loss, and cumulative suspended carryforward.
- **FR-028**: Distribution analysis MUST show cash/property distributions, liability relief, basis before distribution, and any taxable excess distribution.
- **FR-029**: Liability analysis MUST show beginning, ending, and net change for nonrecourse, qualified nonrecourse, and recourse liabilities.
- **FR-030**: Section L reconciliation MUST compare reported beginning capital, contributions, current-year net income or loss, other increases or decreases, withdrawals or distributions, and ending capital with calculated movements.
- **FR-031**: Calculated current-year net income or loss MUST exclude capital contributions, distributions, and liability changes.
- **FR-032**: Year reconciliation status MUST consider all material Section L component variances, book-tax unexplained variance, journal balance, required-data completeness, and unresolved warnings; it MUST NOT rely only on ending book-tax variance.
- **FR-033**: Blank or unreviewed years MUST display as not started or incomplete and MUST NOT display a calculated "OK" solely because missing values evaluate to zero.
- **FR-034**: Reconciliation and status checks MUST use a $1 tolerance unless a more precise source requirement applies.
- **FR-035**: The tracker MUST calculate tax-versus-book adjustments for interest income, dividend income, realized capital gains or losses, general partnership income, and the balancing Investment in Partnership account.
- **FR-036**: The journal-entry summary MUST use an explicit debit-positive and credit-negative convention, MUST display the zero-sum check, and MUST be copyable in a usable account-and-amount format.
- **FR-037**: Book-tax reconciliation MUST support Section 704(c) built-in gain or loss, Section 754 basis step-up, timing differences, other permanent differences, total explained differences, and unexplained variance.
- **FR-038**: The tracker MUST support optional detail beneath aggregated K-1 lines so preparers do not need opaque arithmetic such as a hardcoded sum inside a single value.
- **FR-039**: Each year MUST record workflow state, preparer identity/date, reviewer identity/date, and whether later source or rollforward changes invalidated prior sign-off.
- **FR-040**: A year MUST NOT be marked reconciled until required source values have been reviewed, component variances are within tolerance or explained, the journal check passes, and required sign-off is complete.
- **FR-041**: Import, edit, override, delete, recalculate, and sign-off actions MUST be auditable with before-and-after values.
- **FR-042**: Tracker records and audit history MUST survive application restart and deployment and MUST not depend on browser storage or process-local memory.
- **FR-043**: Loading a partnership with 50 annual records MUST present its summary and usable year navigation within 2 seconds under normal test conditions.
- **FR-044**: The page MUST provide clear loading, empty, filtered-empty, error, permission-restricted, import-preview, import-failure, and populated states.
- **FR-045**: Year selection, tabs, drawers, dialogs, warnings, and unsaved-change prompts MUST be keyboard accessible and expose meaningful labels to assistive technology.

### Key Entities

- **K1 Tracker Partnership**: The existing partnership and entity context for which annual K-1 basis data is tracked, including optional opening basis and suspended-loss assumptions.
- **Tracker Year**: One tax year for one partnership, including workflow status, revision, source links, sign-off, and calculated summaries.
- **Tracker Value**: A normalized annual input or adjustment with field key, effective amount, original sourced amount, source type, provenance, and optional override reason.
- **Basis Rollforward**: The ordered calculation from beginning basis through increases, decreases, limitations, distributions, and ending outside basis.
- **Section L Reconciliation**: Reported capital-account movements, calculated movements, component variances, book-tax explanations, and reconciliation status.
- **Journal Entry Summary**: Calculated tax-versus-book adjustments by general-ledger account plus the balancing investment entry and zero-sum check.
- **Import Batch**: A staged workbook analysis and its atomic commit result, including detected sheets, mappings, conflicts, warnings, and source-cell provenance.
- **Year Sign-off**: Preparer and reviewer identities, timestamps, revision reviewed, and invalidation state.
- **Tracker Audit Event**: Immutable evidence of imports, manual changes, overrides, deletions, recalculations, and sign-off transitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can select a partnership and reach any one of 50 tax years in no more than three interactions without scrolling through other partnerships' detail.
- **SC-002**: An Admin can preview and import the supplied five populated years in under three minutes without manually rekeying annual values.
- **SC-003**: For the supplied workbook, imported ending outside basis matches the workbook's 2021–2025 ending values within $1, while blank 2026–2030 columns remain incomplete rather than "OK."
- **SC-004**: All known workbook reconciliation defects have regression coverage, including exclusion of contributions from calculated net income and inclusion of component variances in overall status.
- **SC-005**: In a usability review, at least 4 of 5 representative users can find a year, explain its ending basis, identify a warning, and locate its source without assistance.
- **SC-006**: Every committed import and manual override can be traced to its source or actor, prior value, reason, and timestamp.
- **SC-007**: Journal-entry summaries balance to zero within $1 for all reconciled years, and no year with a failed balance check can be signed off as reconciled.
- **SC-008**: A partnership with 50 years becomes usable within 2 seconds under normal test conditions and does not require a 50-column or 50-card primary layout.
- **SC-009**: Keyboard-only users can select a partnership and year, open every detail view, review warnings, and complete an authorized edit without becoming trapped or losing focus.

## Assumptions

- Existing Atlas entities, partnerships, authenticated sessions, entity scope, roles, finalized K-1 review data, and audit conventions remain the authoritative identity and access context.
- The provided workbook is the functional reference; its layout is not the target UI, and obvious formula or status defects are corrected rather than reproduced.
- The supplied HTML prototype is a secondary reference for outside-basis, liability, suspended-loss, and excess-distribution behavior, not a persistence or visual implementation template.
- The first release supports the provided workbook's line mapping and uses the currently reviewed Atlas K-1 field vocabulary. Additional tax-form codes can be added later without redesigning the year model.
- The default calculation follows the current IRS partner-basis worksheet ordering. Workbook-specific treatment of guaranteed payments, nondeductible expenses, foreign taxes, or transaction timing is enabled only through an explicit CPA-approved calculation version and acceptance tests.
- Source signs are normalized in the tracker: the UI explains source-specific signs but calculations use one consistent income-positive/decrease-positive domain convention.
- Opening outside basis and opening suspended loss may be entered as explicit assumptions when the first available K-1 is not the partnership's inception year.
- NAV history, DPI, RVPI, TVPI, IRR, JSON backup/restore, and a portfolio-wide stacked fund dashboard from the HTML prototype are outside this feature's first release because they are not part of the supplied tax-basis workbook's core goal.
- The tracker displays and copies the selected-year journal entry; generating accounting-system-specific posting files is outside this feature.
