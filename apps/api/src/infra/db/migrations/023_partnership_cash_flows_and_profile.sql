begin;

alter table partnerships
  add column if not exists ein text,
  add column if not exists fund_manager text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists address_city text,
  add column if not exists address_region text,
  add column if not exists address_postal_code text,
  add column if not exists address_country text;

alter table capital_activity_events
  drop constraint if exists capital_activity_events_event_type_chk;

alter table capital_activity_events
  add constraint capital_activity_events_event_type_chk
  check (event_type in ('capital_call', 'funded_contribution', 'distribution', 'other_adjustment'));

commit;
