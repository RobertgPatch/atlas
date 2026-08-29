# AWS production deployment and recovery runbook

Development runs locally with Docker PostgreSQL and deterministic adapters.
This runbook operates the sole AWS application target: production. Historical
or physical `Atlas` and `ProjectJackson` identifiers are retained for state and
resource continuity; they are not additional environments.

## Safety boundary

- Use a clean immutable commit, the default Terraform workspace, `us-west-2`,
  the committed target descriptor, and the preserved backend coordinates.
- Keep real `production.tfvars`, credentials, state, raw plan JSON, smoke
  credentials, and release bundles ignored and access-restricted.
- Do not copy production data or credentials to local development.
- Do not run ad hoc `terraform apply`. Apply only the reviewed saved plan bound
  to the immutable release manifest.
- Bootstrap, Apply, and Rollback are operator-confirmed production mutations.
  Repository implementation and fixture tests do not authorize them.

## Before preparing a release

1. Confirm feature 028 is merged and the release branch is based on current
   `origin/main`; require a clean source commit.
2. Verify the production AWS account, operator MFA session, `us-west-2`, default
   workspace, backend fingerprint, certificate region, and monitored alert and
   budget destinations.
3. Copy `terraform/production.tfvars.example` to the ignored
   `terraform/production.tfvars`. Supply only operator-owned non-secret values.
4. Confirm every required Secrets Manager entry has exactly one nonempty
   `AWSCURRENT` version, no pending deletion, the expected account/region, and
   least-privilege consumer wiring. Values stay in memory and out of evidence.
5. Confirm the $104 upper cost estimate, $110 release ceiling, and notification-
   only $125 Budget using current public `us-west-2` prices.

## Plan, prepare, and apply

Run the repository gates, then the non-mutating plan:

```powershell
npm ci
npm run security:environment-topology
npm run security:production-smoke-contract
npm run test:production:policy
npm run test:production:cost
npm run test:production:deployment
npm run deploy:aws:production -- -Mode Plan
```

Stop if the state is unexpectedly empty; a deletion or replacement appears; a
protected resource, physical name, region, backend, workspace, secret version,
or source hash drifts; a safeguard is missing; or the cost validator fails.

Prepare the immutable release:

```powershell
npm run deploy:aws:production -- -Mode Prepare
```

Review the redacted manifest, exact saved-plan hash, image commit tag, web
archive hash, migration-set hash, secret VersionIds, cost evidence, and policy
result. Apply only that release using `-Mode Apply` and type the prompted
`DEPLOY PRODUCTION` confirmation. The script applies the saved plan, activates
only the prepared artifacts, waits for ECS/CloudFront, runs the full read-only
smoke contract, and appends an execution record.

`-Mode Bootstrap` is permitted once for an empty approved backend. It requires
`BOOTSTRAP PRODUCTION`, a create-only saved plan, API capacity zero, disabled
workers/schedules, and no web activation. Refuse replay.

## Smoke contract

The ordered smoke suite checks edge home/assets; anonymous and authenticated
session boundaries; dashboard; saved liquidity; investment aggregation; TIC
properties; entity list/detail; readiness; and logout. It permits only reads
plus session login/logout. It must never refresh Plaid/market providers, upload,
export, backfill, or mutate business data. Credentials and MFA are entered
securely and never written to evidence.

Any Terraform, ECS, edge, readiness, log/alarm, or named smoke failure stops
activation. Preserve its redacted append-only record.

## Artifact rollback

1. Allow ECS automatic circuit-breaker recovery to settle.
2. Select the last known-good checkpoint whose manifest, bundle hashes, and
   migration-set SHA all validate.
3. Run `-Mode Rollback` and enter
   `ROLLBACK PRODUCTION TO <previous-release-id>` exactly.
4. Restore the prior immutable task definition and versioned web bundle, keep
   API desired count one, wait for stability, and rerun the complete smoke suite.

Rollback never runs Terraform, rewinds state, executes down migrations, restores
RDS, or deletes resources. A schema mismatch requires a separate reviewed data-
recovery decision.

## Database and state recovery

The database is private encrypted Single-AZ RDS with deletion protection, 35
days of point-in-time recovery, and final snapshots. The objectives are
15-minute RPO and eight-hour RTO. Exercise a quarterly isolated encrypted
restore, validate database integrity and retained reads, record elapsed times,
and delete the exercise resources only after operator review.

For an abandoned native S3 state lock, first prove no Terraform process is
active. Confirm the exact production backend and lock ID before force-unlock.
Never switch state keys or delete lock objects as a shortcut.

## Post-activation checks

- Confirm one healthy API task, private RDS connectivity, edge routing, WAF,
  scheduler/worker configuration, required logs, alarms, and confirmed Budget.
- Check Cost Explorer after 7 and 30 days and investigate a projected month over
  $110 before changing capacity.
- Confirm named smoke results contain status/shape only, never bodies, cookies,
  tokens, credentials, or account data.
- Reconcile any emergency console action immediately into reviewed Terraform.
