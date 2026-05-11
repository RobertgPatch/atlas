# Quickstart: Consolidated Holdings Report

## Prerequisites

1. Install dependencies after implementation adds them:

```powershell
npm install
```

2. Configure API environment variables in `apps/api/.env`:

```env
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
PLAID_PRODUCTS=investments
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=
```

3. Run the API and web app:

```powershell
npm run dev:api
npm run --workspace=web dev
```

## Validation Flow

1. Sign in as an authorized Atlas user and open `/reports`.
2. Select the Holdings tab.
3. Click the connect/select accounts action.
4. Complete Plaid Link in sandbox and select at least two investment accounts.
5. Confirm the account selector shows selected accounts with custodian labels and masks when available.
6. Refresh holdings.
7. Verify report KPIs show total market value, total cost basis, total unrealized gain/loss, gain/loss percent, selected account count, and last sync timestamp.
8. Seed or connect duplicate holdings such as 20 shares of GOOGL in one account and 50 shares in another.
9. Verify one parent GOOGL row shows quantity 70 and expanding it shows the original 20-share and 50-share child rows.
10. Filter by custodian, account, type, and symbol. Confirm parent rows, child rows, and KPIs update consistently.
11. Sort by market value and unrealized gain/loss. Confirm expanded child rows remain attached to their parent rows.
12. Export CSV from the Holdings report or call `/v1/reports/consolidated-holdings/export?format=csv`. Confirm exported parent/detail rows match the active UI filters and selected account scope.

## Error and Edge Validation

- Force one account sync to fail and confirm successful accounts still render with a partial-sync warning.
- Mark a connection as needing update and confirm the UI offers reconnect/update mode.
- Seed holdings with missing cost basis and confirm totals distinguish unknown from zero.
- Seed a missing-symbol holding with CUSIP/ISIN and confirm it still consolidates with a confidence badge.
- Seed a low-confidence name-only holding and confirm it remains visible with an exception indicator.

## Test Commands

```powershell
npm run test:api -- --run reports.consolidated-holdings
npm run test:api -- --run plaid
npm run test:web -- --run ConsolidatedHoldingsReport PlaidAccountSelector
npm run build:api
npm run build:web
```
