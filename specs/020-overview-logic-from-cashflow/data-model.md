# Data Model: Cash-Flow-Sourced Overview and Private Investment Tracker

## Model Boundary

This feature adds no reporting persistence. It reads existing operational records, maps them into exact server-side projections, and renders those projections in Overview, Private Investment Tracker, and PDF export. K-1 records remain outside the operational performance input.

## Existing Persistent Records

### Partnership

Source: `partnerships`

| Field | Type | Use |
|---|---|---|
| `id` | UUID | Durable fund-position ID |
| `entity_id` | UUID | Owner scope and composite position relationship |
| `name` | text | Fund label |
| `asset_class` | enum-like text | Summary Asset Class |
| `status` | enum-like text | Summary lifecycle Status |
| `inception_date` | date nullable | Identity metadata and fallback holding context |
| `aggregation_group_id` | UUID | Existing cross-owner aggregation only; not the private tracker key |
| `updated_at` | timestamptz | Cache/concurrency metadata |

Relationship: each owner-specific partnership belongs to one Entity. The same economic fund can have multiple Partnership records under different Entities.

### Entity

Source: `entities`

| Field | Type | Use |
|---|---|---|
| `id` | UUID | Authorization scope and summary key component |
| `name` | text | Entity label and autocomplete option |

### Capital Activity Event

Source: `capital_activity_events`

| Field | Type | Validation / Use |
|---|---|---|
| `id` | UUID | Stable activity row ID |
| `entity_id` | UUID | Must match partnership owner |
| `partnership_id` | UUID | Position relationship |
| `activity_date` | date | Ledger date and vintage/XIRR input |
| `event_type` | text | Operational types used here: `funded_contribution`, `distribution`, `recallable_distribution` |
| `amount` | numeric(18,2) | Nonzero stored magnitude; normalized to positive cents for calculations |
| `source_type` | text | Existing manual/parsed provenance |
| `notes` | text nullable | Optional detail metadata |
| `created_at` | timestamptz | Deterministic same-day sort |
| `updated_at` | timestamptz | Mutation/cache metadata |

### Partnership Commitment

Source: `partnership_commitments`

| Field | Type | Validation / Use |
|---|---|---|
| `id` | UUID | Commitment history identity |
| `entity_id` | UUID | Must match partnership owner |
| `partnership_id` | UUID | Position relationship |
| `commitment_amount` | numeric(18,2) | Nonnegative total commitment snapshot |
| `commitment_date` | date nullable | Effective date; creation date is existing fallback |
| `source_cash_flow_event_id` | UUID nullable | Links a recallable distribution to its generated cumulative snapshot |
| `created_at` | timestamptz | Effective-date tie-break |

Invariant: linked recallable snapshots already include the cumulative recallable increase. A consumer selects the latest effective snapshot and never adds recallable distributions again.

### Partnership NAV Snapshot

Source: `partnership_fmv_snapshots`

| Field | Type | Validation / Use |
|---|---|---|
| `id` | UUID | Stable valuation row ID |
| `partnership_id` | UUID | Position relationship |
| `valuation_date` | date | Ledger date and latest-NAV selection |
| `fmv_amount` | numeric(18,2) | Nonnegative valuation |
| `source_type` | text | Manager statement, 409A, K-1-labeled provenance, or manual source metadata |
| `notes` | text nullable | Optional detail metadata |
| `created_at` | timestamptz | Deterministic same-date selection |
| `updated_at` | timestamptz | Mutation/cache metadata |

Source-policy invariant: a NAV record can retain an existing provenance label, including `k1`, because it is a deliberately persisted NAV snapshot. This feature does not read K-1 field revisions or synthesize NAV from a tax value.

## Read Models

### OperationalPartnershipPerformanceInput

Canonical, server-internal input shared by Overview and private tracker summaries.

| Field | Type | Rule |
|---|---|---|
| `partnershipId` | UUID | Required |
| `asOfDate` | date | Defaults to server current date |
| `capitalCalls` | `DatedMoney[]` | `amount` is positive magnitude; at least zero rows |
| `nonRecallableDistributions` | `DatedMoney[]` | Positive magnitude |
| `recallableDistributions` | `DatedMoney[]` | Positive magnitude |
| `latestNav` | `DatedMoney \| null` | Most recent eligible snapshot; never synthesized |
| `currentCommitment` | `DatedMoney \| null` | Latest effective snapshot |
| `inceptionDate` | date nullable | Metadata only when no earlier operational date is needed |

It contains no `annualValues`, K-1 contribution, K-1 distribution, Section L, or Part III fields.

### OperationalPartnershipPerformance

| Field | Type | Derivation |
|---|---|---|
| `totalInvested` | Money | Sum capital-call magnitudes; zero when the source set is known and empty |
| `nonRecallableDistributions` | Money | Sum non-recallable magnitudes |
| `recallableDistributions` | Money | Sum recallable magnitudes |
| `totalCommitted` | DatedMoney nullable | Current effective commitment |
| `remainingCommitment` | Money nullable | `totalCommitted - totalInvested` |
| `latestValuation` | DatedMoney nullable | Latest actual NAV |
| `vintageYear` | integer nullable | Earliest capital-call year |
| `dpi` | Ratio nullable | `nonRecallableDistributions / totalInvested` |
| `tvpi` | Ratio nullable | `(nonRecallableDistributions + latestValuation) / totalInvested` |
| `xirr` | Ratio nullable | Exact dated flows plus terminal NAV |
| `xirrTerminalDate` | date nullable | Terminal date used by solver |
| `xirrUsesCarriedForwardNav` | boolean | True when terminal date is later than NAV date |
| `simplifiedIrr` | Ratio nullable | Annualized TVPI over holding period |
| `displayIrr` | Ratio nullable | XIRR when available, otherwise simplified |
| `irrType` | `XIRR \| SIMPLIFIED \| null` | Identifies displayed calculation |
| `availability` | object | Per-metric missing/ambiguous/available state |

Money outputs are exact two-decimal strings. Ratio outputs are fixed-decimal unit ratios. Missing is `null`; true zero is a valid string.

### PrivateInvestmentActivityRow

A discriminated union over operational activity and NAV records.

Common fields:

| Field | Type | Rule |
|---|---|---|
| `rowId` | string | `${sourceKind}:${sourceId}` |
| `sourceId` | UUID | Original event or snapshot ID |
| `sourceKind` | `NET_CASH_ACTIVITY \| CAPITAL_AND_NAV` | Source surface |
| `entity` | `{ id, name }` | Scoped owner |
| `partnership` | `{ id, name }` | Owner-specific fund |
| `date` | date | Activity or valuation date |
| `type` | ActivityType | Four-value normalized enum |
| `amount` | Money | Positive magnitude used for range filtering |
| `displayDirection` | `OUTFLOW \| INFLOW \| POINT_IN_TIME` | Accounting presentation |
| `sourceType` | string | Existing record provenance |
| `note` | string nullable | Optional source note |
| `createdAt` | datetime | Stable sort input |

`ActivityType`:

- `CAPITAL_CALL`
- `NON_RECALLABLE_DISTRIBUTION`
- `RECALLABLE_DISTRIBUTION`
- `VALUATION`

Rules:

- Capital call: `OUTFLOW`.
- Non-recallable and recallable distribution: `INFLOW`.
- Valuation: `POINT_IN_TIME`; it is not counted as cash flow.
- Default order: date desc, createdAt desc, type order, sourceId.

### EntityFundPosition

One lifetime summary row for an owner-specific partnership represented by the complete filtered activity set.

| Field | Type | Rule |
|---|---|---|
| `positionKey` | string | `${entity.id}:${partnership.id}` |
| `entity` | `{ id, name }` | Required |
| `partnership` | `{ id, name }` | Required |
| `assetClass` | PartnershipType | Existing classification |
| `status` | PartnershipStatus | Existing lifecycle |
| `metricScope` | literal | `LIFETIME_FOR_MATCHED_POSITION` |
| performance fields | OperationalPartnershipPerformance | Complete operational history, not filtered-event subset |

Relationship: a filtered activity set contributes a distinct `(entityId, partnershipId)` membership set. Every member is then loaded through the complete operational performance projection.

### PrivateInvestmentTrackerQuery

| Field | Type | Default / Validation |
|---|---|---|
| `types` | ActivityType[] | `[]`; canonical enum order |
| `entityIds` | UUID[] | `[]`; unique, sorted, out-of-scope removed |
| `partnershipIds` | UUID[] | `[]`; unique, sorted, must be scoped |
| `dateFrom` | date nullable | Inclusive |
| `dateTo` | date nullable | Inclusive; must be >= `dateFrom` |
| `amountMin` | Money nullable | Nonnegative magnitude |
| `amountMax` | Money nullable | Nonnegative; must be >= `amountMin` |
| `page` | positive integer | `1` |
| `pageSize` | `25 \| 50 \| 100` | `50` |

Semantics:

- Different categories use AND.
- Multiple values within a category use OR.
- Amount applies to `PrivateInvestmentActivityRow.amount`, never the formatted signed string.
- Filter change resets page to 1.

### PrivateInvestmentFacetSet

| Field | Type | Rule |
|---|---|---|
| `types` | `FacetOption<ActivityType>[]` | Authorized base-scope counts |
| `entities` | `FacetOption<UUID>[]` | Authorized entities only |
| `partnerships` | `PartnershipFacetOption[]` | Authorized owner-specific partnerships; includes entity context for duplicate names |

Facet counts are computed from the permitted base activity/valuation scope before active filters. They must not expose names or counts outside scope.

### PrivateInvestmentTrackerResponse

| Field | Type | Rule |
|---|---|---|
| `query` | PrivateInvestmentTrackerQuery | Normalized server truth |
| `positionMetricScope` | literal | `LIFETIME_FOR_MATCHED_POSITIONS` |
| `positions` | EntityFundPosition[] | Complete distinct matching membership, stable entity/fund order |
| `facets` | PrivateInvestmentFacetSet | Base scoped options |
| `activities` | PrivateInvestmentActivityRow[] | Requested filtered page |
| `pageInfo` | PageInfo | Counts complete filtered activity rows |
| `asOfDate` | date | Server calculation date |

### PrivateInvestmentPdfRequest

| Field | Type | Validation |
|---|---|---|
| `filters` | Query without page/pageSize | Same normalized scope/filter rules |
| `summaryColumns` | SummaryColumnId[] | Unique, ordered, 1..18 |
| `detailColumns` | DetailColumnId[] | Unique, ordered, 1..6 |

Summary column IDs:

`entity`, `fund`, `assetClass`, `totalCommitted`, `remainingCommitment`, `status`, `vintageYear`, `totalInvested`, `nonRecallableDistributions`, `recallableDistributions`, `valuation`, `dpi`, `tvpi`, `xirr`, `simplifiedIrr`.

Detail column IDs:

`entity`, `fund`, `date`, `amount`, `type`, `source`.

### PrivateInvestmentPdfReportModel

Server-internal immutable model generated after scope and filters are reapplied:

- title and Jackson brand label
- generation timestamp and as-of date
- human-readable active-filter summary
- ordered summary column definitions and all matching positions
- ordered detail column definitions and all matching activities
- accounting-format instructions and missing-value marker
- page/continuation metadata

The PDF renderer consumes this model and does no financial calculation.

## Availability Rules

| Metric | Available when | Unavailable state examples |
|---|---|---|
| Total invested | Operational event set loaded | Never sourced from K-1 |
| Remaining commitment | Effective commitment and known call total | `MISSING_COMMITMENT` |
| DPI | Total invested > 0 | `MISSING_CONTRIBUTIONS` |
| TVPI | Total invested > 0 and latest NAV exists | `MISSING_CONTRIBUTIONS`, `MISSING_NAV` |
| XIRR | At least one negative and positive flow plus valid terminal NAV, one root | `MISSING_NAV`, `INSUFFICIENT_CASH_FLOWS`, `AMBIGUOUS_IRR` |
| Simplified IRR | Positive TVPI and sufficient holding period | `MISSING_CONTRIBUTIONS`, `MISSING_NAV`, `INSUFFICIENT_HOLDING_PERIOD` |

## State and Data Flow

1. Session middleware establishes user and entity scope.
2. Query validation canonicalizes filters and ranges.
3. Repository unions scoped cash activity and NAV rows.
4. Active filters produce the complete matching activity set and distinct position IDs.
5. Repository loads complete operational inputs for those position IDs.
6. Canonical composer builds lifetime EntityFundPosition metrics.
7. Server returns all matching positions, facets, and one stable detail page.
8. PDF request repeats steps 1-6, loads every matching detail row, builds the report model, and renders binary PDF.
9. Operational mutations invalidate Overview, aggregation, and private tracker query families.

## Persistence and Migration Decision

No new tables, columns, or summary persistence are planned. Existing indexes cover partnership/date access paths. The performance integration test records the actual query plan; only a demonstrated index deficiency may introduce a narrowly scoped migration during implementation.
