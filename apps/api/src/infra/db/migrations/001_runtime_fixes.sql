-- Add columns referenced by partnerships repository CTE that are missing from base schema.
alter table k1_documents
  add column if not exists uploaded_at timestamptz not null default now();

alter table k1_documents
  add column if not exists superseded_by_document_id uuid references k1_documents(id);

-- Auth users live in the in-memory repository (Postgres-backed auth is a future task),
-- so audit_events cannot enforce a foreign key to users(id).
alter table audit_events
  drop constraint if exists audit_events_actor_user_id_fkey;