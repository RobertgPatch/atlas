# Feature Specification: Reports Phased Delivery

**Feature Branch**: `011-reports-phased-delivery`  
**Created**: 2026-04-23  
**Status**: Draft  
**Input**: User description: "Implement 006 reports in 3 phases. Phase 1 must be Portfolio Summary (from Spec 006) and should use the provided generated UI as a reference implementation for behavior and structure. The remaining phases should complete the rest of Spec 006 scope."

## Clarifications

### Session 2026-04-23

- Q: For Phase 1 export action behavior before full CSV/XLSX delivery, what happens when a user clicks Export? → A: Clicking Export opens a non-blocking informational message that CSV and XLSX exports will be available in Phase 3, and no file is generated.
- Q: How should inline edit conflicts be handled when another user has updated the same value? → A: The system rejects stale saves, preserves the newer stored value, and shows a conflict message with a refresh action.
- Q: What is the exact undo scope for inline edits? → A: Undo applies only to the most recent successful inline edit in the current page session and clears after the next successful save or page refresh.
- Q: How should weighted metrics render when denominators are zero or missing? → A: The UI shows N/A for undefined weighted metrics and excludes undefined rows from weighted aggregate calculations.
- Q: What input validation rules apply to inline monetary edits? → A: Monetary edits must accept zero and positive values up to USD 999,999,999,999.99 and reject negative or non-numeric input with inline error feedback.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Phase 1 Portfolio Summary End-to-End (Priority: P1)

As a report consumer, I can open the Portfolio Summary report and immediately review the most important portfolio metrics, filter the data, inspect totals, and make inline monetary updates where allowed, while preserving the report behavior shown in the reference UI.

**Why this priority**: This is the first release phase and the foundation for the remaining reports. It delivers immediate analytical value and validates the core report interaction model.

**Independent Test**: Can be fully tested by loading Portfolio Summary with seeded report data, validating KPI cards, filters, table states, sticky totals row, inline edit plus undo, and visible export action behavior.

**Acceptance Scenarios**:

1. **Given** a user opens Portfolio Summary, **When** the page renders, **Then** it shows a report header, explanatory subtitle, and an export action in the page header area.
2. **Given** Portfolio Summary data exists, **When** the user views the KPI area, **Then** the page shows total commitment, total distributions, weighted IRR, and weighted TVPI.
3. **Given** the user applies filters, **When** they use entity search, date range, entity type, or clear filters, **Then** the table and totals refresh to match active filters.
4. **Given** the report table is loading, empty, or populated, **When** data state changes, **Then** the table shows a loading skeleton, empty state message, or normal rows accordingly.
5. **Given** Portfolio Summary is populated, **When** the user scrolls the table, **Then** a sticky totals row remains visible and shows totals or weighted averages for the defined metrics.
6. **Given** a user edits an editable monetary cell such as original commitment, **When** they save, **Then** they receive save feedback, the value persists, and an undo toast allows restoring the previous value.
7. **Given** Phase 1 is active, **When** a user clicks Export, **Then** the system shows a non-blocking message that CSV and XLSX export will be available in Phase 3 and does not generate a file.

---

### User Story 2 - Phase 2 Asset Class Summary (Priority: P2)

As a report consumer, I can analyze portfolio performance by asset class using the same reporting patterns, so I can compare concentration and performance drivers without leaving the reports workflow.

**Why this priority**: After Portfolio Summary is stable, users need segmented analysis by asset class to make allocation and risk decisions.

**Independent Test**: Can be fully tested by loading Asset Class Summary, applying shared filters, validating grouped metrics and totals, and confirming consistent report states and formatting.

**Acceptance Scenarios**:

1. **Given** Asset Class Summary is available, **When** a user opens it, **Then** they can review grouped rows by asset class with report metrics aligned to Spec 006 scope.
2. **Given** the user changes filters, **When** filters are applied or cleared, **Then** grouped rows and totals update to match the selected subset.
3. **Given** the report has no matching rows, **When** filters produce no results, **Then** the report shows a clear empty state and keeps filter controls available.
4. **Given** grouped data is present, **When** totals are displayed, **Then** the report provides summary totals and weighted metrics with the same numeric formatting rules used in Phase 1.

---

### User Story 3 - Phase 3 Activity Detail, Export Completion, and Polish (Priority: P3)

As a report consumer or operator, I can review row-level activity details and export any report in CSV or XLSX format, so I can share and audit report outcomes outside the application.

**Why this priority**: Activity-level transparency and reliable cross-report export complete the original Spec 006 scope and make the reports operationally usable.

**Independent Test**: Can be fully tested by loading Activity Detail, validating activity keys and rows, exporting each report type in CSV and XLSX with active filters, and verifying consistent cross-report behavior.

**Acceptance Scenarios**:

1. **Given** Activity Detail is enabled, **When** a user opens the report, **Then** they can review row-level activity keyed by entity, partnership, and tax year.
2. **Given** report filters are active, **When** a user exports Portfolio Summary, Asset Class Summary, or Activity Detail, **Then** CSV and XLSX exports reflect the same filtered dataset and metric values visible in the UI.
3. **Given** export generation fails, **When** the user requests export, **Then** the system presents an actionable error message and keeps the report usable.
4. **Given** all three reports are complete, **When** users navigate among them, **Then** headers, filters, table states, numeric formatting, and feedback patterns behave consistently.

---

### Edge Cases

- What happens when filters remove all rows from a report?
- If another user has updated the same field since load, stale inline saves are rejected and the user is prompted to refresh before retrying.
- Monetary inline edits accept zero and positive values up to USD 999,999,999,999.99; negative and non-numeric input is rejected with inline error feedback.
- Undo applies only to the most recent successful inline edit in the current page session and is replaced by the next successful save.
- How does export behave for very large filtered datasets?
- When a weighted metric denominator is zero or missing, the metric displays as N/A and undefined rows are excluded from weighted aggregate calculations.

## Requirements *(mandatory)*

### Functional Requirements

#### Phase Governance

- **FR-001**: The system MUST deliver Spec 006 reports in three phases: Phase 1 Portfolio Summary, Phase 2 Asset Class Summary, and Phase 3 Activity Detail plus cross-report export and polish.
- **FR-002**: Each phase MUST be independently releasable and provide complete user value without requiring unfinished functionality from later phases.
- **FR-003**: Report data MUST continue to be sourced from parsed K-1 data, manual inputs, and calculated fields.

#### Phase 1 - Portfolio Summary

- **FR-010**: Phase 1 MUST provide a Portfolio Summary page with a report header, subtitle, and export action.
- **FR-011**: Phase 1 MUST display KPI cards for total commitment, total distributions, weighted IRR, and weighted TVPI.
- **FR-012**: Phase 1 MUST provide a filter toolbar with entity search, date range selector, entity type selector, and clear-filters control.
- **FR-013**: Phase 1 MUST provide a Portfolio Summary table with these columns: entity name, original commitment, percent called, unfunded, paid-in, distributions, residual value, DPI, RVPI, TVPI, and IRR.
- **FR-014**: Phase 1 table behavior MUST include loading skeleton, empty state message, and normal row rendering.
- **FR-015**: Phase 1 MUST provide a sticky totals row that remains visible during table scroll and shows totals and weighted averages for applicable metrics.
- **FR-016**: Phase 1 MUST support inline editing for defined monetary fields, including original commitment at minimum.
- **FR-017**: Phase 1 inline editing MUST provide immediate save feedback and an undo toast that restores the most recent saved value.
- **FR-018**: Phase 1 MUST format numbers consistently as currency, percentage, or multiple based on metric type.
- **FR-019**: Phase 1 export action MUST be visible and MUST provide explicit user feedback for CSV/XLSX availability state until full export delivery is completed in Phase 3.
- **FR-020**: In Phase 1, clicking Export MUST show a non-blocking informational message that CSV and XLSX export will be available in Phase 3, and MUST NOT generate a file.
- **FR-021**: Inline monetary edits MUST accept zero and positive values up to USD 999,999,999,999.99 and MUST reject negative or non-numeric inputs with inline error feedback.

#### Phase 2 - Asset Class Summary

- **FR-030**: Phase 2 MUST deliver an Asset Class Summary report that groups and summarizes Spec 006 metrics by asset class.
- **FR-031**: Phase 2 MUST apply the same filter dimensions as Phase 1 so users can compare summary and grouped views using the same report context.
- **FR-032**: Phase 2 MUST provide loading, empty, and populated table states with clear user messaging.
- **FR-033**: Phase 2 MUST show totals and weighted metrics using the same formatting standards defined for Phase 1.
- **FR-034**: When weighted metrics are undefined because denominators are zero or missing, the UI MUST display `N/A` and exclude undefined rows from weighted aggregate calculations.

#### Phase 3 - Activity Detail, Export Completion, and Polish

- **FR-040**: Phase 3 MUST deliver an Activity Detail report with activity rows keyed by entity, partnership, and tax year.
- **FR-041**: Activity rows MUST be created or updated as part of the finalization workflow so Activity Detail reflects the current finalized reporting state.
- **FR-042**: Phase 3 MUST enable full CSV and XLSX export for Portfolio Summary, Asset Class Summary, and Activity Detail.
- **FR-043**: Export output MUST reflect active report filters and include the same metrics and column values visible to the user at export time.
- **FR-044**: Export workflows MUST provide completion or failure feedback without forcing users to leave the current report.
- **FR-045**: Phase 3 polish MUST standardize cross-report interaction behavior for filters, table states, formatting, inline feedback, and navigation continuity.

#### Cross-Phase Integrity

- **FR-050**: Saved inline edits MUST persist and recalculate affected report metrics.
- **FR-051**: Undo MUST restore only the most recent successful inline edit value within the current page session, and undo eligibility MUST clear after the next successful save or page refresh.
- **FR-052**: Report views MUST preserve financial metric definitions across phases so values remain consistent when users move between reports.
- **FR-053**: If an inline edit is stale because the underlying value changed since the report loaded, the save MUST be rejected, the latest stored value MUST remain authoritative, and the user MUST receive a conflict message with a refresh action.
- **FR-054**: Report calculations MUST treat undefined weighted metric inputs consistently across all reports by excluding undefined rows from weighted aggregates and displaying `N/A` for undefined metric values.

### Key Entities *(include if feature involves data)*

- **Report View**: Represents one of the three report surfaces (Portfolio Summary, Asset Class Summary, Activity Detail), including title, filters, table state, and visible metrics.
- **Report Filter Set**: Represents the active entity search, date range, and entity type selections that scope report results and exports.
- **Portfolio Summary Row**: Represents one entity-level summary row with commitment, capital, distribution, valuation, and return metrics.
- **Asset Class Summary Row**: Represents one asset-class aggregate row derived from scoped report data.
- **Activity Detail Row**: Represents one activity record keyed by entity, partnership, and tax year with associated metric impacts.
- **Editable Report Field Change**: Represents an inline monetary edit event with previous value, new value, saved state, and undo eligibility.
- **Report Export Request**: Represents a user-initiated export containing selected report type, active filters, output format (CSV or XLSX), and completion status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In Phase 1 usability testing, at least 90% of target users can identify total commitment, total distributions, weighted IRR, and weighted TVPI within 30 seconds of opening Portfolio Summary.
- **SC-002**: In Phase 1 acceptance testing, 100% of defined Portfolio Summary table states (loading, empty, populated, sticky totals) render as specified.
- **SC-003**: In validation testing, at least 95% of successful inline monetary edits provide save feedback and allow undo in a single follow-up action.
- **SC-004**: By completion of Phase 2, users can apply one filter set and see consistent scoped results across Portfolio Summary and Asset Class Summary in at least 95% of regression scenarios.
- **SC-005**: By completion of Phase 3, CSV and XLSX export succeeds for all three reports in at least 99% of test export requests using valid inputs.
- **SC-006**: By completion of Phase 3, users can navigate all three reports and complete a primary review task without interaction-pattern confusion in at least 90% of moderated test runs.

## Assumptions

- Existing access control, entity visibility, and report navigation patterns remain unchanged unless explicitly updated by this feature.
- Financial metric definitions already used in Spec 006 remain authoritative and are reused across all phases.
- Phase 1 includes visible export affordances, while full CSV/XLSX file generation is completed in Phase 3.
- Data needed for Portfolio Summary, Asset Class Summary, and Activity Detail is available from established finalized reporting pipelines.
- Inline editing scope starts with monetary fields required by Portfolio Summary and can expand in later phases without changing undo semantics.
