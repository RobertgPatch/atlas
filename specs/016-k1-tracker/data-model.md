# Data Model: Partnership Tracker

**Feature**: `016-k1-tracker`
**Date**: 2026-07-13
**Storage**: Existing PostgreSQL schema plus a compatibility migration; no new source-of-truth table is required.

## Relationship Overview

```text
Entity
  `-- Partnership
       |-- CommittedCapitalEntry (effective-dated history)
       |-- NavEntry (dated valuation history; stored as FMV snapshots)
       |-- PartnershipPerformanceSummary (derived across active years)
       `-- TrackerYear
            |-- TrackerValueRevision
            |-- YearSignoff
            `-- derived Basis/Reconciliation/Journal result
```

`PartnershipTrackerSummary` and `PartnershipTrackerDetail` are composed read models, not persisted entities.

## 1. Partnership

**Existing table**: `partnerships`

| Field | Storage | Contract | Rules |
|---|---|---|---|
| `id` | `uuid` | UUID string | Primary key |
| `entity_id` | `uuid` | `entityId` | Required; existing entity; scope boundary |
| `name` | `text` | `name` | Trimmed, 1-120 characters |
| `asset_class` | `text` | `partnershipType` | Required for new/edited v1 records; controlled list below |
| `status` | `text` | `status` | `ACTIVE`, `PENDING`, `LIQUIDATED`, or `CLOSED` |
| `notes` | `text` | `notes` | Optional, maximum 10,000 characters |
| `created_at` | `timestamptz` | `createdAt` | Server assigned |
| `updated_at` | `timestamptz` | `updatedAt` | Concurrency token for identity edits |

### Controlled Partnership Types

```text
Private Equity
Real Estate
Hedge Fund
Venture Capital
Credit
Infrastructure
Other
```

The contract calls the field `partnershipType`; legacy reporting continues to call the same stored value `assetClass`. Legacy values outside the list remain readable. An Admin editing such a record must explicitly choose a supported value.

### Identity Rules

- Unique name within an entity is case-insensitive and ignores surrounding whitespace.
- Entity changes are not part of the ordinary edit flow because they change authorization scope; use an explicit future transfer workflow if required.
- New records default to `ACTIVE`.
- Create/update actions emit audit events with before/after identity fields.

## 2. PartnershipTrackerSummary *(read model)*

Composed for directory/picker rows so the client does not issue one request per partnership.

| Field | Type | Derivation |
|---|---|---|
| `partnership` | Partnership summary | `partnerships` joined to `entities` |
| `currentCommittedCapital` | Money/date or null | Latest effective commitment on or before today |
| `latestNav` | Money/date/source or null | Greatest NAV valuation date |
| `earliestK1Year` | Integer or null | Minimum tracker tax year |
| `latestTaxYear` | Integer or null | Maximum tracker tax year |
| `latestEndingOutsideBasis` | Money or null | Summary from the greatest tracker tax year |
| `latestSectionLCapital` | Money or null | Canonical Section L ending capital from the greatest tracker tax year |
| `totalCapitalContributions` | Money or null | Sum of canonical annual contributions; null until at least one value exists |
| `totalDistributions` | Money or null | Sum of absolute annual Box 19 distributions; null until at least one value exists |
| `dpi` | Ratio or null | Cumulative distributions / cumulative contributions |
| `tvpi` | Ratio or null | (cumulative distributions + latest NAV) / cumulative contributions |
| `irr` | Ratio or null | Dated return across canonical annual cash flows and terminal NAV |
| `performanceStatus` | Status object | Per-metric availability reason for DPI, TVPI, and IRR |
| `latestWorkflowStatus` | Status or null | Workflow state for the greatest tracker tax year |
| `warningCount` | Integer | Sum or current-year count as specified by response field |

Directory ordering is deterministic: normalized partnership name, then partnership ID. Summary subqueries are set-based and must not create N+1 queries.

## 3. PartnershipTrackerDetail *(read model)*

| Field | Type | Purpose |
|---|---|---|
| `summary` | PartnershipTrackerSummary | Header and overview cards |
| `years` | TrackerYearSummary[] | Compact year navigation, descending by year |
| `commitments` | CommittedCapitalEntry[] | Descending effective-date history |
| `navEntries` | NavEntry[] | Ascending valuation-date chart series |
| `permissions` | Permission flags | View/edit/add/sign-off capabilities |

The detail response contains summaries, not every annual field. Full selected-year detail is loaded by its nested year endpoint and cached by partnership/year.

## 4. CommittedCapitalEntry

**Existing table**: `partnership_commitments`

V1 interprets each row as the total commitment effective on a date, not an incremental change.

| Field | Storage | Contract | Rules |
|---|---|---|---|
| `id` | `uuid` | UUID string | Primary key |
| `entity_id` | `uuid` | `entityId` | Must equal partnership owner entity |
| `partnership_id` | `uuid` | `partnershipId` | Required; cascade with partnership |
| `commitment_amount` | `numeric(18,2)` | `amount` | Nonnegative exact decimal |
| `commitment_date` | `date` | `effectiveDate` | Required for new v1 entries |
| `status` | `text` | `isCurrent` derivation | Latest-effective row is ACTIVE; prior rows INACTIVE |
| `source_type` | `text` | `sourceType` | New v1 writes use `manual` |
| `notes` | `text` | `note` | Optional, maximum 2,000 characters in new contract |
| `created_by_user_id` | `uuid` | actor summary | Nullable for legacy data |
| `created_at` | `timestamptz` | `createdAt` | Server assigned |
| `updated_at` | `timestamptz` | `updatedAt` | Required optimistic-concurrency token for correction/removal |

Legacy `commitment_start_date` and `commitment_end_date` remain stored but are not used by the Partnership Tracker v1 contract.

### Effective-Date Algorithm

For partnership `P` and as-of date `D`:

1. Take non-removed entries for `P` whose effective date is `<= D`.
2. For legacy null dates, use `created_at` converted to the partnership-independent UTC calendar date.
3. Sort by effective date descending, then `created_at` descending, then ID descending.
4. The first entry is the effective committed capital.

After any insert, correction, or removal, update ACTIVE/INACTIVE markers transactionally to match the latest effective entry as of today. Historical calculations never rely solely on the status marker.

### Backdating Example

```text
2022-01-01  $1,000,000
2023-06-01  $1,500,000
2022-09-01  $1,200,000  <- inserted later
```

The current value remains `$1,500,000.00`; an as-of query on 2023-01-01 returns `$1,200,000.00`.

### Correction and Removal

- PATCH requires `expectedUpdatedAt`; stale writes return 409.
- DELETE/removal requires `expectedUpdatedAt` and a confirmation in the UI.
- Before/after data is written to `audit_events`.
- Removing one entry does not modify later dated entries.

## 5. NavEntry

**Existing table**: `partnership_fmv_snapshots`

The new contract and UI call these records NAV entries. The physical table is retained for compatibility.

| Field | Storage | Contract | Rules |
|---|---|---|---|
| `id` | `uuid` | UUID string | Primary key |
| `partnership_id` | `uuid` | `partnershipId` | Required; cascade behavior follows existing schema |
| `valuation_date` | `date` | `valuationDate` | Required |
| `fmv_amount` | `numeric(18,2)` | `amount` | Nonnegative exact decimal |
| `source_type` | `text` | `sourceType` | New v1 writes use `manual`; legacy values retain source |
| `notes` | `text` | `note` | Optional, maximum 2,000 characters |
| `created_by` | `uuid` | actor summary | Existing column when available |
| `created_at` | `timestamptz` | `createdAt` | Server assigned |
| `updated_at` | `timestamptz` | `updatedAt` | Optimistic-concurrency token |

### NAV Rules

- Multiple entries in the same calendar year are allowed.
- Only one current row per partnership and exact valuation date is allowed by the existing unique constraint.
- Latest NAV is greatest `valuation_date`; `created_at` and ID are deterministic legacy tie-breakers.
- Chart order is ascending `valuation_date`, then `created_at`, then ID.
- A one-point series displays a point and value but no misleading trend line.
- A zero-value series uses a padded y-domain so points remain visible.
- PATCH and DELETE require `expectedUpdatedAt` and audit before/after state.

## 6. TrackerYear

**Existing table**: `k1_tracker_years`

| Field | Storage | Contract | Rules |
|---|---|---|---|
| `id` | `uuid` | UUID string | Primary key |
| `entity_id` | `uuid` | `entityId` | Must match partnership entity |
| `partnership_id` | `uuid` | `partnershipId` | Required |
| `tax_year` | `int` | `taxYear` | 1900-2100; unique per partnership |
| `workflow_status` | `text` | `workflowStatus` | `NOT_STARTED`, `IN_PROGRESS`, `NEEDS_REVIEW`, `RECONCILED` |
| `revision` | `int` | `revision` | Positive optimistic-concurrency version |
| summary amounts | `numeric(18,2)` | decimal strings/null | Calculated server-side |
| `warning_count` | `int` | `warningCount` | Nonnegative |
| `calculation_version` | `text` | `calculationVersion` | Defaults to existing v1 engine |
| actor/time fields | UUID/timestamps | summaries/timestamps | Audit context |

### Workflow Transitions

```text
NOT_STARTED -> IN_PROGRESS -> NEEDS_REVIEW -> RECONCILED
      ^              |              |              |
      |              +--------------+--------------+
      `---------------- earlier-year deletion/invalidation
```

- Creating an empty year starts `NOT_STARTED`.
- Saving at least one manual or carryforward value moves it to `IN_PROGRESS` unless validation requires `NEEDS_REVIEW`.
- Calculation warnings or incomplete reconciliation produce `NEEDS_REVIEW`.
- Required checks and sign-offs produce `RECONCILED`.
- A materially changed earlier year invalidates later sign-off and moves affected years to `NEEDS_REVIEW`.
- Migration 019 maps legacy `IMPORTED` status to `IN_PROGRESS`; provenance on its values is retained.

### Canonical Annual Contribution

- `capital_contributions` is the only editable contribution field and feeds both outside-basis and Section L contribution rows.
- `section_l_capital_contributed` is deprecated for writes and retained only in historical revision responses/provenance.
- When the canonical active value is absent, the compatibility projection reads the active legacy value as the canonical amount.
- When both active keys exist, `capital_contributions` is authoritative. Equal values are displayed once; unequal values produce a migration/source conflict for manual resolution and are never summed.
- New validation rejects `section_l_capital_contributed` in mutation payloads while allowing old revisions to remain readable.

## 7. TrackerValueRevision

**Existing table**: `k1_tracker_value_revisions`

| Field | Purpose |
|---|---|
| `tracker_year_id` | Parent annual record |
| `field_key` | Controlled K-1/basis field vocabulary |
| `amount` | Nullable exact monetary value |
| `source_type` | V1 writes: `MANUAL_ENTRY`, `MANUAL_OVERRIDE`, or `CARRYFORWARD` |
| `carryforward_from_year_id` | Prior-year lineage |
| `override_reason` | Required for explicit override operations |
| `supersedes_value_revision_id` | Append-only revision chain |
| `is_active` | One current revision per year/field |
| actor/time fields | Audit attribution |

### V1 Source Policy

- No new `WORKBOOK_IMPORT` or `FINALIZED_K1` revisions are created by Partnership Tracker v1.
- Existing revisions of those types remain readable and retain their source references.
- Editing a legacy sourced value requires an explicit manual override reason.
- Editing a prior manual value creates a new revision; it never updates the old row in place.

## 8. Calculation Read Models

The versioned server calculation engine remains authoritative and returns:

- `BasisRollforward`
- `LossLimitation`
- `DistributionAnalysis`
- `LiabilityAnalysis`
- `SectionLReconciliation`
- `BookTaxReconciliation`
- `JournalEntrySummary`
- validation warnings and sign-off blockers

All public monetary fields are exact two-decimal strings. Missing input is `null`, not `"0.00"`.

### Liability Exclusion

Liability inputs remain part of `LiabilityAnalysis` for manual reference and carryforward only. The revised calculation version:

- sets no liability-derived amount in `BasisRollforward.totalIncreases`;
- sets no liability-relief amount in `DistributionAnalysis.distributionDecrease` or taxable excess distributions;
- excludes liability continuity checks from warning counts, workflow status, and sign-off blockers;
- excludes every liability value from partnership performance summaries; and
- retains beginning, ending, and net-change values so the user can process them manually.

The API may keep named `liabilityIncrease` and `liabilityRelief` compatibility fields during rollout, but they MUST return `"0.00"` and be marked excluded from the active calculation version. New UI summaries do not render them as calculated basis movements.

## 9. PartnershipPerformanceSummary *(derived read model)*

The performance summary is calculated on read from active `k1_tracker_value_revisions`, `k1_tracker_years`, and the latest `partnership_fmv_snapshots` row. It is not a new persistence table.

| Field | Type | Rule |
|---|---|---|
| `totalCapitalContributions` | Money/null | Sum canonical `capital_contributions`; null when no active value exists, while explicit zero contributes zero |
| `totalDistributions` | Money/null | Sum `abs(box_19_distributions)`; null when no active value exists, while explicit zero contributes zero |
| `latestSectionLCapital` | Money/null | Active `section_l_ending_capital` for greatest tax year |
| `latestNav` | Dated money/null | Greatest valuation date with deterministic legacy tie-breakers |
| `dpi` | Ratio/null | `totalDistributions / totalCapitalContributions` |
| `tvpi` | Ratio/null | `(totalDistributions + latestNav.amount) / totalCapitalContributions` |
| `irr` | Ratio/null | Dated return described below |
| `performanceStatus` | Status object | `dpi`, `tvpi`, and `irr` each report `AVAILABLE` or `MISSING_CONTRIBUTIONS`, `MISSING_NAV`, `NAV_PRECEDES_CASH_FLOWS`, `INSUFFICIENT_CASH_FLOWS`, or `AMBIGUOUS_IRR` as applicable |

Money remains an exact two-decimal string. Ratios are fixed-decimal strings such as `"0.0636"`; the UI renders DPI/TVPI as `0.06x` and IRR as `6.4%` without changing the underlying value.

### IRR Cash-Flow Series

1. For each saved tax year, add `-capital_contributions` and `+abs(box_19_distributions)` on December 31 of that tax year; combine flows sharing a date.
2. Add latest NAV as a positive terminal flow on its exact valuation date. If that date shares a date with an annual flow, combine them.
3. Preserve actual dates and gaps between nonconsecutive years.
4. Require at least one negative and one positive combined cash flow.
5. Return `null` plus `NAV_PRECEDES_CASH_FLOWS`, `INSUFFICIENT_CASH_FLOWS`, or `AMBIGUOUS_IRR` when terminal NAV is stale for the series or a supported unique result cannot be determined.
6. Liability values, committed capital, legacy capital activity, and inactive revisions never enter the series.

## 10. YearSignoff

**Existing table**: `k1_tracker_signoffs`

Sign-off retains tracker year, reviewed revision, type (`PREPARED`, `REVIEWED`, `INVALIDATED`), actor, reason, and timestamp. A partnership identity, K-1, or carryforward change invalidates only sign-offs whose reviewed annual result is materially affected; commitment and NAV changes do not alter tax-year calculation sign-off unless a later rule explicitly makes them calculation inputs.

## 11. Audit Events

Use existing `audit_events`. Add or retain named events for:

```text
partnership.created
partnership.updated
partnership_tracker.year.created
partnership_tracker.year.updated
partnership_tracker.year.deleted
partnership_tracker.year.recalculated
partnership_tracker.signoff.created
partnership_tracker.signoff.invalidated
partnership_tracker.commitment.created
partnership_tracker.commitment.updated
partnership_tracker.commitment.deleted
partnership_tracker.nav.created
partnership_tracker.nav.updated
partnership_tracker.nav.deleted
```

Every mutation includes object type/ID, partnership ID, actor, timestamp, and before/after JSON where applicable.

## 12. Migrations 019 and 020

`019_partnership_tracker.sql` should:

1. Add an index on commitments ordered by partnership and effective date.
2. Ensure NAV amount and commitment amount are nonnegative where legacy data permits a validated constraint; otherwise use a `NOT VALID` constraint followed by a migration audit before validation.
3. Replace the tracker-year workflow check so `IN_PROGRESS` is accepted, map `IMPORTED` rows to `IN_PROGRESS`, and remove `IMPORTED` from new writes.
4. Preserve all import tables, provenance columns, legacy source rows, assets, and capital-activity data.
5. Avoid destructive column/table renames for `asset_class` and partnership FMV snapshots.

`020_partnership_tracker_entry_overview.sql` should add only indexes or compatibility metadata required for set-based active-value aggregation. It MUST NOT add a second contribution or performance-results table. Legacy contribution revisions remain append-only; canonicalization is performed by the projection and explicit future edits so conflicting source evidence is not destroyed.

## 13. Authorization and Scope

- All reads require an authenticated session and apply existing entity membership scope.
- Admin role is required for partnership, manual K-1, commitment, NAV, delete, and sign-off mutations.
- A partnership ID in the route must resolve inside the request scope before any child resource is read or mutated.
- Response list totals and search results must be computed after scope filtering.

## 14. Concurrency

- Partnership identity PATCH uses `expectedUpdatedAt` or an equivalent revision token.
- Tracker year PATCH/DELETE uses `expectedRevision`.
- Commitment and NAV PATCH/DELETE use `expectedUpdatedAt`.
- A mismatch returns `409 STALE_REVISION` with the latest token; no silent last-write-wins behavior.

## 15. Deletion Behavior

- Tracker-year deletion retains audit history and recalculates/invalidate later years.
- Commitment/NAV deletion removes the selected record only after confirmation and emits before-state audit evidence.
- Partnership deletion is not part of v1. Status `CLOSED` or `LIQUIDATED` is used to retire a partnership while preserving tax and valuation history.
