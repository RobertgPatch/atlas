begin;

drop index if exists market_price_observations_latest_idx;

create index market_price_observations_latest_idx
  on market_price_observations (
    provider,
    upper(symbol),
    provider_timestamp desc,
    received_at desc
  );

commit;
