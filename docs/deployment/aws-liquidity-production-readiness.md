# AWS production readiness

This checklist covers the sole AWS application target, production. Development
runs locally. A release is not authorized merely because repository tests pass.

## Required launch evidence

| Area | Required result |
|---|---|
| Identity | Expected production account and `us-west-2`; operator MFA active |
| State | Preserved backend fingerprint; default workspace; native lock healthy |
| Source | Clean immutable commit and feature 028 included |
| Plan | Exact saved plan; no protected deletion/replacement or naming drift |
| Runtime | One 256/512 x86 API task; durable PostgreSQL readiness |
| Database | Private encrypted Single-AZ `db.t4g.micro`, 20 GiB gp3, deletion protection, 35-day PITR, final snapshot |
| Secrets | Exact contract, one nonempty `AWSCURRENT`, VersionId bound, least-privilege consumers |
| Edge | Private versioned web bucket, CloudFront, WAF, no shared API cache |
| Operations | Scheduler/worker configuration, logs, active-component alarms, alert subscriptions confirmed |
| Cost | Current `us-west-2` estimate at or below $110; $125 Budget notification only |
| Users | Unique Tony and Robert identities, correct roles, MFA, and no shared credentials |
| Governance | WISP, incident process, K-1 inventory, and recovery evidence approved |

Required production runtime values are injected through reviewed Terraform and
Secrets Manager. Non-secret configuration includes `NODE_ENV=production`,
`REQUIRE_DURABLE_PERSISTENCE=true`, secure same-site cookies,
`API_SHARED_CACHE_POLICY=no_shared_cache`, `AWS_REGION=us-west-2`, and
`AWS_ENVIRONMENT_NAME=production`. Secrets include the database URL,
persistence key, session/admin material, scheduler token, and enabled provider
credentials. Never place their values in documentation, Terraform outputs,
logs, commits, or release evidence.

## Activation and smoke behavior

ECS deployment circuit breaker and automatic rollback remain enabled. Stop
activation if Terraform, ECS stability, CloudFront deployment, readiness,
scheduler/worker configuration, logs/alarms, or any named smoke result fails.

The production smoke contract covers every current browser route and the
retained read flows: home/assets, session boundaries, dashboard, saved
liquidity, investment aggregation, TIC properties, entities list/detail,
readiness, and logout. Only reads and session login/logout are permitted. A
provider refresh, upload, export, backfill, or business-data mutation is a
contract failure. Evidence records names and outcomes only; bodies, cookies,
MFA values, and credentials are redacted.

## Recovery readiness

Artifact rollback restores the prior immutable API task definition and
versioned web bundle only. It validates checkpoint integrity and migration-set
compatibility, retains desired count one, waits for ECS and CloudFront, and
reruns the full smoke contract. It never rewinds Terraform state or production
data and never runs a down migration.

Single-AZ recovery can include downtime. Maintain a 15-minute RPO and eight-hour
RTO objective using 35 days of point-in-time recovery, final snapshots, and a
quarterly encrypted restore into an isolated network. Record backup success,
restore timings, integrity checks, and retained-read results before removing the
exercise copy.

## Security review

- Admin diagnostics remain authorized and redacted; SQL stays parameterized.
- `MFA_LOGIN_ENABLED` is the sole login-enforcement switch and must be enabled
  for the named production users before approval.
- Production reads use durable saved Plaid and market data; they never refresh
  a paid provider on read.
- Local destructive/reset/bounded-abuse tools target loopback fixtures only and
  refuse production.
- WAF, application rate limits, cost admission controls, kill switches, and the
  incident runbook are validated before activation.
- Production values and data are never copied into local development.

## Evidence record

Record only non-sensitive identifiers and outcomes:

```text
Date and reviewers:
Source commit and release id:
Account/region/workspace verified:
Plan/policy/cost evidence passed:
Secret VersionId attestation passed:
API/ECS/edge stability passed:
Named smoke checks passed:
Backup/restore evidence current:
Identity/MFA/WISP/K-1 inventory evidence current:
Open risks and explicit operator decision:
```
