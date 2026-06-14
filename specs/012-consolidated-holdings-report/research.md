# Research: Consolidated Holdings Report

## Decision: Use Plaid Link plus Investments holdings

Use Plaid Link to create Items and the Investments product to retrieve holdings for investment-type accounts. The backend creates a `/link/token/create` token, the browser opens Link with `react-plaid-link`, the browser receives a `public_token`, and the API exchanges that public token for a server-side access token. Source: Plaid Link overview and API docs: https://plaid.com/docs/link/ and https://plaid.com/docs/api/link/

**Rationale**: Plaid documents Link as the production path for connecting accounts, and `/investments/holdings/get` returns holdings plus securities metadata for investment accounts. The holdings endpoint also supports `account_ids`, which matches the requirement to include only selected accounts. Source: https://plaid.com/docs/api/products/investments/

**Alternatives considered**:

- Manual CSV-only import: useful as a fallback but does not satisfy connected-account selection or refresh.
- Accounts/balances endpoints only: insufficient because they provide account-level balances, not position-level securities.
- Investment transactions as the primary source: useful later for lots/activity, but holdings are the correct source for current positions.

## Decision: Add official Plaid packages

Add `plaid` 42.2.0 to `apps/api` and `react-plaid-link` 4.1.1 to `apps/web`.

**Rationale**: `npm view` confirmed current package versions on 2026-05-11. Plaid's web docs describe the React hook shape (`usePlaidLink`) and the official Node package provides typed request/response models for endpoints used by this feature. Source: https://plaid.com/docs/link/web/

**Alternatives considered**:

- Handwritten REST calls with `fetch`: workable, but loses generated types and creates more request-shaping code.
- Direct Plaid script integration without React wrapper: possible, but the existing app is React and the wrapper aligns with current component patterns.

## Decision: Store raw snapshots and normalized holdings separately

Persist Plaid response snapshots or raw payload references per sync, then map them into source holdings and consolidated report rows.

**Rationale**: Financial report calculations need auditability. Raw snapshots allow comparison against Plaid responses, while normalized holdings make filtering, sorting, export, and deterministic rollups simpler.

**Alternatives considered**:

- Query Plaid live on every report load: simpler initially, but slow, rate-sensitive, hard to audit, and fragile when an institution is unavailable.
- Store only consolidated rows: hides the custodian/account provenance required by nested detail rows.

## Decision: Normalize assets by strongest available identity

Identity order: CUSIP/ISIN when available, then Plaid `security_id` plus institution security metadata, then uppercase ticker/symbol plus currency/type, then normalized name/type fallback with low confidence.

**Rationale**: Plaid security data can include CUSIP, ISIN, ticker symbol, type, currency, and security id. Plaid notes that the same security id is typically stable but not guaranteed across institutions, so the consolidation algorithm should prefer market identifiers where available and mark fallback confidence when not. Source: https://plaid.com/docs/investments/

**Alternatives considered**:

- Ticker-only consolidation: matches the user's example but can incorrectly merge different share classes, exchanges, currencies, options, or similarly named securities.
- Plaid security id only: easy for one institution but not guaranteed to identify the same security across all institutions.

## Decision: Parent rows aggregate totals and child rows preserve source facts

Parent rows sum quantity, known cost basis, known unrealized gain/loss, and known market value. Average per-unit cost basis is calculated as total known cost basis divided by total known quantity. Child rows retain exact custodian/account holding values.

**Rationale**: The report must answer "what do we own in total?" and "where is it held?" in one view. Keeping child rows underneath the parent row preserves explainability when cost basis or gain/loss differ by brokerage.

**Alternatives considered**:

- Only parent rows: too opaque for client/advisor review.
- Only brokerage rows: fails the consolidation requirement and forces manual rollup.

## Decision: Extend existing reports export pipeline

Use existing reports export infrastructure with a new `consolidated_holdings` report type and add parent/detail row markers in CSV/XLSX.

**Rationale**: The repository already has `reports.export.ts`, `exceljs`, contract tests, and report client patterns. Reusing that surface keeps exports consistent and avoids a second export stack.

**Alternatives considered**:

- Browser-generated exports: leaks too much formatting/business logic into the web app and cannot reliably include server-authoritative data.
- Separate export module: unnecessary duplication for one report.
