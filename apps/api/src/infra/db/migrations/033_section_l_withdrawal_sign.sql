-- Section L reports withdrawals and distributions as signed capital-account
-- decreases. Convert values saved under the former positive-magnitude
-- convention before enforcing the canonical sign for future revisions.
update k1_tracker_value_revisions
set amount = -amount
where field_key = 'section_l_withdrawals_distributions'
  and amount > 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'k1_tracker_section_l_withdrawal_sign_chk'
  ) then
    alter table k1_tracker_value_revisions
      add constraint k1_tracker_section_l_withdrawal_sign_chk
      check (
        field_key <> 'section_l_withdrawals_distributions'
        or amount is null
        or amount <= 0
      );
  end if;
end $$;
