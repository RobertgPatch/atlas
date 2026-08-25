begin;

alter table k1_tracker_years
  add column if not exists is_inception_year boolean not null default false;

create unique index if not exists k1_tracker_one_inception_year_idx
  on k1_tracker_years (partnership_id)
  where is_inception_year;

alter table k1_tracker_value_revisions
  drop constraint if exists k1_tracker_value_revisions_source_type_check;

alter table k1_tracker_value_revisions
  add constraint k1_tracker_value_revisions_source_type_check
  check (source_type in (
    'FINALIZED_K1',
    'WORKBOOK_IMPORT',
    'MANUAL_ENTRY',
    'MANUAL_OVERRIDE',
    'CARRYFORWARD',
    'SYSTEM_DEFAULT'
  ));

commit;
