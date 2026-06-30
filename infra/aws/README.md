# Atlas AWS Liquidity Deployment

This directory tracks the first AWS deployment path for the Plaid refresh policy feature. The initial environment is created manually in the AWS console for learning and inspection, then mirrored in Terraform for comparison before Terraform becomes the source of truth.

## Deployment Shape

- One public app domain serves the React/Vite web app and the API.
- CloudFront default behavior serves static assets from S3.
- CloudFront `/v1/*` behavior forwards API traffic to the ECS/Fargate API origin with no shared caching for authenticated financial responses.
- The API runs as a Node 22 container and listens on port `3000`.
- RDS PostgreSQL is private and accepts `5432` only from the API service security group.
- Secrets are stored in Secrets Manager and injected at runtime.
- EventBridge Scheduler triggers the daily Plaid refresh at `05:00` in `America/Los_Angeles`.
- CloudWatch, WAF, Route 53/ACM, IAM, and AWS Budgets are part of the production baseline.

## Manual First, Terraform Second

Record manually created AWS resource identifiers here as you create them:

| Resource | Manual Value | Terraform Address | Match Status | Notes |
|---|---|---|---|---|
| App domain |  |  | Not reviewed |  |
| Route 53 hosted zone |  |  | Not reviewed |  |
| ACM certificate ARN |  |  | Not reviewed | CloudFront viewer certificate must be in `us-east-1`. |
| VPC |  |  | Not reviewed |  |
| Private subnet ids |  |  | Not reviewed |  |
| API security group |  |  | Not reviewed |  |
| RDS security group |  |  | Not reviewed | Inbound `5432` only from API security group. |
| RDS instance endpoint |  |  | Not reviewed | Do not paste credentials here. |
| Secrets Manager secret ARNs |  |  | Not reviewed | Names/ARNs only, never values. |
| ECR repository URI |  |  | Not reviewed |  |
| ECS service |  |  | Not reviewed |  |
| S3 web assets bucket |  |  | Not reviewed |  |
| CloudFront distribution |  |  | Not reviewed | Default static behavior plus `/v1/*` API behavior. |
| WAF web ACL ARN |  |  | Not reviewed |  |
| EventBridge schedule ARN |  |  | Not reviewed |  |
| CloudWatch alarms |  |  | Not reviewed |  |
| AWS Budget |  |  | Not reviewed |  |

## Phase 1 Status

Phase 1 creates only the deployment scaffolding:

- API Dockerfile
- AWS manual deployment runbook
- production readiness checklist
- Terraform root files
- application config fields for refresh policy, scheduler, security, and AWS metadata

Do not create RDS, ECS, CloudFront, or EventBridge solely for Phase 1. Create those services when the relevant application behavior exists and can be validated.

## Secret Rules

- Store production secrets in AWS Secrets Manager.
- Keep local `.env` files for development only.
- Never commit Plaid secrets, database URLs with credentials, scheduler tokens, session tokens, MFA secrets, `PERSISTENCE_SECRET_KEY`, Terraform state, or `*.tfvars`.
- Record only secret names or ARNs in documentation.
