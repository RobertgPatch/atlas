begin;

drop index if exists tic_properties_entity_name_idx;
drop index if exists tic_properties_entity_status_idx;

alter table if exists tic_properties
  drop column if exists entity_id;

create index if not exists tic_properties_name_idx
  on tic_properties (lower(name));

create index if not exists tic_properties_status_idx
  on tic_properties (status);

commit;
