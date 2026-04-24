# Data Model — Partnership Asset Redesign

**Feature**: `009-partnership-asset-redesign`  
**Inputs**: `spec.md`, `research.md`, existing Feature 004 data model, `docs/schema/21-postgres-ddl.sql`.

## 1. Existing Entities Reused

These records already exist and continue to provide the parent context, scope controls, or adjacent valuation context for the redesigned page.

### 1.1 `partnerships`

Owned by: Feature 004.

Used as the parent record for every asset and asset-FMV operation. Schema is unchanged by this feature.

Relevant fields: `id`, `entity_id`, `name`, `asset_class`, `status`, `notes`, `created_at`, `updated_at`.

### 1.2 `entity_memberships`

Owned by: Feature 002.

Used unchanged for scope enforcement. Asset reads and writes inherit parent partnership visibility through `partnerships.entity_id`.

Relevant fields: `user_id`, `entity_id`.

### 1.3 `partnership_fmv_snapshots`

Owned by: Feature 004.

Remains the whole-partnership valuation context visible on the redesigned page. This table is not reused for asset-level valuations.

Relevant fields: `id`, `partnership_id`, `valuation_date`, `fmv_amount`, `source_type`, `notes`, `created_at`, `updated_at`.

### 1.4 `k1_documents` and `k1_reported_distributions`

Owned by: Features 002 and 003.

Read-only in this feature. They continue to drive latest K-1 year and reported distribution context already present on Partnership Detail.

### 1.5 `audit_events`

Owned by: shared platform behavior.

Reused for append-only audit events on asset creation and asset-FMV creation.

## 2. New Entities Written by This Feature

### 2.1 `partnership_assets`

Represents a holding subordinate to exactly one partnership.

| column             | type            | notes |
|--------------------|-----------------|-------|
| `id`               | `uuid`          | PK |
| `partnership_id`   | `uuid`          | FK -> `partnerships(id)`; required; immutable after create |
| `name`             | `text`          | required; trimmed; 1-160 characters |
| `asset_type`       | `text`          | required controlled classification used for duplicate prevention and display |
| `source_type`      | `text`          | required; default `manual`; planned values `manual | imported | plaid` |
| `status`           | `text`          | required; default `ACTIVE`; v1 writes only `ACTIVE` but field remains for future lifecycle support |
| `description`      | `text`          | nullable |
| `notes`            | `text`          | nullable |
| `plaid_item_id`    | `text`          | nullable; future-facing integration metadata |
| `plaid_account_id` | `text`          | nullable; future-facing integration metadata |
| `created_at`       | `timestamptz`   | default `now()` |
| `updated_at`       | `timestamptz`   | default `now()`; set to `now()` on create/update |

**Invariants**:

- Every asset belongs to exactly one partnership.
- Assets cannot be created without a valid parent partnership in scope.
- Duplicate prevention is enforced in application logic by normalized name + asset type within the same partnership.
- The feature creates only `source_type = 'manual'` rows in v1, but the schema supports imported and plaid rows later.
- Asset lifecycle editing is out of scope; new rows default to `ACTIVE`.

**Emitted audit event**:

- `partnership.asset.created`

### 2.2 `partnership_asset_fmv_snapshots`

Represents a point-in-time FMV estimate for a single asset.

| column                | type              | notes |
|-----------------------|-------------------|-------|
| `id`                  | `uuid`            | PK |
| `asset_id`            | `uuid`            | FK -> `partnership_assets(id)`; required |
| `valuation_date`      | `date`            | required; app-layer validation rejects future dates |
| `fmv_amount`          | `numeric(18,2)`   | required; `>= 0` |
| `source_type`         | `text`            | required valuation provenance; planned values include `manual`, `manager_statement`, `valuation_409a`, `k1`, `imported`, `plaid` |
| `confidence_label`    | `text`            | nullable; optional future-facing confidence marker |
| `notes`               | `text`            | nullable |
| `recorded_by_user_id` | `uuid`            | nullable FK -> `users(id)`; populated for manual writes |
| `created_at`          | `timestamptz`     | default `now()`; authoritative ordering key for latest snapshot |
| `updated_at`          | `timestamptz`     | default `now()` |

**Invariants**:

- Snapshots are append-only: no PATCH or DELETE interface is exposed.
- Multiple snapshots may exist for the same `asset_id` and `valuation_date`.
- `created_at` determines the latest visible FMV for an asset; `valuation_date` is business context, not overwrite order.
- `fmv_amount = 0` is valid; negative amounts are rejected.
- Future valuation dates are rejected in application validation.

**Emitted audit event**:

- `partnership.asset.fmv_recorded`

## 3. Derived Read Shapes

### 3.1 `PartnershipAssetsResponse`

Returned by `GET /partnerships/{id}/assets`.

```ts
{
  summary: {
    assetCount: number;
    valuedAssetCount: number;
    totalLatestAssetFmvUsd: number | null;
  };
  rows: PartnershipAssetRow[];
}
```

### 3.2 `PartnershipAssetRow`

Used on the parent Partnership Detail page.

```ts
{
  id: string;
  partnershipId: string;
  name: string;
  assetType: string;
  sourceType: 'manual' | 'imported' | 'plaid';
  status: string;
  latestFmv: {
    amountUsd: number;
    valuationDate: string;
    source: 'manual' | 'manager_statement' | 'valuation_409a' | 'k1' | 'imported' | 'plaid';
    confidenceLabel: string | null;
    createdAt: string;
  } | null;
}
```

### 3.3 `PartnershipAssetDetail`

Returned by `GET /partnerships/{id}/assets/{assetId}` for the drawer header and metadata block.

```ts
{
  asset: {
    id: string;
    partnershipId: string;
    name: string;
    assetType: string;
    sourceType: 'manual' | 'imported' | 'plaid';
    status: string;
    description: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  latestFmv: {
    amountUsd: number;
    valuationDate: string;
    source: string;
    confidenceLabel: string | null;
    note: string | null;
    createdAt: string;
    recordedByUserId: string | null;
    recordedByEmail: string | null;
  } | null;
}
```

### 3.4 `AssetFmvSnapshot`

Returned by `GET /partnerships/{id}/assets/{assetId}/fmv-snapshots`.

```ts
{
  id: string;
  assetId: string;
  valuationDate: string;
  amountUsd: number;
  source: 'manual' | 'manager_statement' | 'valuation_409a' | 'k1' | 'imported' | 'plaid';
  confidenceLabel: string | null;
  note: string | null;
  recordedByUserId: string | null;
  recordedByEmail: string | null;
  createdAt: string;
}
```

### 3.5 `CreatePartnershipAssetRequest`

```ts
{
  name: string;
  assetType: string;
  description?: string | null;
  notes?: string | null;
  initialValuation?: {
    valuationDate: string;
    amountUsd: number;
    source: 'manual' | 'manager_statement' | 'valuation_409a' | 'k1' | 'imported' | 'plaid';
    confidenceLabel?: string | null;
    note?: string | null;
  } | null;
}
```

### 3.6 `CreateAssetFmvSnapshotRequest`

```ts
{
  valuationDate: string;
  amountUsd: number;
  source: 'manual' | 'manager_statement' | 'valuation_409a' | 'k1' | 'imported' | 'plaid';
  confidenceLabel?: string | null;
  note?: string | null;
}
```

## 4. Migration Summary

File: `apps/api/src/infra/db/migrations/009_partnership_assets.sql`

```sql
begin;

create table if not exists partnership_assets (
  id uuid primary key,
  partnership_id uuid not null references partnerships(id) on delete cascade,
  name text not null,
  asset_type text not null,
  source_type text not null default 'manual',
  status text not null default 'ACTIVE',
  description text,
  notes text,
  plaid_item_id text,
  plaid_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partnership_assets_partnership_idx
  on partnership_assets (partnership_id, created_at desc);

create index if not exists partnership_assets_name_lookup_idx
  on partnership_assets (partnership_id, asset_type, lower(name));

create table if not exists partnership_asset_fmv_snapshots (
  id uuid primary key,
  asset_id uuid not null references partnership_assets(id) on delete cascade,
  valuation_date date not null,
  fmv_amount numeric(18,2) not null check (fmv_amount >= 0),
  source_type text not null,
  confidence_label text,
  notes text,
  recorded_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partnership_asset_fmv_asset_created_idx
  on partnership_asset_fmv_snapshots (asset_id, created_at desc, valuation_date desc);

commit;
```

## 5. Cross-Reference to Functional Requirements

| Data concern | FRs covered |
|--------------|-------------|
| Partnership-scoped asset ownership | FR-001, FR-010, FR-020, FR-021 |
| Asset-row read model and rollup summary | FR-004, FR-005, FR-006, FR-011, FR-013, FR-015 |
| Initial valuation during asset creation | FR-024, FR-026 |
| Duplicate prevention | FR-030 |
| Append-only asset FMV semantics | FR-040 through FR-048 |
| Whole-partnership FMV remains separate | FR-007, FR-008, FR-009, FR-049 |
| Future connected/imported path | FR-028, FR-050 through FR-053 |
| RBAC, scope, and audit events | FR-060 through FR-067 |