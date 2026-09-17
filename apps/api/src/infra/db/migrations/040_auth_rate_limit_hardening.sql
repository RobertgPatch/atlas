-- Feature 030 expand/compatibility migration. Legacy authentication columns
-- remain available for rollback; new writes use keyed subject fingerprints.

alter table abuse_rate_windows
  drop constraint if exists abuse_rate_windows_scope_kind_check;

alter table abuse_rate_windows
  add constraint abuse_rate_windows_scope_kind_check
  check (scope_kind in (
    'account',
    'user',
    'session',
    'tenant',
    'operation',
    'global',
    'source_prefix'
  ));

alter table auth_attempts
  alter column user_identifier drop not null,
  add column if not exists legacy_user_identifier text,
  add column if not exists legacy_source_ip text,
  add column if not exists subject_hash bytea,
  add column if not exists subject_key_version text,
  add column if not exists user_id uuid references users(id) on delete set null,
  add column if not exists outcome_class text,
  add column if not exists cooldown_until timestamptz;

update auth_attempts
   set legacy_user_identifier = coalesce(legacy_user_identifier, user_identifier),
       legacy_source_ip = coalesce(legacy_source_ip, source_ip)
 where (legacy_user_identifier is null and user_identifier is not null)
    or (legacy_source_ip is null and source_ip is not null);

alter table auth_attempts
  drop constraint if exists auth_attempts_fingerprint_consistency;

alter table auth_attempts
  add constraint auth_attempts_fingerprint_consistency
  check (
    (subject_hash is null and subject_key_version is null)
    or (
      subject_hash is not null
      and octet_length(subject_hash) = 32
      and subject_key_version is not null
      and length(subject_key_version) between 1 and 64
    )
  );

alter table auth_attempts
  drop constraint if exists auth_attempts_outcome_class_check;

alter table auth_attempts
  add constraint auth_attempts_outcome_class_check
  check (
    outcome_class is null
    or outcome_class in (
      'success',
      'credential_failure',
      'throttled',
      'temporary_lockout',
      'recovered'
    )
  );

create index if not exists auth_attempts_subject_type_idx
  on auth_attempts (subject_hash, subject_key_version, attempt_type, attempted_at desc)
  where subject_hash is not null;

create index if not exists auth_attempts_user_id_type_idx
  on auth_attempts (user_id, attempt_type, attempted_at desc)
  where user_id is not null;

create index if not exists auth_attempts_legacy_cleanup_idx
  on auth_attempts (attempted_at, id)
  where legacy_user_identifier is not null or legacy_source_ip is not null;
