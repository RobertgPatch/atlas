-- Completed source evidence remains immutable even if a future caller bypasses
-- the service workflow. Mutable leases are allowed only before success.
create or replace function liquidity_parse_result_immutable() returns trigger language plpgsql as $$
begin
  if old.status='SUCCEEDED' and (TG_OP='DELETE' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE';
  end if;
  return new;
end $$;
create or replace trigger liquidity_parse_result_guard before update or delete on liquidity_csv_parse_runs for each row execute function liquidity_parse_result_immutable();

create or replace function liquidity_import_identity_immutable() returns trigger language plpgsql as $$
begin
  if new.entity_id is distinct from old.entity_id or new.custodian is distinct from old.custodian or
     new.sha256 is distinct from old.sha256 or new.size_bytes is distinct from old.size_bytes or
     new.storage_key is distinct from old.storage_key or
     (old.storage_version is not null and new.storage_version is distinct from old.storage_version) then
    raise exception 'LIQUIDITY_IMMUTABLE_EVIDENCE';
  end if;
  return new;
end $$;
create or replace trigger liquidity_import_identity_guard before update on liquidity_csv_imports for each row execute function liquidity_import_identity_immutable();
