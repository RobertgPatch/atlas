# Production Cost Model Contract

## Purpose

This contract makes FR-026 and SC-011 reproducible. It is a planning estimate for the retained managed architecture, not a guaranteed AWS invoice or an availability control. The implementation recalculates it from the reviewed production plan before Prepare/Apply and fails if the upper-bound estimate exceeds $110. The 2026-08-29 evidence includes 35-day point-in-time recovery, the quarterly isolated restore exercise, active monitoring, and the accepted one-user workload assumptions.

## Canonical workload profile

| Assumption | Baseline |
|---|---:|
| Region | `us-west-2` |
| Billing month | 730 hours |
| Human users | 1 |
| Concurrent interactive sessions | 1 |
| Application requests | At most 10,000/month |
| NAT processed data | At most 1 GiB/month |
| CloudWatch ingested/retained logs | At most 1 GiB/month; API and WAF retention remain 30 days |
| ECR storage | At most 2 GiB; approximately 10 immutable releases and 3-day untagged retention |
| S3 web/K-1 data used by cost baseline | At most 5 GiB |
| RDS storage | 20 GiB gp3; at least 35 days of point-in-time recovery and isolated recovery copies priced from the reviewed plan without assuming zero incremental cost |
| Scheduled Fargate tasks | Daily Plaid plus weekday market close, under 5 task-hours/month |
| K-1 AWS ingestion | Disabled; worker tasks and K-1-only alarms absent |
| Bedrock/BDA paid calls | 0; enabling them changes the estimate |
| Production API | One task, always on; no normal scale-to-zero |

A plan that enables K-1 AWS ingestion, adds paid inference, exceeds these quantities, or introduces another recurring resource must add the corresponding line item before it can pass.

## 2026-08-29 accepted estimate

Public on-demand rates were refreshed from the official AWS catalogs and pricing pages for `us-west-2` on 2026-08-29 and use 730 hours.

| Resource | Unit assumption | Monthly USD |
|---|---|---:|
| NAT gateway | $0.045/hour | 32.85 |
| NAT public IPv4 | $0.005/hour | 3.65 |
| Internal ALB | $0.0225/hour | 16.43 |
| RDS PostgreSQL Single-AZ `db.t4g.micro` | $0.016/hour | 11.68 |
| RDS gp3 storage | 20 GiB at $0.115/GiB-month | 2.30 |
| Fargate API x86 | 0.25 vCPU/0.5 GiB, always on | 9.01 |
| WAF | One ACL plus eight rule/group charges | 13.00 |
| Secrets Manager | Thirteen secrets at $0.40 | 5.20 |
| Customer-managed KMS | Two keys | 2.00 |
| CloudWatch alarms | Nineteen active-component alarms at $0.10 | 1.90 |
| **Fixed subtotal** |  | **98.02** |

The upper-bound low-traffic and recovery allowance for ALB LCUs, WAF/CloudFront requests, NAT processing, scheduled tasks, Route 53, ECR/S3 storage, KMS requests, CloudWatch ingestion, and recovery operations is $5.98. Automated RDS backup storage up to the allocated database storage is priced at $0 under the documented AWS allocation. A quarterly isolated two-hour restore contributes approximately $0.013/month when annualized: `db.t4g.micro` compute plus prorated 20 GiB gp3 storage. The accepted upper estimate is therefore **$104.00/month**. Usage beyond these bounds requires refreshed evidence and cannot silently reuse the allowance.

The thirteen-secret cost row conservatively includes the existing `PLAID_ENV` secret metadata even after `PLAID_ENV` stops being wired as a secret. This feature's zero-deletion policy does not assume that legacy metadata is destroyed; a later reviewed cleanup can remove its $0.40/month after proving it is unreferenced.

The current 0.5 vCPU/1 GiB task and all 33 alarms have an estimated fixed subtotal of $108.43 and expected total of $109-$113. That shape is not accepted merely because its midpoint is below $110.

## Required safeguards and optimizations

- Keep private RDS, Fargate, ALB, NAT, CloudFront, and WAF.
- Keep one API task continuously available after first activation.
- Explicitly configure Single-AZ `db.t4g.micro`, 20 GiB gp3, encryption, private networking, deletion protection, at least 35 days of point-in-time recovery, isolated encrypted recovery copies, and final snapshots.
- Monitor daily backup success and prove the 15-minute RPO and eight-hour RTO through quarterly isolated restore exercises.
- Validate 0.25 vCPU/0.5 GiB using the Linux production image, migrations, readiness, and retained reads before changing Terraform.
- Instantiate alarms for K-1 worker/queue workflows only when K-1 AWS ingestion is enabled. Monitoring for active components remains mandatory.
- Retain approximately ten immutable API releases and remove untagged images after three days.
- Keep 30-day API and WAF logs; enforce the 1 GiB/month baseline through log hygiene and anomaly alarms rather than shortening required evidence without review.
- Keep the $125 AWS Budget notification-only. It must not stop or scale services.
- Do not require ARM64 or a savings commitment to satisfy this feature. Reconsider them only after real utilization is known.

## Machine-verifiable estimate

The cost validator consumes the reviewed Terraform plan/configuration and emits only non-secret evidence. The committed fixture is valid for at most 30 days; Prepare must use refreshed evidence after that window:

```json
{
  "schemaVersion": "1.0.0",
  "region": "us-west-2",
  "pricingRetrievedAt": "2026-08-29T00:00:00Z",
  "hoursPerMonth": 730,
  "fixedMonthlyUsd": 98.02,
  "usageUpperBoundMonthlyUsd": 5.98,
  "estimatedMonthlyUsd": 104.00,
  "targetMonthlyUsd": 110.00,
  "budgetThresholdUsd": 125.00,
  "budgetActionCount": 0,
  "workloadProfileMatched": true,
  "unpricedRecurringResources": []
}
```

Pass requires:

- target descriptor, estimate, tfvars, and plan regions agree;
- every recurring planned resource maps to a price row or documented zero-cost tier;
- `estimatedMonthlyUsd <= 110`;
- `budgetThresholdUsd == 125`;
- no Budget action stops or changes production services;
- no unpriced recurring resources;
- automated backup allocation and restore-test operations are explicitly priced;
- paid features with a zero usage assumption are disabled in the plan;
- API desired count is one in Routine mode.

Prices are rounded only after line-item multiplication. Tests use fixture rates; live price retrieval failure blocks production preparation rather than silently reusing an undated estimate.

## Post-deployment validation

At 7 and 30 days after first activation, compare Cost Explorer service totals with the model. Investigate any projected month above $110 or actual anomaly before adding capacity. A price or usage increase does not authorize scheduled shutdown, managed-boundary removal, or automatic Budget actions.

## Official pricing sources

- [AWS Fargate `us-west-2` public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/us-west-2/index.json)
- [AWS RDS `us-west-2` public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-west-2/index.json)
- [AWS ELB `us-west-2` public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-west-2/index.json)
- [AWS EC2/VPC `us-west-2` public catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-west-2/index.csv)
- [AWS VPC pricing](https://aws.amazon.com/vpc/pricing/)
- [AWS WAF pricing](https://aws.amazon.com/waf/pricing/)
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/)
- [AWS CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
