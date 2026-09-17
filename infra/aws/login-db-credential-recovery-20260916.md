# Production login recovery — 2026-09-16

## Incident and scope

Robert requested urgent recovery of login to `https://projectjackson.family`.
The reported wording was “Blocked by policy”; that exact text was not found in
the deployed frontend, and no authentication-path WAF blocks were found in the
preceding 24 hours. It should not be attributed to a particular policy without
the user's screenshot or browser evidence.

The production API logs did establish a separate, concrete login outage:
`POST /v1/auth/login` returned HTTP 500 with PostgreSQL password-authentication
failures, including at 20:46:22 UTC. The application database username matched
RDS, but the password in the application's DATABASE_URL secret did not match
the current RDS-managed master secret. RDS last rotated at 09:08:49 UTC on
September 16; the copied application secret had last changed September 4 UTC.

## Recovery

- Verified AWS account `403454291976`, region `us-west-1`, and the exact RDS
  endpoint and database username before updating anything.
- Updated only the password component of
  `project-jackson-production/DATABASE_URL` to the current RDS-managed value.
  Secret values were handled in process memory, not logged, written to disk,
  or included in process arguments.
- Previous application-secret version: `b888b2d4-eb49-46cc-ae56-861eb27f3ad7`.
- Repaired application-secret version: `0205f913-43e4-4736-a4ac-7a9ec4e9e905`.
- Verified the new secret with a read-back.
- Forced a rolling deployment of `project-jackson-production-api` in cluster
  `project-jackson-production-cluster`, retaining task definition revision 8.
- No application image, user password, firewall policy, rate limit, database
  contents, or rotation setting was changed. No repository-wide Terraform
  apply was performed. The existing worker service resumed automatically.

The guarded incident script is retained locally at
`.artifacts/login-db-recovery-20260916/recover.mjs`. Its default mode verifies
the mismatch without mutation; `--apply` synchronizes only the verified
connection credential. It does not itself restart services.

## Remaining rotation risk

This is an outage repair, not a completed automatic-rotation integration.
RDS rotation remains enabled. At diagnosis, the next rotation was scheduled
for September 23. A permanent change must make the application consume current
database credentials on connection establishment/refresh, or securely
synchronize the derived connection secret and refresh its ECS consumers when
the managed credential rotates. Validate that separately before the next
rotation. Do not disable rotation or roll the application back to the stale
secret to conceal the issue.

The public health endpoint checks process liveness, not database readiness, so
its HTTP 200 did not prove login was functional. After the replacement API task
became healthy and the old task was draining, a single synthetic nonexistent
account login returned ordinary HTTP 401 `SIGN_IN_FAILED`, not HTTP 500. No real
user password or authenticated session was used for that check.

Following the user's request to automate synchronization, an isolated handler,
CloudFormation template generator, deployment script and tests were added at
`infra/aws/database-credential-sync/`. See its README for current deployment
status; preparing those files does not itself enable cloud automation.
