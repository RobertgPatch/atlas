-- Migration 010: Capital Commitments and Activity
-- Feature: 010-capital-commitments-and-activity

begin;

create table if not exists partnership_commitments (
  id uuid primary key,
  entity_id uuid not null references entities(id) on delete cascade,
  partnership_id uuid not null references partnerships(id) on delete cascade,
  commitment_amount numeric(18,2) not null check (commitment_amount >= 0),
  commitment_date date,
  commitment_start_date date,
  commitment_end_date date,
  status text not null default 'ACTIVE',
  source_type text not null default 'manual',
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partnership_commitments_partnership_status_idx
  on partnership_commitments (partnership_id, status, created_at desc);

create index if not exists partnership_commitments_entity_partnership_idx
  on partnership_commitments (entity_id, partnership_id);

create unique index if not exists partnership_commitments_one_active_per_partnership_idx
  on partnership_commitments (partnership_id)
  where status = 'ACTIVE';

create table if not exists capital_activity_events (
  id uuid primary key,
  entity_id uuid not null references entities(id) on delete cascade,
  partnership_id uuid not null references partnerships(id) on delete cascade,
  activity_date date not null,
  event_type text not null,
  amount numeric(18,2) not null,
  source_type text not null default 'manual',
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capital_activity_events_partnership_date_idx
  on capital_activity_events (partnership_id, activity_date desc, created_at desc);

create index if not exists capital_activity_events_entity_partnership_idx
  on capital_activity_events (entity_id, partnership_id, activity_date desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'capital_activity_events_event_type_chk'
  ) then
    alter table capital_activity_events
      add constraint capital_activity_events_event_type_chk
      check (event_type in ('capital_call', 'funded_contribution', 'other_adjustment'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'capital_activity_events_source_type_chk'
  ) then
    alter table capital_activity_events
      add constraint capital_activity_events_source_type_chk
      check (source_type in ('manual', 'parsed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'capital_activity_events_amount_nonzero_chk'
  ) then
    alter table capital_activity_events
      add constraint capital_activity_events_amount_nonzero_chk
      check (amount <> 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'partnership_commitments_status_chk'
  ) then
    alter table partnership_commitments
      add constraint partnership_commitments_status_chk
      check (status in ('ACTIVE', 'INACTIVE'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'partnership_commitments_source_type_chk'
  ) then
    alter table partnership_commitments
      add constraint partnership_commitments_source_type_chk
      check (source_type in ('manual', 'parsed'));
  end if;
end $$;

alter table if exists partnership_annual_activity
  add column if not exists source_has_k1 boolean not null default false,
  add column if not exists source_has_capital_activity boolean not null default false,
  add column if not exists source_has_fmv boolean not null default false,
  add column if not exists source_has_manual_input boolean not null default false,
  add column if not exists commitment_source_type text,
  add column if not exists paid_in_source_type text,
  add column if not exists distribution_source_type text,
  add column if not exists residual_value_source_type text,
  add column if not exists return_metrics_source_type text;

commit;
