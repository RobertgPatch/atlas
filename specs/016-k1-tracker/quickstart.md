# Quickstart: Partnership Tracker

## 1. Prerequisites

- Node.js 22+
- npm dependencies installed from the repository root
- Docker Desktop running for durable PostgreSQL tests
- An Atlas Admin user and at least one entity

Partnership Tracker v1 uses manual K-1 entry. No workbook, PDF, OCR, Azure, AWS, or model credential is required.

## 2. Start the Application

From the repository root:

```powershell
npm run dev:db
```

In separate terminals:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/atlas'
npm run dev:api
```

```powershell
npm run dev:web
```

Open the web app and sign in as an Admin. Select `Partnership Tracker` from the navigation.

## 3. Verify Consolidated Navigation

Expected behavior:

1. The navigation contains `Partnership Tracker` once.
2. Separate `Partnerships` and `K1 Tracker` navigation items are absent.
3. `/partnership-tracker` loads the consolidated page.
4. `/partnerships` redirects to `/partnership-tracker`.
5. `/partnerships/{partnershipId}` redirects with that partnership selected.
6. `/k1-tracker` redirects while preserving supported `partnershipId` and `taxYear` selection.

## 4. Create a Partnership

1. Choose `Add Partnership`.
2. Select the owning entity.
3. Enter a unique name.
4. Select one supported Partnership Type:
   - Private Equity
   - Real Estate
   - Hedge Fund
   - Venture Capital
   - Credit
   - Infrastructure
   - Other
5. Save.

Expected behavior:

- The partnership is Active by default.
- It becomes the selected partnership without a page change.
- The overview shows empty current commitment, paid-in, distributions, NAV, outside-basis, and return-metric states without substituting zero for missing data.
- `Add K-1 Year` is the recommended next step.
- A duplicate normalized name within the same entity produces an inline conflict instead of a second record.

## 5. Add Manual K-1 Years

1. Choose `Add K-1 Year`.
2. Enter any unused year from 1900 through 2100; use a noncurrent year to verify that the value is not auto-incremented.
3. Select the year and use the inline annual form on the K-1 & Basis page.
4. Enter the opening, Capital contributions, K-1 boxes, liability, Section L, and book-value fields without changing category tabs.
5. Preview calculations and save.
6. Add a nonconsecutive later year and inspect offered carryforwards.

Expected behavior:

- Missing values remain blank/null and do not silently become zero.
- One selected year is expanded at a time, and every editable field for that year is present on the same continuous page.
- There is no annual Back button, Next button, step tablist, category tablist, or editor drawer.
- `Capital contributions` appears once; there is no separate editable `Section L contributions` value.
- Income/loss/decrease signs are explained.
- Calculation preview uses exact amounts and displays basis, loss, distribution, reconciliation, and journal effects below the form.
- Liability balances remain visible and carry forward, but their changes do not alter basis, distributions, warnings, workflow status, or sign-off.
- Later-year opening values identify their carryforward source.
- No Excel import, PDF upload, OCR, or automatic-source action appears.

## 6. Verify Committed-Capital History

Record these effective-dated total amounts:

| Effective date | Amount |
|---|---:|
| 2022-01-01 | $1,000,000.00 |
| 2023-06-01 | $1,500,000.00 |
| 2022-09-01 | $1,200,000.00 |

Expected behavior:

- All three entries remain in chronological history.
- The current committed capital is `$1,500,000.00`.
- An as-of view on 2023-01-01 resolves to `$1,200,000.00`.
- Inserting the backdated entry does not overwrite the 2023 entry.
- Correcting an entry with a current concurrency token succeeds and is audited.
- Repeating a correction with a stale token returns 409 and does not overwrite the latest value.

## 7. Verify NAV History and Plot

Record these NAV entries:

| Valuation date | NAV |
|---|---:|
| 2023-03-31 | $850,000.00 |
| 2023-09-30 | $930,000.00 |
| 2024-03-31 | $910,000.00 |
| 2024-12-31 | $1,040,000.00 |

Expected behavior:

- Both 2023 observations appear as distinct chart points.
- Points use actual dates on the horizontal scale and appear in chronological order.
- The overview shows `$1,040,000.00` as of 2024-12-31.
- Exact date/value pairs are keyboard discoverable and present in the accompanying table.
- Submitting another entry for 2023-09-30 returns a duplicate-date conflict and directs the user to edit that entry.
- A one-point series and an all-zero series render without misleading axes or runtime errors.

## 8. Verify Overview Aggregates

Create or edit two K-1 years so the active values include:

| Tax year | Capital contributions | Box 19 distributions |
|---|---:|---:|
| 2021 | $3,000,000.00 | $0.00 |
| 2022 | $0.00 | $190,773.00 |

Use latest NAV `$3,000,000.00` on `2022-12-31`. Enter visibly different beginning and ending liability balances in either year.

Expected behavior:

- Overview Paid-in capital is `$3,000,000.00` and cumulative Distributions is `$190,773.00`.
- DPI is `0.06x` and TVPI is `1.06x` at two-decimal display precision.
- IRR is approximately `6.4%` for the documented dated cash-flow series.
- Latest Section L capital, latest outside basis, and NAV are displayed as separate values.
- Liability changes do not alter any of these figures.
- A zero paid-in denominator returns unavailable DPI/TVPI; missing NAV returns unavailable TVPI/IRR with an explicit status.
- A legacy year containing only `section_l_capital_contributed` projects once into Capital contributions. Equal or conflicting duplicate keys are never summed.

## 9. Verify Reconciliation and Sign-off

For a manually completed year:

1. Review Outside Basis.
2. Confirm loss and distribution limitation behavior.
3. Review reference-only liabilities and Section L component differences.
4. Confirm journal entries balance within $1.
5. Sign off the passing year as the logged-in CPA.
6. Change a material value in an earlier year.

Expected behavior:

- An incomplete or warning-producing year cannot become Reconciled.
- A passing year records the signer identity, time, and signed revision, then becomes Reconciled.
- The earlier-year change recalculates dependent years and invalidates materially affected sign-off.
- Commitment and NAV edits do not invalidate tax workpaper sign-off. Liability edits remain auditable but do not change calculated warnings or sign-off gates.

## 10. Verify Read-only Access

Sign in as a scoped non-Admin user.

Expected behavior:

- Only partnerships within the user's entity scope appear.
- Overview, K-1 details, commitment history, NAV plot, and accessible table are readable.
- Add, edit, delete, calculate-save, and sign-off controls are absent or disabled.
- Direct mutation requests return 403.

## 11. Focused Validation Commands

```powershell
$env:ATLAS_TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/atlas'
npm run test:api -- partnership-tracker
```

```powershell
npm run test:web -- PartnershipTracker
```

```powershell
npm run build:api
npm run build:web
```

The focused tests should cover:

- partnership creation, duplicate detection, edit, and scope
- controlled Partnership Type values
- create-to-first-year workflow and arbitrary manual years
- absence of v1 import/extraction endpoints and controls
- exact manual field revisions and stale-write rejection
- one-page all-field entry with no Back/Next, step tabs, category tabs, or editor drawer
- canonical contribution projection and duplicate-key conflict behavior
- liability exclusion from basis, distributions, warnings, sign-off, and performance metrics
- cumulative contribution/distribution totals plus DPI, TVPI, IRR, and unavailable states
- carryforwards and earlier-year invalidation
- commitment effective-date/backdating behavior
- multiple same-year NAV observations and exact-date conflicts
- NAV SVG ordering, point access, table equivalence, and empty/one-point/zero-series states
- legacy route redirects
- Admin mutation and scoped read authorization
- restart persistence against PostgreSQL

### Revised implementation validation record (2026-07-13)

- `npm run test:api -- partnership-tracker k1-tracker` passed 25 files, 65 tests, with 2 intentional skips against durable PostgreSQL.
- The full web suite passed all 42 files and 114 tests, including the single-page K-1 entry, currency fields, commitment/NAV dialogs, client serialization, Overview, accessibility, navigation, and sign-off coverage.
- `npm run build:api`, `npm run build:web`, and ESLint scoped to the revised web files passed. The production web build reports only its existing large-bundle advisory.
- The local application started successfully at `http://localhost:5173` with API health at `http://localhost:3000/health`. Interactive browser inspection could not run because the in-app browser surface is unavailable in this session; no alternate browser backend was substituted.
- Automated coverage exercises one-page annual entry, canonical contribution compatibility, liability-free calculations, aggregates and unavailable states, dated IRR, exact money serialization, commitment/NAV input validation, sign-off behavior, authorization, and durable persistence.

## 12. V2 Boundary Check

Do not add a PDF upload control to satisfy a v1 test. V2 will add:

```text
PDF -> extraction candidates -> confidence/validation -> human review -> effective tracker revisions
```

It must reuse the existing partnership ID, tax year, field keys, revision history, source references, and calculation engine established by this release.
