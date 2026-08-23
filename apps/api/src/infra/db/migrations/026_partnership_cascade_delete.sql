begin;

-- A partnership is the ownership boundary for all of these records. Keep the
-- database rule aligned with the product deletion workflow so a partial child
-- tree cannot survive a direct partnership delete.
alter table k1_documents
  drop constraint if exists k1_documents_partnership_id_fkey,
  add constraint k1_documents_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table k1_reported_distributions
  drop constraint if exists k1_reported_distributions_partnership_id_fkey,
  add constraint k1_reported_distributions_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table partnership_fmv_snapshots
  drop constraint if exists partnership_fmv_snapshots_partnership_id_fkey,
  add constraint partnership_fmv_snapshots_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table partnership_commitments
  drop constraint if exists partnership_commitments_partnership_id_fkey,
  add constraint partnership_commitments_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table capital_activity_events
  drop constraint if exists capital_activity_events_partnership_id_fkey,
  add constraint capital_activity_events_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table partnership_annual_activity
  drop constraint if exists partnership_annual_activity_partnership_id_fkey,
  add constraint partnership_annual_activity_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table document_versions
  drop constraint if exists document_versions_partnership_id_fkey,
  add constraint document_versions_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table k1_tracker_years
  drop constraint if exists k1_tracker_years_partnership_id_fkey,
  add constraint k1_tracker_years_partnership_id_fkey
    foreign key (partnership_id) references partnerships(id) on delete cascade;

alter table k1_tracker_import_batches
  drop constraint if exists k1_tracker_import_batches_target_partnership_id_fkey,
  add constraint k1_tracker_import_batches_target_partnership_id_fkey
    foreign key (target_partnership_id) references partnerships(id) on delete cascade;

-- K-1 document children must also cascade or they would block the partnership
-- cascade at the next level of the tree.
alter table k1_field_values
  drop constraint if exists k1_field_values_k1_document_id_fkey,
  add constraint k1_field_values_k1_document_id_fkey
    foreign key (k1_document_id) references k1_documents(id) on delete cascade;

alter table k1_issues
  drop constraint if exists k1_issues_k1_document_id_fkey,
  add constraint k1_issues_k1_document_id_fkey
    foreign key (k1_document_id) references k1_documents(id) on delete cascade;

alter table k1_reported_distributions
  drop constraint if exists k1_reported_distributions_k1_document_id_fkey,
  add constraint k1_reported_distributions_k1_document_id_fkey
    foreign key (k1_document_id) references k1_documents(id) on delete cascade;

commit;
