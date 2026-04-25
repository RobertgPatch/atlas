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