-- Additive, provider-neutral source truth. No legacy financial data is removed.
create table if not exists liquidity_source_accounts (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  custodian text not null,
  name text not null,
  account_mask text,
  identifier_fingerprint text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  included boolean not null default true,
  cadence text not null default 'ON_DEMAND' check (cadence in ('EVERY_14_DAYS','CALENDAR_MONTHLY','ON_DEMAND')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','NEEDS_REVIEW')),
  origin text not null default 'CSV' check (origin in ('CSV','PLAID_LEGACY')),
  active_source text not null default 'CSV' check (active_source in ('CSV','PLAID_LEGACY')),
  legacy_account_id uuid unique references plaid_investment_accounts(id),
  version integer not null default 1 check (version > 0),
  current_snapshot_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, entity_id)
);
create index if not exists liquidity_source_accounts_scope_idx on liquidity_source_accounts(entity_id, included);

create table if not exists liquidity_holdings_snapshots (
  id uuid primary key,
  source_account_id uuid not null,
  entity_id uuid not null,
  source_kind text not null check(source_kind in ('CSV','PLAID_LEGACY')),
  import_id uuid,
  run_id uuid,
  application_id uuid,
  legacy_snapshot_id uuid references holdings_sync_snapshots(id),
  as_of_date date not null,
  as_of_at timestamptz,
  as_of_precision text not null default 'DATE' check(as_of_precision in ('DATE','INSTANT')),
  source_zone text,
  effective_key text not null,
  revision integer not null check(revision > 0),
  approved_at timestamptz not null default now(),
  approved_by uuid,
  reported_total numeric(28,8),
  position_total numeric(28,8) not null,
  reconciliation text not null check(reconciliation in ('MATCHED','NOT_PROVIDED','BLOCKED')),
  coverage jsonb not null,
  supersedes_snapshot_id uuid references liquidity_holdings_snapshots(id),
  superseded_by_snapshot_id uuid references liquidity_holdings_snapshots(id),
  current_eligible boolean not null default true,
  foreign key(source_account_id,entity_id) references liquidity_source_accounts(id,entity_id),
  unique(id,source_account_id),
  unique(source_account_id,effective_key,revision),
  unique(legacy_snapshot_id,source_account_id),
  check ((as_of_precision='DATE' and as_of_at is null) or (as_of_precision='INSTANT' and as_of_at is not null))
);
create index if not exists liquidity_snapshots_history_idx on liquidity_holdings_snapshots(source_account_id,as_of_date desc,as_of_at desc,revision desc);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='liquidity_current_account_fk') then
    alter table liquidity_source_accounts add constraint liquidity_current_account_fk foreign key(current_snapshot_id,id) references liquidity_holdings_snapshots(id,source_account_id);
  end if;
end $$;

create table if not exists liquidity_source_positions (
  id uuid primary key,
  snapshot_id uuid not null,
  source_account_id uuid not null,
  source_occurrence text not null,
  source_record integer not null check(source_record > 0),
  legacy_holding_id uuid unique,
  quantity numeric(28,8),
  price numeric(28,8),
  market_value numeric(28,8) not null,
  cost_basis numeric(28,8),
  unrealized_gain_loss numeric(28,8),
  unrealized_gain_loss_ratio numeric(28,12),
  currency text,
  canonical jsonb not null,
  foreign key(snapshot_id,source_account_id) references liquidity_holdings_snapshots(id,source_account_id),
  unique(snapshot_id,source_occurrence),
  unique(id,snapshot_id,source_account_id)
);
create index if not exists liquidity_source_positions_account_idx on liquidity_source_positions(source_account_id,snapshot_id);

-- Existing valuation rows remain intact. New neutral valuations use the table below;
-- the old NOT NULL Plaid FK is deliberately retained for compatible old binaries.
alter table liquidity_valuation_positions add column if not exists source_account_id uuid references liquidity_source_accounts(id);
alter table liquidity_valuation_positions add column if not exists source_snapshot_id uuid references liquidity_holdings_snapshots(id);
alter table liquidity_valuation_positions add column if not exists source_position_id uuid references liquidity_source_positions(id);
create table if not exists liquidity_source_valuations (
  id uuid primary key,
  source_position_id uuid not null,
  source_snapshot_id uuid not null,
  source_account_id uuid not null,
  price_at timestamptz not null,
  captured_at timestamptz not null default now(),
  price numeric(28,8) not null,
  market_value numeric(28,8) not null,
  unrealized_gain_loss numeric(28,8),
  provider text not null,
  mode text not null check(mode in ('CSV_FALLBACK','MARKET_QUOTE','PLAID_LEGACY')),
  foreign key(source_position_id,source_snapshot_id,source_account_id) references liquidity_source_positions(id,snapshot_id,source_account_id),
  unique(source_position_id,price_at,provider)
);

create or replace function liquidity_deny_evidence_mutation() returns trigger language plpgsql as $$
begin raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE'; end $$;
create or replace function liquidity_snapshot_immutable() returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE'; end if;
  if (to_jsonb(new) - 'superseded_by_snapshot_id') <> (to_jsonb(old) - 'superseded_by_snapshot_id') then raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE'; end if;
  if old.superseded_by_snapshot_id is not null and new.superseded_by_snapshot_id is distinct from old.superseded_by_snapshot_id then raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE'; end if;
  return new;
end $$;
create or replace trigger liquidity_positions_immutable before update or delete on liquidity_source_positions for each row execute function liquidity_deny_evidence_mutation();
create or replace trigger liquidity_snapshots_immutable before update or delete on liquidity_holdings_snapshots for each row execute function liquidity_snapshot_immutable();
create or replace trigger liquidity_valuations_immutable before update or delete on liquidity_source_valuations for each row execute function liquidity_deny_evidence_mutation();
