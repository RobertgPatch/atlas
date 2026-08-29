# Production Deployment CLI Contract

## Entry points

```text
npm run deploy:aws:production -- <PowerShell arguments>
scripts/deploy-to-aws-production.ps1
```

The package script invokes the PowerShell script. The staging package command and script are removed.

## Parameters

| Parameter | Required | Contract |
|-----------|----------|----------|
| `-Mode` | No | `Plan` by default; allowed values `Plan`, `Bootstrap`, `Prepare`, `Apply`, `Rollback` |
| `-RepoPath` | No | Defaults to repository root; resolved absolute path must contain `.git` |
| `-AwsProfile` | Yes for AWS modes | Selects credentials but never proves account identity |
| `-AwsRegion` | No | Optional assertion only; when supplied it must equal committed target descriptor `us-west-2`, production tfvars, provider, and plan |
| `-ExpectedAccountId` | Yes | Exactly 12 digits; must equal STS and ECR registry accounts |
| `-TerraformStateBucket` | Yes | Existing approved production state bucket |
| `-TerraformStateKey` | Yes | Existing approved relative production key; no traversal |
| `-TerraformStateKmsKeyArn` | Yes | Existing approved state KMS key ARN |
| `-ReleaseDirectory` | Prepare/Bootstrap | New path under ignored `.artifacts/production-releases/` |
| `-ReleaseManifestPath` | Apply/Rollback | Existing manifest contained by an ignored release directory |
| `-RunFullTests` | Prepare | Defaults to true; cannot be false for Apply-capable production preparation |

There is no `-Force`, `-AutoApprove`, `-SkipPolicy`, `-SkipIdentity`, or `-SkipSmokeChecks` parameter.

## Common preflight

Every mode:

1. Resolves paths without traversal and refuses repository-root or broad destructive targets.
2. Verifies required tool versions.
3. Calls `aws sts get-caller-identity` and matches `ExpectedAccountId`.
4. Schema-validates `infra/aws/production-target.json`, hashes it, and verifies region, certificate region, Terraform backend coordinates, default workspace, availability-zone prefix, and production variable identity.
5. Refuses tracked sensitive release/state files and refuses release directories outside ignored `.artifacts/production-releases/`; it never reads, prints, moves, overwrites, or deletes ignored tfvars/state as cleanup.
6. Calculates the all-in production cost from the reviewed configuration and blocks Apply above $110 or when a recurring resource is unpriced; verifies the $125 Budget has no actions.
7. Uses non-secret identifiers in output and redacts account-specific paths where appropriate.

Prepare, Apply, and Bootstrap additionally require a clean Git worktree. Apply requires the current `HEAD` to equal the manifest source commit.

## Mode: Plan

### Behavior

- Initializes the exact production remote backend.
- Runs Terraform formatting check, `validate -no-tests`, and Terraform tests.
- Generates a speculative production plan without `-out`.
- Runs non-mutating production readiness checks available without release artifacts.
- Uses `Routine` plan policy and requires API desired count exactly one when production is already bootstrapped or active.
- Does not build, push, upload, apply, invalidate CloudFront, or change tfvars.

### Success output

- Verified account/region/workspace/backend fingerprint.
- Terraform detailed exit classification: no changes or changes present.
- Explicit message: `PLAN ONLY: no production resources or application artifacts were changed.`

## Mode: Bootstrap

### Behavior

- Used only when the authoritative production state does not yet expose the ECR and edge outputs required by Prepare, contains no API service, and has no successful activation checkpoint.
- Uses `Bootstrap` policy: API/worker counts are zero, schedules are disabled, the API service is create-only, and web delivery is not activated.
- Creates a saved plan, validates production policy, writes a dedicated redacted bootstrap evidence record, and requires explicit confirmation. It does not use the routine production release-manifest schema.
- Applies the exact saved bootstrap plan only.
- Does not upload web assets or activate application workloads.
- Refuses a second Bootstrap and refuses any plan that reduces an existing API service from one to zero.

### Confirmation

```text
BOOTSTRAP PRODUCTION <short-source-commit>
```

## Mode: Prepare

### Behavior

1. Runs clean install, security gates, application builds, full tests, Terraform gates, deployment self-tests, and Docker build.
2. Builds the API image tagged by full commit, pushes it to immutable ECR, and resolves the registry digest.
3. Archives the already-built web output and writes a per-file manifest plus SHA-256.
4. Verifies every required live runtime secret and records only the redacted VersionId attestation defined by `production-secret-preflight.md`.
5. Generates a saved production Terraform plan referencing the immutable API tag.
6. Generates transient plan JSON, invokes the one shared `Routine` policy engine, deletes transient raw JSON, and writes a redacted summary.
7. Writes the machine-verifiable cost estimate and immutable production release manifest, including target-descriptor and secret-contract hashes.

### Mutations

Prepare may push a new immutable ECR image after identity checks. It does not update ECS, Terraform state, S3 web assets, CloudFront, database schema, schedulers, or workers.

## Mode: Apply

### Behavior

1. Loads and schema-validates the release manifest.
2. Repeats common identity and backend preflight.
3. Verifies source commit, clean worktree, target descriptor and secret contract hashes, plan SHA-256, policy-result binding, tfvars SHA-256, API tag/digest, and web artifact hashes.
4. Repeats live secret checks and requires every `AWSCURRENT` VersionId to equal the prepared attestation; a rotation requires Prepare again.
5. Recalculates cost, displays the redacted plan summary plus migration/smoke evidence, and blocks a result above $110.
6. Requires exact production confirmation.
7. Applies the exact saved Terraform plan; it never regenerates the plan.
8. Uploads the exact web bundle, invalidates CloudFront, waits for ECS stability, and runs the ordered read-only checks in `production-smoke-checks.md`.
9. Writes an append-only execution record and a new rollback checkpoint on success.

### Confirmation

```text
DEPLOY PRODUCTION <short-source-commit>
```

### Success condition

Apply succeeds only when Terraform apply, ECS stability, edge homepage/assets, anonymous/authenticated session boundaries, dashboard, saved liquidity, investment aggregation, TIC properties, entities list/detail, logout, scheduler/worker state, and required alarm/log checks all pass.

## Mode: Rollback

### Behavior

- Revalidates production identity and the previous checkpoint.
- Refuses rollback if migration compatibility evidence says the prior application cannot run on the current schema.
- Restores the prior immutable API artifact/task definition and prior web bundle or versioned objects while retaining API desired count one.
- Invalidates CloudFront, waits for ECS stability, reruns the complete ordered smoke contract, and writes an execution record.
- Never rewinds Terraform state or database contents automatically.

### Confirmation

```text
ROLLBACK PRODUCTION TO <previous-release-id>
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Requested mode completed successfully |
| `2` | Local/tool/configuration preflight failed |
| `3` | AWS identity, region, backend, or workspace mismatch |
| `4` | Build, test, Terraform validation, or plan policy failed |
| `5` | Artifact/manifest/hash validation failed |
| `6` | Approval missing or confirmation rejected |
| `7` | Terraform apply or application activation failed |
| `8` | Smoke verification failed |
| `9` | Rollback failed or was unsafe due to schema incompatibility |

## Output safety

- Do not print secret values, environment file contents, raw Terraform plan JSON, authentication tokens, database URLs, or state contents.
- Live secret values and smoke credentials remain in memory only. Do not print or persist value lengths, value hashes, raw provider responses, passwords, TOTP codes, session cookies, or response bodies.
- Account ID and ARNs may be recorded in local release evidence but should be minimized in shared logs.
- Any exception message derived from a provider response must be redacted before it is persisted.
