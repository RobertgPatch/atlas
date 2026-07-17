# Data Model: Partnership Aggregation

## Conventions

- Financial summaries remain authenticated, scoped read projections. A durable `partnerships.aggregation_group_id` identity links independent owner records without persisting calculated totals.
- Public money is an exact decimal string with exactly two fractional digits, for example `"125000.00"`.
- Public ratios are fixed-decimal unit-ratio strings with eight fractional digits, for example `"0.25000000"`; the web formats them as percentages or multiples according to the metric.
- Dates are ISO `YYYY-MM-DD`; timestamps use existing ISO 8601 conventions.
- Missing and zero are distinct. A known zero is `"0.00"`; missing is `null` plus coverage or availability metadata.
- Money composition parses strings to integer cents, sums with `bigint`, and serializes only at the response boundary.
- Owner is the partnership UI term for the existing Entity model.

## 1. Partnership Aggregation Query

**Persistence**: none; parsed from `GET /v1/partnership-tracker/aggregation` query parameters and mirrored in browser URL state.

```text
PartnershipAggregationQuery
  search?: string
  ownerIds: UUID[]
  partnershipTypes: PartnershipType[]
  statuses: PartnershipStatus[]
  workflowStatuses: PartnershipAggregationWorkflow[]
  dataQuality: PartnershipDataQuality[]
  sort: PartnershipAggregationSort
  direction: asc | desc
  page: integer >= 1
  pageSize: 25 | 50 | 100
```

### Enumerations

```text
PartnershipAggregationWorkflow =
  NOT_STARTED | IN_PROGRESS | NEEDS_REVIEW | RECONCILED | NO_K1_YEAR

PartnershipDataQuality =
  COMPLETE | MISSING_DATA | WARNINGS

PartnershipAggregationSort =
  partnership | owner | type | status |
  commitment | paidIn | distributions | nav | unfunded |
  dpi | tvpi | irr | latestTaxYear | warningCount
```

### Query Normalization

- Multi-value query parameters use comma-separated values, are decoded, trimmed, deduplicated, and returned in canonical enumeration/name order.
- Unknown enum values, malformed UUIDs, and owner IDs outside the permitted base partnership scope are dropped.
- `search` is trimmed and limited to 200 characters; an empty value is omitted.
- Invalid `sort` becomes `partnership`; invalid `direction` becomes `asc`.
- Invalid `page` becomes `1`; invalid `pageSize` becomes `50`.
- A filter or page-size change resets `page` to `1` in the browser. If a request page exceeds the final page, the normalized response uses the last valid page; an empty result uses page `1`.

### Filter Semantics

- Authorization/entity membership scope is applied before any filter.
- Search matches partnership or owner name case-insensitively.
- Categories combine with AND.
- Values inside one category combine with OR.
- `NO_K1_YEAR` matches a null latest workflow status.
- Quality filters apply to the exclusive derived classification in section 3.

## 2. Partnership Aggregate Row

**Source**: existing `PartnershipTrackerSummary` projection composed from `partnerships`, `entities`, the current effective commitment, latest FMV/NAV snapshot, K-1 tracker years, and active value revisions.

```text
PartnershipAggregateRow
  partnership: PartnershipTrackerIdentity (includes aggregationGroupId)
  currentCommittedCapital: DatedMoney | null
  latestNav: DatedMoney | null
  latestTaxYear: integer | null
  latestWorkflowStatus: PartnershipTrackerWorkflowStatus | null
  totalCapitalContributions: Money | null
  totalDistributions: Money | null
  unfundedCommitmentAmount: Money | null
  dpi: Ratio | null
  tvpi: Ratio | null
  irr: Ratio | null
  performanceStatus: PartnershipTrackerPerformanceStatus
  warningCount: integer >= 0
  dataQuality: PartnershipDataQuality
```

The API may implement this as `PartnershipTrackerSummary & { dataQuality }`; the wire schema lists fields explicitly for compatibility and documentation.

### Source Invariants

- Current commitment is the latest effective commitment on or before the server as-of date using existing deterministic date/creation/ID tie-breakers.
- Latest NAV is selected using existing valuation date/creation/ID tie-breakers and retains its actual valuation date.
- Paid-in capital uses canonical active `capital_contributions`, falling back to legacy `section_l_capital_contributed` only when the canonical field has no active presence, per spec 017.
- Distributions and performance metrics reuse `composePartnershipPerformance` exactly; the aggregate feature does not recalculate row metrics.
- Negative signed unfunded values remain negative.
- A row is returned even if every optional financial value is missing.

## 2A. Partnership Aggregate Group

**Persistence**: only `partnerships.aggregation_group_id` is stored. Group totals and status summaries are derived on each request.

```text
PartnershipAggregateGroup
  groupKey: UUID | legacy fallback key
  name: string
  partnershipType: PartnershipType
  ownerCount: integer >= 1
  lifecycleStatuses: PartnershipStatus[]
  workflowStatuses: PartnershipAggregationWorkflow[]
  dataQuality: PartnershipDataQuality
  latestTaxYear: integer | null
  warningCount: integer >= 0
  totals: PartnershipPortfolioRollup
  members: PartnershipAggregateRow[]
```

### Grouping Invariants

- Scope and active filters apply to owner records first; remaining records are grouped before sorting and pagination.
- New independent partnerships receive a new group UUID. `Existing partnership, new owner` creation inherits the selected in-scope record's group UUID, name, and type.
- Migration 022 backfills legacy records with the same normalized name and partnership type to the earliest matching record ID as their shared group UUID.
- `members` retain independent partnership IDs and all owner-specific K-1, commitment, NAV, status, notes, and performance values.
- Additive parent values sum known member values as exact cents. Parent DPI and TVPI are recomputed from grouped totals.
- Parent IRR is not calculated for multi-owner groups; the UI labels it as owner detail only.
- Lifecycle and workflow arrays expose mixed parent states. Group quality uses warning priority, then missing data, then complete.

## 3. Partnership Data Quality

**Persistence**: none; derived once for each base-scope row.

```text
if warningCount > 0:
  WARNINGS
else if any required aggregate field is unavailable:
  MISSING_DATA
else:
  COMPLETE
```

Required aggregate fields are:

- `currentCommittedCapital`
- `totalCapitalContributions`
- `totalDistributions`
- `latestNav`
- `unfundedCommitmentAmount`
- `dpi`
- `tvpi`
- `irr`

This classification is exclusive. A warning takes priority over missing data so the quality facet counts partition the base partnership scope. Existing `performanceStatus` supplies the metric-specific reason behind `MISSING_DATA`.

## 4. Covered Money

```text
CoveredMoney
  amount: Money | null
  knownCount: integer >= 0
  totalCount: integer >= 0
```

### Invariants

- `0 <= knownCount <= totalCount`.
- `amount = null` exactly when `knownCount = 0`.
- A known `"0.00"` increments `knownCount`.
- Missing values do not contribute cents and do not increment `knownCount`.
- Negative known values contribute with their sign.
- The UI labels `knownCount / totalCount` coverage whenever coverage is incomplete.

Covered portfolio money fields:

- `committedCapital` from row `currentCommittedCapital.amount`
- `paidInCapital` from row `totalCapitalContributions`
- `distributions` from row `totalDistributions`
- `latestNav` from row `latestNav.amount`
- `unfundedCommitment` from row `unfundedCommitmentAmount`

## 5. Covered Ratio

```text
AggregateRatioStatus =
  AVAILABLE | PARTIAL_COVERAGE | NO_DATA | ZERO_DENOMINATOR

CoveredRatio
  value: Ratio | null
  status: AggregateRatioStatus
  numeratorKnownCount: integer >= 0
  denominatorKnownCount: integer >= 0
  totalCount: integer >= 0
```

### Portfolio DPI

```text
numerator = covered distributions amount
denominator = covered paid-in capital amount
value = numerator / denominator
```

### Portfolio TVPI

```text
numerator = covered distributions amount + covered latest NAV amount
denominator = covered paid-in capital amount
value = numerator / denominator
```

### Status Rules

1. `NO_DATA` when no numerator component or no denominator value is known.
2. `ZERO_DENOMINATOR` when the known paid-in total equals zero.
3. `PARTIAL_COVERAGE` when a value can be calculated but any required covered component has `knownCount < totalCount`.
4. `AVAILABLE` when a value can be calculated and every required component has full coverage.

`value` is null for `NO_DATA` and `ZERO_DENOMINATOR`. A partial ratio remains visible with its status and component coverage. The server serializes division to eight fractional ratio places using the same deterministic rounding convention as existing tracker ratios.

No aggregate IRR field exists.

## 6. Partnership Portfolio Rollup

```text
PartnershipPortfolioRollup
  partnershipCount: integer >= 0
  ownerRecordCount: integer >= 0
  committedCapital: CoveredMoney
  paidInCapital: CoveredMoney
  distributions: CoveredMoney
  latestNav: CoveredMoney
  unfundedCommitment: CoveredMoney
  dpi: CoveredRatio
  tvpi: CoveredRatio
  asOfDate: Date
  navValuationRange:
    earliest: Date | null
    latest: Date | null
```

### Invariants

- `partnershipCount` is the complete grouped-partnership count before pagination.
- `ownerRecordCount` is the number of filtered owner records contributing to group and portfolio calculations.
- Every `CoveredMoney.totalCount` and `CoveredRatio.totalCount` equals `ownerRecordCount`.
- KPI values are composed from the complete filtered row set, never the current page.
- `asOfDate` is the common server calculation date from the summary projection/request.
- NAV range uses only rows with known NAV values and dates; both ends are null when NAV coverage is zero.
- Different NAV dates are never relabeled as one common valuation date.

## 7. Aggregation Facets

```text
FacetOption<T>
  value: T
  label: string
  count: integer >= 0

PartnershipAggregationFacetSet
  owners: FacetOption<UUID>[]
  partnershipTypes: FacetOption<PartnershipType>[]
  statuses: FacetOption<PartnershipStatus>[]
  workflowStatuses: FacetOption<PartnershipAggregationWorkflow>[]
  dataQuality: FacetOption<PartnershipDataQuality>[]
```

### Facet Invariants

- Facets are calculated after authorization scope and before search or active filters.
- Facets disclose no value that has zero records in the user's base partnership scope, except canonical quality/workflow empty states may be included only if the UI needs a disabled option.
- Owner labels come from canonical joined entity names.
- Owner options sort case-insensitively by label, then ID.
- Enum options use documented display order rather than incidental database order.
- Because quality classification is exclusive, its facet counts sum to the base-scope partnership count.
- `NO_K1_YEAR` counts rows whose latest workflow status is null.

## 8. Pagination

```text
PartnershipAggregationPageInfo
  page: integer >= 1
  pageSize: 25 | 50 | 100
  totalItems: integer >= 0
  totalPages: integer >= 0
  hasPreviousPage: boolean
  hasNextPage: boolean
```

- `totalItems` equals rollup `partnershipCount` and counts groups, not owner records.
- `totalPages = ceil(totalItems / pageSize)`, with `0` for an empty result.
- Empty results normalize `page` to `1`, with both navigation flags false.
- Filtering and sorting happen before page slicing.
- The stable tie-breaker prevents duplicates or omissions for an unchanged candidate set.

## 9. Aggregation Response

```text
PartnershipAggregationResponse
  query: PartnershipAggregationQuery
  rollup: PartnershipPortfolioRollup
  facets: PartnershipAggregationFacetSet
  items: PartnershipAggregateGroup[]
  pageInfo: PartnershipAggregationPageInfo
```

The response is internally consistent for one repository snapshot/query execution. Mutations invalidate the entire aggregation query-key family instead of patching individual pages.

## 10. Sorting Rules

- String fields use case-insensitive comparison, followed by original value, partnership name, and ID.
- Money strings compare as signed integer cents.
- Ratios compare as normalized fixed-scale integer units, not floating-point numbers.
- Tax year and warning count compare as integers.
- Null primary values always appear after known values for both directions.
- `partnership` maps to partnership name; `owner` to owner name; `type` and `status` to documented labels/order.
- Default: `partnership asc`.

## 11. Authorization and Cache Relationships

```text
authenticated request
  -> requirePartnershipScope
  -> load base partnership candidates
  -> derive facets and quality
  -> normalize owner filter against base scope
  -> apply active filters
  -> group matching owner records
  -> compose portfolio and group rollups
  -> stable group sort
  -> page slice
  -> response
```

The following facts affect at least one row, rollup, facet, filter, or sort and therefore invalidate aggregation queries:

- partnership create/update, including status, type, name, and owner reassignment;
- owner rename;
- commitment create/update/delete;
- NAV create/update/delete;
- K-1 year create/update/delete, calculate/save effects, workflow/sign-off changes, warning changes;
- any future mutation of existing summary inputs.

No aggregate read creates an audit event or state transition.
