create extension if not exists pgcrypto;

create table if not exists user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role_name text not null check (role_name in ('Admin', 'User')),
  invite_token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_invitations_email_active_uq
  on user_invitations (lower(email))
  where accepted_at is null and revoked_at is null;

create table if not exists user_mfa_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  totp_secret_encrypted text not null,
  enrollment_state text not null check (enrollment_state in ('PENDING', 'ENROLLED', 'RESET_REQUIRED')),
  enrolled_at timestamptz,
  reset_at timestamptz,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_mfa_enrollments_active_uq
  on user_mfa_enrollments (user_id);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  session_token_hash text not null unique,
  issued_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id);

create table if not exists auth_attempts (
  id uuid primary key default gen_random_uuid(),
  user_identifier text not null,
  attempt_type text not null check (attempt_type in ('PASSWORD', 'MFA')),
  attempted_at timestamptz not null default now(),
  success boolean not null,
  source_ip text,
  lockout_until timestamptz
);

create index if not exists auth_attempts_user_type_idx
  on auth_attempts (user_identifier, attempt_type, attempted_at desc);
