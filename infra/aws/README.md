# Jackson AWS Liquidity Deployment

This directory tracks the AWS deployment path for the Plaid refresh policy and cost-abuse protection features. Staging is created manually in the AWS console first for learning and inspection, then mirrored in Terraform for comparison. Production follows the same topology after staging is validated. Terraform becomes the source of truth only after each environment's manual resources and plan differences are reviewed.

## Security and cost guardrails

- Bootstrap the versioned SSE-KMS remote-state bucket and lockfile configuration separately before ordinary plans.
- CloudFront is the only public origin path; the API ALB is internal, accepts the CloudFront managed prefix list, drops invalid headers, uses strict desync mitigation, and enables deletion protection in production.
- WAF managed rules plus general, auth, paid-path, and global-emergency rate rules protect every public request path. Keep new rules in count mode through the documented staging observation window before block mode.
- API and K-1 worker desired counts are fixed and capped; request-count-driven autoscaling is intentionally absent.
- ECR, K-1 quarantine/evidence objects, WAF logs, application logs, and database backups all have explicit retention policies.
- Production plans require confirmed alarm and budget destinations. Total and Bedrock actual/forecast budgets and Cost Anomaly Detection are delay-tolerant notifications, not real-time circuit breakers.
- Application quotas and seven audited workload controls are the real-time paid-work ceiling. See [the response runbook](./cost-abuse-response-runbook.md) for exact containment and rollback commands.

Before deployment, run from the repository root:

```powershell
npm run security:audit:runtime
npm run security:cost-envelope
npm run security:route-policy
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false
terraform -chdir=infra/aws/terraform validate
terraform -chdir=infra/aws/terraform test
```

Use `scripts/security/validate-terraform-guardrails.ps1` against sanitized staging and production plan JSON before apply. Recovery restores the last known-good task definition/configuration, keeps paid switches disabled during uncertainty, and re-enables one scoped workload only after dashboards and durable read paths are healthy.

## Deployment Shape

- One public app domain per environment serves the React/Vite web app and the API, for example `staging.example.com` and `app.example.com`.
- CloudFront default behavior serves static assets from S3.
- CloudFront `/v1/*` behavior forwards API traffic to the ECS/Fargate API origin with no shared caching for authenticated financial responses.
- The API runs as a Node 22 container and listens on port `3000`.
- RDS PostgreSQL is private and accepts `5432` only from the API service security group.
- Secrets are stored in environment-specific Secrets Manager entries and injected at runtime.
- EventBridge Scheduler triggers the daily Plaid refresh at `05:00` in `America/Los_Angeles`.
- CloudWatch, WAF, Route 53/ACM, IAM, and AWS Budgets are part of both the staging and production baselines.

## Environment Files

Use one reusable Terraform root stack with separate local tfvars files:

| Environment | Committed template | Local ignored file | Notes |
|---|---|---|---|
| `staging` | `staging.tfvars.example` | `staging.tfvars` | Cheaper production-like settings, sandbox Plaid credentials, lower budget |
| `production` | `production.tfvars.example` | `production.tfvars` | Production-safe retention, deletion protection, production launch budget |

The generic `terraform.tfvars.example` points to the environment-specific examples and should not be used directly for plans.

## Manual First, Terraform Second

Record manually created AWS resource identifiers here as you create them. Keep staging and production evidence separate. Use the Terraform address column after the matching module resource exists. `Match Status` should be one of `Not reviewed`, `Matches`, `Intentional difference`, `Import needed`, or `Do not manage with Terraform`.

| Environment | Resource | Manual Value | Terraform Address | Match Status | Notes |
|---|---|---|---|---|---|
| staging | App domain |  |  | Not reviewed |  |
| staging | Route 53 hosted zone |  |  | Not reviewed |  |
| staging | ACM certificate ARN |  |  | Not reviewed | CloudFront viewer certificate must be in `us-east-1`. |
| staging | VPC |  |  | Not reviewed |  |
| staging | Private subnet ids |  |  | Not reviewed |  |
| staging | API security group |  |  | Not reviewed |  |
| staging | RDS security group |  |  | Not reviewed | Inbound `5432` only from API security group. |
| staging | RDS instance endpoint |  |  | Not reviewed | Do not paste credentials here. |
| staging | Secrets Manager secret ARNs |  |  | Not reviewed | Names/ARNs only, never values. |
| staging | ECR repository URI |  |  | Not reviewed |  |
| staging | ECS service |  |  | Not reviewed |  |
| staging | S3 web assets bucket |  |  | Not reviewed |  |
| staging | CloudFront distribution |  |  | Not reviewed | Default static behavior plus `/v1/*` API behavior. |
| staging | WAF web ACL ARN |  |  | Not reviewed |  |
| staging | EventBridge schedule ARN |  |  | Not reviewed |  |
| staging | CloudWatch alarms |  |  | Not reviewed |  |
| staging | AWS Budget |  |  | Not reviewed | Lower non-production threshold is intentional. |
| production | App domain |  |  | Not reviewed |  |
| production | Route 53 hosted zone |  |  | Not reviewed |  |
| production | ACM certificate ARN |  |  | Not reviewed | CloudFront viewer certificate must be in `us-east-1`. |
| production | VPC |  |  | Not reviewed |  |
| production | Private subnet ids |  |  | Not reviewed |  |
| production | API security group |  |  | Not reviewed |  |
| production | RDS security group |  |  | Not reviewed | Inbound `5432` only from API security group. |
| production | RDS instance endpoint |  |  | Not reviewed | Do not paste credentials here. |
| production | Secrets Manager secret ARNs |  |  | Not reviewed | Names/ARNs only, never values. |
| production | ECR repository URI |  |  | Not reviewed |  |
| production | ECS service |  |  | Not reviewed |  |
| production | S3 web assets bucket |  |  | Not reviewed |  |
| production | CloudFront distribution |  |  | Not reviewed | Default static behavior plus `/v1/*` API behavior. |
| production | WAF web ACL ARN |  |  | Not reviewed |  |
| production | EventBridge schedule ARN |  |  | Not reviewed |  |
| production | CloudWatch alarms |  |  | Not reviewed |  |
| production | AWS Budget |  |  | Not reviewed |  |

## Terraform Comparison Fields

Use this review shape before allowing Terraform to become source of truth:

| Field | Meaning |
|---|---|
| Environment | staging or production |
| Resource group | DNS, network, database, secrets, API, edge, scheduler, observability, budget, or IAM |
| AWS resource id | Console id, ARN, DNS name, or generated name; never a secret value |
| Terraform address | Example: `module.api.aws_ecs_service.api` |
| Manual value | The console/runtime value that matters for behavior |
| Terraform value | The planned value from Terraform |
| Match status | Matches, intentional difference, import needed, replace acceptable, or manual-only |
| Notes | Why a difference exists and who approved it |
| Reviewed at | Review date and reviewer |

## Drift Review Process

1. Create the staging manual environment from `manual-liquidity-deployment.md`.
2. Copy `staging.tfvars.example` to local ignored `staging.tfvars` and set only non-secret identifiers such as the staging app domain, hosted zone id, notification emails, and sizing.
3. Run `terraform fmt`, `terraform validate`, and `terraform plan -var-file staging.tfvars`.
4. Repeat with `production.tfvars.example` copied to local ignored `production.tfvars` before production creation or import.
5. Run `terraform plan -var-file production.tfvars`.
6. Save only sanitized summaries of plan differences. Do not commit a raw plan file if it contains account ids or sensitive metadata you do not want in git.
7. For existing manual resources, choose one of:
   - import into Terraform state
   - intentionally recreate during a planned cutover
   - leave manual for now and document why
8. Confirm Terraform outputs expose only names, ARNs, ids, DNS names, and environment review metadata, not secret values.
9. Review cost-impacting differences such as NAT gateways, RDS class/storage, CloudFront/WAF settings, log retention, and budgets before apply. Staging reductions must be intentional and documented.

## Phase 1 Status

Phase 1 creates only the deployment scaffolding:

- API Dockerfile
- AWS manual deployment runbook
- production readiness checklist
- Terraform root files
- application config fields for refresh policy, scheduler, security, and AWS metadata

Do not create RDS, ECS, CloudFront, or EventBridge solely for Phase 1. Create those services when the relevant application behavior exists and can be validated.

## Phase 7 Local Terraform Status

Terraform now models the target baseline locally:

- VPC, public/private subnets, NAT, and security groups
- private RDS PostgreSQL with AWS-managed master secret
- Secrets Manager placeholders for runtime secrets
- ECR, ECS/Fargate API service, ALB origin, IAM roles, and CloudWatch logs
- S3 web bucket and CloudFront distribution with `/v1/*` API behavior
- WAF managed rules, rate limiting, and WAF logs
- EventBridge Scheduler running separate one-shot Plaid holdings and end-of-day market-price tasks
- CloudWatch alarms and optional SNS email notifications
- AWS Budget with optional email thresholds

This is still a comparison scaffold until manual AWS resources exist and are reviewed.

## Phase 8 Environment Status

The Terraform scaffold now supports environment-specific review:

- `environment_name` and `environment_cost_profile` distinguish `staging` from `production`.
- `staging.tfvars.example` keeps the production topology with lower task sizing, log retention, storage ceiling, recovery window, and budget.
- `production.tfvars.example` keeps production-safe deletion protection, retention, and budget defaults.
- Environment-qualified outputs make it easier to compare staging and production without exposing secret values.

Do not apply production until staging has passed health, auth, Plaid sandbox, scheduler, WAF, alarm, budget, and Terraform comparison checks.

## Secret Rules

- Store staging and production secrets in separate AWS Secrets Manager namespaces.
- Keep local `.env` files for development only.
- Never commit Plaid or market-data credentials, database URLs with credentials, scheduler tokens, session tokens, MFA secrets, `PERSISTENCE_SECRET_KEY`, Terraform state, or real `*.tfvars`.
- Record only secret names or ARNs in documentation.
- Never reuse production database credentials, Plaid production credentials, scheduler tokens, admin bootstrap credentials, or persistence keys in staging.
