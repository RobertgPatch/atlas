# Quickstart: Persistent Production Data

## Local Validation

1. Install dependencies from the repo root if needed:

   ```powershell
   npm install
   ```

2. Start a local PostgreSQL database and set `DATABASE_URL` for the API process.

3. Run API tests for persistence:

   ```powershell
   npm run --workspace=api test -- auth.persistence auth.session.persistence plaid.persistence consolidated-holdings.persistence production-persistence.guard
   ```

4. Run builds:

   ```powershell
   npm run build:api
   npm run build:web
   ```

## Auth Persistence Scenario

1. Start the API with `DATABASE_URL` configured.
2. Sign in as an admin or invited test user.
3. Complete MFA enrollment and verify a session cookie is issued.
4. Restart the API process.
5. Sign in again with the same authenticator code.
6. Confirm no QR setup is requested unless MFA was explicitly reset.
7. Confirm role/status changes made through admin user management remain after restart.

## Plaid/Liquidity Persistence Scenario

1. Start the API with `DATABASE_URL` and Plaid sandbox credentials configured.
2. Connect an investment institution through Plaid Link.
3. Select a subset of investment accounts for Liquidity.
4. Refresh holdings.
5. Restart or redeploy the API.
6. Open Liquidity and confirm the connected institution, account selections, latest sync status, and holdings data are still present.
7. Refresh holdings again without reconnecting Plaid.

## Railway Validation

Use explicit Railway ids or link the project before running CLI commands. The current production project observed during planning:

- Project: `glorious-gentleness`
- Environment: `production`
- Services: `atlas-api`, `atlas-web`, `Postgres`

1. Confirm API variables include durable storage:

   ```powershell
   railway variable list --service atlas-api --json --project <project-id> --environment production
   ```

2. Confirm deploy logs show migrations:

   ```powershell
   railway logs --service atlas-api --lines 200 --json --project <project-id> --environment production
   ```

3. Complete the auth and Plaid scenarios in production.

4. Redeploy `atlas-api`.

5. Re-run the same user flows and confirm:

   - Existing MFA enrollment is reused.
   - User role/status is unchanged.
   - Plaid institution and account selections remain visible.
   - Liquidity reloads latest persisted holdings within 5 seconds.

6. Check persistence diagnostics and confirm they report durable auth and Plaid persistence without exposing secrets.

## Expected Failure Modes

- If `DATABASE_URL` is missing in production, startup or diagnostics must report unsafe temporary storage.
- If Postgres writes fail during MFA completion or Plaid exchange, the API must return an error instead of telling the user the action was saved.
- If Plaid requires reconnect/update mode after redeploy, the connection should remain visible with an actionable reconnect state.
