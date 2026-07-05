# Research: Plaid Refresh Policy

## Decision: Do not add Redis for the initial refresh policy

**Rationale**: The feature needs durable, dated holdings snapshots, not an ephemeral cache. PostgreSQL already stores Plaid connections, accounts, sync snapshots, and source holdings. For 5-10 users, database reads plus TanStack Query client caching are enough to make Liquidity fast while preserving auditability. Redis would add another production service, operational failure mode, and invalidation problem without materially reducing Plaid usage.

**Alternatives considered**:

- Redis cache in front of Liquidity responses: rejected because cached responses would still need Postgres as the durable source and would complicate freshness/status semantics.
- Redis queue or lock for refresh jobs: rejected for v1 because PostgreSQL advisory locks or row-level locks can prevent duplicate refreshes at this scale.
- In-memory API cache: rejected because it resets on deploy and cannot support historical trends.

## Decision: Treat PostgreSQL snapshots as the Liquidity read source

**Rationale**: The current read path should not call Plaid. Plaid calls should happen only in refresh flows, and a refresh is successful only after the resulting snapshot and source holdings are saved. This makes normal dashboard viewing fast, durable across deploys, and resilient when Plaid is slow or unavailable.

**Alternatives considered**:

- Call Plaid whenever the dashboard opens: rejected because it is slow, rate-limit prone, and prevents reliable historical snapshots.
- Store only aggregate dashboard rows: rejected because account-level source holdings are needed for child rows, diagnostics, exports, and auditability.

## Decision: Use a daily 5:00 AM America/Los_Angeles freshness cutoff

**Rationale**: The user asked for a default daily 5:00 AM PST refresh. Atlas should interpret that as Pacific business time (`America/Los_Angeles`) so the schedule stays at 5:00 AM local time through daylight saving changes. A snapshot is fresh when the latest successful refresh for the selected account set completed after the most recent policy cutoff. Before the cutoff, yesterday's post-cutoff snapshot remains fresh; after the cutoff, it is stale until the scheduled or manual refresh succeeds.

**Alternatives considered**:

- Fixed UTC-8 "PST" year-round: rejected because it would shift to 6:00 AM local time during daylight saving.
- Refresh on every stale read: rejected because page views should not directly create Plaid calls.
- Hourly refresh: rejected because it creates unnecessary Plaid usage for a dashboard where daily freshness is acceptable.

## Decision: Keep historical source holdings instead of replacing rows

**Rationale**: Historical trend reporting requires prior values. The existing repository behavior deletes `source_holdings` for refreshed accounts before inserting the latest values. That must change to append holdings by `sync_snapshot_id` and read only from the latest successful snapshot when building the current Liquidity dashboard.

**Alternatives considered**:

- Keep only the latest row per account/security: rejected because it destroys historical trend inputs.
- Store daily aggregates only: rejected because users still need drill-down account and security detail.
- Keep all snapshots indefinitely without indexes: acceptable temporarily at this scale, but the design should include snapshot/date indexes and allow future retention policy.

## Decision: Use scheduler infrastructure plus database locking for automatic refresh

**Rationale**: A true 5:00 AM refresh requires a trigger even if no user opens Atlas. The smallest infrastructure change is one scheduled job that calls a protected API endpoint or runs the same refresh command in the API environment. PostgreSQL advisory locks or refresh-attempt rows prevent duplicate refreshes if multiple instances or retries overlap.

**Alternatives considered**:

- User-view lazy refresh only: rejected because it does not guarantee a 5:00 AM refresh.
- Redis-backed distributed lock: rejected because Postgres can provide sufficient locking for this scale.
- Separate full worker service: useful later, but more moving parts than needed for one daily job.

## Decision: Expose freshness and scheduler diagnostics

**Rationale**: Users need to know whether displayed values are fresh or stale, and operators need to know if automatic refresh is actually configured. Diagnostics should show the active policy, last attempted refresh, last successful refresh, next expected refresh, scheduler mode, and warnings without exposing Plaid tokens.

**Alternatives considered**:

- Logs only: rejected because users and operators need visible status.
- Hide stale data: rejected because showing last successful data with clear labeling is more useful than an empty dashboard when Plaid fails.

## Decision: Use manual AWS setup first and produce equivalent Terraform

**Rationale**: The user wants to learn the AWS services by creating them manually, but also wants a generated Terraform baseline to compare against the manual work. The plan therefore treats the first environment as a guided manual deployment and requires Terraform artifacts that model the same resources before Terraform becomes the production source of truth.

**Alternatives considered**:

- Manual-only production setup: rejected because it leaves configuration drift and makes rebuilds hard.
- Terraform-only from day one: rejected because it does not meet the user's learning goal.
- AWS CDK: viable, but Terraform better supports side-by-side comparison with manually created resource attributes and is cloud-tooling neutral.

## Decision: Deploy the web app with S3 + CloudFront and route `/v1/*` to the API origin

**Rationale**: The clarified public URL model uses one app domain, static web assets as the default origin, and `/v1/*` routed to the API. CloudFront cache behaviors are designed around path patterns and origins, which makes this model direct and explicit. Static assets can be edge cached aggressively, while authenticated financial API responses can be forwarded without shared CDN caching.

**Alternatives considered**:

- Amplify Hosting for the web app: still viable for a static Vite app, but less direct for learning and comparing the exact single-distribution `/v1/*` routing model.
- Separate app/API subdomains: rejected by clarification.
- Shared CDN caching for Liquidity API responses: rejected because authenticated holdings are user-specific and should not be placed in a shared CDN cache.

## Decision: Use ECS Express Mode/Fargate for the API instead of App Runner

**Rationale**: AWS documentation states App Runner is no longer open to new customers. ECS Express Mode is documented as a simpler ECS path that creates the Fargate service envelope, including load balancer, TLS, autoscaling, monitoring, and networking. Atlas already has a Fastify API that can run as a Node 22 container, making ECS/Fargate an appropriate production baseline.

**Alternatives considered**:

- App Runner: rejected because it is not open to new customers.
- Elastic Beanstalk Node.js: possible, but it adds platform build-hook concerns and is less aligned with the container artifact the user wants to compare in Terraform.
- Lambda/API Gateway: rejected for v1 because the existing API is a long-running Fastify service with startup migrations and cookie/session behavior.

## Decision: Use RDS PostgreSQL, Secrets Manager, and private networking as the durable core

**Rationale**: Atlas already uses `DATABASE_URL` and startup migrations. RDS PostgreSQL provides the managed durable database, while Secrets Manager can store database credentials, Plaid secrets, session secrets, scheduler token, and the stable `PERSISTENCE_SECRET_KEY`. The database should be private with inbound access limited to the API service security group.

**Alternatives considered**:

- Public RDS with IP allowlists: rejected because the API can live inside a VPC and should use security groups.
- SSM Parameter Store for all secrets: viable for simple strings, but Secrets Manager better matches rotation and database credential patterns.
- Local `.env` production secrets: rejected because production secrets must not live in committed or manually copied environment files.

## Decision: Use EventBridge Scheduler for the 5:00 AM refresh

**Rationale**: A true 5:00 AM refresh must run when no user visits the app. EventBridge Scheduler can run recurring ECS/Fargate tasks or call protected scheduler targets. For Atlas, the scheduler should trigger the same refresh command/path used by manual refresh while passing a scheduler token and using database locks to prevent duplicate refreshes.

**Alternatives considered**:

- In-process cron inside the API container: rejected because container restarts and horizontal scaling can create missed or duplicate runs.
- User-view lazy refresh only: rejected because it does not guarantee refresh at 5:00 AM.
- External SaaS cron: unnecessary while AWS provides managed scheduling.

## Decision: Include production guardrails in the first AWS baseline

**Rationale**: The deployment handles financial/auth/Plaid data. First launch must include CloudWatch logs, alarms, health checks, WAF managed rules and rate-based rules, budget alerts, least-privilege IAM, secure headers/cookies, CSRF protections for cookie-authenticated writes, SQL parameterization, no committed secrets, and token rotation policies. These are not later niceties; they are launch gates for a safe baseline.

**Alternatives considered**:

- Add security controls after the app runs: rejected because it risks exposing sensitive workflows during the first deployment.
- Full enterprise security program before launch: rejected because it would over-scope the 5-10 user Liquidity deployment.
- Postgres RLS before first launch: rejected as a blocker because it requires schema ownership review, per-request database session context, service-role exceptions, and policy tests. API/repository scoping is required for launch; RLS is tracked as hardening.

## Decision: Use AWS for both staging and production

**Rationale**: Staging should prove the same deployment shape that production will use: CloudFront with `/v1/*` routing, WAF rules, private RDS access, ECS/Fargate API tasks, EventBridge Scheduler, Secrets Manager, CloudWatch logs/alarms, Route 53/ACM, IAM boundaries, and Terraform comparison. Keeping staging in AWS makes the staging smoke test a real rehearsal for production instead of a cheaper but different hosting path.

Staging should still be cost-conscious. It can use smaller API task sizing, one desired API task, the smallest suitable RDS class, lower storage autoscaling bounds, shorter log retention, lower budget thresholds, sandbox Plaid credentials, force-delete friendly ECR settings, and easier teardown settings where those do not remove the production-like topology or security boundaries. NAT, private RDS, WAF, CloudFront, Scheduler, Secrets Manager, CloudWatch, and no-shared-cache `/v1/*` behavior remain part of staging because they are the controls being rehearsed.

**Alternatives considered**:

- Railway staging with AWS production: rejected because it would not validate AWS networking, IAM, CloudFront/WAF behavior, EventBridge Scheduler, RDS private access, Secrets Manager injection, CloudWatch alarms, or Terraform parity.
- CloudFront generated domain only for staging: acceptable for an early smoke test, but rejected as the staging parity target because cookies, allowed origins, ACM, Route 53, Plaid redirect/domain settings, and user-facing production shape should be validated on a real staging domain.
- Separate Terraform codebases for staging and production: rejected because it invites drift. Use one reusable root stack with separate non-secret tfvars examples.
