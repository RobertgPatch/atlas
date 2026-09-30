-- Security-level display classifications are independent of immutable statements.
-- This application is single-tenant; assignments apply across all entities.
create table liquidity_sector_assignments (
  symbol text primary key check (symbol ~ '^[A-Z0-9][A-Z0-9.]{0,31}$'),
  sector text check (sector in (
    'Communication Services', 'Consumer Discretionary', 'Consumer Staples',
    'Energy', 'Financials', 'Health Care', 'Industrials', 'Materials',
    'Real Estate', 'Utilities', 'Technology', 'Unclassified'
  )),
  version integer not null default 1 check (version > 0),
  updated_by_user_id uuid not null references users(id),
  updated_at timestamptz not null default now()
);
comment on column liquidity_sector_assignments.sector is
  'NULL restores automatic classification. Keep the row/version to prevent stale writes after reset.';
