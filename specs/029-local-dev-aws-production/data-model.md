# Data Model: Local Development to AWS Production

This feature does not add application-domain database tables. Its entities are deployment, policy, and release artifacts represented by configuration, JSON manifests, Terraform plans, and execution records.

## Entity: Environment Target

Represents an executable runtime target.

| Field | Type | Validation |
|-------|------|------------|
| `kind` | enum | Exactly `local` or `production` |
| `remote` | boolean | `false` for `local`; `true` for `production` |
| `terraformManaged` | boolean | `false` for `local`; `true` for `production` |
| `allowsRealProviderMutation` | boolean | `false` for normal `local`; gated for `production` |
| `databaseClass` | enum | `local_postgres` or `aws_rds` |
| `adapterMode` | enum | Local defaults to `stub_local`; production uses configured production adapters |

### Rules

- No active value named `development` or `staging` may represent an AWS deployment target.
- `local` cannot use the production Terraform backend, production database, production buckets/queues, or production provider resources.
- `production` must use the production remote backend and `environment_name=production`.

## Entity: Production Target Identity

Represents the expected AWS and Terraform destination bound to a release.

| Field | Type | Validation |
|-------|------|------------|
| `accountId` | string | Exactly 12 digits; must equal STS caller account |
| `callerArn` | string | Captured from STS for evidence; never used as sole account proof |
| `region` | string | Exactly `us-west-2`; must equal the committed target descriptor, ignored tfvars, provider, plan, and assertion |
| `certificateRegion` | string | Exactly `us-east-1` for the current CloudFront ACM certificate |
| `regionAuthorityPath` | string | Exactly `infra/aws/production-target.json` |
| `targetDescriptorSha256` | string | SHA-256 of the validated committed target descriptor |
| `terraformWorkspace` | string | Exactly `default` |
| `stateBucket` | string | Non-empty expected production bucket; not inferred from local state |
| `stateKey` | string | Non-empty relative key; no leading slash or parent segments |
| `stateKmsKeyArn` | string | Valid KMS ARN in the expected account/region or approved key region |
| `environmentName` | string | Exactly `production` |
| `environmentCostProfile` | string | Exactly `production` |

### Rules

- Identity is revalidated during Plan, Bootstrap, Prepare, Apply, and Rollback.
- Profile name is metadata only; it cannot replace STS account verification.
- Backend coordinates are immutable within a prepared release.
- `-AwsRegion`, when present, is an assertion and cannot override the committed descriptor.
- Availability zones must share the production region prefix; a descriptor change invalidates every prepared release.

## Entity: Production Release Manifest

Immutable metadata produced by Prepare and consumed by Apply.

| Field | Type | Validation |
|-------|------|------------|
| `schemaVersion` | string | Supported major version only |
| `releaseId` | string | Derived from full commit and preparation timestamp; filesystem-safe |
| `preparedAt` | UTC timestamp | RFC 3339 |
| `sourceCommit` | string | Full 40-character Git commit SHA |
| `sourceBranch` | string | Informational; commit is authoritative |
| `cleanWorktree` | boolean | Must be `true` |
| `target` | Production Target Identity | Must pass all target rules |
| `apiArtifact` | API Artifact | Required for routine release |
| `webArtifact` | Web Artifact | Required for routine release |
| `terraformArtifact` | Terraform Plan Artifact | Required for any apply |
| `secretAttestation` | Secret Verification Attestation | Required for Prepare/Apply; no values or value-derived hashes |
| `migrationSet` | Migration Set | Required, even when empty |
| `previousCheckpoint` | Rollback Checkpoint or null | Required for an update; null only for the first routine activation after Bootstrap |

### Rules

- The manifest contains identifiers and hashes, never secret values.
- The prepared manifest is not edited during Apply. Apply writes a separate execution record.
- Every referenced local artifact path must resolve within the selected release directory.
- Apply invalidates the release if any required secret's `AWSCURRENT` VersionId differs from Prepare.

## Entity: Secret Verification Attestation

Records that required live runtime inputs were present and usable without recording their values.

| Field | Type | Validation |
|-------|------|------------|
| `contractSha256` | string | SHA-256 of the committed secret requirement matrix |
| `verifiedAt` | UTC timestamp | RFC 3339 |
| `secrets` | array | Exactly one entry per currently required secret/consumer contract |
| `key` | string | Canonical application environment key; not a value |
| `secretArn` | string | Canonical ARN in target account/region |
| `versionId` | string | The single version carrying `AWSCURRENT` |
| `consumers` | array | Nonempty subset of API, Plaid scheduler, market scheduler, and K-1 worker |
| `exists` | boolean | Must be `true` |
| `currentVersionUnique` | boolean | Must be `true` |
| `nonempty` | boolean | Must be `true`; value and length are never persisted |
| `wiringVerified` | boolean | Must be `true` |

### Rules

- Live values, lengths, hashes, raw provider responses, and plaintext command output are prohibited.
- Pending-deletion secrets fail verification.
- Apply repeats the live check and requires every VersionId to match the prepared attestation.
- Rotation between Prepare and Apply requires a new release preparation rather than an override.

## Entity: API Artifact

| Field | Type | Validation |
|-------|------|------------|
| `repositoryUri` | string | ECR registry account must equal target account |
| `tag` | string | Exactly the full source commit or an approved commit-derived format |
| `digest` | string | `sha256:` plus 64 lowercase hexadecimal characters |
| `platform` | string | Exactly `linux/amd64` for the current ECS task |
| `dockerfileSha256` | string | SHA-256 of the build Dockerfile |

### Rules

- Production ECR tag mutability is immutable.
- Apply does not rebuild or repush the API artifact.

## Entity: Web Artifact

| Field | Type | Validation |
|-------|------|------------|
| `archivePath` | string | Resolved inside release directory |
| `sha256` | string | 64 lowercase hexadecimal characters |
| `fileManifestPath` | string | Resolved inside release directory |
| `fileCount` | integer | Positive for routine release |
| `totalBytes` | integer | Positive and matches manifest aggregation |

### Rules

- Apply hashes the archive and file manifest again before upload.
- Rollback uses the previous checkpoint's web artifact, not a fresh rebuild.

## Entity: Terraform Plan Artifact

| Field | Type | Validation |
|-------|------|------------|
| `planPath` | string | Opaque saved plan inside ignored release directory |
| `planSha256` | string | 64 lowercase hexadecimal characters |
| `redactedSummaryPath` | string | Human-reviewable output with no raw variable values |
| `policyResultPath` | string | Machine-readable pass result tied to plan hash |
| `terraformVersion` | string | Must satisfy repository constraint and approved deployment version |
| `sourceCommit` | string | Must equal release source commit |
| `backendFingerprint` | string | Hash of normalized non-secret backend coordinates |
| `variableFileSha256` | string | Hash of the ignored production tfvars used for planning |

### Rules

- Plan files and plan JSON are sensitive and never committed.
- Apply verifies the plan hash immediately before `terraform apply <saved-plan>`.
- A changed variable file does not invalidate the already saved plan, but it blocks Apply because the manifest evidence no longer matches the operator's current production configuration.

## Entity: Production Plan Policy Result

| Field | Type | Validation |
|-------|------|------------|
| `planSha256` | string | Must match Terraform Plan Artifact |
| `evaluatedAt` | UTC timestamp | RFC 3339 |
| `formatVersion` | string | Supported Terraform plan JSON major version |
| `policyMode` | enum | `Routine` or `Bootstrap` |
| `environmentVerified` | boolean | Must be `true` |
| `guardrailsVerified` | boolean | Must be `true` |
| `deletionCount` | integer | Must be `0` for this feature |
| `replacementCount` | integer | Must be `0` for this feature |
| `protectedFindings` | array | Must be empty |
| `warnings` | array | Displayed during review; cannot contain raw secret values |

### Action classification

| Terraform actions | Classification | Result |
|-------------------|----------------|--------|
| `[]` or `no-op` | No change | Allow |
| `create` | Addition | Allow after absolute guardrails pass |
| `update` | In-place update | Allow after absolute guardrails pass |
| `delete` | Destruction | Reject |
| `delete, create` | Destroy-before-create replacement | Reject |
| `create, delete` | Create-before-destroy replacement | Reject |

### Capacity rules

- `Routine`: the API service desired count is exactly one; active scheduled tasks retain their configured cadence; no normal-operation scale-to-zero setting exists.
- `Bootstrap`: API and workers are zero and schedules are disabled only when the API service is a create action and no previous activation checkpoint exists.
- Bootstrap can never update an existing API service from one to zero and can never be repeated after a successful bootstrap or activation.

## Entity: Production Cost Estimate

| Field | Type | Validation |
|-------|------|------------|
| `region` | string | Must equal the production target descriptor |
| `pricingRetrievedAt` | UTC timestamp | Required and displayed during review |
| `hoursPerMonth` | integer | Exactly `730` for the baseline |
| `workloadProfile` | object | Matches the documented one-user request, transfer, log, storage, and scheduled-task assumptions |
| `lineItems` | array | One row per recurring Terraform resource or documented variable usage class |
| `fixedMonthlyUsd` | decimal | Sum of recurring fixed line items |
| `usageMonthlyUsd` | decimal | Sum of workload-derived line items |
| `estimatedMonthlyUsd` | decimal | Fixed plus usage; must be `<= 110` before production apply |
| `budgetThresholdUsd` | decimal | Exactly `125`; notification-only |
| `excludedUsage` | array | Must be empty, or each zero-baseline paid feature must be disabled and explicitly named |

### Rules

- Unit prices include source URL, region, unit, quantity, and retrieval date.
- Every planned recurring resource is mapped to a line item or a documented zero-cost tier.
- Cost validation fails if the plan enables a zero-baseline feature, omits a recurring resource, or exceeds $110.
- Cost Explorer actuals are reviewed after 30 days; the budget is not treated as an enforcement cap.

## Entity: Migration Set

| Field | Type | Validation |
|-------|------|------------|
| `files` | array of paths | Ordered, repository-relative migration paths |
| `sha256` | string | Hash over ordered paths and contents |
| `backwardCompatible` | boolean | Must be `true` for routine release |
| `requiresSnapshot` | boolean | True when operator review requires a recovery snapshot |
| `snapshotIdentifier` | string or null | Required when `requiresSnapshot=true`; contains identifier only, not credentials |
| `approvalReference` | string or null | Required for any non-empty migration set if policy mandates review |

### Rules

- Apply never automatically reverts database state.
- A destructive or backward-incompatible migration is outside the routine release contract.

## Entity: Rollback Checkpoint

| Field | Type | Validation |
|-------|------|------------|
| `releaseId` | string | Previous successfully activated release |
| `apiImageTag` | string | Immutable prior tag |
| `apiImageDigest` | string | Valid SHA-256 digest |
| `taskDefinitionArn` | string | Prior completed ECS task definition |
| `webArchivePath` | string | Available prior bundle or recoverable versioned object set |
| `webArchiveSha256` | string | Hash verified before rollback |
| `migrationSha256` | string | Used to assess application/database compatibility |
| `activatedAt` | UTC timestamp | RFC 3339 |

### Rules

- Rollback cannot proceed when the prior application is incompatible with the current database schema.
- Rollback changes application artifacts only unless a separate data-recovery procedure is approved.

## Entity: Production Execution Record

Append-only evidence produced by Apply or Rollback.

| Field | Type | Validation |
|-------|------|------------|
| `releaseId` | string | Matches immutable manifest |
| `operation` | enum | `bootstrap`, `apply`, or `rollback` |
| `startedAt` | UTC timestamp | Required |
| `completedAt` | UTC timestamp or null | Required on terminal state |
| `operatorCallerArn` | string | Captured from revalidated STS identity |
| `confirmationCommit` | string | Must match manifest source commit for Apply |
| `terraformApplyExitCode` | integer or null | Recorded without raw plan output |
| `smokeChecks` | array | Named result, timestamp, status, redacted detail |
| `outcome` | enum | `succeeded`, `failed`, `rolled_back`, `rollback_failed` |

Required smoke result names are `edge-home`, `edge-assets`, `auth-anonymous`, `auth-login`, `auth-session`, `dashboard-read`, `liquidity-holdings-read`, `liquidity-performance-read`, `investment-aggregation-read`, `tic-properties-read`, `entities-list-read`, optional `entity-detail-read`, `auth-logout`, and `auth-post-logout`.

## State Transitions

### Production infrastructure availability

```text
UNINITIALIZED
  -> BOOTSTRAPPED     # single-use shell; API/workers zero, schedules disabled
  -> ACTIVE           # first successful Apply; API desired count exactly one
```

`ACTIVE` has no transition back to `BOOTSTRAPPED`. Routine release failure may restore a previous application checkpoint, but it does not authorize normal production capacity zero.

### Production release

```text
DRAFT
  -> PREPARING
  -> PREPARED
  -> APPROVED
  -> APPLYING
  -> VERIFYING
  -> ACTIVE
```

Failure transitions:

```text
PREPARING -> REJECTED
PREPARED  -> INVALIDATED       # identity, hash, commit, backend, or policy mismatch
APPLYING  -> FAILED
VERIFYING -> FAILED
FAILED    -> ROLLING_BACK
ROLLING_BACK -> ROLLED_BACK | ROLLBACK_FAILED
```

### Invariants

- Only `PREPARED` can become `APPROVED`.
- Approval is valid for one manifest and plan hash only.
- Any artifact or identity mismatch transitions to `INVALIDATED`; the release must be prepared again.
- `ACTIVE` is recorded only after every required smoke check passes.
- No state transition authorizes database rollback.
