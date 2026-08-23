begin;

alter table capital_activity_events
  add column if not exists settlement_status text not null default 'SETTLED',
  add column if not exists announced_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'capital_activity_events_settlement_status_chk'
  ) then
    alter table capital_activity_events
      add constraint capital_activity_events_settlement_status_chk
      check (settlement_status in ('ANNOUNCED', 'SETTLED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'capital_activity_events_announced_date_chk'
  ) then
    alter table capital_activity_events
      add constraint capital_activity_events_announced_date_chk
      check (settlement_status <> 'ANNOUNCED' or announced_date is not null);
  end if;
end $$;

create index if not exists capital_activity_events_pending_idx
  on capital_activity_events (partnership_id, announced_date desc, created_at desc)
  where settlement_status = 'ANNOUNCED';

commit;
