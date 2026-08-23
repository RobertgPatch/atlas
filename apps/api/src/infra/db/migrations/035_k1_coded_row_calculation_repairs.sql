-- Promote verified numeric K-1 coded rows into the basis calculator. Earlier
-- application mapping retained these rows only in official_form_data, which
-- made correct Section L amounts appear to disagree with Jackson.

create temporary table k1_coded_row_repair_targets (
  tracker_year_id uuid primary key
) on commit drop;

with official_rows as (
  select
    year.id as tracker_year_id,
    year.partnership_id,
    year.tax_year,
    revision.field_key as official_key,
    upper(regexp_replace(trim(coalesce(entry->>'code', '')), '\*+$', '')) as code,
    case
      when replace(replace(replace(coalesce(entry->>'value', entry->>'amount', ''), ',', ''), '$', ''), ' ', '')
        ~ '^-?[0-9]+(?:\.[0-9]{1,2})?$'
      then replace(replace(replace(coalesce(entry->>'value', entry->>'amount'), ',', ''), '$', ''), ' ', '')::numeric
      else null
    end as amount,
    revision.source_k1_document_id,
    (revision.source_k1_field_value_ids)[1] as source_k1_field_value_id,
    revision.created_by_user_id
  from k1_tracker_years year
  join k1_tracker_official_value_revisions revision
    on revision.tracker_year_id = year.id
   and revision.is_active
   and revision.source_type = 'FINALIZED_K1'
   and revision.field_key in (
     'box_11_entries', 'box_13_entries', 'box_18_entries',
     'box_19_entries', 'box_21_entries'
   )
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(year.official_form_data->revision.field_key) = 'array'
      then year.official_form_data->revision.field_key
      else '[]'::jsonb
    end
  ) entry
), derived as (
  select tracker_year_id, partnership_id, tax_year,
         'box_11_other_income_loss'::text as destination_key,
         sum(amount) as amount, source_k1_document_id,
         min(source_k1_field_value_id::text)::uuid as source_k1_field_value_id,
         created_by_user_id
    from official_rows
   where official_key = 'box_11_entries' and amount is not null
   group by tracker_year_id, partnership_id, tax_year, source_k1_document_id, created_by_user_id
  union all
  select tracker_year_id, partnership_id, tax_year,
         'box_13_other_deductions', sum(abs(amount)), source_k1_document_id,
         min(source_k1_field_value_id::text)::uuid, created_by_user_id
    from official_rows
   where official_key = 'box_13_entries' and amount is not null
   group by tracker_year_id, partnership_id, tax_year, source_k1_document_id, created_by_user_id
  union all
  select tracker_year_id, partnership_id, tax_year,
         'box_18b_tax_exempt_income', sum(abs(amount)), source_k1_document_id,
         min(source_k1_field_value_id::text)::uuid, created_by_user_id
    from official_rows
   where official_key = 'box_18_entries' and code in ('A', 'B') and amount is not null
   group by tracker_year_id, partnership_id, tax_year, source_k1_document_id, created_by_user_id
  union all
  select tracker_year_id, partnership_id, tax_year,
         'box_18c_nondeductible_expenses', sum(abs(amount)), source_k1_document_id,
         min(source_k1_field_value_id::text)::uuid, created_by_user_id
    from official_rows
   where official_key = 'box_18_entries' and code = 'C' and amount is not null
   group by tracker_year_id, partnership_id, tax_year, source_k1_document_id, created_by_user_id
  union all
  select tracker_year_id, partnership_id, tax_year,
         'box_19_distributions', sum(abs(amount)), source_k1_document_id,
         min(source_k1_field_value_id::text)::uuid, created_by_user_id
    from official_rows
   where official_key = 'box_19_entries' and amount is not null
   group by tracker_year_id, partnership_id, tax_year, source_k1_document_id, created_by_user_id
  union all
  select tracker_year_id, partnership_id, tax_year,
         'box_21_foreign_taxes', sum(abs(amount)), source_k1_document_id,
         min(source_k1_field_value_id::text)::uuid, created_by_user_id
    from official_rows
   where official_key = 'box_21_entries' and amount is not null
   group by tracker_year_id, partnership_id, tax_year, source_k1_document_id, created_by_user_id
), inserted as (
  insert into k1_tracker_value_revisions (
    id, tracker_year_id, field_key, amount, original_source_text, source_type,
    source_k1_document_id, source_k1_field_value_id, is_active,
    created_by_user_id
  )
  select
    gen_random_uuid(), derived.tracker_year_id, derived.destination_key,
    derived.amount, 'Derived from verified official K-1 coded rows',
    'FINALIZED_K1', derived.source_k1_document_id,
    derived.source_k1_field_value_id, true, derived.created_by_user_id
  from derived
  where not exists (
    select 1
      from k1_tracker_value_revisions active
     where active.tracker_year_id = derived.tracker_year_id
       and active.field_key = derived.destination_key
       and active.is_active
  )
    and not (
      derived.destination_key = 'box_13_other_deductions'
      and exists (
        select 1
          from k1_tracker_value_revisions split
         where split.tracker_year_id = derived.tracker_year_id
           and split.field_key in ('box_13_other_portfolio_deductions', 'box_13_management_fees')
           and split.is_active
      )
    )
    and not (
      derived.destination_key = 'box_19_distributions'
      and exists (
        select 1
          from capital_activity_events activity
         where activity.partnership_id = derived.partnership_id
           and extract(year from activity.activity_date)::int = derived.tax_year
           and activity.event_type in ('distribution', 'recallable_distribution')
           and activity.settlement_status = 'SETTLED'
      )
    )
  returning tracker_year_id
)
insert into k1_coded_row_repair_targets (tracker_year_id)
select distinct tracker_year_id from inserted
on conflict do nothing;

create temporary table k1_coded_row_repair_affected (
  tracker_year_id uuid primary key
) on commit drop;

insert into k1_coded_row_repair_affected (tracker_year_id)
select distinct affected.id
  from k1_coded_row_repair_targets target
  join k1_tracker_years repaired on repaired.id = target.tracker_year_id
  join k1_tracker_years affected
    on affected.partnership_id = repaired.partnership_id
   and affected.tax_year >= repaired.tax_year
on conflict do nothing;

update k1_tracker_years year
   set revision = year.revision + 1,
       workflow_status = case
         when year.workflow_status = 'RECONCILED' then 'NEEDS_REVIEW'
         else year.workflow_status
       end,
       calculated_at = null,
       updated_at = now()
 where year.id in (select tracker_year_id from k1_coded_row_repair_affected);

insert into k1_tracker_signoffs (
  id, tracker_year_id, year_revision, signoff_type, signed_by_user_id, reason
)
select gen_random_uuid(), year.id, year.revision, 'INVALIDATED', null,
       'Verified K-1 coded rows were added to basis calculations'
  from k1_tracker_years year
  join k1_coded_row_repair_affected affected on affected.tracker_year_id = year.id
 where not exists (
   select 1 from k1_tracker_signoffs signoff
    where signoff.tracker_year_id = year.id
      and signoff.year_revision = year.revision
      and signoff.signoff_type = 'INVALIDATED'
      and signoff.reason = 'Verified K-1 coded rows were added to basis calculations'
 );
