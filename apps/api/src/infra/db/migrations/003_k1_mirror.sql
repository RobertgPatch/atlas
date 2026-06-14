-- Allow K-1 ingestion to mirror to Postgres alongside the in-memory store.

alter table documents drop constraint if exists documents_uploaded_by_fkey;
alter table documents alter column file_name drop not null;

alter table k1_documents alter column tax_year drop not null;