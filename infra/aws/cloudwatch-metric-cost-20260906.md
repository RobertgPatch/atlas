# CloudWatch metric-cardinality hotfix — 2026-09-06

## Scope

Operator authorization: Robert asked to apply the CloudWatch metric cost changes and deploy them to `https://projectjackson.family`.

This was an isolated API hotfix. It extends the previously running production image and changes only the compiled abuse-observability module. The repository-wide Terraform topology was not applied because the live service remains in `us-west-1` while the newer topology targets `us-west-2`.

## Change

- Routine health checks and ordinary abuse-protection decisions no longer publish Embedded Metric Format records.
- Successful hourly retention cleanup retains its operational detail as a structured log and no longer creates custom metric series.
- Cleanup failures publish one environment-level `CleanupFailures` metric.
- Actionable abuse-protection signals are limited to four environment-level names: `AbuseProtectionCritical`, `ProviderCalls`, `RetryAttempts`, and `CostUnits`.
- Zero-valued placeholder metrics and request-category dimensions are not emitted.

Exact deployable source commit: `1a3b6e3be0c9330be22f5f0249fa1484684ae654`.

## Production checkpoint and release

- Account: `403454291976`
- Region: `us-west-1`
- ECS cluster/service: `project-jackson-production-cluster` / `project-jackson-production-api`
- Rollback task definition: `project-jackson-production-api:7`
- Rollback image: `sha256:c023f7730dd1dca3df5a59f0ae2e337425240b4af42d6d801274d2a36dcef8da`
- Released task definition: `project-jackson-production-api:8`
- Released image tag: `cloudwatch-metric-cost-20260906-1a3b6e3`
- Released image digest: `sha256:f72207d2d6517ef0d03f611f5d77fe7442bb6feec99874d2ee6d7e4012d61e9e`

Revision 8 was compared with revision 7 before service update; the image digest was the only task-definition change.

## Verification

- Focused source tests: 15 passed.
- Isolated hotfix tests: 9 passed.
- API TypeScript build: passed.
- Terraform tests: 23 passed.
- ECS deployment: `COMPLETED`, desired 1, running 1, pending 0.
- Running task: revision 8, `HEALTHY`, expected image digest.
- Load-balancer target: `healthy`.
- Public `/health` and `/api/health` checks: HTTP 200.
- New-task log audit: 42 initial events, 0 error-like events, 0 CloudWatch EMF envelopes during startup and health checks.

Before deployment, `ProjectJackson/AbuseProtection` had 21 recently active custom series, all produced by the cleanup envelope. CloudWatch can continue listing inactive historical series for up to two weeks; the important billing change is that successful cleanup runs no longer publish new datapoints to them.

The account has zero CloudWatch metric alarms and zero custom dashboards in the checked regions. The ECS cluster still has classic Container Insights enabled, with 63 recently active `ECS/ContainerInsights` series. That setting was not changed by this application hotfix.

## Rollback

If revision 8 shows a regression, update `project-jackson-production-api` in `project-jackson-production-cluster` back to task definition `project-jackson-production-api:7` in `us-west-1`, wait for service stability, then re-run the public health checks.
