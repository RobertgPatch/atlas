# AWS Liquidity Production Readiness

This checklist defines the launch guardrails for the first AWS Liquidity deployment. It complements the manual runbook in `infra/aws/manual-liquidity-deployment.md` and the Terraform comparison scaffold in `infra/aws/terraform`.

## Launch Gates

| Area | Required Evidence | Status |
|---|---|---|
| Durable data | `/health` reports durable persistence with PostgreSQL reachable | Not checked |
| Secret storage | Production secrets live in Secrets Manager, not committed files | Not checked |
| Stable encryption key | `PERSISTENCE_SECRET_KEY` is configured and retained | Not checked |
| Cookie security | `SESSION_COOKIE_SECURE=true` and `SESSION_COOKIE_SAMESITE=lax` for same-site subdomains | Not checked |
| Allowed origin | `WEB_ORIGIN` matches the public app domain | Not checked |
| API cache boundary | `/v1/*` responses are not shared-CDN cached | Not checked |
| Static caching | S3/CloudFront caches static web assets only | Not checked |
| Plaid token minimization | Ordinary Liquidity reads use saved snapshots and do not call Plaid | Not checked |
| Scheduler | EventBridge Scheduler or accepted manual fallback is documented | Not checked |
| Refresh locking | Duplicate refreshes are prevented for selected account sets | Not checked |
| User/account scoping | API and repository scoping tests pass before launch | Not checked |
| Postgres RLS follow-up | RLS is tracked as deferred hardening after the access model stabilizes | Not checked |
| Logs | API, scheduler, and WAF logs are enabled with retention | Not checked |
| Alarms | Health, error, scheduler, RDS, WAF, and budget alerts are configured | Not checked |
| WAF | Managed rules and rate-based rules are attached to CloudFront | Not checked |
| Cost controls | AWS Budget actual and forecast alerts are confirmed | Not checked |

## Required Runtime Values

Production API tasks must receive these as environment variables or Secrets Manager injections:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=<Secrets Manager>
PERSISTENCE_SECRET_KEY=<Secrets Manager>
REQUIRE_DURABLE_PERSISTENCE=true
WEB_ORIGIN=https://app.example.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
PLAID_CLIENT_ID=<Secrets Manager>
PLAID_SECRET=<Secrets Manager>
PLAID_ENV=sandbox-or-production
PLAID_REFRESH_TIME_LOCAL=05:00
PLAID_REFRESH_TIMEZONE=America/Los_Angeles
PLAID_REFRESH_SCHEDULER_ENABLED=true
PLAID_REFRESH_SCHEDULER_MODE=eventbridge
ATLAS_SCHEDULER_TOKEN=<Secrets Manager>
RATE_LIMIT_ENABLED=true
API_SHARED_CACHE_POLICY=no_shared_cache
AWS_REGION=us-west-2
AWS_APP_DOMAIN=app.example.com
```

## Security Notes

- Do not place Plaid access tokens, database URLs with credentials, scheduler tokens, or `PERSISTENCE_SECRET_KEY` in docs, logs, browser responses, Terraform outputs, or committed env files.
- Use parameterized SQL only.
- Keep admin diagnostics behind existing auth/RBAC.
- Use WAF and app-level rate limits for abusive request volume.
- Treat `PERSISTENCE_SECRET_KEY` as long-lived key material. Rotation requires a migration or re-encryption plan.
- Use Plaid sandbox until the deployment path, refresh behavior, and persistence checks are proven.

## Evidence Log

```text
Date:
Reviewer:
Environment:
App domain:
API image tag:
RDS instance:
CloudFront distribution:
WAF web ACL:
Budget:
Open risks:
```
