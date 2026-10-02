-- A fee-only capital call has no gross contribution but still has a net cash outflow.
alter table capital_activity_events
  drop constraint if exists capital_activity_events_amount_nonzero_chk,
  drop constraint if exists capital_activity_events_check,
  drop constraint if exists capital_activity_events_fees_and_carry_check;

alter table capital_activity_events
  add constraint capital_activity_events_amount_nonzero_chk
    check (amount <> 0 or (event_type = 'funded_contribution' and fees_and_carry > 0)),
  add constraint capital_activity_events_fees_and_carry_check
    check (fees_and_carry >= 0);
