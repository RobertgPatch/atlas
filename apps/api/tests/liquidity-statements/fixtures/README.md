# Synthetic statement fixtures

Every fixture committed here is invented test data. Do not copy a customer file,
account identifier, name, balance, holding list, filename, screenshot, or exported
XML into this directory, a test snapshot, or CI output. A real example may inform
the format's headers, section boundaries, missing markers, units and control
semantics. Recreate those structural properties with unrelated synthetic values.

`positions.csv`, `merrill-holdings.csv`, and `buildCsvFixture.ts` preserve the 031
characterization cases. Keep these baselines; new format cases belong in their
custodian-specific fixture directories as their adapter tasks are implemented.

## Builders

Import test-only helpers from
`../adapter-conformance/fixture-builders.ts`:

- `buildCsvBytes(rows, options)` quotes delimiter/newline/quote characters and
  supports comma, semicolon or tab, UTF-8/UTF-16LE/UTF-16BE, optional BOM, and
  explicit line endings. Inputs are strings; preserve leading zeroes and missing
  markers. The existing `buildCsvFixture` and known headers are also re-exported.
- `buildXlsxFixture(options)` returns a deterministic ZIP/OOXML Buffer without
  writing files. Supply sheets, sparse addressed cells and row numbers explicitly.
  It supports inline/shared/rich strings, numeric lexemes, booleans, errors, date
  cells, cached or uncached formulas, styles, sheet/row visibility, merges,
  filtering metadata and the 1900/1904 date system. Style indices 0/1/2/3 mean
  general/percentage/date/eight-place decimal.
- `buildXlsxParts(options)` returns named raw XML parts. Replace individual parts
  for malformed XML, relationships, external formulas, unusual package structure,
  duplicate coordinates or work-limit cases.
- `buildZipFixture(parts, compression)` packages raw parts with store or deflate
  compression and deterministic timestamps. It intentionally preserves duplicate
  entry names, arbitrary paths and part text for rejection tests. It is a small
  ZIP32 fixture writer, not a production ZIP validator. Patch the returned Buffer
  explicitly when testing forged header sizes, CRCs, encryption flags or truncation.

Numeric cells and numeric formula caches require lexical strings, for example
`{ address: 'A1', kind: 'number', value: '9007199254740993.123456789' }`.
Do not create the value through Number, parseFloat, arithmetic on JavaScript
numbers, or ExcelJS numeric cell serialization: those can round the input before
the reader is tested. Raw parts retain even excessive precision, exponent notation
or deliberately invalid numeric strings. The application reader decides whether
they are accepted. ExcelJS may be used as an independent package-validity check;
its numeric output is never the authoritative expected value for exactness tests.

## Independent golden conventions

Author expected results before invoking the adapter. Builders serialize source
inputs only: they do not invoke application parsing, classification, normalization,
reconciliation, report code or expected-result generators. Never update goldens
from actual parser output just to make a regression pass.

Each conformance case records its structural purpose, declared source units,
expected account/position occurrences, evidence locations and row dispositions,
expected availability/provenance, controls and their membership, financial values,
and expected findings. Keep expected decimal strings separate from source tokens.
Expected hashes, if relevant, must be tied to an explicitly reviewed input/version;
byte determinism alone does not establish financial correctness.

The following entirely invented case is a useful independently calculated model,
not a claim about any real statement:

| Source row | Quantity | Price | Value | Reported basis | Reported gain | Reported gain % |
|---|---|---|---|---|---|---|
| DEMO equity | 12.5 | 16 | 200 | 160 | 40 | 25 |
| Confirmed USD bank cash | unavailable | unavailable | 35 | unavailable | unavailable | unavailable |

The complete market-value control is **235**. A reported-basis-only footer is
**160** and covers only DEMO; it must not be compared to the normalized basis of
**195**, which includes the independently permitted cash-at-value basis of 35.
DEMO's canonical gain ratio is **0.25**, total gain is **40**, and cash quantity
remains unavailable. A separate non-cash Other row priced at 1 must not inherit
the cash rule. An explicit zero cost remains zero; `--` and `Incomplete` never
become zero or the same availability state.

Precision expectations should also be independently explicit: decimal
`9007199254740993.123456789` quantized to eight places with half-away-from-zero
rounding is `9007199254740993.12345679`; `-1.234567890123456789E-7` becomes
`-0.00000012`. Assert the original lexeme and the normalized amount separately.

For each supported layout include additional/reordered optional columns, missing
versus zero, repeated symbols, an independent second month, partial/complete
controls, and a neighboring unsupported layout. Multi-account fixtures must say
which complete accounts are selected/excluded. Hostile fixtures should be small,
generated in memory, and state the exact intended rejection; do not check in
large archive bombs or real confidential files.

Run the builder checks with:

```powershell
npm exec --workspace api -- vitest run tests/liquidity-statements/adapter-conformance/fixture-builders.test.ts
```

These checks establish fixture serialization and independent OOXML readability,
not acceptance of any future reader, adapter, or financial rule implementation.
