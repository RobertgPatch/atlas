# Data Model: Statement Adapter Normalization

This design extends the existing import and snapshot model. Names below describe logical contracts; retaining existing `liquidity_csv_*` SQL names is intentional.

## Statement source

Existing import identity remains `id`, `entityId`, `custodian`, `sha256`, immutable storage key/version, uploader, size, status, and optimistic version. Add `fileKind: CSV | XLSX`, validated content type, and a sanitized original filename for normal display/download. Legacy rows have an in-memory or additive-column default of CSV; their original bytes, keys, and hashes never change.

One source belongs to one entity/custodian. Keep duplicate identity at entity + byte hash. A duplicate request with a conflicting custodian returns a metadata conflict; it cannot rebind the stored source. Rejected/cancelled sources with no prior applications may follow the existing retry/upload rules. Add a monotonic `source_identity_retained` marker set on first application so a cancelled correction can never release an approved source's duplicate identity; duplicate queries and the partial unique index must include retained sources regardless of workflow status.

## Reader document and source records

`StatementDocument` is a bounded in-memory representation, not a general workbook model:

- `kind`, source hash, reader ID/version, aggregate resource counts.
- `sheets[]`: stable ID/order, protected name, visibility, date system, row inventory, discovered regions and status.
- `records[]`: global positive ordinal unique within the run, source location, typed sparse cells, disposition and disposition rule. Stable ordinals retain existing row foreign keys.
- `cells[]`: source column/address, type, lexical value, supported display-format hint, formula/cache flags, and merge-anchor information.

Source locations form a tagged union:

| Kind | Required location |
|---|---|
| CSV | record ordinal, physical start/end line, zero-based column, source header |
| XLSX | sheet ID/name, one-based row/column, A1 address, source header |

Do not fill XLSX locations with fake physical CSV line numbers. For new XLSX records, legacy `line_start`/`line_end` become nullable, and new checked `source_location`/`source_kind` metadata carries the actual location. Original CSV columns remain valid.

Record roles: metadata, header, position, subtotal, total, note, blank, excluded section, unsupported. Every nonblank record has one role and a tested rule/reason. Repeated source rows remain distinct records even when their symbols match.

## Registered adapter and match

An adapter is deployed code with `id`, semantic `version`, display label, custodian key/aliases, export family, supported reader kind, canonical schema support, header aliases, structural detector, parser, declared financial conventions, and conformance cases.

A detection candidate names the adapter version, sheet/table region(s), structural evidence, matched/missing/incompatible signatures, account-group boundaries, and an outcome: `MATCH`, `NO_MATCH`, or `AMBIGUOUS`. No numeric confidence threshold allows an ambiguous interpretation to publish.

A file may contain several matched regions/adapters compatible with the selected custodian. Matches that overlap in source rows must resolve to one interpretation. A registered pattern cannot assume every section from that custodian is complete holdings data.

## Parse run and recipe

Keep the existing leased run ID, attempt, generation, source identity, immutable result, and completion guard. Add explicit `recipe` and `recipeHash`:

- File reader ID/version and limits/configuration revision.
- Registry revision and resolved adapter ID/version per region.
- Canonical schema version, normalizer version, reconciler version, and classification catalog version.
- Structural selection and mapping profile revision/hash where applicable.
- Account extraction/fingerprint interpretation version, without raw identifiers or HMAC keys.

The run records the recipe that actually produced its output before success. Queued jobs pin available code/configuration; a worker whose deployed versions cannot fulfill the recipe fails with a retryable version-unavailable condition instead of silently using different code. Detection metadata is preserved so an unknown format can be reprocessed deliberately later.

Per-account publication selection is review state, not a mutation of the parsed source. Structural changes (choosing a different table interpretation or mapping) require a new parse run.

## Canonical StatementDraft version 3

`schemaVersion: 3.0.0`; source hash; recipe; record/sheet accounting; adapter matches; canonical accounts; source controls; findings. Public types are owned by `packages/types/src/liquidity-statements.ts`; the API imports/re-exports them instead of maintaining a parallel definition.

Schema 2 remains a supported stored representation. Compatibility projections mark missing conventions and control scopes as legacy/unknown and keep the persisted canonical hash authoritative for its recorded operations. Projection is not a new approval or an excuse to recompute old monetary values.

### Canonical field

Preserve existing value, availability, origin, raw evidence references, reason, and optional derivation. Decimal values are strings, never binary floats. Add `interpretation` separately from `derivation`:

- Imported numeric/text value: source evidence and source semantics.
- Interpretation: adapter rule/version, unit conversion, source product-to-category mapping, basis field selection, or source rounding.
- Derivation: shared rule/version, exact operand paths/versions, rounding mode, and estimated status.
- Review: original evidence plus actor/reason/revision in the review record.

The normalizer only clears/recomputes the financial derivations it owns. It cannot erase adapter interpretations or user corrections merely because they are transformed values. Missing, incomplete, not applicable, explicit zero, and complete remain distinct.

### Canonical account

Occurrence ID is opaque or ordinal, never an unkeyed hash of an account number. Fields include masked display name/account mask, identifier quality, keyed full-identifier aliases when reliable, currency, source date/time/timezone/precision, source sections, completeness evidence, positions, and controls.

Identifier quality: `FULL_RELIABLE`, `MASKED`, `UNRELIABLE_NUMERIC`, or `ABSENT`. Only FULL_RELIABLE generates account-match fingerprints. No full account number is retained in the normalized account.

Completeness: `SUPPORTED_COMPLETE`, `REVIEW_REQUIRED`, or `UNSUPPORTED_PARTIAL`. A user confirms replacement for a complete candidate; confirmation cannot turn a known filtered/partial account into a supported complete account.

### Canonical position

Keep existing description, symbol, CUSIP/ISIN/broker ID, source product type, canonical category, currency, quantity, price, market value, cost basis, gain/gain ratio, day change/day ratio, accrued interest, and occurrence/source record identifiers.

Add basis semantics/source-field identity and valuation conventions: `priceUnit`, `quantityUnit`, exact multiplier, accrued-interest inclusion, and verified provider identity. Unknown conventions are explicit. Preserve original and adjusted cost as separate optional source observations even when only one is selected as canonical basis.

Repeated identical symbols can represent distinct source rows. Never collapse these during parsing. Extend report grouping with generic compatibility checks for currency, quantity/price units, instrument category, and conflicting reliable security identifiers. Compatible normalized symbols roll up with source-account detail; incompatible observations remain separate with an explanation and cannot contribute misleading combined quantities or mixed-currency value. Custodian-specific conditions do not belong in that grouping rule.

## Source control and reconciliation

Each `StatementControl` contains:

- Stable control ID, account occurrence, source location, metric (market value, original cost, adjusted cost, gain, or a declared other supported control), currency.
- Reported field and original evidence.
- Scope: complete account, explicit section/subset, or unknown. Include exact source occurrence IDs, original operand field, and coverage rule/version.
- Tolerance expressed as an exact decimal and the source rounding convention.
- Reconciliation result: `MATCHED`, `MISMATCH`, `NOT_PROVIDED`, or `UNVERIFIABLE`; compared subtotal, difference, covered/excluded/unavailable counts, and finding references.

Controls are immutable source assertions. Corrections add a reviewed overlay and reason; they never overwrite original amounts or membership. An authorized compatible correction may resolve the effective finding while the original mismatch remains auditable; only unresolved effective blocking findings prevent apply. Warning acknowledgments bind to the run plus effective values/controls hash, and must be renewed if those contents change. Final normalized coverage separately reports known/unknown/estimated row counts and known subtotals. A partial source control can match while portfolio basis coverage remains partial.

## Review, account selection, and application

Add reviewed decisions for every account candidate: `SELECTED` with binding/complete-snapshot confirmation, or `EXCLUDED` with reason. Preserve sheet/region inventory and exclusion reasons so ignored overview/unsupported sections cannot silently hide missing holdings.

Binding still includes source occurrence, target account, expected account version, empty-account confirmation when relevant, warning acknowledgments, and effective ordering/correction decision. Selected candidates have unique target accounts in the import's entity/custodian. At least one complete account is required for apply.

Add `active_review_id` scoped to the active import/run. Keep `review_revision` as a monotonic import-wide counter; allocate new revisions while holding the import lock. Reprocessing clears the active review pointer, not the counter. Detail selects a review only if it belongs to the active run. This avoids collision with `unique(import_id,revision)` after reparse.

Preview hashes bind source/run/recipe, canonical draft, review, selected/excluded accounts, acknowledgments, current account versions, ordering, and mapping/structural interpretation. Apply revalidates these and publishes all selected accounts in one transaction. Excluded accounts are untouched and never represented as empty snapshots.

Reprocessing an applied source preserves prior applications and snapshots. A new application may publish a reviewed correction or previously excluded accounts. Detect prior publication by persisted source ID + bound target account ID + effective snapshot identity and a financial-content digest, not parse-run ordinals. The digest preserves position multiplicity and meaningful financial/category/identity/unit/availability fields while excluding recipe versions, evidence IDs, and source row ordering. Metadata-only parser changes are a no-op for financial publication. Existing idempotency keys return the exact prior result or reject a changed payload.

Abandoning a correction draft preserves the source identity and earlier applications, marks the draft run cancelled, and returns the source to its prior applied view. The active pointer may return to the latest applied run/review while the historical review counter remains monotonic. It must not reuse the ordinary never-applied CANCELLED-import path to release the accepted-hash identity.

## Source-kind compatibility and persistence

Extend source-account/snapshot/valuation constraints to permit neutral `STATEMENT` alongside legacy `CSV`. New imports after activation write STATEMENT with file kind/adapter provenance; old rows and CSV_FALLBACK history labels stay unchanged. Do not infer quote units from this label.

New recipe/control/evidence/selection fields can live in existing JSONB payloads plus bounded queryable metadata columns. No new mapping-template table is required. Keep old immutable triggers; extend guards to cover new source identity/recipe fields after publication.

## State transitions

```text
UPLOAD_PENDING -> VALIDATING -> QUEUED -> PARSING
PARSING -> NEEDS_REVIEW | NEEDS_MAPPING (CSV only) | NEEDS_ADAPTER | FAILED
NEEDS_REVIEW -> READY_TO_APPLY -> APPLIED
NEEDS_REVIEW -> NEEDS_REVIEW (saved corrections with unresolved findings)
NEEDS_ADAPTER | NEEDS_MAPPING | FAILED | NEEDS_REVIEW | READY_TO_APPLY
  -> QUEUED (explicit permitted reprocess with a new run)
APPLIED -> QUEUED (explicit new draft/correction; earlier application survives)
Never-applied pending sources -> CANCELLED where currently permitted
Applied source's pending correction -> abandon draft, retain prior APPLIED view
Invalid/hostile original -> REJECTED
```

NEEDS_ADAPTER is a new non-publishable state with unsupported/ambiguous reason. Parser failure, missing adapter, stale preview, and valid-but-incomplete review are distinct. Application history is independent of the current import workflow state.
