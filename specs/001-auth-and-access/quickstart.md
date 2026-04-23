# Quickstart: Auth and Access

## Goal
Implement and validate Login + MFA + session management + RBAC + admin user management baseline for feature `001-auth-and-access`.

## Prerequisites
- Node.js 22 LTS
- npm 10+
- PostgreSQL 15+
- Existing web app dependencies installed in `apps/web`

## 1) Frontend setup (existing)
1. From repo root, open a terminal in `apps/web`.
2. Install deps if needed: `npm install`
3. Start dev server: `npm run dev`
4. Verify routes:
   - `/` (Login)
   - `/mfa` (MFA)
   - `/dashboard` (post-auth)
   - `/admin/users` (admin-gated)

## 2) API scaffold (to implement in this feature)
1. Initialize and install API dependencies:

   ```bash
   cd apps/api
   npm install
   ```

2. Start API service:

   ```bash
   npm run dev
   ```

3. Add modules:
   - `modules/auth`
   - `modules/admin`
   - `modules/audit`
4. Implement endpoints from `contracts/auth-access.openapi.yaml`.
5. Connect PostgreSQL and create missing auth tables:
   - `auth_sessions`
   - `auth_attempts`
   - `user_invitations`
   - `user_mfa_enrollments`

6. Verify API health:

   ```bash
   curl http://localhost:3000/health
   ```

## 3) Configure auth security policy
- Lockout: 3 failures -> 30-minute lockout (credentials and MFA)
- Session timeouts: 15-minute idle, 8-hour absolute
- Session invalidation triggers:
  - sign-out
  - password change
  - any role change
  - MFA reset
  - user deactivation

## 4) Normalize UI to catalog components
Ensure auth/admin pages use catalog-aligned primitives:
- `AppShell` (authenticated only)
- `PageHeader`
- `StatusBadge`
- `DataTable`/`UserTable`
- `FilterToolbar`
- `EmptyState`, `ErrorState`, `LoadingState`
- `RolePill`

## 5) Contract and integration validation
1. Contract tests for auth/admin endpoints against `contracts/auth-access.openapi.yaml`.
2. Integration tests for:
   - Login -> MFA -> session creation
   - lockout behavior
   - admin route/action denial for non-admin
   - role change revokes active sessions
   - audit event persistence on each admin action

## 6) Manual acceptance checklist
1. Invalid password shows generic error, no account enumeration.
2. Invalid MFA clears code and focuses first input.
3. Locked account remains blocked for 30 minutes.
4. Session expires on 15-minute inactivity.
5. Session expires at 8 hours absolute.
6. Non-admin user cannot access `/admin/users` by direct URL.
7. Admin can invite user, change role, deactivate user, reset MFA.
8. Each admin mutation writes an audit event; failure to write blocks mutation.

## Validation Run (2026-04-20)

- API TypeScript build: `npm run build` from `apps/api` -> PASS
- API health endpoint: `GET /health` -> PASS (`200`, `{ "status": "ok" }`)
- Web TypeScript diagnostics for touched auth/admin files -> PASS (no errors)
- Note: Monorepo-wide web production build currently reports pre-existing `packages/ui` MUI-related compile issues outside this feature's changed files.
