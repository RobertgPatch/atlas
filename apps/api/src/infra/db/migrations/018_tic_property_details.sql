begin;

alter table if exists tic_properties
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists property_code text,
  add column if not exists number_of_units integer,
  add column if not exists acquisition_price_usd numeric(18,2);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'tic_properties'
      and column_name = 'estimated_value_usd'
  ) then
    update tic_properties
    set acquisition_price_usd = estimated_value_usd
    where acquisition_price_usd is null
      and estimated_value_usd is not null;
  end if;
end $$;

alter table if exists tic_properties
  drop constraint if exists tic_properties_number_of_units_check,
  add constraint tic_properties_number_of_units_check
    check (number_of_units is null or number_of_units >= 0);

alter table if exists tic_properties
  drop constraint if exists tic_properties_acquisition_price_usd_check,
  add constraint tic_properties_acquisition_price_usd_check
    check (acquisition_price_usd is null or acquisition_price_usd >= 0);

create index if not exists tic_properties_code_idx
  on tic_properties (lower(property_code));

commit;
