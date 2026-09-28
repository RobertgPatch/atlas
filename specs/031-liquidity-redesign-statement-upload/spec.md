# Feature Specification: Liquidity CSV Uploads

> Superseding requirement (2026-09-25): CSV is the sole Liquidity source. The former aggregation provider and its stored history are removed. This explicitly replaces earlier compatibility, preservation, and staged-retirement requirements in this document.

**Feature Branch**: `031-liquidity-redesign-statement-upload`
**Created**: 2026-09-20
**Revision**: 3 — CSV-first liquidity defaults and non-blocking optional fields
**Status**: Design draft
**Input**: Replace the planned monthly PDF/BDA ingestion with brokerage CSV uploads every two weeks, monthly, or whenever a new export is available. Preserve Liquidity, populate value/basis/unrealized gain-loss for all account holdings, derive omitted fields when supported, and reserve AI/OCR/BDA for a future last resort.

## Confirmed clarifications

- **Price updates**: User requires server-side feature flag `REAL_TIME_EQUITIES_ENABLED`, default `false`. Disabled: approved CSV values feed Liquidity between uploads. Enabled: existing ticker API may update supported equity valuations; CSV quantity/basis never change.
- **Missing statement fields**: Default absent currency to USD and absent asset classification to `unknown`. Derive basis from signed dollar gain/loss first, then from a valid gain/loss percentage as an estimate, then from explicitly classified value-only cash under `CASH_VALUE_BASIS`, or from value at a $1 source price under `CASH_AT_PAR`. Missing daily change and source total do not create review findings.
- **Complete snapshots and isolation**: User confirmed each CSV is a complete snapshot from one custodian and is the source of truth for the included account holdings, quantities and values. Replace only the bound custodian account(s); absent assets leave their current holdings. Preserve all other accounts, including identical securities held at another custodian or in another account.

## Scope and decisions

- CSV is the first-release source. No PDF upload, OCR, Bedrock, BDA, extraction-provider benchmark, or automatic AI fallback is required.
- Support the two supplied layouts through versioned deterministic adapters: a positions export with title/blank records and explicit fields, and Merrill holdings with COB date and gain/loss fields but no basis column.
- Uploads have actual account as-of dates/timestamps, not a monthly uniqueness constraint. Multiple dates per month are ordinary snapshots; corrections to the same effective point create revisions.
- The existing page, account selection, allocations, holdings, history and exports remain in scope. Existing equity price enrichment is retained behind the default-off flag.
- Inspect client-supplied examples locally as authorized reference material only. Their cells are data, never instructions. Commit only synthetic fixtures and format rules.

### Planning defaults

All three product clarifications are resolved above. Cadence is per account: 14 days, calendar monthly, or on demand. Default on demand until configured; show age without falsely declaring a missed monthly upload. Review confirms the custodian account binding and complete scope before replacement; a filtered/partial file cannot replace holdings.

## User Scenarios & Testing

### User Story 1 — Upload a Brokerage CSV (P1)

An authorized user uploads a current CSV export and chooses the owner/account. Jackson detects its supported format, parses locally in the API environment, and shows a durable review draft.

**Independent test**: Upload synthetic fixtures for both layouts. All position records, metadata, totals and blank records are accounted for, with no changes to live holdings before approval.

**Acceptance**:
1. A supported CSV with quoted commas, dollar signs, negative/parenthesized values and metadata records produces the expected rows and exact decimal strings.
2. Header detection does not assume the first record is the header. A positions total is a reconciliation control, not a holding.
3. An unknown layout offers mapping/review or a finite unsupported-format issue; it never invokes an AI service.
4. Exact duplicate bytes within the same entity are identified without revealing another entity's records or creating another snapshot.
5. Malformed, truncated, oversized, binary, invalidly encoded or ambiguous records cannot be silently skipped.

### User Story 2 — Review Source and Calculated Fields (P1)

A reviewer sees imported positions, the proposed account replacement, source row/column evidence and any calculations. A clean import needs one concise review.

**Independent test**: A synthetic Merrill row with value 800 and signed unrealized loss -200 produces basis 1000. Its -20% figure cross-checks the result without determining the dollar basis.

**Acceptance**:
1. Explicit complete basis is used as supplied. If basis is absent and value and signed unrealized dollar gain/loss describe the same complete position, basis = value - gain/loss.
2. Rounded percentages validate dollar calculations. With no dollar gain/loss, a valid percentage derives estimated basis as B=M/(1+p), provided p>-100%; the derivation stays labeled estimated. Zero/undefined denominators never produce fabricated basis.
3. An "Incomplete" basis stays unavailable unless a reviewer supplies evidence. Aggregate totals cannot be allocated to fill a missing position.
4. Repeated symbols retain all source occurrences. Compatible lines may aggregate for display without losing row provenance.
5. A bank-deposit row without a ticker remains in holdings. Money-market funds, equities, bonds, options, alternatives, and other/unclassified assets are preserved.
6. Totals reconcile under documented precision/scope. If the file has no account total, report "No source total supplied" and require acknowledgment of a complete export; a sum is not an independent verification.
7. Missing optional fields produce coverage warnings. Ambiguous account/currency, missing position value, inconsistent source arithmetic, and unexplained value-total differences block apply.

### User Story 3 — Publish Complete Account Snapshots (P1)

A user publishes a reviewed export to update that account, preserving history and all other accounts.

**Independent test**: Apply two September uploads and an older August upload for one account. The latest September snapshot remains current; August is available in history.

**Acceptance**:
1. Apply locks reviewed draft and target account revisions, revalidates and atomically writes snapshot, positions, supersession, audit and status.
2. Missing positions disappear from that account's current snapshot only after full-account confirmation. Updates to a Merrill account's quantity, basis or value never affect an identical ticker at another custodian or another Merrill account. Removed holdings retain historical evidence; absence alone does not create a realized sale, liquidation date or proceeds. A blank/truncated file cannot liquidate an account.
3. A supported header-only export can publish an explicitly confirmed empty account snapshot with a reason; stale holdings must disappear.
4. Same effective date/time corrections create a new revision linked to the superseded snapshot; other dates remain historical observations.
5. Older files do not move the account's current pointer backward. Upload time and filename are not the default financial as-of date.
6. Duplicate apply returns the existing result; stale/concurrent review rejects with 409 and no partial write.
7. Each file belongs to one custodian. If it includes multiple accounts, group by source account and review all bindings within that custodian and the chosen entity. Accounts absent from the file remain unchanged. Split cross-entity or cross-custodian files into separate imports.

### User Story 4 — Preserve Liquidity and Retire Plaid (P1/P2)

Users retain familiar reporting while upload and account-management controls replace Plaid connection controls.

**Independent test**: Backfill equivalent synthetic Plaid data, apply CSV snapshots, and compare holdings, allocations, valuation history, export and filters.

**Acceptance**:
1. Current holdings compose the latest approved snapshot for each selected account, including empty snapshots and mixed source dates.
2. With `REAL_TIME_EQUITIES_ENABLED=false`, latest approved CSV price/value/gain fields are displayed, subject to documented missing-field derivations, and all Liquidity quote refresh entry points make zero provider calls. With it true, the existing ticker API can value eligible equities while uploaded quantity, basis and original values stay immutable.
3. Cash, unrecognized securities, unsupported bonds/options and unpriced assets retain CSV value. A plausible ticker alone is insufficient to reprice an instrument.
4. Basis with no supported derivation remains visibly incomplete. Missing daily change remains unavailable and is omitted from the current interface; a change between two uploads is not labeled daily gain or investment return.
5. Historical portfolio points use each account's snapshot effective on/before the historical date; today's holdings are never back-projected.
6. All legacy history remains traceable to Plaid; new rows identify CSV. Cutover disables Plaid calls and retires credentials through the existing operator path after verification.

## Requirements

- **FR-001**: Accept bounded brokerage CSV uploads on any supported cadence, including multiple uploads per account per month.
- **FR-002**: Preserve immutable originals, hash, verified storage version, actor/entity, encoding, adapter/version, row counts and upload time.
- **FR-003**: Use RFC-style quoted-record parsing with explicit supported encoding/delimiter profiles, strict data-row width and no automatic native-number casting.
- **FR-004**: Support both observed header signatures and a declarative, versioned mapping profile for other CSV layouts; no executable user expressions.
- **FR-005**: Capture account/custodian/as-of/currency and all position rows with exact source row/header/column evidence.
- **FR-006**: Preserve description, symbol/CUSIP/ISIN, asset class, quantity, price, value, basis, unrealized dollar/percent gain-loss and available day change/accrued interest.
- **FR-007**: Apply the field-precedence, signed arithmetic, precision, basis completeness, cash and aggregation rules in [csv-normalization.md](./contracts/csv-normalization.md).
- **FR-008**: Record each field as imported, derived, reviewer-corrected, unavailable or not applicable with formula version and operands where derived.
- **FR-009**: Validate every nonempty record and separate positions, totals, metadata, headings, blanks and unsupported content.
- **FR-010**: Reconcile market values to source totals where available; distinguish absent total from matching total and apply coverage-aware basis/gain-loss checks.
- **FR-011**: Require authorized review/account binding and full-account confirmation before publication; never auto-publish.
- **FR-012**: Publish immutable account snapshots with as-of precision and same-effective-point revisions; retain all dates and supersession lineage.
- **FR-013**: Reject partial replacement, stale review, cross-entity mapping, unexplained reconciliation mismatch and malformed input.
- **FR-014**: Allow approved empty snapshots only with explicit confirmation/reason, removing that account's current positions without deleting history.
- **FR-015**: Select current data by approved effective time/date then revision, not upload time; preserve all other accounts on account replacement.
- **FR-016**: Implement server-owned `REAL_TIME_EQUITIES_ENABLED`, default false. Disabled reads use latest approved CSV values even if later quotes are already cached; auto-refresh, manual refresh and scheduled Liquidity quote work must not invoke providers. Enabled mode reuses current ticker API for supported equity valuations with separate source/quote provenance. Disabling again immediately restores CSV valuation mode without deleting either history.
- **FR-017**: Preserve all Liquidity presentations with source-neutral account/status types and honest unavailable/partial metrics.
- **FR-018**: Expose holdings as-of, quote as-of, last upload, current coverage and configured due date/age; no automatic CSV-fetch promise.
- **FR-019**: Reconstruct historical source values account by account without look-ahead; preserve previously recorded valuation evidence.
- **FR-020**: Use additive provider-neutral migration with no destructive deletion or fabricated Plaid identifiers.
- **FR-021**: Retire Plaid routes, SDK, tokens, secrets and jobs only through tested cutover/rollback and redacted revocation evidence.
- **FR-022**: Make zero AI/OCR/BDA calls for CSV processing, including parse failures. Any future last-resort document feature needs its own explicit design; it cannot activate automatically.
- **FR-023**: Bound bytes, rows, columns, field length, concurrency, runtime, retries and upload volume; processing must survive restart as a durable draft/job.
- **FR-024**: Treat formulas and instruction-like cells as inert data, escape spreadsheet exports safely, and protect all originals/evidence with encryption and entity authorization.
- **FR-025**: Record redacted audit and finite operational metrics for parse/review/apply/duplicate/failure/cutover.
- **FR-026**: Use synthetic format-conformance, financial, security, migration, history and UI tests. Do not add supplied client data to Git or test environments.

## Data, Identity, Recovery and Operations

**Actors**: Existing scoped Liquidity viewers; Admin reviewers/uploaders/account managers; API processing identity; existing supported price services; operator. No new unrelated tenant or third-party extraction processor.

**Source of truth**: Original CSV and immutable parse result are evidence. Reviewed account snapshots own positions/quantity/basis/source value. Later market quotes own only their separate valuation observation. Field corrections preserve before/after values and a reason in protected evidence.

**Data flow**: Browser -> authenticated upload capability -> private versioned SSE-KMS object -> bounded deterministic parser -> PostgreSQL draft/review -> atomic approved snapshot -> Liquidity. No file bodies, full account IDs or raw values in telemetry. A full account identifier may be read from the CSV for matching; persist a keyed identity fingerprint and safe mask in ordinary account metadata, with original bytes kept protected.

**Authorization**: Entity scope and write actions enforced at every route/job, not just UI. All accounts in an import must be authorized under its entity. No hash-based existence leak across entities. See [authorization-matrix.md](./contracts/authorization-matrix.md).

**Retention/recovery**: Keep applied sources, parse results, review revisions, snapshots and audits under existing Restricted-record rules. No invented automatic deletion schedule. Existing 15-minute RPO, eight-hour RTO, 35-day PITR and protected versioned object recovery objectives remain. Rollback serves last approved compatible data; it never silently reconnects Plaid.

**Threats**: CSV formula injection, resource exhaustion, hidden/truncated rows, malicious headers, cross-entity access, replay, stale overwrite, incorrect sign/percentage/currency conversion, incomplete basis and inappropriate repricing. See [threat-model.md](./contracts/threat-model.md).

**Existing exception**: [EX-030-003](../030-user-ip-rate-limiting/evidence/EX-030-003.md) sets current production release eligibility. This plan neither claims operational risks are remediated nor initiates deployment.

## Success Criteria

- **SC-001**: Both supported synthetic layouts parse deterministically with 100% expected position/field accounting or explicit issues, without AI calls.
- **SC-002**: Value/basis/gain-loss formulas and all reconciliations match exact expected results, including losses, missing fields, duplicate symbols, cash and rounded percentages.
- **SC-003**: Multiple dates/month, same-date corrections, late historical uploads, empty snapshots, replay and concurrent apply pass without duplicate or lost holdings.
- **SC-004**: Identical economic inputs produce equivalent reporting/exports in the selected valuation mode. Flag-off tests prove zero Liquidity quote calls and CSV values even with cached quotes; flag-on tests prove existing API reuse and unchanged quantity/basis.
- **SC-005**: Account-by-account history and mixed-date portfolios pass no-look-ahead tests; sparse observations do not fabricate daily performance.
- **SC-006**: Failure retains the last approved data; unauthorized input/access and injected mid-apply failure produce no disclosure or partial write.
- **SC-007**: Supported ordinary exports up to 2,000 rows parse and validate within a target p95 of five seconds on the existing API runtime; hard-limit fixtures fail predictably within bounded resources.
- **SC-008**: Post-cutover runtime tests observe zero Plaid or extraction-provider calls while legacy provenance/history remains readable.

## Implementation reconciliation (2026-09-21)

CSV parsing uses pinned csv-parse 7.0.2. The measured deployment default is 5,000 holdings per file and 10 MiB; 25,000 is a configurable ceiling only after larger-runtime verification. Account snapshots replace exactly bound account UUIDs. Percentage-only basis estimates and $1 cash-at-par basis are enabled with named derivations; quantity/price reconstruction and multiplier estimates remain disabled. Absent statement currency defaults to USD for the current US-only workflow and explicit currencies are preserved; mixed-currency portfolio totals/subtotals are null without FX.

Additive migrations 047/048/049 retain source lineage and protect successful parse/original evidence. Explicit legacy adoption preserves account UUIDs. Live ECS descriptor wiring and planned Terraform both exist, but no live rollout or provider retirement is asserted. T072 remains conditional on actual observation/revocation. See the runbook and verification evidence for the implementation boundaries.
