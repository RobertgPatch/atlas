-- 003_review_finalization.sql
-- Schema additions for Feature 003 — K-1 Review Workspace and Finalization.
-- Idempotent; run AFTER 002_k1_ingestion.sql.
-- See specs/003-review-and-finalization/data-model.md for rationale.

-- ---------------------------------------------------------------------------
-- k1_documents: optimistic-concurrency version + two-person rule columns
-- ---------------------------------------------------------------------------
alter table if exists k1_documents
  add column if not exists version                int         not null default 0,
  add column if not exists approved_by_user_id    uuid        references users(id),
  add column if not exists finalized_by_user_id   uuid        references users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'k1_documents_version_nonneg_chk'
  ) then
    alter table k1_documents
      add constraint k1_documents_version_nonneg_chk
      check (version >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'k1_documents_finalized_by_requires_finalized_chk'
  ) then
    alter table k1_documents
      add constraint k1_documents_finalized_by_requires_finalized_chk
      check (
        finalized_by_user_id is null
        or processing_status = 'FINALIZED'
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'k1_documents_approved_by_requires_approved_chk'
  ) then
    alter table k1_documents
      add constraint k1_documents_approved_by_requires_approved_chk
      check (
        approved_by_user_id is null
        or processing_status in ('READY_FOR_APPROVAL', 'FINALIZED')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- k1_issues: field linkage (for auto-resolve) + resolution metadata
-- ---------------------------------------------------------------------------
alter table if exists k1_issues
  add column if not exists k1_field_value_id   uuid references k1_field_values(id),
  add column if not exists resolved_at         timestamptz,
  add column if not exists resolved_by_user_id uuid references users(id);

create index if not exists k1_issues_k1_field_value_id_idx
  on k1_issues (k1_field_value_id)
  where k1_field_value_id is not null;

create index if not exists k1_issues_open_by_document_idx
  on k1_issues (k1_document_id)
  where status = 'OPEN';

-- ---------------------------------------------------------------------------
-- k1_field_values: raw_value immutability guard (defensive trigger)
-- ---------------------------------------------------------------------------
create or replace function k1_field_values_raw_value_immutable()
returns trigger as $$
begin
  if new.raw_value is distinct from old.raw_value then
    raise exception 'k1_field_values.raw_value is immutable after insert (k1_field_value_id=%)',
      old.id using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'k1_field_values_raw_value_immutable_trg'
  ) then
    create trigger k1_field_values_raw_value_immutable_trg
      before update on k1_field_values
      for each row
      execute function k1_field_values_raw_value_immutable();
  end if;
end $$;
