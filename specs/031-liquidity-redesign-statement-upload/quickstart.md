# Quickstart and Verification: Liquidity CSV Uploads

The CSV workflow is implemented locally. See [verification evidence](./evidence/verification.md) for executed checks and the [operations runbook](../../docs/deployment/liquidity-csv-runbook.md) for deployment and cutover. Production rollout and live token retirement remain separate.

## Development

```powershell
npm ci
npm run dev:db
npm run dev:local
```

Use synthetic CSV fixtures and the real deterministic parser in local/CI. No Bedrock/OCR/BDA credentials or extraction stubs are needed for liquidity imports. Existing K-1 processing is unrelated. The two user-supplied files were authorized reference inputs only; do not copy their values, account identifiers or positions into the repository.

## Fixture matrix

| Fixture | Expected result |
|---|---|
| Positions title/blank/header, quoted commas and losses | Exact account/date/position parsing with source rows/columns |
| Positions footer + cash summary | Footer control excluded from holdings; cash included once |
| Duplicate money-market symbol, distinct rows | Both source occurrences preserved and safely aggregated for display |
| Explicit incomplete basis and N/A markers | Values retained; unavailable fields and aggregate coverage visible |
| Merrill value + signed G + rounded percent | B=M-G; percent checks after unit normalization; no inverse-percent rounding loss |
| Merrill absent total/daily change/asset type/currency | NOT_PROVIDED status without a finding, null daily change, `unknown` classification, USD default |
| Cumulative return columns | Never used as unrealized gain or basis |
| Bond/option/cash/unpriced/foreign-currency data | Preserve source value; enforce quote/multiplier/currency eligibility |
| Unknown headers/new mapping revision | Deterministic mapping review; zero AI calls |
| Malformed quotes, truncation, overlimits, wrong encoding, binary | Safe reject/block; no row loss or partial draft publication |
| Formula/control/HTML/instruction-like cells | Inert data and safe generated spreadsheet export |
| Same bytes/complete/retry/apply replay | One accepted import/result per idempotent action |
| Empty header-only full export | Requires explicit empty confirmation; malformed blank file cannot clear holdings |

## Arithmetic checks

Use synthetic values:
- M=800, G=-200 -> B=1000 and p=-20%.
- M=1250, G=250 -> B=1000 and p=25%.
- Imported B=1000 wins over contradictory derived B; contradiction is reviewed.
- Missing G is not zero. Zero B makes gain percent unavailable, not zero.
- Percentage-only basis uses the labeled estimate B=M/(1+p) when p>-100%. If G and p are both absent and source price is exactly $1, `CASH_AT_PAR` uses B=M and G=0. Explicit cash with value but no quantity, price, B, G or p uses `CASH_VALUE_BASIS`, preserves quantity as unavailable, and uses B=M and G=0. Unverified multiplier estimates stay unavailable.
- Parentheses/signs/thousands separators use decimal grammar; identifiers preserve leading zeroes.
- Independent source total comparison excludes footer/subtotals. Missing control yields NOT_PROVIDED.
- Known subtotal and total coverage differ; partial percentages never mix numerator and denominator populations.
- Repriced current G uses repriced M and the same B; uploaded source G remains unchanged.

## Snapshot and history workflow

1. Seed Merrill account A, another custodian's account B and a second Merrill account C with the same synthetic ticker but different quantities/basis. Upload a complete A file dated September 1, review/preview/apply.
2. Upload A dated September 15 with changed quantity/value/basis and an absent asset. Only A updates, and absent positions leave A's current view after confirmation. B and C remain byte-for-byte unchanged, including their same-ticker holdings and current snapshot pointers. A's prior holdings remain historical; no sale proceeds or realized liquidation event is inferred.
3. Upload A dated August 31 afterward. Current A stays September 15; history includes August.
4. Correct A September 15 with a new revision. Original evidence and supersession stay available.
5. Exercise exact-time same-day files and date-only/timed ambiguity; no timestamp is invented.
6. Confirm an empty A snapshot; no holdingsCount>0 eligibility filter can resurrect prior positions.
7. Upload B on different dates. Historical totals choose A and B snapshots effective on/before each point; missing history is coverage, not zero.
8. Verify sparse observations show actual intervals/unavailable daily return rather than labeling multiweek changes as daily performance.

## Confirmed feature-flag acceptance

1. Omit `REAL_TIME_EQUITIES_ENABLED`; effective value is false. Upload CSV and verify every current value and gain matches approved source data/derivations.
2. Seed a newer quote cache/history. Reload, export, open the page, call manual refresh and tick the scheduler. Current CSV values persist and all Liquidity provider-call spies remain zero.
3. Set true with valid server config. Existing ticker API refreshes only eligible equities/funds; quantities/basis remain uploaded. Unsupported assets retain CSV values and coverage.
4. Set false again. Invalidate mode-dependent cache and immediately restore source valuations without deleting quote history.
5. Concurrent in-flight refresh/mode change cannot publish quote-based current values in disabled mode. Invalid boolean configuration fails validation rather than coercing a nonempty string to true.

## Review, security and crash workflow

1. Unknown layout -> map -> new parse version -> review; account binding stays within entity.
2. Correct a field; dependent formulas recalculate, raw evidence remains immutable and preview expires.
3. A complete export with no account control total can apply without a total-related finding; a contradictory comparable total cannot.
4. Concurrent account/snapshot edit produces 409; apply retry with same idempotency key returns original result.
5. Failure between snapshot and audit insert rolls back everything.
6. Kill parser/API mid-job; lease reclaim produces one canonical result; stale generation cannot publish.
7. Viewer and another entity cannot upload/read originals/review/apply or infer duplicate hash existence.
8. Formula injection/export, malformed-record and resource bounds pass negative tests.
9. Scans of logs/errors/metrics contain no synthetic private canaries.
10. Both successful imports and all failure paths make zero AI/OCR/BDA/Plaid calls.

## Focused checks

```powershell
$env:ATLAS_TEST_DATABASE_URL='<dedicated local PostgreSQL test database>'
$env:REPORT_EXPORTS_ENABLED='true'
npm run --workspace=api test -- tests/liquidity-statements
npm run --workspace=api test -- tests/liquidity-source-migration.integration.test.ts tests/liquidity-csv-equivalence.test.ts
npm run --workspace=web test -- LiquidityCsvUploadDialog.test.tsx LiquidityCsvReview.test.tsx ConsolidatedHoldingsReport.test.tsx
npm run build:api
npm run build:web
npm run security:route-policy
```

Database-dependent checks must actually run against the local test database during implementation acceptance; a skipped integration test is not migration/apply evidence. Follow existing environment-boundary rules when configuring the test DB.

## Migration and pricing verification

Backfill a synthetic legacy portfolio snapshot into per-account children and prove row/amount/date/parent equality on repeated migration. Keep neutral and legacy valuation FKs compatible. Compare reports at equal source/quote dates. Verify slash-symbol aliases, securities without ticker and unsupported quote conventions preserve source values. Keep existing recorded valuation history immutable.

UI acceptance: retain metrics/table/charts/filter/export layout, replace Plaid controls with Upload CSV and neutral account management, show holdings/price dates separately, added/removed replacement preview, missing-basis coverage and per-account cadence/age.

## Infrastructure and performance

Apply Terraform fmt/validate/tests only to necessary CSV prefix/IAM/config changes; add no BDA project, blueprint or paid extraction resources. Preserve all K-1 permissions/resources.

Measure <=2,000-row p95 parse target, hard-limit memory/time, concurrent reads during parsing, lease restart, byte/row caps and storage growth. Confirm the source bucket remains encrypted/private/versioned and restore evidence includes originals, profiles, review and approved snapshots.

## Rollout

Characterize -> expand/backfill -> compare -> CSV publication with neutral account ownership -> two successful replacement rounds plus correction/failure/empty cases -> Plaid retirement. See [migration-rollout.md](./contracts/migration-rollout.md). Rollback retains approved CSV and historical evidence, serves last-good snapshots and never silently reactivates revoked Plaid credentials.

Local implementation results are recorded in evidence/verification.md. No production deployment or live retirement is claimed. The measured deployment default is 5,000 holdings, with a hard configurable ceiling of 25,000 that requires separately verified capacity.
