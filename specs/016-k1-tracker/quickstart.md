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
- The overview shows empty current commitment, NAV, and K-1 states.
- `Add K-1 Year` is the recommended next step.
- A duplicate normalized name within the same entity produces an inline conflict instead of a second record.

## 5. Add Manual K-1 Years

1. Choose `Add K-1 Year`.
2. Enter any unused year from 1900 through 2100; use a noncurrent year to verify that the value is not auto-incremented.
3. Open the manual editor.
4. Enter the relevant K-1, liability, Section L, and book-value fields.
5. Preview calculations and save.
6. Add a nonconsecutive later year and inspect offered carryforwards.

Expected behavior:

- Missing values remain blank/null and do not silently become zero.
- One selected year is expanded at a time.
- Income/loss/decrease signs are explained.
- Calculation preview uses exact amounts and displays basis, loss, distribution, reconciliation, and journal effects.
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

## 8. Verify Reconciliation and Sign-off

For a manually completed year:

1. Review Outside Basis.
2. Confirm loss and distribution limitation behavior.
3. Review liabilities and Section L component differences.
4. Confirm journal entries balance within $1.
5. Complete preparer and reviewer sign-off.
6. Change a material value in an earlier year.

Expected behavior:

- An incomplete or warning-producing year cannot become Reconciled.
- A passing year records the identities, times, and reviewed revision.
- The earlier-year change recalculates dependent years and invalidates materially affected sign-off.
- Commitment and NAV edits do not invalidate tax workpaper sign-off because they are not calculation inputs in v1.

## 9. Verify Read-only Access

Sign in as a scoped non-Admin user.

Expected behavior:

- Only partnerships within the user's entity scope appear.
- Overview, K-1 details, commitment history, NAV plot, and accessible table are readable.
- Add, edit, delete, calculate-save, and sign-off controls are absent or disabled.
- Direct mutation requests return 403.

## 10. Focused Validation Commands

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
- carryforwards and earlier-year invalidation
- commitment effective-date/backdating behavior
- multiple same-year NAV observations and exact-date conflicts
- NAV SVG ordering, point access, table equivalence, and empty/one-point/zero-series states
- legacy route redirects
- Admin mutation and scoped read authorization
- restart persistence against PostgreSQL

### Implementation validation record (2026-07-12)

- The combined durable API run `npm run test:api -- partnership-tracker k1-tracker partnerships` passed 33 files and 92 tests, with 2 intentional skips.
- The focused Partnership Tracker web run passed 12 files and 20 tests.
- `npm run build:api`, `npm run build:web`, and lint scoped to the Partnership Tracker feature, route shell, and page passed. The repository-wide web lint command still reports pre-existing violations in unrelated legacy feature files; no reported violation is in a T087-owned path.
- Automated coverage exercises all v1 workflows above, including arbitrary years, stale writes, earlier-year invalidation, effective-dated commitments, multiple NAV observations per year, entity scope, restart persistence, and the absence of upload/extraction endpoints.
- Interactive browser verification is still pending because the installed in-app browser plugin is incomplete: its required `scripts/browser-client.mjs`, `docs/browser-safety.md`, and `docs/bootstrap-troubleshooting.md` files are absent. No alternate browser automation was substituted, per that plugin's safety instructions.
- The intentional compatibility boundary remains unchanged: legacy data and APIs stay readable, old routes redirect into Partnership Tracker, and Excel/PDF/OCR controls are not exposed in v1.

## 11. V2 Boundary Check

Do not add a PDF upload control to satisfy a v1 test. V2 will add:

```text
PDF -> extraction candidates -> confidence/validation -> human review -> effective tracker revisions
```

It must reuse the existing partnership ID, tax year, field keys, revision history, source references, and calculation engine established by this release.
