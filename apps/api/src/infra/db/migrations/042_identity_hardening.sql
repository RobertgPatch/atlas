alter table users
  add column if not exists display_name text,
  add column if not exists password_change_required boolean not null default false,
  add column if not exists password_changed_at timestamptz,
  add column if not exists bootstrap_password_reset_pending boolean not null default false;

update users
set display_name = case
  when lower(email) in ('admin@atlas.com', 'admin@jackson.com', 'tpatch@jspllc.com') then 'Tony Patch'
  else initcap(replace(split_part(email, '@', 1), '.', ' '))
end
where display_name is null or btrim(display_name) = '';

do $$
declare
  canonical_tony_id uuid;
  legacy_tony_id uuid;
begin
  select id into canonical_tony_id
  from users
  where lower(email) = 'tpatch@jspllc.com'
  order by created_at
  limit 1;

  select id into legacy_tony_id
  from users
  where lower(email) in ('admin@atlas.com', 'admin@jackson.com')
  order by created_at
  limit 1;

  if canonical_tony_id is null and legacy_tony_id is not null then
    update users
    set email = 'tpatch@jspllc.com',
        display_name = 'Tony Patch',
        password_change_required = true,
        bootstrap_password_reset_pending = true,
        updated_at = now()
    where id = legacy_tony_id;
  elsif canonical_tony_id is not null then
    update users
    set display_name = 'Tony Patch',
        password_change_required = true,
        updated_at = now()
    where id = canonical_tony_id;
  end if;
end $$;

alter table users
  alter column display_name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_display_name_nonempty'
  ) then
    alter table users
      add constraint users_display_name_nonempty
      check (length(btrim(display_name)) between 1 and 120);
  end if;
end $$;

insert into roles (id, name)
values (gen_random_uuid(), 'SuperAdmin')
on conflict (name) do nothing;

create index if not exists audit_events_created_at_desc_idx
  on audit_events(created_at desc, id desc);
