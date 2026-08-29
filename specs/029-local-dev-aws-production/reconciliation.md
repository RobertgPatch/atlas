# Feature 029 Recovered-Change Reconciliation

This record classifies the staged infrastructure recovery without reading, printing, moving, overwriting, deleting, or committing ignored `staging.tfvars`, `production.tfvars`, Terraform state, plan files, or backups. The Git index is preserved as the recovery baseline; implementation changes are applied deliberately in the working tree and verified before any later commit.

## Retain and validate

- Retain the `PROJECT_JACKSON_SCHEDULER_TOKEN` application, test, documentation, and Terraform wiring change. Feature 029 completes the cutover and rejects the retired alias.
- Retain the checksum-pinned AWS RDS global CA bundle in `apps/api/Dockerfile`, subject to the production-shaped image test.
- Retain conditional K-1 BDA/storage/worker/IAM changes only where Terraform tests prove disabled K-1 ingestion creates no paid worker path and enabled ingestion preserves encryption, queue, IAM, and reconciliation safeguards.
- Retain non-destructive documentation, descriptions, and metric namespace changes only when the speculative production plan shows no replacement and application/Terraform metric contracts stay aligned.
- Retain recovery-oriented security, observability, budget, and scheduler improvements after production-only validation replaces staging/development parity.

## Revise for the approved topology

- Replace all staged `development`/`production` environment validation with production-only AWS validation; local development is not a Terraform environment.
- Revise `production.tfvars.example` to the canonical `us-west-2` target, one always-on 256 CPU/512 MiB API task after capacity proof, Single-AZ `db.t4g.micro`, immutable image tags, disabled K-1 baseline, and notification-only $125 Budget.
- Revise observability so K-1-only alarms are conditional when AWS K-1 ingestion is disabled, while all active API/database/edge/security/scheduler alarms remain.
- Rewrite current runbooks from staging/development parity to local development plus direct reviewed production deployment.
- Move `PLAID_ENV` to non-secret ECS configuration while retaining any existing Secrets Manager metadata until a separate deletion review.

## Supersede and remove after replacement tests pass

- Supersede the staged rename from `staging.tfvars.example` to `development.tfvars.example`; feature 029 leaves `production.tfvars.example` as the only committed remote-environment example.
- Supersede `terraform.tfvars.example` instructions for multiple AWS environments with production-only instructions.
- Remove the staging deployment command/script only after Plan/Bootstrap/Prepare/Apply fixture paths pass.
- Replace the two-plan staging/production guardrail implementation with one shared production policy engine and thin compatibility wrapper.

## Separate migration; do not implement in feature 029

- Reject the staged `us-west-2` to `us-west-1` region and availability-zone move.
- Reject changes to the existing state bucket key prefix, Terraform-state KMS alias, backend example prefix, or state identity.
- Reject default physical resource-name changes from `atlas` to `project-jackson` where they can replace VPC, RDS, ECS, ECR, S3, KMS, CloudFront, WAF, database, or externally referenced resources.
- Restrict Project Jackson branding to non-destructive labels, descriptions, documentation, metric namespaces, and defaults for proven-new resources. Any state move or physical rename requires a separate reviewed migration plan.

## Required reconciliation evidence

- `infra/aws/production-target.json` and all production inputs agree on `us-west-2` and Terraform workspace `default`.
- The real speculative plan uses the existing backend and reports no empty state, deletion, replacement, region move, backend move, or physical-name drift.
- `git ls-files` reports no real tfvars, state, saved plan, raw plan JSON, credential, or release bundle.
- The original infrastructure stash/recovery is not dropped until the reconciled implementation is committed, reviewed, and validated.

## Final branch-base check (2026-08-29)

Feature 028 merged into `origin/main` at merge commit `06b5c75`. The committed
feature-029 implementation was rebased without conflicts and is exactly one
feature commit above that merge, isolating the merge request from feature 028.

The rebased commit passed a clean `npm ci`, dependency and cost audits, route
policy coverage, API and web builds, 552 API tests, 317 web tests, current
surface and reachability checks, production deployment/policy/cost fixtures,
all 19 Terraform tests, and the constrained linux/amd64 production-shape test.
The shape test again proved migrations, readiness, the pinned RDS CA bundle,
and seven retained reads at 0.25 vCPU/0.5 GiB. The live workspace's running
Vite process kept its Rolldown binary locked, so clean-install validation ran
in a detached worktree at the exact rebased commit without copying ignored
files.

Both original infrastructure stashes remain present and were not read,
applied, or dropped. The only remaining feature task is the operator-input
speculative production Plan; no AWS call, plan, or mutation was made during
the rebase verification.
