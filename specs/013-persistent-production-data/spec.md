# Feature Specification: Persistent Production Data

**Feature Branch**: `013-fixing-database-being-temporary`  
**Created**: 2026-05-12  
**Status**: Draft  
**Input**: User description: "What do I need to do so that my actions start to be persisted to the Railway Postgres database; users should not have to redo MFA QR setup and login twice after every deploy; connected Plaid accounts should be stored in the database as well, excluding sensitive display data where possible. After every deploy it feels like starting fresh."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep Authentication Enrollment After Deploy (Priority: P1)

As an Atlas user, I want my login identity, role, MFA enrollment, and valid session state to survive application deployments so I do not have to scan a new QR code or repeat the full setup flow after every release.

**Why this priority**: Authentication is the first workflow every user hits. Losing MFA enrollment or user state after deploy makes the product feel broken and blocks all other workflows.

**Independent Test**: A user enrolls MFA, signs in successfully, the application is redeployed, and the same user can sign in with the existing authenticator code without scanning a new QR code.

**Acceptance Scenarios**:

1. **Given** an active user has completed MFA enrollment, **When** the application is redeployed, **Then** the user's MFA enrollment remains active and the user is not asked to scan a new QR code.
2. **Given** a user has an unexpired session before a routine deploy, **When** the app comes back online, **Then** the user is not forced into a first-time setup flow solely because of the deploy.
3. **Given** an admin changes a user's role or status, **When** the application is redeployed, **Then** the role or status change remains visible and enforced.

---

### User Story 2 - Keep Plaid Connections and Account Selections (Priority: P1)

As an Atlas user, I want my connected investment institutions, selected accounts, and holdings sync history to survive deployments so the Liquidity page keeps working without reconnecting Plaid each time.

**Why this priority**: Liquidity depends on Plaid account state. Losing the connection after every deploy defeats the purpose of connecting accounts and prevents reliable holdings reporting.

**Independent Test**: A user connects a Plaid institution, selects accounts for Liquidity, refreshes holdings, the application is redeployed, and the same accounts and latest report state are still available.

**Acceptance Scenarios**:

1. **Given** a user has connected an investment institution, **When** the application is redeployed, **Then** the institution and display-safe account metadata remain available.
2. **Given** a user selected specific investment accounts for the Liquidity report, **When** the application is redeployed, **Then** the same account selections remain applied.
3. **Given** holdings were successfully synced before deploy, **When** the Liquidity page loads after deploy, **Then** the latest successful holdings data and sync status are still available.

---

### User Story 3 - Make Persistence Failures Visible (Priority: P2)

As an operator, I want clear diagnostics when the application is not using durable storage so I can catch misconfiguration before users lose work.

**Why this priority**: Silent fallback to temporary storage causes user-visible data loss. Operators need an obvious signal when persistence is not active.

**Independent Test**: Start the application without durable storage configured and verify that administrators can see a clear warning and production startup refuses or loudly reports unsafe persistence state.

**Acceptance Scenarios**:

1. **Given** the production environment starts without durable storage available, **When** the service boots, **Then** the system emits an actionable error or blocks startup rather than silently using temporary storage.
2. **Given** durable storage is configured but a write fails, **When** the user completes an auth or Plaid action, **Then** the user receives a clear failure message and the action is not falsely reported as saved.
3. **Given** an operator reviews health or diagnostics, **When** durable storage is connected, **Then** the system reports that authentication and Plaid persistence are active.

### Edge Cases

- A deploy happens while a user is midway through MFA enrollment; incomplete enrollment can expire, but completed enrollment must remain durable.
- A Plaid institution requires reconnect/update mode after deploy; the connection should remain listed with an actionable reconnect state rather than disappearing.
- A user revokes access or deselects accounts; those changes must remain durable after a restart.
- Durable storage is available for some modules but not auth or Plaid; the app must not imply full persistence if critical workflows still use temporary state.
- Sensitive credential material needed for future syncs must never be exposed in browser payloads, logs, exports, or non-admin diagnostics.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist user records, user roles, user statuses, MFA enrollment state, and completed MFA secrets across deployments.
- **FR-002**: The system MUST persist authentication sessions until they expire, are revoked, or are invalidated by a security action.
- **FR-003**: The system MUST preserve admin user-management actions, including invitations, role changes, deactivations, reactivations, and MFA resets, across deployments.
- **FR-004**: The system MUST persist Plaid institution connections across deployments while protecting sensitive credential material from user-facing responses and logs.
- **FR-005**: The system MUST persist display-safe Plaid account metadata, including institution name, account name, mask, account type/subtype, sync status, and selected-for-report state.
- **FR-006**: The system MUST persist holdings sync snapshots and source holding facts needed to render the Liquidity report after a redeploy.
- **FR-007**: The system MUST restore the Liquidity page from durable data after deploy without requiring the user to reconnect Plaid solely because the service restarted.
- **FR-008**: The system MUST distinguish sensitive credential material from display-safe account metadata and restrict sensitive values to server-side use only.
- **FR-009**: The system MUST fail loudly or provide an administrator-visible warning when production is using temporary storage for authentication or Plaid workflows.
- **FR-010**: The system MUST provide repeatable validation steps that prove auth enrollment, sessions, Plaid connections, account selections, and holdings survive a deployment.
- **FR-011**: The system MUST avoid destructive data resets during routine deploys, migrations, restarts, and health checks.
- **FR-012**: The system MUST record audit events for durable auth and Plaid state changes whenever those actions already have audit semantics in the application.

### Key Entities *(include if feature involves data)*

- **User Profile**: A login identity with email, password verifier, role, status, MFA state, and lifecycle metadata.
- **MFA Enrollment**: A user's completed or pending authenticator setup, including enrollment state and reset history.
- **Auth Session**: A signed-in browser session with issue time, activity time, expiration, and revocation details.
- **Plaid Connection**: A linked institution connection owned by a user, including institution identity, connection status, and protected server-side credential material.
- **Investment Account**: Display-safe account metadata and report-selection state for a connected Plaid investment account.
- **Holdings Sync Snapshot**: A record of a holdings refresh attempt, including selected accounts, status, timestamps, warnings, and source data references.
- **Source Holding**: Account-level holding facts used to rebuild the Liquidity report after deploy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of completed MFA enrollments remain usable after a routine deployment in validation testing.
- **SC-002**: A user with an unexpired valid session can continue or re-authenticate normally after deployment without repeating first-time QR enrollment.
- **SC-003**: 100% of connected Plaid institutions and selected investment accounts remain visible after a deployment in validation testing.
- **SC-004**: The Liquidity report can reload the latest successful holdings data within 5 seconds after deployment without requiring a new Plaid Link connection.
- **SC-005**: Production startup either confirms durable auth and Plaid persistence or produces an operator-visible warning/error within 30 seconds.
- **SC-006**: No sensitive Plaid credential values or MFA secrets appear in browser responses, exports, or application logs during validation.

## Assumptions

- Existing seeded demo users may continue to exist for local development, but production user state must be durable.
- Routine deployments should not invalidate completed MFA enrollment.
- Short-lived challenge tokens used during active login or enrollment may remain temporary if completed durable state is saved before the user is told setup is complete.
- Plaid display-safe metadata can be persisted plainly, while any credential material required for refresh must use approved server-side protection.
- The existing Liquidity report should continue to show only selected investment accounts after persistence is added.
