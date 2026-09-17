-- Let an explicitly scoped K-1 upload create its partnership record after
-- extraction, while retaining the normal match-and-review behavior by default.

alter table if exists k1_ingestion_batches
  add column if not exists create_partnership_if_missing boolean not null default false;
