begin;

alter table capital_activity_events
  drop constraint if exists capital_activity_events_event_type_chk;

alter table capital_activity_events
  add constraint capital_activity_events_event_type_chk
  check (event_type in (
    'capital_call',
    'funded_contribution',
    'distribution',
    'recallable_distribution',
    'other_adjustment'
  ));

alter table partnership_commitments
  add column if not exists source_cash_flow_event_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partnership_commitments_source_cash_flow_event_fk'
  ) then
    alter table partnership_commitments
      add constraint partnership_commitments_source_cash_flow_event_fk
      foreign key (source_cash_flow_event_id)
      references capital_activity_events(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists partnership_commitments_source_cash_flow_event_idx
  on partnership_commitments (source_cash_flow_event_id)
  where source_cash_flow_event_id is not null;

commit;
