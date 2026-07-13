begin;

create table if not exists k1_tracker_years (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  partnership_id uuid not null references partnerships(id),
  tax_year int not null check (tax_year between 1900 and 2100),
  workflow_status text not null default 'NOT_STARTED' check (workflow_status in ('NOT_STARTED', 'IMPORTED', 'NEEDS_REVIEW', 'RECONCILED')),
  revision int not null default 1 check (revision > 0),
  source_conflict_count int not null default 0 check (source_conflict_count >= 0),
  warning_count int not null default 0 check (warning_count >= 0),
  calculation_version text not null default 'irs-k1-basis-v1',
  ending_outside_basis numeric(18,2),
  cumulative_suspended_loss numeric(18,2),
  taxable_excess_distribution numeric(18,2),
  section_l_difference numeric(18,2),
  calculated_at timestamptz,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, partnership_id, tax_year)
);

create index if not exists k1_tracker_years_partnership_year_idx on k1_tracker_years (partnership_id, tax_year);
create index if not exists k1_tracker_years_entity_status_idx on k1_tracker_years (entity_id, workflow_status);

create table if not exists k1_tracker_import_batches (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  target_partnership_id uuid references partnerships(id),
  original_file_name text not null,
  workbook_sha256 text not null,
  status text not null check (status in ('PREVIEWED', 'COMMITTED', 'FAILED', 'EXPIRED')),
  preview_payload jsonb not null default '{}'::jsonb,
  commit_decisions jsonb,
  error_summary jsonb,
  expires_at timestamptz not null,
  committed_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists k1_tracker_import_batches_expiry_idx on k1_tracker_import_batches (status, expires_at);
create index if not exists k1_tracker_import_batches_hash_idx on k1_tracker_import_batches (target_partnership_id, workbook_sha256, status);

create table if not exists k1_tracker_value_revisions (
  id uuid primary key,
  tracker_year_id uuid not null references k1_tracker_years(id) on delete cascade,
  field_key text not null,
  amount numeric(18,2),
  original_source_text text,
  source_type text not null check (source_type in ('FINALIZED_K1', 'WORKBOOK_IMPORT', 'MANUAL_ENTRY', 'MANUAL_OVERRIDE', 'CARRYFORWARD')),
  source_k1_document_id uuid references k1_documents(id),
  source_k1_field_value_id uuid references k1_field_values(id),
  import_batch_id uuid references k1_tracker_import_batches(id),
  source_sheet text,
  source_cell text,
  carryforward_from_year_id uuid references k1_tracker_years(id),
  override_reason text,
  supersedes_value_revision_id uuid references k1_tracker_value_revisions(id),
  is_active boolean not null default true,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  check ((source_type <> 'MANUAL_OVERRIDE') or (override_reason is not null and length(trim(override_reason)) > 0)),
  check ((source_type <> 'WORKBOOK_IMPORT') or (import_batch_id is not null and source_sheet is not null and source_cell is not null))
);

create unique index if not exists k1_tracker_active_value_idx on k1_tracker_value_revisions (tracker_year_id, field_key) where is_active;
create index if not exists k1_tracker_value_source_idx on k1_tracker_value_revisions (source_k1_document_id, source_k1_field_value_id) where is_active;

create table if not exists k1_tracker_signoffs (
  id uuid primary key,
  tracker_year_id uuid not null references k1_tracker_years(id) on delete cascade,
  year_revision int not null,
  signoff_type text not null check (signoff_type in ('PREPARED', 'REVIEWED', 'INVALIDATED')),
  signed_by_user_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists k1_tracker_signoffs_year_revision_idx on k1_tracker_signoffs (tracker_year_id, year_revision, created_at desc);

commit;
