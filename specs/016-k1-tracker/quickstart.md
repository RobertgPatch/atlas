# Quickstart: K1 Tracker

This walkthrough validates the planned feature end to end. It assumes the implementation tasks generated from this plan are complete.

## 1. Start Atlas with durable PostgreSQL

```powershell
npm run dev:db
npm run dev:api
npm run dev:web
```

Confirm API startup applies `018_k1_tracker.sql` and does not report an in-memory tracker storage mode. K1 Tracker must refuse production startup or mutations if PostgreSQL is unavailable; it must never fall back to browser or process memory.

## 2. Sign in and verify navigation

1. Sign in as a scoped User.
2. Confirm `K1 Tracker` is visible in the AppShell.
3. Open `/k1-tracker`.
4. Confirm partnership search returns only partnerships in the user's entity scope.
5. Confirm the User can view tracker years but cannot see import, add, edit, delete, override, or sign-off actions.
6. Sign in as Admin and confirm those actions are present.

Expected result: K1 Tracker is separate from the existing `/k1` processing queue, and direct URL access enforces the same scope/role behavior as the UI.

## 3. Import the CPA-approved reference workbook

Use `apps/api/tests/fixtures/k1-tracker-basis-template.xlsx`, the CPA-approved supplied workbook fixture. It preserves the source labels, populated 2021-2025 inputs, formula-only 2026-2030 columns, and known formula defects.

1. Select the fixture's target partnership.
2. Choose **Import workbook** and upload the file.
3. In preview, verify:
   - one supported sheet is detected;
   - 2021-2025 are `POPULATED`;
   - 2026-2030 are `FORMULA_ONLY` or `BLANK`, not complete;
   - source cells are shown for mapped values;
   - the workbook's calculated-net-income and status defects appear as warnings, not imported authority;
   - no tracker year has been created yet.
4. Choose `MERGE` for 2021-2025 and skip 2026-2030.
5. Commit.

Expected result: all five years commit in one transaction. A forced validation/database failure leaves zero partial years. Repeating the identical commit is idempotent.

## 4. Verify golden rollforward values

Open the imported partnership and move through the year rail. Confirm ending outside basis within $1:

| Tax year | Ending outside basis |
|---|---:|
| 2021 | $1,932,344 |
| 2022 | $1,684,727 |
| 2023 | $1,376,978 |
| 2024 | $1,144,214 |
| 2025 | $695,823 |

For each year:

- source values link to workbook sheet/cells;
- beginning basis follows the prior ending basis after the inception year;
- liability categories carry forward independently;
- missing is not displayed as zero;
- only the selected tab is expanded;
- zero line items can be revealed but do not dominate the default view.

## 5. Verify the known workbook defects are corrected

For 2021:

1. Open **Section L & Book-Tax**.
2. Confirm the $3,000,000 capital contribution appears in contributions, not calculated net income.
3. Confirm calculated net income/loss excludes contributions, distributions, and liability changes.
4. Introduce a component variance over $1 while leaving ending book-tax unexplained variance at zero.
5. Confirm the year becomes `NEEDS_REVIEW`; it must not remain `RECONCILED`.
6. Clear required source fields and confirm the year becomes incomplete rather than `OK`.

## 6. Verify loss, distribution, and liability behavior

Create a synthetic later year with:

- prior suspended losses;
- enough new basis to allow some prior loss;
- distributions plus liability relief near and then above available basis;
- nonrecourse, qualified nonrecourse, and recourse changes.

Confirm:

- current and prior loss/deduction categories are visible;
- insufficient basis is allocated proportionately under the default IRS worksheet calculation version;
- unused losses remain suspended by category and in aggregate;
- liability increase raises basis and liability decrease participates in the distribution decrease;
- taxable excess distribution is surfaced separately;
- ending outside basis never falls below zero;
- a transaction-specific CPA calculation version is visibly identified if selected.

The default calculation should remain aligned with the current [IRS Partner's Instructions for Schedule K-1 (Form 1065)](https://www.irs.gov/instructions/i1065sk1); workbook-specific departures must be named and acceptance-tested.

## 7. Verify finalized K-1 source sync and conflicts

1. Finalize an unsuperseded K-1 containing mapped income, capital, and liability fields.
2. Open the partnership tracker.
3. Confirm missing tracker fields are filled with `FINALIZED_K1` provenance and link to the document/review field.
4. Create a different workbook/manual value, then sync an amended K-1.
5. Confirm the difference creates a source conflict instead of silently overwriting the active value.
6. Resolve it as Admin with a reason.
7. Restart the API and confirm the selected source, prior revision, conflict resolution, and audit history remain.

## 8. Verify guided edit, concurrency, and downstream invalidation

1. Add the year after the current latest year.
2. Confirm beginning basis, beginning liabilities, Section L beginning capital, and suspended losses are prefilled as carryforwards with source labels.
3. Edit an early year in one browser session.
4. Attempt a stale save from another session and confirm a `409` conflict with the current revision.
5. Confirm later years recalculate and any prior sign-off becomes invalid.
6. Attempt to close an unsaved editor and confirm the discard warning and focus behavior.

## 9. Verify journal entries and sign-off

1. Enter book interest, dividends, realized gains/losses, and other partnership income.
2. Open **Journal Entries** and confirm the four tax-versus-book adjustments and balancing Investment in Partnership entry.
3. Confirm debit-positive/credit-negative labeling and the copied account/amount format.
4. Confirm the journal check sums to zero within $1.
5. Enter Section 704(c), Section 754, timing, and permanent differences and confirm unexplained variance.
6. Verify a failed component check, unresolved conflict, incomplete source, or unbalanced journal prevents reconciliation/sign-off.
7. Prepare as one Admin and review as a different Admin.
8. Change a material input and confirm both sign-offs are invalidated.

## 10. Verify compact and accessible UI behavior

Seed one partnership with 50 tax years.

- The partnership becomes usable within 2 seconds under normal staging conditions.
- Any year is reachable in no more than three interactions.
- The primary page does not render a 50-column table or 50 expanded year cards.
- Comparison allows at most three years and has sticky labels/headers when scrolling is needed.
- Keyboard-only users can operate partnership search, year rail, tabs, import dialog, edit drawer, warnings, source links, and sign-off.
- Dialog focus is trapped and returned; Escape/scrim behavior does not discard unsaved work without confirmation.
- Loading, empty, filtered-empty, error, restricted, preview, failure, conflict, and populated states are readable.

## 11. Run focused verification

```powershell
npm run test:api -- k1-tracker
npm run test:web -- k1-tracker
npm run build:api
npm run build:web
```

Required test groups:

- golden workbook calculation and defect regression;
- IRS worksheet ordering and pro-rata suspended-category allocation;
- workbook preview mapping, blank future years, conflicts, idempotency, and atomic rollback;
- scoped reads and Admin-only writes;
- restart-safe persistence and annual-summary projection;
- finalized/amended K-1 sync and source conflict resolution;
- stale revision handling and downstream sign-off invalidation;
- 50-year navigation, progressive disclosure, responsive behavior, and accessibility.

## Validation caveats

- The CPA approved the supplied workbook as the regression fixture without a
  sanitization requirement. The fixture is tracked at
  `apps/api/tests/fixtures/k1-tracker-basis-template.xlsx` and its SHA-256 is
  recorded in the expected-value JSON file.
- Focused API persistence/import/source-sync checks require
  `ATLAS_TEST_DATABASE_URL` to point to PostgreSQL. They were executed against
  the local Atlas PostgreSQL container during implementation.
- Repository-wide web lint currently reports unrelated legacy violations outside
  `features/k1-tracker`; tracker-scoped lint and both production builds pass.
