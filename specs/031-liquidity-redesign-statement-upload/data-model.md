# Data Model: Liquidity CSV Uploads

Revision 2. All authoritative quantities/prices/money are decimal strings at API boundaries and bounded PostgreSQL numeric values; ratio scale and rounding follow [csv-normalization.md](./contracts/csv-normalization.md). IDs are opaque UUIDs. Entity scope is server-derived through the import/account relationship; production remains one tenant.

## 1. Source account: liquidity_source_accounts

- Stable id, owning entity_id, custodian_id/name, display name, safe account mask, optional keyed full-identifier fingerprint, account type/subtype and base currency.
- Legacy Plaid account ID is nullable provenance only, never a required runtime connection. Account origin and currently active ingestion source are distinct; switching an existing account to CSV must not rewrite its history.
- included_in_liquidity, ACTIVE/INACTIVE/NEEDS_REVIEW status, account version, current_snapshot_id, timestamps.
- cadence = EVERY_14_DAYS / CALENDAR_MONTHLY / ON_DEMAND. Optional next_expected_date is derived from source effective date in account zone and reviewed cadence; on-demand has no missed-upload warning.
- Global server configuration `REAL_TIME_EQUITIES_ENABLED` defaults false; expose effective valuation mode, not an account/user override. Account/source ownership is separate from quote-provider eligibility.
- No unique constraint on account name or mask. Scoped custodian + keyed full-ID matching may suggest a candidate; reviewer confirms. Persist complete account ID only inside protected original/evidence where needed, not ordinary account metadata or telemetry.
- Entity reassignment requires authorization to both owners and an audited migration of related scope; not an ordinary label edit.

## 2. Import: liquidity_csv_imports

Immutable file identity with mutable workflow revision:
- id, entity_id, uploaded_by_user_id, created_at, completed_at, applied_at.
- protected display filename, content_sha256, size_bytes, verified storage_key/version, declared type, verified CSV/encoding profile.
- status, active_parse_run_id, review_revision, mapped_profile_id/version, account bindings, safe_error_code.
- Upload capability has exact authorized key, required encryption/checksum/conditional-create constraints and expiry. Server verifies the stored bytes/version rather than trusting client metadata.
- Unique accepted content identity within entity/import class; matching another entity's hash must not disclose its existence. Same bytes with later mapping/correction use a new run/review on existing evidence, not another anonymous upload.
- A file belongs to one custodian and entity. If it includes multiple accounts, bind each occurrence explicitly within that custodian/entity; cross-entity or cross-custodian files require separate imports. Accounts not represented in the file remain unchanged.

State transitions:

```text
UPLOAD_PENDING -> VALIDATING -> QUEUED -> PARSING
VALIDATING -> REJECTED
PARSING -> NEEDS_MAPPING | NEEDS_REVIEW | FAILED
NEEDS_MAPPING -> QUEUED (new immutable profile/run)
FAILED -> QUEUED (bounded retry, transient cause only)
NEEDS_REVIEW -> READY_TO_APPLY -> APPLIED
READY_TO_APPLY -> NEEDS_REVIEW (edit/version change)
Unapplied states -> CANCELLED
```

An applied import stays APPLIED even if one of its account snapshots is later superseded. Supersession belongs to snapshots, not the entire potentially multi-account file. Applied raw/parse evidence is never edited.

## 3. Parse run and durable processing

`liquidity_csv_parse_runs` stores id, import_id, attempt_no, parser_version, profile_id/version, schema_version, source object/version/hash, canonical_result_hash, status, record/position/issue counts, start/end and finite error code.

- Uniqueness on import + attempt; result import is idempotent.
- A new mapping/profile creates a new run. Preserve the old result, do not silently reparse an applied source into new truth.
- Job lease records claim owner, expiry, heartbeat, run generation and attempt count. Claim with SKIP LOCKED/conditional state; commit short claim transaction before reading the object.
- Only one active run/import and a bounded concurrency per API instance. A stale generation cannot publish its result after a newer run.
- Parsing/validation occurs outside a long DB transaction. Persist successful draft/evidence atomically at the end. Resource/format failure cannot leave a partially usable draft.
- Restart reclaims expired leases with bounded transient retries. Wrong format/financial issues are review states, not automatic retry loops.
- No provider_job_id, confidence score, page budget, blueprint, BDA ARN or paid extraction fields.

## 4. CSV mapping profile

Versioned immutable profile record/config: id, version, adapter kind, custodian applicability, header signature, preamble/header rules, delimiter, encoding allowlist, date format/zone, percent units, number locale, currency and quote/value conventions, field bindings and finite normalization rules.

Supported code-owned profiles are positions_v1 and merrill_holdings_v1. User-authored mappings are reviewed declarative data only and cannot execute expressions. Published profile revisions are immutable and scoped/authorized; review invalidation occurs on any changed binding.

## 5. Source records, fields and draft positions

`liquidity_csv_records`: run_id + record ordinal, physical line start/end, protected raw record/reference, role (METADATA/HEADER/POSITION/TOTAL/BLANK/UNSUPPORTED), account occurrence, disposition reason. All source records accounted for.

`liquidity_csv_fields`: canonical allowlisted path, position/account occurrence, normalized typed value, raw token, source column index/header, record reference, availability (COMPLETE/INCOMPLETE/UNAVAILABLE/NOT_APPLICABLE), origin (IMPORTED/DERIVED/REVIEWED/UNAVAILABLE), reason, formula version and operand field IDs. Derivations cannot be cyclic and all operands must resolve within the same authorized run/review.

`liquidity_csv_positions` retains one row per source occurrence:
- id, run_id, account occurrence, source record ordinal; uniqueness is occurrence, not ticker.
- description, original symbol, broker security ID, CUSIP, ISIN; vetted identity/quote mapping is separate.
- source asset label, canonical category and subtype, classification basis, currency.
- quantity, source unit price, quote unit/multiplier when known, source value, complete or partial basis, signed unrealized dollars/ratio, daily value change dollars/ratio, accrued interest.
- Per-field availability, provenance and estimated/convention flags. Missing quantity on cash need not block a complete value; missing value generally blocks apply.
- Nonstandard signs, units and foreign-currency data remain explicit; unknown category does not omit an asset.

`liquidity_csv_account_occurrences`: protected source account matching evidence, as_of_date, optional as_of_at, source_zone, precision (DATE/INSTANT), reported control totals and row-set scope, reviewed source-account binding/currency/completeness confirmation.

## 6. Review revisions and issues

Append-only review revisions: import/run ID, revision, actor/time, changes (allowlisted paths), previous/new value hashes, protected before/after evidence, reason and attached field references.

- Original raw/normalized result remains immutable.
- Derived dependencies recalculate with each correction; preview hash includes all corrected/derived values and profile versions.
- Issues have finite code, severity, record/field refs, original diagnostics and append-only resolutions.
- Blocking: unsupported/malformed records, missing value/currency/date, unbound account, inconsistent complete-scope arithmetic, unexplained value totals, partial replacement, stale ownership/profile.
- Acknowledged warnings: unsupported or explicitly incomplete basis, unsupported quote semantics and verified footer coverage differences. Default USD/unknown classification, missing source total/day change and supported percent-only estimates do not require acknowledgment.
- A reviewer cannot dismiss an arithmetic mismatch without corrected data or evidence establishing different field scope. Changing severity is not a bypass.

## 7. Application preview/apply

`liquidity_csv_applications`: id, import_id/run_id/review_revision, profile/schema versions, account bindings, expected account revisions/current pointers, same-effective-point target revisions, expiry, summary_hash, idempotency_key, status, actor/time and produced snapshot IDs.

Preview exposes account, as-of, source row counts, removed/added/changed holdings, value/basis coverage, control comparisons and warnings. Each account requires complete-account confirmation; zero rows also requires explicit empty confirmation and reason. No partial account merge in v1.

## 8. Account holdings snapshots

`liquidity_holdings_snapshots`:
- id, source_account_id, source_kind CSV / PLAID_LEGACY, import/run/application ID or legacy parent reference.
- as_of_date, optional as_of_at, as_of_precision, source_zone, effective_key, revision, approved_at/by.
- Source total if provided, exact position total, reconciliation_status MATCHED / NOT_PROVIDED / BLOCKED, protected difference and tolerance, basis/gain coverage.
- supersedes_snapshot_id, superseded_by_snapshot_id and current eligibility.
- Legacy portfolio-wide snapshots split into account children; retain original legacy_snapshot_id and original position IDs/lineage.

Effective ordering:
1. Across dates, later source date wins; upload/apply time does not reorder source chronology.
2. On one date with reliable exact instants, compare those instants. Same instant corrections increment revision.
3. Date-only observations use an explicit DATE effective key. A date-only record competing with timed records on the same day requires a reviewed ordering/correction decision; no invented timestamp or arbitrary precision priority.
4. A later correction of an earlier historical effective key never replaces a chronologically newer current snapshot.
5. At most one canonical approved revision per account/effective key. All versions remain retained.
6. Explicitly confirmed empty snapshots participate in selection; holdings_count > 0 is not an eligibility rule.

Snapshots represent whole-account state, as confirmed by the user. Position absence removes the holding from current composition only within that bound custodian account. All other accounts retain their own current pointer, even when they hold the same symbol/CUSIP. Scope every publication and removal through source_account_id; never update/delete holdings globally by ticker, security ID or custodian display name. Preserve historical positions; absence is not sufficient evidence of sale proceeds, realized gain or a liquidation event.

## 9. Approved source positions and later valuations

`liquidity_source_positions` copies approved canonical positions with links to source records/fields/review. Preserve original symbol and all occurrences; display grouping has its own validated identity key.

Source fields never mutate when a quote arrives. Existing valuation records link source_account_id + source_snapshot_id + source_position_id, price provider/time, eligibility/multiplier, value and provenance CSV_FALLBACK / MARKET_QUOTE / PLAID_LEGACY.

With the flag false, current reads/exports ignore later cached quotes and use CSV values. With it true and an eligible later quote-based value displayed, unrealized gain is recomputed against that same value and complete basis. Imported source G stays available in evidence. Partial totals and percentage denominators carry completeness counts. Cash at-par convention and percent-only estimates are distinguishable from imported tax basis.

## 10. History semantics

At each requested historical date, take each included account's latest approved observation effective on/before that date, then apply eligible valuation observations from that period. Missing earlier account history is missing coverage, not zero. Do not reuse today's positions, extend future prices backward or treat upload-to-upload changes as proven daily/investment returns.

Preserve original recorded valuation rows; historical source corrections create new lineage/versioned derived views, not destructive rewrites. CSV uploads contain no cash-flow history, so transaction-adjusted return measures remain unavailable unless separately supported.

## Atomic apply transaction

1. Lock import, selected run/review, preview and target accounts in stable ID order.
2. Recheck actor/entity, versions, hash, expiry, profile, row accounting, currency, full-account/empty confirmations and all blocking issues.
3. Recompute derived values, reconciliations, coverage and normalized preview hash server-side.
4. Resolve effective ordering and target supersession. Never infer same-day unknown order.
5. Insert immutable account snapshots/positions, append supersession links, increment account revisions and advance current pointers only when chronology permits.
6. Write audit/application/import state and a transactional cache/history invalidation outbox entry.
7. Commit all or rollback all. Replayed idempotency key returns the prior application; reused key with different content conflicts.

## Migration mapping

| Existing owner | New owner |
|---|---|
| plaid_investment_accounts | liquidity_source_accounts with stable account UUID and legacy origin |
| holdings_sync_snapshots | Per-account liquidity_holdings_snapshots with original portfolio snapshot parent |
| source_holdings | liquidity_source_positions with original row identity/exact value lineage |
| liquidity_valuation_positions.plaid_investment_account_id | Add/backfill source_account_id; retain old FK during compatibility |
| plaid_connections | Retain non-secret legacy provenance; retire token ciphertext separately |

All backfills are restartable with equality assertions, row-accounting checks and source-date preservation. No FK drop or raw source deletion during expansion.

## Implemented storage notes

Migrations 047 and 048 introduce neutral accounts/snapshots/positions, source valuations, imports, reservations, profiles, leased attempts, record/field evidence, review revisions, previews/applications and an outbox. Migration 049 additionally protects successful canonical parse results and original object identity. Existing legacy valuation tables retain their foreign keys; new immutable neutral quote observations use liquidity_source_valuations.

Historical-only observations never supersede approved composition. Review revisions retain actual protected before/after field evidence, while ordinary audit events contain safe identifiers/counts. Explicit adoption uses the legacy database UUID and approved entity mapping; ownership is not inferred from provider IDs, names or tickers. Mixed-currency report coverage knownSubtotal and total are nullable; per-account same-currency reconciliation remains exact. Percent-only and cash-at-par derivation tags are generated by normalization and remain distinguishable in coverage and review explanations.
