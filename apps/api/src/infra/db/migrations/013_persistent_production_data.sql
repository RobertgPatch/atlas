alter table users
  add column if not exists status text,
  add column if not exists last_login_at timestamptz,
  add column if not exists login_count integer not null default 0;

update users
set status = case when is_active then 'Active' else 'Inactive' end
where status is null;

alter table users
  alter column status set default 'Active',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_status_check'
  ) then
    alter table users
      add constraint users_status_check
      check (status in ('Invited', 'Active', 'Inactive'));
  end if;
end $$;

insert into roles (id, name)
values (gen_random_uuid(), 'Admin'), (gen_random_uuid(), 'User')
on conflict (name) do nothing;

create index if not exists auth_sessions_token_hash_idx
  on auth_sessions(session_token_hash);

create index if not exists plaid_investment_accounts_plaid_account_id_idx
  on plaid_investment_accounts(plaid_account_id);
