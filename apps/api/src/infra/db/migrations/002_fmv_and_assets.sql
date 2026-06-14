-- Schema gaps surfaced at runtime against the live Railway Postgres.

-- partnership_fmv_snapshots: code joins on fmv.created_by but column was missing.
alter table partnership_fmv_snapshots
  add column if not exists created_by uuid;

-- Asset-level FMV tables referenced by partnership/assets.handler when listing
-- a partnership's assets. The base schema didn't include them.
create table if not exists partnership_assets (
  id uuid primary key,
  partnership_id uuid not null references partnerships(id) on delete cascade,
  name text not null,
  asset_type text not null default 'partnership',
  source_type text not null default 'manual',
  status text not null default 'ACTIVE',
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partnership_assets_partnership_idx
  on partnership_assets (partnership_id);

create table if not exists partnership_asset_fmv_snapshots (
  id uuid primary key,
  asset_id uuid not null references partnership_assets(id) on delete cascade,
  valuation_date date not null,
  fmv_amount numeric(18,2) not null,
  source_type text not null default 'manual',
  confidence_label text,
  notes text,
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partnership_asset_fmv_snapshots_asset_idx
  on partnership_asset_fmv_snapshots (asset_id, created_at desc);