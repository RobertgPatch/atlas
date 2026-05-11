# Quickstart - Reports Phased Delivery

Validation walkthrough for Feature 006 in the requested implementation sequence:

1. Portfolio Summary first
2. Asset Class Summary next
3. Activity Detail and full export last

## 0. Prerequisites

- Feature branch: `011-reports-phased-delivery`
- Seeded users:
  - `admin@atlas.com` (Admin)
  - `user@atlas.com` (User)
- Seeded entity and partnership data exists
- If running with PostgreSQL, migrations are applied through current feature scope

## 1. Start API and web apps

```powershell
# Terminal A
cd d:\Projects\atlas\apps\api
npm run dev

# Terminal B
cd d:\Projects\atlas\apps\web
npm run dev
```

Sign in and navigate to `/reports`.

## 2. Phase 1 validation - Portfolio Summary

### 2.1 Core render and states

1. Open Reports and ensure Portfolio Summary is the default view.
2. Verify header title/subtitle and visible Export action.
3. Verify KPI cards:
   - Total Commitment
   - Total Distributions
   - Weighted IRR
   - Weighted TVPI
4. Validate table states:
   - Loading skeleton
   - Empty state
   - Populated state
5. Validate sticky totals row while scrolling.

### 2.2 Filters and formatting

1. Use search, date range, and entity type filters.
2. Confirm rows and totals recalculate under active filters.
3. Clear filters and confirm baseline totals restore.
4. Verify currency, percentage, and multiple formatting consistency.

### 2.3 Inline edit and undo

1. Sign in as Admin.
2. Edit an eligible `Original Commitment` cell.
3. Confirm immediate save feedback and recalculated totals.
4. Trigger Undo.
5. Confirm value and totals return to prior state.
6. Save a second edit and confirm undo now applies only to the most recent successful save.
7. Refresh the page and confirm prior undo availability is cleared.
8. Verify audit event recorded for save and undo.

### 2.4 Stale conflict handling

1. Open the same Portfolio Summary row in two sessions.
2. Save a commitment edit in session A.
3. Attempt to save from stale session B.
4. Confirm save is rejected with conflict messaging and a refresh action.
5. Confirm the latest stored value remains authoritative.

### 2.5 Export placeholder behavior (Phase 1)

1. Click Export.
2. Confirm non-blocking informational feedback indicates CSV/XLSX availability in Phase 3.
3. Confirm no file is generated in Phase 1.

### 2.6 Role behavior

1. Sign in as User.
2. Confirm report reads are available.
3. Confirm inline edit actions are hidden or blocked.

## 3. Phase 2 validation - Asset Class Summary

1. Switch to Asset Class Summary report view.
2. Verify grouped rows by asset class using same metric columns and totals model.
3. Reuse the same filters and confirm grouped results update consistently.
4. Validate loading, empty, and populated states.
5. Confirm weighted metrics (`DPI`, `RVPI`, `TVPI`, `IRR`) show `N/A` when all grouped inputs are undefined.
6. Confirm weighted metrics exclude undefined groups and still compute from defined groups.
7. Click Export and confirm Phase 3 informational placeholder appears and no file is generated.

## 4. Phase 3 validation - Activity Detail and exports

### 4.1 Activity Detail report

1. Switch to Activity Detail report view.
2. Verify rows are keyed by `(entity, partnership, tax year)`.
3. Validate expected columns:
   - Beginning Basis
   - Contributions
   - Interest
   - Dividends
   - Cap Gains
   - Remaining K-1
   - Total Income
   - Distributions
   - Other Adjustments
   - Ending Tax Basis
   - Ending GL Balance
   - Book-To-Book Adjustment
   - K-1 Capital Account
   - K-1 vs Tax Difference
   - Excess Distribution
   - Negative Basis
   - Ending Basis
   - Notes
4. Edit an allowed field inline and confirm immediate persistence.
5. Trigger Undo and confirm one-step restoration.

### 4.2 Export completion

1. For each report (`portfolio_summary`, `asset_class_summary`, `activity_detail`), request both CSV and XLSX exports with active filters.
2. Confirm output rows match current filtered UI rows and ordering.
3. Confirm file headers and key columns are valid.
4. Force an export failure scenario and verify actionable error feedback without route loss.

## 5. Negative checks

1. Attempt inline edit as non-Admin and verify denial.
2. Submit invalid numeric input (negative or non-numeric where disallowed) and verify inline validation.
3. Simulate stale write conflict and verify user-facing refresh guidance.
4. Validate undefined weighted metrics render as `N/A`.

## 6. Suggested targeted test commands

```powershell
# API focused reports contract/integration suite (example naming)
cd d:\Projects\atlas\apps\api
npm test -- tests/reports.portfolio-summary.contract.test.ts
npm test -- tests/reports.asset-class-summary.contract.test.ts
npm test -- tests/reports.activity-detail.contract.test.ts
npm test -- tests/reports.inline-edit.integration.test.ts
npm test -- tests/reports.export.contract.test.ts

# Web report UI behavior tests
cd d:\Projects\atlas\apps\web
npm test -- src/features/reports/components/PortfolioSummaryReport.test.tsx
npm test -- src/features/reports/components/AssetClassSummaryReport.test.tsx
npm test -- src/features/reports/components/ActivityDetailReport.test.tsx
```

## 7. Success criteria mapping

- Phase 1 checks map to SC-001, SC-002, SC-003.
- Phase 2 checks map to SC-004.
- Phase 3 checks map to SC-005, SC-006.
