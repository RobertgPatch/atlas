# Research: Persistent Production Data

## Decision: Railway Postgres is present; repository persistence is the gap

**Rationale**: Railway project `glorious-gentleness` contains `atlas-api`, `atlas-web`, and `Postgres`. `atlas-api` has `DATABASE_URL` and deploy logs show migrations running. Direct production counts showed `users`, `auth_sessions`, `user_mfa_enrollments`, `plaid_connections`, `plaid_investment_accounts`, `source_holdings`, and `holdings_sync_snapshots` at zero. Local code shows auth and Plaid repositories are process-local Maps/arrays, so user-visible state never reaches Postgres.

**Alternatives considered**:

- Re-link Railway or recreate Postgres: rejected because services and variables are already present.
- Add a Railway volume for API state: rejected because auth/Plaid state already has relational tables and should not depend on process filesystem durability.

## Decision: Make PostgreSQL the production source of truth for auth

**Rationale**: The existing schema already includes `users`, `roles`, `user_roles`, `user_mfa_enrollments`, `auth_sessions`, and `auth_attempts`. Login, MFA, session middleware, and admin user management should use these tables when `DATABASE_URL` is configured. Process-local fallback can remain for isolated local/test scenarios.

**Alternatives considered**:

- Persist only MFA state and keep users in memory: rejected because user ids, roles, status changes, and sessions would still reset.
- Force all users to re-authenticate after deploy while preserving MFA: rejected because active sessions are an explicit requirement.

## Decision: Persist completed MFA enrollment, keep short-lived login challenges temporary if needed

**Rationale**: Completed MFA state must survive deploy. Pending enrollment and verification challenges are short-lived and can remain temporary as long as the completed enrollment is saved before the user is told setup is complete. If a deploy happens mid-enrollment, the user can restart enrollment without losing completed state.

**Alternatives considered**:

- Persist every transient challenge: useful but not required for the main production data-loss problem.
- Store MFA state only on the user row: rejected because `user_mfa_enrollments` already exists and supports reset/audit lifecycle better.

## Decision: Persist Plaid connections, accounts, selections, snapshots, and source holdings

**Rationale**: The Liquidity report depends on Plaid connection state, selected investment accounts, latest sync status, and source holdings. Existing migrations already define `plaid_connections`, `plaid_investment_accounts`, `holdings_sync_snapshots`, and `source_holdings`, but current code uses arrays. The repository should upsert/read these tables for production.

**Alternatives considered**:

- Store only selected accounts and require reconnect for refresh: rejected because the user explicitly expects connected accounts to survive deploy.
- Store only aggregate report rows: rejected because raw account-level source holdings are required for auditability and expandable detail rows.

## Decision: Protect Plaid access tokens and MFA secrets server-side

**Rationale**: Plaid access tokens are required to refresh holdings after deploy; MFA secrets are required to verify TOTP codes. Both are sensitive. They may be persisted only with server-side protection and must never appear in browser payloads, exports, diagnostics, or logs.

**Alternatives considered**:

- Do not persist Plaid access tokens: rejected because users would need to reconnect after every deploy.
- Persist tokens in plain text: rejected because it violates the feature's sensitive-data constraints.

## Decision: Add production persistence diagnostics

**Rationale**: The current service can run migrations while still using in-memory repositories for critical workflows. Operators need a clear signal that auth and Plaid persistence are active. Production should warn or fail loudly if durable storage is absent or if critical repositories are configured for temporary state.

**Alternatives considered**:

- Rely on logs saying migrations ran: rejected because that did not catch the actual bug.
- Add a manual runbook only: rejected because the app should self-report unsafe persistence modes.
