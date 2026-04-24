# Phase 1 Data Model: K-1 Ingestion and Processing Dashboard

Scope: this feature adds one new migration (`002_k1_ingestion.sql`) and defines the server-visible entity contracts the API uses. The underlying schema in `docs/schema/21-postgres-ddl.sql` is the baseline; additions below are the **delta** this feature ships.

## 1. Existing entities (reused)

These are defined in `docs/schema/21-postgres-ddl.sql` and are consumed unchanged (except where noted under "Additions"):

- `users` — identity (from Feature 001).
- `roles`, `user_roles` — `Admin` | `User`.
- `entities` — client-owned financial subjects (Trust, LLC, LP, etc.).
- `partnerships` — investment positions, each `belongs_to` exactly one `entity`.
- `documents` — generic uploaded file record (source of `documents.storage_path`).
- `k1_documents` — K-1-typed row; the **authoritative lifecycle row** for each K-1.
- `k1_field_values` — parsed field data (read by the Review Workspace, not this screen).
- `k1_issues` — open/resolved issues (counted by the dashboard's Issues column).
- `audit_events` — immutable audit log.

## 2. Additions (new migration `002_k1_ingestion.sql`)

### 2.1 Extend `k1_documents`

Add columns:

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `parse_error_code` | `text` | yes | `null` | Non-null when the last parse attempt failed; cleared on next successful parse. Not a status. |
| `parse_error_message` | `text` | yes | `null` | Human-readable failure reason rendered in the row tooltip. |
| `parse_attempts` | `int` | no | `0` | Append-only counter. Increments at every `k1.parse_started`. |
| `superseded_by_document_id` | `uuid` | yes | `null` | FK → `documents.id`. When set, this K-1 is hidden from default listings but retained for audit (FR-023b). |
| `uploader_user_id` | `uuid` | no | — | FK → `users.id`. Convenience mirror of `documents.uploaded_by` promoted to `k1_documents` for fast filtering/reporting. Populated at insert. |

Status vocabulary for `processing_status` (unchanged set; enforced by `CHECK`):

```
'UPLOADED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL' | 'FINALIZED'
```

Integrity rules (FR-016, FR-017, Constitution §3):

- Transitions allowed: `UPLOADED → PROCESSING`, `PROCESSING → NEEDS_REVIEW`, `PROCESSING → READY_FOR_APPROVAL`, `READY_FOR_APPROVAL → FINALIZED`.
- No other transitions are legal. Parse failure does NOT transition status — it sets `parse_error_*` while `processing_status = 'PROCESSING'`.
- A superseded row (`superseded_by_document_id IS NOT NULL`) may be in any status; the dashboard excludes it from default listings and KPI counts regardless.

### 2.2 New table: `document_versions`

Tracks supersession chains (FR-023a/b).

```sql
create table document_versions (
  id                   uuid primary key,
  original_document_id uuid not null references documents(id),
  superseded_by_id     uuid not null references documents(id),
  partnership_id       uuid not null references partnerships(id),
  entity_id            uuid not null references entities(id),
  tax_year             int  not null,
  superseded_at        timestamptz not null default now(),
  superseded_by_user_id uuid references users(id),
  unique (original_document_id)
);

create index document_versions_scope_idx
  on document_versions (entity_id, partnership_id, tax_year);
```

Semantics:

- Insert happens in the same transaction as the Replace upload.
- The new `k1_documents` row (the replacement) and the prior row's `superseded_by_document_id` update and the `document_versions` insert and the `k1.superseded` audit event all COMMIT together or none at all.
- Rows are never deleted from this table — audit retention requirement (Constitution §13).

### 2.3 New table: `entity_memberships`

Source of entity entitlements used for read-scoping and upload gating (FR-032, FR-033a).

```sql
create table entity_memberships (
  id        uuid primary key,
  user_id   uuid not null references users(id),
  entity_id uuid not null references entities(id),
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  unique (user_id, entity_id)
);

create index entity_memberships_user_idx on entity_memberships (user_id);
create index entity_memberships_entity_idx on entity_memberships (entity_id);
```

V1 provisioning path: admin seeds memberships out-of-band (script) or via the User Management screen (Feature 001's `/admin/users` — extension in a future feature). For this dashboard, memberships are assumed present for all users who need access. Absence of memberships yields the permission-restricted state on the dashboard.

### 2.4 New derived view: `v_k1_active_documents`

Helper view used by every listing/KPI query. Hides superseded rows.

```sql
create view v_k1_active_documents as
select k.*
from k1_documents k
where k.superseded_by_document_id is null;
```

Rationale: centralizing "active vs superseded" in one view prevents handlers from forgetting the filter.

## 3. Server-visible entity contracts (Zod/OpenAPI parity)

These are the shapes used by `packages/types/src/k1-ingestion.ts` and by the API request/response validators. Field names use camelCase at the wire; the db uses snake_case; mapping happens in `k1.repository.ts`.

### 3.1 `K1DocumentSummary` (one row on the dashboard)

```ts
type K1Status =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_APPROVAL'
  | 'FINALIZED'

interface K1DocumentSummary {
  id: string                 // k1_documents.id
  documentId: string         // documents.id
  documentName: string       // composed "K-1 — {partnership_name}" on the server
  partnership: { id: string; name: string }
  entity:      { id: string; name: string }
  taxYear: number
  status: K1Status           // processing_status
  issuesOpenCount: number    // count of k1_issues with status='OPEN'
  uploadedAt: string         // ISO8601
  uploaderUserId: string
  // Parse-error carrier — empty when there is no current failure.
  parseError: null | {
    code: string
    message: string
    lastAttemptAt: string
  }
  // Not rendered on this screen; present so row-click targets the correct route.
  supersededByDocumentId: string | null  // always null on the active listing
}
```

### 3.2 `K1Kpis`

```ts
interface K1Kpis {
  scope: { taxYear: number | null; entityId: string | null }
  counts: {
    UPLOADED: number
    PROCESSING: number
    NEEDS_REVIEW: number
    READY_FOR_APPROVAL: number
    FINALIZED: number
  }
  // Not a lifecycle count; displayed optionally as an inline warning on the Processing card.
  processingWithErrors: number
}
```

### 3.3 `K1UploadRequest` / `K1UploadResponse` / `K1DuplicateResponse`

```ts
interface K1UploadRequest {
  file: File                    // multipart/form-data
  partnershipId: string
  entityId: string
  taxYear: number
  replaceDocumentId?: string    // present only on Replace confirmation
}

interface K1UploadResponse {
  k1DocumentId: string
  documentId: string
  status: 'UPLOADED'
}

interface K1DuplicateResponse {
  error: 'DUPLICATE_K1'
  existing: {
    k1DocumentId: string
    documentId: string
    uploadedAt: string
    status: K1Status
  }
}
```

### 3.4 Audit event shapes (rows in `audit_events`)

| `event_name` | `object_type` | `before_json` | `after_json` |
|---|---|---|---|
| `k1.uploaded` | `k1_document` | `null` | `{ k1DocumentId, documentId, partnershipId, entityId, taxYear, storagePath }` |
| `k1.parse_started` | `k1_document` | `{ parseAttempts: n }` | `{ parseAttempts: n+1, status: 'PROCESSING' }` |
| `k1.parse_completed` | `k1_document` | `{ status: 'PROCESSING' }` | `{ status, openIssueCount }` |
| `k1.parse_failed` | `k1_document` | `{ status: 'PROCESSING' }` | `{ status: 'PROCESSING', parseError: { code, message } }` |
| `k1.issue_opened` | `k1_issue` | `null` | `{ issueId, k1DocumentId, issueType, severity }` |
| `k1.issue_resolved` | `k1_issue` | `{ status: 'OPEN' }` | `{ status: 'RESOLVED', resolvedBy }` |
| `k1.approved` | `k1_document` | `{ status: 'READY_FOR_APPROVAL' }` | `{ status: 'FINALIZED', approvedBy }` |
| `k1.finalized` | `k1_document` | `{ status: 'READY_FOR_APPROVAL' }` | `{ status: 'FINALIZED', finalizedAt }` |
| `k1.superseded` | `k1_document` | `{ supersededByDocumentId: null }` | `{ supersededByDocumentId, supersededBy }` |
| `k1.reparse_requested` | `k1_document` | `{ parseError }` | `{ parseError: null, status: 'PROCESSING' }` |

## 4. Query shapes (reference)

Listing (simplified; actual SQL uses keyset):

```sql
select ...
from v_k1_active_documents k
join partnerships p on p.id = k.partnership_id
join entities     e on e.id = p.entity_id
where e.id = any ($memberships)
  and ($tax_year is null or k.tax_year = $tax_year)
  and ($entity_id is null or e.id = $entity_id)
  and ($status   is null or k.processing_status = $status)
  and ($q        is null or p.name ilike '%'||$q||'%' or ...)
order by k.uploaded_at desc, k.id desc
limit $limit;
```

KPIs (no `status` / no `q` — enforced by separate endpoint):

```sql
select k.processing_status,
       count(*) filter (where k.parse_error_code is not null) as with_errors,
       count(*) as total
from v_k1_active_documents k
join partnerships p on p.id = k.partnership_id
join entities     e on e.id = p.entity_id
where e.id = any ($memberships)
  and ($tax_year is null or k.tax_year = $tax_year)
  and ($entity_id is null or e.id = $entity_id)
group by k.processing_status;
```

## 5. Validation rules summary (at system boundaries)

- `tax_year`: integer, 2000 ≤ year ≤ current year + 1.
- `file`: MIME `application/pdf`, size ≤ 25 MB (configurable).
- `partnership_id` / `entity_id`: must exist and the partnership's `entity_id` MUST match the supplied `entity_id` (rejects cross-entity partnerships).
- `replace_document_id`: must exist, be active (not superseded), match `(partnership_id, entity_id, tax_year)` of the incoming upload, and be visible to the caller under their memberships.
- Listing params: `limit ∈ [1, 200]`, `status ∈ K1Status | null`, `q.length ≤ 200`, `cursor` opaque string ≤ 512 chars.

No validation happens in the UI beyond surfacing the server error — server is the authoritative boundary (FR-032).
