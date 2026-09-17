# Database credential synchronization

This isolated CloudFormation stack repairs the missing bridge between the
RDS-managed master secret and the application's copied `DATABASE_URL` secret.
It is separate from the repository-wide Terraform topology: the live database
and ECS services are in `us-west-1`, not the newer `us-west-2` topology.

## Behavior

1. A Secrets Manager `Secret Label Updated` event for the managed secret's
   `AWSCURRENT` label invokes the synchronizer. The rule matches the exact
   secret name, account and region.
2. The function verifies the RDS identity/status, connection host/user/port,
   and both ECS services' secret references. It reads only `AWSCURRENT`.
3. If necessary, it replaces only the URL-encoded password in `DATABASE_URL`
   and verifies the secret by reading it back.
4. It requests fresh ECS deployments only where the primary deployment predates
   the connection-secret version. Images, task definitions, desired counts,
   security rules and user passwords are unchanged.
5. A five-minute reconciliation rule repairs missed events and partial failures.
   Duplicate events do not create new versions or repeat deployments. A worker
   with desired count zero stays off.

Lambda concurrency is one. Execution and delivery retries are bounded; exhausted
failures go to an encrypted SQS queue retained for 14 days. Logs expire after
seven days. Logs/errors never include secret values, connection strings, raw
events or SDK exception text. Two CloudWatch alarms expose execution failures
and queued failures; email/push delivery requires an existing subscribed SNS
topic passed with `--alarm-topic-arn`.

This is automated recovery, **not a zero-downtime rotation guarantee**. New
database connections can fail between rotation and completion of the ECS roll.
If the event is missed, allow the five-minute reconciliation interval plus ECS
startup time. Removing that brief window requires a separate runtime credential
refresh/retry design or alternating application database users.

## Test and deploy

```powershell
python -B -m unittest discover -s infra/aws/database-credential-sync -p test_handler.py
node --test infra/aws/database-credential-sync/template.test.mjs

aws login --profile atlas-production
node scripts/deployment/deploy-database-credential-sync.mjs
node scripts/deployment/deploy-database-credential-sync.mjs --apply
```

Pass `--alarm-topic-arn <existing-approved-topic-arn>` to both plan and apply to
connect alarm notifications. Without it, the alarms are visible in CloudWatch
but do not send messages. The script verifies account `403454291976`, reads only
resource metadata during preflight, and generates non-secret deployment inputs
in `.artifacts/database-credential-sync`. It does not read passwords locally.
It validates the template before applying and deploys only this named stack.

## Post-deployment verification

- Verify CloudFormation completed and both EventBridge rules are enabled.
- Invoke `project-jackson-production-db-credential-sync` twice. If credentials
  already match and deployments are fresh, both should return `status: ok`,
  `secretUpdated: false`, and an empty `servicesRefreshed` list. The first may
  refresh an older worker deployment once.
- Confirm the rule matches a synthetic current-label event for the exact source
  secret, and rejects another secret or `AWSPENDING`.
- Confirm the scheduled invocation runs, failure queue is empty, logs have no
  errors, and API/worker services reach steady state.
- A single synthetic nonexistent-account login should return ordinary HTTP 401,
  not a database-driven HTTP 500. Never log actual passwords or session cookies.
- Do **not** rotate production again merely to test this automation. Local tests
  cover password replacement, encoding, duplicate events, concurrent changes,
  partial service refreshes, identity mismatch, and disabled services.

## Containment

If the handler misbehaves, disable the two rules
`project-jackson-production-db-credential-sync-rotation` and
`project-jackson-production-db-credential-sync-reconcile`. Preserve the failure
queue for investigation. Do not restore an old DATABASE_URL password: RDS has
already invalidated it. Do not disable RDS-managed rotation to hide a failure.

The handler cannot change the managed source secret, database, task definition
or service capacity through its code. IAM limits secret access to the two exact
ARNs and ECS writes to the API/worker service ARNs. AWS requires wildcard resource
scope for the read-only `DescribeTaskDefinition` action; that exception is
restricted to the stack's region.

## AWS references

- [Secrets Manager native event notifications](https://docs.aws.amazon.com/secretsmanager/latest/userguide/secret-event-notifications.html)
- [Matching current-secret changes](https://docs.aws.amazon.com/secretsmanager/latest/userguide/monitoring-eventbridge.html)
- [ECS injected secrets need new tasks after rotation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)
- [RDS-managed password rotation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)

## Implementation status

Prepared and locally tested on September 16, 2026. AWS operator authentication
expired after the immediate outage repair; this stack has not yet been deployed
or cloud-validated. Complete the post-deployment verification before treating
automatic recovery as enabled.
