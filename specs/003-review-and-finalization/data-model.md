# Phase 1 Data Model: K-1 Review Workspace and Finalization

Scope: this feature adds one new migration (`003_review_finalization.sql`) and defines the server-visible entity contracts the API uses. The baseline schema is `docs/schema/21-postgres-ddl.sql` plus the additions from `specs/002-k1-ingestion/data-model.md`. Additions below are the **delta** this feature ships.

## 1. Existing entities (reused)

These are defined upstream and consumed unchanged:

- `users`, `roles`, `user_roles` — identity and RBAC (001).
- `entities`, `partnerships` — financial subjects and their investment positions (base DDL).
- `entity_memberships` — per-user entity entitlement (added by 002).
- `documents` — generic file record.
- `k1_documents` — the authoritative lifecycle row for each K-1 (base DDL + 002's `parse_error_*`, `parse_attempts`, `superseded_by_document_id`, `uploader_user_id`).
- `document_versions` — supersession chain (added by 002).
- `k1_field_values` — parsed datums, including `raw_value`, `normalized_value`, `reviewer_corrected_value`, `confidence_score`, `page_number`, `source_ref`, `review_status`.
- `k1_issues` — open/resolved issues against a K-1 (base DDL).
- `k1_reported_distributions` — Box 19A reported distribution per K-1.
- `partnership_annual_activity` — annual derived record keyed by `(entity_id, partnership_id, tax_year)`.
- `audit_events` — immutable audit log.

## 2. Additions (new migration `003_review_finalization.sql`)

### 2.1 Extend `k1_documents`

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `version` | `int` | no | `0` | Monotonic optimistic-concurrency token. Incremented exactly once per successful write on this K-1 (inside the same transaction as the business mutation). Surface in responses via body field and `ETag` header. FR-010a. |
| `approved_by_user_id` | `uuid` | yes | `null` | FK → `users(id)`. Set to the acting user on Approve. Cleared to `null` on any regression from `READY_FOR_APPROVAL` back to `NEEDS_REVIEW` (see R6 in research). Consulted by the two-person rule at Finalize time. FR-018, FR-019a. |
| `finalized_by_user_id` | `uuid` | yes | `null` | FK → `users(id)`. Set to the acting user on Finalize. MUST remain `null` for non-finalized K-1s. FR-020. |

Constraints and invariants:

- `CHECK (version >= 0)`.
- `CHECK (processing_status in ('UPLOADED','PROCESSING','NEEDS_REVIEW','READY_FOR_APPROVAL','FINALIZED'))` — codified in the migration even though already enforced elsewhere.
- `CHECK (finalized_by_user_id is null) OR (processing_status = 'FINALIZED')` — `finalized_by_user_id` set implies the K-1 is finalized.
- `CHECK (approved_by_user_id is null) OR (processing_status in ('READY_FOR_APPROVAL','FINALIZED'))` — `approved_by_user_id` set implies the K-1 has been approved (or has been approved and then finalized).
- Composite index `(entity_id, partnership_id, tax_year)` already covered by 002's `k1_documents` indexing; no new index required.

Status transition semantics (this feature):

- `NEEDS_REVIEW → READY_FOR_APPROVAL` via `POST /v1/k1/:id/approve`. Sets `approved_by_user_id = auth.userId`. Emits `k1.approved`.
- `READY_FOR_APPROVAL → NEEDS_REVIEW` via the corrections handler when a previously-satisfied Approve precondition is invalidated. Clears `approved_by_user_id = null`. Emits `k1.approval_revoked` with a `cause` discriminator (`cleared_required_field`, `new_open_issue`, `unmapped_entity`, `unmapped_partnership`).
- `READY_FOR_APPROVAL → FINALIZED` via `POST /v1/k1/:id/finalize`. Sets `finalized_by_user_id = auth.userId`. Emits `k1.finalized`.
- No other transitions legal from this feature's endpoints. Any attempt returns `HTTP 409 INVALID_STATE_TRANSITION`.

### 2.2 Extend `k1_issues`

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `k1_field_value_id` | `uuid` | yes | `null` | FK → `k1_field_values(id)`. When set, identifies the specific field whose correction would resolve this issue. Auto-resolve triggers on a successful corrections save of the referenced field; unlinked issues (`NULL`) are manual-resolve only. FR-012. |
| `resolved_at` | `timestamptz` | yes | `null` | Set when `status` transitions to `RESOLVED`. |
| `resolved_by_user_id` | `uuid` | yes | `null` | FK → `users(id)`. `null` when auto-resolved by a field correction (distinguishable from manual resolve via `resolution_cause` on the `k1.issue_resolved` audit event). |

Indexes:

- `create index k1_issues_k1_field_value_id_idx on k1_issues(k1_field_value_id) where k1_field_value_id is not null;` — partial index makes the auto-resolve lookup on save cheap.
- `create index k1_issues_open_by_document_idx on k1_issues(k1_document_id) where status = 'OPEN';` — reads the open-issue list for a given K-1 in constant time.

### 2.3 No new tables

Finalize writes into the existing `partnership_annual_activity` table via upsert on its existing `(entity_id, partnership_id, tax_year)` unique constraint. No new table is needed.

### 2.4 `k1_field_values` — write discipline (no schema change)

No columns are added. The repository and corrections handler enforce by contract:

- `raw_value` is **immutable after insert**. The repository's `updateFieldCorrection()` method MUST NOT include `raw_value` in the `SET` clause. A migration-time or test-time guard is recommended (trigger-based `raise exception` on `raw_value` change) but not required for V1.
- Corrections write to `reviewer_corrected_value` and `normalized_value` only. `updated_at` updates. `review_status` transitions from `PENDING` to `REVIEWED`.
- `k1.field_corrected` audit event captures `before_json = { raw_value, normalized_value, reviewer_corrected_value }` and `after_json = { raw_value, normalized_value, reviewer_corrected_value }` (raw_value identical in both — retained for traceability).

## 3. Entity contracts (wire types)

Exported from `packages/types/src/review-finalization.ts` and re-exported from the package index.

```ts
export type K1Status =
  | 'UPLOADED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL' | 'FINALIZED';

export type K1ConfidenceBand = 'high' | 'medium' | 'low' | 'none';

export interface K1SourceLocation {
  page: number;                 // 1-based
  bbox: [number, number, number, number]; // x1,y1,x2,y2 in 0-100 page-relative coords
}

export interface K1FieldValue {
  id: string;                   // uuid
  fieldName: string;            // canonical field name
  label: string;                // display label
  section: 'entityMapping' | 'partnershipMapping' | 'core';
  required: boolean;
  rawValue: string | null;
  normalizedValue: string | null;
  reviewerCorrectedValue: string | null;
  confidenceScore: number | null;    // 0..1 from extractor
  confidenceBand: K1ConfidenceBand;  // server-computed band per research R1
  sourceLocation: K1SourceLocation | null;
  reviewStatus: 'PENDING' | 'REVIEWED';
  isModified: boolean;          // reviewerCorrectedValue != null && != normalizedValue
  linkedIssueIds: string[];     // open k1_issues rows with k1_field_value_id = this.id
  updatedAt: string;            // ISO-8601
}

export interface K1Issue {
  id: string;
  k1FieldValueId: string | null;
  issueType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'RESOLVED';
  message: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
}

export interface K1ReviewSession {
  k1DocumentId: string;
  version: number;              // optimistic-concurrency token; use as If-Match
  status: K1Status;
  partnership: { id: string | null; name: string | null; rawName: string | null };
  entity:      { id: string | null; name: string | null };
  taxYear: number;
  uploadedAt: string;
  approvedByUserId: string | null;
  finalizedByUserId: string | null;
  fields: {
    entityMapping: K1FieldValue[];
    partnershipMapping: K1FieldValue[];
    core: K1FieldValue[];
  };
  issues: K1Issue[];
  reportedDistributionAmount: string | null; // decimal, from k1_reported_distributions
  pdfUrl: string;               // server-relative path to GET /v1/k1/:id/pdf
  canApprove: boolean;          // server-computed role+state gate
  canFinalize: boolean;         // server-computed role+state+two-person gate
  canEdit: boolean;             // false when status = 'FINALIZED'
}

export interface K1CorrectionRequest {
  fieldId: string;
  value: string | null;          // new reviewer_corrected_value; null to revert
}

export interface K1CorrectionsResponse {
  version: number;               // new version after the save
  status: K1Status;              // may downgrade to NEEDS_REVIEW if regressed
  resolvedIssueIds: string[];    // auto-resolved linked issues
  approvalRevoked: boolean;      // true if status downgraded from READY_FOR_APPROVAL
}

export interface K1MapEntityRequest { entityId: string; }
export interface K1MapPartnershipRequest { partnershipId: string; }
export interface K1ApproveResponse { version: number; status: 'READY_FOR_APPROVAL'; approvedByUserId: string; }
export interface K1FinalizeResponse {
  version: number;
  status: 'FINALIZED';
  finalizedByUserId: string;
  partnershipAnnualActivityId: string;
}

export interface K1OpenIssueRequest { message?: string; k1FieldValueId?: string; severity?: 'LOW'|'MEDIUM'|'HIGH'; }
export interface K1OpenIssueResponse { issueId: string; version: number; }
export interface K1ResolveIssueResponse { version: number; }
```

## 4. Validation rules

- **Field value format** (FR-008): currency fields match `/^-?\d{1,18}(\.\d{1,2})?$/`; date fields match ISO-8601; free-text capped at 1000 chars. Enforced by zod in `review.schemas.ts`.
- **Required field non-empty** (FR-008, FR-019): a Required field MUST have a non-null `reviewerCorrectedValue` OR a non-null `normalizedValue`.
- **Entity mapping resolves** (FR-013): submitted `entityId` MUST exist in `entities` AND fall within the caller's `entity_memberships`.
- **Partnership mapping resolves** (FR-014): submitted `partnershipId` MUST exist in `partnerships` AND the partnership's `entity_id` MUST match the K-1's current `entity_id`.
- **Finalize preconditions** (FR-019): all of — no validation errors across fields; no empty Required fields; no open issues (any, linked or unlinked); entity and partnership mapped; `processing_status = 'READY_FOR_APPROVAL'`; `k1_reported_distributions.reported_distribution_amount IS NOT NULL`; actor role = `Admin`; `auth.userId != approved_by_user_id`.
- **Any write on FINALIZED** (FR-022): the repository layer MUST reject with `HTTP 409 K1_FINALIZED` regardless of the requested operation.

## 5. State transitions (summary)

```
                                   ┌───────────────────────────────┐
                                   │   corrections invalidate      │
                                   │   Approve preconditions       │
                                   │   (clears approved_by_user_id)│
                                   ▼                                ▲
UPLOADED ─→ PROCESSING ─→ NEEDS_REVIEW ──approve──→ READY_FOR_APPROVAL ──finalize──→ FINALIZED
                              ▲          (sets approved_by)             (sets finalized_by)
                              │                                              ▲
                              │                                              │
                              └──── corrections / maps ──────────────────────┘
                                    (version++ only; no status change if already NR)
```

All transitions from this screen are **server-authoritative** and driven by endpoints in `contracts/review-finalization.openapi.yaml`.

## 6. Transactional write sets (one row per endpoint)

| Endpoint | In-transaction writes |
|---|---|
| `POST /v1/k1/:id/corrections` | update N rows of `k1_field_values`; optionally update `k1_issues.status='RESOLVED'` for linked issues; optionally update `k1_documents.processing_status='NEEDS_REVIEW', approved_by_user_id=NULL` on regression; `k1_documents.version = version + 1` (CAS); 1 `k1.field_corrected` per changed field + 1 `k1.issue_resolved` per resolved issue + (conditional) 1 `k1.approval_revoked` |
| `POST /v1/k1/:id/map/entity` | update `k1_documents.entity_id`; `version = version + 1`; 1 `k1.entity_mapped` |
| `POST /v1/k1/:id/map/partnership` | update `k1_documents.partnership_id`; `version = version + 1`; 1 `k1.partnership_mapped` |
| `POST /v1/k1/:id/approve` | update `k1_documents.processing_status='READY_FOR_APPROVAL', approved_by_user_id=auth.userId`; `version = version + 1`; 1 `k1.approved` |
| `POST /v1/k1/:id/finalize` | update `k1_documents.processing_status='FINALIZED', finalized_by_user_id=auth.userId`; upsert `partnership_annual_activity` on `(entity_id, partnership_id, tax_year)` with `reported_distribution_amount` + `finalized_from_k1_document_id`; `version = version + 1`; 1 `k1.finalized` |
| `POST /v1/k1/:id/issues` | insert `k1_issues`; `version = version + 1`; 1 `k1.issue_opened` |
| `POST /v1/k1/:id/issues/:issueId/resolve` | update `k1_issues.status='RESOLVED', resolved_at=now(), resolved_by_user_id=auth.userId`; `version = version + 1`; 1 `k1.issue_resolved` (cause=`manual`) |

Every row in this table describes a single DB transaction; any failure in any step rolls back all other steps. SC-007 and SC-011 test this directly.
