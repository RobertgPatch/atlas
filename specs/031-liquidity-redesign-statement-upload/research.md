# Research: Liquidity CSV Uploads

Revision 2 supersedes the PDF/BDA provider selection. Sources: local repository code, authorized structural inspection of the two supplied CSVs and the primary references linked below. Real source values are not retained here.

## Decision 1 — Deterministic CSV parsing with versioned profiles

**Decision**: Use maintained `csv-parse` and adapters `positions_v1`, `merrill_holdings_v1`, plus reviewed declarative mapping profiles. Preserve strings and source locations.

**Rationale**: Both supplied inputs already expose structured columns. One needs title/header detection, the other has a direct header. Quoted commas, negative parentheses, missing markers and duplicate symbols require real CSV parsing and domain rules. A header mapper is the appropriate extension for another export.

**Alternatives considered**: Handwritten split logic loses quoted fields; browser-only parsing cannot establish server authority; OCR/BDA adds unnecessary processing to structured input. AI fallback stays out of the first release, including failure handling.

**Evidence**: [RFC 4180](https://www.rfc-editor.org/info/rfc4180/) describes CSV quoting/records; [csv-parse options](https://csv.js.org/parse/options/) document BOM support, string casting controls, record info and size limits. Enable strict data widths, no skip-on-error, no automatic casting. Profile metadata prefixes are handled explicitly.

## Decision 2 — Dollar-based basis derivation before percentage inversion

**Decision**: Prefer imported complete B. Otherwise use B=M-G when source value and signed unrealized dollar result cover the complete position. Use percentage as a rounded check; percentage-only inversion is an acknowledged estimate.

**Rationale**: In the Merrill layout, all inspected equity rows with M/G support positive derived B and agree with displayed percent after rounding. Dividing by a rounded percent throws away precision, especially near zero. Placeholder gain fields on cash products cannot be treated as numeric zero.

**Alternatives considered**: G/p amplifies percent rounding; reconstructing from footer totals guesses allocation; using cumulative investment return confuses a separate measure. Explicit incomplete basis stays incomplete.

**Evidence**: Direct field inspection and decimal arithmetic; [csv-normalization.md](./contracts/csv-normalization.md) gives exact precedence, units, tolerances, signed examples and cash rules.

## Decision 3 — Preserve missing fields and source occurrences

**Decision**: User confirmed accepting reviewed missing basis with clearly flagged incomplete gain/loss totals; preserve both repeated security rows, cash without a symbol, and all asset types. Aggregate display only after stable instrument/currency identity is established.

**Rationale**: The positions sample is not universally complete despite having all desired headers. Its numeric basis detail does not independently match the footer, while value and gain dollar totals reconcile. It contains missing/incomplete values and repeated money-market rows. Merrill lacks an independent account total and asset-type column. These are real input states, not parser failures to hide.

**Alternatives considered**: Drop unknown rows, zero-fill basis, deduplicate tickers or mark a computed sum reconciled are rejected. Requiring complete basis before any holding is visible is rejected by the user's confirmed preference.

## Decision 4 — Flexible, account-specific effective snapshots

**Decision**: User confirmed complete snapshots from one custodian as the source of truth for each included account. Replace only those accounts' current holdings and values; remove absent assets from their current view without affecting identical securities at another account/custodian. Preserve historical rows and do not infer realized sale proceeds from absence. Date-only same-day corrections get revisions; late imports never replace later effective observations. Empty snapshots are valid only when explicitly confirmed.

**Rationale**: Upload cadence is biweekly/monthly/on demand. `plaid.repository.ts` currently chooses by completion time and filters zero holding counts. Neither is safe for independently uploaded account snapshots.

**Alternatives considered**: One snapshot/month discards legitimate observations; merge-by-symbol retains sold holdings; last-upload-wins regresses effective state; inferring an empty account from a malformed file is rejected.

## Decision 5 — Preserve pricing with stricter eligibility and honest history

**Decision**: User confirmed `REAL_TIME_EQUITIES_ENABLED`, default false. Disabled uses CSV values between uploads and suppresses all Liquidity provider calls, including automatic/manual/scheduled refresh; enabled reuses the existing ticker API for eligible equities. Source quantity/basis remain fixed; quotes create separate observations. Compose historical values from each account's effective snapshot, not today's holdings.

**Rationale**: `market-data.service.ts` currently prices based largely on symbol/quantity/USD and uses quantity*price; it needs instrument and unit guards. `liquidityPerformance.service.ts` selects a global snapshot/date; account uploads need account-wise composition. Current `sumKnown` results need coverage labels, and sparse observations cannot imply daily returns.

**Alternatives considered**: Always-on pricing is rejected by the confirmed default-off flag; infer trades or transaction-adjusted performance from CSV differences is rejected. CSVs do not contain enough cash-flow history to prove such returns.

## Decision 6 — Reuse the API runtime and protected storage

**Decision**: Protected original upload with asynchronous bounded parsing on the existing API process using durable PostgreSQL leases. No new worker service, SQS, EventBridge or AI project for CSV.

**Rationale**: Inputs are small structured files, and strict caps/concurrency yield a bounded job. Durable status/lease protects restart and multi-instance claims; streaming avoids request-memory expansion. Parse results become review drafts.

**Alternatives considered**: A provider pipeline is disproportionate; synchronous whole-file request parsing risks timeouts; a dedicated worker becomes appropriate only if measured workload misses targets. Local/CI run the same parser, not an extraction stub.

## Decision 7 — Additive neutral migration and staged Plaid retirement

**Decision**: Retain neutral account/snapshot/position tables and legacy provenance from the prior plan. Split portfolio-wide legacy snapshots into per-account children with parent references. Add neutral FKs to valuation positions; no destructive table removal.

**Rationale**: Current reports types use Plaid accounts and daily refresh policy. Stage neutral types with compatibility fixtures instead of pretending CSV accounts have Plaid connections. Backfill exact values/history, switch included accounts, observe successful replacement rounds, then retire tokens/jobs.

**Alternatives considered**: Writing CSV into Plaid tables misstates provenance; blanket schema rename breaks rollback; immediate token revocation prevents controlled cutover.

## Decision 8 — Keep CSV formulas inert and exported values safe

**Decision**: Numeric inputs must parse as numeric grammar; text stays escaped text. Preserve Restricted originals; application-generated exports neutralize spreadsheet formula prefixes in text cells without corrupting valid signed numeric columns.

**Rationale**: CSV content can trigger formulas when opened in spreadsheet software even though our parser executes nothing. Downloading an original requires authorized evidence access; export is a separate presentation transformation.

**Evidence**: [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection). Test formula/control-character prefixes and ensure ordinary negative losses remain numbers.

## Research outcome

Technical choices are resolved. Product questions are listed as explicit planning defaults in the spec; none authorizes guessing a missing source value. No provider-price estimate or extraction benchmark is needed for deterministic CSV ingestion.
