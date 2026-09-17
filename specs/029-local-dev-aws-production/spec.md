# Feature Specification: Local Development to AWS Production

**Feature Branch**: `029-local-dev-aws-production`

**Created**: 2026-08-28

**Status**: Repository amendment implemented; production activation and real local-BDA acceptance remain blocked on operator-supplied AWS evidence

**Input**: User description: "Development exists on my local machine and deployment goes straight to AWS production."

## Clarifications

### Session 2026-08-28

- Q: What availability should the one-user AWS production environment provide? → A: Keep production always available and minimize cost through right-sizing and removal of unnecessary spend, without scheduled or manual shutdown.
- Q: How much may cost optimization change the managed production architecture? → A: Retain the managed architecture, including private RDS, Fargate, the Application Load Balancer, NAT gateway, CloudFront, and WAF; limit cost optimization to safe right-sizing and configuration changes rather than single-host consolidation.
- Q: What monthly AWS cost objective should govern the retained managed architecture? → A: Target an estimated recurring cost of no more than $110 per month for the initial single-user workload and configure the monthly AWS budget alert at $125.
- Q: What database availability level should the one-user production environment use? → A: Retain a Single-AZ `db.t4g.micro` RDS PostgreSQL instance with encryption, private networking, deletion protection, automated backups, and final snapshots; accept possible recovery downtime instead of paying for a Multi-AZ standby.

### Session 2026-08-30

- Q: How should real K-1 parsing work during local development? → A: Add an explicit local-to-AWS BDA mode. Web, API, PostgreSQL, evidence metadata, and the durable work queue remain local; only K-1 objects, KMS operations, and BDA invocations use the approved production-account resources in `us-west-2`.
- Q: May this mode use the production AWS account even though there is no staging stack? → A: Yes, but only through a K-1-scoped command with exact account/resource preflight, short-lived credentials, low paid-work quotas, and no production database, SQS queue, Terraform, or unrelated provider access. Offline stub mode remains the default and all CI remains offline.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Develop Entirely Locally (Priority: P1)

As a developer, I can run and test Project Jackson on my local machine without provisioning or depending on a long-lived AWS development or staging environment.

**Why this priority**: The requested operating model depends on a clear boundary between local development and the only remote runtime, AWS production.

**Independent Test**: Start the documented local stack from a clean checkout with production credentials absent and verify the web app, API, database, migrations, and deterministic provider substitutes operate locally.

**Acceptance Scenarios**:

1. **Given** a developer has the documented local prerequisites, **When** they start the local environment, **Then** the application uses local services and does not require production AWS credentials or endpoints.
2. **Given** production-only settings are absent, **When** local tests and builds run, **Then** they complete without contacting production infrastructure.
3. **Given** a local process is misconfigured with a production endpoint or production AWS identity, **When** the local safety checks run, **Then** the workflow fails before performing a mutating operation.
4. **Given** an operator explicitly starts local BDA mode with an approved short-lived AWS identity, **When** a K-1 PDF is uploaded, **Then** the browser stores it in the approved KMS-encrypted S3 bucket, the PostgreSQL-backed local queue submits it to the LIVE BDA project, and the local reconciler persists the parsed result in local PostgreSQL.
5. **Given** the AWS identity, account, region, bucket ownership/CORS, KMS key, BDA project, or paid-work settings do not match the approved local BDA contract, **When** startup is attempted, **Then** no API, worker, web, or provider process starts.

---

### User Story 2 - Deploy Directly to AWS Production (Priority: P1)

As an operator, I can deploy a reviewed release directly from the validated repository state to the single AWS production environment.

**Why this priority**: There will be no AWS development or staging stack, so the production path must be explicit, repeatable, and protected against accidental deployment.

**Independent Test**: Generate a production plan and release bundle without applying them, verify all required gates and account confirmations, and demonstrate that applying requires an explicit production approval using the same reviewed artifacts.

**Acceptance Scenarios**:

1. **Given** all CI and production readiness checks pass, **When** an authorized operator requests a deployment, **Then** the workflow produces immutable application artifacts and a saved production Terraform plan for review.
2. **Given** the production account, region, state backend, release commit, or plan digest does not match the approved values, **When** deployment is attempted, **Then** the workflow fails before any infrastructure or application mutation.
3. **Given** the reviewed plan and artifacts are approved, **When** the operator enters the explicit production confirmation, **Then** only those approved artifacts are applied to production.

---

### User Story 3 - Protect and Recover Production (Priority: P2)

As an operator, I can detect a failed production release quickly and restore the last known-good application version without improvising infrastructure changes.

**Why this priority**: Removing a remote pre-production environment increases the importance of production guardrails, observability, incremental activation, and rollback.

**Independent Test**: Exercise the deployment workflow in non-applying verification mode, simulate a failed post-deploy health gate, and confirm the documented rollback selects the previous immutable API and web artifacts while preserving data.

**Acceptance Scenarios**:

1. **Given** a deployment has started, **When** health, authentication, scheduler, database, or critical-read smoke checks fail, **Then** activation stops and rollback instructions identify the last known-good release.
2. **Given** a rollback is invoked, **When** the previous release is restored, **Then** database state and production Terraform state are not deleted or recreated.
3. **Given** a plan contains a protected-resource deletion or replacement, **When** the safety gate evaluates it, **Then** deployment is blocked pending a separately approved migration.

---

### User Story 4 - Maintain One Unambiguous Environment Model (Priority: P2)

As a maintainer, I see consistent environment terminology across Terraform, scripts, CI, examples, and operator documentation.

**Why this priority**: The current recovered work mixes local development, AWS development, AWS staging, and AWS production concepts, which can send an operator to the wrong state, account, or variable file.

**Independent Test**: Run a repository governance check that inventories executable deployment entry points and confirms there is one local-development workflow and one AWS-production deployment workflow, with no active AWS staging/development deploy path.

**Acceptance Scenarios**:

1. **Given** a maintainer searches current operational files, **When** environment entry points are enumerated, **Then** local development and AWS production are the only active targets.
2. **Given** historical feature specifications mention staging, **When** governance checks run, **Then** historical records are allowed but cannot be referenced by current deployment automation.

### Edge Cases

- The developer has AWS credentials in their shell while starting the local stack.
- A local variable file points at a production database, bucket, queue, or provider resource.
- A local BDA session expires, the worker exits, or BDA is still processing after the browser reloads.
- The K-1 bucket lacks loopback CORS origins even though its presigned URL and IAM permissions are otherwise valid.
- The production state backend is unavailable, locked, or resolves to the wrong account or region.
- The saved plan changes after approval or was generated from a different commit.
- Terraform proposes replacement of RDS, state storage, KMS, networking, CloudFront, or other protected resources.
- Required production secrets exist by name but are empty, stale, or use the retired scheduler token name.
- Database migrations are irreversible or incompatible with the previous application release.
- The API deployment succeeds but web assets, CloudFront invalidation, schedulers, workers, or health checks fail.
- A bounded-abuse, destructive, or real-provider test is accidentally targeted at production.
- Project branding changes imply physical AWS resource renames rather than display-only metadata updates.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The supported development runtime MUST execute on the developer's local machine using local application processes and a local database. Deterministic local/stub adapters MUST remain the default; AWS BDA MAY be selected only by the explicit scoped mode in FR-028 through FR-033.
- **FR-002**: Local development and automated tests MUST NOT require a long-lived AWS development or staging stack.
- **FR-003**: Local workflows MUST fail closed before mutating a production resource except for the documented K-1 S3/KMS/BDA operations explicitly authorized by FR-028 through FR-033.
- **FR-004**: AWS production MUST be the only active remote deployment environment described by current scripts, variable examples, CI gates, and operator documentation.
- **FR-005**: The repository MUST provide a production-specific deployment entry point and MUST remove or retire the active AWS staging/development deployment entry points.
- **FR-006**: Production deployment MUST consume an ignored production variable file derived from a committed sanitized example; secret values MUST remain outside committed Terraform variables and outputs.
- **FR-007**: Production deployment MUST verify the expected AWS account, region, Terraform backend coordinates, source commit, and artifact identifiers before mutation.
- **FR-008**: Production infrastructure changes MUST be represented by a saved Terraform plan, and the applied plan MUST match the reviewed plan digest.
- **FR-009**: Production deployment MUST require an explicit manual production confirmation after plan review.
- **FR-010**: The deployment workflow MUST run the required application builds, tests, dependency/security checks, Terraform formatting, Terraform validation, Terraform tests, and production guardrails before apply.
- **FR-011**: Production guardrails MUST reject unexpected deletion or replacement of protected state, database, encryption, networking, edge, secret, and observability resources.
- **FR-012**: Production database deletion protection, encryption, private networking, least-privilege access, final snapshots, and encrypted point-in-time recovery retained for at least 35 days MUST remain enabled; recovery evidence MUST demonstrate an RPO of no more than 15 minutes and an RTO of no more than eight hours.
- **FR-013**: Real-provider, bounded-abuse, load, destructive, and fixture-reset tests MUST refuse production targets.
- **FR-014**: Runtime secrets, including the Project Jackson scheduler token, MUST be validated for presence and wiring before application activation without exposing their values.
- **FR-015**: Application artifacts MUST be immutable and traceable to the approved source commit.
- **FR-016**: Post-deployment verification MUST cover health, authentication, critical retained reads, database connectivity, scheduler configuration, workers, logs, alarms, and static web delivery.
- **FR-017**: A failed activation MUST stop further rollout and provide a tested rollback to the last known-good application artifacts without deleting production data or Terraform state.
- **FR-018**: Database migration compatibility and rollback constraints MUST be reviewed before deployment; destructive schema changes require a separate approved migration procedure.
- **FR-019**: Current operational documentation and governance checks MUST use `local` for development and `production` for AWS; historical specifications MAY retain their original terminology.
- **FR-020**: This feature MUST NOT silently migrate the existing AWS region, Terraform backend, or physical resource names; any such migration requires an explicit plan showing state movement and replacement impact.
- **FR-021**: Project Jackson branding MAY update non-destructive labels, documentation, metric namespaces, and new resource defaults, but replacement of existing physical resources MUST be separately approved.
- **FR-022**: Existing ignored local `staging.tfvars`, `production.tfvars`, and Terraform state files MUST NOT be committed, overwritten, moved, or deleted by the implementation workflow.
- **FR-023**: AWS production MUST remain continuously running and available during normal operation; cost controls MUST NOT depend on scheduled shutdown, manual startup, or scaling the API or database to zero.
- **FR-024**: Production compute, database, storage, retention, edge, security, and observability settings MUST be right-sized for the expected single-user workload and MUST avoid nonessential recurring spend without weakening the safeguards required by this specification.
- **FR-025**: Cost optimization MUST retain the managed production boundaries provided by private RDS, Fargate, the Application Load Balancer, NAT gateway, CloudFront, and WAF; it MUST NOT consolidate the API and PostgreSQL onto one EC2 instance or remove these controls solely to reduce cost.
- **FR-026**: The production design MUST target an estimated recurring AWS cost of no more than $110 per month under the documented single-user, low-traffic assumptions and MUST configure an AWS monthly budget alert at $125; the alert MUST notify operators and MUST NOT automatically stop production services.
- **FR-027**: Production PostgreSQL MUST use an explicitly configured Single-AZ `db.t4g.micro` RDS deployment with the data protections required by FR-012; Multi-AZ standby capacity MUST NOT be provisioned for the initial single-user workload unless a later approved availability change revises the cost target.
- **FR-028**: The repository MUST provide `npm run dev:local:bda` as an explicit hybrid provider command; it MUST keep Fastify, Vite, PostgreSQL, migrations, document metadata, and the work/completion queue local while selecting S3, KMS, and Bedrock Data Automation for K-1 documents only.
- **FR-029**: Local BDA startup MUST perform read-only preflight before starting a child process: verify an unexpired AWS identity, exact operator-approved 12-digit account, `us-west-2`, bucket ownership and loopback upload CORS, an enabled matching KMS key, and an accessible LIVE BDA project.
- **FR-030**: Local BDA mode MUST require explicit `aws_bda`/`s3`/`local` adapter settings, enabled K-1 upload/extraction switches, bounded monthly/daily/in-flight paid-work quotas, and empty SQS URLs; it MUST continue to reject remote databases, Terraform production markers, broad AWS mutation flags, and unrelated remote providers/resources.
- **FR-031**: Local BDA identifiers and cost ceilings MUST be supplied from an ignored `.env.local-bda` file based on a sanitized committed example. AWS credentials, tokens, production tfvars, and state MUST NOT be stored in that file or committed.
- **FR-032**: The production K-1 bucket CORS contract MUST allow `PUT` from `http://localhost:5173` and `http://127.0.0.1:5173`; authorization MUST still require a short-lived, single-object presigned request with the expected checksum and KMS headers.
- **FR-033**: When a durable queued K-1 references evidence accepted into local storage before local BDA mode existed, the BDA worker MUST copy and checksum that evidence into the approved KMS-encrypted S3 bucket and atomically replace the document storage identity before creating/submitting an extraction attempt; a failed copy MUST leave the item queued and retryable, and the original local file MUST remain available for recovery.

### Key Entities

- **Local Development Environment**: Developer-owned processes and local PostgreSQL. It uses local files and deterministic substitutes by default; explicit local BDA mode has only the documented K-1 S3/KMS/BDA authority.
- **Local BDA Session**: A short-lived, account-bound hybrid session whose local worker consumes the PostgreSQL queue, submits approved K-1 objects to BDA, and reconciles results back into local PostgreSQL.
- **Production Environment**: The single AWS runtime containing production networking, compute, database, storage, edge, security, secrets, schedulers, workers, and observability.
- **Production Release**: An immutable source commit plus API image, web artifact bundle, database migration set, and release metadata.
- **Production Terraform Plan**: A saved, reviewable infrastructure plan tied to the expected account, region, backend, variables, source commit, and digest.
- **Production Approval**: The explicit authorization to apply one reviewed plan and activate one immutable release.
- **Rollback Checkpoint**: The last known-good application artifact identifiers and compatibility metadata needed to restore service without reverting durable data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clean local checkout can build, test, migrate, and run the retained application flows with zero required production AWS calls.
- **SC-002**: Repository governance reports exactly one active AWS deployment target, `production`, and zero active staging or AWS-development deployment entry points.
- **SC-003**: Every production apply is traceable to one reviewed plan digest, one source commit, one API image digest, and one web artifact manifest.
- **SC-004**: Deployment attempts using the wrong account, region, backend, commit, or altered plan fail before the first mutation in 100% of automated negative tests.
- **SC-005**: Protected-resource deletion or replacement fixtures are rejected in 100% of production guardrail tests.
- **SC-006**: All required CI, Terraform, security, and production readiness checks pass before the production confirmation step becomes available.
- **SC-007**: A simulated failed activation identifies and restores the last known-good application artifacts while retaining database and Terraform state.
- **SC-008**: No production secret values, ignored tfvars, Terraform state, plan files, or provider credentials are added to Git.
- **SC-009**: Cost review identifies every recurring production resource, documents its necessity and expected monthly cost, and confirms that no retained resource is sized for more than the validated single-user workload without an explicit operational reason.
- **SC-010**: The reviewed production plan retains private RDS, Fargate, the Application Load Balancer, NAT gateway, CloudFront, and WAF while applying only validated, non-destructive cost configuration changes.
- **SC-011**: Before production apply, the documented low-traffic cost estimate is no more than $110 per month and the reviewed Terraform configuration shows a $125 monthly AWS budget notification without an automatic service-shutdown action.
- **SC-012**: The reviewed production plan shows exactly one Single-AZ `db.t4g.micro` PostgreSQL instance with encryption, private access, deletion protection, at least 35 days of point-in-time recovery, and a final-snapshot requirement; an isolated restore exercise demonstrates an RPO of no more than 15 minutes and an RTO of no more than eight hours.
- **SC-013**: Automated boundary tests reject wrong-account, wrong-region, SQS, unrelated-provider, broad-mutation, partial-switch, and non-LIVE local BDA fixtures, while the complete approved fixture selects `aws_bda` + S3 + the PostgreSQL-backed local queue; an integration test proves legacy queued evidence is copied to encrypted S3 before BDA invocation.
- **SC-014**: With valid operator-supplied AWS inputs, a real PDF uploaded from either loopback origin leaves `QUEUED`, produces exactly one BDA invocation, survives browser reload, and reaches a reviewable or explicit failed terminal state without synthetic stub output.

## Assumptions

- Development remains on the local machine; no long-lived AWS development or staging environment will be provisioned.
- AWS production continues to use the existing approved account, state, and region unless a separate migration is explicitly authorized.
- The existing production Terraform variable file and local state artifacts may contain sensitive or account-specific data and remain ignored.
- Production deployments are initiated by an authorized operator and require manual approval; merging to the main branch does not automatically apply infrastructure.
- AWS production is expected to serve one user initially and remains available continuously rather than being started and stopped around individual usage sessions.
- The managed separation between application compute, database, networking, edge delivery, and web application protection is retained even where a single-host design would cost less.
- The $110 monthly cost target is an estimate based on the documented single-user traffic profile; provider price changes and usage-based charges can vary, so the $125 budget is an alert threshold rather than a guaranteed cap.
- Single-AZ database recovery downtime is acceptable for the initial single-user workload only while restore evidence satisfies the ratified 15-minute RPO and eight-hour RTO; automated Multi-AZ failover is not required at this stage.
- Normal local development and CI use stubs, mocks, recorded fixtures, or isolated local services. The separately invoked local BDA workflow is ordinary operator-authorized provider use, not an automated, load, or bounded-abuse test.
- The production K-1 Terraform resources must be enabled and applied before local BDA can be activated; creating or changing those resources remains a separately approved production deployment.
- Historical specifications are records and are not rewritten solely to adopt the new environment terminology.
- Eliminating remote pre-production increases operational risk, so stronger plan integrity, protected-resource checks, incremental activation, observability, and rollback gates are required.

## Out of Scope

- Creating an AWS staging or AWS development environment.
- Migrating the production AWS region.
- Renaming existing physical AWS resources when replacement would be required.
- Consolidating the production API and PostgreSQL database onto one EC2 instance or otherwise replacing the retained managed architecture solely for cost reduction.
- Running load, bounded-abuse, destructive, or real-provider test suites against production.
- Using production RDS, SQS, ECS workers, Plaid, market-data providers, CloudWatch log import, or Terraform mutation from the local BDA command.
- Rewriting historical feature specifications that accurately describe earlier decisions.
