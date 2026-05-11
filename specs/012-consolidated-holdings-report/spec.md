# Feature Specification: Consolidated Holdings Report

**Feature Branch**: `012-consolidated-holdings-report`
**Created**: 2026-05-11
**Status**: Draft
**Input**: User description: "Create a Consolidated Holdings Report page with Plaid account selection, holdings ingestion, asset-level consolidation across brokerages and financial institutions, rollup rows with per-custodian detail rows, and modern report interface using existing React design components."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect and Select Investment Accounts (Priority: P1)

As an advisor or operator, I can start a Plaid connection from the Consolidated Holdings Report, choose which connected investment accounts should be included, and see the selected custodians reflected in the report scope.

**Why this priority**: Without a trusted account-selection workflow, the report cannot reliably represent the client's actual multi-custodian holdings.

**Independent Test**: Can be fully tested by opening the Consolidated Holdings Report, launching Plaid Link in sandbox mode, selecting multiple investment accounts, and confirming only selected accounts are eligible for synchronization and reporting.

**Acceptance Scenarios**:

1. **Given** a user opens the report page, **When** they click the connect/select accounts action, **Then** the system starts the Plaid Link flow for investment accounts.
2. **Given** Plaid returns accounts for one or more institutions, **When** the user selects accounts, **Then** Atlas stores the selected item/account identifiers, institution/custodian labels, account masks when available, and selection status.
3. **Given** a connected account is deselected or disconnected, **When** the report refreshes, **Then** holdings from that account are excluded from the consolidated report without deleting historical connection metadata needed for audit.

---

### User Story 2 - Consolidate Holdings Into One Row Per Asset (Priority: P1)

As a report consumer, I can view one consolidated row per asset across all selected brokerages and accounts, with account-level holdings nested underneath, so I can understand both total exposure and where the asset is held.

**Why this priority**: This is the core analytical value of the report. A client may own the same security in many accounts, and the report must remove duplicate asset rows while preserving custody detail.

**Independent Test**: Can be fully tested using seeded holdings where the same symbol appears in multiple accounts. The report should show one parent row for that symbol and expandable child rows for each contributing account/custodian.

**Acceptance Scenarios**:

1. **Given** 20 shares of GOOGL in Brokerage A and 50 shares of GOOGL in Brokerage B, **When** the report loads, **Then** Atlas shows one aggregated GOOGL parent row with quantity 70 and two child rows for the brokerage-level positions.
2. **Given** the same asset appears multiple times inside one custodian feed, **When** the report consolidates holdings, **Then** Atlas combines rows that share the same normalized asset identity and preserves the contributing account/custodian details underneath.
3. **Given** cost basis and unrealized gain/loss differ by account, **When** the parent row renders, **Then** Atlas shows rolled-up dollar totals and weighted average per-unit cost basis where the metric is meaningful.

---

### User Story 3 - Review, Filter, and Export the Report (Priority: P2)

As a report consumer, I can scan the consolidated report through a modern interface with summary KPIs, filters, expandable rows, and export actions so the report is useful for client review and operational follow-up.

**Why this priority**: Once the data is connected and consolidated, the interface must make the result reviewable, explainable, and shareable.

**Independent Test**: Can be fully tested with a mixed dataset containing equities, ETFs, cash-like holdings, missing ticker symbols, positive and negative gain/loss, and multiple custodians.

**Acceptance Scenarios**:

1. **Given** holdings data exists, **When** the report opens, **Then** the user sees report date, selected account scope, total market value, total cost basis, total unrealized gain/loss, and number of unique assets.
2. **Given** the report is populated, **When** the user filters by custodian, account, type, symbol, or gain/loss state, **Then** both parent rollups and child rows update to match the active filter set.
3. **Given** the user expands a parent row, **When** child holdings are visible, **Then** each child row shows the custodian/account-level Symbol, Description, Type, Cost Basis, Unrealized Gain/Loss, Custodian, Quantity, and Market Value values.
4. **Given** the user requests export, **When** export completes, **Then** the exported CSV/XLSX includes parent rows and child detail rows in the same scoped order visible in the UI.

---

### User Story 4 - Handle Sync Status and Exceptions (Priority: P3)

As an operator, I can see which connected accounts synced successfully, which need attention, and which holdings could not be confidently normalized, so I can trust the report before sharing it.

**Why this priority**: Plaid-connected investment data can have stale credentials, institution limitations, missing identifiers, or incomplete securities metadata. The report must surface those issues without blocking usable data.

**Independent Test**: Can be fully tested by seeding successful accounts, failed accounts, stale accounts, and holdings with missing symbol/CUSIP/security identifiers.

**Acceptance Scenarios**:

1. **Given** one selected account fails sync, **When** other accounts succeed, **Then** the report renders successful account data and shows a scoped warning for the failed account.
2. **Given** a holding lacks a ticker symbol, **When** it has a CUSIP, ISIN, Plaid security identifier, or descriptive name, **Then** Atlas uses the strongest available identity and flags the row if identity confidence is lower than normal.
3. **Given** Plaid credentials require repair, **When** the user views account status, **Then** Atlas offers an update/reconnect path without breaking the rest of the report.

### Edge Cases

- Duplicate ticker rows can exist within the same custodian account because of lots, account sleeves, or feed duplication; consolidation must be deterministic and traceable.
- Ticker symbols are not globally unique for every asset type, so identity resolution must prefer stable security identifiers such as CUSIP/ISIN when available and use ticker as a fallback.
- Cost basis may be missing, zero, negative, or unavailable for some holdings; totals must distinguish true zero from unknown values.
- Quantity can be fractional, especially for dividend reinvestment or fractional share programs.
- Market value can be missing or stale; such rows remain visible and are flagged instead of silently dropped.
- Cash, money market, options, mutual funds, ETFs, equities, and unknown securities can appear in the same report.
- A selected account may be closed, disconnected, or return no holdings.
- A client may connect dozens of institutions and hundreds or thousands of holdings, so the UI must remain responsive with pagination, virtualization, or server-side filtering as needed.

## Requirements *(mandatory)*

### Functional Requirements

#### Plaid Connection and Account Selection

- **FR-001**: The system MUST provide a Consolidated Holdings Report page reachable from the existing Reports area.
- **FR-002**: The system MUST provide an authenticated server endpoint that creates Plaid Link tokens for the Investments product.
- **FR-003**: The system MUST exchange Plaid public tokens for server-side access tokens and MUST NOT expose access tokens to the browser.
- **FR-004**: The system MUST store connected Plaid items, selected investment accounts, institution/custodian labels, account display labels, masks when available, and account selection status.
- **FR-005**: Users MUST be able to select and deselect which connected investment accounts are included in the report.
- **FR-006**: The system MUST support reconnect/update mode for accounts that require user action.

#### Holdings Synchronization

- **FR-010**: The system MUST retrieve investment holdings for selected Plaid investment accounts.
- **FR-011**: The system MUST persist raw sync snapshots separately from normalized report holdings so source data can be audited.
- **FR-012**: The system MUST store account-level holding facts including symbol, description, security type, cost basis, unrealized gain/loss, custodian, quantity, market value, Plaid account id, Plaid security id, currency, and sync timestamp.
- **FR-013**: The system MUST track sync status per connected item and per selected account, including success, pending, failed, and needs-user-action states.
- **FR-014**: The system MUST allow refresh of holdings for selected accounts and show the report date or last successful sync timestamp.

#### Consolidation and Calculation

- **FR-020**: The system MUST generate one parent row per normalized asset identity across the selected account scope.
- **FR-021**: The parent row MUST expose the current report headers: Symbol, Description, Type, Cost Basis, Unrealized Gain/Loss, Custodian, Quantity, and Market Value.
- **FR-022**: For parent rows, Quantity, Cost Basis, Unrealized Gain/Loss, and Market Value MUST be summed across all contributing holdings when values are known.
- **FR-023**: For parent rows, average cost basis MUST be calculated as total known cost basis divided by total known quantity and MUST be shown separately from total cost basis when included in the UI.
- **FR-024**: Parent row gain/loss percentage MUST be derived from total unrealized gain/loss divided by total known cost basis when cost basis is available and non-zero.
- **FR-025**: Parent row Custodian MUST summarize contributing custodians, using a compact multi-custodian label in collapsed view and full account/custodian detail in expanded child rows.
- **FR-026**: Child rows MUST preserve the account-level holding rows that contributed to the parent row.
- **FR-027**: The system MUST expose normalization confidence or exception status for holdings that cannot be matched to a stable asset identity.
- **FR-028**: The consolidation algorithm MUST be deterministic for the same selected accounts and sync snapshot.

#### Modern Report Interface

- **FR-030**: The report UI MUST provide summary KPIs for total market value, total cost basis, total unrealized gain/loss, gain/loss percentage, selected custodians/accounts, and unique asset count.
- **FR-031**: The report UI MUST provide a primary action to connect/select Plaid accounts and a secondary action to refresh holdings.
- **FR-032**: The report UI MUST support loading, empty, populated, partially synced, failed sync, and needs-reconnect states.
- **FR-033**: The report UI MUST support expandable parent rows with nested per-custodian/account detail rows.
- **FR-034**: The report UI MUST support filtering by symbol/search text, custodian, account, type, and gain/loss state.
- **FR-035**: The report UI MUST support sorting by Symbol, Type, Quantity, Cost Basis, Unrealized Gain/Loss, and Market Value.
- **FR-036**: The report UI MUST preserve readable currency and numeric formatting for large values, fractional quantities, negative gain/loss, and unknown values.
- **FR-037**: The implementation MUST use the user's provided React components as design reference once pasted into the conversation or added to the repo.

#### Export and Audit

- **FR-040**: The system MUST support exporting the Consolidated Holdings Report to CSV and XLSX using the active report filters and selected-account scope.
- **FR-041**: Exported output MUST include enough structure to distinguish aggregated parent rows from child account-level detail rows.
- **FR-042**: The system MUST audit connection, selection, sync, refresh, and export events using existing audit patterns where applicable.

### Key Entities *(include if feature involves data)*

- **Plaid Connection**: Represents a linked Plaid item for a client/user, including item id, institution metadata, encrypted access token reference, status, and timestamps.
- **Plaid Investment Account**: Represents one investment account under a connection, including Plaid account id, institution/custodian, display name, mask, type/subtype, selected status, and sync state.
- **Holdings Sync Snapshot**: Represents one sync execution with requested accounts, status, Plaid request ids, start/end timestamps, errors, and raw source payload references.
- **Source Holding**: Represents one account-level holding from Plaid or imported source data before consolidation.
- **Security Identity**: Represents normalized asset identity using available security identifiers such as CUSIP, ISIN, ticker/symbol, Plaid security id, description, type, and currency.
- **Consolidated Holding Row**: Represents the parent report row for a normalized asset across selected accounts.
- **Custodian Holding Detail Row**: Represents the child row showing each contributing account/custodian position underneath a parent row.
- **Holdings Report Filter Set**: Represents active search, account, custodian, asset type, gain/loss, sort, and pagination options.
- **Holdings Export Request**: Represents a CSV/XLSX export request for the currently scoped consolidated holdings report.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given seeded duplicate holdings across at least three custodians, 100% of duplicate symbols with matching normalized identities render as one parent row with complete child detail rows.
- **SC-002**: Given the GOOGL example with 20 shares in Brokerage A and 50 shares in Brokerage B, the parent row quantity is 70 and the child rows retain the original 20 and 50 share quantities.
- **SC-003**: At least 95% of selected investment accounts with successful Plaid holdings responses appear in the report within one refresh cycle.
- **SC-004**: Users can identify total market value, total unrealized gain/loss, selected account scope, and last sync timestamp within 30 seconds of opening the report.
- **SC-005**: Filtering by custodian, symbol, or asset type updates the visible parent/child rows and KPIs consistently in 100% of acceptance test scenarios.
- **SC-006**: CSV and XLSX exports match the UI's active filters, selected account scope, and parent/child row totals in 100% of export contract tests.

## Assumptions

- Atlas will reuse the existing Fastify API, Vite/React web app, shared TypeScript packages, auth/session middleware, RBAC, report navigation, and audit patterns.
- Plaid Investments is available for the target client institutions and will be configured through environment variables.
- Access tokens will be encrypted or stored through the repository's approved secret-storage pattern before production use.
- The current sample file `C:\Users\robert\Downloads\Stock Positions.xlsx - Source of Truth.csv` is a representative output target, not the only supported input source.
- The first implementation can use Plaid Sandbox and seeded test fixtures before live institution credentials are enabled.
- The existing report headers remain required, and additional columns such as average cost, gain/loss percent, account label, sync status, and exception badges may be added where they improve reviewability.
