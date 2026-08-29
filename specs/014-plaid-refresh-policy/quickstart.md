# Quickstart: Plaid Refresh Policy And AWS Liquidity Deployment

## Local Validation

1. Install dependencies from the repo root if needed:

   ```powershell
   npm install
   ```

2. Start the API with `DATABASE_URL` configured. Plaid sandbox credentials may be real or mocked by tests.

3. Run the focused API tests:

   ```powershell
   npm run --workspace=api test -- plaid.refresh-policy reports.consolidated-holdings.freshness reports.consolidated-holdings.history reports.consolidated-holdings.identity reports.consolidated-holdings.export production-readiness
   ```

4. Run the focused web tests:

   ```powershell
   npm run --workspace=web test -- ConsolidatedHoldingsReport
   ```

5. Run builds:

   ```powershell
   npm run build:api
   npm run build:web
   ```

6. Build the API container locally after adding the Dockerfile:

   ```powershell
   docker build -f apps/api/Dockerfile -t atlas-api:local .
   ```

7. Confirm the container includes compiled JS, the scheduled refresh CLI, and SQL migrations beside the runtime path expected by the migration loader:

   ```powershell
   docker run --rm --entrypoint node atlas-api:local -e "import('node:fs').then(fs => { const required = ['dist/server.js', 'dist/scripts/run-plaid-refresh.js', 'dist/infra/db/migrations/015_plaid_refresh_policy.sql']; for (const path of required) { if (!fs.existsSync(path)) throw new Error(path + ' missing') } console.log('api image files ok') })"
   ```

## Verify Liquidity Read Path

1. Seed or create a successful holdings snapshot for selected Plaid accounts.
2. Disable or mock Plaid network calls.
3. Open `/liquidity`.
4. Confirm holdings rows, data-as-of date, and sync status render from saved data.
5. Refresh the browser several times.
6. Confirm no Plaid holdings request occurs during ordinary page reads.

## Verify Daily Freshness Rule

1. Configure the default policy as daily at `05:00` in `America/Los_Angeles`.
2. Create a successful snapshot completed after today's 5:00 AM Pacific cutoff.
3. Open Liquidity and confirm status is `fresh`.
4. Move test time past the next 5:00 AM Pacific cutoff without a new success.
5. Open Liquidity and confirm the same saved rows display with `stale` status.
6. Trigger refresh and confirm a new saved snapshot becomes the displayed snapshot.

## Verify Historical Snapshots

1. Run refresh for day 1 and capture source holdings count.
2. Run refresh for day 2 with changed market values.
3. Confirm day 1 source holdings still exist.
4. Confirm the current Liquidity dashboard uses day 2 values.
5. Query snapshots by date and confirm both data-as-of dates are distinguishable.

## AWS Manual Deployment

Create the staging AWS environment manually first so each service is visible and understandable. Then generate equivalent Terraform and compare it to the manual resources before adopting Terraform as source of truth. Repeat the same topology for production after staging passes validation.

Use separate domains, secrets, databases, scheduler tokens, logs, alarms, budgets, and Terraform variable files:

```text
staging:    staging.example.com, staging.tfvars, Plaid sandbox credentials
production: app.example.com,     production.tfvars, production-approved credentials
```

### 1. DNS And Certificate

1. Choose one app domain for the target environment, for example `staging.example.com` or `app.example.com`.
2. Create or use the matching Route 53 hosted zone.
3. Request an ACM certificate for the app domain in the CloudFront-required certificate region.
4. Validate the certificate through DNS.

### 2. Network And Database

1. Create a VPC with public subnets for edge/load-balancer exposure and private subnets for API tasks and RDS.
2. Create security groups:

   - API service security group allows inbound only from the API load balancer or CloudFront-facing origin path.
   - RDS security group allows inbound `5432` only from the API service security group.

3. Create private RDS PostgreSQL.
4. Store database credentials in Secrets Manager and enable rotation where supported.
5. Build `DATABASE_URL` from the secret and inject it into the API service at runtime.

### 3. Secrets

Store these in Secrets Manager, not committed `.env` files:

```text
DATABASE_URL
PERSISTENCE_SECRET_KEY
SESSION_SECRET
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV
PROJECT_JACKSON_SCHEDULER_TOKEN
ADMIN_BOOTSTRAP_PASSWORD or invitation bootstrap equivalent
```

Document rotation expectations:

- RDS credentials: managed or scheduled rotation.
- Plaid credentials: rotate through Plaid and update Secrets Manager.
- `PERSISTENCE_SECRET_KEY`: emergency rotation requires a re-encryption plan; do not rotate casually.
- Session/scheduler secrets: rotate with a short overlap window when possible.

### 4. API Container

1. Add `apps/api/Dockerfile`.
2. Build a Node 22 production image.
3. Copy compiled API output and SQL migrations into the runtime image.
4. Push the image to ECR.
5. Create the API service with ECS Express Mode/Fargate:

   ```text
   container port: 3000
   health check path: /health
   NODE_ENV=production
   REQUIRE_DURABLE_PERSISTENCE=true
   SESSION_COOKIE_SECURE=true
   SESSION_COOKIE_SAMESITE=lax
   WEB_ORIGIN=https://<environment-app-domain>
   PLAID_REFRESH_TIME_LOCAL=05:00
   PLAID_REFRESH_TIMEZONE=America/Los_Angeles
   PLAID_REFRESH_SCHEDULER_ENABLED=true
   PLAID_REFRESH_SCHEDULER_MODE=eventbridge
   AWS_ENVIRONMENT_NAME=<staging-or-production>
   AWS_ENVIRONMENT_PROFILE=<staging-or-production>
   ```

6. Inject secrets from Secrets Manager.
7. Enable CloudWatch logs and container metrics.

### 5. Web And Edge

1. Build the web app:

   ```powershell
   npm run build:web
   ```

2. Upload `apps/web/dist` to the S3 web assets bucket.
3. Create one CloudFront distribution:

   - Default origin: S3 web assets.
   - `/v1/*` origin: API service origin.
   - Static assets: cache normally.
   - `/v1/*`: forward required auth/cookie headers and do not use shared caching for authenticated financial API responses.
   - Attach AWS WAF web ACL.
   - Use the ACM certificate for the app domain.

4. Point Route 53 app domain records at CloudFront.

### 6. Scheduler

1. Create an EventBridge Scheduler rule for daily `05:00` `America/Los_Angeles`.
2. Trigger the protected scheduler endpoint or a Fargate task that runs the same refresh code.
3. Pass `PROJECT_JACKSON_SCHEDULER_TOKEN` securely.
4. Confirm duplicate refreshes are prevented by database locks.

### 7. Logs, Alarms, Security, And Cost

1. Enable CloudWatch log retention for API, scheduler, and WAF logs.
2. Create alarms for:

   - API unhealthy target count or failed health checks.
   - API 5xx/error rate.
   - Scheduler failure or missed refresh.
   - RDS CPU/storage/connections.
   - WAF blocked request spikes.

3. Configure AWS WAF:

   - Managed baseline rules.
   - Rate-based rule for abusive request volume.
   - Bot/credential-abuse protections where available and cost-appropriate.

4. Confirm app protections:

   - Secure cookies.
   - CSRF protection for cookie-authenticated writes.
   - XSS-safe rendering and content security headers.
   - Parameterized SQL only.
   - Admin-only diagnostics.
   - API/repository scoping tests pass.
   - Postgres RLS is tracked as deferred hardening.

5. Create AWS Budgets alerts with email and/or SNS notification. Use a lower budget for staging.
6. Confirm budget notification subscription.

## Terraform Comparison

1. Create Terraform under `infra/aws/terraform`.
2. Model the manually created resources:

   - S3 web bucket and policies.
   - CloudFront distribution with default static behavior and `/v1/*` API behavior.
   - WAF web ACL and rate rules.
   - ECR repository.
   - ECS Express Mode/Fargate-equivalent API service resources.
   - RDS PostgreSQL and security groups.
   - Secrets Manager secrets and rotation metadata.
   - EventBridge Scheduler.
   - CloudWatch log groups and alarms.
   - Route 53 records and ACM certificate.
   - AWS Budgets alerts.
   - IAM roles and policies.

3. Run:

   ```powershell
   terraform fmt
   terraform validate
   Copy-Item staging.tfvars.example staging.tfvars
   Copy-Item production.tfvars.example production.tfvars
   terraform plan -var-file staging.tfvars
   terraform plan -var-file production.tfvars
   ```

4. Edit local `staging.tfvars` and `production.tfvars` with real non-secret domains, hosted zone ids, certificate ARNs, and notification emails. Do not commit these files.
5. If AWS credentials or the manual account are not ready yet, stop after `terraform validate`. Do not create AWS resources just to satisfy local validation.
6. Compare staging Terraform plan output to the manual staging environment.
7. Compare production Terraform plan output separately before production apply/import.
8. Document differences in `infra/aws/README.md`.
9. Do not apply Terraform to staging or production until differences are reviewed and no secret values appear in state outputs.

## Environment Verification

1. Visit:

   ```text
   https://<environment-app-domain>/v1/health
   ```

2. Confirm persistence reports durable mode.
3. Sign in through the app domain.
4. Connect Plaid sandbox accounts in staging. Use production Plaid only after staging is approved.
5. Refresh Liquidity.
6. Reopen Liquidity repeatedly and confirm no Plaid call occurs during ordinary reads.
7. Force or simulate a failed refresh and confirm the last successful snapshot still displays with stale/failed status.
8. Trigger the scheduler and confirm the new snapshot is saved.
9. Check:

   ```text
   GET /v1/admin/plaid-refresh-status
   GET /v1/admin/production-readiness
   ```

10. Confirm diagnostics show no secret values.
11. Redeploy the API service and confirm:

   - User sessions/auth flows still work.
   - Plaid connections remain available.
   - Liquidity snapshots remain available.
   - Scheduled refresh still works.

Run this verification for staging first. Production promotion is blocked until staging shows matching routing, WAF/rate limiting, scheduler, private RDS, logs, alarms, budget alerts, diagnostics, and no-shared-cache `/v1/*` behavior.

## Redis Decision

Do not provision Redis for this feature initially. PostgreSQL snapshots provide the speed, durability, freshness rules, historical trend foundation, and locking needed for 5-10 users. Reconsider Redis only if Atlas later needs queue workers, high-concurrency distributed locks, or very high read traffic that Postgres cannot serve comfortably.
