# Environment Contract

## Supported runtime targets

| Target | Location | Database | Provider mode | Terraform | Mutating deployment command |
|--------|----------|----------|---------------|-----------|-----------------------------|
| `local` | Developer machine | Docker PostgreSQL on localhost | Stub/local by default | None | None |
| `production` | AWS | Private RDS PostgreSQL | Production providers | Required, remote S3 backend | `deploy:aws:production` |

No active AWS target named `development`, `dev`, `staging`, `stage`, `test`, or `preview` is supported.

## Local contract

- `npm run dev:local` is the canonical local startup command.
- Local startup sets or validates development mode and local adapter defaults.
- The default K-1 path uses the stub extractor, local object storage, and the local queue.
- Local database URLs must resolve to loopback or the documented local Docker network.
- Local startup runs ordered database migrations synchronously and requires `/internal/readiness` before the worker or web client starts.
- Database, migration, or readiness failure is fatal; the launcher must not continue with a warning.
- Normal local startup must not initialize Terraform, read production state, or invoke a production AWS mutation.
- If AWS credentials happen to exist in the shell, they do not activate an AWS provider path implicitly.
- Any explicit real-provider developer command is separate from `dev:local`, sandbox-only, and must reject the production account and production resource identifiers.

## Production contract

- `production` is the only value accepted by the root Terraform `environment_name` and `environment_cost_profile` variables.
- `infra/aws/production-target.json` is the committed non-secret authority for production region `us-west-2`, default workspace, and CloudFront certificate region `us-east-1`.
- A supplied `-AwsRegion` is an assertion only. It must equal the target descriptor, ignored production tfvars, provider/plan region, and availability-zone prefix.
- `production.tfvars.example` is the only committed remote-environment variable example.
- The ignored `production.tfvars` is the only variable file used by production deployment.
- Production initialization uses the approved remote S3 backend, KMS encryption, native lockfile, and default workspace.
- Production mutation requires an explicit expected AWS account ID and successful STS verification.
- A merge or push never applies production infrastructure automatically.
- Normal production capacity is one API task and one Single-AZ `db.t4g.micro` database. Zero API capacity exists only in the single-use pre-activation Bootstrap state.
- The production plan must satisfy the documented all-in cost estimate before Apply and include a $125 notification-only AWS Budget.

## Production target authority

The committed descriptor contains no account ID, backend bucket/key, KMS ARN, credentials, or secret value. Account and backend coordinates remain explicit operator inputs and are bound into the release manifest. Every AWS mode hashes and validates the descriptor before using those values. A mismatch or change fails before mutation; it is not resolved by rewriting the descriptor during deployment.

The staged `us-west-1` and AWS-development example changes are not part of this topology. The implementation reconciles them back to the last committed `us-west-2` production baseline unless a later migration feature is approved.

## Governance scope

The topology governance check scans active operational surfaces:

- root and workspace package scripts;
- `.github/workflows/`;
- `scripts/` deployment, security, and local runtime entry points;
- `infra/aws/` current README/runbooks;
- `infra/aws/terraform/` root configuration, modules, examples, and tests;
- current deployment documentation under `docs/deployment/`;
- API/web environment examples and active runtime configuration.

Historical feature directories under `specs/001-*` through `specs/028-*` are excluded from terminology enforcement. Feature 029 artifacts describe the new contract and remain in scope.

## Forbidden active patterns

- `deploy:aws:staging`, `deploy:aws:development`, or equivalent remote commands.
- `deploy-to-aws-staging.ps1` or `deploy-to-aws-development.ps1` as executable entry points.
- `staging.tfvars.example` or `development.tfvars.example` in the Terraform root.
- Root Terraform validation that permits an AWS non-production environment.
- Security tools that require a staging plan to approve production.
- Bounded-abuse or destructive tools that accept `production`.

## Allowed compatibility identifiers

The governance check does not blindly reject every occurrence of `atlas` or `staging`. Persisted database names, cookie names, lock keys, migration identifiers, historical documentation, and existing physical AWS resource names may remain until a dedicated compatibility or state migration is approved. Current operational prose must label these explicitly when retaining a legacy physical identifier.
