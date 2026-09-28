create table if not exists liquidity_csv_imports (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  custodian text not null,
  uploaded_by_user_id uuid not null,
  file_name text not null,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  content_type text not null,
  storage_key text not null unique,
  storage_version text,
  capability_token_hash text not null,
  capability_expires_at timestamptz not null,
  reservation_active boolean not null default true,
  status text not null check(status in ('UPLOAD_PENDING','VALIDATING','QUEUED','PARSING','NEEDS_MAPPING','NEEDS_REVIEW','READY_TO_APPLY','APPLIED','FAILED','REJECTED','CANCELLED')),
  version integer not null default 1,
  review_revision integer not null default 0,
  active_run_id uuid,
  profile_id uuid,
  safe_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  applied_at timestamptz,
  unique(id,entity_id)
);
create unique index if not exists liquidity_csv_accepted_hash_idx on liquidity_csv_imports(entity_id,sha256) where storage_version is not null and status not in ('REJECTED','CANCELLED');
create index if not exists liquidity_csv_admission_idx on liquidity_csv_imports(created_at,uploaded_by_user_id,status);
create table if not exists liquidity_csv_profiles (
  id uuid primary key,
  import_id uuid not null references liquidity_csv_imports(id),
  version integer not null,
  profile jsonb not null,
  profile_hash text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  unique(import_id,version)
);
create table if not exists liquidity_csv_parse_runs (
  id uuid primary key,
  import_id uuid not null references liquidity_csv_imports(id),
  attempt_no integer not null,
  generation integer not null default 0,
  status text not null check(status in ('QUEUED','PARSING','SUCCEEDED','FAILED','CANCELLED')),
  lease_owner uuid,
  lease_expires_at timestamptz,
  retry_count integer not null default 0,
  parser_version text not null default '1.0.0',
  schema_version text not null default '2.0.0',
  profile_id uuid references liquidity_csv_profiles(id),
  source_version text not null,
  source_hash text not null,
  canonical_hash text,
  canonical_draft jsonb,
  reconciliation jsonb,
  safe_error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(import_id,attempt_no),
  unique(id,import_id)
);
create index if not exists liquidity_csv_parse_claim_idx on liquidity_csv_parse_runs(status,lease_expires_at,created_at);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='liquidity_import_active_run_fk') then
    alter table liquidity_csv_imports add constraint liquidity_import_active_run_fk foreign key(active_run_id,id) references liquidity_csv_parse_runs(id,import_id);
  end if;
end $$;
create table if not exists liquidity_csv_records (
  run_id uuid not null references liquidity_csv_parse_runs(id),
  ordinal integer not null,
  line_start integer not null,
  line_end integer not null,
  role text not null check(role in ('METADATA','HEADER','POSITION','TOTAL','BLANK','UNSUPPORTED')),
  raw_tokens jsonb not null,
  primary key(run_id,ordinal)
);
create table if not exists liquidity_csv_account_occurrences (
  run_id uuid not null references liquidity_csv_parse_runs(id),
  occurrence_id text not null,
  canonical jsonb not null,
  primary key(run_id,occurrence_id)
);
create table if not exists liquidity_csv_positions (
  run_id uuid not null,
  account_occurrence text not null,
  occurrence_id text not null,
  source_record integer not null,
  canonical jsonb not null,
  primary key(run_id,occurrence_id),
  foreign key(run_id,account_occurrence) references liquidity_csv_account_occurrences(run_id,occurrence_id),
  foreign key(run_id,source_record) references liquidity_csv_records(run_id,ordinal)
);
create table if not exists liquidity_csv_fields (
  id uuid primary key,
  run_id uuid not null references liquidity_csv_parse_runs(id),
  field_path text not null,
  field jsonb not null,
  unique(run_id,field_path)
);
create table if not exists liquidity_csv_reviews (
  id uuid primary key,
  import_id uuid not null references liquidity_csv_imports(id),
  run_id uuid not null,
  revision integer not null,
  actor_id uuid not null,
  changes jsonb not null,
  canonical_draft jsonb not null,
  canonical_hash text not null,
  bindings jsonb not null,
  issues jsonb not null,
  reconciliation jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(run_id,import_id) references liquidity_csv_parse_runs(id,import_id),
  unique(import_id,revision)
);
create table if not exists liquidity_csv_applications (
  id uuid primary key,
  import_id uuid not null references liquidity_csv_imports(id),
  run_id uuid not null,
  review_revision integer not null,
  expected_version integer not null,
  summary_hash text not null,
  canonical_hash text not null,
  bindings jsonb not null,
  account_states jsonb not null,
  preview jsonb not null,
  expires_at timestamptz not null,
  status text not null default 'PREVIEW' check(status in ('PREVIEW','APPLIED')),
  idempotency_key text,
  payload_hash text,
  snapshot_ids jsonb,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  foreign key(run_id,import_id) references liquidity_csv_parse_runs(id,import_id),
  unique(import_id,idempotency_key)
);
create table if not exists liquidity_source_outbox (
  id uuid primary key,
  application_id uuid not null unique references liquidity_csv_applications(id),
  entity_id uuid not null references entities(id),
  account_ids jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0
);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='liquidity_snapshot_import_scope_fk') then
    alter table liquidity_holdings_snapshots add constraint liquidity_snapshot_import_scope_fk foreign key(import_id,entity_id) references liquidity_csv_imports(id,entity_id);
    alter table liquidity_holdings_snapshots add constraint liquidity_snapshot_run_fk foreign key(run_id,import_id) references liquidity_csv_parse_runs(id,import_id);
    alter table liquidity_holdings_snapshots add constraint liquidity_snapshot_application_fk foreign key(application_id) references liquidity_csv_applications(id);
  end if;
end $$;
create or replace trigger liquidity_profiles_immutable before update or delete on liquidity_csv_profiles for each row execute function liquidity_deny_evidence_mutation();
create or replace trigger liquidity_records_immutable before update or delete on liquidity_csv_records for each row execute function liquidity_deny_evidence_mutation();
create or replace trigger liquidity_fields_immutable before update or delete on liquidity_csv_fields for each row execute function liquidity_deny_evidence_mutation();
create or replace trigger liquidity_drafts_immutable before update or delete on liquidity_csv_positions for each row execute function liquidity_deny_evidence_mutation();
create or replace trigger liquidity_occurrences_immutable before update or delete on liquidity_csv_account_occurrences for each row execute function liquidity_deny_evidence_mutation();
create or replace trigger liquidity_reviews_immutable before update or delete on liquidity_csv_reviews for each row execute function liquidity_deny_evidence_mutation();
