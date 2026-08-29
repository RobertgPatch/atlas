# Quickstart: Local Development to AWS Production

This guide describes the target workflow after feature 029 is implemented. Development runs locally. AWS has one active application environment: production.

## 1. Protect current local infrastructure files

The repository currently has ignored account-specific files, including `staging.tfvars`, `production.tfvars`, and local Terraform state backups. Do not print, commit, rename, overwrite, or delete them during feature implementation.

Confirm Git does not track them:

```powershell
git ls-files infra/aws/terraform | Select-String -Pattern '\.tfvars$|\.tfstate|\.tfplan'
```

Expected: no real `.tfvars`, state, or plan file. Sanitized `*.tfvars.example` files are allowed.

Confirm the feature branch and inspect changes without exposing ignored files:

```powershell
git branch --show-current
git status --short
git diff --cached --stat
```

Expected branch: `029-local-dev-aws-production`.

After feature 028 merges, rebase before implementing or finalizing this plan:

```powershell
git fetch origin
git rebase origin/main
```

Commit or safely stash feature-029 working changes before rebasing. Do not drop the original infrastructure stashes until the reconciled implementation is committed and validated.

## 2. Run local development

Install dependencies and start the local environment:

```powershell
npm ci
npm run dev:local
```

The implemented command must start:

- Docker PostgreSQL on `127.0.0.1:15432`;
- the Fastify API on `http://localhost:3000`;
- the Vite web app on `http://localhost:5173`;
- the durable worker using the local queue;
- stub extraction and local object storage by default.

The launcher must run migrations synchronously and require `/internal/readiness` before starting the worker or web app. A database, migration, or readiness failure exits nonzero rather than warning and continuing. It must not initialize Terraform or call production AWS resources.

Verify health:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/internal/readiness
```

### Local production-safety negative test

The implementation must include fixture-backed tests showing the local preflight rejects:

- a non-loopback production database URL;
- production AWS environment markers;
- production S3/SQS/BDA identifiers;
- an explicit production account in a real-provider local command;
- a production mutation flag passed to a local command.

No negative test may use real production credentials or endpoints.

### Implementation evidence (2026-08-29)

The local acceptance run used a uniquely named disposable PostgreSQL 16
container with a loopback ephemeral port. It did not stop, reset, mount, or
read the existing `atlas-postgres` container or volume. All temporary processes
and the disposable container were removed after the checks.

Sanitized commands and outcomes:

```powershell
# DATABASE_URL used 127.0.0.1:<ephemeral-port> and a disposable database.
npm run --workspace=api migrate
npm run --workspace=api migrate
# PASS: 42 ordered migrations on the clean database; second run applied none.

Invoke-RestMethod http://127.0.0.1:<test-port>/internal/readiness
# PASS: status=ready and databaseReachable=true.

# After a local fixture login, read-only GET requests returned 200 for:
# /v1/dashboard
# /v1/reports/consolidated-holdings
# /v1/reports/consolidated-holdings/performance
# /v1/partnership-tracker/partnerships
# /v1/partnership-tracker/aggregation
# /v1/tic-registry/properties
# /v1/entities

npm run test:current-surface
# PASS: 1 file, 1 test.

npm run test:local-boundary
# PASS: 2 API files / 21 tests and the PowerShell launcher fixture suite.
```

The refusal suite covered non-loopback databases, explicit production runtime
markers, AWS-backed adapters and resource identifiers, a production profile or
matching production account, production Terraform markers, mutation flags,
migration failure, and readiness timeout. The fixtures used synthetic values
and made no AWS calls.

## 3. Run repository and Terraform gates

Application gates:

```powershell
npm run security:audit:runtime
npm run security:cost-envelope
npm run security:route-policy
npm run build:api
npm run build:web
npm run test:api
npm run test:web
npm run test:current-surface
npm run test:pruning
npm run check:web-reachability
```

Feature-029 governance and deployment self-tests, after implementation:

```powershell
node --test scripts/security/validate-environment-topology.test.mjs
node scripts/security/validate-environment-topology.mjs
node scripts/security/validate-production-smoke-contract.mjs
powershell -ExecutionPolicy Bypass -File scripts/security/production-plan-policy.test.ps1
powershell -ExecutionPolicy Bypass -File scripts/security/validate-production-plan.test.ps1
powershell -ExecutionPolicy Bypass -File scripts/security/validate-terraform-guardrails.test.ps1
powershell -ExecutionPolicy Bypass -File scripts/deployment/production-release.test.ps1
```

Terraform CI-equivalent gates:

```powershell
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false -input=false
terraform -chdir=infra/aws/terraform validate -no-tests
terraform -chdir=infra/aws/terraform test
```

Build the production-shaped Linux API image to validate the Dockerfile and pinned RDS CA bundle:

```powershell
docker build --platform linux/amd64 -f apps/api/Dockerfile -t project-jackson-api:feature-029-check .
```

This local image is validation only and is not a production release.

### Direct-production implementation evidence (2026-08-29)

The repository-only acceptance run made no STS, ECR, S3, ECS, CloudFront, or
Terraform Apply call. Sanitized outcomes:

```powershell
npm run test:production:deployment
# PASS: release primitives, live-secret fixtures, and fixture Plan/Bootstrap/
# Prepare/exact-artifact Apply boundaries.

npm run test:production:policy
# PASS: shared policy core and the single-delegation release adapter.

npm run test:production:cost
# PASS: 4 fixture-rate, arithmetic, workload-drift, and fail-closed tests.

terraform -chdir=infra/aws/terraform test
# PASS: 19 tests, 0 failed.

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/deployment/production-shape.test.ps1 `
  -SkipBuild -ImageTag atlas-api:feature-029-production-shape
# PASS: linux/amd64, 0.25 vCPU, 0.5 GiB, migrations, readiness, seven
# retained authenticated reads, and checksum-pinned RDS CA bundle.
```

Fixture Bootstrap remained create-only with API/workers zero, schedules
disabled, and no web activation. Fixture Prepare permitted only the immutable
image push boundary. Fixture Apply accepted only matching target/backend/source/
tfvars/plan hashes and did not regenerate the plan.

Recovery fixtures then injected activation, checkpoint, migration, and smoke
failures. All fourteen ordered smoke result names failed closed independently
without persisting response bodies, cookies, passwords, or MFA input.
Compatible artifact-only Rollback accepted the exact checkpoint and
confirmation; missing, corrupted, or migration-incompatible checkpoints failed.
The fixture proved Rollback has no Terraform Apply or database-mutation
capability and that the complete smoke contract is rerun after restoration.

## 4. Verify the environment topology

After implementation, the active entry points must include:

```text
dev:local
deploy:aws:production
```

They must not include:

```text
deploy:aws:staging
deploy:aws:development
dev:local:bda                         # unless redesigned as explicit non-production sandbox-only tooling
```

The Terraform root must contain:

```text
production.tfvars.example
```

It must not contain active remote examples for staging or development.

Historical specs may still mention staging and are not governance failures.

Implementation result on 2026-08-29:

```text
PASS environment topology: 1 local, 1 production, 0 staging, 0 AWS development.
PASS production smoke contract covers 13 browser routes and 14 named checks.
PASS Terraform native tests: 19 passed, 0 failed.
```

The topology scan reads only tracked or non-ignored active surfaces, skips
historical specifications and fixtures, and never reads ignored operator tfvars
or state.

## 5. Prepare production configuration

The committed non-secret `infra/aws/production-target.json` is authoritative for production region `us-west-2`, Terraform workspace `default`, and CloudFront certificate region `us-east-1`. Do not edit it to make a command pass. A target change is a reviewed migration and invalidates prepared releases.

If an ignored `production.tfvars` already exists, review it in place and do not overwrite it. Otherwise, create it from the sanitized example:

```powershell
Copy-Item infra/aws/terraform/production.tfvars.example infra/aws/terraform/production.tfvars
```

Set only account-specific, non-secret production values in the ignored file. Secret values belong in Secrets Manager, not tfvars.

Production values must preserve the approved existing:

- AWS region;
- availability zones and network ranges;
- physical resource prefix when changing it would replace resources;
- remote state bucket, key, region, and KMS key;
- production domain and Route 53/ACM configuration.

The ignored tfvars region and every availability zone must agree with the committed target descriptor. The staged `us-west-1` example is unapproved drift and must not be used as an authority.

The implementation must not copy values from the ignored legacy `staging.tfvars` automatically.

## 6. Run a production plan without applying

Use placeholders or operator-supplied environment variables for account-specific identifiers. Do not commit them.

```powershell
npm run deploy:aws:production -- `
  -Mode Plan `
  -AwsProfile '<production-profile>' `
  -AwsRegion 'us-west-2' `
  -ExpectedAccountId '<12-digit-production-account>' `
  -TerraformStateBucket '<production-state-bucket>' `
  -TerraformStateKey '<existing-production-state-key>' `
  -TerraformStateKmsKeyArn '<production-state-kms-key-arn>'
```

Plan mode must finish with:

```text
PLAN ONLY: no production resources or application artifacts were changed.
```

Stop immediately if the plan or preflight reports:

- the wrong account, region, backend, workspace, or environment;
- a new empty state when production resources already exist;
- a region change;
- a backend key change;
- deletion or replacement;
- unexpected physical resource renaming;
- missing alarm/budget destinations;
- disabled RDS/ALB deletion protection;
- mutable production ECR tags;
- missing ECS rollback;
- plaintext secrets;
- an unpriced recurring resource or estimate above $110;
- a Budget action or threshold other than notification-only $125.

## 7. Bootstrap a new production shell only when required

Bootstrap is for an initial authoritative production state that does not yet expose ECR or edge outputs. It creates infrastructure with application workloads inactive.

```powershell
npm run deploy:aws:production -- `
  -Mode Bootstrap `
  -AwsProfile '<production-profile>' `
  -AwsRegion 'us-west-2' `
  -ExpectedAccountId '<12-digit-production-account>' `
  -TerraformStateBucket '<production-state-bucket>' `
  -TerraformStateKey '<existing-production-state-key>' `
  -TerraformStateKmsKeyArn '<production-state-kms-key-arn>' `
  -ReleaseDirectory '.artifacts/production-releases/<release-id>'
```

Review the saved bootstrap plan and type the exact requested confirmation only when every create action is expected. Bootstrap must not activate API tasks, schedulers, workers, or web delivery. It is allowed only when state contains no API service and no successful activation checkpoint. A second Bootstrap or an attempt to reduce an existing API service from one to zero must fail.

If production state already contains infrastructure, do not use Bootstrap to create a second stack.

## 8. Prepare an immutable production release

Preparation requires a clean committed worktree:

```powershell
git status --short
git rev-parse HEAD
```

Then prepare:

```powershell
npm run deploy:aws:production -- `
  -Mode Prepare `
  -AwsProfile '<production-profile>' `
  -AwsRegion 'us-west-2' `
  -ExpectedAccountId '<12-digit-production-account>' `
  -TerraformStateBucket '<production-state-bucket>' `
  -TerraformStateKey '<existing-production-state-key>' `
  -TerraformStateKmsKeyArn '<production-state-kms-key-arn>' `
  -ReleaseDirectory '.artifacts/production-releases/<release-id>'
```

Prepare may push the new immutable ECR image after confirming identity. It must not apply Terraform, update ECS, upload the web bundle, invalidate CloudFront, or run database mutations.

Review only the redacted evidence:

- release manifest;
- saved plan SHA-256;
- redacted plan summary;
- production plan policy result;
- source commit;
- API tag and ECR digest;
- web archive and file-manifest hashes;
- migration inventory;
- previous rollback checkpoint;
- production target descriptor hash;
- secret contract hash and redacted VersionId attestation;
- itemized cost estimate at or below $110 with the $125 notification-only Budget.

Never print or commit the opaque plan or raw plan JSON.

## 9. Apply the reviewed release

Apply the exact prepared manifest:

```powershell
npm run deploy:aws:production -- `
  -Mode Apply `
  -AwsProfile '<production-profile>' `
  -AwsRegion 'us-west-2' `
  -ExpectedAccountId '<12-digit-production-account>' `
  -TerraformStateBucket '<production-state-bucket>' `
  -TerraformStateKey '<existing-production-state-key>' `
  -TerraformStateKmsKeyArn '<production-state-kms-key-arn>' `
  -ReleaseManifestPath '.artifacts/production-releases/<release-id>/release-manifest.json'
```

The script must verify every identity and hash again, then request:

```text
DEPLOY PRODUCTION <short-source-commit>
```

No other response applies the plan.

Before confirmation, Apply must repeat live secret checks and reject any `AWSCURRENT` VersionId drift without logging values. Success requires:

- exact saved-plan apply succeeds;
- ECS reaches a completed stable deployment;
- CloudFront health succeeds;
- homepage and hashed assets succeed through CloudFront;
- anonymous session is rejected, secure login/session succeeds, and logout invalidates the session;
- `GET /v1/dashboard` succeeds;
- saved liquidity holdings and performance reads succeed without provider refresh;
- investment aggregation, TIC properties, and entities list/conditional detail reads succeed;
- database connectivity is healthy;
- schedulers/workers have the intended enabled state;
- required logs and alarms are visible;
- exact web bundle upload and invalidation succeed.

## 10. Roll back application artifacts

If activation fails and ECS automatic rollback does not fully restore service:

```powershell
npm run deploy:aws:production -- `
  -Mode Rollback `
  -AwsProfile '<production-profile>' `
  -AwsRegion 'us-west-2' `
  -ExpectedAccountId '<12-digit-production-account>' `
  -TerraformStateBucket '<production-state-bucket>' `
  -TerraformStateKey '<existing-production-state-key>' `
  -TerraformStateKmsKeyArn '<production-state-kms-key-arn>' `
  -ReleaseManifestPath '.artifacts/production-releases/<failed-release-id>/release-manifest.json'
```

Rollback restores the prior API and web artifacts only. It does not automatically:

- reverse Terraform state;
- restore an RDS snapshot;
- run down migrations;
- delete newly created infrastructure.

If schema compatibility prevents the prior application from running, stop and use the separately approved database recovery procedure.

## 11. Implementation completion evidence

Feature implementation is complete when repository-only verification records:

- local development works with no required AWS calls;
- topology governance finds one production deploy target and no AWS staging/development target;
- all application and Terraform CI gates pass;
- all identity, hash, policy, confirmation, and sensitive-output negative fixtures pass;
- Docker build succeeds;
- Prepare/Apply/Rollback fixture simulations pass without AWS mutation;
- a real production speculative plan is reviewed and contains no deletion, replacement, region move, backend move, or unexpected physical rename;
- the production-shaped 0.25 vCPU/0.5 GiB API image completes migrations, readiness, and retained reads;
- the all-in `us-west-2` estimate covers every recurring planned resource and is at most $110.

Production apply is not required to merge the implementation and remains an explicit operator-authorized action.

## 12. Final repository evidence and production blockers

Final repository-only results on 2026-08-29:

- application gates: clean install with 0 vulnerabilities; API 552 passed and
  103 environment-gated skipped; web 317 passed; builds, current surface,
  pruning, and reachability passed;
- Terraform gates: format, backendless init, validation, and 19 native tests passed;
- deployment gates: all target/schema, policy, wrapper, topology, smoke, cost,
  secret, deployment-flow, failed-activation, and rollback fixtures passed;
- production shape: linux/amd64 at 0.25 vCPU/0.5 GiB passed migrations,
  readiness, pinned-CA validation, and seven retained reads;
- Git audit: 1,022 tracked files and zero prohibited sensitive artifacts; real
  tfvars, state, plans, credentials, smoke secrets, and release bundles are ignored;
- cost: official rates refreshed 2026-08-29, $98.02 fixed, $104.00 upper,
  zero unpriced recurring resources, $110 gate, $125 notification-only Budget.

### Functional-requirement traceability

| Requirement | Passing repository evidence |
|---|---|
| FR-001 | local launcher, environment-boundary tests, synchronous migration tests |
| FR-002 | local defaults/refusal tests and topology gate |
| FR-003 | pre-child-process production-marker and mutation refusal fixtures |
| FR-004 | topology result: one production, zero other AWS targets |
| FR-005 | sole production entry point; obsolete remote entry point removed |
| FR-006 | sole sanitized production example, ignore rules, secret contract |
| FR-007 | target/STS/backend/source/artifact binding fixtures |
| FR-008 | saved-plan SHA binding and exact-plan Apply fixture |
| FR-009 | exact Bootstrap/Apply/Rollback confirmation fixtures |
| FR-010 | package/CI gates and application/Terraform/deployment evidence files |
| FR-011 | protected-resource and unknown-action policy fixtures |
| FR-012 | RDS safety tests and documented restore contract; real restore proof pending |
| FR-013 | local-only bounded-abuse and production refusal tests |
| FR-014 | exact secret contract, live-preflight fixtures, redaction tests |
| FR-015 | commit-addressed image/web manifest and hash fixtures |
| FR-016 | 14-check smoke contract plus readiness contract tests |
| FR-017 | failed-activation and artifact-only rollback fixtures |
| FR-018 | migration inventory/SHA compatibility and rollback refusal fixtures |
| FR-019 | operational docs and deterministic topology governance |
| FR-020 | preserved target/backend/name policy and state safety tests |
| FR-021 | compatibility-name documentation and replacement rejection |
| FR-022 | tracked-artifact audit; ignored operator files untouched |
| FR-023 | desired-count-one and no-scale-to-zero Terraform tests |
| FR-024 | production-shape and active-alarm/cost tests |
| FR-025 | managed-boundary Terraform tests and architecture documentation |
| FR-026 | refreshed $104 cost validator and $125 no-action Budget test |
| FR-027 | explicit Single-AZ `db.t4g.micro` database safety test |

### Success-criteria traceability

| Criterion | Passing repository evidence |
|---|---|
| SC-001 | isolated PostgreSQL local acceptance and retained-read results |
| SC-002 | topology gate reports 1 production, 0 staging, 0 AWS development |
| SC-003 | manifest/hash/schema fixture suite |
| SC-004 | identity/backend/commit/plan negative fixtures fail before mutation |
| SC-005 | every protected deletion/replacement fixture rejected |
| SC-006 | complete application, Terraform, security, and deployment gates passed |
| SC-007 | failed activation restores compatible artifacts without state/data rewind |
| SC-008 | Git audit reports zero prohibited sensitive artifacts |
| SC-009 | complete recurring-resource map, right-sized shape, zero unpriced rows |
| SC-010 | managed boundaries and non-destructive policy pass; real plan pending |
| SC-011 | $104 upper estimate and $125 notification-only Budget pass |
| SC-012 | exact RDS configuration passes; real isolated restore proof pending |

### Blocking operator evidence

Production use remains blocked until Robert Patch supplies and approves:

1. merge of feature 028, rebase of this branch onto the resulting `origin/main`,
   and rerun of all final gates;
2. production account/profile, MFA session, backend coordinates, monitored email
   destinations, ignored production variables, and live secret versions for a
   speculative `-Mode Plan` only;
3. review proving the real plan has nonempty expected state, no deletion,
   replacement, region/backend/name drift, missing safeguard, or cost failure;
4. unique Tony Patch and Robert Patch identities with production MFA and no
   shared administrator credentials;
5. approved inventory of the real K-1 documents and data flows;
6. versioned WISP, risk assessment, incident/breach procedures, provider
   inventory, and exercised incident readiness;
7. monitored backup success plus a quarterly isolated encrypted restore proving
   data/application/authorization integrity, RPO no more than 15 minutes, and
   RTO no more than eight hours.

No real Terraform Apply, ECS activation, database mutation, web upload, or
CloudFront invalidation was performed or authorized by this implementation.
