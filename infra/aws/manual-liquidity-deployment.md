# Manual AWS Liquidity Deployment Runbook

Use this runbook while creating the first AWS environment by hand. Keep it updated with resource names and validation notes, then compare the result to the Terraform scaffold under `infra/aws/terraform`.

## 0. Preflight

- Choose the primary AWS region for regional services, defaulting to `us-west-2`.
- Choose the public app domain, for example `app.example.com`.
- Confirm billing access, MFA, and permissions for IAM, RDS, ECS, ECR, S3, CloudFront, WAF, Route 53, ACM, Secrets Manager, EventBridge Scheduler, CloudWatch, and AWS Budgets.
- Create an AWS Budget before provisioning compute or database resources.

## 1. DNS And TLS

- Create or confirm the Route 53 hosted zone for the app domain.
- Request an ACM certificate for the app domain in `us-east-1` for CloudFront viewer TLS.
- Validate the certificate with DNS.

Evidence:

```text
Hosted zone id:
ACM certificate ARN:
Validation status:
```

## 2. Network And Database

- Create a VPC with public subnets for public entry points and private subnets for the API and database.
- Create an API service security group.
- Create an RDS security group that allows inbound PostgreSQL `5432` only from the API service security group.
- Create a private RDS PostgreSQL instance.
- Store database credentials in Secrets Manager.

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
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `ATLAS_SCHEDULER_TOKEN`
- `ADMIN_PASSWORD` or invitation bootstrap equivalent
- `USER_PASSWORD` only if the deployment still uses the local bootstrap user flow
- Azure Document Intelligence secrets only when `K1_EXTRACTOR=azure`

Record names or ARNs only:

```text
Database URL secret:
Persistence key secret:
Plaid client id secret:
Plaid secret secret:
Scheduler token secret:
Bootstrap auth secret:
```

## 4. API Container

- Build `apps/api/Dockerfile` locally.
- Push the image to ECR.
- Create the ECS Express Mode/Fargate API service.
- Set container port `3000`.
- Configure the health check for `/health` unless a `/v1/health` alias is added later.
- Inject environment variables and Secrets Manager values.
- Enable CloudWatch logs.

Required production env values:

```text
NODE_ENV=production
PORT=3000
REQUIRE_DURABLE_PERSISTENCE=true
WEB_ORIGIN=https://app.example.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
PLAID_REFRESH_TIME_LOCAL=05:00
PLAID_REFRESH_TIMEZONE=America/Los_Angeles
PLAID_REFRESH_SCHEDULER_ENABLED=true
PLAID_REFRESH_SCHEDULER_MODE=eventbridge
RATE_LIMIT_ENABLED=true
API_SHARED_CACHE_POLICY=no_shared_cache
AWS_REGION=us-west-2
AWS_APP_DOMAIN=app.example.com
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
- Point the app domain to CloudFront.

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
- Trigger the protected scheduler endpoint or an ECS task that runs the same refresh code.
- Pass `ATLAS_SCHEDULER_TOKEN` securely.
- Confirm duplicate refresh attempts are prevented by database locks when Phase 2 and Phase 4 are implemented.

Evidence:

```text
Schedule name/ARN:
Schedule timezone:
Target:
Last run:
```

## 7. Observability, Security, And Cost

- Set CloudWatch log retention for API, scheduler, and WAF logs.
- Create alarms for API health, API 5xx/errors, scheduler failures, RDS CPU/storage/connections, and WAF blocked request spikes.
- Configure WAF managed baseline rules and a rate-based rule.
- Confirm budget alert delivery.
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

- Visit `https://app.example.com/health` or the configured health path.
- Sign in.
- Connect Plaid sandbox accounts.
- Refresh Liquidity.
- Reload Liquidity repeatedly and confirm ordinary reads do not call Plaid.
- Trigger or simulate scheduler refresh.
- Redeploy the API and confirm auth, Plaid state, and Liquidity snapshots persist.
