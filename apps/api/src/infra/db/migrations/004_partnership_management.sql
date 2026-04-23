-- Migration 004: Partnership Management
-- Feature: 004-partnership-management
-- Spec: specs/004-partnership-management/data-model.md §4

begin;

-- 1. Status enum guardrail (partnerships.status must be one of the four canonical values)
alter table partnerships
  add constraint partnerships_status_check
  check (status in ('ACTIVE','PENDING','LIQUIDATED','CLOSED'));

-- 2. FMV append-only — drop the per-date unique constraint so multiple snapshots
--    per (partnership_id, valuation_date) are legal (Clarification Q3)
alter table partnership_fmv_snapshots
  drop constraint if exists partnership_fmv_snapshots_partnership_id_valuation_date_key;

-- 3. FMV latest-by-created_at lookup index (supports "Latest FMV" derivation and list ordering)
create index if not exists partnership_fmv_snapshots_partnership_created_idx
  on partnership_fmv_snapshots (partnership_id, created_at desc);

-- 4. Directory name-conflict lookup — not unique at DB level; 409 is enforced at app layer
--    because lower() on the existing text column avoids a functional-index DDL constraint.
create index if not exists partnerships_entity_name_idx
  on partnerships (entity_id, lower(name));

-- 5. K-1 latest-year lookup (supports latestK1Year derivation in list and detail CTEs)
create index if not exists k1_reported_distributions_partnership_year_idx
  on k1_reported_distributions (partnership_id, tax_year);

commit;
