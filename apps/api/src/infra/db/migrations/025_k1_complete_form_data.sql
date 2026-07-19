-- Persist the typed, non-calculation cells from the standard Schedule K-1.
-- Existing money fields remain in k1_tracker_value_revisions so basis and
-- projection behavior are unchanged.

alter table if exists k1_tracker_years
  add column if not exists official_form_data jsonb not null default '{}'::jsonb;
