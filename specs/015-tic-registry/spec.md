# Feature Specification: TIC Registry Page

**Feature Branch**: `015-tic-registry`  
**Created**: 2026-07-09  
**Status**: Draft  
**Input**: User description: "Add another page called Tic Registry to the side navbar, use tic-registry.html to plan how the page should work, save the data to RDS, and make it feel like the rest of the application."

## Clarifications

### Session 2026-07-09

- Q: Should TIC Registry include import/export workflows now that records persist to RDS? -> A: No; import/export is out of scope because RDS persistence replaces the HTML backup workaround.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate to the Registry (Priority: P1)

An authenticated Atlas user opens the side navigation, selects "TIC Registry", and lands on a registry page that visually belongs with the existing Atlas application rather than a separate standalone tool.

**Why this priority**: The new registry is only useful if it is discoverable next to Liquidity and feels like part of the same operating system.

**Independent Test**: Sign in, use the side navigation to open TIC Registry, and confirm the page displays its own title, empty state or saved records, and Atlas-consistent controls without requiring a direct URL.

**Acceptance Scenarios**:

1. **Given** an authenticated user with application access, **When** they view the side navigation, **Then** "TIC Registry" is available beside the current financial pages.
2. **Given** an authenticated user selects "TIC Registry", **When** the page loads, **Then** the registry displays the current saved portfolio state or a clear empty state.
3. **Given** the user is on a narrow viewport, **When** they open navigation and the registry page, **Then** the page remains usable without overlapping text or controls.

---

### User Story 2 - Maintain TIC Property Records (Priority: P1)

An authorized user records a co-owned property, its TIC interests, and the underlying owners inside each interest so the organization has one durable source of truth for the registry.

**Why this priority**: The core value is replacing the standalone local registry with persistent, shared records.

**Independent Test**: Create a property, add at least one TIC interest, add at least one owner, refresh the browser, and confirm the records still appear.

**Acceptance Scenarios**:

1. **Given** the registry has no records, **When** an authorized user creates a property with name, type, status, acquisition date, and estimated value, **Then** the property appears in the registry list.
2. **Given** a property exists, **When** an authorized user adds a TIC interest with name, share percentage, status, acquisition origin, relevant source, date, value, and notes, **Then** the interest appears under that property.
3. **Given** a TIC interest exists, **When** an authorized user adds an underlying owner with name, owner type, and share percentage of that TIC, **Then** the owner appears under that interest with their effective property percentage.
4. **Given** records have been created, **When** the user refreshes or signs in from another session with access, **Then** the same records are available.

---

### User Story 3 - Reconcile Ownership Percentages (Priority: P2)

An authorized user reviews TIC ownership totals and owner allocations to quickly see whether property-level or TIC-level percentages add up to 100%.

**Why this priority**: The reference page's most important decision support is its ability to flag incomplete or over-allocated ownership records.

**Independent Test**: Create allocations that total under, exactly, and over 100%, then confirm the registry labels each state clearly.

**Acceptance Scenarios**:

1. **Given** a property has TIC interests totaling 100%, **When** the user views the property, **Then** the page confirms the property is fully allocated.
2. **Given** a property has TIC interests totaling less than 100%, **When** the user views the property, **Then** the page shows the unassigned percentage.
3. **Given** a property has TIC interests totaling more than 100%, **When** the user views the property, **Then** the page flags the over-allocation.
4. **Given** a TIC interest has underlying owners, **When** owner shares do not total 100%, **Then** the page flags the owner allocation issue for that TIC.

---

### User Story 4 - Track Exchange Lineage (Priority: P2)

An authorized user marks whether a TIC interest was acquired through cash purchase or a 1031 exchange and, for exchange interests, records the relinquished source or links to another registry interest that rolled into it.

**Why this priority**: Exchange lineage is a central part of the reference HTML and helps users understand why each interest exists.

**Independent Test**: Create a TIC interest from a cash purchase, then create another from an exchange source, and confirm the registry displays the correct origin and source context.

**Acceptance Scenarios**:

1. **Given** an authorized user creates a cash-purchased TIC interest, **When** they save it, **Then** the registry labels it as a cash purchase and does not require a relinquished source.
2. **Given** an authorized user creates a 1031 exchange TIC interest, **When** they choose or enter the relinquished source, **Then** the registry displays the exchange source under the interest.
3. **Given** a TIC interest is used as the source for a new exchange interest, **When** that relationship is saved, **Then** the source interest can be marked as rolled while preserving its history.

### Edge Cases

- A property has no TIC interests yet.
- A TIC interest has no underlying owners yet.
- Property-level TIC shares total less than 100%, exactly 100%, or more than 100%.
- TIC-level owner shares total less than 100%, exactly 100%, or more than 100%.
- A user enters fractional percentages with up to four decimal places.
- A user enters a negative value, blank required name, percentage above 100%, or invalid date.
- A source TIC interest referenced by exchange lineage is later deleted or becomes inaccessible.
- A user attempts to delete a property that contains TIC interests and owners.
- A save fails after the user has entered form data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add a "TIC Registry" destination to the side navigation for authenticated users with registry access.
- **FR-002**: System MUST display a TIC Registry page that follows the existing Atlas application layout, navigation behavior, typography, spacing, and control patterns.
- **FR-003**: System MUST show a registry summary with total properties, total units, total TIC interests, total underlying owners, and held acquisition price.
- **FR-004**: System MUST allow authorized users to create, view, edit, and delete property records.
- **FR-005**: Property records MUST include property name or address, property type, status, acquisition date, estimated value, and optional notes when supported by the form.
- **FR-006**: System MUST allow authorized users to create, view, edit, and delete TIC interests under a property.
- **FR-007**: TIC interest records MUST include TIC or co-owner name, percentage of the property, status, acquisition origin, exchange or purchase date, value, relinquished source when applicable, and notes.
- **FR-008**: System MUST allow authorized users to create, view, edit, and delete underlying owners under a TIC interest.
- **FR-009**: Owner records MUST include owner name, owner type, and percentage of the TIC interest.
- **FR-010**: System MUST calculate each owner's effective percentage of the property from the TIC interest percentage and owner percentage.
- **FR-011**: System MUST show property-level ownership allocation status as fully allocated, under-allocated, or over-allocated.
- **FR-012**: System MUST show TIC-level owner allocation status as fully allocated, under-allocated, or over-allocated.
- **FR-013**: System MUST support cash purchase and 1031 exchange acquisition origins for TIC interests.
- **FR-014**: System MUST allow exchange TIC interests to reference either a source interest already in the registry or a manually entered relinquished source name.
- **FR-015**: System MUST preserve exchange lineage even when the referenced source interest is later deleted or unavailable.
- **FR-016**: System MUST persist registry records in shared application storage so records survive browser refreshes, device changes, and redeployments.
- **FR-017**: System MUST prevent browser-only storage from being the source of truth for production registry data.
- **FR-018**: System MUST validate required names, dates, currency values, and percentages before saving.
- **FR-019**: System MUST require confirmation before deleting a property, TIC interest, or owner, and must explain what dependent records will be removed.
- **FR-020**: System MUST require authenticated access for registry reads and Admin role for registry mutations.
- **FR-021**: System MUST provide user-friendly empty, loading, save-success, save-failure, and validation-error states.
- **FR-022**: System MUST make the page usable on desktop and mobile viewports without text or controls overlapping.
- **FR-023**: System MUST communicate that registry figures are tracking records and do not replace legal, tax, valuation, or qualified-intermediary review.

### Key Entities *(include if feature involves data)*

- **TIC Property**: A co-owned property tracked in the registry. Key attributes include name or address, type, status, acquisition date, estimated value, notes, and its collection of TIC interests.
- **TIC Interest**: A TIC/LLC interest that owns a percentage of a property. Key attributes include TIC/LLC name, property percentage, status, acquisition origin, source lineage, date, value, notes, and its collection of underlying owners.
- **TIC Owner**: An underlying owner within a TIC interest. Key attributes include owner name, owner type, TIC percentage, and calculated effective property percentage.
- **Exchange Source**: A source relationship or manual source name explaining what was sold or rolled into an exchange-acquired TIC interest.
- **Registry Summary**: A derived view of counts, estimated held value, and allocation status across the registry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can navigate from the side navigation to TIC Registry in no more than two interactions.
- **SC-002**: A user can create a property, TIC interest, and underlying owner in under 3 minutes during acceptance testing.
- **SC-003**: Saved registry records remain available after browser refresh, sign-out/sign-in, and application redeploy verification.
- **SC-004**: 100% of tested under-, exact-, and over-allocation examples display the correct allocation state.
- **SC-005**: The registry supports at least 100 properties, 500 TIC interests, and 1,000 underlying owners within one permitted organization without users waiting more than 2 seconds for the initial registry view in normal test conditions.
- **SC-006**: No critical or high accessibility violations are found for the registry page's core navigation, forms, dialogs, and record list during automated accessibility checks.

## Assumptions

- The attached `tic-registry.html` is a functional reference for workflows, fields, and allocation behavior; the production page should use the existing Atlas application design language.
- Existing Atlas authentication and Admin authorization rules will be reused.
- Admin users can create, update, and delete registry records; read-only roles can view registry records.
- Importing and exporting registry data are out of scope for this feature because RDS persistence is the durable source of truth.
- Estimated property values are for tracking and summary purposes, not authoritative valuations.
