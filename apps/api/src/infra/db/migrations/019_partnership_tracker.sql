-- Feature 016: consolidate partnership identity, manual K-1, commitment, and NAV work.
-- Compatibility policy: legacy imported/source revisions remain in place and readable.
begin;

alter table k1_tracker_years
  drop constraint if exists k1_tracker_years_workflow_status_check;

alter table k1_tracker_years
  add constraint k1_tracker_years_workflow_status_check
  check (workflow_status in ('NOT_STARTED', 'IN_PROGRESS', 'IMPORTED', 'NEEDS_REVIEW', 'RECONCILED'));

create index if not exists partnership_commitments_effective_date_idx
  on partnership_commitments (
    partnership_id,
    commitment_date desc nulls last,
    created_at desc,
    id desc
  );

create index if not exists partnership_fmv_snapshots_valuation_date_idx
  on partnership_fmv_snapshots (partnership_id, valuation_date desc, created_at desc, id desc);

-- Existing legacy imports may contain negative observations. NOT VALID preserves
-- those rows while enforcing the v1 rule for every new or corrected row.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partnership_commitments_amount_nonnegative_chk') then
    alter table partnership_commitments
      add constraint partnership_commitments_amount_nonnegative_chk
      check (commitment_amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partnership_fmv_snapshots_amount_nonnegative_chk') then
    alter table partnership_fmv_snapshots
      add constraint partnership_fmv_snapshots_amount_nonnegative_chk
      check (fmv_amount >= 0) not valid;
  end if;
end $$;

-- Exact-date uniqueness for new manual NAV writes is serialized with a
-- partnership-scoped advisory transaction lock. A database unique index would
-- reject valid legacy append-only snapshots that already share a date.

commit;
