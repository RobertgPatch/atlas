-- Applied K-1 evidence is an accounting source and must not be physically
-- deleted through ordinary application/database cleanup. A separately audited
-- retention process must first sever the applied link under an approved policy.
create or replace function prevent_applied_k1_document_delete()
returns trigger language plpgsql as $$
begin
  if old.applied_at is not null or old.applied_tracker_year_id is not null then
    raise exception 'APPLIED_K1_DOCUMENT_RETAINED' using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists k1_documents_prevent_applied_delete on k1_documents;
create trigger k1_documents_prevent_applied_delete
before delete on k1_documents
for each row execute function prevent_applied_k1_document_delete();
