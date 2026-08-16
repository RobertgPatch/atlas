create table if not exists market_price_observations (
  id uuid primary key,
  provider text not null,
  symbol text not null,
  price numeric(24, 8) not null check (price >= 0),
  currency_code text not null default 'USD',
  price_type text not null check (price_type in ('midpoint', 'last_trade', 'official_close')),
  market_session text not null check (market_session in ('regular', 'premarket', 'after_hours', 'closed', 'unknown')),
  provider_timestamp timestamptz not null,
  received_at timestamptz not null default now(),
  trading_date date not null,
  is_delayed boolean not null default false,
  feed text,
  unique (provider, symbol, price_type, provider_timestamp)
);

create index if not exists market_price_observations_latest_idx
  on market_price_observations (provider, upper(symbol), received_at desc, provider_timestamp desc);
