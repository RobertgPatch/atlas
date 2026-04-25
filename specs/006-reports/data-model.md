# Data Model - Reports Phased Delivery

**Feature**: `006-reports`  
**Inputs**: `spec.md`, `research.md`, existing `docs/schema/21-postgres-ddl.sql`, current Feature 010 commitment/activity implementation.

## 1. Existing Entities Reused

### 1.1 `entities`

Used for report row identity, display fields, and entity-type filtering.

Relevant fields: `id`, `name`, `entity_type`, `status`.

### 1.2 `partnerships`

Used for partnership joins, asset-class grouping, and scoped report filtering.

Relevant fields: `id`, `entity_id`, `name`, `asset_class`, `status`.

### 1.3 `partnership_commitments`

Primary commitment source for original commitment and unfunded computations. Existing update semantics are reused for eligible inline commitment edits.

Relevant fields: `id`, `entity_id`, `partnership_id`, `commitment_amount`, `status`, `source_type`, `created_at`, `updated_at`.

### 1.4 `capital_activity_events`

Used to derive paid-in and related activity-driven values.

Relevant fields: `id`, `entity_id`, `partnership_id`, `activity_date`, `event_type`, `amount`, `source_type`.

### 1.5 `partnership_fmv_snapshots`

Used for residual value and return-multiple calculations.

Relevant fields: `id`, `partnership_id`, `valuation_date`, `fmv_amount`, `source_type`, `created_at`.

### 1.6 `partnership_annual_activity`

Canonical annual report fact table keyed by `(entity_id, partnership_id, tax_year)`. Used by all three reports for consistency.

Relevant existing fields include: `interest_amount`, `dividends_amount`, `capital_gains_amount`, `total_income_amount`, `reported_distribution_amount`, `k1_capital_account`, `original_commitment_amount`, `percent_called`, `unfunded_amount`, `paid_in_amount`, `residual_value_amount`, `dpi`, `rvpi`, `tvpi`, `irr`, `ending_gl_balance`, source flags, and `notes`.

### 1.7 `audit_events`

Used for traceable report edit and undo events with before/after payloads.

## 2. Schema Extensions Planned

### 2.1 Extend `partnership_annual_activity` for full Activity Detail columns

Planned migration: `apps/api/src/infra/db/migrations/011_reports_activity_detail_columns.sql`

Columns to add (if missing):

- `beginning_basis_amount numeric(18,2)`
- `contributions_amount numeric(18,2)`
- `remaining_k1_amount numeric(18,2)`
- `other_adjustments_amount numeric(18,2)`
- `ending_tax_basis_amount numeric(18,2)`
- `book_to_book_adjustment_amount numeric(18,2)`
- `k1_vs_tax_difference_amount numeric(18,2)`
- `excess_distribution_amount numeric(18,2)`
- `negative_basis_flag boolean not null default false`
- `ending_basis_amount numeric(18,2)`

**Rationale**:

- Keeps Activity Detail on the constitution-required row key `(entity_id, partnership_id, tax_year)`.
- Allows parsed/calculated recomputation while preserving manual corrections in the same row lifecycle.

## 3. Read Models

### 3.1 `ReportFilterSet`

Represents active user filters shared by all reports.

```ts
{
  search: string;
  dateRange: string;
  entityType: string;
  entityId: string | null;
  partnershipId: string | null;
  taxYear: number | null;
  sort: string | null;
  direction: 'asc' | 'desc' | null;
  page: number;
  pageSize: number;
}
```

### 3.2 `PortfolioSummaryRow`

Row model for Phase 1 report table.

```ts
{
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  partnershipCount: number;
  originalCommitmentUsd: number | null;
  calledPct: number | null;
  unfundedUsd: number | null;
  paidInUsd: number | null;
  distributionsUsd: number | null;
  residualValueUsd: number | null;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
  editability: {
    originalCommitmentEditable: boolean;
    commitmentTarget: {
      partnershipId: string;
      commitmentId: string;
    } | null;
    reason: string | null;
  };
}
```

### 3.3 `AssetClassSummaryRow`

Grouped model for Phase 2 report table.

```ts
{
  id: string;
  assetClass: string;
  partnershipCount: number;
  originalCommitmentUsd: number | null;
  calledPct: number | null;
  unfundedUsd: number | null;
  paidInUsd: number | null;
  distributionsUsd: number | null;
  residualValueUsd: number | null;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
}
```

### 3.4 `ActivityDetailRow`

Phase 3 row model keyed by annual activity key.

```ts
{
  id: string;
  entityId: string;
  entityName: string;
  partnershipId: string;
  partnershipName: string;
  taxYear: number;
  beginningBasisUsd: number | null;
  contributionsUsd: number | null;
  interestUsd: number | null;
  dividendsUsd: number | null;
  capitalGainsUsd: number | null;
  remainingK1Usd: number | null;
  totalIncomeUsd: number | null;
  distributionsUsd: number | null;
  otherAdjustmentsUsd: number | null;
  endingTaxBasisUsd: number | null;
  endingGlBalanceUsd: number | null;
  bookToBookAdjustmentUsd: number | null;
  k1CapitalAccountUsd: number | null;
  k1VsTaxDifferenceUsd: number | null;
  excessDistributionUsd: number | null;
  negativeBasis: boolean;
  endingBasisUsd: number | null;
  notes: string | null;
  sourceSignals: {
    hasK1: boolean;
    hasCapitalActivity: boolean;
    hasFmv: boolean;
    hasManualInput: boolean;
  };
  finalizedFromK1DocumentId: string | null;
  updatedAt: string;
}
```

### 3.5 `ReportTotals`

Shared totals model used by Portfolio Summary and Asset Class Summary.

```ts
{
  originalCommitmentUsd: number;
  calledPct: number | null;
  unfundedUsd: number;
  paidInUsd: number;
  distributionsUsd: number;
  residualValueUsd: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
}
```

## 4. Write Models

### 4.1 `UpdatePortfolioOriginalCommitmentRequest`

Phase 1 inline edit request that resolves to an existing commitment target.

```ts
{
  partnershipId: string;
  commitmentId: string;
  commitmentAmountUsd: number;
}
```

Validation:

- `commitmentAmountUsd >= 0`
- `commitmentAmountUsd <= 999999999999.99`
- caller must be `Admin`

### 4.2 `UpdateActivityDetailRowRequest`

Phase 3 inline edit request.

```ts
{
  beginningBasisUsd?: number | null;
  contributionsUsd?: number | null;
  otherAdjustmentsUsd?: number | null;
  endingGlBalanceUsd?: number | null;
  notes?: string | null;
}
```

Validation:

- numeric edits must be valid finite numbers
- domain-level negatives are rejected where business rules disallow them
- stale writes produce conflict response

### 4.3 `UndoActivityDetailEditRequest`

Phase 3 undo request.

```ts
{
  rowId: string;
}
```

Behavior:

- restores only the latest successful edit in current undo window
- creates a dedicated undo audit event

## 5. State Transitions

### 5.1 Inline edit state

`idle -> editing -> saving -> saved -> undo_available -> (undone | expired)`

Rules:

- `saved` transitions immediately after persistence success.
- `undo_available` is single-step and replaced by the next successful save.
- `expired` occurs on refresh or when undo window closes.

### 5.2 Activity detail row lifecycle

`generated_from_sources -> manually_adjusted -> regenerated_with_manual_preserved`

Rules:

- parsed/calculated fields may be recomputed by finalization and capital/FMV sync.
- manual fields remain persisted unless explicitly edited.

### 5.3 Export request lifecycle

`requested -> generating -> completed | failed`

Rules:

- output must reflect active filters.
- failure must return actionable error without mutating report state.

## 6. Cross-Reference To Functional Requirements

| Data concern | FRs covered |
|--------------|-------------|
| Shared filter set and report row consistency | FR-012, FR-031, FR-045, FR-052 |
| Portfolio metrics and totals model | FR-011, FR-013, FR-015, FR-018 |
| Inline edit eligibility, validation, and persistence | FR-016, FR-017, FR-021, FR-050 |
| Single-step undo semantics | FR-051 |
| Stale edit conflict handling | FR-053 |
| Undefined weighted metric handling (`N/A`) | FR-034, FR-054 |
| Activity detail key and trigger alignment | FR-040, FR-041 |
| Export parity with active filters | FR-042, FR-043, FR-044 |
