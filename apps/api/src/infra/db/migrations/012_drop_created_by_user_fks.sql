-- Auth users live in the in-memory repository (Postgres-backed auth is a future task),
-- so business tables cannot enforce a foreign key to users(id) for created_by_user_id.

alter table partnership_commitments
  drop constraint if exists partnership_commitments_created_by_user_id_fkey;

alter table capital_activity_events
  drop constraint if exists capital_activity_events_created_by_user_id_fkey;

alter table documents
  drop constraint if exists documents_uploaded_by_fkey;

alter table partnership_fmv_snapshots
  drop constraint if exists partnership_fmv_snapshots_created_by_fkey;

alter table k1_field_values
  drop constraint if exists k1_field_values_created_by_fkey;
