begin;

-- Product decision: Liquidity is CSV-only. Remove all imported Plaid history
-- and credentials while preserving independently approved CSV snapshots.
drop trigger if exists liquidity_positions_immutable on liquidity_source_positions;
drop trigger if exists liquidity_snapshots_immutable on liquidity_holdings_snapshots;
drop trigger if exists liquidity_valuations_immutable on liquidity_source_valuations;

update liquidity_source_accounts a
set current_snapshot_id = null
where current_snapshot_id in (
  select id from liquidity_holdings_snapshots where source_kind = 'PLAID_LEGACY'
);

update liquidity_holdings_snapshots
set supersedes_snapshot_id = null
where supersedes_snapshot_id in (
  select id from liquidity_holdings_snapshots where source_kind = 'PLAID_LEGACY'
);

update liquidity_holdings_snapshots
set superseded_by_snapshot_id = null
where superseded_by_snapshot_id in (
  select id from liquidity_holdings_snapshots where source_kind = 'PLAID_LEGACY'
);

delete from liquidity_source_valuations
where mode = 'PLAID_LEGACY'
   or source_snapshot_id in (
     select id from liquidity_holdings_snapshots where source_kind = 'PLAID_LEGACY'
   );

delete from liquidity_source_positions
where snapshot_id in (
  select id from liquidity_holdings_snapshots where source_kind = 'PLAID_LEGACY'
);

delete from liquidity_holdings_snapshots where source_kind = 'PLAID_LEGACY';

delete from liquidity_source_accounts a
where (a.origin = 'PLAID_LEGACY' or a.active_source = 'PLAID_LEGACY' or a.legacy_account_id is not null)
  and not exists (
    select 1 from liquidity_holdings_snapshots s
    where s.source_account_id = a.id and s.source_kind = 'CSV'
  );

update liquidity_source_accounts
set origin = 'CSV', active_source = 'CSV', legacy_account_id = null
where origin = 'PLAID_LEGACY' or active_source = 'PLAID_LEGACY' or legacy_account_id is not null;

alter table liquidity_source_accounts drop constraint if exists liquidity_source_accounts_origin_check;
alter table liquidity_source_accounts drop constraint if exists liquidity_source_accounts_active_source_check;
alter table liquidity_source_accounts add constraint liquidity_source_accounts_origin_check check (origin = 'CSV');
alter table liquidity_source_accounts add constraint liquidity_source_accounts_active_source_check check (active_source = 'CSV');
alter table liquidity_source_accounts drop column if exists legacy_account_id;

alter table liquidity_holdings_snapshots drop constraint if exists liquidity_holdings_snapshots_source_kind_check;
alter table liquidity_holdings_snapshots add constraint liquidity_holdings_snapshots_source_kind_check check (source_kind = 'CSV');
alter table liquidity_holdings_snapshots drop column if exists legacy_snapshot_id;

alter table liquidity_source_positions drop column if exists legacy_holding_id;

alter table liquidity_source_valuations drop constraint if exists liquidity_source_valuations_mode_check;
alter table liquidity_source_valuations add constraint liquidity_source_valuations_mode_check check (mode in ('CSV_FALLBACK','MARKET_QUOTE'));

delete from partnership_assets where source_type = 'plaid';
alter table partnership_assets drop column if exists plaid_item_id;
alter table partnership_assets drop column if exists plaid_account_id;

drop table if exists liquidity_valuation_positions cascade;
drop table if exists liquidity_valuation_snapshots cascade;
drop table if exists source_holdings cascade;
drop table if exists holdings_sync_snapshots cascade;
drop table if exists holdings_refresh_attempts cascade;
drop table if exists plaid_refresh_policies cascade;
drop table if exists plaid_investment_accounts cascade;
drop table if exists plaid_connections cascade;

create unique index if not exists liquidity_source_account_identifier_idx
  on liquidity_source_accounts(entity_id,custodian,identifier_fingerprint)
  where identifier_fingerprint is not null;

create trigger liquidity_positions_immutable before update or delete on liquidity_source_positions for each row execute function liquidity_deny_evidence_mutation();
create trigger liquidity_snapshots_immutable before update or delete on liquidity_holdings_snapshots for each row execute function liquidity_snapshot_immutable();
create trigger liquidity_valuations_immutable before update or delete on liquidity_source_valuations for each row execute function liquidity_deny_evidence_mutation();

commit;
