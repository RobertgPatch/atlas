begin;

alter table liquidity_valuation_snapshots
  add column if not exists valuation_kind text not null default 'market_close';

alter table liquidity_valuation_snapshots
  drop constraint if exists liquidity_valuation_snapshots_valuation_kind_check;

alter table liquidity_valuation_snapshots
  add constraint liquidity_valuation_snapshots_valuation_kind_check
  check (valuation_kind in ('market_close', 'daily'));

alter table liquidity_valuation_positions
  drop constraint if exists liquidity_valuation_positions_valuation_source_check;

alter table liquidity_valuation_positions
  add constraint liquidity_valuation_positions_valuation_source_check
  check (valuation_source in ('official_close', 'market_price', 'custodian_fallback'));

commit;
