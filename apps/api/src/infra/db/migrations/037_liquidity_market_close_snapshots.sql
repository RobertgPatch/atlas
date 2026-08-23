begin;

create table if not exists liquidity_valuation_snapshots (
  id uuid primary key,
  trading_date date not null,
  account_selection_key text not null,
  selected_account_ids jsonb not null default '[]'::jsonb,
  provider text,
  feed text,
  price_as_of timestamptz,
  captured_at timestamptz not null default now(),
  total_market_value_amount numeric(18,2),
  total_cost_basis_amount numeric(18,2),
  total_unrealized_gain_loss_amount numeric(18,2),
  account_count integer not null default 0 check (account_count >= 0),
  holding_count integer not null default 0 check (holding_count >= 0),
  priced_holding_count integer not null default 0 check (priced_holding_count >= 0),
  fallback_holding_count integer not null default 0 check (fallback_holding_count >= 0),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trading_date, account_selection_key)
);

create table if not exists liquidity_valuation_positions (
  id uuid primary key,
  valuation_snapshot_id uuid not null references liquidity_valuation_snapshots(id) on delete cascade,
  plaid_investment_account_id uuid not null references plaid_investment_accounts(id) on delete cascade,
  source_holding_id uuid not null,
  symbol text,
  description text not null,
  security_type text not null,
  currency_code text,
  quantity numeric(28,8),
  cost_basis_amount numeric(18,2),
  closing_price numeric(24,8),
  market_value_amount numeric(18,2),
  unrealized_gain_loss_amount numeric(18,2),
  valuation_source text not null check (valuation_source in ('official_close', 'custodian_fallback')),
  provider text,
  feed text,
  price_as_of timestamptz,
  created_at timestamptz not null default now(),
  unique (valuation_snapshot_id, source_holding_id)
);

create index if not exists liquidity_valuation_snapshots_date_idx
  on liquidity_valuation_snapshots (trading_date desc, captured_at desc);

create index if not exists liquidity_valuation_snapshots_accounts_idx
  on liquidity_valuation_snapshots using gin (selected_account_ids);

create index if not exists liquidity_valuation_positions_account_idx
  on liquidity_valuation_positions (plaid_investment_account_id, valuation_snapshot_id);

commit;
