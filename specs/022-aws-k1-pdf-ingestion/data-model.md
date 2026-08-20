# Phase 1 Data Model: AWS K-1 PDF Ingestion

**Date**: 2026-08-17  
**Feature**: [spec.md](./spec.md)  
**Research**: [research.md](./research.md)

## Design Goals

- Preserve one durable record per uploaded file and per extraction attempt.
- Retain original provider output and field-level source evidence without logging sensitive values.
- Reuse the existing `documents`, `k1_documents`, `k1_field_values`, `k1_issues`, tracker-year, and audit concepts.
- Keep provider schemas separate from application destination keys.
- Make review and apply safe under retries, duplicate events, restarts, and concurrent edits.
- Preserve all repeated statement rows; never collapse values solely because they share a K-1 line name.

## Existing Entities Reused

### `documents`

Represents the retained source file. Extend the existing row with durable object metadata.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Existing primary key |
| `document_type` | text | Existing; `K1` for this workflow |
| `file_name` | text | Original display name; never used in object keys or logs |
| `storage_path` | text | Object-store key, not a local absolute path |
| `storage_bucket` | text nullable | Set for S3-backed documents |
| `storage_version_id` | text nullable | Captures retained S3 version when enabled |
| `mime_type` | text | Must be `application/pdf` after validation |
| `size_bytes` | bigint | Positive and within configured maximum |
| `sha256` | text | Lowercase 64-character content digest |
| `page_count` | integer nullable | Filled during validation; positive and within configured maximum |
| `uploaded_by` | uuid | Existing uploader reference |
| `uploaded_at` | timestamptz | Existing accepted-upload time |

Indexes and constraints:

- Index `sha256` for exact-duplicate lookup.
- A duplicate file may exist historically, but at most one active K-1 application for the same content is allowed within the same authorization scope.
- `storage_path` uses opaque IDs only, for example `originals/{batchId}/{itemId}.pdf`.

### `k1_documents`

Remains the document-level review and finalization record.

Add:

| Field | Type | Rules |
|---|---|---|
| `active_extraction_attempt_id` | uuid nullable | Points to the attempt currently shown in review |
| `extraction_schema_version` | text nullable | Canonical application draft schema version |
| `match_status` | text | `UNRESOLVED`, `MATCHED`, or `REQUIRES_REVIEW` |
| `applied_tracker_year_id` | uuid nullable | Set only after successful atomic apply |
| `applied_at` | timestamptz nullable | Set with tracker apply |

Keep the existing document lifecycle vocabulary for compatibility:

| Existing `processing_status` | Ingestion interpretation |
|---|---|
| `UPLOADED` | File accepted but not yet being extracted |
| `PROCESSING` | Validation, queued, submitted, extracting, or failed-with-retry |
| `NEEDS_REVIEW` | Needs match, low-confidence/invalid fields, or unresolved conflicts |
| `READY_FOR_APPROVAL` | Review complete and eligible to apply |
| `FINALIZED` | Applied to the tracker and locked |

`k1_ingestion_items.status` below supplies the more precise operational state.

### `k1_field_values`

Continue using the existing review field table, but extend it to hold typed, repeated, versioned extraction output.

Add:

| Field | Type | Rules |
|---|---|---|
| `extraction_attempt_id` | uuid | Required for new provider results |
| `canonical_path` | text | Provider-neutral draft path, such as `part_ii.item_j.profit.beginning_pct` |
| `occurrence_id` | uuid | Stable identity for one repeated row occurrence |
| `occurrence_index` | integer | Zero-based order within a repeated field |
| `value_kind` | text | `STRING`, `NUMBER`, `BOOLEAN`, `CODE_ROW`, `DATE`, `PERCENTAGE`, or `MONEY` |
| `raw_value_json` | jsonb nullable | Immutable typed provider value |
| `normalized_value_json` | jsonb nullable | Deterministically normalized value |
| `reviewer_corrected_value_json` | jsonb nullable | User correction; does not replace raw value |
| `source_locations` | jsonb | One or more `{page,bbox,textRef}` objects |
| `destination_kind` | text nullable | `CALCULATION`, `OFFICIAL`, `MATCH_SIGNAL`, `EVIDENCE_ONLY` |
| `destination_key` | text nullable | Validated application key when mapping is direct |
| `mapping_rule_version` | text | Version of the provider-neutral mapping rule |

Compatibility:

- Keep `raw_value`, `normalized_value`, `reviewer_corrected_value`, `page_number`, and `source_ref` populated for existing flat review components until they migrate to typed values.
- Extend the existing immutability trigger so raw JSON, provider confidence, attempt ID, canonical path, and source locations cannot be changed after insert.
- Retries insert a new set of field rows for a new attempt; they never delete or overwrite prior attempt rows.
- The review session returns only rows belonging to `active_extraction_attempt_id` unless the user opens attempt history.

### `k1_issues`

Reuse the current issue table and field link. Add optional `extraction_attempt_id`, `occurrence_id`, `issue_code`, and structured `details_json` so an issue can target a repeated row or whole attempt without embedding sensitive values in the message.

## New Entities

### `k1_ingestion_batches`

One user-initiated multi-file action.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `created_by_user_id` | uuid | Required |
| `entity_scope_id` | uuid nullable | Optional uploader-selected entity scope; final matching is still evidence-based |
| `status` | text | `OPEN`, `PROCESSING`, `ACTION_REQUIRED`, `COMPLETED`, `PARTIAL_FAILURE`, `CANCELLED` |
| `file_count` | integer | 1 through configured batch maximum |
| `created_at` | timestamptz | Required |
| `closed_at` | timestamptz nullable | Set when no item remains active |

Batch status is derived from item states in the same transaction that updates an item; clients must not infer correctness from a stale client-side count.

### `k1_ingestion_items`

One file slot in a batch, created before the direct S3 upload.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key and opaque S3 key component |
| `batch_id` | uuid | Required; cascade delete only while batch is `OPEN` and no object is accepted |
| `document_id` | uuid nullable | Filled when upload is accepted into `documents` |
| `k1_document_id` | uuid nullable | Filled with the review record |
| `client_file_name` | text | Display only |
| `declared_size_bytes` | bigint | Used to issue and later verify upload |
| `declared_sha256` | text | Browser-computed checksum; S3/provider checksum is authoritative |
| `object_key` | text | Unique opaque quarantine key |
| `object_version_id` | text nullable | Captured on completion |
| `status` | text | See state machine below |
| `error_code` | text nullable | Stable machine-readable code |
| `error_summary` | text nullable | PII-safe user-facing summary |
| `queued_at` | timestamptz nullable | For queue-age metrics |
| `updated_at` | timestamptz | Required |

Unique constraints:

- `object_key` is unique.
- `(batch_id, declared_sha256)` prevents a user from submitting an exact duplicate twice in one batch.
- `document_id` and `k1_document_id` are unique when non-null.

Status values:

- `PENDING_UPLOAD`
- `UPLOADED`
- `VALIDATING`
- `QUEUED`
- `PROCESSING`
- `NEEDS_MATCH`
- `NEEDS_REVIEW`
- `READY_TO_APPLY`
- `APPLIED`
- `FAILED`
- `CANCELLED`

### `k1_extraction_attempts`

Append-only record of one provider invocation.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `k1_document_id` | uuid | Required |
| `attempt_number` | integer | Starts at 1; unique per document |
| `provider` | text | `AWS_BDA`, `STUB`, or a future AWS provider |
| `provider_job_id` | text nullable | BDA invocation ARN for AWS |
| `client_token` | text | Deterministic idempotency token; unique |
| `input_s3_uri` | text nullable | Opaque S3 URI |
| `output_s3_prefix` | text nullable | Attempt-specific output prefix |
| `project_arn` | text nullable | BDA project used |
| `project_stage` | text nullable | `LIVE` in production |
| `blueprint_arn` | text nullable | Matched blueprint |
| `blueprint_version` | text nullable | Immutable version used |
| `mapping_schema_version` | text | Provider-neutral draft schema version |
| `status` | text | `CREATED`, `SUBMITTED`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `SUPERSEDED` |
| `raw_result_key` | text nullable | S3 key to complete raw BDA response |
| `raw_result_sha256` | text nullable | Integrity value |
| `custom_output_status` | text nullable | Tolerantly supports `MATCH`, `NO_MATCH`, `FALLBACK`, and unknown future values |
| `started_at` | timestamptz nullable | Required after submit |
| `completed_at` | timestamptz nullable | Required at terminal state |
| `last_reconciled_at` | timestamptz nullable | Used by status reconciler |
| `error_code` | text nullable | Stable internal code |
| `error_summary` | text nullable | PII-safe summary |

Constraints:

- `(k1_document_id, attempt_number)` is unique.
- `provider_job_id` is unique when present.
- A transaction may promote only one succeeded attempt to `k1_documents.active_extraction_attempt_id`.

### `k1_match_candidates`

Auditable candidate rows produced from normalized TIN, EIN, and names.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `k1_document_id` | uuid | Required |
| `extraction_attempt_id` | uuid | Required |
| `candidate_type` | text | `ENTITY` or `PARTNERSHIP` |
| `candidate_record_id` | uuid | Existing entity or partnership ID |
| `score` | numeric | Ranking only, never sole authority |
| `signals` | jsonb | Signal names and outcomes; omit full TIN/EIN values |
| `decision` | text | `PROPOSED`, `SELECTED`, `REJECTED` |
| `decided_by_user_id` | uuid nullable | Required for selected ambiguous candidate |
| `decided_at` | timestamptz nullable | Required with decision |

Rules:

- Normalize TIN/EIN to digits for comparison while displaying only masked values.
- Identifier and name contradictions create an issue even when a candidate is unique.
- No provider or background worker creates an entity or partnership.

### `k1_document_applications`

One reviewed attempt to apply a document to a tracker year.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `k1_document_id` | uuid | Required |
| `extraction_attempt_id` | uuid | Required; must be the active succeeded attempt |
| `tracker_year_id` | uuid | Required |
| `expected_document_version` | integer | Optimistic concurrency token |
| `expected_tracker_revision` | integer | Optimistic concurrency token |
| `mapping_rule_version` | text | Required |
| `status` | text | `PREVIEWED`, `APPLIED`, `STALE`, `FAILED`, `CANCELLED` |
| `preview_expires_at` | timestamptz | Prevents long-lived stale decisions |
| `applied_by_user_id` | uuid nullable | Required for `APPLIED` |
| `applied_at` | timestamptz nullable | Required for `APPLIED` |
| `audit_event_id` | uuid nullable | Link to the durable application audit event |

At most one application for a K-1 document may be `APPLIED`.

### `k1_application_field_decisions`

Field-level preview and conflict resolution.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `application_id` | uuid | Required |
| `destination_kind` | text | `CALCULATION` or `OFFICIAL` |
| `destination_key` | text | Valid destination inventory key |
| `source_field_value_ids` | uuid[] | One or more extracted occurrences |
| `extracted_value` | jsonb nullable | Normalized candidate |
| `existing_value` | jsonb nullable | Snapshot at preview revision |
| `decision` | text | `USE_EXTRACTED`, `KEEP_EXISTING`, `SKIP_UNMAPPED` |
| `final_value` | jsonb nullable | Must agree with the selected decision |
| `reason` | text nullable | Required for exceptional skip/override policies |

Inventory constraints are enforced in the service and covered by tests because PostgreSQL cannot validate TypeScript union keys directly.

### `k1_tracker_official_value_revisions`

Append-only per-field provenance for official-form-only values.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `tracker_year_id` | uuid | Required |
| `field_key` | text | One of the 48 official keys |
| `value_json` | jsonb nullable | Typed value |
| `source_type` | text | `FINALIZED_K1`, `MANUAL_ENTRY`, or `MANUAL_OVERRIDE` |
| `source_k1_document_id` | uuid nullable | Required for `FINALIZED_K1` |
| `source_k1_field_value_ids` | uuid[] | Supports composed values and repeated rows |
| `extraction_attempt_id` | uuid nullable | Required for `FINALIZED_K1` |
| `supersedes_revision_id` | uuid nullable | Prior active revision |
| `is_active` | boolean | One active revision per year/key |
| `created_by_user_id` | uuid | Required |
| `created_at` | timestamptz | Required |

Use a partial unique index on `(tracker_year_id, field_key) where is_active`.

`k1_tracker_years.official_form_data` remains the current materialized snapshot for API/UI compatibility. The apply transaction updates both revision rows and the snapshot.

## Canonical Extraction Draft

Provider output must map to this conceptual contract before persistence in review form:

```ts
interface K1ExtractionDraft {
  schemaVersion: string
  form: {
    family: 'SCHEDULE_K1_FORM_1065' | 'UNKNOWN'
    revisionYear: number | null
    customOutputStatus: string
  }
  values: K1ExtractedValue[]
  evidence: K1EvidenceReference[]
  validationIssues: K1DraftIssue[]
}

interface K1ExtractedValue {
  occurrenceId: string
  canonicalPath: string
  kind: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'PERCENTAGE' | 'MONEY' | 'CODE_ROW'
  rawValue: unknown
  normalizedValue: unknown
  confidence: number | null
  sourceLocations: Array<{ page: number; bbox?: [number, number, number, number]; textRef?: string }>
  destination?: { kind: 'CALCULATION' | 'OFFICIAL' | 'MATCH_SIGNAL' | 'EVIDENCE_ONLY'; key?: string }
  mappingRuleVersion: string
}
```

Provider confidence never bypasses deterministic validation or review policy.

## Destination Inventory

### Calculation-backed destinations

Only 31 of the 42 writable tracker keys are literal K-1 inputs. The inventory test must classify every writable key as one of:

- `DIRECT_K1_FIELD`
- `REVIEWED_DERIVATION`
- `DATED_ACTIVITY_AUTHORITATIVE`
- `WORKPAPER_EXCLUDED`

The following 11 fields are always `WORKPAPER_EXCLUDED`:

- `opening_outside_basis`
- `opening_suspended_loss`
- `book_capital_account`
- `book_interest_income`
- `book_dividend_income`
- `book_realized_capital_gain_loss`
- `book_other_partnership_income_loss`
- `recon_section_704c`
- `recon_section_754`
- `recon_timing_differences`
- `recon_other_permanent_differences`

The deprecated `section_l_capital_contributed` and `box_13_other_deductions` keys are never destinations.

### Official-form destinations

All 48 keys defined by `K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS` must be represented exactly once in the canonical mapper. Repeated coded sections preserve all occurrences and serialize to the existing official `{code,value}[]` snapshot only after review. Rich occurrence evidence remains in `k1_field_values` and official revision rows.

## State Transitions

### Ingestion item

```text
PENDING_UPLOAD
  | complete-upload
  v
UPLOADED -> VALIDATING -> QUEUED -> PROCESSING
   |            |           |          |
   |            |           |          +--> FAILED -- retry --> QUEUED
   |            |           +--------------> CANCELLED
   |            +--------------------------> FAILED
   +---------------------------------------> CANCELLED

PROCESSING
  | exact safe match + no review issues
  +--> READY_TO_APPLY
  | extraction issues/conflicts
  +--> NEEDS_REVIEW
  | ambiguous/missing target
  +--> NEEDS_MATCH --> NEEDS_REVIEW/READY_TO_APPLY

READY_TO_APPLY -- atomic apply --> APPLIED
NEEDS_REVIEW -- resolve all issues --> READY_TO_APPLY
```

Terminal states are `APPLIED`, `FAILED` without retry, and `CANCELLED`. A retry creates a new attempt and returns the item to `QUEUED`; it does not mutate the prior attempt.

### Extraction attempt

```text
CREATED -> SUBMITTED -> IN_PROGRESS -> SUCCEEDED
   |           |             |
   +-----------+-------------+--> FAILED

SUCCEEDED -- newer succeeded attempt promoted --> SUPERSEDED
```

Duplicate SQS messages may repeat a transition request but may not create a second attempt or second provider job for the same client token.

### Application

```text
PREVIEWED
  | document/tracker revision changed
  +--> STALE
  | validation/transaction error
  +--> FAILED
  | user cancels
  +--> CANCELLED
  | all locks and versions match
  +--> APPLIED
```

## Validation Rules

### File validation

- The batch contains 1–25 files by default.
- Declared and actual size must be positive and no more than 25 MB by default.
- Content signature and parse result must identify an unencrypted PDF; filename and browser MIME type are advisory only.
- Default page limit is 100.
- S3 checksum, declared SHA-256, and stored document hash must agree.
- Recognized Schedule K-1 (Form 1065) revision years 2000 through 2025 are supported; missing, non-integer, pre-2000, and future revision years are blocking review issues.
- `NO_MATCH`, `FALLBACK`, unknown form type, or unsupported revision can never become `READY_TO_APPLY` without review.

### Field validation

- TIN/EIN normalization retains only digits for matching and validates expected length; display and logs remain masked.
- Dates use ISO `YYYY-MM-DD`; percentages normalize consistently with the existing official-form validator.
- Money preserves sign evidence, including parentheses and trailing-minus notation, before destination-specific sign normalization.
- Mutually exclusive choices and final/amended indicators cannot both be selected unless the form contract permits it.
- Repeated coded rows require a stable occurrence ID and at least one of code, description, or value; empty generated rows are dropped.
- An unreadable or absent value remains null and produces a review issue when required; no default is invented.

### Apply validation

- The active extraction attempt is succeeded and unchanged.
- All required match decisions and review issues are resolved.
- Document version and tracker revision equal the preview tokens.
- Every field decision refers to a current extracted occurrence and an allowed destination.
- Dated activity conflicts default to `KEEP_EXISTING` and require an explicit reviewed reason to record PDF evidence without changing the canonical activity-derived value.
- Applying calculation changes increments the target tracker revision, invalidates the target and downstream sign-offs according to existing calculation rules, and recalculates projections.
- Official-only changes increment/invalidate the target year only; liability-only behavior remains consistent with the current tracker contract.

## Atomic Apply Transaction

The application service performs the following in one PostgreSQL transaction:

1. Lock `k1_documents`, `k1_tracker_years`, the application preview, and selected match rows.
2. Verify authorization, document status/version, active extraction attempt, preview expiry, and tracker revision.
3. Recompute the field inventory from current rows and verify stored decisions are complete.
4. Deactivate prior calculation revisions and insert `FINALIZED_K1` revisions with source document/field IDs for `USE_EXTRACTED` decisions.
5. Insert inactive conflict candidates or evidence-only links for `KEEP_EXISTING` decisions where audit requires them.
6. Deactivate prior official revisions, insert new official revisions, and rebuild `official_form_data` from active official revisions.
7. Recalculate the year and downstream projections, increment revision, and invalidate sign-offs using the existing tracker policy.
8. Mark the application `APPLIED`, item `APPLIED`, and K-1 document `FINALIZED`; set source links and timestamps.
9. Write one audit event containing IDs, versions, decision counts, and hashes but no raw tax values.
10. Commit. Any error rolls back every financial, status, provenance, and audit write.

## Deletion and Retention

- A pending item may be cancelled and its quarantine object removed after verifying the resolved object key is within the batch prefix.
- Once a document has an extraction attempt or review history, deletion follows the financial document-retention policy and is normally a soft delete/cancellation, not a row cascade.
- An applied document and its raw extraction evidence cannot be hard-deleted through ordinary user actions.
- S3 lifecycle transitions or expiry must not remove artifacts sooner than the corresponding database retention policy.

## Relationships

```text
k1_ingestion_batches
  `--< k1_ingestion_items
         |--0..1 documents
         |        `--1 k1_documents
         |              |--< k1_extraction_attempts
         |              |      `--< k1_field_values
         |              |--< k1_issues
         |              |--< k1_match_candidates
         |              `--< k1_document_applications
         |                        `--< k1_application_field_decisions
         |
         `-- status/progress

k1_document_applications --1 k1_tracker_years
                               |--< k1_tracker_value_revisions
                               `--< k1_tracker_official_value_revisions
```
