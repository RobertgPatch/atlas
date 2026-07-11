begin;

create table if not exists plaid_refresh_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cadence text not null default 'daily' check (cadence in ('daily')),
  refresh_time_local text not null default '05:00',
  timezone text not null default 'America/Los_Angeles',
  stale_after_cutoff boolean not null default true,
  manual_refresh_enabled boolean not null default true,
  automatic_refresh_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists holdings_refresh_attempts (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references plaid_refresh_policies(id) on delete set null,
  requested_by_user_id uuid references users(id) on delete set null,
  trigger_source text not null check (trigger_source in ('scheduled', 'manual', 'system')),
  refresh_reason text not null check (
    refresh_reason in (
      'daily_cutoff',
      'manual',
      'missing_snapshot',
      'stale_snapshot',
      'forced',
      'already_fresh'
    )
  ),
  status text not null default 'pending' check (
    status in ('pending', 'success', 'partial_success', 'failed', 'skipped')
  ),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  scheduled_for timestamptz,
  freshness_cutoff_at timestamptz,
  selected_account_ids text[] not null default '{}',
  plaid_request_ids text[] not null default '{}',
  data_as_of_date date,
  error_type text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table holdings_sync_snapshots
  add column if not exists refresh_attempt_id uuid references holdings_refresh_attempts(id) on delete set null,
  add column if not exists data_as_of_date date,
  add column if not exists data_as_of_min_date date,
  add column if not exists data_as_of_max_date date,
  add column if not exists fetched_at timestamptz,
  add column if not exists dashboard_eligible boolean not null default false,
  add column if not exists holdings_count integer not null default 0;

create index if not exists plaid_refresh_policies_name_idx
  on plaid_refresh_policies (name);

create index if not exists holdings_refresh_attempts_status_started_idx
  on holdings_refresh_attempts (status, started_at desc);

create index if not exists holdings_refresh_attempts_selected_accounts_idx
  on holdings_refresh_attempts using gin (selected_account_ids);

create index if not exists holdings_sync_snapshots_dashboard_idx
  on holdings_sync_snapshots (dashboard_eligible, completed_at desc)
  where dashboard_eligible = true;

create index if not exists holdings_sync_snapshots_attempt_idx
  on holdings_sync_snapshots (refresh_attempt_id);

insert into plaid_refresh_policies (
  name,
  cadence,
  refresh_time_local,
  timezone,
  stale_after_cutoff,
  manual_refresh_enabled,
  automatic_refresh_enabled
)
values (
  'liquidity_default',
  'daily',
  '05:00',
  'America/Los_Angeles',
  true,
  true,
  true
)
on conflict (name) do nothing;

commit;
