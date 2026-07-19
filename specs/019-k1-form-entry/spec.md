# Feature Specification: K-1 Form-Inspired Data Entry

**Feature Branch**: `019-k1-form-entry`  
**Created**: 2026-07-18  
**Status**: Implemented with complete-form amendment
**Input**: User description: "Make K-1 entry look as similar to an actual K-1 as possible while preserving all functionality."

## Requirement Amendment (2026-07-19)

The user subsequently required every field on the supplied 2025 Schedule K-1 (Form 1065) to be enterable. This amendment is authoritative wherever the original visual-redesign requirements below describe official cells as read-only, unavailable, unsupported, or outside persistence.

- Every standard header, Part I, Part II, Item J-N, and Part III field represented on the supplied one-page Schedule K-1 is editable for users with K-1 edit permission.
- Identity values already known by Jackson are used as editable defaults; tax-specific overrides are retained with the selected tracker year.
- Calculation-backed money fields keep their existing `K1TrackerFieldChange` behavior. Additional official-form text, dates, choices, percentages, checkboxes, money fields, and repeatable code/detail rows are saved as typed `officialFormData` on the tracker year.
- Official-form-only values increment the optimistic revision, invalidate the current year's sign-off, and do not alter basis or other Jackson calculations.
- The prior **Not tracked in Jackson** treatment is removed from the form.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enter K-1 values where they appear on the form (Priority: P1)

As a partnership workspace user, I want the K-1 entry experience to resemble the supplied Schedule K-1 so that I can transfer values without translating between an unfamiliar application layout and the tax form.

**Why this priority**: Reducing transcription confusion is the primary objective. Users must be able to recognize the form structure before secondary presentation improvements matter.

**Independent Test**: Open a partnership tax year, locate a supported Part III line by its familiar line number, enter a value, preview the calculation, and save it without using a wizard or changing any existing financial result.

**Acceptance Scenarios**:

1. **Given** a user opens the K1 & Cash Activity tab for a partnership year, **When** the K-1 editor loads, **Then** it presents a recognizable Schedule K-1 header and the Part I, Part II, and Part III hierarchy in one continuous form.
2. **Given** the user has a source K-1, **When** they look for a supported Part III line such as line 1, **Then** the matching input appears in the corresponding numbered form cell with familiar wording.
3. **Given** the user changes a supported value, **When** they preview and save, **Then** the editor sends the same field key, sign convention, and value that the current workflow sends.
4. **Given** the year has beginning and ending Item K liability values, **When** the editor loads, **Then** those values appear in an Item K beginning/ending table that resembles the K-1 section.
5. **Given** the year has Section L values, **When** the editor loads, **Then** capital account activity appears in the familiar beginning, increases/decreases, withdrawals/distributions, and ending sequence.

---

### User Story 2 - Understand tracked, derived, and unsupported values (Priority: P2)

As a user, I want the form to distinguish editable values, values derived from cash activity, and official K-1 lines Jackson does not track so that the visual fidelity does not imply unsupported behavior.

**Why this priority**: A form-like layout is only trustworthy when users can tell which cells affect Jackson's calculations and why some cells cannot be edited.

**Independent Test**: Load a year containing dated capital calls or distributions and confirm that the corresponding Section L and Part III locations show the derived value as read-only with an explanation, while an unsupported official line is visibly noninteractive.

**Acceptance Scenarios**:

1. **Given** capital contributions or distributions are derived from dated cash activity, **When** the K-1 editor loads, **Then** those values appear in their K-1 locations as read-only and identify cash activity as their source.
2. **Given** an official K-1 field is not used by Jackson's calculations, **When** it is displayed, **Then** it remains editable and persistable while its value stays calculation-neutral.
3. **Given** a field was carried forward, imported, manually entered, or overridden, **When** it appears on the form, **Then** its existing provenance and override state remain available without obscuring the line number or value.
4. **Given** legacy combined line 13 data exists, **When** line 13 renders, **Then** the existing legacy notice and the separate portfolio-deduction and management-fee inputs remain available.
5. **Given** opening basis, suspended loss, or book-tax reconciliation data does not correspond to a literal K-1 cell, **When** the editor loads, **Then** those inputs remain available in a clearly separated Jackson workpaper area below the K-1 surface.

---

### User Story 3 - Complete the form accessibly on any supported viewport (Priority: P3)

As a user working on a laptop, tablet, or phone, I want the K-1-inspired form to remain readable and operable so that the paper-like layout does not create horizontal scrolling or inaccessible controls.

**Why this priority**: Desktop resemblance cannot come at the cost of mobile use, keyboard access, or assistive technology.

**Independent Test**: Complete the editor using only a keyboard at desktop width, then inspect it at 390 CSS pixels and confirm that all sections and actions are available in logical order without page-level horizontal overflow.

**Acceptance Scenarios**:

1. **Given** a wide desktop viewport, **When** the form renders, **Then** Part I and Part II occupy the left region and Part III occupies the right region in a layout recognizably similar to the reference.
2. **Given** a narrow viewport, **When** the form renders, **Then** sections stack in logical reading order, labels remain associated with inputs, and the page does not require horizontal scrolling.
3. **Given** a keyboard-only user, **When** they navigate the form, **Then** focus moves through editable fields and actions in a predictable order with a clearly visible focus indicator.
4. **Given** a validation error or save failure, **When** feedback is shown, **Then** it remains programmatically associated with the relevant control and does not depend on color alone.

### Edge Cases

- Partnership or partner identity data is missing: show an empty labeled control and never invent a tax identifier, address, or ownership value.
- An official K-1 field is not used by current calculations: save it in `officialFormData` without adding it to the numeric calculation change set.
- Long currency values, negative values, zero values, and high-precision percentages must remain readable without overlapping neighboring cells.
- A derived distribution or capital contribution conflicts with a previously entered K-1 value: preserve the existing source-of-truth and conflict messaging.
- Line 13 contains both currently supported subcategories or legacy combined data: retain separate inputs and the existing migration explanation.
- A user enables manual override: the existing required reason, notice, recalculation behavior, and audit semantics remain intact.
- The form has unsaved edits and the user changes the tax year or leaves the workspace: preserve the existing dirty-state guard.
- A read-only user opens the form: values and provenance remain readable while editing and save actions remain unavailable as they are today.
- The viewport is 390 CSS pixels wide: the form stacks without page-level horizontal overflow or clipped actions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST use the supplied 2025 Schedule K-1 (Form 1065) as the visual and information-hierarchy reference without copying any private entered values from the reference document.
- **FR-002**: The editor MUST show a recognizable K-1 header with the selected tax year and the Part I, Part II, and Part III section hierarchy.
- **FR-003**: Part I and Part II MUST expose editable controls for every official field and use available Jackson partnership and partner context as editable defaults.
- **FR-004**: Item K MUST present beginning and ending shares of nonrecourse, qualified nonrecourse financing, and recourse liabilities in a form-like grid.
- **FR-005**: Section L MUST present the existing capital account fields in the recognizable beginning balance, contributions, current-year change, other increase/decrease, withdrawals/distributions, and ending balance sequence.
- **FR-006**: Part III MUST present supported fields in official line-number order and use a two-column form grid at wide desktop sizes where practical.
- **FR-007**: Every currently editable K-1 field MUST remain editable, and every edit MUST retain its existing field key, numeric parsing, sign convention, validation, calculation, and persistence behavior.
- **FR-008**: The editor MUST remain one continuous form and MUST NOT introduce wizard steps, tabs, or collapsed sections required to reach existing fields.
- **FR-009**: Capital contributions and distributions derived from dated cash activity MUST remain read-only in the K-1 editor and MUST explain their source at the corresponding form location.
- **FR-010**: Official-form-only cells MUST be editable, saved with the tracker year, and excluded from Jackson financial calculations unless they already map to a canonical calculation field.
- **FR-011**: Existing opening basis, opening suspended loss, book-income, tax-income, and reconciliation inputs that are not literal K-1 cells MUST remain available in a distinct Jackson workpaper section below the K-1-inspired form.
- **FR-012**: The redesign MUST preserve field provenance, carried-prior-year indicators, legacy combined line 13 handling, manual override controls, required override reason, draft results, notices, and recalculation feedback.
- **FR-013**: The redesign MUST preserve Preview Calculation, Revert Changes, and Save behavior, including sticky action access and unsaved-change guarding.
- **FR-014**: The layout MUST adapt to narrow viewports, including 390 CSS pixels, without page-level horizontal overflow and with a logical top-to-bottom reading order.
- **FR-015**: All controls MUST have programmatic labels, keyboard operation, visible focus states, non-color-only status cues, and practical touch targets of at least 44 by 44 CSS pixels where controls permit.
- **FR-016**: The visual treatment MUST use a restrained black, white, and gray tax-form structure, reserving Jackson brand color for interactive emphasis, focus, and primary actions.
- **FR-017**: The feature MUST add a backward-compatible API and JSONB storage extension for complete official-form data while leaving calculation formulas and existing numeric field-map semantics unchanged.
- **FR-018**: Automated tests MUST verify field coverage, field-key compatibility, derived read-only behavior, override behavior, primary actions, accessibility semantics, and responsive structural behavior.
- **FR-019**: The editor MUST identify itself as a Jackson data-entry experience inspired by Schedule K-1 and MUST NOT imply that the on-screen representation is an official filed tax document.

### Key Entities *(include if feature involves data)*

- **K1TrackerYearDetail (extended)**: Canonical yearly calculation values plus typed `officialFormData`, calculated results, provenance, override state, cash-activity-derived values, and save metadata. This remains the source of truth.
- **K1TrackerFieldChange (existing)**: The field-key/value change set sent by preview and save operations. Its shape and semantics remain unchanged.
- **K1FormLayoutSection (presentation only)**: Describes a visual K-1 part, item, line, column, label, and supported/unsupported status without introducing persisted data.
- **K1FormFieldPlacement (presentation only)**: Maps an existing Jackson field key to its familiar K-1 location and display treatment.
- **K1FieldAnnotation (presentation only)**: Surfaces existing provenance, derived/read-only state, carryforward state, legacy-line notices, and validation feedback next to the appropriate cell.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of fields currently editable in the K-1 editor remain reachable and produce the same preview/save field keys and values after the redesign.
- **SC-002**: Every supported Item K, Section L, and Part III value is displayed in its corresponding item or line-number location in the K-1-inspired form.
- **SC-003**: In a moderated comparison using the supplied reference, a user familiar with Schedule K-1 can locate any supported Part III line in 10 seconds or less without product-specific instruction.
- **SC-004**: At 390 CSS pixels, automated and manual checks show no page-level horizontal overflow, clipped form actions, or unreachable fields.
- **SC-005**: A keyboard-only user can reach every editable field, override control, preview, revert, and save action in a logical order with visible focus.
- **SC-006**: All existing K-1 workflow regression tests pass, and new structural tests confirm that every official-form field is placed exactly once and formerly blocked fields enter the official save payload.
- **SC-007**: Previewed and saved basis, suspended-loss, contribution, distribution, and liability results are identical to results produced from the same values before the visual redesign.

## Assumptions

- The supplied 2025 Form 1065 Schedule K-1 is a presentation reference, not a requirement to generate, populate, or file a tax form.
- The selected Jackson tax year remains dynamic even though the reference layout and wording are based on the supplied 2025 form.
- Existing partnership and partner profile data provides editable defaults for Part I and Part II; missing official fields remain blank.
- Official lines Jackson does not use in calculations are editable and persisted as official-form data.
- The current K-1 calculation service, field-map contract, dated cash-activity source of truth, and override workflow remain canonical.
- Desktop layout carries the strongest paper-form resemblance; smaller viewports prioritize legibility, access, and logical ordering.
- The source PDF and any private values visible in it will not be committed to the repository.
