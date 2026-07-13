# Data Model: K1 Tracker

**Feature**: `016-k1-tracker`  
**Storage**: Existing PostgreSQL database; new migration `018_k1_tracker.sql`.

## 1. Existing Entities Reused

### 1.1 `entities` and `entity_memberships`

Provide ownership scope. Every tracker read and write is constrained through the selected partnership's `entity_id` and the authenticated user's entity membership unless the user is Admin.

### 1.2 `partnerships`

Authoritative partnership identity. Tracker records never create a duplicate standalone “fund.” Relevant fields are `id`, `entity_id`, `name`, `asset_class`, `status`, and `notes`.

### 1.3 `k1_documents` and `k1_field_values`

Durable mirror of extracted and reviewed K-1 source records. The tracker reads only unsuperseded source documents and resolves each field as `reviewer_corrected_value`, then `normalized_value`, then `raw_value`. Source links are retained at field level.

### 1.4 `partnership_annual_activity`

Downstream annual summary projection for Reports and Partnership Detail. It is not the canonical tracker ledger. Compatible derived fields are upserted after each committed tracker recalculation.

### 1.5 `audit_events` and `users`

Existing immutable action history and actor identity. Tracker mutations write before/after audit payloads without copying secrets or workbook bytes.

## 2. New Persistent Entities

### 2.1 `k1_tracker_years`

**Purpose**: One canonical annual tracker identity per partnership and tax year.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `entity_id` | uuid | Required FK to `entities` |
| `partnership_id` | uuid | Required FK to `partnerships` |
| `tax_year` | int | Required, 1900-2100 |
| `workflow_status` | text | `NOT_STARTED`, `IMPORTED`, `NEEDS_REVIEW`, or `RECONCILED` |
| `revision` | int | Starts at 1; increments for every material mutation or dependent recalculation |
| `source_conflict_count` | int | Nonnegative derived/persisted counter for unresolved field conflicts |
| `warning_count` | int | Nonnegative count from the latest authoritative calculation |
| `calculation_version` | text | Identifies the rule set used for the latest calculation |
| `calculated_at` | timestamptz | Latest authoritative recalculation time |
| `created_by_user_id` | uuid | Required actor FK |
| `updated_by_user_id` | uuid | Required actor FK |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

**Constraints and indexes**:

- Unique `(entity_id, partnership_id, tax_year)`.
- Partnership must belong to `entity_id`; enforced by repository validation and a composite relationship/index where practical.
- Indexed by `(partnership_id, tax_year)` and `(entity_id, workflow_status)`.
- A row may exist as `NOT_STARTED` only when explicitly created; formula-only workbook years are not created by default.

### 2.2 `k1_tracker_value_revisions`

**Purpose**: Append-only field-level values, sources, overrides, and history. Exactly one active revision may exist per tracker year and field key.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `tracker_year_id` | uuid | Required FK to `k1_tracker_years`, cascade delete only when an audited year deletion is performed |
| `field_key` | text | Required canonical key from the field registry |
| `amount` | numeric(18,2) | Nullable when a reviewed field is explicitly unknown; otherwise exact currency value |
| `original_source_text` | text | Optional unnormalized source representation for audit/sign interpretation |
| `source_type` | text | `FINALIZED_K1`, `WORKBOOK_IMPORT`, `MANUAL_ENTRY`, `MANUAL_OVERRIDE`, or `CARRYFORWARD` |
| `source_k1_document_id` | uuid | Optional FK to `k1_documents` |
| `source_k1_field_value_id` | uuid | Optional FK to `k1_field_values` |
| `import_batch_id` | uuid | Optional FK to `k1_tracker_import_batches` |
| `source_sheet` | text | Optional workbook sheet |
| `source_cell` | text | Optional A1 cell reference |
| `carryforward_from_year_id` | uuid | Optional FK to prior tracker year |
| `override_reason` | text | Required for `MANUAL_OVERRIDE` |
| `supersedes_value_revision_id` | uuid | Optional self-reference to prior active revision |
| `is_active` | boolean | One active row per `(tracker_year_id, field_key)` |
| `created_by_user_id` | uuid | Required actor FK |
| `created_at` | timestamptz | Required; revision rows are not updated in place except transactional active-state change |

**Constraints and indexes**:

- Partial unique index on `(tracker_year_id, field_key)` where `is_active = true`.
- `MANUAL_OVERRIDE` requires nonblank `override_reason` and `supersedes_value_revision_id`.
- `WORKBOOK_IMPORT` requires `import_batch_id`, `source_sheet`, and `source_cell`.
- `FINALIZED_K1` requires `source_k1_document_id` and normally `source_k1_field_value_id`.
- `CARRYFORWARD` requires `carryforward_from_year_id`.
- New revisions are inserted and prior active rows deactivated in the same transaction.

### 2.3 `k1_tracker_import_batches`

**Purpose**: Short-lived staged preview plus durable result metadata for workbook imports.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `entity_id` | uuid | Required scope |
| `target_partnership_id` | uuid | Optional until partnership match is confirmed |
| `original_file_name` | text | Display-safe name only |
| `workbook_sha256` | text | Required content hash for idempotency |
| `status` | text | `PREVIEWED`, `COMMITTED`, `FAILED`, or `EXPIRED` |
| `preview_payload` | jsonb | Bounded staged mappings/warnings/conflicts; no workbook binary |
| `commit_decisions` | jsonb | Per-sheet/year skip, merge, replace choices after commit |
| `error_summary` | jsonb | Sanitized validation/commit errors |
| `expires_at` | timestamptz | Required for preview batches |
| `committed_at` | timestamptz | Nullable |
| `created_by_user_id` | uuid | Required Admin actor |
| `created_at` | timestamptz | Required |

**Rules**:

- Previewing never creates tracker years or value revisions.
- Commit verifies status, expiry, workbook hash, scope, target partnership, and expected partnership/year revisions.
- A committed workbook hash plus target partnership and identical decisions is idempotent.
- Preview JSON is capped and expired previews are cleared by normal maintenance/startup cleanup.

### 2.4 `k1_tracker_signoffs`

**Purpose**: Append-only preparation/review decisions linked to the exact annual revision evaluated.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `tracker_year_id` | uuid | Required FK |
| `year_revision` | int | Required revision reviewed |
| `signoff_type` | text | `PREPARED`, `REVIEWED`, or `INVALIDATED` |
| `signed_by_user_id` | uuid | Required actor FK |
| `reason` | text | Required for `INVALIDATED`, optional note otherwise |
| `created_at` | timestamptz | Required |

**Rules**:

- Review requires an active preparation sign-off for the same year revision and all checks passing.
- A user may not provide both preparation and review sign-off for the same revision.
- Material edit, source replacement, amended K-1 sync, or upstream recalculation appends `INVALIDATED` records for affected active sign-offs.
- Current sign-off state is derived from the latest records; history is never overwritten.

## 3. Canonical Field Registry

The field registry lives in code and is validated by the API. It provides label, group, source aliases, normalized sign behavior, required/completeness rule, and calculation role.

### 3.1 Opening and contribution fields

- `opening_outside_basis`
- `opening_suspended_loss`
- `capital_contributions`

### 3.2 Signed K-1 income/gain fields

- `box_1_ordinary_income_loss`
- `box_2_net_rental_real_estate_income_loss`
- `box_3_other_net_rental_income_loss`
- `box_4c_guaranteed_payments`
- `box_5_interest_income`
- `box_6a_ordinary_dividends`
- `box_7_royalties`
- `box_8_net_short_term_capital_gain_loss`
- `box_9a_net_long_term_capital_gain_loss`
- `box_10_net_section_1231_gain_loss`
- `box_11_other_income_loss`
- `box_18b_tax_exempt_income`

Positive signed values increase basis; negative signed values join the applicable loss pool according to the versioned rule registry.

### 3.3 Normalized decrease fields

- `box_12_section_179_deduction`
- `box_13_other_deductions`
- `box_18a_nondeductible_expenses`
- `box_19_distributions`
- `box_21_foreign_taxes`

These are stored as nonnegative decrease amounts after source-sign normalization. Optional subitems may attach to Box 13 or other aggregated fields and sum into the active field value.

### 3.4 Liability fields

- `liability_nonrecourse_beginning`, `liability_nonrecourse_ending`
- `liability_qualified_nonrecourse_beginning`, `liability_qualified_nonrecourse_ending`
- `liability_recourse_beginning`, `liability_recourse_ending`

### 3.5 Section L fields

- `section_l_beginning_capital`
- `section_l_capital_contributed`
- `section_l_current_year_net_income_loss`
- `section_l_other_increase_decrease`
- `section_l_withdrawals_distributions`
- `section_l_ending_capital`

The source sign is retained. The effective withdrawal/distribution used by reconciliation is normalized so the UI does not require the workbook's conflicting sign convention.

### 3.6 Book and GL fields

- `book_capital_account`
- `book_interest_income`
- `book_dividend_income`
- `book_realized_capital_gain_loss`
- `book_other_partnership_income_loss`

### 3.7 Book-tax explanation fields

- `recon_section_704c`
- `recon_section_754`
- `recon_timing_differences`
- `recon_other_permanent_differences`

## 4. Derived Read Models

Derived outputs are authoritative API responses calculated from active value revisions and ordered prior years. They are not edited directly.

### 4.1 `BasisRollforward`

- `beginningOutsideBasis`
- `contributions`
- `incomeIncrease`
- `liabilityIncrease`
- `totalIncreases`
- `currentLosses`
- `deductions`
- `distributions`
- `liabilityDecrease`
- `totalDecreases`
- `endingBeforeLimit`
- `endingOutsideBasis`
- line-level contribution list

### 4.2 `LossLimitation`

- `priorSuspendedLoss`
- `currentLossPool`
- `totalLossPool`
- `basisAvailableForLosses`
- `allowedLoss`
- `currentSuspendedLoss`
- `cumulativeSuspendedLoss`

### 4.3 `DistributionAnalysis`

- `cashOrPropertyDistribution`
- `liabilityRelief`
- `basisBeforeDistribution`
- `taxableExcessDistribution`

### 4.4 `LiabilityAnalysis`

Beginning, ending, and net change for each category plus total liability increase/decrease.

### 4.5 `SectionLReconciliation`

Reported and calculated values plus variance for beginning, contributions, current-year net income/loss, distributions, and ending balance. Calculated net income excludes contributions, distributions, and liabilities.

### 4.6 `BookTaxReconciliation`

- `endingBookCapital`
- `endingTaxBasis`
- `bookTaxDifference`
- four explained-difference values
- `totalExplainedDifference`
- `unexplainedVariance`

### 4.7 `JournalEntrySummary`

Debit-positive/credit-negative entries for Interest Income, Dividend Income, Realized Capital Gains/Losses, Partnership Income - General, and Investment in Partnership, plus `balanceCheck`.

### 4.8 `YearCheckSet`

Readable individual checks with `status`, `actual`, `expected`, `difference`, `tolerance`, and `message`:

- required source completeness
- beginning basis continuity
- liability continuity by category
- suspended-loss continuity
- Section L component variances
- book-tax unexplained variance
- journal zero balance
- negative before-limit basis
- suspended loss warning
- taxable distribution warning
- unresolved source conflict
- sign-off validity

Overall status is derived from the check set; it never recomputes business logic inline.

## 5. Calculation Rules

All amounts below are integer cents internally.

1. `liabilityChange = ending total liabilities - beginning total liabilities`.
2. `liabilityIncrease = max(0, liabilityChange)`.
3. `liabilityDecrease = max(0, -liabilityChange)`.
4. Signed K-1 income fields are split by their configured role into increases or losses.
5. `totalIncreases = contributions + configured income increases + liabilityIncrease`.
6. `basisAfterIncreases = beginningBasis + totalIncreases`.
7. `distributionDecrease = distributions + liabilityDecrease`.
8. `taxableExcessDistribution = max(0, distributionDecrease - max(0, basisAfterIncreases))` under the default worksheet order.
9. `basisAfterDistributions = max(0, basisAfterIncreases - distributionDecrease)`.
10. `totalLossDeductionPool = prior suspended categories + current configured loss/deduction categories`.
11. `allowedLossDeduction = min(totalLossDeductionPool, basisAfterDistributions)` with category-level pro-rata allocation when insufficient basis applies to more than one category.
12. `cumulativeSuspendedLossDeduction = totalLossDeductionPool - allowedLossDeduction`, retained by category and in aggregate.
13. `endingOutsideBasis = basisAfterDistributions - allowedLossDeduction`.
14. `totalDecreases = distributionDecrease + allowedLossDeduction + configured nonlimited decreases`.
15. `endingBeforeLimit` shows the unbounded workbook-style result for diagnosis, while authoritative ending basis follows the versioned IRS-worksheet calculation and never falls below zero.
16. `calculatedNetIncomeLoss` includes signed K-1 operating/income/gain/loss/deduction effects only; it excludes contributions, distributions, and liabilities.
17. `journalInvestmentAdjustment = -(interestAdjustment + dividendAdjustment + capitalAdjustment + generalIncomeAdjustment)`.
18. `journalBalanceCheck = sum(all journal entries)`.
19. `unexplainedVariance = bookTaxDifference - totalExplainedDifference`.
20. A check passes when its absolute difference is no more than 100 cents unless its rule is stricter.

The default calculation version follows the current IRS Partner's Instructions basis worksheet. The field registry identifies which loss/deduction categories are limited and how they are allocated. Transaction-specific point-in-time ordering and workbook-specific departures require a named CPA-approved calculation version. A future rule change can recalculate affected years without erasing prior audit history.

## 6. Source Resolution and Conflict Rules

1. Sync/import creates an active value only when the field is empty.
2. Identical normalized incoming values add source evidence without creating a user-visible conflict.
3. Different incoming values create a conflict; neither source silently replaces the current effective value.
4. Admin conflict resolution inserts a new active revision and links to the superseded revision.
5. Manual override requires a reason and always preserves the source value/revision.
6. A superseding or amended finalized K-1 invalidates affected sign-off and downstream years even before conflict resolution if the effective value may change.

## 7. State Transitions

### 7.1 Tracker year workflow

```text
NOT_STARTED -> IMPORTED -> NEEDS_REVIEW -> RECONCILED
      |            |             ^              |
      +----------> NEEDS_REVIEW <-+--------------+
```

- First committed workbook values set `IMPORTED` unless warnings/conflicts require `NEEDS_REVIEW`.
- Manual/finalized source creation with incomplete requirements sets `NEEDS_REVIEW`.
- Only passing checks plus valid preparation/review sign-off set `RECONCILED`.
- Any material change or upstream recalculation moves `RECONCILED` back to `NEEDS_REVIEW` and invalidates sign-off.

### 7.2 Import batch

```text
PREVIEWED -> COMMITTED
    |          
    +-------> FAILED
    `-------> EXPIRED
```

- `FAILED` commit attempts retain a sanitized error summary and create no partial tracker values.
- A new preview is required after expiry or material workbook/target change.

### 7.3 Field revision

```text
active source value -> superseded inactive revision + new active revision
```

Deletion of a field is represented by a new active revision with a null amount and an audited reason, not physical history removal.

### 7.4 Sign-off

```text
unsigned -> PREPARED -> REVIEWED
    ^           |           |
    `-----------+-- INVALIDATED
```

## 8. Annual Summary Projection

After a successful year/import transaction, recalculate the changed year and all later years, then upsert:

- `beginning_basis_amount`
- `contributions_amount`
- `interest_amount`
- `dividends_amount`
- `capital_gains_amount`
- `remaining_k1_amount`
- `total_income_amount`
- `reported_distribution_amount`
- `other_adjustments_amount`
- `ending_tax_basis_amount`
- `k1_capital_account`
- `k1_vs_tax_difference_amount`
- `excess_distribution_amount`
- `negative_basis_flag`
- `ending_basis_amount`
- source flags and `finalized_from_k1_document_id` when applicable

Projection failure rolls back the tracker mutation. Tracker detail remains canonical; reports never write derived tracker fields back into the ledger.
