-- Some databases applied migration 054 before it handled PostgreSQL's
-- auto-generated name for the original fees-and-carry check.
alter table capital_activity_events
  drop constraint if exists capital_activity_events_check;
