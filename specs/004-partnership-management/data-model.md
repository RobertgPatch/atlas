# Data Model — Partnership Management

**Feature**: `004-partnership-management`
**Inputs**: `spec.md`, `research.md`, `docs/schema/21-postgres-ddl.sql`.

## 1. Entities Used (read-only)

These entities are owned by prior features and are consumed without mutation.

### 1.1 `entities`

Owned by: Features 001 (seed) and 002 (scope).
Read-only in this feature.
Fields used: `id`, `name`, `entity_type`, `status`, `notes`, `created_at`.

### 1.2 `entity_memberships`

Owned by: Feature 002 (K-1 Ingestion).
Read-only in this feature; used for scope enforcement on every read, list, export, create, update, and FMV write.
Fields used: `user_id`, `entity_id`.

### 1.3 `k1_documents`

Owned by: Features 002 / 003.
Read-only in this feature.
Fields used: `id`, `partnership_id`, `tax_year`, `processing_status`, `finalized_at`, `created_at`.
Relevant filter: `processing_status = 'FINALIZED'` for "Latest finalized K-1" derivations.

### 1.4 `k1_reported_distributions`

Owned by: Features 002 / 003.
Read-only in this feature.
Fields used: `id`, `k1_document_id`, `entity_id`, `partnership_id`, `tax_year`, `reported_distribution_amount`.

### 1.5 `partnership_annual_activity`

Owned by: Future reporting feature (seed rows written by Feature 003 on K-1 finalization).
Read-only in this feature; used for the Expected Distribution History section on Partnership Detail.
Fields used: `id`, `entity_id`, `partnership_id`, `tax_year`, `reported_distribution_amount`, `finalized_from_k1_document_id`.

## 2. Entities Written (create + update)

### 2.1 `partnerships` (existing table, mutations added)

Owned by: This feature (writes) and Features 002 / 003 (reads).

Fields (schema unchanged; see `docs/schema/21-postgres-ddl.sql`):

| column       | type          | notes                                                                              |
| ------------ | ------------- | ---------------------------------------------------------------------------------- |
| `id`         | `uuid`        | PK                                                                                 |
| `entity_id`  | `uuid`        | FK → `entities(id)`; required on create; MUST be in caller's `entity_memberships` (Admin bypass) |
| `name`       | `text`        | required; 1–120 characters; trimmed; app-layer unique per `(entity_id, lower(name))` with 409 on conflict (FR-064) |
| `asset_class`| `text`        | free-text in schema; app-layer validation against the enum shown in `AssetClass` dropdown; `null` allowed (FR-045) |
| `status`     | `text`        | enum `ACTIVE | PENDING | LIQUIDATED | CLOSED`; default `ACTIVE`; enforced by new `CHECK` constraint (see Migration)  |
| `notes`      | `text`        | nullable; plain text, up to 10 000 characters                                     |
| `created_at` | `timestamptz` | `default now()` — not written by handler                                            |
| `updated_at` | `timestamptz` | handler sets to `now()` on every successful `PATCH` and `INSERT`                   |

**Invariants**:
- `entity_id` MUST NOT change after create (no "move partnership between entities" in v1; Admin can delete-and-recreate only by seeding — but there is no delete in v1, so effectively immutable).
- `status` transitions are free per Clarification Q4; no state-machine gate.
- `(entity_id, lower(name))` is unique at the app layer; DB index `partnerships_entity_name_idx` backs the lookup.

**Emitted audit events**:
- `partnership.created` — `after_json` = full new row; `before_json` = `null`.
- `partnership.updated` — `before_json` = full prior row; `after_json` = full new row. Emitted once per PATCH regardless of how many fields changed.

### 2.2 `partnership_fmv_snapshots` (existing table, constraint dropped, insert-only)

Owned by: This feature (writes) and Future reporting features (reads).

Fields (schema unchanged except as noted in Migration):

| column            | type          | notes                                                                               |
| ----------------- | ------------- | ----------------------------------------------------------------------------------- |
| `id`              | `uuid`        | PK                                                                                  |
| `partnership_id`  | `uuid`        | FK → `partnerships(id)`; MUST be in caller's entity scope                           |
| `valuation_date`  | `date`        | "as-of date" in spec language; MUST NOT be in the future; no uniqueness required    |
| `fmv_amount`      | `numeric(18,2)` | "amount_usd" in spec language; `> 0` normally; `0` allowed only when `partnerships.status = 'LIQUIDATED'` |
| `source_type`     | `text`        | enum `manager_statement | valuation_409a | k1 | manual`; app-layer validated       |
| `notes`           | `text`        | nullable; up to 2 000 characters                                                    |
| `created_at`      | `timestamptz` | `default now()`; authoritative ordering key for "Latest FMV"                        |
| `updated_at`      | `timestamptz` | `default now()`; equal to `created_at` for any snapshot written by this feature     |

**Invariants**:
- **Append-only** — the API exposes no PATCH or DELETE path. Existing rows are immutable.
- Multiple snapshots per `(partnership_id, valuation_date)` are legal (per-date unique constraint dropped by this migration).
- "Latest FMV" for a partnership is the row with the greatest `created_at`; tie-broken by greatest `valuation_date`; then by `id` for full determinism.

**Emitted audit events**:
- `partnership.fmv_recorded` — `after_json` = full new snapshot row; `before_json` = the previous "latest" snapshot (or `null` if none). This lets downstream consumers detect "value changed from X to Y".

### 2.3 `audit_events` (existing, insert-only)

Owned by: shared across features.
This feature inserts exactly three event names:

| event_name                 | object_type   | object_id            | trigger                                             |
| -------------------------- | ------------- | -------------------- | --------------------------------------------------- |
| `partnership.created`      | `partnership` | new partnership `id` | `POST /v1/partnerships` success (Admin only)        |
| `partnership.updated`      | `partnership` | partnership `id`     | `PATCH /v1/partnerships/:id` success (Admin only)  |
| `partnership.fmv_recorded` | `partnership` | partnership `id`     | `POST /v1/partnerships/:id/fmv-snapshots` success  |

Inserts happen inside the same transaction as the underlying write. Failure to write the audit row rolls back the business mutation (fail-closed).

## 3. Derived Read Shapes (no schema)

### 3.1 `PartnershipDirectoryRow`

Composed server-side from `partnerships` joined with the derivations described in `research.md` §Decision 2. Wire shape (also exported from `packages/types/src/partnership-management.ts`):

```ts
{
  id: string;                  // uuid
  name: string;
  entity: { id: string; name: string };
  assetClass: string | null;
  status: 'ACTIVE' | 'PENDING' | 'LIQUIDATED' | 'CLOSED';
  latestK1Year: number | null;        // null when no FINALIZED k1_documents
  latestDistributionUsd: number | null; // null when latestK1Year is null
  latestFmv: {
    amountUsd: number;
    asOfDate: string;    // ISO date
    createdAt: string;   // ISO datetime
  } | null;                          // null when no snapshot exists
}
```

### 3.2 `PartnershipDirectoryResponse`

```ts
{
  rows: PartnershipDirectoryRow[];
  totals: {
    partnershipCount: number;      // filtered
    totalDistributionsUsd: number; // sum of non-null latestDistributionUsd
    totalFmvUsd: number;           // sum of non-null latestFmv.amountUsd
  };
  page: { size: number; offset: number; total: number };
}
```

### 3.3 `PartnershipDetail`

```ts
{
  partnership: { id, name, entity, assetClass, status, notes, createdAt, updatedAt };
  kpis: {
    latestK1Year: number | null;
    latestDistributionUsd: number | null;
    latestFmvUsd: number | null;
    cumulativeReportedDistributionsUsd: number; // sum over partnership_annual_activity
  };
  k1History: Array<{
    k1DocumentId: string;
    taxYear: number;
    processingStatus: string;   // UPLOADED | PROCESSING | ... | FINALIZED
    reportedDistributionUsd: number | null;
    finalizedAt: string | null;
  }>;
  expectedDistributionHistory: Array<{
    taxYear: number;
    reportedDistributionUsd: number | null;
    finalizedFromK1DocumentId: string | null;
  }>;
  fmvSnapshots: Array<{
    id: string;
    asOfDate: string;
    amountUsd: number;
    source: 'manager_statement' | 'valuation_409a' | 'k1' | 'manual';
    note: string | null;
    recordedByUserId: string;
    recordedByEmail: string;
    createdAt: string;
  }>;
}
```

### 3.4 `EntityDetail`

```ts
{
  entity: { id, name, entityType, status, notes };
  partnerships: PartnershipDirectoryRow[];   // all partnerships under this entity, in caller scope
  rollup: {
    partnershipCount: number;
    totalDistributionsUsd: number;
    totalFmvUsd: number;
    latestK1Year: number | null;  // MAX(tax_year) across scoped partnerships with a FINALIZED K-1; null if none
  };
}
```

## 4. Migration Summary

File: `apps/api/src/infra/db/migrations/004_partnership_management.sql`

```sql
begin;

-- 1. Status enum guardrail
alter table partnerships
  add constraint partnerships_status_check
  check (status in ('ACTIVE','PENDING','LIQUIDATED','CLOSED'));

-- 2. FMV append-only — drop the per-date unique constraint
alter table partnership_fmv_snapshots
  drop constraint if exists partnership_fmv_snapshots_partnership_id_valuation_date_key;

-- 3. FMV latest-by-created_at lookup index
create index if not exists partnership_fmv_snapshots_partnership_created_idx
  on partnership_fmv_snapshots (partnership_id, created_at desc);

-- 4. Directory name conflict lookup (not unique; app-layer 409)
create index if not exists partnerships_entity_name_idx
  on partnerships (entity_id, lower(name));

-- 5. K-1 latest-year lookup
create index if not exists k1_reported_distributions_partnership_year_idx
  on k1_reported_distributions (partnership_id, tax_year);

commit;
```

## 5. Cross-Reference to Functional Requirements

| Data concern                              | FRs covered                          |
| ----------------------------------------- | ------------------------------------ |
| Directory row shape                       | FR-001..008                          |
| KPIs recompute with filter                | FR-003, FR-004                       |
| Scope enforcement                         | FR-008a, FR-061, FR-065              |
| Directory row navigation + status badge   | FR-009, FR-010                       |
| CSV export columns                        | FR-011, FR-013, FR-014               |
| Empty / filtered-empty / error states     | FR-015..017                          |
| Partnership Detail header + KPIs          | FR-020, FR-021, FR-026               |
| Detail sections                           | FR-022..025                          |
| FMV append-only, no edit/delete           | FR-024 (Clarification Q3)            |
| Entity Detail                             | FR-040..044                          |
| Admin-only writes                         | FR-062                               |
| Audit events                              | FR-063                               |
| Name conflict 409                         | FR-064                               |
| Editable partnership fields               | FR-066 (Clarification Q4)            |
