# Data Model: Partnership Tracker Revisions

## Conventions

- Public money is an exact decimal string with two fractional digits, for example `"100000.00"`.
- Public ratios are fixed-decimal unit-ratio strings, for example `"0.07870000"`; the UI converts them to percentage display.
- Dates are ISO `YYYY-MM-DD`; timestamps are ISO 8601 with an offset.
- Missing source data is `null` plus an availability status, never an implicit zero.
- Financial derivations use integer cents and rational day fractions until final output rounding.
- Owner is the UI term for the existing Entity model and `entity_id` relationships.

## 1. Partnership

**Existing table**: `partnerships`
**Migration**: extend in `021_partnership_tracker_revisions.sql`

| Field | Database type | Null | Rule |
|---|---|---:|---|
| `id` | `uuid` | no | Existing stable partnership identity |
| `entity_id` | `uuid` FK `entities(id)` | no | Current owner; reassignment is transactional |
| `name` | `text` | no | Trimmed, 1-120 characters at API boundary |
| `asset_class` | `text` | yes | Existing Partnership Tracker type mapping |
| `status` | `text` | no | Existing `ACTIVE`, `PENDING`, `LIQUIDATED`, or `CLOSED` |
| `notes` | `text` | yes | Existing optional notes |
| `inception_date` | `date` | yes | Economic start date; cannot be after request server date |
| `management_fee_rate` | `numeric(9,8)` | yes | Unit ratio in inclusive range `0` through `1` |
| `created_at` | `timestamptz` | no | Existing creation audit timestamp; never used as economic inception |
| `updated_at` | `timestamptz` | no | Existing optimistic-concurrency token |

### Identity Contract

`PartnershipTrackerIdentity` adds:

```text
inceptionDate: Date | null
managementFeeRate: Ratio | null
```

`UpdateTrackedPartnershipRequest` adds optional `entityId`, `inceptionDate`, and `managementFeeRate`. Explicit `null` clears inception date or fee rate. `expectedUpdatedAt` remains required.

### Validation

- Name uniqueness is case-insensitive and whitespace-normalized within `entity_id`.
- `inception_date` must be a real date no later than the server request date.
- `management_fee_rate` accepts a fixed decimal unit ratio and must be between zero and one.
- A fee rate may be saved without inception or commitment, but the estimate is unavailable until all inputs exist.
- Changing financial configuration does not write K-1 values or NAV.

## 2. Owner (Entity)

**Existing table**: `entities`

No schema change is required. Deployed writes use PostgreSQL as canonical when `DATABASE_URL` is configured.

| Field | Rule |
|---|---|
| `id` | Stable owner identity referenced by memberships and partnerships |
| `name` | Trimmed, nonempty, max 200; unique case-insensitively by application rule |
| `updated_at` | Updated on rename |

Partnership and report reads resolve the current name by joining `entities`; no partnership-level owner-name copy is introduced.

## 3. Owner Reassignment Write Set

An owner change is one database transaction. Rows are selected by the stable partnership ID and updated from the source owner ID to the target owner ID.

| Table | Owner column | Partnership selector | Action |
|---|---|---|---|
| `partnerships` | `entity_id` | `id` | Update owner and `updated_at` after concurrency check |
| `document_versions` | `entity_id` | `partnership_id` | Update duplicated scope |
| `k1_reported_distributions` | `entity_id` | `partnership_id` | Update duplicated scope |
| `partnership_commitments` | `entity_id` | `partnership_id` | Update duplicated scope |
| `capital_activity_events` | `entity_id` | `partnership_id` | Update duplicated scope |
| `partnership_annual_activity` | `entity_id` | `partnership_id` | Update duplicated scope and preserve annual IDs |
| `k1_tracker_years` | `entity_id` | `partnership_id` | Update scope, increment revision, move to `NEEDS_REVIEW` |
| `k1_tracker_import_batches` | `entity_id` | `target_partnership_id` | Update batches explicitly targeted to the partnership |

`k1_documents`, `partnership_fmv_snapshots`, `k1_tracker_value_revisions`, and `k1_tracker_signoffs` have no owner column that must move; their existing parent IDs preserve association.

### Reassignment State Transition

```text
owner A + revision token
  -> validate Admin and source scope
  -> validate owner B and target scope
  -> reject normalized name collision under owner B
  -> update full write set
  -> increment every tracker-year revision
  -> workflow status NEEDS_REVIEW
  -> append INVALIDATED sign-off at each new revision
  -> audit before/after and child row counts
  -> owner B
```

Any failure rolls back every row and audit/sign-off insert. A no-op request with the current `entityId` does not invalidate sign-offs.

## 4. Canonical Annual Cash-Flow Value

**Existing sources**: `k1_tracker_years`, active `k1_tracker_value_revisions`

For each saved year:

```text
paidIn =
  active capital_contributions when that field has an active revision
  else active section_l_capital_contributed legacy value

distribution = abs(active box_19_distributions)
cashFlowDate = taxYear-12-31
```

An active revision with `amount = null` still establishes field presence. This prevents a cleared canonical value from falling back to a legacy value unintentionally.

## 5. Partnership Performance Summary

**Derived read model**: not persisted

| Field | Type | Rule |
|---|---|---|
| `totalCapitalContributions` | Money/null | Sum canonical annual paid-in values; null when no annual contribution field is present |
| `totalDistributions` | Money/null | Sum absolute annual distributions; null when no distribution field is present |
| `latestNav` | DatedMoney/null | Latest valuation date with existing deterministic tie-breakers |
| `latestEndingOutsideBasis` | Money/null | Ending outside basis for greatest tracker tax year |
| `dpi` | Ratio/null | `totalDistributions / totalCapitalContributions` |
| `tvpi` | Ratio/null | `(totalDistributions + latestNav) / totalCapitalContributions` |
| `irr` | Ratio/null | Unique dated return using terminal NAV convention below |
| `irrTerminalDate` | Date/null | Later of actual NAV date and latest annual cash-flow date |
| `irrUsesCarriedForwardNav` | boolean | True when terminal date is later than actual NAV date |
| `annualizedCashOnCashYield` | Ratio/null | `(distributions / paidIn) / activeYears` |
| `performanceAsOfDate` | Date | Server calculation date used for active-year annualization |
| `unfundedCommitmentAmount` | Money/null | Current commitment minus paid-in |
| `unfundedCommitmentPercentage` | Ratio/null | Unfunded amount divided by current commitment |
| `unrealizedGain` | Money/null | Latest NAV minus latest ending outside basis |
| `performanceStatus` | object | Availability for every nullable metric |

### Metric Availability

The shared status vocabulary becomes:

```text
AVAILABLE
MISSING_CONTRIBUTIONS
MISSING_DISTRIBUTIONS
MISSING_NAV
MISSING_INCEPTION_DATE
MISSING_COMMITMENT
MISSING_OUTSIDE_BASIS
INSUFFICIENT_CASH_FLOWS
AMBIGUOUS_IRR
```

`NAV_PRECEDES_CASH_FLOWS` remains accepted when reading old cached/test payloads during rollout but is not emitted by the revised server calculation.

`performanceStatus` contains:

```text
dpi
tvpi
irr
annualizedCashOnCashYield
unfundedCommitment
unrealizedGain
```

### IRR Terminal Convention

1. Add each annual contribution as a negative flow and each distribution as a positive flow on December 31.
2. Combine flows sharing a date.
3. Select the latest NAV source row by valuation date and deterministic tie-breakers.
4. Add the NAV amount as a positive flow on `max(latestNav.date, latestAnnualCashFlowDate)`.
5. Preserve `latestNav.date` unchanged in the source/read model.
6. Require at least one negative and one positive combined flow and one supported unique root.
7. Serialize the solved ratio to at least eight decimal places.

## 6. Management Fee Schedule

**Derived read model**: not persisted
**Endpoint**: detail-only read, optionally parameterized by `asOfDate`

```text
ManagementFeeEstimate
  partnershipId
  inceptionDate
  annualRate
  asOfDate
  status
  annualRows[]
  cumulativeEstimatedFee
```

Each `ManagementFeeAnnualRow` contains:

| Field | Type | Rule |
|---|---|---|
| `calendarYear` | integer | Year being estimated |
| `periodStart` | Date | Later of Jan 1 and inception date |
| `periodEnd` | Date | Earlier of Dec 31 and as-of date |
| `activeDays` | integer | Inclusive days with a configured partnership active period |
| `daysInYear` | 365 or 366 | Gregorian calendar denominator |
| `weightedCommittedCapital` | Money | Day-weighted commitment base for explanatory display |
| `annualRate` | Ratio | Partnership fee rate |
| `estimatedFee` | Money | Sum of segment fees, rounded to cents after annual accumulation |

### Segment Calculation

For each year, boundaries are:

- period start;
- every commitment effective date within the period;
- period end plus one day.

For adjacent boundaries `[start, next)`:

```text
segmentDays = next - start
segmentBase = latest commitment effective on or before start
segmentFeeNumerator = segmentBaseCents * rateUnits * segmentDays
segmentFeeDenominator = rateScale * daysInYear
```

No effective commitment means no fee for that segment and an incomplete-input indicator in the row. Annual and cumulative values use deterministic half-away-from-zero cent rounding.

### Fee Availability

```text
AVAILABLE
MISSING_INCEPTION_DATE
MISSING_MANAGEMENT_FEE_RATE
MISSING_COMMITMENT
```

Rate `0` is available and returns zero. An as-of date before inception is rejected as validation error rather than returning an empty schedule.

## 7. K-1 Line 13 Value Revisions

**Existing table**: `k1_tracker_value_revisions`

Add two controlled field keys:

```text
box_13_other_portfolio_deductions
box_13_management_fees
```

Move `box_13_other_deductions` into the deprecated-write key set. Existing rows are retained and returned with provenance.

### Effective Line 13 Projection

Presence, not non-null amount, controls compatibility:

| Active new-field presence | Effective calculation |
|---|---|
| Neither new key present | `abs(legacy box_13_other_deductions or 0)` |
| Either or both new keys present | `abs(other portfolio deductions or 0) + abs(management fees or 0)` |

The editor sends explicit null revisions when clearing a new field, so the year remains on the new-key model after intentional migration.

### Calculation Version

Increment from the current calculation version to a new version identifying:

- split Line 13 deduction handling;
- legacy presence fallback;
- unchanged Box 18C nondeductible basis handling;
- unchanged exclusion of liabilities from automatic basis math.

## 8. Compare Years Read Model

No persistence table is introduced. Extend `K1TrackerYearSummary` additively:

| Field | Type | Rule |
|---|---|---|
| `capitalContributed` | Money/null | Canonical `capital_contributions` for the year; use the existing legacy Section L contribution fallback only when canonical is absent; preserve explicit zero and return null for missing/cleared input |
| `distributions` | Money/null | Absolute `box_19_distributions` for the year; preserve explicit zero and return null for missing/cleared input |
| `endingOutsideBasis` | Money/null | Existing calculated year-end outside basis |

The partnership detail `years` array returns these values for every year in the same set-based/read-composition request. The client does not fetch individual year details to build the comparison.

Client state:

```text
availableYears: number[]  // sorted descending for selection/display
selectedYears: Set<number> // initialized with every available year
```

Selection invariant: when at least one year exists, at least one remains selected. There is no upper bound other than available years.

### Layout Contract

```text
metricColumnMinimum = 12rem
yearColumnMinimum = 8rem
requiredMinimumWidth = metricColumnMinimum + selectedYearCount * yearColumnMinimum
```

- If `requiredMinimumWidth <= availableTableWidth`, the table fills the available width and does not scroll horizontally.
- If `requiredMinimumWidth > availableTableWidth`, the table uses `requiredMinimumWidth` and only its table region scrolls horizontally.
- The metric column remains sticky during horizontal overflow.
- The visible rows are exactly Capital Contributed, Distributions, and Ending Outside Basis.
- Null values render an explicit unavailable placeholder; rows and columns remain present.
- The drawer header, selector, table, and close control share one `100dvh` flex column with bounded overflow so no content is clipped.

## 9. Underlying Assets Area

No data entity is introduced. The URL area enum adds `assets`; the view renders static coming-soon content and makes no asset API request.

## 10. Audit Events

Reuse existing events and enrich payloads:

```text
entity.updated
  before/after owner name

partnership_tracker.partnership.updated
  before/after identity, inception, fee rate, owner
  owner reassignment child row counts when applicable

partnership_tracker.signoff.invalidated
  partnershipId, trackerYearId, revision, reason=Partnership owner changed
```

Management configuration changes are covered by the partnership update event. Derived metric reads do not emit audit events.

## 11. Concurrency and Authorization

- Entity rename: Admin-only; PostgreSQL row lock and database duplicate check when configured.
- Partnership edit/reassignment: Admin-only; `expectedUpdatedAt` required; source and target owner must be in request scope unless global Admin scope semantics already grant all entities.
- K-1 Line 13 edits: existing tracker-year `expectedRevision`; material edit invalidates this and later affected calculations per current behavior.
- Management fee estimate: authenticated scoped read; configuration mutation follows partnership edit permission.
- Compare Years and Underlying Assets: authenticated scoped reads through the parent partnership detail.

## 12. Migration 021

`021_partnership_tracker_revisions.sql`:

1. Adds nullable `partnerships.inception_date`.
2. Adds nullable `partnerships.management_fee_rate numeric(9,8)`.
3. Adds a named check constraint for rate range, using `NOT VALID` only if legacy rollout mechanics require it.
4. Does not modify or delete existing K-1 field revisions.
5. Does not backfill inception from `created_at`.
6. Does not create a performance or management-fee results table.

Rollback of the application must tolerate the additive columns. A database rollback may drop only the two new columns after confirming no configuration data must be retained.
