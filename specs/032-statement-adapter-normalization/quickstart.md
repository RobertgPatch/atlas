# Quickstart and Verification: Statement Adapter Normalization

This is the implementation and verification guide for the 032 statement readers/adapters. All committed fixtures are synthetic; private samples are used only for local structure review.

## Local setup

Use the existing Node 22/npm workspace and a dedicated local PostgreSQL test database. Follow the repository's local environment guidance; never point test scripts at production. Existing commands:

```powershell
npm ci
npm run dev:db
npm run dev:local
```

Supply `ATLAS_TEST_DATABASE_URL` through the existing local test configuration without logging credentials. Several current integration suites use `skipIf(!pool)`; any skipped publication, migration, replay, or recovery test is unverified, not a pass. Add XLSX synthetic fixture generation only after the new test helpers exist.

For the mandatory 032 database acceptance run, use a dedicated loopback database
and enable the guard that turns a missing database into a failed prerequisite:

```powershell
$env:ATLAS_TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:15432/atlas_statement_test'
$env:ATLAS_REQUIRE_LIQUIDITY_DB_TESTS='true'
$env:REPORT_EXPORTS_ENABLED='true'
```

Do not point this mode at a production or remote database. Ordinary unit-test
runs may omit both variables; their output must still report database skips as
unverified.

## Baseline and implementation checks

The following existing suite filters should include the new cases during implementation:

```powershell
npm run build:api
npm run build:web
npm run --workspace=api test -- tests/liquidity-statements
npm run --workspace=api test -- tests/liquidity-csv-journey.integration.test.ts tests/liquidity-csv-history.integration.test.ts tests/consolidated-holdings.identity.test.ts tests/liquidity-market-pricing.test.ts tests/real-time-equities.config.test.ts
npm run --workspace=web test -- src/features/reports
npm run security:audit:runtime
npm run security:route-policy
git diff --check
```

The real-browser suite uses isolated ports and a dedicated loopback database.
Create `atlas_statement_e2e` in the local development PostgreSQL container (or
set `ATLAS_E2E_DATABASE_URL` to another dedicated loopback database), then run:

```powershell
npm run --workspace=web test:e2e:liquidity
```

The runner starts its own API on port 3100 and web server on port 5174, uses
local storage/stub providers, serializes tests, and creates unique synthetic
names per test. It refuses remote database URLs. Optional
`ATLAS_E2E_ADMIN_EMAIL` and `ATLAS_E2E_ADMIN_PASSWORD` values must identify a
synthetic local Admin that does not require password change or MFA enrollment.

The production defaults remain 10 MiB, 5,000 CSV rows, 100 accounts, 10,000 total statement records, one parse worker, a 30-second worker deadline, 32 MiB worker output, and 256 MiB worker old-generation memory. XLSX admission is default-disabled. XLSX package limits are 64 MiB inflated, 32 MiB per XML entry, 256 ZIP entries, 16 sheets, 250,000 populated cells, 100,000 shared strings, 16 MiB decoded string text, 10,000 styles, 2,000 relationships, XML depth 64, and 64 attributes per element.

Capture local synthetic performance evidence with:

```powershell
$env:ATLAS_STATEMENT_BENCHMARK_DIR=(Resolve-Path 'specs/032-statement-adapter-normalization/evidence/benchmarks').Path
$env:ATLAS_CSV_BENCHMARK_DIR=$env:ATLAS_STATEMENT_BENCHMARK_DIR
npm run --workspace=api test -- tests/liquidity-statements/statement-benchmark.test.ts tests/liquidity-statements/resource-bounds.integration.test.ts
```

For rollout, ship the additive migration and a binary that can read both schema-2 legacy CSV and schema-3 statement evidence. Retain the prior 032-compatible binary and at least two adapter generations. Enable uploads/parsing/apply separately and keep XLSX disabled until deployment-equivalent capacity and recovery checks pass. Rolling back to a pre-032 image after `STATEMENT` publication is unsupported.

Run additional repository gates for changed infrastructure, environment, exports, and dependencies. Extend conformance, browser, migration, and hostile-file suites as specified below; passing only preexisting test cases is insufficient. For documentation-only planning, validate artifacts and links rather than rerunning unrelated application tests.

## Golden format fixtures

All source contents and expected results in Git/CI are synthetic. Preserve format structure, not private account identifiers, filenames, positions, balances, or metadata. Include purpose-built raw OOXML fixtures for lexical-number cases because ExcelJS fixture generation can itself round numbers.

| Suite | Required examples and expected outcome |
|---|---|
| Merrill | Existing layout, leading-zero full account ID, absent currency/type/total/day change, dollar versus percentage gain, extra accrued-interest column, known cash programs |
| Schwab | Title/preamble, explicit basis and type, optional day change, cash without quantity, explicit incomplete basis, footer controls, repeated symbols |
| Morgan Stanley | Metadata before dynamic-position header, 35-column-style table with extra formatted extent, totals/notes, numeric percent-points, adjusted/original basis, partial controls, bonds, broad product groups |
| Fourth synthetic adapter | New module + registry + fixtures only; no normalization/apply/report edits required |
| Drift | Extra/reordered optional columns succeed; duplicate/conflicting required headers, missing value structure, overlapping tables, or incompatible export grain produce clear findings |

## Exact financial and control cases

1. Source value 800 and signed dollar gain -200 derives basis 1,000; genuine negative Liquidity gain remains negative.
2. Value 1,250 and compatible ratio 25% derives estimated basis 1,000; source dollar gain, when present, wins over percentage estimation.
3. Adjusted cost 900 and total cost 1,000 selects adjusted 900; adjusted zero selects zero; absent adjusted cost falls back to total; explicitly incomplete adjusted cost is not silently completed.
4. Confirmed cash with value 50 and no quantity/price/basis preserves null quantity, uses permitted basis 50, and derives gain zero.
5. Non-cash Other Holding at price one and no usable basis/gain keeps basis unavailable. Category review reruns applicable rules and invalidates preview.
6. Two reported basis rows of 100 and 200 with a source subtotal 300 still reconcile when a third cash position adds derived basis 50. Canonical basis can be 350 while source subtotal remains 300.
7. A wrong known-subset subtotal blocks the selected account; partial-source coverage does not excuse a proven mismatch. Missing source total is nonblocking.
8. Percentage-of-par bond principal 1,000 and quote 98 gives 980 only under the verified convention; unknown conventions retain source market value and disable repricing/unit displays.
9. Test eight/twelve-place rounding, scientific notation, long decimals, negative parentheses, magnitude overflow, zero denominator, blank versus zero, text versus numeric percentages, and explicit unsupported currency.

## Workbook and resource cases

- Shared/inline/rich-text strings, sparse cells, hidden/filtered holding rows, hidden sheets, style-only trailing columns, merged metadata, duplicate coordinates, repeated headers, and overview/detail overlap.
- 1900/1904 dates, serial 60 rejection, date-only versus timestamp, source timezone, and ambiguous date/time requiring review.
- Leading-zero text IDs, masked IDs, numeric IDs longer than safe Excel precision, invalid shared-string references, and malformed XML.
- Literal formula-like text remains inert; approved scalar caches have warning/provenance; missing/error caches leave fields unavailable; no formula execution or external link fetch.
- ZIP forged sizes/duplicate names/path traversal, expansion cap, entry count, XML depth/attribute/text caps, absurd dimensions, large strings/styles, unsupported package/macro/encrypted input.
- CPU-stalled parser terminates by the parent deadline; no late result writes. Worker/API crash recovery reclaims fenced leases once, and stable bad files do not loop retries.
- Measure p95 over a documented representative run set, peak total RSS and external memory, response size, persistence duration, and parallel normal-request responsiveness. Test all configured caps and typical <=2,000-position files using actual deployment sizing. Keep XLSX disabled until evidence passes.

## Multi-account and monthly sequence

1. Upload a synthetic workbook with complete account A, complete account B, an overview, and a notes sheet. Detector identifies both accounts and classifies nonholding sections.
2. Select only A, explicitly exclude B, and apply. A updates atomically; B and every other account remain unchanged. Exclusion cannot appear as an empty snapshot.
3. Reprocess the same immutable source and select previously excluded B. Earlier A application/history remains; identical A is not silently applied again. Review revisions increase without key collisions.
4. Upload A next month with a changed quantity and one holding removed. Only A's current snapshot changes. The removed holding is historical, not a fabricated sale.
5. Upload an older A statement, a same-date correction, and a confirmed empty A statement. Verify date ordering, supersession, and explicit empty confirmation.
6. Place the same ticker with different descriptions in Merrill A and Schwab B. Assert one compatible parent row and two source-account subrows, exact summed quantities/value, and basis/gain coverage.
7. Reject binding accounts across entity/custodian scope; last-four-only collisions must require manual resolution. A full reliable ID uniquely matches recurring files.
8. An unsupported sheet that may contain part of selected A blocks complete-account application; an independent explicitly excluded account does not block A for its own optional-field issue.
9. Cancel a pending correction of an applied source, upload identical bytes again, and verify the same source/history is reopened. Reorder rows or change parser metadata without changing financial contents and verify no duplicate publication.
10. Give the same ticker incompatible quantity units or conflicting reliable security identity. Verify no misleading quantity/price rollup; compatible same-symbol USD equities still consolidate.

## Browser and application boundary

Use the actual local browser upload path for CSV and XLSX, not only a service fixture. Confirm correct raw upload bytes, MIME/headers, immutable completion, polling, draft details, account selection, category dropdown, USD review values, scoped totals, actionable findings, preview, and apply.

After Save review, unresolved blockers remain visible and link to the relevant account/field. Navigate away/back and reload after apply; portfolio total, allocation categories, snapshot dates, same-symbol rollups, and source-account subrows remain correct. Simulate a transient draft-load failure and verify retry without duplicate publication.

Exercise stale expectedVersion, changed selection after preview, concurrent account updates, expired preview, request replay with identical/altered idempotency payloads, missing audit/outbox transaction steps, and parser configuration changes between preview and apply.

## Migration and recovery

Create a pre-032 database with synthetic successful runs, reviewed drafts, applied snapshots, and duplicate sources. Apply new migrations. Assert unchanged original hashes/keys and historical financial payloads; verify legacy and neutral source reads, CSV/XLSX downloads, active-review/run matching, correction reprocessing, and rollback restrictions.

Restore a synthetic checkpoint with both file kinds and verify account pointers, source/control evidence, authorized reads, history, and measured existing recovery targets. New source kinds must remain readable when XLSX ingestion is disabled.

## Completion evidence

Record concise synthetic verification results, exact commands/environment, passed/failed/skipped counts, deployed-sizing bounds, dependency checks, and known supported-layout limits. Do not include private original contents or values. Implementation is complete only when the selected scope and required boundary checks pass; deployment still needs the user's separate request from main.
