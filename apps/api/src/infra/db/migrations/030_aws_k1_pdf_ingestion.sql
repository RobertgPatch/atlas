-- Durable, provider-neutral K-1 PDF ingestion foundation.
-- Additive and idempotent so pre-durable stub documents remain reviewable.

alter table if exists documents
  add column if not exists storage_bucket text,
  add column if not exists storage_version_id text,
  add column if not exists size_bytes bigint,
  add column if not exists sha256 text,
  add column if not exists page_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'documents_size_bytes_positive_chk'
       and conrelid = 'documents'::regclass
  ) then
    alter table documents add constraint documents_size_bytes_positive_chk
      check (size_bytes is null or size_bytes > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'documents_sha256_format_chk'
       and conrelid = 'documents'::regclass
  ) then
    alter table documents add constraint documents_sha256_format_chk
      check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'documents_page_count_positive_chk'
       and conrelid = 'documents'::regclass
  ) then
    alter table documents add constraint documents_page_count_positive_chk
      check (page_count is null or page_count > 0);
  end if;
end $$;

create index if not exists documents_sha256_idx
  on documents (sha256)
  where sha256 is not null;

alter table if exists k1_documents
  add column if not exists extraction_schema_version text,
  add column if not exists match_status text not null default 'UNRESOLVED',
  add column if not exists applied_tracker_year_id uuid references k1_tracker_years(id),
  add column if not exists applied_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_documents_match_status_chk'
       and conrelid = 'k1_documents'::regclass
  ) then
    alter table k1_documents add constraint k1_documents_match_status_chk
      check (match_status in ('UNRESOLVED', 'MATCHED', 'REQUIRES_REVIEW'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_documents_applied_at_chk'
       and conrelid = 'k1_documents'::regclass
  ) then
    alter table k1_documents add constraint k1_documents_applied_at_chk
      check (
        (applied_tracker_year_id is null and applied_at is null)
        or (applied_tracker_year_id is not null and applied_at is not null)
      );
  end if;
end $$;

create table if not exists k1_ingestion_batches (
  id uuid primary key,
  created_by_user_id uuid not null references users(id),
  entity_scope_id uuid references entities(id),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'PROCESSING', 'ACTION_REQUIRED', 'COMPLETED', 'PARTIAL_FAILURE', 'CANCELLED')),
  file_count integer not null check (file_count between 1 and 25),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status in ('COMPLETED', 'PARTIAL_FAILURE', 'CANCELLED')) = (closed_at is not null))
);

create index if not exists k1_ingestion_batches_creator_created_idx
  on k1_ingestion_batches (created_by_user_id, created_at desc);
create index if not exists k1_ingestion_batches_scope_status_idx
  on k1_ingestion_batches (entity_scope_id, status, created_at desc);

create table if not exists k1_ingestion_items (
  id uuid primary key,
  batch_id uuid not null references k1_ingestion_batches(id),
  sequence_number integer not null check (sequence_number >= 0),
  document_id uuid unique references documents(id),
  k1_document_id uuid unique references k1_documents(id),
  client_file_name text not null,
  declared_size_bytes bigint not null check (declared_size_bytes > 0),
  declared_sha256 text not null check (declared_sha256 ~ '^[0-9a-f]{64}$'),
  object_key text not null unique,
  object_version_id text,
  status text not null default 'PENDING_UPLOAD'
    check (status in (
      'PENDING_UPLOAD', 'UPLOADED', 'VALIDATING', 'QUEUED', 'PROCESSING',
      'NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED', 'FAILED', 'CANCELLED'
    )),
  error_code text,
  error_summary text,
  queued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint k1_ingestion_items_batch_sha256_key unique (batch_id, declared_sha256),
  constraint k1_ingestion_items_batch_sequence_key unique (batch_id, sequence_number),
  check (length(trim(client_file_name)) > 0),
  check (object_key !~ '(^|/)\\.\\.(/|$)')
);

create index if not exists k1_ingestion_items_batch_status_idx
  on k1_ingestion_items (batch_id, status, updated_at);
create index if not exists k1_ingestion_items_queue_age_idx
  on k1_ingestion_items (status, queued_at)
  where status in ('QUEUED', 'PROCESSING');

-- PostgreSQL-backed queue for fully local development. AWS deployments use
-- SQS through the same adapter contract.
create table if not exists k1_local_queue_messages (
  id uuid primary key,
  queue_name text not null check (queue_name in ('START_WORK', 'COMPLETION')),
  dedupe_key text not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  delivery_count integer not null default 0 check (delivery_count >= 0),
  created_at timestamptz not null default now(),
  constraint k1_local_queue_messages_dedupe_key unique (queue_name, dedupe_key)
);

create index if not exists k1_local_queue_messages_ready_idx
  on k1_local_queue_messages (queue_name, available_at, created_at)
  where locked_until is null;

create table if not exists k1_extraction_attempts (
  id uuid primary key,
  k1_document_id uuid not null references k1_documents(id),
  attempt_number integer not null check (attempt_number > 0),
  provider text not null check (provider in ('AWS_BDA', 'STUB')),
  provider_job_id text,
  client_token text not null unique,
  input_s3_uri text,
  output_s3_prefix text,
  project_arn text,
  project_stage text,
  blueprint_arn text,
  blueprint_version text,
  mapping_schema_version text not null,
  status text not null default 'CREATED'
    check (status in ('CREATED', 'SUBMITTED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'SUPERSEDED')),
  raw_result_key text,
  raw_result_sha256 text,
  custom_output_status text,
  started_at timestamptz,
  completed_at timestamptz,
  last_reconciled_at timestamptz,
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint k1_extraction_attempts_document_number_key
    unique (k1_document_id, attempt_number),
  check (raw_result_sha256 is null or raw_result_sha256 ~ '^[0-9a-f]{64}$'),
  check (
    (status in ('SUCCEEDED', 'FAILED', 'SUPERSEDED') and completed_at is not null)
    or (status not in ('SUCCEEDED', 'FAILED', 'SUPERSEDED'))
  )
);

create unique index if not exists k1_extraction_attempts_provider_job_idx
  on k1_extraction_attempts (provider_job_id)
  where provider_job_id is not null;
create index if not exists k1_extraction_attempts_status_reconcile_idx
  on k1_extraction_attempts (status, last_reconciled_at)
  where status in ('SUBMITTED', 'IN_PROGRESS');

alter table if exists k1_documents
  add column if not exists active_extraction_attempt_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_documents_active_extraction_attempt_fkey'
       and conrelid = 'k1_documents'::regclass
  ) then
    alter table k1_documents
      add constraint k1_documents_active_extraction_attempt_fkey
      foreign key (active_extraction_attempt_id) references k1_extraction_attempts(id);
  end if;
end $$;

create index if not exists k1_documents_active_attempt_idx
  on k1_documents (active_extraction_attempt_id)
  where active_extraction_attempt_id is not null;

alter table if exists k1_field_values
  add column if not exists extraction_attempt_id uuid references k1_extraction_attempts(id),
  add column if not exists canonical_path text,
  add column if not exists occurrence_id uuid,
  add column if not exists occurrence_index integer,
  add column if not exists label text,
  add column if not exists review_section text,
  add column if not exists is_required boolean not null default false,
  add column if not exists value_kind text,
  add column if not exists raw_value_json jsonb,
  add column if not exists normalized_value_json jsonb,
  add column if not exists reviewer_corrected_value_json jsonb,
  add column if not exists source_locations jsonb not null default '[]'::jsonb,
  add column if not exists destination_kind text,
  add column if not exists destination_key text,
  add column if not exists mapping_rule_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_field_values_review_section_chk'
       and conrelid = 'k1_field_values'::regclass
  ) then
    alter table k1_field_values add constraint k1_field_values_review_section_chk
      check (review_section is null or review_section in ('entityMapping', 'partnershipMapping', 'core'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_field_values_occurrence_index_chk'
       and conrelid = 'k1_field_values'::regclass
  ) then
    alter table k1_field_values add constraint k1_field_values_occurrence_index_chk
      check (occurrence_index is null or occurrence_index >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_field_values_value_kind_chk'
       and conrelid = 'k1_field_values'::regclass
  ) then
    alter table k1_field_values add constraint k1_field_values_value_kind_chk
      check (value_kind is null or value_kind in ('STRING', 'NUMBER', 'BOOLEAN', 'CODE_ROW', 'DATE', 'PERCENTAGE', 'MONEY'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_field_values_destination_kind_chk'
       and conrelid = 'k1_field_values'::regclass
  ) then
    alter table k1_field_values add constraint k1_field_values_destination_kind_chk
      check (destination_kind is null or destination_kind in ('CALCULATION', 'OFFICIAL', 'MATCH_SIGNAL', 'EVIDENCE_ONLY'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'k1_field_values_source_locations_array_chk'
       and conrelid = 'k1_field_values'::regclass
  ) then
    alter table k1_field_values add constraint k1_field_values_source_locations_array_chk
      check (jsonb_typeof(source_locations) = 'array');
  end if;
end $$;

create unique index if not exists k1_field_values_attempt_occurrence_idx
  on k1_field_values (extraction_attempt_id, occurrence_id)
  where extraction_attempt_id is not null and occurrence_id is not null;
create index if not exists k1_field_values_active_review_idx
  on k1_field_values (k1_document_id, extraction_attempt_id, occurrence_index);

create table if not exists k1_field_value_corrections (
  id uuid primary key,
  k1_field_value_id uuid not null references k1_field_values(id),
  k1_document_id uuid not null references k1_documents(id),
  extraction_attempt_id uuid references k1_extraction_attempts(id),
  previous_value_json jsonb,
  corrected_value_json jsonb,
  previous_value_text text,
  corrected_value_text text,
  document_version integer not null check (document_version >= 0),
  corrected_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index if not exists k1_field_value_corrections_field_created_idx
  on k1_field_value_corrections (k1_field_value_id, created_at desc);

create or replace function k1_field_values_raw_value_immutable()
returns trigger as $$
begin
  if new.raw_value is distinct from old.raw_value
    or new.raw_value_json is distinct from old.raw_value_json
    or new.confidence_score is distinct from old.confidence_score
    or new.extraction_attempt_id is distinct from old.extraction_attempt_id
    or new.canonical_path is distinct from old.canonical_path
    or new.occurrence_id is distinct from old.occurrence_id
    or new.source_locations is distinct from old.source_locations
  then
    raise exception 'raw K-1 extraction evidence is immutable after insert (k1_field_value_id=%)',
      old.id using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

alter table if exists k1_issues
  add column if not exists extraction_attempt_id uuid references k1_extraction_attempts(id),
  add column if not exists occurrence_id uuid,
  add column if not exists issue_code text,
  add column if not exists details_json jsonb not null default '{}'::jsonb;

create index if not exists k1_issues_attempt_status_idx
  on k1_issues (extraction_attempt_id, status)
  where extraction_attempt_id is not null;

create table if not exists k1_match_candidates (
  id uuid primary key,
  k1_document_id uuid not null references k1_documents(id),
  extraction_attempt_id uuid not null references k1_extraction_attempts(id),
  candidate_type text not null check (candidate_type in ('ENTITY', 'PARTNERSHIP')),
  candidate_record_id uuid not null,
  score numeric(8,5) not null,
  signals jsonb not null default '{}'::jsonb,
  decision text not null default 'PROPOSED'
    check (decision in ('PROPOSED', 'SELECTED', 'REJECTED')),
  decided_by_user_id uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint k1_match_candidates_attempt_candidate_key
    unique (extraction_attempt_id, candidate_type, candidate_record_id),
  check (
    (decision = 'PROPOSED' and decided_by_user_id is null and decided_at is null)
    or (decision in ('SELECTED', 'REJECTED') and decided_by_user_id is not null and decided_at is not null)
  )
);

create index if not exists k1_match_candidates_document_decision_idx
  on k1_match_candidates (k1_document_id, decision, score desc);

create table if not exists k1_document_applications (
  id uuid primary key,
  k1_document_id uuid not null references k1_documents(id),
  extraction_attempt_id uuid not null references k1_extraction_attempts(id),
  tracker_year_id uuid not null references k1_tracker_years(id),
  expected_document_version integer not null check (expected_document_version >= 0),
  expected_tracker_revision integer not null check (expected_tracker_revision > 0),
  mapping_rule_version text not null,
  status text not null default 'PREVIEWED'
    check (status in ('PREVIEWED', 'APPLIED', 'STALE', 'FAILED', 'CANCELLED')),
  preview_expires_at timestamptz not null,
  applied_by_user_id uuid references users(id),
  applied_at timestamptz,
  audit_event_id uuid references audit_events(id),
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'APPLIED' and applied_by_user_id is not null and applied_at is not null)
    or status <> 'APPLIED'
  )
);

create unique index if not exists k1_document_applications_applied_document_idx
  on k1_document_applications (k1_document_id)
  where status = 'APPLIED';
create index if not exists k1_document_applications_preview_idx
  on k1_document_applications (k1_document_id, status, preview_expires_at);

create table if not exists k1_application_field_decisions (
  id uuid primary key,
  application_id uuid not null references k1_document_applications(id) on delete cascade,
  destination_kind text not null check (destination_kind in ('CALCULATION', 'OFFICIAL')),
  destination_key text not null,
  source_field_value_ids uuid[] not null,
  extracted_value jsonb,
  existing_value jsonb,
  decision text not null check (decision in ('USE_EXTRACTED', 'KEEP_EXISTING', 'SKIP_UNMAPPED')),
  final_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint k1_application_field_decisions_destination_key
    unique (application_id, destination_kind, destination_key),
  check (cardinality(source_field_value_ids) > 0),
  check (decision <> 'SKIP_UNMAPPED' or reason is not null)
);

create table if not exists k1_tracker_official_value_revisions (
  id uuid primary key,
  tracker_year_id uuid not null references k1_tracker_years(id) on delete cascade,
  field_key text not null,
  value_json jsonb,
  source_type text not null check (source_type in ('FINALIZED_K1', 'MANUAL_ENTRY', 'MANUAL_OVERRIDE')),
  source_k1_document_id uuid references k1_documents(id),
  source_k1_field_value_ids uuid[] not null default '{}'::uuid[],
  extraction_attempt_id uuid references k1_extraction_attempts(id),
  supersedes_revision_id uuid references k1_tracker_official_value_revisions(id),
  is_active boolean not null default true,
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  check (
    source_type <> 'FINALIZED_K1'
    or (
      source_k1_document_id is not null
      and extraction_attempt_id is not null
      and cardinality(source_k1_field_value_ids) > 0
    )
  )
);

create unique index if not exists k1_tracker_active_official_value_idx
  on k1_tracker_official_value_revisions (tracker_year_id, field_key)
  where is_active;
create index if not exists k1_tracker_official_source_idx
  on k1_tracker_official_value_revisions (source_k1_document_id, extraction_attempt_id)
  where is_active;
