# Implementation Plan: Liquidity CSV Uploads

> Superseding product decision (2026-09-25): Liquidity is CSV-only. Remove the former provider runtime, UI, dependencies, infrastructure, credentials, and stored history. Migration `050_remove_plaid.sql` is intentionally destructive and supersedes the staged-retirement/history-preservation passages below. Future uploads with the same custodian and full account number auto-match through keyed fingerprints; raw account numbers are not stored.

**Branch**: `031-liquidity-redesign-statement-upload` | **Revision**: 3 | **Date**: 2026-09-25
**Spec**: [spec.md](./spec.md)
**Input**: Replace the PDF/BDA plan with deterministic brokerage CSV uploads on a biweekly, monthly or on-demand cadence.

## Summary

Use versioned CSV adapters to turn brokerage exports into reviewable account holdings snapshots. Support the supplied positions layout and Merrill holdings layout first, with a reusable declarative mapping profile for other exports. Use reported values when present; derive missing basis from value minus signed unrealized dollar gain/loss when those fields describe the same complete position. Record row/column evidence and calculations, preserve unavailable values, and require one review before publishing.

Keep the Liquidity page and retain existing ticker pricing behind server-side `REAL_TIME_EQUITIES_ENABLED`, default false. CSV values remain current between uploads while disabled. Replace Plaid-dependent account, snapshot and source holdings access with neutral records. Store each upload's effective date/time and revision; allow several snapshots in a month. The user confirmed that each export is a complete custodian account snapshot and the source of truth. Replace only its bound account holdings, including quantity/value/basis changes and removal of absent assets from the current view; identical securities at other accounts or custodians remain untouched. Historical imports never replace newer observations. No PDF/OCR/BDA runtime, blueprint, paid-extraction queue, AI fallback, or provider benchmark is part of this release.

## Technical Context

**Language/Version**: Existing Node.js 22, API TypeScript 5.7/NodeNext, web TypeScript 6/React 19, PostgreSQL 16, PowerShell, Terraform baseline.
**Primary Dependencies**: Fastify, Zod, pg, AWS S3/KMS SDK, TanStack Query, Vite and existing market-data adapters. Add a pinned maintained `csv-parse` dependency after normal lockfile/security checks. Use a bounded fixed-scale BigInt decimal utility consistent with current financial code; never JS floating point for authoritative calculations.
**Storage**: Existing protected versioned object store plus additive PostgreSQL source accounts, CSV imports/parse runs/review revisions/applications, account snapshots and source positions; existing valuation history.
**Testing**: Synthetic adapter conformance, exact-money unit tests, PostgreSQL migration/apply/concurrency/history tests, source-neutral report contracts, upload/review UI tests, authorization/redaction/export injection tests and applicable infrastructure checks.
**Target Platform**: Existing Windows/local PostgreSQL development and AWS API deployment; reuse protected S3 storage. Bounded parsing runs on the existing API service with a durable database job lease; no new always-on service or paid extraction infrastructure.
**Project Type**: Existing npm-workspaces API/web application.
**Performance Goals**: Upload capability target <2 s; ordinary <=2,000-row parse+validation target p95 <5 s; reads make no CSV parsing/Plaid call. Apply is a single bounded transaction. Measure hard-limit memory/time before activation.
**Constraints**: Preserve presentation, exact financial arithmetic, source evidence, entity scope and history. No private samples in Git/CI. No silent dropped rows, invented prices/basis or monthly uniqueness.
**Scale/Scope**: Dozens of accounts, hundreds to low thousands of positions/account, irregular client exports. Initial configurable ceilings: 10 MiB/file, 5,000 data records/file by default (configurable ceiling 25,000 after capacity verification), 128 columns, 64 KiB/record, 16 KiB/field, 100 metadata records, one active parse/API process, 30 s lease-work timeout, at most two transient retries. Upload envelope: 200 files/tenant per rolling 30 days and 10/hour/user, adjustable through reviewed configuration. These are safety caps, not an upload schedule or claimed measured demand.
**Data Classification**: CSV originals, account identifiers, holdings, basis/value, parsed evidence and corrections are Restricted.
**Identity/Tenancy**: Existing single tenant and entity-scoped roles. Admin mutates; scoped users view permitted reporting; service jobs derive entity ownership from persisted import/account records.
**Recovery Objectives**: Existing <=15-minute RPO, <=8-hour RTO, >=35-day PostgreSQL PITR; protected versioned S3 recovery. Additive migrations and last-approved-data rollback.
**Compliance/Providers**: No new extraction processor or training use. Existing S3/DB and pricing processors only; K-1 BDA remains separate. Existing retention/identity/legal/recovery risks remain recorded under feature 030; no new compliance claims.

## Constitution Check

*Evaluated before research and rechecked against the completed design.*

| Gate | Result and evidence |
|---|---|
| Security/privacy | PASS FOR DESIGN: CSV input remains untrusted; protected originals, strict parser limits, inert cells, redacted telemetry and export escaping are specified in threat model. No added AI data disclosure. |
| Identity/least privilege | PASS FOR DESIGN: existing Admin and entity checks map to all import/account/review/apply actions; service parser has no Bedrock invocation permission. See authorization matrix. |
| Financial integrity/audit | PASS FOR DESIGN: imported/derived/missing fields are explicit, basis uses documented precedence, row accounting and reconciliation apply, snapshots/review revisions are immutable. See normalization contract and data model. |
| Architecture/scale | PASS FOR DESIGN: bounded CSV jobs reuse the API/runtime and object storage; no additional worker tier or BDA workflow. ADR compares alternatives and records limits. |
| Verification/recovery | PASS FOR DESIGN: quickstart specifies conformance, exact arithmetic, history, replay, isolation and restart/rollback evidence. No test/build claims are made for unimplemented CSV code. |
| Legal/incident readiness | PASS FOR PLANNING: update existing inventory/data flow for CSV imports; known project-level risks stay recorded and are not presumed resolved. No new third-party extraction purpose. |

Post-design check: contracts make no provider fallback, monthly-only snapshot, cross-account overwrite or unaudited correction path possible. Product questions and explicit planning defaults are recorded in the spec. For the currently supported US-only statement workflow, absent currency and asset classification receive explicit `USD` and `unknown` defaults; other missing source values remain unavailable unless a named derivation applies. No unresolved technical dependency prevents task generation.

## Documented Exceptions

[EX-030-003](../030-user-ip-rate-limiting/evidence/EX-030-003.md): Robert Patch's 2026-09-16 production release rule requires the exact canonical main push to pass both named security jobs; it supersedes the previous extra manual approval/expiry gates. Scope is production release eligibility, not weakened application controls or a claim that recorded operational risks are remediated. See that record for execution constraints and linked risk evidence. This revision is planning work only.

## Design Decisions

### CSV parsing and evidence

Use `csv-parse` with string output, BOM handling, quote/escape support, no type/date casting, and strict record/field limits. Parse to arrays so duplicate headers cannot silently overwrite cells. Recognize the positions title/blank prefix before validating the header and data widths; allow variable widths only in the array tokenizer for metadata, then enforce exact accepted-header widths on every populated holding/control record; never skip malformed records. Each source record gets a disposition. Field provenance identifies record ordinal, physical line span, column index/header and raw token.

Adapters: `positions_v1`, `merrill_holdings_v1`, and reviewed `mapped_csv_v1` profiles. Detection is based on headers, not account names or filenames. Unknown layouts enter mapping review; format drift cannot invoke AI. See [csv-normalization.md](./contracts/csv-normalization.md).

### Financial semantics

Prefer complete imported basis; otherwise derive basis = source value - signed source unrealized dollar gain/loss. When dollars are absent but a valid gain/loss percentage is present, derive the explicitly labeled estimate `basis = value / (1 + ratio)`. When both are absent and source unit price is exactly $1, apply the named `CASH_AT_PAR` convention: basis = value and gain/loss = 0. An explicitly classified cash holding with value but no quantity, price, basis, gain or ratio uses the named `CASH_VALUE_BASIS` convention: preserve quantity as unavailable, set basis to value and derive zero gain. Preserve explicitly incomplete basis, duplicate security rows, no-ticker cash, and unsupported instruments. Default absent statement currency to USD and absent classification to `unknown`; quote unit, price multiplier and accrual treatment must still be known before multiplication or repricing.

Totals are independent controls when provided. A missing total produces `NOT_PROVIDED` status without a review finding. Missing day change remains unavailable and is omitted from the current UI rather than creating a finding. Basis remains unavailable only when no supported rule applies. All financial derivations carry rule version and operands. The reviewed CSV value owns the source snapshot even when displayed price times quantity differs by valid rounding.

### Confirmed price feature flag

- `REAL_TIME_EQUITIES_ENABLED` is a server-side boolean, default `false` when omitted, strictly validated at startup. Surface the effective mode through the report capability/status response; a client flag cannot authorize provider work.
- False: holdings/metrics/exports use approved CSV price/value and imported or safely derived unrealized gain. Ignore newer cached quotes for current CSV valuations. Disable mount-triggered, manual and scheduled Liquidity quote refresh; the refresh action becomes local query reload. Preserve stored market history separately.
- True: reuse existing market-data API/providers for eligible equity instruments and explicitly supported equity funds. Guard identity, quote unit/multiplier, currency and timestamp; other assets retain CSV value. Quantity and basis stay fixed; recompute displayed unrealized gain from quoted value and that basis.
- Turning false again restores source values immediately without deleting quote history. Invalidate/query-key current valuations by mode/config revision. A change during a job or cache lifetime cannot leak a quote-based value into CSV-only mode.
- Historical points retain original valuation-mode provenance; do not relabel prior quote observations as CSV. These rules apply to Liquidity entry points only, without disabling unrelated market-data consumers.

### Publication and freshness

Use full-account snapshots with explicit completeness acknowledgment and an added/removed/changed preview. Support confirmed empty accounts. Store `as_of_date`, optional exact `as_of_at`, source zone, precision and reviewed effective ordering; preserve upload time separately. Default same-date files to correction revisions unless reliable intraday ordering exists. Older uploads remain historical.

Configure account cadence as every 14 days, calendar monthly or on demand. Show per-account age and portfolio date range; do not enforce one upload per month. Review and apply are version-bound and idempotent.

### Liquidity integration

Replace the source dependency in `consolidatedHoldings.service.ts` and move `SourceHoldingRecord` ownership out of Plaid. Stage neutral account/freshness types in `packages/types/src/reports.ts`; preserve table/chart behavior but remove promises of daily Plaid sync and fake connection IDs.

Current reports sum known basis without exposing completeness: add coverage metadata and labels. Existing market-data eligibility is mostly symbol/quantity/USD; add instrument/quote-unit eligibility before any CSV asset can be repriced. Keep raw symbols (including slash class shares) separate from vetted provider aliases.

Historical source composition currently assumes a portfolio-wide snapshot: rebuild it from each selected account's latest approved observation on/before each valuation date. Keep existing recorded valuation evidence immutable; new/backfilled history carries lineage and does not infer trades or investment returns from balance differences.

### Runtime, migration and retirement

Reuse storage utilities without extracting a broad document-ingestion framework. `complete` validates the immutable object, creates a durable parse job, returns 202. The existing API process claims bounded jobs via DB leases and processes CSV streams outside a long transaction. Lease expiry safely retries transient work; parser/review failures await correction. No SQS/EventBridge/Bedrock configuration is added for CSV.

Add neutral tables, backfill legacy account/snapshot/position references, then compare reports and activate CSV-backed accounts. Split legacy portfolio-wide snapshots into per-account snapshots while retaining original parent IDs. Revoke Plaid only after repeated successful CSV updates/corrections and rollback tests. Preserve financial history and keep K-1 ingestion resources in place.

## Project Structure

### Documentation

```text
specs/031-liquidity-redesign-statement-upload/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    architecture-decision.md
    authorization-matrix.md
    csv-normalization.md
    csv-import-schema.json
    liquidity-statements.openapi.yaml
    migration-rollout.md
    observability-cost-contract.md
    threat-model.md
```

`csv-import-schema.json` replaces the unimplemented PDF/provider `extraction-schema.json`. `tasks.md` is generated later by speckit-tasks.

### Source Code (planned changes)

```text
apps/api/src/
  infra/db/migrations/
  modules/liquidity-statements/
    csv/{parse,profiles,normalize,reconcile,decimal}.ts
    liquidity-statement.{repository,service,handler,routes,zod}.ts
    csv-processing.service.ts
  modules/liquidity-sources/
  modules/reports/{consolidatedHoldings,liquidityPerformance}.service.ts
  modules/market-data/{market-data.service,liquidity-valuation.repository}.ts
  modules/plaid/                    # compatibility, then retirement
apps/api/tests/liquidity-statements/
apps/web/src/features/reports/
  components/{LiquidityCsvUploadDialog,LiquidityCsvReview,LiquiditySourceAccountManager}.tsx
  components/ConsolidatedHoldingsReport.tsx
  hooks/useConsolidatedHoldings.ts
  utils/liquidityPerformanceAnalytics.ts
packages/types/src/{liquidity-statements,reports}.ts
infra/aws/terraform/                # only necessary prefix/IAM/config changes
```

**Structure Decision**: Existing API owns bounded deterministic parsing; report/market-data owners keep their responsibilities. Provider-neutral account snapshots decouple imports from both Plaid connections and K-1 documents.

## Implementation Sequence

1. Characterize source reads, report metrics/coverage, current pricing eligibility, historical composition and exports with synthetic fixtures.
2. Add exact-decimal and CSV adapter/conformance tests for both layouts, row evidence, all financial rules and malicious inputs.
3. Add neutral accounts/snapshots/positions/import tables and idempotent legacy backfill with stable parent provenance.
4. Implement protected CSV upload, durable bounded parse jobs, profiles, normalization, reconciliation, safe errors and audit.
5. Build concise review/account binding/mapping, full-replacement preview, coverage acknowledgment, immutable corrections and atomic apply.
6. Switch neutral current reads, coverage-aware aggregation, eligible price enrichment and account-by-account history; preserve UI and exports.
7. Add CSV controls, per-account freshness/cadence and `REAL_TIME_EQUITIES_ENABLED=false` configuration/capability. Exercise false/true/false transitions, provider-call suppression, cached quotes, multiple uploads/month, corrections, old imports and empty accounts.
8. Verify migration/equivalence/recovery and activate CSV account sources. Observe two successful replacement rounds on included accounts plus failure/correction cases; do not require a calendar-month wait.
9. Retire Plaid integrations/credentials through the documented operator procedure; keep legacy source history and unrelated K-1 BDA intact.
10. Complete application/security/migration/infrastructure checks applicable to changed surfaces. Produce measured parser bounds and conformance evidence.

## Complexity Tracking

No new constitutional exception or always-on tier. Versioned adapters, exact calculations, review and immutable account snapshots address demonstrated source differences. A PDF/AI provider system would add unrelated cost and uncertainty to already structured inputs.
