# Quickstart: Partnership Tracker Revisions

## 1. Prerequisites

- Node.js 22+
- Repository dependencies installed with `npm install`
- Docker Desktop running
- An Atlas Admin user
- At least two owners and one partnership with several K-1 years

These revisions require PostgreSQL for owner rename/reassignment and Partnership Tracker persistence.

## 2. Start the Application

From the repository root:

```powershell
npm run dev:db
```

In separate terminals:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:15432/atlas'
npm run dev:api
```

```powershell
npm run dev:web
```

The API applies pending SQL migrations at startup. Open `http://localhost:5173`, sign in as an Admin, and select `Partnership Tracker`.

## 3. Verify Navigation and Labels

1. Open a partnership.
2. Confirm the tabs appear in this order: `Overview`, `K1 Entry`, `Capital & NAV`, `Underlying Assets`.
3. Open Underlying Assets.
4. Reload the bookmarked URL containing `area=assets`.
5. Open Add Partnership.

Expected behavior:

- The old `K-1 & Basis` label does not appear.
- Underlying Assets restores from the URL and displays a read-only coming-soon state.
- The create selector is labeled `Owner`, including empty, error, and duplicate messages.
- No incomplete underlying-asset mutation control or API request is exposed.

## 4. Verify Precise and Carried-Forward IRR

Create a deterministic performance fixture with contributions, distributions, and a unique IRR. Include a solved ratio near `0.0787`.

Expected behavior:

- The API retains at least eight ratio decimal places.
- The UI displays `7.87%`, not `8%` or `7.9%`.

Then save:

| Input | Value |
|---|---:|
| 2022 Capital contributions | $100,000.00 |
| 2023 Line 19 distributions | $10,000.00 |
| Latest NAV | $105,000.00 as of 2022-12-31 |

Expected behavior:

- IRR remains available even though the latest annual cash flow is newer than NAV.
- `latestNav.date` remains `2022-12-31`.
- IRR metadata reports a terminal date of `2023-12-31` and that NAV was carried forward for calculation.
- No new NAV history row is created.

## 5. Verify Cash-on-Cash, Unfunded, and Unrealized Metrics

Configure an inception date two years before the calculation as-of date, then use:

| Input | Value |
|---|---:|
| Paid-in capital | $100,000.00 |
| Cumulative distributions | $10,000.00 |
| Current commitment | $250,000.00 |
| Latest NAV | $135,000.00 |
| Latest ending outside basis | $120,000.00 |

Expected behavior:

- Annualized Cash on Cash Yield displays `5.00%` for a two-year active period.
- Unfunded Commitment displays `$150,000.00` and `60.00%` together.
- Unrealized Gain displays `$15,000.00`.
- NAV appears once on Overview.
- The API returns the annualization as-of date and explicit status for each metric.

Also verify:

- Missing inception makes only annualized cash-on-cash unavailable.
- Zero commitment makes unfunded percentage unavailable rather than dividing by zero.
- Paid-in above commitment produces a signed negative unfunded value.
- NAV below outside basis produces a signed negative unrealized gain.

## 6. Verify Management-Fee Proration

Under Capital & NAV, configure:

| Input | Value |
|---|---:|
| Partnership inception | 2023-08-03 |
| Annual management-fee rate | 2.00% |
| Commitment effective before inception | $1,000,000.00 |
| Calculation through | 2023-12-31 |

There are 151 inclusive active days from August 3 through December 31.

Expected behavior:

```text
$1,000,000.00 * 2.00% * 151 / 365 = $8,273.97
```

- The annual row shows 151 active days, a 365-day denominator, and `$8,273.97`.
- The cumulative total matches the annual row.
- A zero rate is valid and returns `$0.00`.
- Missing inception, fee rate, or commitment yields an explicit unavailable status.
- The displayed calculation through-date matches the request/default server date.

Repeat with a partial 2024 period and verify the denominator is 366. Add a commitment change in the middle of a year and verify each commitment base applies only to its effective segment.

## 7. Verify Split K-1 Line 13

Open K1 Entry for a year and confirm these separate fields:

- `Line 13 - Other Portfolio Deductions`
- `Line 13 - Management Fees`

Save `$3,000.00` and `$2,000.00` respectively.

Expected behavior:

- Calculation deductions include `$5,000.00` exactly once.
- Outside basis, loss limitation, Section L, book-tax, and journal entries use the same `$5,000.00` effective amount.
- Editing either field creates an append-only revision and follows existing material-change sign-off invalidation.
- Management-fee estimates do not prefill or overwrite the `$2,000.00` actual value.

For a historical fixture containing only `box_13_other_deductions = $5,000.00`:

- The calculated result remains unchanged after deployment.
- The legacy key is visible in provenance but rejected in a new write.
- Once either new key has an active revision, the two new keys are authoritative as a set and the legacy `$5,000.00` is not added again.

## 8. Verify All-Years Comparison

Use one partnership with four K-1 years and another with at least ten. Give each year distinct Capital Contributed, Distributions, and Ending Outside Basis values, including one explicit zero and one missing value.

1. Open Compare Years.
2. Confirm every year is selected initially.
3. At desktop width, inspect the four-year comparison.
4. Open the ten-year comparison and scroll to the oldest/newest columns only if the minimum readable columns exceed the available width.
5. Deselect and reselect several nonconsecutive years.
6. Repeat at narrow desktop and mobile viewport widths.

Expected behavior:

- There is no three-year limit or "up to three years" text.
- Any number from one through all available years can be displayed.
- The table shows exactly Capital Contributed, Distributions, and Ending Outside Basis; the previous Suspended Loss, Excess Distribution, Section L Difference, and Warnings rows are absent.
- The four-year desktop fixture fits in the available viewport without a horizontal scrollbar.
- The ten-year fixture scrolls horizontally only when 12rem for labels plus 8rem per year cannot fit; overflow is confined to the table.
- Metric labels remain visible while horizontally scrolling.
- Every selected year header and all three values remain reachable; the explicit zero is formatted as money and the missing value shows the unavailable placeholder.
- The year controls, table rows, values, sticky labels, and close control are not clipped, truncated, or overlapped vertically or horizontally.

## 9. Verify Owner Rename

Choose an owner that exists in PostgreSQL but is not dependent on process-local seed state.

1. Rename it from the Entities/Owners page.
2. Return to the partnership list, selected partnership, K-1 lookups, dashboards, and reports.

Expected behavior:

- The rename succeeds without `ENTITY_NOT_FOUND`.
- A normalized duplicate name returns 409 and leaves the original unchanged.
- Every view resolves the new name after mutation-driven cache refresh; no partnership edit is required.
- The audit event contains the before and after names.

## 10. Verify Owner Reassignment

1. Open Edit Partnership.
2. Confirm Owner is initialized to the current owner.
3. Select a different owner and save.
4. Inspect the partnership, both owner detail pages, K-1 years, imports, commitments, capital activity, NAV, and reports.

Expected behavior:

- The partnership ID and all child resource IDs remain unchanged.
- Every owner-scoped child row reports the new owner.
- NAV and K-1 provenance/history remain attached.
- Existing tracker-year revisions increment, workflow moves to Needs Review, and sign-offs are invalidated with reason `Partnership owner changed`.
- Source and target owner pages and all partnership/report caches refresh.
- Reassigning into a normalized partnership-name collision returns 409 with no partial move.
- A stale `expectedUpdatedAt` returns 409 with no partial move.
- An injected database failure during the child updates rolls back the partnership, child rows, sign-off invalidations, and audit event.

## 11. Read-Only and Scope Checks

Sign in as a scoped non-Admin user.

Expected behavior:

- Revised metrics, fee schedule, Compare Years, and the Underlying Assets placeholder are readable only for scoped partnerships.
- Owner rename, owner reassignment, fee configuration, and K-1 mutation controls are absent or disabled.
- Direct mutation requests return 403.
- Reassignment to an owner outside permitted scope is rejected without disclosing unrelated owner details.

## 12. Validation Commands

```powershell
$env:ATLAS_TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:15432/atlas'
npm run test:api -- partnership-performance partnership-tracker k1-tracker entities
```

```powershell
npm run test:web -- PartnershipTracker CompareYears Entity
```

```powershell
npm run build:api
npm run build:web
```

Before completion, also run the full API and web suites:

```powershell
npm run test:api
npm run test:web
```

Required automated coverage:

- eight-decimal IRR serialization and two-decimal percentage rendering
- older NAV terminal carry-forward without source mutation
- cash-on-cash annualization and missing-input states
- signed unfunded and unrealized calculations
- first-year, leap-year, current-year, and commitment-change fee segments
- legacy-only and split Line 13 compatibility with no double-counting
- additive year-summary Capital Contributed/Distributions serialization with missing-versus-zero behavior
- all-years selection, four-year no-scroll fit, conditional long-history overflow, and complete three-row visibility at desktop/mobile widths
- database-canonical owner rename and cache invalidation
- atomic owner reassignment, child-row counts, sign-off invalidation, conflict, stale token, scope, and rollback
- revised navigation labels, order, and `area=assets` restoration
