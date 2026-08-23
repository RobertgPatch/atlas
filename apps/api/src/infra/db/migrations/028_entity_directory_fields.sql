alter table entities
  add column if not exists jurisdiction text,
  add column if not exists tax_id text,
  add column if not exists formed_on date,
  add column if not exists registered_agent text,
  add column if not exists primary_contact text;
