# Tasks: Auth and Access

**Input**: Design documents from `/specs/001-auth-and-access/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: No explicit TDD/test-first mandate was requested in the feature spec, so this task list focuses on implementation and validation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish API project skeleton and shared type surface for auth/access work.

- [X] T001 Initialize API Node/TypeScript project manifest in apps/api/package.json
- [X] T002 Create API TypeScript configuration in apps/api/tsconfig.json
- [X] T003 [P] Add API environment template for auth settings in apps/api/.env.example
- [X] T004 [P] Scaffold API bootstrap files in apps/api/src/app.ts and apps/api/src/server.ts
- [X] T005 [P] Create shared auth/access type definitions in packages/types/src/auth-access.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core security, persistence, and routing foundations required by all stories.

**⚠️ CRITICAL**: No user story work begins until this phase completes.

- [X] T006 Create auth/access SQL migration for sessions, attempts, invitations, and MFA enrollment in apps/api/src/infra/db/migrations/001_auth_access.sql
- [X] T007 [P] Implement PostgreSQL client and transaction helper in apps/api/src/infra/db/client.ts
- [X] T008 [P] Implement fail-closed audit event repository in apps/api/src/modules/audit/audit.repository.ts
- [X] T009 [P] Implement auth repository for users, roles, and sessions in apps/api/src/modules/auth/auth.repository.ts
- [X] T010 Implement session cookie middleware (HttpOnly/Secure) in apps/api/src/modules/auth/session.middleware.ts
- [X] T011 Implement RBAC middleware for Admin/User checks in apps/api/src/modules/auth/rbac.middleware.ts
- [X] T012 Implement auth request/response schemas and error envelope in apps/api/src/modules/auth/auth.schemas.ts
- [X] T013 Wire module route registration in apps/api/src/routes/index.ts and apps/api/src/server.ts

**Checkpoint**: Foundation ready. User story implementation can proceed.

---

## Phase 3: User Story 1 - Authenticated sign-in with mandatory MFA (Priority: P1) 🎯 MVP

**Goal**: Deliver secure login -> MFA -> verified session flow with lockout and session policy enforcement.

**Independent Test**: User can complete Login + MFA and reach `/dashboard`; invalid credentials/code never create a verified session.

- [X] T014 [P] [US1] Implement login endpoint handler (`POST /v1/auth/login`) in apps/api/src/modules/auth/login.handler.ts
- [X] T015 [P] [US1] Implement MFA verify endpoint handler (`POST /v1/auth/mfa/verify`) in apps/api/src/modules/auth/mfa-verify.handler.ts
- [X] T016 [US1] Implement session introspection and logout handlers (`GET /v1/auth/session`, `POST /v1/auth/logout`) in apps/api/src/modules/auth/session.handler.ts
- [X] T017 [US1] Register auth endpoints in apps/api/src/modules/auth/auth.routes.ts
- [X] T018 [US1] Implement lockout policy service (3 attempts, 30-minute lock) in apps/api/src/modules/auth/lockout.service.ts
- [X] T019 [US1] Implement TOTP verification/enrollment service (QR-backed) in apps/api/src/modules/auth/totp.service.ts
- [X] T020 [P] [US1] Replace mock auth service with API client in apps/web/src/auth/authClient.ts
- [X] T021 [US1] Integrate credential submit flow with API in apps/web/src/pages/LoginPage.tsx
- [X] T022 [US1] Integrate MFA verify flow with API in apps/web/src/pages/MFAPage.tsx
- [X] T023 [US1] Add verified session bootstrap and protected-route wrapper in apps/web/src/auth/sessionStore.ts and apps/web/src/App.tsx
- [X] T024 [US1] Apply required loading/error/empty states on auth screens in apps/web/src/pages/LoginPage.tsx and apps/web/src/pages/MFAPage.tsx

**Checkpoint**: User Story 1 is independently functional and can serve as MVP.

---

## Phase 4: User Story 2 - Role-gated navigation and routes (Priority: P2)

**Goal**: Ensure admin-only routes and actions are inaccessible to non-admin users in both API and UI.

**Independent Test**: Admin can access `/admin/users`; non-admin cannot see admin nav and receives permission-restricted state on direct URL.

- [X] T025 [P] [US2] Extend session payload with effective role data in apps/api/src/modules/auth/session.handler.ts
- [X] T026 [US2] Enforce admin authorization guard on admin routes in apps/api/src/modules/admin/admin.guard.ts and apps/api/src/routes/index.ts
- [X] T027 [US2] Implement role-aware admin navigation visibility in apps/web/src/components/shared/AppShell.tsx
- [X] T028 [US2] Enforce client-side protected route checks for admin paths in apps/web/src/App.tsx
- [X] T029 [US2] Implement permission-restricted page state in apps/web/src/pages/PermissionDeniedPage.tsx and wire fallback in apps/web/src/App.tsx

**Checkpoint**: User Stories 1 and 2 operate independently with strict route/action gating.

---

## Phase 5: User Story 3 - Admin invites users and assigns roles (Priority: P3)

**Goal**: Provide admin user lifecycle operations (invite, role change, deactivate/reactivate, MFA reset) with audit logging.

**Independent Test**: Admin performs each user-management action from `/admin/users`, data persists, sessions revoke as required, and audit events are recorded.

- [X] T030 [P] [US3] Implement invitation repository and token lifecycle in apps/api/src/modules/admin/invitation.repository.ts
- [X] T031 [P] [US3] Implement user admin mutation repository (role/deactivate/reactivate/mfa-reset) in apps/api/src/modules/admin/user-admin.repository.ts
- [X] T032 [US3] Implement admin handlers for invite and user mutations in apps/api/src/modules/admin/admin.handlers.ts
- [X] T033 [US3] Register admin endpoints in apps/api/src/modules/admin/admin.routes.ts
- [X] T034 [US3] Build User Management screen with catalog components in apps/web/src/pages/UserManagementPage.tsx
- [X] T035 [US3] Integrate User Management actions with API and state handling in apps/web/src/pages/UserManagementPage.tsx
- [X] T036 [US3] Route `/admin/users` to UserManagementPage in apps/web/src/App.tsx

**Checkpoint**: All user stories are complete and independently operable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final alignment, hardening, and execution validation across stories.

- [X] T037 [P] Align OpenAPI contract and shared TypeScript types in specs/001-auth-and-access/contracts/auth-access.openapi.yaml and packages/types/src/auth-access.ts
- [X] T038 [P] Update implementation runbook with API startup/env details in specs/001-auth-and-access/quickstart.md
- [X] T039 Perform security hardening pass for generic errors, cookie flags, and fail-closed audit behavior in apps/api/src/modules/auth and apps/api/src/modules/admin
- [X] T040 Execute quickstart validation end-to-end and record final verification notes in specs/001-auth-and-access/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all stories.
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2 and leverages US1 session/role context.
- **Phase 5 (US3)**: Depends on Phase 2 and uses US2 gating.
- **Phase 6 (Polish)**: Depends on completion of desired user stories.

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Foundational.
- **US2 (P2)**: Depends on US1 session/identity path being available.
- **US3 (P3)**: Depends on US1 auth/session and US2 authorization gating.

### Within Each User Story

- API handlers/services before frontend integration.
- Route registration after handlers are implemented.
- UI state handling after API wiring.
- Complete story checkpoint before moving to next story phase.

### Parallel Opportunities

- Setup: T003, T004, T005 can run in parallel after T001/T002 start.
- Foundational: T007, T008, T009 can run in parallel after T006.
- US1: T014 and T015 can run in parallel; T020 can proceed in parallel with backend handlers.
- US2: T025 can run in parallel with T027.
- US3: T030 and T031 can run in parallel.
- Polish: T037 and T038 can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Parallel backend handler implementation
Task: T014 [US1] apps/api/src/modules/auth/login.handler.ts
Task: T015 [US1] apps/api/src/modules/auth/mfa-verify.handler.ts

# Parallel frontend prep while handlers are built
Task: T020 [US1] apps/web/src/auth/authClient.ts
```

## Parallel Example: User Story 2

```bash
# Parallel API/UI role-gating work
Task: T025 [US2] apps/api/src/modules/auth/session.handler.ts
Task: T027 [US2] apps/web/src/components/shared/AppShell.tsx
```

## Parallel Example: User Story 3

```bash
# Parallel admin persistence work
Task: T030 [US3] apps/api/src/modules/admin/invitation.repository.ts
Task: T031 [US3] apps/api/src/modules/admin/user-admin.repository.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate Login -> MFA -> verified dashboard access.
4. Demo/deploy MVP increment.

### Incremental Delivery

1. Ship US1 (mandatory auth + MFA).
2. Add US2 (role-based gating) and re-validate access boundaries.
3. Add US3 (admin lifecycle operations + auditability).
4. Finish with Phase 6 hardening and quickstart validation.

### Parallel Team Strategy

1. Team completes Setup + Foundational together.
2. Then split:
   - Engineer A: US1 auth handlers + session policy.
   - Engineer B: US2 route/UI gating.
   - Engineer C: US3 admin lifecycle and audit paths.
3. Rejoin for Phase 6 cross-cutting hardening.

---

## Notes

- `[P]` tasks are safe to run in parallel because they touch separate files or independent layers.
- Every task includes a concrete path for immediate execution by an implementation agent.
- Task IDs are ordered for dependency-aware execution and map cleanly to user-story phases.
