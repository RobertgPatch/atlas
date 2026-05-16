alter table source_holdings
  add column if not exists sector text,
  add column if not exists industry text;
