# Deploy projectjackson.family

From the current `main` branch, after both GitHub security jobs pass:

```powershell
npm run deploy:aws:production
```

For a read-only check of the live resources, use `npm run deploy:aws:production -- --plan`.
The AWS CLI profile defaults to `atlas-production`; set `ATLAS_DEPLOY_AWS_PROFILE`
to use another authenticated profile for the same account. Docker, Node/npm, Git,
GitHub CLI, AWS CLI and `tar` must be available. No Terraform backend arguments,
release directory, additional approval, or interactive application password is needed.

The release source is an archive of the exact approved `main` commit, so local
edits never enter the build. Both named security jobs must have passed on that
commit's `push` run. The command builds an immutable API image and web assets,
runs short-lived ECS configuration/database checks, saves rollback checkpoints,
updates the API and K-1 worker, publishes the web assets, and verifies the public
site. Database snapshots are created before pending migrations, not for every
code-only release. Release evidence is saved under `.artifacts/live-production-releases/`.

## Actual production target

`infra/aws/live-production-target.json` binds the existing production account,
CloudFront distribution, web bucket, ECS services, and RDS database. The API,
worker, web bucket, and database stay in `us-west-1`. K-1 S3/BDA resources keep
their existing `us-west-2` overrides. Production data is not moved between regions.

Feature 029 (commit `cdadad0`) introduced a planned `us-west-2` Terraform topology
and hardcoded that region into the application and release tooling. The existing
site was never migrated to it. Subsequent hotfixes continued updating the
`project-jackson-production-*` services in `us-west-1`, creating the mismatch.

The former Terraform release script is retained as
`scripts/deployment/deploy-planned-terraform.ps1`; it is an infrastructure migration
tool, not the routine live-site release command. Its descriptor
`infra/aws/production-target.json` describes that planned topology. Do not point
it at the existing state until the split-region resources have been reconciled.

## Runtime compatibility

The application accepts the live California region and the planned Oregon
region. The release supplies the new explicit runtime/rate-limit settings while
retaining existing paid-work ceilings, HMAC key versions, K-1 resources, and
secret references. CloudFront forwards its generated viewer address on API
behaviors and disables health-response caching. The static SPA function and WAF
association are preserved.
Container and internal load-balancer probes use `/internal/readiness`, which
checks the database and is already supported by the previous API revision.
The forwarding policy uses ten headers to fit the default
[CloudFront quota](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html)
and requests the [generated viewer address](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html).

The worker uses `ATLAS_PROCESS_ROLE=k1-worker` and does not need human login
secrets. The HTTP entrypoint rejects that role. A dedicated
`project-jackson-production/SUPER_ADMIN_PASSWORD` is generated inside Secrets
Manager by the small `project-jackson-production-app-bootstrap` stack. Its value
never enters local files or logs. Existing user passwords are not changed by
creating this secret; current main's authentication migrations/bootstrap still
apply. For a newly created Robert account, retrieve its initial credential through
the authenticated AWS Secrets Manager console and complete the application's
required password change.

## Failure recovery

ECS circuit breaking and the release command restore the previous API/worker
revisions on activation failure. The web index is replaced conditionally and
old hashed assets are retained. Public checks cover the web assets, API health,
anonymous-session rejection, a single nonexistent-account login to exercise the
database path, and the deployed commit marker. They do not claim a real user's
MFA/authenticated business flow was tested.

Rollback restores application artifacts, not database data. A snapshot identifier
is recorded when migrations were pending. If another release modifies the same
service or web index concurrently, recovery stops rather than overwriting it;
use the recorded checkpoint to reconcile that release. CloudFront's generated
viewer forwarding remains compatible with the previous API and is retained.
