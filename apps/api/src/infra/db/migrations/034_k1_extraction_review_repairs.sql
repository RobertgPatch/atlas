-- Repair extraction-review data created before coded rows were linked to their
-- field occurrences, blank statement rows were recognized as valid, and
-- accounting parentheses after a dollar sign retained their negative sign.

-- Backfill the direct field link so existing review warnings can focus the
-- exact editable row instead of showing an unscoped generic message.
update k1_issues issue
set k1_field_value_id = field.id
from k1_field_values field
where issue.k1_field_value_id is null
  and issue.extraction_attempt_id = field.extraction_attempt_id
  and issue.occurrence_id = field.occurrence_id;

-- A coded K-1 row can legitimately have a code/description and no numeric
-- amount (for example, "STMT"). Resolve only the old, exact validation error
-- when the persisted row confirms that the extracted amount was blank.
update k1_issues issue
set status = 'RESOLVED',
    resolved_at = coalesce(issue.resolved_at, now())
from k1_field_values field
where issue.status = 'OPEN'
  and issue.issue_code = 'INVALID_EXTRACTED_VALUE'
  and issue.message = 'The coded-row amount is not valid money.'
  and issue.extraction_attempt_id = field.extraction_attempt_id
  and issue.occurrence_id = field.occurrence_id
  and field.value_kind = 'CODE_ROW'
  and field.normalized_value_json @> '{"amount": null}'::jsonb
  and (
    (
      jsonb_typeof(field.raw_value_json) = 'object'
      and coalesce(field.raw_value_json->>'amount', field.raw_value_json->>'value', '') = ''
    )
    or (
      jsonb_typeof(field.raw_value_json) = 'string'
      and (field.raw_value_json #>> '{}') ~* 'amount\s*:\s*}'
    )
  );

-- BDA sometimes prints Section L as "$ ( 190,773)". Earlier normalization
-- missed the sign because the opening parenthesis did not start the string.
-- Reviewer corrections remain authoritative and are intentionally untouched.
update k1_field_values
set normalized_value = '-' || normalized_value,
    normalized_value_json = to_jsonb('-' || normalized_value)
where canonical_path = 'calculation.section_l_withdrawals_distributions'
  and reviewer_corrected_value_json is null
  and normalized_value ~ '^\+?[0-9]+(?:\.[0-9]+)?$'
  and normalized_value::numeric > 0
  and raw_value like '%(%'
  and raw_value like '%)%';
