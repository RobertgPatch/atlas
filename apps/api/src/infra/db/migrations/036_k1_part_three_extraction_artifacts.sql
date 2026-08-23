-- Repair form-template rows and cross-line value bleed produced by an older
-- BDA blueprint. Raw provider evidence remains immutable; only the normalized
-- review representation and artifact review status are changed.

create temporary table k1_line17_template_repairs (
  extraction_attempt_id uuid primary key,
  keep_field_id uuid not null
) on commit drop;

insert into k1_line17_template_repairs (extraction_attempt_id, keep_field_id)
select
  field.extraction_attempt_id,
  (array_agg(field.id order by field.occurrence_index, field.id))[1]
from k1_field_values field
join k1_documents document
  on document.id = field.k1_document_id
 and document.active_extraction_attempt_id = field.extraction_attempt_id
where field.canonical_path = 'official.box_17_entries'
  and field.reviewer_corrected_value_json is null
  and field.source_locations = '[]'::jsonb
  and field.normalized_value_json->>'code' in ('A', 'B', 'C', 'D', 'E', 'F')
  and field.normalized_value_json->>'amount' is null
  and trim(regexp_replace(
    lower(coalesce(field.normalized_value_json->>'description', '')),
    '[^a-z0-9]+', ' ', 'g'
  )) = case field.normalized_value_json->>'code'
    when 'A' then 'post 1986 depreciation adjustment'
    when 'B' then 'adjusted gain or loss'
    when 'C' then 'depletion other than oil gas'
    when 'D' then 'oil gas geothermal gross income'
    when 'E' then 'oil gas geothermal deductions'
    when 'F' then 'other amt items'
  end
group by field.extraction_attempt_id
having count(*) = 6
   and count(distinct field.normalized_value_json->>'code') = 6
   and count(*) = (
     select count(*)
     from k1_field_values all_line17
     where all_line17.extraction_attempt_id = field.extraction_attempt_id
       and all_line17.canonical_path = 'official.box_17_entries'
       and all_line17.review_status <> 'REJECTED'
   );

update k1_field_values field
set normalized_value = '{"code":"","description":"Alternative Minimum Tax (AMT)","amount":null}',
    normalized_value_json = '{"code":"","description":"Alternative Minimum Tax (AMT)","amount":null}'::jsonb,
    updated_at = now()
from k1_line17_template_repairs repair
where field.id = repair.keep_field_id;

update k1_field_values field
set review_status = 'REJECTED',
    updated_at = now()
from k1_line17_template_repairs repair
where field.extraction_attempt_id = repair.extraction_attempt_id
  and field.canonical_path = 'official.box_17_entries'
  and field.id <> repair.keep_field_id;

-- When a real coded Line 19 row is present, its generic calculation twin is a
-- display/application duplicate rather than an additional printed form line.
update k1_field_values calculation
set review_status = 'REJECTED',
    updated_at = now()
from k1_documents document
where document.id = calculation.k1_document_id
  and document.active_extraction_attempt_id = calculation.extraction_attempt_id
  and calculation.canonical_path = 'calculation.box_19_distributions'
  and calculation.reviewer_corrected_value_json is null
  and calculation.review_status <> 'REJECTED'
  and exists (
    select 1
    from k1_field_values official
    where official.extraction_attempt_id = calculation.extraction_attempt_id
      and official.canonical_path = 'official.box_19_entries'
      and official.review_status <> 'REJECTED'
      and coalesce(official.normalized_value_json->>'code', '') <> ''
      and official.normalized_value_json->>'amount' = calculation.normalized_value_json #>> '{}'
  );

create temporary table k1_line20_bleed_repairs (
  extraction_attempt_id uuid primary key,
  borrowed_field_id uuid not null,
  uncoded_field_id uuid not null
) on commit drop;

with candidates as (
  select
    borrowed.extraction_attempt_id,
    borrowed.id as borrowed_field_id,
    uncoded.id as uncoded_field_id
  from k1_documents document
  join k1_field_values borrowed
    on borrowed.k1_document_id = document.id
   and borrowed.extraction_attempt_id = document.active_extraction_attempt_id
   and borrowed.canonical_path = 'official.box_20_entries'
   and borrowed.review_status <> 'REJECTED'
   and borrowed.reviewer_corrected_value_json is null
   and borrowed.normalized_value_json->>'code' = 'A'
   and borrowed.normalized_value_json->>'amount' is not null
   and lower(coalesce(borrowed.normalized_value_json->>'description', ''))
       ~ '(distribution|cash.*marketable)'
  join k1_field_values uncoded
    on uncoded.extraction_attempt_id = borrowed.extraction_attempt_id
   and uncoded.canonical_path = 'official.box_20_entries'
   and uncoded.review_status <> 'REJECTED'
   and uncoded.reviewer_corrected_value_json is null
   and coalesce(uncoded.normalized_value_json->>'code', '') = ''
   and uncoded.normalized_value_json->>'amount' is not null
   and trim(regexp_replace(
     lower(coalesce(uncoded.normalized_value_json->>'description', '')),
     '[^a-z0-9]+', ' ', 'g'
   )) = 'other information'
  where exists (
    select 1
    from k1_field_values line19
    where line19.extraction_attempt_id = borrowed.extraction_attempt_id
      and line19.canonical_path = 'official.box_19_entries'
      and line19.review_status <> 'REJECTED'
      and line19.normalized_value_json->>'amount' = borrowed.normalized_value_json->>'amount'
  )
), unambiguous as (
  select
    extraction_attempt_id,
    min(borrowed_field_id::text)::uuid as borrowed_field_id,
    min(uncoded_field_id::text)::uuid as uncoded_field_id
  from candidates
  group by extraction_attempt_id
  having count(distinct borrowed_field_id) = 1
     and count(distinct uncoded_field_id) = 1
)
insert into k1_line20_bleed_repairs (
  extraction_attempt_id, borrowed_field_id, uncoded_field_id
)
select extraction_attempt_id, borrowed_field_id, uncoded_field_id
from unambiguous;

update k1_field_values field
set review_status = 'REJECTED',
    updated_at = now()
from k1_line20_bleed_repairs repair
where field.id = repair.borrowed_field_id;

update k1_field_values field
set normalized_value_json = jsonb_set(field.normalized_value_json, '{code}', '"A"'::jsonb),
    normalized_value = jsonb_set(field.normalized_value_json, '{code}', '"A"'::jsonb)::text,
    updated_at = now()
from k1_line20_bleed_repairs repair
where field.id = repair.uncoded_field_id;

-- Artifact rows are not reviewer tasks. Resolve only issues directly linked to
-- a row that this migration rejected.
update k1_issues issue
set status = 'RESOLVED',
    resolved_at = coalesce(issue.resolved_at, now()),
    updated_at = now()
from k1_field_values field
where field.review_status = 'REJECTED'
  and issue.status = 'OPEN'
  and (
    issue.k1_field_value_id = field.id
    or (
      issue.extraction_attempt_id = field.extraction_attempt_id
      and issue.occurrence_id = field.occurrence_id
    )
  );
