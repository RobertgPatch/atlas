# Reader and Adapter Contract

## Boundary

File readers parse syntax and preserve typed values. Adapters are pure, deterministic format interpretation modules: no database, network, pricing, object writes, approval, or direct portfolio mutation. Source file content is data, never executable instructions.

Conceptual TypeScript interface (design, not generated application code):

```ts
interface StatementAdapter {
  readonly id: string;
  readonly version: string;
  readonly custodianKey: string;
  readonly fileKind: 'CSV' | 'XLSX';
  readonly canonicalSchemaVersion: '3.0.0';
  detect(document: StatementDocument): DetectionResult;
  parse(document: StatementDocument, match: AdapterMatch): AdapterResult;
}

interface AdapterResult {
  accounts: ExtractedAccount[];
  controls: SourceControl[];
  dispositions: SourceDisposition[];
  findings: StatementFinding[];
}
```

Transient account identifier extraction is handled in the parent's trusted account-identity stage before sanitized results persist. Parser output is bounded and schema-validated before any use. Full identifiers are never adapter IDs, occurrence IDs, metrics labels, or messages.

## Registry and detection

Initial entries:

| Family ID | New version | Reader | Legacy compatibility |
|---|---|---|---|
| `merrill_holdings_csv` | `1.0.0` | CSV | Decode old `merrill_holdings_v1` drafts without rewriting |
| `charles_schwab_positions_csv` | `1.0.0` | CSV | Decode old `positions_v1` drafts without rewriting |
| `morgan_stanley_holdings_xlsx` | `1.0.0` | XLSX | New pattern |
| `mapped_csv` | `1.0.0` | CSV | Existing import-scoped mapping fallback |

The new semantic version is namespaced by the new family ID; it does not relabel or reset old adapter-version evidence.

1. Validate actual file content and choose one supported reader.
2. Inventory bounded sheets/regions and candidate headers.
3. Run compatible registered detectors using required labels, tested aliases, metadata/section signatures, and structural exclusions.
4. Unique compatible match becomes a candidate for review. Multiple interpretations of the same region become `AMBIGUOUS_LAYOUT`; no first-match-wins behavior. Explicit user format choice must still pass that adapter's structural validation.
5. Multiple nonoverlapping complete account matches may coexist. Detect and explain unknown regions and account overview/detail overlap.
6. No match produces NEEDS_ADAPTER, or an explicitly chosen one-off mapper for a suitable CSV. New XLSX templates require a coded adapter.

Allow irrelevant extra columns and reordered headers through named accessors. Unknown headers do not acquire semantics. Reject duplicate normalized headers or multiple conflicting bindings to a financial target. Blank columns outside the identified table do not expand its width or become malformed required headers.

Do not use filenames, row numbers alone, selected custodian alone, market values, or a majority of familiar tickers as evidence that an entire export is valid.

## CSV reader

Preserve csv-parse string output, quoting/newlines, physical spans, explicit encoding/BOM and delimiter handling, and exact widths for actual tables. Arrays prevent duplicate header overwrites. Metadata width may differ; the adapter must account for it. Never skip malformed lines or infer column types by broad sampling. Required/optional field validation happens after structural identification.

## XLSX reader

Accept standard unencrypted OOXML `.xlsx` containers. Reject `.xls`, `.xlsm`, password-encrypted files, macros/embedded executable content, and arbitrary ZIPs. Validate content types and workbook/worksheet relationships, not just ZIP magic. No extraction to disk.

- Read ZIP entries lazily, verify names and actual inflated sizes, reject duplicate normalized paths, and enforce aggregate counts while streaming. Reject path traversal, malformed essential relationships, and decompression errors.
- Use a strict XML parser with DTD/entity declaration rejection, bounded text/depth/attributes, and no external resource fetching.
- Resolve shared strings, inline strings, rich-text runs, styles, and sparse cells. Preserve numeric `<v>` text; never route monetary values or identifiers through Number/parseFloat.
- Ignore formatting-only cells outside recognized tables for data extraction while still counting parser work. Never allocate a rectangular array from an untrusted worksheet dimension.
- Carry 1900/1904 date system and style hints. Only adapters designate date or percentage fields. Preserve date-only versus timestamp semantics and source zone.
- Preserve formula/cache status. Never evaluate/recalculate; supported scalar caches require provenance and warning. Required external formula dependencies or absent/error caches require a meaningful unresolved-field finding.
- Inventory hidden/veryHidden sheets and identify them in review; do not auto-select them. Include hidden/filtered rows within selected account tables. A sheet selection cannot remove arbitrary holdings from a selected complete account.
- Preserve merges as anchors. Never forward-fill numeric values or account ownership across merged positions without a declared tested format rule.

## Proposed initial bounds

These limits are independently enforced; reaching one can reject a file below another. Values are initial implementation targets, subject to lowering after measurement. Raising them requires new evidence.

| Dimension | Default ceiling |
|---|---|
| Uploaded bytes | 10 MiB |
| Holdings per file | 5,000 |
| Accounts per file | 100 |
| Columns in a table | 128 |
| Field text | 16 KiB |
| Populated row's decoded cell text | 64 KiB |
| Nonblank preamble records scanned for a header per region | 100 |
| Total source records inspected across file | 10,000 |
| Inflated ZIP bytes, counted across all entries | 64 MiB |
| One inflated XML entry | 32 MiB |
| ZIP entries | 256 |
| Worksheets | 16 |
| Populated cells | 250,000 |
| Shared strings | 100,000 |
| Aggregate decoded string text | 16 MiB |
| Styles / relationships | 10,000 / 2,000 |
| XML depth / attributes per element | 64 / 64 |
| XML name length | 256 bytes |
| Serialized worker result | 32 MiB |
| Worker work deadline | 30 seconds |
| Active workers | One per API process under existing DB admission limits |
| Initial worker V8 old-generation budget | 256 MiB; not a total RSS guarantee |

Set a bounded decimal token length of 256 characters and exponent magnitude of 100 before exact exponent expansion. These are parser limits, not permission to store numbers outside the canonical/database range. Reject overflow before allocation or persistence.

Parent terminates the worker on timeout/cancel, closes archive streams, ignores late output, and uses the existing fenced lease to persist failure or retry. Resource-limit and malformed-input failures are not transient auto-retry loops. A crashed worker is retried only under the existing bounded transient policy. Measure total RSS including Buffers, worker message copies, parsing trees, canonical evidence, and concurrent normal API requests.

## Initial adapter-specific extraction

### Merrill holdings CSV

Recognize the existing COB date, security, account, value and gain header pattern. Map extra accrued-interest/cost/category columns when present through declared aliases. Distinguish unrealized gain from cumulative investment return. Group account records with consistent dates, preserve leading zeros, derive masked display/fingerprints, and recognize documented cash program names. Missing statement total is allowed.

### Charles Schwab positions CSV

Recognize the existing positions header and title preamble. Extract account/date from supported title syntax, distinguish masked identifier from full number, map explicit asset type/basis/day-change/gain fields, and recognize account totals independently. Unexpected new footer/section patterns fail visibly rather than becoming positions.

### Morgan Stanley holdings XLSX

Find the holdings header structurally, independent of its currently observed row number. Map Name, Product Type, Symbol, CUSIP, Last, Quantity, Market Value, Total Cost, Adjusted Cost, unrealized gain, day change, and accrued interest. Treat statement-level as-of metadata as the snapshot date; per-security quote dates do not replace it.

Canonical basis uses usable Adjusted Cost, then Total Cost when adjusted cost is unavailable, as confirmed by the user. Preserve both sources and reconcile their controls separately. Numeric percentage fields in this observed export use percentage points even though cells are numeric with ordinary decimal formats.

Treat Stocks / Options as a broad category requiring supported instrument interpretation; do not label every such row as equity. Document known money-market identity separately from the generic Mutual Funds label. Recognize bank deposits/cash product codes. A unit price of one in Other Holdings is not cash proof.

Corporate fixed-income percentage-of-par conventions must be explicit and independently tested. Prefer reported market value; do not multiply bond quantity by the raw quoted number as though it were dollars per unit. Recognize account/section totals and known-basis/gain footer scopes. Account masks must not become reliable full-account fingerprints.

## Adapter conformance

Each adapter runs the shared harness: positive detection; negative/ambiguous detection; raw record coverage; exact expected canonical output; source/control provenance; account/date completeness; optional/extra/reordered columns; missing-versus-zero; cash/units; deterministic output; neighboring layout nonmatches; and second-month replacement. Synthetic golden expectations are independently authored, not regenerated from parser output to make tests pass.
