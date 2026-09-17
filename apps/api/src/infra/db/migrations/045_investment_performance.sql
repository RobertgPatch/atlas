alter table partnerships add column if not exists final_liquidation_date date;

-- Activity amount is gross cash; actual fees are stored separately for net performance.
alter table capital_activity_events add column if not exists fees_and_carry numeric(20,4) not null default 0
  check (fees_and_carry >= 0 and (event_type <> 'funded_contribution' or fees_and_carry <= abs(amount)));
