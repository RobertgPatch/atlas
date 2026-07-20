# Data Model: Multi-PDF K-1 Import

**Branch**: `020-k1-pdf-import`
**Date**: 2026-07-19
**Migration target**: `apps/api/src/infra/db/migrations/026_k1_pdf_import.sql`

## Design Goals

- Keep the original PDF and every provider result separate from final tracker values.
- Preserve every source box/code/detail and statement line, including unknowns.
- Make extraction and review retryable without duplicating items or final revisions.
- Apply several reviewed years atomically into the existing K-1 tracker.
- Trace every imported tracker or official-form value back to batch, document, run, item, page, and reviewer decision.
- Leave workbook import, manual entry, calculations, dated cash activity, and signoff semantics intact.

## Relationship Overview

```text
partnerships
  `-- k1_pdf_import_batches
        |-- k1_pdf_import_documents -- documents -- k1_documents
        |     |-- k1_pdf_extraction_runs
        |     |     |-- k1_pdf_extraction_candidates
        |     |     `-- k1_pdf_extracted_items
        |     |             |-- k1_pdf_validation_findings
        |     |             `-- k1_pdf_review_decisions
        |     `-- k1_pdf_year_mappings -- k1_tracker_years
        `-- batch-level findings/decisions

k1_pdf_extracted_items
  |-- k1_tracker_value_revisions (source_pdf_item_id)
  |-- k1_tracker_official_form_sources
  `-- k1_tracker_code_value_revisions
```

## Existing Entities Reused

### `documents`

One row remains the system document identity. For an uploaded PDF:

- `document_type = 'K1'`
- `file_name` stores the user-visible original filename.
- `storage_path` stores the opaque S3 object key in production or storage-root-relative path locally.
- `mime_type = 'application/pdf'`
- `uploaded_by` and `uploaded_at` retain intake provenance.

The PDF bytes do not enter PostgreSQL.

### `k1_documents`

One row represents the Schedule K-1 source document and supports existing PDF/review links.

- `document_id` references `documents`.
- `partnership_id` is set to the selected target partnership at intake.
- `tax_year` remains nullable until detection succeeds.
- `partnership_name_raw`, `is_amended`, and the broad existing processing status are filled from reviewed extraction metadata.
- Detailed batch processing remains in the PDF-import tables below; the legacy status is mirrored only for compatibility.

### `k1_tracker_years`

No calculation column changes. Applied imports create or update existing year rows and persist accepted official fields in `official_form_data`.

### `k1_tracker_value_revisions`

Extend the source vocabulary and provenance:

- Add `PDF_IMPORT` to `source_type`.
- Add nullable `pdf_import_batch_id uuid references k1_pdf_import_batches(id)`.
- Add nullable `source_pdf_item_id uuid references k1_pdf_extracted_items(id)`.
- For `source_type = 'PDF_IMPORT'`, require batch, source document, and source item IDs; workbook `source_sheet`/`source_cell` requirements remain unchanged.
- Keep `source_k1_document_id` populated so existing source-document joins continue to work.

## New Entities

### 1. `k1_pdf_import_batches`

One user-visible import operation for one partnership.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `entity_id` | uuid | Required FK to `entities`; must equal partnership entity |
| `partnership_id` | uuid | Required FK to `partnerships` |
| `status` | text | Batch lifecycle enum below |
| `revision` | int | Starts at 1; increments on document/review/apply mutations |
| `document_count` | int | `1..20` for MVP |
| `uploaded_count` | int | Derived/persisted count, `0..document_count` |
| `ready_count` | int | Derived/persisted count, `0..document_count` |
| `failed_count` | int | Derived/persisted count, `0..document_count` |
| `workflow_execution_arn` | text | Nullable; unique when present |
| `extractor_config_version` | text | Required once queued |
| `mapping_version` | text | Required once queued |
| `error_code` | text | Nullable coarse code; never raw provider text |
| `created_by_user_id` | uuid | Required actor |
| `created_at` | timestamptz | Required |
| `processing_started_at` | timestamptz | Nullable |
| `review_ready_at` | timestamptz | Nullable |
| `applied_at` | timestamptz | Nullable |
| `cancelled_at` | timestamptz | Nullable |
| `updated_at` | timestamptz | Required |

Indexes:

- `(partnership_id, created_at desc)` for recent batch history.
- `(status, updated_at)` for stuck-workflow monitoring.
- Unique partial index on `workflow_execution_arn` where non-null.

### 2. `k1_pdf_import_documents`

One expected PDF within a batch.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key; also used in object-key prefix |
| `batch_id` | uuid | Required FK to batch |
| `document_id` | uuid | Nullable until upload verified; FK to `documents` |
| `k1_document_id` | uuid | Nullable until upload verified; FK to `k1_documents` |
| `client_file_id` | text | Required, unique within batch; opaque browser correlation ID |
| `original_file_name` | text | Required, sanitized for display only |
| `object_key` | text | Required, globally unique opaque S3 key |
| `object_version_id` | text | Nullable; required after verified upload when bucket versioning is enabled |
| `expected_size_bytes` | bigint | `1..25 MiB` |
| `actual_size_bytes` | bigint | Nullable until verified; must match object |
| `declared_sha256` | text | Required lowercase 64-hex from browser |
| `verified_sha256` | text | Nullable until worker verification; must equal declared hash before extraction |
| `status` | text | Document lifecycle enum below |
| `detected_tax_year` | int | Nullable, `1900..2100` |
| `detected_partnership_name` | text | Nullable extracted identity |
| `detected_partnership_ein_last4` | text | Nullable; display-safe comparison only |
| `detected_partner_name` | text | Nullable |
| `detected_partner_tin_last4` | text | Nullable |
| `detected_is_amended` | boolean | Nullable until extracted |
| `page_count` | int | Nullable, positive, bounded by configured limit |
| `active_run_id` | uuid | Nullable FK to extraction run |
| `retry_count` | int | Starts 0, bounded by configured policy |
| `error_code` | text | Nullable controlled code |
| `error_stage` | text | Nullable controlled stage |
| `created_at` / `updated_at` | timestamptz | Required |

Constraints and indexes:

- Unique `(batch_id, client_file_id)`.
- Unique `(batch_id, object_key)` and global unique `object_key`.
- Index `(batch_id, status)`.
- Index `(batch_id, detected_tax_year)`; duplicate years become findings rather than a uniqueness violation.
- Index `(verified_sha256, status)` for duplicate-document detection.
- Raw full TIN/EIN values stay in encrypted extracted items, not status/telemetry columns.

### 3. `k1_pdf_extraction_runs`

One idempotent attempt to extract one document.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `import_document_id` | uuid | Required FK |
| `attempt_number` | int | Positive; unique per document |
| `idempotency_key` | text | Required and globally unique |
| `status` | text | `STARTED`, `SUCCEEDED`, `FAILED`, `SUPERSEDED` |
| `textract_job_id` | text | Nullable |
| `bda_invocation_arn` | text | Nullable |
| `bda_blueprint_version` | text | Required when BDA starts |
| `bedrock_inference_profile_arn` | text | Nullable configured profile |
| `bedrock_model_id` | text | Nullable resolved model identity |
| `semantic_schema_version` | text | Required |
| `prompt_version` | text | Required |
| `mapping_version` | text | Required |
| `artifact_prefix` | text | Required S3 prefix for immutable provider artifacts |
| `textract_artifact_key` | text | Nullable |
| `bda_artifact_key` | text | Nullable |
| `semantic_artifact_key` | text | Nullable |
| `input_page_count` | int | Nullable |
| `input_bytes` | bigint | Required |
| `input_tokens` / `output_tokens` | bigint | Nullable provider usage |
| `estimated_cost_usd` | numeric(12,6) | Nullable; non-negative |
| `duration_ms` | bigint | Nullable; non-negative |
| `error_code` | text | Nullable controlled code |
| `started_at` / `completed_at` | timestamptz | Required/nullable |

Provider request IDs and artifact keys are operationally sensitive and never returned to ordinary UI clients.

### 4. `k1_pdf_extraction_candidates`

Provider-specific evidence before ensemble selection.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `run_id` | uuid | Required FK |
| `candidate_key` | text | Stable source concept such as `box:13:Z:2` or `official:part_i_a_partnership_ein` |
| `provider` | text | `TEXTRACT`, `BEDROCK_BDA`, `BEDROCK_LLM` |
| `provider_field_key` | text | Nullable provider schema path |
| `raw_text` | text | Nullable immutable evidence text |
| `normalized_text` | text | Nullable |
| `normalized_amount` | numeric(18,2) | Nullable |
| `normalized_boolean` | boolean | Nullable |
| `confidence` | numeric(6,5) | Nullable, `0..1` |
| `page_number` | int | Nullable, positive |
| `bounding_box` | jsonb | Nullable normalized `{x,y,width,height,pageWidth,pageHeight,unit}` |
| `source_artifact_key` | text | Required encrypted artifact pointer |
| `created_at` | timestamptz | Required |

Unique `(run_id, candidate_key, provider, provider_field_key)` prevents duplicate pagination/retry inserts.

### 5. `k1_pdf_extracted_items`

The ensemble-selected, source-faithful item inventory used for review and mapping.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `run_id` | uuid | Required FK |
| `import_document_id` | uuid | Required FK, denormalized for efficient queries |
| `item_key` | text | Stable within run; unique `(run_id, item_key)` |
| `item_kind` | text | `IDENTIFIER`, `DATE`, `CHECKBOX`, `PERCENTAGE`, `MONEY`, `TEXT`, `BOX_CODE`, `STATEMENT` |
| `raw_box` | text | Nullable; e.g. `13`, `20`, `L`, `K` |
| `raw_code` | text | Nullable uppercase source code |
| `line_label` | text | Nullable source label |
| `statement_reference` | text | Nullable |
| `raw_text` | text | Nullable immutable source text |
| `normalized_text` | text | Nullable |
| `normalized_amount` | numeric(18,2) | Nullable |
| `normalized_boolean` | boolean | Nullable |
| `canonical_field_key` | text | Nullable; must be current tracker key when set |
| `official_form_field_key` | text | Nullable; must be current official-form key when set |
| `mapping_rule_id` | uuid | Nullable FK to mapping rule |
| `ensemble_confidence` | numeric(6,5) | Nullable, `0..1` |
| `agreement_status` | text | `AGREE`, `PARTIAL`, `DISAGREE`, `SINGLE_SOURCE` |
| `risk_class` | text | `STANDARD`, `HIGH_RISK`, `UNKNOWN_CODE`, `STATEMENT_ONLY` |
| `review_status` | text | `AUTO_ACCEPTED`, `NEEDS_REVIEW`, `VERIFIED`, `CORRECTED`, `REJECTED` |
| `page_number` | int | Nullable |
| `bounding_box` | jsonb | Nullable normalized geometry |
| `selected_candidate_ids` | uuid[] | Required non-empty evidence candidate IDs |
| `content_hash` | text | Required; deterministic hash over normalized item/evidence identity |
| `created_at` | timestamptz | Required |

Rules:

- `raw_text` and selected candidates are immutable after insert.
- Corrected values come from the latest append-only review decision, not an update to this row.
- At most one of `normalized_amount` and `normalized_boolean` is populated; `normalized_text` may accompany either for display.
- Unknown codes and statements can have both destination keys null.

### 6. `k1_pdf_code_mapping_rules`

Versioned deterministic mapping from source structure to Atlas destinations.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `mapping_version` | text | Required |
| `form_type` | text | MVP fixed to `1065_SCHEDULE_K1` |
| `tax_year_from` / `tax_year_to` | int | Inclusive range |
| `box_number` | text | Required |
| `code_pattern` | text | Nullable exact/anchored pattern |
| `destination_kind` | text | `TRACKER_FIELD`, `OFFICIAL_FIELD`, `DYNAMIC_ONLY`, `IGNORE_WITH_REASON` |
| `destination_key` | text | Nullable; validated against typed inventories |
| `aggregation` | text | `FIRST`, `SUM`, `JOIN`, `ANY_TRUE`, `NONE` |
| `sign_convention` | text | `SOURCE`, `DEDUCTION_POSITIVE`, `WITHDRAWAL_POSITIVE`, `NEGATE` |
| `risk_class` | text | Required |
| `explanation` | text | Required reviewer-facing rationale |
| `active` | boolean | Required |
| `created_at` | timestamptz | Required |

Rules are seeded from code and selected by exact `mapping_version`; changing a rule creates a new version rather than rewriting old import provenance.

### 7. `k1_pdf_validation_findings`

A deterministic or ensemble-review issue.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `batch_id` | uuid | Required FK |
| `import_document_id` | uuid | Nullable for batch-level findings |
| `extracted_item_id` | uuid | Nullable for item-level findings |
| `year_mapping_id` | uuid | Nullable for year-level findings |
| `finding_type` | text | Controlled vocabulary |
| `severity` | text | `INFO`, `WARNING`, `ERROR` |
| `blocking` | boolean | Required |
| `status` | text | `OPEN`, `RESOLVED`, `WAIVED`, `SUPERSEDED` |
| `message_code` | text | Required stable UI/localization key |
| `details` | jsonb | Non-secret structured comparison metadata; no provider payload |
| `resolution_decision_id` | uuid | Nullable FK to review decision |
| `created_at` / `resolved_at` | timestamptz | Required/nullable |

Initial finding types:

- `DUPLICATE_DOCUMENT`
- `DUPLICATE_YEAR_IN_BATCH`
- `TARGET_YEAR_EXISTS`
- `PARTNERSHIP_IDENTITY_MISMATCH`
- `PARTNER_IDENTITY_MISMATCH`
- `MISSING_TAX_YEAR`
- `LOW_CONFIDENCE`
- `EXTRACTOR_DISAGREEMENT`
- `UNKNOWN_CODE`
- `STATEMENT_DEPENDENCY`
- `NORMALIZATION_FAILED`
- `SECTION_L_MISMATCH`
- `DISTRIBUTION_MISMATCH`
- `PRIOR_YEAR_CONTINUITY`
- `MATERIAL_YEAR_OVER_YEAR_CHANGE`
- `DERIVED_VALUE_CONFLICT`
- `STALE_TARGET_REVISION`

### 8. `k1_pdf_review_decisions`

Append-only human disposition.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `batch_id` | uuid | Required FK |
| `import_document_id` | uuid | Nullable |
| `extracted_item_id` | uuid | Nullable |
| `finding_id` | uuid | Nullable |
| `decision_type` | text | `VERIFY`, `CORRECT`, `REJECT`, `MAP`, `RESOLVE`, `WAIVE`, `REOPEN` |
| `corrected_text` | text | Nullable |
| `corrected_amount` | numeric(18,2) | Nullable |
| `corrected_boolean` | boolean | Nullable |
| `destination_kind` / `destination_key` | text | Nullable mapping decision |
| `reason` | text | Required for correction, rejection, mapping, or waiver |
| `actor_user_id` | uuid | Required |
| `created_at` | timestamptz | Required |

The effective item value/status is derived from the latest decision ordered by `(created_at, id)`. Decisions are never updated or deleted.

### 9. `k1_pdf_year_mappings`

One detected document-to-tracker-year proposal and apply snapshot.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `batch_id` | uuid | Required FK |
| `import_document_id` | uuid | Required FK; unique within batch |
| `tax_year` | int | Required after review |
| `tracker_year_id` | uuid | Nullable until existing/created year resolved |
| `existing_year_revision` | int | Nullable preview revision |
| `decision` | text | Nullable until apply: `CREATE`, `MERGE`, `REPLACE`, `SKIP` |
| `expected_year_revision` | int | Nullable; required for merge/replace |
| `proposal_revision` | int | Starts 1; increments when effective items/decisions change |
| `proposal_payload` | jsonb | Exact reviewed calculation changes, official data, code items, conflicts, and source IDs |
| `proposal_hash` | text | SHA-256 of canonical proposal JSON |
| `status` | text | `PROPOSED`, `READY`, `APPLIED`, `SKIPPED`, `STALE`, `FAILED` |
| `applied_year_revision` | int | Nullable |
| `applied_at` | timestamptz | Nullable |
| `created_at` / `updated_at` | timestamptz | Required |

The apply endpoint receives `proposalRevision` and `proposalHash` so a stale review page cannot commit an older proposal.

### 10. `k1_tracker_code_value_revisions`

Applied dynamic box/code/detail and statement items for a tracker year.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `tracker_year_id` | uuid | Required FK |
| `box_number` | text | Required |
| `box_code` | text | Nullable |
| `line_label` | text | Nullable |
| `amount` | numeric(18,2) | Nullable |
| `text_value` | text | Nullable |
| `statement_reference` | text | Nullable |
| `canonical_rollup_field_key` | text | Nullable |
| `source_pdf_item_id` | uuid | Required FK |
| `source_k1_document_id` | uuid | Required FK |
| `pdf_import_batch_id` | uuid | Required FK |
| `supersedes_revision_id` | uuid | Nullable self-FK |
| `is_active` | boolean | Required |
| `created_by_user_id` | uuid | Required |
| `created_at` | timestamptz | Required |

Active uniqueness uses a deterministic logical key `(tracker_year_id, box_number, coalesce(box_code,''), source_pdf_item_id)` where `is_active`.

### 11. `k1_tracker_official_form_sources`

Companion provenance for values still stored canonically in `k1_tracker_years.official_form_data`.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `tracker_year_id` | uuid | Required FK |
| `field_key` | text | Required current official-form key |
| `entry_key` | text | Required; `scalar` or stable code-entry key |
| `imported_value` | jsonb | Required exact imported value |
| `source_pdf_item_id` | uuid | Required FK |
| `source_k1_document_id` | uuid | Required FK |
| `pdf_import_batch_id` | uuid | Required FK |
| `confidence` | numeric(6,5) | Nullable |
| `review_status` | text | Required imported review status |
| `is_active` | boolean | Required |
| `created_at` | timestamptz | Required |

When a later manual full-object update changes a field, repository diffing deactivates the imported source rows for that field. Unchanged fields retain active evidence.

## State Transitions

### Batch lifecycle

```text
UPLOADING -> QUEUED -> PROCESSING -> NEEDS_REVIEW -> READY_TO_APPLY -> APPLYING -> APPLIED
    |           |          |               |               |
    |           |          `-> PARTIAL_FAILURE              `-> NEEDS_REVIEW (stale)
    |           `-----------> FAILED
    `-----------------------> CANCELLED
```

Rules:

- `UPLOADING -> QUEUED` only after every expected object is verified.
- `PROCESSING -> PARTIAL_FAILURE` when at least one document is reviewable and at least one has a terminal failure.
- `NEEDS_REVIEW -> READY_TO_APPLY` only when all non-skipped documents have a tax year, identity decision, and no blocking open findings.
- `READY_TO_APPLY -> APPLYING -> APPLIED` occurs under an apply lock; a stale target returns the batch to `NEEDS_REVIEW` with new findings.
- `CANCELLED` is terminal and allowed only before `APPLYING`.

### Document lifecycle

```text
PENDING_UPLOAD -> UPLOADED -> QUEUED -> PROCESSING -> READY_FOR_REVIEW -> READY_TO_APPLY -> APPLIED
                                      |                  |                  `-> SKIPPED
                                      `-> FAILED -> QUEUED (retry)
PENDING_UPLOAD|UPLOADED|QUEUED|FAILED -> CANCELLED
```

### Item review lifecycle

```text
AUTO_ACCEPTED ----------------------> VERIFIED
NEEDS_REVIEW -> VERIFIED | CORRECTED | REJECTED
VERIFIED|CORRECTED|REJECTED -> NEEDS_REVIEW (append-only REOPEN decision)
```

`AUTO_ACCEPTED` is prohibited for high-risk, unknown-code, statement-only, disagreement, failed-normalization, or identity items.

## Normalized Domain Types

```ts
type EvidenceLocation = {
  page: number
  bbox: {
    x: number
    y: number
    width: number
    height: number
    pageWidth: number
    pageHeight: number
    unit: 'PIXEL' | 'POINT' | 'RATIO'
  } | null
}

type ExhaustiveK1Item = {
  itemKey: string
  kind: 'IDENTIFIER' | 'DATE' | 'CHECKBOX' | 'PERCENTAGE' | 'MONEY' | 'TEXT' | 'BOX_CODE' | 'STATEMENT'
  box: string | null
  code: string | null
  label: string | null
  statementReference: string | null
  rawText: string | null
  normalizedText: string | null
  normalizedAmount: string | null
  normalizedBoolean: boolean | null
  candidates: Array<{
    provider: 'TEXTRACT' | 'BEDROCK_BDA' | 'BEDROCK_LLM'
    value: string | boolean | null
    confidence: number | null
    evidence: EvidenceLocation | null
  }>
}

type K1ImportProposal = {
  documentId: string
  taxYear: number
  identity: { partnershipMatch: boolean; partnerMatch: boolean }
  calculationChanges: Array<{
    fieldKey: K1TrackerWritableFieldKey
    amount: K1TrackerMoney | null
    sourceItemIds: string[]
  }>
  officialFormData: K1TrackerOfficialFormData
  officialSources: Array<{
    fieldKey: K1TrackerOfficialFormFieldKey
    entryKey: string
    sourceItemId: string
  }>
  codeItems: Array<{
    box: string
    code: string | null
    amount: K1TrackerMoney | null
    text: string | null
    rollupFieldKey: K1TrackerFieldKey | null
    sourceItemId: string
  }>
  findings: K1PdfValidationFinding[]
}
```

## Deterministic Validation Rules

### File and document

- MIME must be `application/pdf`; magic bytes must begin with `%PDF-`.
- Size must be positive and at most the configured 25 MiB MVP limit.
- Browser SHA-256 and worker SHA-256 must match.
- Password-protected, unreadable, multi-K-1 packet, and page-limit failures are blocking.
- The same verified hash within one partnership is a blocking duplicate unless the prior batch was cancelled before processing and policy explicitly permits retry.

### Values

- Money accepts currency symbols, grouping commas, whitespace, parentheses, and trailing minus; normalized output is an exact two-decimal string.
- Blank, dash-only, and whitespace-only values normalize to null, never `0.00`.
- Percentages normalize to a decimal string with bounded precision and must be within the official field's allowed range.
- EIN/TIN values are normalized for identity comparison but masked outside authorized evidence views.
- Every accepted item requires at least one evidence candidate; applied values require a source document and source item.

### Ensemble and review

- Exact agreement is evaluated after deterministic normalization.
- Auto-accept requires configured agreement/confidence thresholds and a non-high-risk mapping.
- Unknown codes, statement-only values, identity fields with conflict, and provider disagreements are always reviewable.
- Reviewer correction supersedes the ensemble-selected normalized value but never changes provider candidates or raw text.

### Cross-field and cross-year

- Section L ending capital is compared with beginning capital + contributions + net income/loss + other increase/decrease - withdrawals/distributions.
- Box 19 distributions are compared with Section L withdrawals/distributions and existing dated cash activity; mismatch is a finding, not an automatic overwrite of derived cash values.
- Beginning capital/liabilities are compared with prior-year ending values when adjacent years exist.
- Duplicate detected years in the same batch are blocking until all but one are skipped or deliberately resolved.
- Material year-over-year thresholds are configurable and only produce warnings.

### Apply

- The batch revision, proposal revision/hash, and every merge/replace target revision must match.
- Every non-skipped mapping needs a reviewed identity and no blocking open findings.
- `CREATE` fails if the target exists; `MERGE`/`REPLACE` fail if absent.
- All selected mappings commit in one transaction.
- Calculation values, official-form JSON, provenance rows, dynamic code rows, projections, signoff invalidations, and audit events commit or roll back together.

## Deletion and Retention

- Cancelling a batch changes state; it does not immediately hard-delete evidence.
- Applied batches/documents/items use restrictive foreign keys so source evidence cannot be deleted while active tracker provenance references it.
- S3 lifecycle transitions and expiration are environment-configured according to the tax-record retention policy; database metadata is retained at least as long as referenced tracker revisions.
- Derived provider artifacts may have a shorter lifecycle than the original PDF only if the normalized relational evidence remains sufficient for audit and policy approves the difference.
- No cascade from partnership deletion is introduced by this feature; existing partnership deletion/reassignment rules must explicitly count and handle the new child tables.

## Audit Events

- `k1_pdf_import.batch_created`
- `k1_pdf_import.uploads_completed`
- `k1_pdf_import.processing_started`
- `k1_pdf_import.document_succeeded`
- `k1_pdf_import.document_failed`
- `k1_pdf_import.document_retried`
- `k1_pdf_import.review_decision_recorded`
- `k1_pdf_import.batch_ready`
- `k1_pdf_import.apply_started`
- `k1_pdf_import.year_created`
- `k1_pdf_import.year_merged`
- `k1_pdf_import.year_replaced`
- `k1_pdf_import.year_skipped`
- `k1_pdf_import.apply_completed`
- `k1_pdf_import.apply_rejected_stale`
- `k1_pdf_import.cancelled`

Audit payloads include opaque IDs, status transitions, counts, revisions, and action types only—not filenames, object keys, raw/normalized tax values, identity values, evidence URLs, prompts, or provider payloads.
