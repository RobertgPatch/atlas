begin;

alter table partnerships
  add column if not exists inception_date date,
  add column if not exists management_fee_rate numeric(9,8);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'partnerships_management_fee_rate_range_chk'
  ) then
    alter table partnerships
      add constraint partnerships_management_fee_rate_range_chk
      check (management_fee_rate is null or management_fee_rate between 0 and 1);
  end if;
end $$;

commit;
