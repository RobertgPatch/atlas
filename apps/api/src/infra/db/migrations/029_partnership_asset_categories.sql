begin;

alter table partnership_assets
  add column if not exists asset_category text not null default 'other',
  add column if not exists display_detail text;

update partnership_assets
set asset_category = case
  when lower(asset_type) in ('real estate', 'real_estate') then 'real_estate'
  when lower(asset_type) in ('marketable securities', 'marketable_securities', 'public equity', 'public equities') then 'marketable_securities'
  when lower(asset_type) in ('private equity', 'hedge fund', 'venture capital', 'credit', 'infrastructure', 'alternatives') then 'alternatives'
  when lower(asset_type) in ('cash', 'cash equivalents', 'cash & equivalents', 'cash_equivalents') then 'cash_equivalents'
  else 'other'
end
where asset_category = 'other';

do $$
begin
  alter table partnership_assets
    add constraint partnership_assets_category_check
    check (asset_category in ('real_estate', 'marketable_securities', 'alternatives', 'cash_equivalents', 'other'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table partnership_assets
    add constraint partnership_assets_status_check
    check (status in ('ACTIVE', 'INACTIVE'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists partnership_assets_category_idx
  on partnership_assets (partnership_id, asset_category, created_at desc);

commit;
