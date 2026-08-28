# Manual AWS Liquidity Deployment Runbook

Use this runbook while creating AWS environments by hand. Create `staging` first, validate it, then repeat the same topology for `production`. Keep the runbook updated with resource names and validation notes, then compare each environment to the Terraform scaffold under `infra/aws/terraform`.

## Environment Order

| Environment | Purpose | Example domain | Cost profile |
|---|---|---|---|
| `staging` | Production rehearsal with sandbox Plaid credentials | `staging.example.com` | Cheaper sizing, shorter retention, lower budget |
| `production` | Real user traffic and production Plaid credentials when approved | `app.example.com` | Production-safe retention, deletion protection, budget |

Staging must keep the same core shape as production: CloudFront, `/v1/*` API routing, WAF/rate limiting, ECS/Fargate API, private RDS, isolated Secrets Manager entries, EventBridge Scheduler, CloudWatch logs/alarms, Route 53/ACM, IAM boundaries, and AWS Budgets.

## 0. Preflight

- Choose the primary AWS region for regional services, defaulting to `us-west-2`.
- Choose separate public app domains, for example `staging.example.com` and `app.example.com`.
- Confirm billing access, MFA, and permissions for IAM, RDS, ECS, ECR, S3, CloudFront, WAF, Route 53, ACM, Secrets Manager, EventBridge Scheduler, CloudWatch, and AWS Budgets.
- Create AWS Budgets before provisioning compute or database resources. Use a lower staging budget and a production launch budget.
- Keep this runbook open while using the AWS console. Record names, ARNs, and ids only; never paste secret values.
- Prepare these local values before opening the console:
  - environment name: `staging` first, then `production`
  - app domain for the target environment
  - AWS region
  - Plaid sandbox credentials for staging; production credentials only for production
  - long random `PERSISTENCE_SECRET_KEY`
  - long random `SESSION_SECRET`
  - long random `ATLAS_SCHEDULER_TOKEN`
  - admin bootstrap password

Environment evidence:

```text
Environment:
Cost profile:
App domain:
Terraform var file:
Budget limit:
```

## 1. DNS And TLS

- In Route 53, create or confirm the hosted zone that owns the environment app domain.
- In ACM `us-east-1`, request a public certificate for the environment app domain. CloudFront viewer certificates must be in `us-east-1`.
- Add the ACM DNS validation record to Route 53 and wait for the certificate to become `Issued`.
- Do not create the CloudFront distribution until the certificate is issued.
- The generated CloudFront domain is acceptable for an early smoke test, but staging parity validation should use the staging app domain.

Evidence:

```text
Hosted zone id:
ACM certificate ARN:
Validation status:
```

## 2. Network And Database

- Create a VPC with at least two Availability Zones.
- Create public subnets for the API load balancer and NAT gateway.
- Create private subnets for ECS API tasks and RDS.
- Create an internet gateway for the public subnets.
- Create a NAT gateway or equivalent private egress so API tasks can reach ECR, Secrets Manager, CloudWatch, Plaid, and other AWS APIs.
- Create an API load-balancer security group with inbound HTTP/HTTPS from the CloudFront/API-origin boundary you choose.
- Create an API task security group with inbound API traffic only from the load-balancer security group.
- Create an RDS security group that allows inbound PostgreSQL `5432` only from the API task security group.
- Create private RDS PostgreSQL with public access disabled, encrypted storage, and backups.
- Enable deletion protection for production. Staging may disable deletion protection and skip the final snapshot when teardown speed is intentionally preferred.
- Store the RDS credentials in Secrets Manager or enable RDS-managed master-password storage.

Evidence:

```text
VPC id:
Private subnet ids:
API security group id:
RDS security group id:
RDS endpoint:
Database secret ARN:
```

## 3. Runtime Secrets

Create Secrets Manager entries for:

- `DATABASE_URL`
- `PERSISTENCE_SECRET_KEY`
- `SESSION_SECRET`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `ATLAS_SCHEDULER_TOKEN`
- `ADMIN_PASSWORD`
- `USER_PASSWORD` only if the deployment still uses the local bootstrap user flow

Use an environment-qualified namespace such as `atlas-staging/...` or `atlas-production/...`. Do not reuse production secrets, Plaid production credentials, scheduler tokens, admin bootstrap credentials, or databases in staging.

Record names or ARNs only:

```text
Database URL secret:
Persistence key secret:
Session secret:
Plaid client id secret:
Plaid secret secret:
Plaid env secret:
Scheduler token secret:
Bootstrap auth secret:
```

## 4. API Container

- Build `apps/api/Dockerfile` locally.
- Push the image to ECR.
- Create the ECR repository if Terraform has not already modeled it.
- Authenticate Docker to ECR and push the API image tag selected for launch.
- Create the ECS Express Mode/Fargate API service or equivalent ECS/Fargate service envelope.
- Set container port `3000`.
- Configure the health check for `/health` unless a `/v1/health` alias is added later.
- Inject environment variables and Secrets Manager values.
- Enable CloudWatch logs.

Required environment values:

```text
NODE_ENV=production
PORT=3000
REQUIRE_DURABLE_PERSISTENCE=true
WEB_ORIGIN=https://<environment-app-domain>
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
PLAID_REFRESH_TIME_LOCAL=05:00
PLAID_REFRESH_TIMEZONE=America/Los_Angeles
PLAID_REFRESH_SCHEDULER_ENABLED=true
PLAID_REFRESH_SCHEDULER_MODE=eventbridge
RATE_LIMIT_ENABLED=true
API_SHARED_CACHE_POLICY=no_shared_cache
AWS_REGION=<aws-region>
AWS_APP_DOMAIN=<environment-app-domain>
AWS_ENVIRONMENT_NAME=<staging-or-production>
AWS_ENVIRONMENT_PROFILE=<staging-or-production>
```

Staging may use smaller API task CPU/memory, one desired API task, shorter log retention, lower storage autoscaling bounds, and lower budgets. Keep private RDS, Scheduler, WAF, CloudWatch logs, and `/v1/*` no-shared-cache behavior enabled.

Required runtime secrets:

```text
DATABASE_URL
PERSISTENCE_SECRET_KEY
SESSION_SECRET
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV
ATLAS_SCHEDULER_TOKEN
ADMIN_PASSWORD
USER_PASSWORD only if local bootstrap users are still enabled
```

Evidence:

```text
ECR repository URI:
Image tag:
ECS service name/ARN:
Task role ARN:
Execution role ARN:
Log group:
Health check result:
```

## 5. Web And Edge

- Build the web app with same-origin API routing when using one app domain.
- Upload `apps/web/dist` to the S3 web assets bucket.
- Create one CloudFront distribution:
  - default origin: S3 web assets
  - `/v1/*` origin: API service origin
  - static assets: cache normally
  - `/v1/*`: forward required auth/cookie headers and disable shared caching
- Attach the WAF web ACL.
- Point the environment app domain to CloudFront.
- Confirm CloudFront returns security/no-store headers on `/v1/*` responses and caches only static web assets.

Evidence:

```text
S3 bucket:
CloudFront distribution id:
CloudFront domain:
WAF web ACL ARN:
Route 53 record:
```

## 6. Scheduler

- Create an EventBridge Scheduler schedule for daily `05:00` in `America/Los_Angeles`.
- Use an ECS RunTask target that runs the API image command `node dist/scripts/run-plaid-refresh.js`.
- Run the task in private subnets with the API task security group and the same runtime secrets as the API service.
- Confirm the scheduled task logs a terminal refresh attempt and exits.
- Confirm duplicate refresh attempts are prevented by database locks.
- Create the weekday `16:20` `America/New_York` market-price schedule after
  populating the Alpaca key id and secret in Secrets Manager.
- Use the separate ECS RunTask command
  `node dist/scripts/run-market-price-refresh.js` and confirm it logs refreshed
  and missing symbol counts.

Evidence:

```text
Schedule name/ARN:
Schedule timezone:
Target:
Last run:
Market price schedule name/ARN:
Market price last run:
```

## 7. Observability, Security, And Cost

- Set CloudWatch log retention for API, scheduler, and WAF logs.
- Create alarms for API health, API 5xx/errors, scheduler failures, RDS CPU/storage/connections, and WAF blocked request spikes.
- Configure WAF managed baseline rules and a rate-based rule.
- Confirm API app-level rate limiting is enabled with `RATE_LIMIT_ENABLED=true`.
- Confirm CloudFront and WAF provide a basic DDoS/abuse baseline. AWS Shield Standard is automatic for CloudFront, and WAF rate rules handle application-volume spikes.
- Confirm budget alert delivery for the target environment.
- Confirm app diagnostics return no secret values.

Evidence:

```text
Alarm names:
Budget name:
Budget notification destination:
WAF rate rule:
Diagnostic endpoints checked:
```

## 8. Final Smoke Test

- Visit `https://<environment-app-domain>/health` or the configured health path.
- Sign in.
- Connect Plaid sandbox accounts in staging. Use production Plaid only after staging evidence is approved.
- Refresh Liquidity.
- Reload Liquidity repeatedly and confirm ordinary reads do not call Plaid.
- Trigger or simulate scheduler refresh.
- Redeploy the API and confirm auth, Plaid state, and Liquidity snapshots persist.
- Check `GET /v1/admin/plaid-refresh-status` and `GET /v1/admin/production-readiness` as an admin.
- Confirm anonymous users cannot access admin diagnostics and non-admin users receive `403`.

## 9. Terraform Comparison

- Run `terraform plan -var-file staging.tfvars` with sanitized local variables after staging manual AWS resources exist.
- Run `terraform plan -var-file production.tfvars` separately before production manual resources are applied or imported.
- Compare each console-created resource to the matching Terraform address in `infra/aws/README.md`.
- Record intentional differences and decide whether Terraform should import, replace, or leave each resource manual.
- Do not apply Terraform to staging or production until the comparison has been reviewed and Terraform state/output handling is confirmed not to expose secrets.
