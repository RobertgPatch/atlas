# User Story 1 Evidence — Initial Statement Families

Date: 2026-09-28

All evidence below used synthetic fixtures and loopback-only PostgreSQL/object
storage. No production flag, data, account, or deployment was used.

## Golden adapters

- Merrill CSV: 2 accounts, 6 positions. The primary account contains a $200
  equity plus $35, $80, and $5 cash/cash-like rows; the secondary account
  contains $100 fund and $9 non-cash price-one rows. Leading-zero identifiers,
  both known Merrill cash labels, and absent totals remain covered.
- Charles Schwab CSV: 1 masked account, 6 positions, and a complete-account
  market-value control of $1,525. Two rows with the same symbol remain distinct
  source lots while downstream reporting rolls them up compatibly.
- Morgan Stanley XLSX: 1 masked account, 8 positions, a complete market-value
  control of $3,280, and partial controls of $2,320 original cost, $1,800
  adjusted cost, and $400 gain. Adjusted cost takes precedence, with Total Cost
  used only when adjusted cost is unavailable.

The adapter suites validate exact typed fields, row/sheet disposition, account
identity quality, source locations, confirmed cash handling, non-cash price-one
handling, basis availability, percentage interpretation, and control scope.

## Monthly replacement and history

The real-DB three-format monthly journey publishes and reloads Merrill CSV,
Schwab CSV, and Morgan Stanley XLSX snapshots through the shared pipeline. For
each family it verifies:

- August publication: $1,250 value, $1,000 basis, $250 gain.
- September replacement: $1,100 value, $820 basis, $280 gain, two assets.
- Historical snapshots remain immutable and the account pointer targets the
  September snapshot.
- History ordering is 2026-07-01 ($900/$700/$200), 2026-08-01
  ($1,250/$1,000/$250), then 2026-09-01 ($1,100/$820/$280).

## Actual-browser acceptance

Command:

```powershell
$env:ATLAS_E2E_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:15432/atlas_statement_e2e_acceptance'
npm run --workspace apps/web test:e2e:liquidity
```

Result: 4 passed, 0 failed, 0 skipped (26.9 seconds).

Both CSV and XLSX tests upload exact browser-selected bytes with the declared
kind and MIME, complete processing, review USD values and categories, preview,
apply, navigate away/back, and perform an authenticated reload. Each resulting
account has two positions, $1,484.56 total value, $1,750 basis, and -$265.44
gain; portfolio totals and account rows survive navigation and reload. The
retry scenario injects a transient detail failure and proves the original
upload resumes with one capability request, one content PUT, one completion,
and one publication.

## Supporting gates

- API apply/history integration: 6 passed.
- Web statement/review unit suites: 8 passed.
- API TypeScript build: passed.
- Web production build: passed.
- Financial publication digest is order-independent, preserves multiplicity,
  and suppresses metadata-only duplicate snapshots while retaining genuine
  corrections.
- Legacy CSV history remains labeled `CSV_FALLBACK`; neutral statements remain
  distinguishable as `STATEMENT`.
