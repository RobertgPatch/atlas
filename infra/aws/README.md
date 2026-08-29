# Atlas AWS production infrastructure

Atlas development runs on the developer machine. AWS contains one active
application target, `production`, in `us-west-2`; CloudFront certificates are
managed in `us-east-1`. There is no remote development or rehearsal target.

## Retained managed architecture

- CloudFront serves the private, versioned S3 web bundle and forwards `/v1/*`
  to WAF, an internal Application Load Balancer, and one always-on Fargate API
  task (256 CPU units, 512 MiB, x86_64).
- One NAT gateway supports private outbound traffic. RDS PostgreSQL is private,
  encrypted, Single-AZ `db.t4g.micro` with 20 GiB gp3, deletion protection,
  final snapshots, and 35 days of point-in-time recovery.
- Secrets Manager, KMS, CloudWatch, EventBridge, Budgets, and the current
  feature-scoped worker resources remain managed. K-1 AWS ingestion and its
  dedicated alarms are absent when that feature is disabled.
- The backend bucket/key/region, default workspace, and deployed `Atlas` or
  `ProjectJackson` physical names are retained compatibility identifiers. They
  do not imply another active environment and must not be renamed casually.

## Production release workflow

`infra/aws/terraform/production.tfvars.example` is the only committed remote
variable example. Copy it to ignored `production.tfvars` and supply non-secret
operator values locally. Never commit real tfvars, state, saved plans, raw plan
JSON, credentials, smoke credentials, or release bundles.

From a clean commit, use:

```powershell
npm run deploy:aws:production -- -Mode Plan
npm run deploy:aws:production -- -Mode Prepare
npm run deploy:aws:production -- -Mode Apply
```

`Plan` is read-only. `Prepare` validates the target, STS identity, backend,
workspace, variables, live secret versions, current cost model, immutable
artifacts, and the saved plan. `Apply` accepts only the prepared manifest and
exact saved plan, requires the exact production confirmation, then runs the
ordered read-only smoke contract. `Bootstrap` is a separate, single-use,
create-only capacity-zero operation. Merging code never deploys automatically.

The compatibility script `scripts/security/validate-terraform-guardrails.ps1`
contains no rules; it delegates to `validate-production-plan.ps1`, which calls
the single `production-plan-policy.psm1` engine.

## Current cost envelope

The `us-west-2` on-demand model was refreshed from official AWS price catalogs
on 2026-08-29. It assumes 730 hours, one user, one API task, and disabled paid
K-1 inference. Evidence expires after 30 days and must be refreshed before
Prepare.

| Recurring resource | Monthly USD |
|---|---:|
| NAT gateway + public IPv4 | 36.50 |
| Internal ALB | 16.43 |
| RDS compute + 20 GiB gp3 | 13.98 |
| Fargate API | 9.01 |
| WAF | 13.00 |
| Thirteen retained Secrets Manager entries | 5.20 |
| Two KMS keys | 2.00 |
| Nineteen active alarms | 1.90 |
| **Fixed subtotal** | **98.02** |
| Low-traffic and recovery-operation allowance | **5.98** |
| **Upper estimate** | **104.00** |

The allowance covers bounded ALB/WAF/CloudFront requests, NAT data, scheduled
task time, Route 53, ECR/S3, KMS requests, logs, automated backup storage within
the RDS allocation, and the prorated quarterly isolated restore exercise (about
$0.013/month for a two-hour quarterly `db.t4g.micro` plus 20 GiB gp3 restore). A
reviewed plan that exceeds those assumptions, adds an unpriced recurring
resource, enables paid inference, or estimates above $110 fails closed. The
$125 monthly Budget sends notifications only and performs no service action.

Rate evidence comes from the AWS Price List catalogs for ECS, RDS, and ELB plus
the official VPC, WAF, Secrets Manager, KMS, CloudWatch, CloudFront, and RDS
pricing pages listed in the production cost contract.

## Recovery

ECS circuit-breaker rollback and the versioned web bucket preserve the prior
release. `-Mode Rollback` validates the last known-good checkpoint and migration
set, requires `ROLLBACK PRODUCTION TO <release-id>`, restores only immutable API
and web artifacts, and reruns every smoke check. It never applies Terraform,
rewinds state, runs down migrations, or restores the database.

RDS recovery has a 15-minute RPO and eight-hour RTO objective. Perform a
quarterly encrypted restore into an isolated network, verify integrity and the
retained reads, record timings, and remove the exercise copy only after review.
Single-AZ recovery can include downtime.

See [manual-liquidity-deployment.md](manual-liquidity-deployment.md),
[cost-abuse-response-runbook.md](cost-abuse-response-runbook.md), and
`docs/deployment/aws-liquidity-production-readiness.md` for operator controls.
