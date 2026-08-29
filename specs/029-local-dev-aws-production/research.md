# Research: Local Development to AWS Production

## Decision 1: Treat local development and AWS production as different runtime classes

**Decision**: Support exactly two active runtime classes: `local` for developer-owned processes and `production` for the deployed AWS stack. Do not provision or document an AWS `development` or `staging` environment. Historical specifications remain unchanged, but current automation cannot target those historical environments.

**Rationale**: This directly implements the requested operating model and removes the present ambiguity where `development` can mean either localhost or a full AWS stack. Local execution remains Node/Vite/Fastify plus Docker PostgreSQL; Terraform is production-only.

**Alternatives considered**:

- Rename AWS staging to AWS development: rejected because it still creates a second AWS environment and does not represent localhost.
- Retain AWS staging: rejected because the user explicitly chose local-to-production delivery.
- Use Terraform workspaces for local and production: rejected because local development does not need AWS-managed infrastructure or remote state.

## Decision 2: Make deterministic local adapters the default and refuse production mutation from local tooling

**Decision**: Change the supported `dev:local` path to use the local PostgreSQL container and stub/local K-1 adapters by default. Remove the current default AWS BDA mode from the normal launcher. Any future real-provider developer workflow must use separately authorized sandbox resources and must fail if the caller, endpoints, or resource identifiers resolve to production.

**Rationale**: The current local launcher defaults to AWS BDA and S3. That contradicts a self-contained local development path and creates a route for production credentials to be used from a developer shell. Deterministic local adapters also keep CI repeatable.

**Alternatives considered**:

- Keep AWS BDA as the local default: rejected because local startup would still depend on AWS and could reach production resources.
- Allow production AWS resources in read-only local mode: rejected because identity and permission mistakes can turn an assumed read-only path into a production incident.
- Remove all provider integration code: rejected because production still requires the integrations; only local activation changes.

## Decision 3: Preserve the existing production account, region, backend, and physical identifiers

**Decision**: This feature will not move the AWS region, backend key, state bucket, KMS key, or existing physical resources. Add a committed, non-secret production target descriptor that fixes the last committed production baseline at `us-west-2`, default Terraform workspace, and the separate `us-east-1` CloudFront certificate region. The production script must verify the descriptor, ignored production tfvars, provider/plan region, requested assertion, and availability zones agree. Project Jackson branding may change documentation, tags, metric namespaces, and defaults for genuinely new resources, but a plan that replaces a protected existing resource is blocked.

**Rationale**: Environment-topology cleanup is independent of region and physical-resource migration. Combining them would make the first direct production deployment materially riskier. The recovered stash currently changes `us-west-2` to `us-west-1` and several resource prefixes; those changes must be reverted or isolated unless a separately approved migration plan proves they are non-destructive.

**Alternatives considered**:

- Complete the region move in this feature: rejected because it can recreate regional resources and requires service-availability, data-migration, DNS, and rollback planning.
- Rename all Atlas physical resources immediately: rejected because many AWS names are replacement-triggering or externally referenced.
- Reinitialize a new production state: rejected because it can orphan or duplicate existing resources.

## Decision 4: Use a two-phase production release contract

**Decision**: Replace the staging deploy script with a production-only script that has explicit preparation and application phases:

1. `Prepare` verifies a clean commit, tools, account, region, remote backend, production variables, secrets, and gates; builds immutable artifacts; creates a saved Terraform plan; evaluates plan policy; and writes a release manifest.
2. `Apply` reloads the manifest, re-verifies identity and every artifact digest, requires the explicit production confirmation, applies the exact saved plan, deploys the exact web bundle, waits for service stability, and runs smoke checks.

A separate `Bootstrap` mode may create the initial production shell with API desired count zero, but it uses the same saved-plan and confirmation rules. This is a single-use pre-activation exception: the plan must be create-only for the API service, state must have no prior API service or successful activation checkpoint, workers remain at zero, schedulers remain disabled, and a second Bootstrap attempt fails. Routine production plans require API desired count exactly one.

**Rationale**: A single interactive command that generates and immediately applies a plan does not provide a durable review boundary. HashiCorp documents saved plans as the mechanism for applying the exact reviewed changes. Applying a saved plan is non-interactive, so the wrapper must enforce approval before invoking it. [Terraform plan command](https://developer.hashicorp.com/terraform/cli/commands/plan)

**Alternatives considered**:

- Continue with one `-Apply` switch: rejected because plan review and apply are coupled in one session and the current script deletes the plan afterward.
- Automatically deploy on merge: rejected because production is the only remote environment and the user requires a deliberate direct deployment.
- Add a second AWS validation environment: rejected by the requested topology.

## Decision 5: Treat saved plans and release metadata as sensitive ignored artifacts

**Decision**: Store production release bundles under an ignored `.artifacts/production-releases/<release-id>/` directory with restrictive local access. The bundle contains the opaque saved plan, redacted human plan output, plan policy result, release manifest, and web bundle. Never commit or print the raw plan JSON. Delete or securely archive the bundle after the retention window.

**Rationale**: Terraform warns that saved plan files include full configuration, input values, and potentially sensitive data in cleartext. `terraform show -json` is needed for policy inspection, but its output must be transient. [Terraform plan command](https://developer.hashicorp.com/terraform/cli/commands/plan), [Terraform JSON output format](https://developer.hashicorp.com/terraform/internals/json-format)

**Alternatives considered**:

- Commit plan files for review: rejected because plan files can contain sensitive values.
- Recreate the plan during apply: rejected because the applied changes would no longer be the reviewed plan.
- Print complete plan JSON to CI logs: rejected because sensitive values may be exposed.

## Decision 6: Enforce production plan policy from machine-readable Terraform changes

**Decision**: Add one authoritative `production-plan-policy.psm1` engine that reads transient `terraform show -json` output and verifies:

- `environment_name` and `environment_cost_profile` are `production`.
- Expected production region and backend metadata match the release manifest.
- Required production WAF, capacity, encryption, backup, alarm, budget, secret-wiring, and deletion-protection settings are present.
- No protected resource has `delete`, `delete/create`, or `create/delete` actions.
- Any deletion outside the protected set is surfaced and requires a dedicated policy allowance; no broad bypass flag is provided by this feature.

The release-oriented validator and any temporary compatibility wrapper call this engine and contain no duplicate policy rules. The engine accepts an explicit `Routine` or `Bootstrap` mode and enforces the corresponding capacity invariant.

**Rationale**: Terraform exposes `resource_changes` and action arrays in plan JSON, enabling deterministic policy checks. `prevent_destroy` remains useful on selected resources, but HashiCorp notes it does not protect an object if its resource configuration is removed, so a whole-plan guard is also required. [Terraform JSON output format](https://developer.hashicorp.com/terraform/internals/json-format), [Terraform lifecycle reference](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle%20%20)

**Alternatives considered**:

- Depend only on `prevent_destroy`: rejected because removing the resource block also removes that protection.
- Depend only on human plan review: rejected because destructive action detection is deterministic and should fail closed.
- Allow a command-line `-ForceDestroy`: rejected because the direct production path should route migrations through a separate reviewed change.

## Decision 7: Use one locked, versioned, encrypted production state path

**Decision**: Production deployment must initialize the existing partial S3 backend with the expected bucket, production key, region, and KMS key; require the default workspace; require native S3 locking; and refuse local state as a production source. Backend coordinates are verified but not renamed by this feature. Existing local tfstate files remain untouched and ignored.

**Rationale**: The S3 backend supports native lockfiles, and HashiCorp recommends S3 bucket versioning for recovery from accidental deletion or human error. State locking prevents concurrent writers and should not be disabled. [Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), [Terraform state locking](https://developer.hashicorp.com/terraform/language/state/locking)

**Alternatives considered**:

- Apply from the current local state file: rejected because it can be stale and is not an authoritative shared production state.
- Create a new backend key as part of the branding change: rejected because that is a state migration.
- Disable locking to recover from contention: rejected; force-unlock remains a separately controlled recovery operation.

## Decision 8: Require immutable, commit-addressed application artifacts

**Decision**: Production releases require a clean Git worktree. Tag the API image with the full source commit, enable ECR tag immutability for production, capture the resulting image digest, and record both in the release manifest. Build the web bundle once, hash its manifest/archive, and deploy that exact bundle during apply. Eliminate `latest`, timestamp-only, and `-dirty` production tags.

**Rationale**: ECR tag immutability prevents a previously approved tag from being overwritten. Recording the digest provides content identity even though Terraform can continue referencing the unique commit tag. [Amazon ECR tag immutability](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html)

**Alternatives considered**:

- Keep mutable `latest`: rejected because it cannot prove which image an approved release references.
- Rebuild artifacts during apply: rejected because the applied bytes could differ from the reviewed bytes.
- Use timestamps as the primary identity: rejected because they do not map uniquely to source content.

## Decision 9: Verify the AWS identity before every production-affecting phase

**Decision**: `Prepare`, `Bootstrap`, `Apply`, and `Rollback` each call AWS STS and require the returned account to equal an explicit expected production account. They also verify the expected production region, ECR registry account, Terraform output environment, and state path. No apply-capable mode may infer the account solely from a profile name.

**Rationale**: `aws sts get-caller-identity` returns the active account and ARN and is the appropriate concrete identity check. A profile name is local metadata and can be repointed. [AWS CLI `get-caller-identity`](https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html)

**Alternatives considered**:

- Trust a profile named `production`: rejected because profile names do not prove account identity.
- Require account confirmation only during apply: rejected because artifact pushes and bootstrap operations can also mutate production.
- Embed an account ID in committed source: rejected because the deployment contract should accept the operator-approved account without publishing account-specific values.

## Decision 10: Add automatic ECS failure rollback and explicit release rollback

**Decision**: Configure the production ECS service with deployment circuit breaker enabled and rollback enabled. Apply waits for ECS stability and then runs edge health plus retained-flow smoke checks. The release manifest records the previous API task/image and web bundle checkpoint. On failure, stop activation and provide a rollback command that restores the previous application artifacts without applying a reversed Terraform plan or reverting database state.

**Rationale**: ECS can mark a deployment failed when it cannot reach steady state and automatically roll back to the most recent completed deployment. AWS also supports manual rollback of an in-progress deployment. [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_DeploymentCircuitBreaker.html), [Stopping ECS deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/stop-service-deployment.html)

**Alternatives considered**:

- Rely only on `aws ecs wait services-stable`: rejected because waiting detects failure but does not configure automatic rollback.
- Roll back by applying an old Terraform configuration: rejected because it can revert unrelated infrastructure and cannot safely reverse database changes.
- Roll back database state automatically: rejected because data loss and migration compatibility require a separately approved recovery decision.

## Decision 11: Retain production-only safety checks while removing staging parity

**Decision**: Refactor the current two-plan Terraform guardrail validator into the shared production policy engine plus thin adapters. Remove staging parity assertions and ensure the compatibility wrapper contains zero policy rules, but strengthen absolute production assertions for WAF block actions, subscribers, mode-specific ECS capacity, K-1 lifecycle, runtime settings, backups, deletion protection, immutable images, ECS rollback, and protected-resource changes. Bounded-abuse tooling becomes local-only and continues to refuse production.

**Rationale**: Removing staging must not remove the controls staging was intended to rehearse. Absolute production policy is the remaining enforceable gate. The existing GitHub security workflow already runs Terraform format, initialization without backend, `validate -no-tests`, and `terraform test`; those checks remain.

**Alternatives considered**:

- Delete staging checks without replacement: rejected because it silently weakens the security gate.
- Relabel staging fixtures as development: rejected because that preserves the incorrect second-AWS-environment model.
- Run bounded-abuse tests in production: rejected because the tool intentionally models disruptive traffic and cost conditions.

## Decision 12: Sequence implementation to separate topology cleanup from production mutation

**Decision**: Implement and review repository-only changes first: environment terminology, local defaults, CLI contracts, tests, production plan policy, Terraform safeguards, and documentation. Generate a real production plan only after those changes merge and the production backend/account values are supplied. Applying the plan is an operator action outside implementation and requires separate confirmation.

**Rationale**: Planning and code review can be completed without mutating AWS. This preserves the boundary between repository changes and production authorization and allows the current infrastructure stash to be reconciled safely.

**Alternatives considered**:

- Apply infrastructure while implementing scripts: rejected because code review and production mutation would be coupled.
- Drop the stashes immediately: rejected until every intended infrastructure change is either incorporated or explicitly superseded.
- Carry all recovered changes unchanged: rejected because the AWS development environment and region migration conflict with the clarified goal.

## Decision 13: Make local migrations a synchronous startup gate

**Decision**: The supported local launcher starts PostgreSQL, runs the existing ordered/advisory-locked migration runner synchronously, requires `/internal/readiness`, and only then starts the worker and web client. Migration, database, or readiness failure terminates startup with a nonzero exit code. The API and worker may retain their idempotent migration calls as defense in depth.

**Rationale**: The API already exits when migrations fail, but the current launcher starts API and worker concurrently, checks only liveness, warns after timeout, and continues to the web client. That behavior cannot prove a clean checkout migrated successfully and hides failures behind a partially running UI.

**Alternatives considered**:

- Keep the current warning: rejected because SC-001 requires build, migration, and runtime success.
- Rely only on public `/health`: rejected because it does not prove database readiness.
- Remove automatic API migrations: rejected because production startup still benefits from idempotent protection until a separate migration task is designed.

## Decision 14: Use a reproducible all-in cost model before right-sizing

**Decision**: Define the baseline as 730 hours/month, one user, at most 10,000 application requests/month, at most 1 GiB NAT data, 1 GiB logs, 2 GiB ECR, 5 GiB S3, under five scheduled Fargate task-hours, K-1 AWS ingestion disabled, and no paid BDA/Bedrock calls. Inventory every recurring planned resource, record region-specific public unit prices and retrieval date, and calculate fixed and usage-sensitive totals. Re-run the estimate before Prepare and compare actual Cost Explorer spend after 30 days.

In canonical `us-west-2`, the current 0.5 vCPU/1 GiB x86 task has an estimated fixed subtotal of $108.43 and expected total of $109-$113, so it can exceed the target. Validate 0.25 vCPU/0.5 GiB x86 first; its fixed estimate is about $98.02 after disabled K-1 alarms are omitted and its expected total is $100-$104. ARM64 is unnecessary for compliance and remains an optional later optimization after Docker image and native-dependency validation.

**Rationale**: NAT, ALB, RDS, WAF, IPv4, Secrets Manager, KMS, and alarms dominate the retained managed design. Omitting small recurring resources makes a nominally compliant estimate misleading. Disabled K-1 alarms can be gated without removing monitoring from active services; immutable ECR history can be bounded to roughly ten releases plus short untagged retention.

**Alternatives considered**:

- Keep 0.5 vCPU/1 GiB without measurement: rejected because the all-in estimate exceeds $110.
- Remove NAT, ALB, WAF, or managed RDS: rejected by the retained-architecture decision.
- Treat $125 Budget as a hard cap: rejected because AWS Budgets is delayed and notification-only.
- Buy a one-year commitment immediately: rejected until actual utilization confirms the steady workload.

**Pricing references**: [AWS ECS/Fargate public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/us-west-2/index.json), [AWS RDS public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-west-2/index.json), [AWS ELB public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-west-2/index.json), [AWS VPC pricing](https://aws.amazon.com/vpc/pricing/), [AWS WAF pricing](https://aws.amazon.com/waf/pricing/), [AWS KMS pricing](https://aws.amazon.com/kms/pricing/), [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/).

## Decision 15: Separate Terraform secret wiring from live secret verification

**Decision**: A committed non-secret secret-requirements matrix is the single topology source for Terraform and deployment tooling. Plan policy verifies ECS secret references, exact IAM scope, account/region/canonical names, required consumers, and absence from plaintext environment variables. Prepare and Apply use Secrets Manager in memory to verify each required secret exists, is not pending deletion, has exactly one `AWSCURRENT` version, returns a nonempty string or binary value, and exposes a VersionId. Apply requires the same VersionId recorded by Prepare.

Evidence stores only key name, canonical ARN/name, VersionId, consumers, checked timestamp, and boolean results. It never stores or logs values, lengths, value hashes, raw CLI output, cookies, or provider responses. Long-lived persistence secrets have no arbitrary age rule; stale means absent, missing `AWSCURRENT`, or changed since Prepare. `PLAID_ENV` is non-secret and moves to ordinary task environment configuration.

**Rationale**: Terraform can prove wiring but cannot prove that an existing secret is nonempty and currently readable. Version binding closes the gap between review and activation while avoiding secret-value exposure.

**Alternatives considered**:

- Store secret hashes in the manifest: rejected because they create unnecessary sensitive-derived evidence.
- Check names only: rejected because empty values and missing current versions would pass.
- Allow Apply after rotation: rejected because a release must be re-prepared against the new runtime inputs.

## Decision 16: Enumerate read-only retained-flow smoke checks

**Decision**: Activation and rollback verification run the exact checks in `contracts/production-smoke-checks.md`: CloudFront homepage and hashed assets; anonymous session rejection; secure login and authenticated session; dashboard; saved liquidity holdings and performance; partnership tracker aggregation; TIC properties; entities list and conditional first detail; logout and session rejection. Checks validate status and minimal response shape without persisting credentials, cookies, or bodies.

**Rationale**: “Critical retained reads” is otherwise subjective. These routes cover the current homepage/dashboard navigation requested by the user while avoiding provider refreshes or data mutation.

**Alternatives considered**:

- Check only `/health`: rejected because it misses edge delivery, authentication, and database-backed flows.
- Exercise every API route: rejected because production smoke must be fast, read-only, and low cost.
- Refresh Plaid/market data during smoke: rejected because it invokes paid/external providers and mutates saved data.

## Decision 17: Treat Bootstrap as a pre-availability state, not a cost mode

**Decision**: Model production infrastructure as `UNINITIALIZED -> BOOTSTRAPPED -> ACTIVE`. Bootstrap may create a shell with API/worker capacity zero and schedules disabled only when no API service or successful rollback checkpoint exists. It may never reduce an existing service from one to zero. The first successful Apply establishes the always-available invariant; all routine Plan/Prepare/Apply/Rollback policies require exactly one API task.

**Rationale**: A safe initial shell can be needed before ECR and edge outputs exist, but allowing zero capacity later would contradict the selected always-available option.

**Alternatives considered**:

- Remove Bootstrap entirely: rejected because a brand-new authoritative state may need infrastructure outputs before artifacts can be prepared.
- Permit recurring zero-capacity Bootstrap: rejected because it becomes an undocumented shutdown mechanism.

## Decision 18: Bind releases to a committed non-secret target descriptor

**Decision**: Add `infra/aws/production-target.json` with schema version, `production`, `us-west-2`, default workspace, and `us-east-1` certificate region. Bind its SHA-256 into release manifests. Keep account and backend values explicit operator inputs, then require them to agree with the initialized backend and manifest. Retain `-AwsRegion` only as an assertion; it cannot override the descriptor.

**Rationale**: The staged variable example is not a safe authority and currently proposes an unapproved `us-west-1` move. A committed descriptor gives tests and operators one non-secret canonical region without publishing account-specific backend coordinates.

**Alternatives considered**:

- Infer region from AWS profile: rejected because profiles are mutable local metadata.
- Treat ignored tfvars as the only authority: rejected because CI and review cannot verify it.
- Accept any matching CLI/tfvars region: rejected because both could repeat the same operator mistake.

## Decision 19: Gate observability and retention by active feature, not availability

**Decision**: Retain 30-day API and WAF logs and all alarms required for active production components. Create K-1 worker/queue/workflow alarms only when K-1 AWS ingestion is enabled, retain approximately ten immutable API releases plus three days of untagged ECR images, and keep the $125 Budget notification-only. No cost control disables the API, database, security controls, or recovery protections during normal production.

**Rationale**: This removes recurring spend for inactive feature paths and unbounded artifact history while preserving operational evidence and rollback capacity for active services.

**Alternatives considered**:

- Reduce all logs indiscriminately: rejected because production investigation still needs a useful window.
- Delete security alarms or WAF rules: rejected because cost optimization cannot weaken required controls.
- Automatically stop services at the budget threshold: rejected by the always-available requirement.
