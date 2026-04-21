# Phase 1 Data Model: Auth and Access

## Overview

This feature reuses baseline entities from `docs/schema/21-postgres-ddl.sql` and adds feature-specific entities to satisfy FR-001..FR-030.

## Reused Baseline Entities

### User (`users`)
- Fields: `id`, `email`, `password_hash`, `mfa_enabled`, `is_active`, `created_at`, `updated_at`
- Validation:
  - `email` unique, normalized lowercase
  - `password_hash` required for active accounts
  - `is_active=false` blocks authentication
- Relationships:
  - one-to-many with `user_roles`
  - one-to-many with `audit_events` as actor

### Role (`roles`) + UserRole (`user_roles`)
- Role values in V1: `Admin`, `User`
- Validation:
  - one active primary role per user for V1 policy enforcement
- Relationships:
  - many-to-many user/role via `user_roles`

### AuditEvent (`audit_events`)
- Required events (minimum):
  - `auth.login.succeeded`
  - `auth.login.failed`
  - `auth.mfa.verify.succeeded`
  - `auth.mfa.verify.failed`
  - `user.invited`
  - `user.role_changed`
  - `user.deactivated`
  - `user.reactivated`
  - `user.mfa_reset`
- Validation:
  - `event_name`, `object_type`, `created_at` required
  - `before_json`/`after_json` required for mutation events where applicable

## New Entities (to add)

### Invitation (`user_invitations`)
- Purpose: invite new users with assigned initial role
- Fields:
  - `id` (uuid)
  - `email` (text)
  - `role_name` (text; enum Admin|User)
  - `invite_token_hash` (text)
  - `expires_at` (timestamptz)
  - `accepted_at` (timestamptz nullable)
  - `revoked_at` (timestamptz nullable)
  - `created_by` (uuid -> users.id)
  - `created_at`, `updated_at`
- Validation:
  - cannot accept if expired/revoked/already accepted
  - email normalized and unique among active unaccepted invites

### MfaEnrollment (`user_mfa_enrollments`)
- Purpose: track current TOTP secret lifecycle per user
- Fields:
  - `id` (uuid)
  - `user_id` (uuid -> users.id)
  - `totp_secret_encrypted` (text)
  - `enrollment_state` (enum: `PENDING`, `ENROLLED`, `RESET_REQUIRED`)
  - `enrolled_at` (timestamptz nullable)
  - `reset_at` (timestamptz nullable)
  - `updated_by` (uuid -> users.id nullable)
  - `created_at`, `updated_at`
- Validation:
  - at most one active enrollment record per user
  - must verify TOTP code before transition `PENDING -> ENROLLED`

### AuthSession (`auth_sessions`)
- Purpose: enforce 15-minute idle / 8-hour absolute session windows and revocation
- Fields:
  - `id` (uuid)
  - `user_id` (uuid -> users.id)
  - `session_token_hash` (text)
  - `issued_at` (timestamptz)
  - `last_activity_at` (timestamptz)
  - `expires_at` (timestamptz; absolute <= issued_at + 8h)
  - `revoked_at` (timestamptz nullable)
  - `revoke_reason` (text nullable)
  - `created_at`
- Validation:
  - session valid iff `revoked_at is null`, `now < expires_at`, and `now - last_activity_at <= 15m`
  - invalidate all sessions on FR-010 triggers

### AuthAttempt (`auth_attempts`)
- Purpose: support lockout policy for FR-005
- Fields:
  - `id` (uuid)
  - `user_identifier` (text; normalized email or account key)
  - `attempt_type` (enum: `PASSWORD`, `MFA`)
  - `attempted_at` (timestamptz)
  - `success` (boolean)
  - `source_ip` (inet/text)
  - `lockout_until` (timestamptz nullable)
- Validation:
  - lockout set after 3 consecutive failures per attempt type and user identifier
  - successful attempt clears consecutive failure counter for that step

## State Transitions

### Authentication Flow State
- `UNAUTHENTICATED -> PASSWORD_VERIFIED_PENDING_MFA -> AUTHENTICATED`
- Invalid password keeps `UNAUTHENTICATED`
- Invalid MFA keeps `PASSWORD_VERIFIED_PENDING_MFA` (with retry until lockout)

### User Lifecycle State
- `INVITED -> ACTIVE -> INACTIVE`
- `ACTIVE -> ACTIVE` (role changed; sessions revoked)
- `ACTIVE -> ACTIVE` (MFA reset; sessions revoked, enrollment state reset)

### MFA Enrollment State
- `PENDING -> ENROLLED` (upon valid TOTP verification)
- `ENROLLED -> RESET_REQUIRED` (admin reset)
- `RESET_REQUIRED -> ENROLLED` (user re-enrollment)

## Derived/Computed Rules
- Effective role determined from active `user_roles` entry.
- Permission checks use effective role + route/action policy.
- Session validity requires both absolute and idle windows.
- Any admin mutation completion requires corresponding `audit_events` write success.
