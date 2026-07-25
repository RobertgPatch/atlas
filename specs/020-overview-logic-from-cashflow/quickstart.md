# Quickstart: Cash-Flow-Sourced Overview and Private Investment Tracker

## Prerequisites

- Node.js 22+
- npm workspace dependencies installed
- PostgreSQL available through `ATLAS_TEST_DATABASE_URL` for integration tests
- Current branch: `020-overview-logic-from-cashflow`

Start local infrastructure when needed:

```powershell
npm run dev:db
```

## 1. Prove K-1 Is No Longer an Investment Fallback

Create one scoped partnership with:

- K-1 capital contributions of `900000.00`
- K-1 distributions of `400000.00`
- one Net Cash Activity capital call of `100000.00`
- one non-recallable distribution of `10000.00`
- latest NAV of `120000.00`
- current commitment of `250000.00`

Expected operational Overview:

- Total invested: `100000.00`
- Non-recallable distributions: `10000.00`
- Remaining commitment: `150000.00`
- DPI: `0.10000000`
- TVPI: `1.30000000`

Edit only the K-1 values and refresh. Every value above must remain unchanged. Delete the Net Cash Activity rows; totals must become known zero/unavailable according to the contract and must not become `900000.00` or `400000.00`.

## 2. Verify Recallable Distribution Treatment

Starting with commitment `250000.00` and calls `100000.00`, add a recallable distribution of `25000.00`.

Expected:

- the linked effective commitment snapshot becomes `275000.00`
- Remaining commitment becomes `175000.00`
- Recallable distributions becomes `25000.00`
- non-recallable distributions, DPI, and TVPI numerators remain unchanged
- XIRR includes the `25000.00` positive dated flow

Delete the recallable distribution. The linked commitment increase must reverse and no stale snapshot may remain active.

## 3. Verify Real NAV and Missing States

With calls but no NAV:

- Latest Valuation is unavailable
- TVPI is unavailable with `MISSING_NAV`
- XIRR is unavailable with `MISSING_NAV`
- the system does not substitute total invested or K-1 ending capital

Add two NAV entries on different dates. The most recent eligible entry and its real valuation date must drive Overview and Private Investment Tracker.

## 4. Verify Entity-Fund Position Identity

Create two entities that each own a record for the same named fund and one entity that owns a second fund.

Open:

```text
/private-investment-tracker
```

Expected:

- one summary row per entity + partnership ID
- the same fund name appears separately for its two owners
- calls, distributions, commitments, NAV, and ratios never cross owners
- `aggregation_group_id` does not collapse the rows

## 5. Verify Unified Detail Rows

For a single entity-fund position add:

- capital call on 2026-01-15
- non-recallable distribution on 2026-03-01
- recallable distribution on 2026-03-01
- NAV on 2026-04-30

Expected detail types:

- `CAPITAL_CALL`
- `NON_RECALLABLE_DISTRIBUTION`
- `RECALLABLE_DISTRIBUTION`
- `VALUATION`

The NAV row is a point-in-time value, not a cash inflow. Rows order newest first with deterministic same-day ties. Commitment history does not appear as a fifth detail type.

## 6. Verify Filters and Top Membership

Exercise type, entity, fund, date-from/date-to, and amount-min/amount-max individually and in combination.

Verify:

- values within a multi-select category use OR
- categories use AND
- date bounds are inclusive
- amount uses positive magnitude, so a `1750.00` call and distribution both match `amountMin=1750.00&amountMax=1750.00`
- reversed ranges show validation feedback
- URL refresh and browser Back restore normalized filters
- page resets to 1 after a filter change
- top rows equal the distinct entity-partnership pairs in the complete filtered ledger, not only the current page

Then filter to distributions only. The matching top positions must remain, but their Total Invested, DPI, and TVPI must still use complete lifetime activity. The page must label this as lifetime metrics for filtered positions.

## 7. Verify Workbook-Aligned Metrics

For each position, compare:

- Entity and Fund
- Asset Class and Status
- Total Committed and Remaining Commitment
- Vintage Year from earliest call
- Total Invested
- Non-Recallable and Recallable Distributions
- Latest Valuation and date
- DPI and TVPI
- exact XIRR availability/value
- simplified return fallback

Money must stay exact to cents. Missing must not render as `$0`. Negative remaining commitment must retain its sign.

## 8. Verify PDF Export

Apply filters that produce more than one detail page. Open the PDF dialog, choose a nondefault ordered subset of summary and detail columns, and export.

Verify:

- response is `application/pdf`
- filename is `private-investment-tracker-YYYY-MM-DD.pdf`
- file begins with valid PDF bytes
- every matching position and detail row is present, not only the visible page
- only selected columns appear and in selected order
- report includes generated time, active filters, as-of date, and lifetime-summary explanation
- summary table precedes detail table
- landscape pages repeat headers and do not clip accounting values
- page numbers and continuation behavior are visible
- an out-of-scope entity/fund cannot be exported by editing the request

## 9. Verify Navigation and Default Landing

Test:

- successful login -> `/private-investment-tracker`
- authenticated `/dashboard` -> `/private-investment-tracker`
- navbar shows `Private Investment Tracker` and its active state
- direct links to Partnership Tracker, TIC Registry, Entities, and Liquidity remain at their requested destination
- sign-out and unauthenticated protection are unchanged

## 10. Accessibility and Responsive QA

At 1440px, 1024px, 768px, and 390px:

- no page-level horizontal overflow
- each table owns any necessary horizontal scroll
- sticky identity cells do not cover focus or content
- autocomplete inputs announce list, selection, and no-results state
- date and amount controls have visible labels and error association
- result counts update through a polite live region
- export dialog traps/restores focus and has sticky actions
- all targets are at least 44px
- reduced motion disables nonessential movement

## 11. Performance and Regression Commands

Run focused tests:

```powershell
npm exec --workspace=api -- vitest run tests/private-investment-tracker.test.ts tests/private-investment-tracker.integration.test.ts tests/private-investment-tracker.authz.integration.test.ts tests/private-investment-tracker.pdf.test.ts tests/private-investment-tracker.pdf.contract.test.ts tests/private-investment-tracker.performance.integration.test.ts --maxWorkers=1 --fileParallelism=false
npm exec --workspace=web -- vitest run PrivateInvestmentTracker
```

Run full verification:

```powershell
npm run test:api
npm run test:web
npm run build:api
npm run build:web
```

The PostgreSQL performance fixture must cover 500 positions and 10,000 activity/valuation rows, complete in under two seconds for the read response, issue no per-position query loop, and capture the query plan for index review.

## 12. Verification Record — 2026-07-23

Implementation verification completed on branch `020-overview-logic-from-cashflow`:

- Focused Private Investment Tracker API: 12 passed; 5 durable tests skipped when no database URL was supplied.
- Serialized PostgreSQL feature matrix against an isolated temporary database: 59 passed. This includes K-1 source-policy disagreement, authorization, filter/pagination behavior, 500 positions, 10,000 ledger rows, two set-based read queries, `EXPLAIN (ANALYZE, BUFFERS)`, and complete PDF rendering. The read-time assertion passed at under two seconds; no additional migration was required.
- Focused Private Investment Tracker web: 17 passed.
- Full API without a durable URL: 323 passed; 63 durable tests skipped as designed.
- Full web: 195 passed.
- `npm run build:api`: passed.
- `npm run build:web`: passed. Vite retained its existing warning that the main application chunk exceeds 500 kB.
- Targeted ESLint for all new/changed Private Investment Tracker production and regression files: passed.

The durable feature files are intentionally executed serially against a dedicated temporary database. A single parallel run of every legacy API file with a database URL is not a valid isolation mode for this repository: older Admin-scope fixtures share global rows and several in-memory contract suites intentionally change behavior when a database URL is present.

Automated responsive/accessibility coverage exercises 1440, 1024, 768, and 390 pixel structures, local table overflow, sticky identities/actions, 44-pixel primary targets, live regions, labeled controls, keyboard autocomplete selection, reduced-motion classes, and focus-managed PDF actions. The OpenAPI and plan as-built audit records the normalized out-of-scope selection and nullable PDF-filter behavior.
