-- User-facing removal for empty custodians and non-applied statement drafts.
-- Financial evidence remains retained for audit/recovery; active reads exclude it.
alter table liquidity_source_accounts add column if not exists archived_at timestamptz;
alter table liquidity_source_accounts add column if not exists archived_by_user_id uuid;
alter table liquidity_csv_imports add column if not exists archived_at timestamptz;
alter table liquidity_csv_imports add column if not exists archived_by_user_id uuid;

create index if not exists liquidity_source_accounts_active_custodian_idx
  on liquidity_source_accounts(entity_id,custodian) where archived_at is null;
create index if not exists liquidity_csv_imports_active_custodian_idx
  on liquidity_csv_imports(entity_id,custodian,created_at desc) where archived_at is null;
