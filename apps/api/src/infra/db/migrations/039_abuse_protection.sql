create table abuse_rate_windows (
  policy_key text not null,
  scope_kind text not null,
  scope_hash bytea not null,
  window_started_at timestamptz not null,
  window_seconds integer not null,
  consumed_units bigint not null default 0,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (
    policy_key,
    scope_kind,
    scope_hash,
    window_started_at,
    window_seconds
  ),
  check (length(policy_key) between 1 and 128),
  check (scope_kind in ('account', 'user', 'session', 'tenant', 'operation', 'global')),
  check (octet_length(scope_hash) = 32),
  check (window_seconds > 0),
  check (consumed_units >= 0),
  check (expires_at > window_started_at)
);

create index if not exists auth_attempts_cleanup_idx
  on auth_attempts (attempted_at, id);

create index abuse_rate_windows_cleanup_idx
  on abuse_rate_windows (expires_at, policy_key, scope_kind, scope_hash);

create table workload_quota_counters (
  workload_key text not null,
  scope_kind text not null,
  scope_hash bytea not null,
  period_kind text not null,
  period_started_at timestamptz not null,
  reserved_units bigint not null default 0,
  completed_units bigint not null default 0,
  failed_units bigint not null default 0,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (
    workload_key,
    scope_kind,
    scope_hash,
    period_kind,
    period_started_at
  ),
  check (length(workload_key) between 1 and 128),
  check (scope_kind in ('user', 'entity', 'account', 'provider', 'global')),
  check (octet_length(scope_hash) = 32),
  check (period_kind in ('rolling_hour', 'utc_day', 'billing_month')),
  check (reserved_units >= 0),
  check (completed_units >= 0),
  check (failed_units >= 0),
  check (expires_at > period_started_at)
);

create index workload_quota_counters_cleanup_idx
  on workload_quota_counters (expires_at, workload_key, scope_kind, scope_hash);

create table idempotent_operations (
  operation_id uuid primary key default gen_random_uuid(),
  workload_key text not null,
  principal_hash bytea not null,
  request_fingerprint bytea not null,
  client_key_hash bytea,
  state text not null default 'reserved',
  reserved_units jsonb not null default '{}'::jsonb,
  provider_token text,
  provider_reference text,
  result_reference text,
  request_id text not null,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (workload_key, principal_hash, request_fingerprint),
  check (length(workload_key) between 1 and 128),
  check (octet_length(principal_hash) = 32),
  check (octet_length(request_fingerprint) = 32),
  check (client_key_hash is null or octet_length(client_key_hash) = 32),
  check (state in ('reserved', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
  check (jsonb_typeof(reserved_units) = 'object'),
  check (pg_column_size(reserved_units) <= 4096),
  check (provider_token is null or length(provider_token) between 1 and 512),
  check (provider_reference is null or length(provider_reference) between 1 and 512),
  check (result_reference is null or length(result_reference) between 1 and 512),
  check (length(request_id) between 1 and 128),
  check (failure_code is null or length(failure_code) between 1 and 128),
  check (expires_at > created_at)
);

create unique index idempotent_operations_client_key_idx
  on idempotent_operations (workload_key, principal_hash, client_key_hash)
  where client_key_hash is not null;

create index idempotent_operations_cleanup_idx
  on idempotent_operations (expires_at, state, operation_id);

create index idempotent_operations_state_idx
  on idempotent_operations (workload_key, state, updated_at, operation_id);

create table workload_leases (
  lease_id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references idempotent_operations(operation_id) on delete cascade,
  workload_key text not null,
  scope_kind text not null,
  scope_hash bytea not null,
  fencing_token bigint generated always as identity unique,
  state text not null default 'active',
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  check (length(workload_key) between 1 and 128),
  check (scope_kind in ('user', 'entity', 'provider', 'global')),
  check (octet_length(scope_hash) = 32),
  check (state in ('active', 'released', 'expired')),
  check (heartbeat_at >= acquired_at),
  check (expires_at > acquired_at),
  check (
    (state = 'active' and released_at is null)
    or (state in ('released', 'expired') and released_at is not null)
  ),
  check (released_at is null or released_at >= acquired_at)
);

create index workload_leases_active_idx
  on workload_leases (workload_key, scope_kind, scope_hash, expires_at)
  where state = 'active';

create index workload_leases_cleanup_idx
  on workload_leases (expires_at, state, lease_id);

create index workload_leases_released_cleanup_idx
  on workload_leases (released_at, lease_id)
  where released_at is not null;

create table protection_overrides (
  override_id uuid primary key default gen_random_uuid(),
  control_key text not null,
  scope_kind text not null,
  scope_hash bytea,
  mode text not null,
  value jsonb not null default '{}'::jsonb,
  reason text not null,
  ticket_reference text,
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id),
  check (length(control_key) between 1 and 128),
  check (scope_kind in ('environment', 'workload', 'tenant', 'user')),
  check (
    (scope_kind = 'environment' and scope_hash is null)
    or (
      scope_kind <> 'environment'
      and scope_hash is not null
      and octet_length(scope_hash) = 32
    )
  ),
  check (mode in ('disable', 'lower_limit', 'temporary_allow')),
  check (jsonb_typeof(value) = 'object'),
  check (pg_column_size(value) <= 4096),
  check (length(trim(reason)) between 1 and 1000),
  check (ticket_reference is null or length(ticket_reference) between 1 and 256),
  check (expires_at is null or expires_at > created_at),
  check (mode <> 'temporary_allow' or expires_at is not null),
  check (revoked_at is null or revoked_at >= created_at),
  check (
    (revoked_at is null and revoked_by_user_id is null)
    or (revoked_at is not null and revoked_by_user_id is not null)
  )
);

create index protection_overrides_effective_idx
  on protection_overrides (
    control_key,
    scope_kind,
    scope_hash,
    created_at desc,
    override_id
  )
  where revoked_at is null;

create index protection_overrides_expiry_cleanup_idx
  on protection_overrides (expires_at, override_id)
  where expires_at is not null;

create index protection_overrides_revoked_cleanup_idx
  on protection_overrides (revoked_at, override_id)
  where revoked_at is not null;
