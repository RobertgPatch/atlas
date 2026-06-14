begin;

create table if not exists plaid_connections (
  id uuid primary key,
  owner_user_id uuid references users(id),
  plaid_item_id text not null,
  institution_id text,
  institution_name text not null,
  access_token_ciphertext text not null,
  status text not null default 'connected',
  needs_update_reason text,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plaid_item_id)
);

create table if not exists plaid_investment_accounts (
  id uuid primary key,
  plaid_connection_id uuid not null references plaid_connections(id) on delete cascade,
  plaid_account_id text not null,
  name text not null,
  official_name text,
  mask text,
  account_type text not null,
  account_subtype text,
  custodian_name text not null,
  selected_for_holdings_report boolean not null default true,
  sync_status text not null default 'never_synced',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plaid_connection_id, plaid_account_id)
);

create table if not exists holdings_sync_snapshots (
  id uuid primary key,
  requested_by_user_id uuid references users(id),
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  selected_account_ids jsonb not null default '[]'::jsonb,
  plaid_request_ids jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  error_type text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists source_holdings (
  id uuid primary key,
  sync_snapshot_id uuid not null references holdings_sync_snapshots(id) on delete cascade,
  plaid_investment_account_id uuid not null references plaid_investment_accounts(id) on delete cascade,
  plaid_account_id text not null,
  plaid_security_id text,
  symbol text,
  description text not null,
  security_type text not null,
  cusip text,
  isin text,
  currency_code text,
  quantity numeric(28,8),
  cost_basis_amount numeric(18,2),
  institution_price numeric(18,6),
  market_value_amount numeric(18,2),
  unrealized_gain_loss_amount numeric(18,2),
  as_of_date date,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists plaid_investment_accounts_selected_idx
  on plaid_investment_accounts (selected_for_holdings_report, custodian_name);

create index if not exists source_holdings_account_idx
  on source_holdings (plaid_investment_account_id, created_at desc);

create index if not exists source_holdings_symbol_idx
  on source_holdings (upper(symbol), security_type);

commit;
