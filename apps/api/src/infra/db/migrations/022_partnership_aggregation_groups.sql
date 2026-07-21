begin;

alter table partnerships
  add column if not exists aggregation_group_id uuid;

with grouped_partnerships as (
  select
    id,
    first_value(id) over (
      partition by regexp_replace(lower(trim(name)), '\s+', ' ', 'g'), coalesce(asset_class, 'Other')
      order by created_at, id
    ) as aggregation_group_id
  from partnerships
)
update partnerships p
set aggregation_group_id = grouped_partnerships.aggregation_group_id
from grouped_partnerships
where p.id = grouped_partnerships.id
  and p.aggregation_group_id is null;

alter table partnerships
  alter column aggregation_group_id set default gen_random_uuid(),
  alter column aggregation_group_id set not null;

create index if not exists partnerships_aggregation_group_idx
  on partnerships (aggregation_group_id);

commit;
