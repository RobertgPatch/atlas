# Feature Specification: Auth and Access

**Feature Branch**: `001-auth-and-access`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "restart implementation, begin with auth/login/MFA flow; reference System Constitution, UI Constitution, screen map, generation contract, and component catalog"

## Clarifications

### Session 2026-04-20

- Q: What session lifetime should V1 enforce? → A: 15-minute idle timeout, 8-hour absolute lifetime
- Q: What rate-limit thresholds should apply to sign-in and MFA attempts? → A: 3 failed attempts then 30-minute lockout per account (applies to both credentials and MFA)
- Q: What MFA enrollment mechanism should V1 support? → A: QR code scan only; no backup codes in V1; lost device requires admin-initiated MFA reset
- Q: When an admin changes a user's role, should existing sessions be invalidated? → A: Yes — any role change (demotion or elevation) invalidates all active sessions for that user, forcing a fresh sign-in
- Q: How should the stack tension between UI Constitution §1 (Material UI) and the Magic Patterns Tailwind seed be resolved? → A: Amend UI Constitution §1 to Tailwind + headless primitives; the Magic Patterns output stack is the baseline. Component catalog names and contracts are unchanged; only the implementation substrate changes.

## Context & References

This specification is governed by and MUST be read alongside:

- **[System Constitution](../000-constitution.md)** — authoritative source of truth for system-wide invariants
  - §9 Security Requirements: email/password + MFA for all users, RBAC, encryption in transit/at rest, audit logging
  - §12 UI Principles: role-aware feature visibility (not separate apps), clarity over decoration
  - §13 System Integrity Rules: never lose audit history
- **[UI Constitution](../001-ui-constitution.md)**
  - §3 Shared Patterns: `AppShell`, `PageHeader`, `FilterToolbar`, `DataTable`, `StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`
  - §4 Screen States: every major screen must support loading / empty / error / populated / permission-restricted
  - §7 Role Visibility: gate actions by role via conditional navigation and visibility — no separate UI systems
  - §10 Magic Patterns Normalization Rule: generated components must be normalized to the component catalog before merge
- **[Screen Map](../../docs/ui/40-screen-map.md)** — screens #1 Login, #2 MFA Verification, #3 App Shell, #15 User Management, #16 User Detail / Role Assignment
- **[Component Catalog](../../docs/ui/46-component-catalog.md)** — `AppShell`, `PageHeader`, `UserTable`, `RolePill`, `StatusBadge`, `DataTable`, `FilterToolbar`
- **[Generation Contract](../../docs/ui/45-generation-contract.md)** — presentational-first, typed props, all screen states, role-based visibility

**Reference implementation artifacts** (Magic Patterns seed, already integrated at `apps/web`):
- `apps/web/src/pages/LoginPage.tsx` — email/password form, show/hide password, remember me, forgot password
- `apps/web/src/pages/MFAPage.tsx` — 6-digit code entry, paste support, auto-advance, 30s resend cooldown
- `apps/web/src/components/shared/AppShell.tsx` — sidebar navigation with Administration section gated to admins

Per UI Constitution §10, these Magic Patterns outputs are a **starting point only**. They MUST be normalized against the component catalog (e.g., reusing `PageHeader`, `StatusBadge`, `EmptyState`, `UserTable`, `RolePill`) before the feature is considered complete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authenticated sign-in with mandatory MFA (Priority: P1)

A user arrives at the Atlas app URL and signs in with their email and password. After credential verification succeeds, the user is required to enter a 6-digit verification code from their authenticator app before gaining any access to application data or screens. A verified session begins only after both factors are accepted.

**Why this priority**: Without this flow, no other Atlas feature is reachable. Constitution §9 makes MFA a non-negotiable gate for all users; reporting, K-1 review, and admin screens all depend on it.

**Independent Test**: Deploy only Login + MFA screens with a stub dashboard route. A user with valid credentials and MFA enrollment can reach the dashboard; a user with valid credentials but no valid MFA code cannot.

**Acceptance Scenarios**:

1. **Given** a registered user on the Login screen, **When** they submit valid email and password, **Then** they are navigated to the MFA Verification screen and no authenticated application content has loaded yet.
2. **Given** a user on the MFA screen after valid credentials, **When** they enter a correct 6-digit code, **Then** a verified session is established and they are navigated to the Main Dashboard.
3. **Given** a user on the MFA screen, **When** they enter an incorrect code, **Then** an inline error message is shown, the code input is cleared, and no session is established.
4. **Given** a user submits invalid credentials on the Login screen, **When** the server rejects them, **Then** a generic error is shown (no enumeration of whether email or password was wrong) and the user remains on the Login screen.
5. **Given** a user with a verified session, **When** the session expires or the user signs out, **Then** the next protected route access redirects to the Login screen.

---

### User Story 2 - Role-gated navigation and routes (Priority: P2)

A signed-in non-admin user sees only non-administrative navigation items and cannot reach admin-only routes by URL manipulation. A signed-in admin user sees the Administration section (User Management) in the sidebar and can reach admin routes.

**Why this priority**: Constitution §9 (RBAC) and UI Constitution §7 require role-aware visibility. Without role gating, admin capabilities leak to all users, breaking the security model. This is ranked P2 because it depends on P1 being in place but is required before any admin functionality ships.

**Independent Test**: With User Story 1 implemented, assign role=Admin to one test account and role=User to another. Admin sees Administration group in sidebar and can open `/admin/users`; User does not see the group and attempting to navigate to `/admin/users` directly results in denial.

**Acceptance Scenarios**:

1. **Given** an authenticated non-admin user, **When** the App Shell renders, **Then** the Administration section of the sidebar is not displayed.
2. **Given** an authenticated admin user, **When** the App Shell renders, **Then** the Administration section of the sidebar is displayed with User Management.
3. **Given** an authenticated non-admin user, **When** they navigate directly to an admin-only URL, **Then** they are shown a permission-restricted state (or redirected to a permitted default) and no admin data is loaded.
4. **Given** an authenticated user of any role, **When** the sidebar renders, **Then** no separate admin-only application shell is used — the same AppShell renders with conditional items (UI Constitution §7).

---

### User Story 3 - Admin invites users and assigns roles (Priority: P3)

An admin opens the User Management screen and invites a new user by email, assigning them an initial role. The invited user receives an invitation, completes account setup (including MFA enrollment), and can then sign in. The admin can later change a user's role or deactivate their account. Every admin-initiated action is recorded in the audit log.

**Why this priority**: Enables onboarding of additional users and role changes, which unblocks multi-user workflows. Depends on P1 (auth) and P2 (role gating). Can be deferred past MVP if a seed admin account is sufficient for early validation, hence P3.

**Independent Test**: With P1 and P2 in place, an admin can open `/admin/users`, invite a new email address with role=User, and an audit event for `user.invited` is persisted with the inviting admin's identity and the target email.

**Acceptance Scenarios**:

1. **Given** an admin on the User Management screen, **When** they invite a new user with email and role, **Then** an invitation is created, the listing shows the user with an `Invited` status badge, and an audit event is recorded.
2. **Given** an invited user, **When** they complete account setup (set password and enroll in MFA), **Then** their status becomes `Active` and they can sign in per User Story 1.
3. **Given** an admin viewing the user list, **When** they change a user's role, **Then** the change is persisted, an audit event is recorded, all active sessions for the target user are invalidated, and the target user must re-authenticate (credentials + MFA) before the new role takes effect.
4. **Given** an admin viewing the user list, **When** they deactivate a user, **Then** any active sessions for that user are invalidated and subsequent sign-in attempts by that user are rejected.

---

### Edge Cases

- MFA code entered during resend cooldown: the Verify button remains enabled and operates on the currently entered code; only the Resend action is disabled during the cooldown.
- User refreshes the browser between Login and MFA: the user MUST be returned to the Login screen and re-enter credentials. A partial (credentials-only) session MUST NOT persist across reload.
- User pastes a 6-digit code into the first MFA input: the paste MUST distribute digits across all six input cells and auto-advance focus.
- Role changed while user is signed in: all active sessions for that user are invalidated and the user is redirected to the Login screen on the next protected-route access; the new role takes effect only after a fresh sign-in (credentials + MFA).
- Non-admin accesses `/admin/users` via typed URL, browser history, or bookmark: the user sees a permission-restricted state (UI Constitution §4), not a stale cached admin view.
- Session expires while a form is open: the user is redirected to Login; on successful re-authentication, returning to the previous deep link is a nice-to-have but not required for V1.
- User attempts sign-in while account is deactivated or invitation has expired: a generic error is shown; no information is disclosed about account status beyond "sign-in failed".
- Audit log write fails during an admin action: the admin action MUST NOT be considered complete (System Constitution §13 forbids losing audit history).

## Requirements *(mandatory)*

### Functional Requirements

**Authentication**

- **FR-001**: System MUST authenticate users via email and password as the first factor.
- **FR-002**: System MUST require a second-factor verification code (6-digit TOTP) after successful credential verification and before any protected resource is accessible.
- **FR-003**: System MUST NOT grant access to any application screen other than Login and MFA Verification until both factors succeed.
- **FR-004**: System MUST return a generic failure message for invalid credentials, invalid MFA code, deactivated account, or expired invitation — without disclosing which condition caused the failure.
- **FR-005**: System MUST lock an account after 3 consecutive failed sign-in attempts OR 3 consecutive failed MFA code attempts within a rolling window; the lockout MUST last 30 minutes, during which further attempts on that account are rejected with the same generic failure message (FR-004).
- **FR-006**: System MUST clear the entered MFA code on failed verification and return focus to the first input.
- **FR-007**: System MUST enforce a resend cooldown (≥30 seconds) before a new MFA code can be requested.
- **FR-008**: System MUST provide a password show/hide toggle on the Login form for accessibility; the default state MUST be hidden.

**Session management**

- **FR-009**: System MUST establish a verified session only after both factors succeed, and MUST NOT persist a partial (credentials-only) session across browser reloads.
- **FR-010**: System MUST invalidate all active verified sessions for a user on: explicit sign-out, password change, any role change (whether elevation or demotion), administrative MFA reset, or administrative deactivation of the account.
- **FR-011**: System MUST expire sessions after 15 minutes of inactivity (idle timeout) and after 8 hours of absolute lifetime regardless of activity, and MUST require full re-authentication including MFA upon expiry.
- **FR-012**: System MUST store session tokens in a way that prevents cross-site script access (e.g., HTTP-only, secure transport).

**Authorization / RBAC**

- **FR-013**: System MUST define at least two roles: `Admin` and `User`.
- **FR-014**: System MUST gate the Administration navigation group and all admin routes (User Management, User Detail / Role Assignment) to users with the `Admin` role.
- **FR-015**: System MUST render a permission-restricted state (UI Constitution §4) when a user reaches a route they are not authorized for, and MUST NOT fetch or render the restricted data.
- **FR-016**: System MUST gate admin-only API actions on the server regardless of client-side navigation gating.
- **FR-017**: System MUST use a single unified `AppShell` for all roles (UI Constitution §7); admin items are conditionally rendered, not served from a separate application shell.

**Admin user management**

- **FR-018**: Admins MUST be able to invite a new user by email and assign an initial role.
- **FR-019**: Invited users MUST complete password setup and MFA enrollment before their account becomes `Active`. MFA enrollment MUST present a TOTP QR code for the user to scan with an authenticator app and MUST require the user to verify a code from the app before enrollment completes. V1 does NOT issue backup codes.
- **FR-020**: Admins MUST be able to change a user's role.
- **FR-021**: Admins MUST be able to deactivate a user, which invalidates any active sessions for that user.
- **FR-021a**: Admins MUST be able to reset a user's MFA enrollment (clearing the existing TOTP secret and forcing re-enrollment on next sign-in), to recover users who lost their authenticator device.
- **FR-022**: User Management MUST display each user's status using `StatusBadge` with at least: `Invited`, `Active`, `Inactive`.
- **FR-023**: User Management MUST render each user's role using `RolePill` (component catalog).

**Auditability (Constitution §13)**

- **FR-024**: System MUST record an audit event for every admin action, at minimum: `user.invited`, `user.role_changed`, `user.deactivated`, `user.reactivated`, `user.mfa_reset`.
- **FR-025**: Each audit event MUST record the acting admin's identity, the target user, the action type, before/after values where applicable, and a UTC timestamp.
- **FR-026**: System MUST record an audit event for successful and failed sign-in attempts and for MFA verification outcomes.
- **FR-027**: If audit persistence fails during an admin action, the admin action MUST NOT complete and the user MUST see an error.

**UI contract alignment (UI Constitution §3, §4, §10)**

- **FR-028**: Login, MFA, and User Management screens MUST normalize to the Atlas component catalog before merge — reusing `AppShell` (for authenticated screens), `PageHeader`, `StatusBadge`, `DataTable` (via `UserTable`), `FilterToolbar`, `EmptyState`, `ErrorState`, `LoadingState`, and `RolePill`.
- **FR-029**: Every screen in this feature MUST explicitly support loading, empty (where applicable), error, populated, and permission-restricted states.
- **FR-030**: Login and MFA screens MUST be reachable without an authenticated session; all other screens MUST be unreachable without one.

### Key Entities

- **User**: a person who can authenticate into Atlas. Attributes include email, display name, status (`Invited` / `Active` / `Inactive`), role, MFA enrollment state, created/last-seen timestamps.
- **Role**: a named capability bundle. V1: `Admin`, `User`. Admin grants access to User Management and admin-only actions.
- **Session**: a verified authentication context for a single user, with expiry and revocation support.
- **Invitation**: a pending-account record created by an admin; carries email, assigned role, expiry, and consumed/unconsumed state.
- **Audit Event**: an immutable record of a security-relevant or admin action, referencing acting user, target entity, action type, before/after values, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of application screens other than Login and MFA are unreachable without a verified two-factor session (verified by route-by-route automated check).
- **SC-002**: Users can complete a successful sign-in (credentials + MFA) in under 30 seconds under normal conditions.
- **SC-003**: 100% of admin actions (invite, role change, deactivate, reactivate) produce a corresponding audit event; zero missing audit events across a sample audit of 100 actions.
- **SC-004**: 0 instances of a non-admin user successfully reaching admin data across automated authorization tests covering every admin route and admin API action.
- **SC-005**: No information disclosure is present in sign-in failure messages — the same generic error string is returned for invalid credentials, invalid MFA, inactive account, and unknown email (verified by test).
- **SC-006**: Idle sessions expire and require full re-authentication including MFA within the 15-minute idle window (and no later than 8 hours absolute) in ≥99% of sampled sessions.
- **SC-007**: Every screen in this feature renders each required state (loading, empty where applicable, error, populated, permission-restricted) verified against UI Constitution §4.
- **SC-008**: Admin and non-admin use the same `AppShell` (verified by source inspection — no separate admin shell component exists).

## Assumptions

- The second factor is a time-based one-time passcode (TOTP) delivered via an authenticator app, matching the 6-digit code UI in the Magic Patterns MFA screen. SMS/email-based OTP, WebAuthn/FIDO2, and backup codes are out of scope for V1. Users who lose their authenticator device must contact an admin for an MFA reset (FR-021a).
- V1 roles are `Admin` and `User`. Finer-grained roles (e.g., Preparer, Reviewer) are deferred to a later feature and are not needed to satisfy the P1/P2/P3 stories above.
- The seed/bootstrap admin account is provisioned out-of-band (e.g., deployment script), consistent with Constitution §10 single-tenant per deployment.
- Password policy follows current NIST SP 800-63B guidance (minimum length, breach check, no forced periodic rotation). Specific thresholds will be fixed in the plan phase.
- Session idle timeout is 15 minutes and absolute lifetime is 8 hours (committed per Clarifications 2026-04-20); rationale: stricter-than-NIST-AAL2 baseline appropriate for a financial system handling client-owned data.
- Invitation links expire after a bounded window (reasonable default: 7 days); expiration handling follows FR-004's generic-error rule.
- "Forgot password" and self-serve password reset flows are implied by the Login UI but are treated as a follow-on iteration; V1 may ship with admin-triggered password reset only. This is an acceptable reduction because no P1/P2/P3 acceptance scenario depends on self-serve reset.
- The UI stack for V1 is Tailwind CSS + headless primitives (e.g., Radix/Headless UI) + `framer-motion` for motion + `lucide-react` for iconography, matching the Magic Patterns seed. UI Constitution §1 will be amended in the plan phase to reflect this decision (committed per Clarifications 2026-04-20). Component catalog names and contracts (`AppShell`, `PageHeader`, `StatusBadge`, `DataTable`, etc.) remain the authoritative interface; only their implementation substrate changes from Material UI to Tailwind.
- The existing Magic Patterns components in `apps/web/src/pages/LoginPage.tsx`, `MFAPage.tsx`, and `apps/web/src/components/shared/AppShell.tsx` are **presentational seeds**. They will be normalized to the Atlas component catalog (UI Constitution §3, §10) during the plan/implement phases — including alignment of `AppShell`, `PageHeader`, `StatusBadge`, and the admin list view with catalog components.
- Audit log storage is an existing or to-be-provisioned persistence mechanism within the Atlas backend; this feature depends on its availability and will fail closed (FR-027) if it is not writable.
# Spec 001 - Auth and Access

## Goal
Implement secure authentication and authorization for Atlas with MFA required for all users.

## Scope
- login page
- MFA verification
- session management
- role-based feature gating
- admin user management basics

## Functional Requirements
- user can log in with email/password
- MFA is required after credentials
- admin can invite users
- admin can assign roles
- non-admin users cannot access admin routes

## Acceptance Criteria
- all users complete MFA before app access
- admin routes and actions are gated
- audit events are created for admin actions
