# AWS Liquidity Production Readiness

This checklist defines the launch guardrails for the AWS Liquidity deployment. It complements the manual runbook in `infra/aws/manual-liquidity-deployment.md` and the Terraform comparison scaffold in `infra/aws/terraform`. Validate staging first, then production.

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
| Environment isolation | Staging and production use separate domains, databases, secrets, scheduler tokens, Plaid credentials, logs, alarms, and budgets | Not checked |
| Staging parity | Staging preserves production topology while documenting only cost-safe allowances | Not checked |

## Required Runtime Values

API tasks in each AWS environment must receive these as environment variables or Secrets Manager injections:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=<Secrets Manager>
PERSISTENCE_SECRET_KEY=<Secrets Manager>
REQUIRE_DURABLE_PERSISTENCE=true
WEB_ORIGIN=https://<environment-app-domain>
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
PLAID_CLIENT_ID=<Secrets Manager>
PLAID_SECRET=<Secrets Manager>
PLAID_ENV=<sandbox-or-production>
PLAID_REFRESH_TIME_LOCAL=05:00
PLAID_REFRESH_TIMEZONE=America/Los_Angeles
PLAID_REFRESH_SCHEDULER_ENABLED=true
PLAID_REFRESH_SCHEDULER_MODE=eventbridge
ATLAS_SCHEDULER_TOKEN=<Secrets Manager>
RATE_LIMIT_ENABLED=true
API_SHARED_CACHE_POLICY=no_shared_cache
AWS_REGION=<aws-region>
AWS_APP_DOMAIN=<environment-app-domain>
AWS_ENVIRONMENT_NAME=<staging-or-production>
AWS_ENVIRONMENT_PROFILE=<staging-or-production>
```

## Security Notes

- Do not place Plaid access tokens, database URLs with credentials, scheduler tokens, or `PERSISTENCE_SECRET_KEY` in docs, logs, browser responses, Terraform outputs, or committed env files.
- Use parameterized SQL only.
- Keep admin diagnostics behind existing auth/RBAC.
- Use WAF and app-level rate limits for abusive request volume.
- Treat `PERSISTENCE_SECRET_KEY` as long-lived key material. Rotation requires a migration or re-encryption plan.
- Use Plaid sandbox until the deployment path, refresh behavior, and persistence checks are proven.
- Use separate staging and production Secrets Manager entries. Staging must not reuse production database URLs, Plaid production credentials, scheduler tokens, session secrets, admin bootstrap credentials, or persistence keys.

## Staging Parity

Staging is allowed to be cheaper than production only in ways that preserve the production rehearsal:

| Control | Staging expectation |
|---|---|
| Domain | Use a real staging domain for parity validation. CloudFront generated domains are only for early smoke testing. |
| API sizing | One desired API task and smaller CPU/memory are acceptable if health checks, auth, and Liquidity flows pass. |
| Database | Smallest suitable private RDS PostgreSQL class is acceptable; public access remains disabled. |
| Retention | Shorter API/scheduler/WAF log retention is acceptable; logs must still exist for validation. |
| Backups | Lower non-production backup retention is acceptable; production keeps production-safe retention. |
| Destruction | Staging may disable deletion protection and skip final snapshots when teardown is intentional. |
| Secrets | Staging uses sandbox Plaid and environment-isolated Secrets Manager values. |
| Budget | Staging uses a lower AWS Budget and confirmed notifications. |
| Routing/security | CloudFront, `/v1/*` no-shared-cache behavior, WAF/rate limiting, private RDS, Scheduler, IAM, and CloudWatch alarms remain enabled. |

## Access Scoping And RLS

PostgreSQL row-level security is deferred hardening for the first Liquidity AWS launch. Launch approval requires API and repository scoping evidence first: run the consolidated holdings identity/scoping tests plus the Plaid refresh policy and production-readiness diagnostics tests before promoting the API image.

Track RLS as a follow-up once the user, entity, Plaid connection, and account access model is stable. Until then, the app-visible production-readiness endpoint must continue to report `apiRepositoryScoping=required_passed` and `postgresRls=deferred_hardening`.

## Production Validation

Run these checks before launch and after each infrastructure change:

| Control | Validation |
|---|---|
| Logs | API service, Plaid refresh task, WAF, and scheduler logs exist with retention configured. |
| Alarms | Health, API 5xx, scheduler failure, RDS CPU/storage/connections, WAF blocked requests, and budget alerts are configured. |
| WAF and DDoS baseline | CloudFront has WAF managed rules, a rate-based rule, and AWS Shield Standard coverage through CloudFront. |
| App rate limiting | `RATE_LIMIT_ENABLED=true` and production-readiness diagnostics report `rateLimitConfigured=true`. |
| Budget alerts | AWS Budget actual thresholds are configured and notification subscription is confirmed. |
| Secret storage | Runtime secrets are injected from Secrets Manager. No production `.env`, tfvars, state, or copied secret files are committed. |
| Environment isolation | Staging and production resource names, domains, databases, secret namespaces, scheduler tokens, logs, and budgets are distinct. |
| Staging parity | Staging evidence proves the same routing, scheduler, private database, WAF, logs, alarms, and diagnostics before production promotion. |
| Secret rotation | RDS rotation is enabled or scheduled; Plaid/session/scheduler rotation runbooks exist; `PERSISTENCE_SECRET_KEY` rotation is emergency-only with a re-encryption plan. |
| CSRF and cookies | Cookie-authenticated write paths use same-site secure cookies and origin controls. |
| XSS | React-rendered user data remains escaped; no unsafe HTML rendering is introduced. |
| SQL injection | Database access uses parameterized SQL and repository-scoped queries. |
| Token minimization | Ordinary Liquidity reads use saved snapshots and do not call Plaid; diagnostics and exports do not include Plaid access tokens. |

## No-Secret Verification

Before committing deployment changes, run local secret scans and review the diff:

```powershell
git diff --check
git grep -n -I -E "AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|postgres://[^[:space:]]+:[^[:space:]]+@" -- .
```

Expected result: no real credentials. Placeholder strings such as `<Secrets Manager>` or `app.example.com` are acceptable.

Latest local result on 2026-07-04: scan matched only local-development Postgres placeholders, the documented scan command, and no production credentials.

## Evidence Log

```text
Date:
Reviewer:
Environment:
App domain:
Cost profile:
API image tag:
RDS instance:
CloudFront distribution:
WAF web ACL:
Budget:
Open risks:
```
