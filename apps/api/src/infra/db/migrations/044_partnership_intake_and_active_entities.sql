-- Partnership intake uses K-1 page 1 as temporary extraction evidence. Keep
-- the resulting partnership on the batch item after that evidence is removed.

alter table if exists k1_ingestion_items
  add column if not exists partnership_intake_partnership_id uuid references partnerships(id),
  add column if not exists partnership_intake_source_k1_document_id uuid;

create index if not exists k1_ingestion_items_partnership_intake_source_idx
  on k1_ingestion_items (partnership_intake_source_k1_document_id)
  where partnership_intake_source_k1_document_id is not null;

-- Entities are usable as soon as they are created. Retire the old draft state
-- for existing rows as well as new ones.
update entities
   set status = 'ACTIVE', updated_at = now()
 where upper(trim(status)) = 'DRAFT';
