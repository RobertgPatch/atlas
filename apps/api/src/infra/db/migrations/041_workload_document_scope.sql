-- Feature 030: distinguish authorized documents from entity subjects so a
-- per-document ceiling cannot accidentally share or reset an entity quota.

alter table workload_quota_counters
  drop constraint if exists workload_quota_counters_scope_kind_check;

alter table workload_quota_counters
  add constraint workload_quota_counters_scope_kind_check
  check (scope_kind in (
    'user',
    'entity',
    'document',
    'account',
    'provider',
    'global'
  ));
