alter table capital_activity_events
  add column is_final_liquidation boolean not null default false;

alter table capital_activity_events
  add constraint capital_activity_final_liquidation_check
  check (not is_final_liquidation or (event_type = 'distribution' and settlement_status = 'SETTLED'));

create unique index capital_activity_one_final_liquidation_per_partnership
  on capital_activity_events (partnership_id)
  where is_final_liquidation;
