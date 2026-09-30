# Research: Statement Adapter Normalization

Date: 2026-09-28. Baseline: merged feature 031 at `14cc1c9`. This is design evidence, not implementation or release verification.

## R1 - Extend the existing owners

**Decision**: Introduce file readers and a registered adapter interface inside `apps/api/src/modules/liquidity-statements`. Preserve the existing account, review, preview, application, history, and report owners.

**Rationale**: `csv/profiles.ts` already dispatches Merrill, positions, and mapped CSV modules into the same canonical model. `csv-processing.service.ts` already owns durable jobs, leases, evidence persistence, normalization, and reconciliation. Replacing those downstream services would expand risk without improving format support.

**Alternatives**: Add another conditional to the CSV dispatcher (does not solve XLSX or isolation); create a generic document ingestion service (unnecessary service and abstraction); send statements to AI/OCR (additional cost and nondeterminism for structured data).

## R2 - Adapter per export pattern, code-assisted onboarding

**Decision**: Version an adapter by custodian, export family, and reader kind. User confirmed that Codex should add and test new formats from a supplied sample. Register code modules, never execute uploaded scripts or generate runtime parsers from statement content.

**Rationale**: One custodian may supply holdings, tax lots, balances, and transactions in incompatible layouts. A holdings adapter must identify its row grain and completeness, not merely recognize a bank name. A single sample is evidence for a bounded pattern; it is not proof that every export from that custodian is supported.

**Alternatives**: Reusable admin mapping builder is deferred. Keep the current import-bound CSV mapper for simple one-off files, with the same completeness and reconciliation checks. Unknown XLSX layouts receive a specific unsupported-format outcome, not the CSV mapping screen.

## R3 - Read XLSX without losing numeric source text

**Decision**: Retain pinned `csv-parse` for CSV. Add a bounded OOXML table reader with explicit pinned ZIP/XML dependencies (`yauzl` and `saxes` candidates), preserve original numeric `<v>` strings, and convert them through exact decimal functions. Keep ExcelJS for existing exports and synthetic fixture generation.

**Rationale**: Installed ExcelJS 4.4.0 calls `parseFloat()` for numeric cells and cached numeric formula results. Decimal strings reconstructed from those numbers cannot recover the original lexeme. The current `csv/decimal.ts` also rejects exponent notation and fractional precision beyond its canonical scales, so XLSX needs exact exponent expansion and documented quantization.

**Alternatives**: ExcelJS alone loses source precision before normalization. ExcelJS plus a parallel raw XML pass duplicates traversal and cell reconciliation. A narrow OOXML reader addresses the required plain tabular formats without becoming a spreadsheet calculation engine.

**Primary references**:

- [ExcelJS 4.4.0 cell reader source](https://github.com/exceljs/exceljs/blob/v4.4.0/lib/xlsx/xform/sheet/cell-xform.js)
- [csv-parse cast option](https://csv.js.org/parse/options/cast/)
- [yauzl ZIP reader and validation](https://github.com/thejoshwolfe/yauzl)
- [saxes XML parser and limits](https://github.com/lddubeau/saxes)

Registry lookups during planning identified yauzl 3.4.0 and saxes 6.0.0 as candidates compatible with the Node baseline. Implementation must recheck maintenance, advisories, licensing, pinning, and the resolved lockfile. These observations do not establish security approval.

## R4 - Typed cell and evidence semantics

**Decision**: Readers preserve text, numeric lexemes, booleans, errors, formula/cache flags, style hints, sparse addresses, sheet visibility, and date system. Adapters decide column meaning and units. Do not cast every styled numeric cell into a date or percentage.

**Rationale**: Morgan Stanley numeric percentage columns in the sample use an ordinary decimal format; their export convention is percentage points. By contrast a numeric cell `0.125` displayed as `12.5%` is already a ratio, and text `12.5%` is percentage points. One generic divide-by-100 rule is wrong. Date-only statement dates and intraday statement timestamps also need different treatment.

Honor workbook 1900/1904 date systems only for mapped date fields. Reject fictitious 1900 serial 60. Never use file modification time or the API server timezone as the account effective date. Preserve leading-zero text identifiers; masked IDs and long numeric identifiers subject to Excel precision loss cannot become reliable full-account fingerprints.

**Primary references**:

- [Microsoft shared-string representation](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-the-shared-string-table)
- [Microsoft formula storage and cached values](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas)
- [Microsoft Excel date systems](https://support.microsoft.com/en-gb/excel/date-systems-in-excel)
- [Microsoft leading zeros and large numbers](https://support.microsoft.com/en-us/excel/keeping-leading-zeros-and-large-numbers)

## R5 - Formula and workbook scope

**Decision**: Never execute formulas or resolve external relationships. A supported adapter may use a scalar cached formula result with explicit provenance and a review warning; missing/error caches remain unavailable. Required mapped external-workbook formula inputs are unsupported until the source is exported as values. Unrelated hyperlinks remain inert metadata.

Preserve hidden/filtered rows inside a selected holdings table. Inventory all sheets; do not automatically treat hidden sheets or account overview sheets as position tables. Combine multiple sections only under an adapter rule that establishes a single complete account and prevents overlap.

**Rationale**: A cached result can be read, but freshness cannot be proved from the workbook. Visible-only extraction and selecting the first sheet can silently omit holdings or double count an overview plus detail. This feature's contract is structured holdings data, not arbitrary Excel computation.

## R6 - Isolation and bounds

**Decision**: Run file reading, adapter extraction, and financial normalization/reconciliation in a terminable Node worker thread managed by the current durable job owner. Keep database/object-store access, authorization, keyed account fingerprinting, and persistence in the parent. The worker has no network or formula evaluation path in its application code; it is a resource boundary, not an OS security sandbox.

Use the current concurrency of one parser per API process, durable lease fencing, hard parent timeout, byte/count budgets, and bounded worker output. Do not rely on a timeout checked only after parsing finishes.

**Rationale**: A same-thread `Promise.race` does not stop synchronous parsing or free CPU. Worker V8 limits do not bound Buffer/ArrayBuffer allocations or total process RSS, so archive counters and measurements remain mandatory.

**Alternatives**: New queue/microservice is unnecessary for this scale. If representative deployment measurements cannot meet the existing API memory budget with safe limits, reduce limits or separately redesign runtime sizing; do not silently raise limits.

**Primary reference**: [Node 22 worker threads, termination, and resource limits](https://nodejs.org/download/release/v22.19.0/docs/api/worker_threads.html).

## R7 - Financial controls and source interpretations

**Decision**: Replace inferred footer coverage with explicit controls containing metric, currency, source row membership, source operand field, completeness, rounding tolerance, and location. Reconcile original source operands independently from derived or reviewed portfolio values.

Persist adapter interpretations separately from financial derivations. The current normalizer clears all `DERIVED` position fields; that must not erase interpreted asset categories or unit conventions.

Restrict cash-at-value rules to confirmed cash semantics; a unit price of one is insufficient. Preserve reported market value when bond/option/other valuation conventions are not verified, and disable inappropriate repricing and per-unit displays.

**Rationale**: `csv/reconcile.ts` currently estimates partial basis/gain scope from missing rows and selected correction rules. That cannot reliably represent a footer covering only reported cost rows after cash basis is derived. `liquidity-source.read.ts` and `consolidatedHoldings.service.ts` also need explicit unit eligibility instead of source-kind assumptions.

**Alternatives**: Disable totals entirely (loses independent integrity checks); compare every footer to normalized values (false mismatches); accept any mismatch (can hide omitted or duplicated positions).

## R8 - Migration and version identity

**Decision**: Add neutral shared types with legacy draft decoding and additive metadata. Keep historical `liquidity_csv_*` table names, keys, hashes, event names, and approved payloads readable. Introduce `STATEMENT` for newly produced neutral snapshots alongside legacy `CSV`, updating all consumers before XLSX is enabled.

Record reader, adapter, schema, normalizer, reconciler, interpretation catalog, and selection versions/hashes in an immutable parse recipe. Reprocessing produces a new run. Reopening an applied duplicate does not apply or recalculate it.

**Rationale**: Migration 050 constrains source kind/origin to CSV. The object-store wrapper also hard-codes `.csv` and `text/csv`. Global `CSV_ADAPTER_VERSION` is insufficient to isolate one adapter change; existing parse-run version columns are currently left at defaults. These details require explicit compatibility work, not only a new reader module.

**Alternatives**: Rename every CSV table and route (unnecessary migration risk); label XLSX as CSV indefinitely (misleading contracts and format-dependent financial behavior); reparse and overwrite history (violates auditability).

## R9 - Account privacy and identity

**Decision**: Keep full-number HMAC matching scoped to entity/custodian. Use sequential or opaque occurrence IDs, not an unkeyed account-number hash. Mask account cells, titles, and filename projections before routine persistence/response while retaining the authorized protected original.

**Rationale**: Current `csv-processing.service.ts` persists all raw tokens and `liquidity-statement.repository.ts` returns them in draft details. Some title/name fields and hashed occurrence IDs also retain identifier material. The previous documentation overstates current minimization. For legacy records, sanitize response projections without modifying immutable evidence; historical evidence retention/remediation is a separately reviewed data change.

**Alternatives**: Match last-four alone (collisions); store full IDs for convenience (unnecessary exposure); silently alter old evidence (breaks immutable provenance).

## R10 - Structural sample evidence

Local read-only inspection confirmed all three supplied samples are available. Only structural facts are retained here; actual positions, balances, account names/numbers, and original files are not committed.

| Format | Observed structure | Required behavior |
|---|---|---|
| Merrill holdings CSV | Header first; 16 columns; five holding rows; COB date and account fields in records; source value and dollar/percentage gain columns; no total row detected | Group records by reliable account/date, recognize cash programs, derive only omitted fields, allow absent controls |
| Schwab positions CSV | Header after title/preamble; 17 columns; explicit cost, gain, day change, and asset type fields | Parse title date/account metadata, explicit product type, source control rows, and optional richer columns |
| Morgan Stanley holdings XLSX | One visible Holdings sheet; 53 populated/styled rows; 35 header columns at row 11 despite worksheet extent of 59 columns; nine holdings followed by controls and notes; no formula cells | Find table structurally, parse preamble/account as-of metadata, separate footers/notes, read typed numeric cells and export-specific percentages |

The Morgan structure includes broad Stocks / Options labels, fixed income, mutual funds, Other Holdings, and cash/money-market/deposit categories. The sample has both Total Cost and Adjusted Cost, equal where supplied. Missing-cost cases include a cash row without quantity/price and a non-cash row priced at one. These differences must appear in synthetic acceptance fixtures. Header row numbers observed here are test observations, not hard-coded parser rules.

## Research outcome

Technical choices are resolved into the contracts. User-facing clarification answers belong in `spec.md`; implementation-time dependency scans, benchmarks, and end-to-end evidence are explicit verification work, not unresolved architectural choices or claims already passed.
