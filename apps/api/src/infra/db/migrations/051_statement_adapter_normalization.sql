begin;

-- Immutable source metadata. Existing rows and object keys remain CSV.
alter table liquidity_csv_imports add column if not exists file_kind text;
update liquidity_csv_imports set file_kind='CSV' where file_kind is null;
alter table liquidity_csv_imports alter column file_kind set default 'CSV';
alter table liquidity_csv_imports alter column file_kind set not null;
alter table liquidity_csv_imports drop constraint if exists liquidity_csv_imports_file_kind_check;
alter table liquidity_csv_imports add constraint liquidity_csv_imports_file_kind_check check(file_kind in ('CSV','XLSX'));
alter table liquidity_csv_imports add column if not exists validated_content_type text;
update liquidity_csv_imports set validated_content_type=content_type where validated_content_type is null;
alter table liquidity_csv_imports alter column validated_content_type set not null;
alter table liquidity_csv_imports add column if not exists source_identity_retained boolean not null default false;
update liquidity_csv_imports i set source_identity_retained=true
where exists(select 1 from liquidity_csv_applications a where a.import_id=i.id and a.status='APPLIED');
alter table liquidity_csv_imports add column if not exists active_review_id uuid;

create or replace function liquidity_statement_import_defaults() returns trigger language plpgsql as $$
begin
  if new.validated_content_type is null then new.validated_content_type := new.content_type; end if;
  return new;
end $$;
drop trigger if exists liquidity_statement_import_defaults_trigger on liquidity_csv_imports;
create trigger liquidity_statement_import_defaults_trigger before insert on liquidity_csv_imports
  for each row execute function liquidity_statement_import_defaults();

alter table liquidity_csv_imports drop constraint if exists liquidity_csv_imports_status_check;
alter table liquidity_csv_imports add constraint liquidity_csv_imports_status_check check(status in (
  'UPLOAD_PENDING','VALIDATING','QUEUED','PARSING','NEEDS_MAPPING','NEEDS_ADAPTER',
  'NEEDS_REVIEW','READY_TO_APPLY','APPLIED','FAILED','REJECTED','CANCELLED'
));

drop index if exists liquidity_csv_accepted_hash_idx;
create unique index liquidity_csv_accepted_hash_idx on liquidity_csv_imports(entity_id,sha256)
where storage_version is not null and (source_identity_retained or status not in ('REJECTED','CANCELLED'));

-- The recipe is nullable only for historical runs. New workers fill it before
-- SUCCEEDED; the existing successful-run trigger then protects it.
alter table liquidity_csv_parse_runs add column if not exists recipe jsonb;
alter table liquidity_csv_parse_runs add column if not exists recipe_hash text;
alter table liquidity_csv_parse_runs drop constraint if exists liquidity_csv_parse_runs_recipe_hash_check;
alter table liquidity_csv_parse_runs add constraint liquidity_csv_parse_runs_recipe_hash_check
  check(recipe_hash is null or recipe_hash ~ '^[a-f0-9]{64}$');

-- XLSX has worksheet coordinates rather than physical CSV line numbers.
alter table liquidity_csv_records alter column line_start drop not null;
alter table liquidity_csv_records alter column line_end drop not null;
alter table liquidity_csv_records add column if not exists source_kind text;
alter table liquidity_csv_records disable trigger liquidity_records_immutable;
update liquidity_csv_records set source_kind='CSV' where source_kind is null;
alter table liquidity_csv_records alter column source_kind set default 'CSV';
alter table liquidity_csv_records alter column source_kind set not null;
alter table liquidity_csv_records add column if not exists source_location jsonb;
update liquidity_csv_records set source_location=jsonb_build_object(
  'kind','CSV','record',ordinal,'lineStart',line_start,'lineEnd',line_end
) where source_location is null;
alter table liquidity_csv_records enable trigger liquidity_records_immutable;
alter table liquidity_csv_records alter column source_location set not null;
create or replace function liquidity_statement_record_defaults() returns trigger language plpgsql as $$
begin
  if new.source_kind='CSV' and new.source_location is null then
    new.source_location := jsonb_build_object('kind','CSV','record',new.ordinal,'lineStart',new.line_start,'lineEnd',new.line_end);
  end if;
  return new;
end $$;
drop trigger if exists liquidity_statement_record_defaults_trigger on liquidity_csv_records;
create trigger liquidity_statement_record_defaults_trigger before insert on liquidity_csv_records
  for each row execute function liquidity_statement_record_defaults();
alter table liquidity_csv_records drop constraint if exists liquidity_csv_records_role_check;
alter table liquidity_csv_records add constraint liquidity_csv_records_role_check check(role in (
  'METADATA','HEADER','POSITION','SUBTOTAL','TOTAL','NOTE','BLANK','EXCLUDED_SECTION','UNSUPPORTED'
));
alter table liquidity_csv_records drop constraint if exists liquidity_csv_records_source_kind_check;
alter table liquidity_csv_records add constraint liquidity_csv_records_source_kind_check check(source_kind in ('CSV','XLSX'));
alter table liquidity_csv_records drop constraint if exists liquidity_csv_records_location_check;
alter table liquidity_csv_records add constraint liquidity_csv_records_location_check check(
  (source_kind='CSV' and line_start is not null and line_end is not null and line_start>0 and line_end>=line_start and source_location->>'kind'='CSV') or
  (source_kind='XLSX' and line_start is null and line_end is null and source_location->>'kind'='XLSX'
    and (source_location->>'row')::integer>0 and (source_location->>'column')::integer>0)
);

alter table liquidity_csv_reviews add column if not exists excluded_accounts jsonb not null default '[]'::jsonb;
alter table liquidity_csv_reviews add constraint liquidity_csv_reviews_id_import_unique unique(id,import_id);
alter table liquidity_csv_reviews add constraint liquidity_csv_reviews_id_import_run_unique unique(id,import_id,run_id);
update liquidity_csv_imports i set active_review_id=r.id
from liquidity_csv_reviews r
where r.import_id=i.id and r.run_id=i.active_run_id and r.revision=i.review_revision;
alter table liquidity_csv_imports add constraint liquidity_import_active_review_fk
  foreign key(active_review_id,id,active_run_id) references liquidity_csv_reviews(id,import_id,run_id);
alter table liquidity_csv_applications add column if not exists excluded_accounts jsonb not null default '[]'::jsonb;

create index if not exists liquidity_csv_records_page_idx on liquidity_csv_records(run_id,ordinal);
create index if not exists liquidity_csv_runs_recipe_idx on liquidity_csv_parse_runs(recipe_hash) where recipe_hash is not null;

-- New publications identify a provider-neutral statement source. Historical
-- CSV and CSV_FALLBACK labels remain unchanged.
alter table liquidity_source_accounts drop constraint if exists liquidity_source_accounts_origin_check;
alter table liquidity_source_accounts drop constraint if exists liquidity_source_accounts_active_source_check;
alter table liquidity_source_accounts add constraint liquidity_source_accounts_origin_check check(origin in ('CSV','STATEMENT'));
alter table liquidity_source_accounts add constraint liquidity_source_accounts_active_source_check check(active_source in ('CSV','STATEMENT'));

alter table liquidity_holdings_snapshots drop constraint if exists liquidity_holdings_snapshots_source_kind_check;
alter table liquidity_holdings_snapshots add constraint liquidity_holdings_snapshots_source_kind_check check(source_kind in ('CSV','STATEMENT'));

alter table liquidity_source_valuations drop constraint if exists liquidity_source_valuations_mode_check;
alter table liquidity_source_valuations add constraint liquidity_source_valuations_mode_check
  check(mode in ('CSV_FALLBACK','STATEMENT_FALLBACK','MARKET_QUOTE'));

-- Extend import identity protection to the new immutable source metadata and
-- make the retained-source bit monotonic.
create or replace function liquidity_import_identity_immutable() returns trigger language plpgsql as $$
begin
  if new.entity_id is distinct from old.entity_id or new.custodian is distinct from old.custodian or
     new.sha256 is distinct from old.sha256 or new.size_bytes is distinct from old.size_bytes or
     new.storage_key is distinct from old.storage_key or new.content_type is distinct from old.content_type or
     new.file_kind is distinct from old.file_kind or
     new.validated_content_type is distinct from old.validated_content_type or
     (old.storage_version is not null and new.storage_version is distinct from old.storage_version) or
     (old.source_identity_retained and not new.source_identity_retained) then
    raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE';
  end if;
  return new;
end $$;

commit;
