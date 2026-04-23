-- 002_k1_ingestion.sql
-- Adds K-1 ingestion artifacts per specs/002-k1-ingestion/data-model.md.
-- Idempotent where practical; run AFTER 001_auth_access.sql.

-- ---------------------------------------------------------------------------
-- Extend k1_documents (columns assumed present from docs/schema/21-postgres-ddl.sql)
-- ---------------------------------------------------------------------------
alter table if exists k1_documents
  add column if not exists parse_error_code       text,
  add column if not exists parse_error_message    text,
  add column if not exists parse_attempts         int not null default 0,
  add column if not exists superseded_by_document_id uuid references documents(id),
  add column if not exists uploader_user_id       uuid references users(id);

-- Enforce the five-value lifecycle vocabulary (FR-017).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'k1_documents_processing_status_chk'
  ) then
    alter table k1_documents
      add constraint k1_documents_processing_status_chk
      check (processing_status in (
        'UPLOADED',
        'PROCESSING',
        'NEEDS_REVIEW',
        'READY_FOR_APPROVAL',
        'FINALIZED'
      ));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- document_versions — supersession chain (FR-023a/b, Constitution §13)
-- ---------------------------------------------------------------------------
create table if not exists document_versions (
  id                    uuid primary key,
  original_document_id  uuid not null references documents(id),
  superseded_by_id      uuid not null references documents(id),
  partnership_id        uuid not null references partnerships(id),
  entity_id             uuid not null references entities(id),
  tax_year              int  not null,
  superseded_at         timestamptz not null default now(),
  superseded_by_user_id uuid references users(id),
  unique (original_document_id)
);

create index if not exists document_versions_scope_idx
  on document_versions (entity_id, partnership_id, tax_year);

-- ---------------------------------------------------------------------------
-- entity_memberships — per-user entity entitlement (FR-032, FR-033a)
-- ---------------------------------------------------------------------------
create table if not exists entity_memberships (
  id         uuid primary key,
  user_id    uuid not null references users(id),
  entity_id  uuid not null references entities(id),
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  unique (user_id, entity_id)
);

create index if not exists entity_memberships_user_idx
  on entity_memberships (user_id);
create index if not exists entity_memberships_entity_idx
  on entity_memberships (entity_id);

-- ---------------------------------------------------------------------------
-- v_k1_active_documents — default "active" view (hides superseded rows)
-- ---------------------------------------------------------------------------
create or replace view v_k1_active_documents as
select k.*
from k1_documents k
where k.superseded_by_document_id is null;
