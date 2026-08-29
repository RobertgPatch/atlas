# Production Terraform Plan Policy

## Inputs

- Opaque saved Terraform plan and its SHA-256.
- Transient `terraform show -json` representation.
- Expected production target identity: environment, account, region, workspace, and backend fingerprint.
- Production tfvars SHA-256.
- Production target descriptor and SHA-256.
- Secret-requirements contract and SHA-256.
- Production cost workload/rate model and generated estimate.
- Source commit and release ID.
- Explicit policy mode: `Routine` or `Bootstrap`.

The raw JSON is never committed, retained as a normal log, or copied into the policy result.

## Required environment assertions

- `environment_name == "production"`.
- `environment_cost_profile == "production"`.
- Planned provider region equals `us-west-2` from the committed target descriptor, ignored tfvars, and manifest.
- Availability zones share the target region prefix and the CloudFront certificate region remains `us-east-1`.
- Workspace equals `default`.
- Backend fingerprint equals the manifest fingerprint.
- The plan source commit and production tfvars hash equal the manifest values.

## Required absolute production controls

- RDS deletion protection is enabled.
- RDS final snapshot skipping is disabled.
- RDS backup retention meets the production minimum.
- RDS storage and connections are encrypted/private as defined by existing modules.
- ALB deletion protection and strict security posture remain enabled.
- CloudFront remains the public path and `/v1/*` is not shared-cached.
- Required WAF managed/general/auth/paid/global-emergency rules exist with production block actions.
- Alarm and budget destinations are non-null and explicitly confirmed.
- ECS desired/max capacity and cost-control runtime settings are finite.
- Routine API desired count is exactly one. Bootstrap capacity zero is accepted only under the single-use create-only exception below.
- ECR production tags are immutable.
- ECS deployment circuit breaker and rollback are enabled.
- Scheduler and worker paid workloads are wired to the required admission/cost controls.
- Every currently required secret/consumer from the committed contract is referenced through ECS secret wiring, IAM is scoped to the required ARNs, retired aliases are absent, and secret keys are not rendered as plaintext environment values. Live existence/value checks are owned by deployment preflight, not this validator.
- K-1 storage encryption, lifecycle, queue/DLQ, worker, and reconciliation guardrails remain intact when enabled.
- K-1-only alarms/resources are absent when AWS K-1 ingestion is disabled and present with their safeguards when enabled.
- The estimate includes every recurring planned resource, is at most $110 for the documented workload, and the $125 Budget has notification subscribers but no service action.

## Policy ownership

`scripts/security/production-plan-policy.psm1` is the only policy engine. It owns plan parsing, action classification, protected-resource matching, absolute-control checks, mode-specific capacity, sensitive redaction, and policy-result construction.

`scripts/security/validate-production-plan.ps1` validates release/identity/backend/hash inputs and calls the engine once. The existing `validate-terraform-guardrails.ps1` may remain temporarily only as a thin repository/CI compatibility wrapper that delegates to the same module. It contains no independent rules. Core fixtures target the module; wrapper tests cover only arguments and exit-code delegation.

## Mode-specific capacity

### Routine

- API desired count is exactly one.
- The service is continuously available; no schedule or manual switch can reduce it to zero.
- Rollback retains desired count one.

### Bootstrap

- Remote state has no API ECS service and no successful activation checkpoint.
- The API service action is create-only with desired count zero.
- Workers are zero, schedules are disabled, and web assets are not activated.
- Any update from one to zero, existing service, prior checkpoint, or repeated Bootstrap fails closed.

## Change action policy

| Action set | Result |
|------------|--------|
| no-op | Allow |
| create | Allow if all controls pass and the address is expected by current configuration |
| update | Allow if all controls pass |
| delete | Reject |
| delete then create | Reject as replacement |
| create then delete | Reject as replacement |
| read only | Allow |
| unrecognized action sequence | Reject |

The policy has no general bypass. A deletion, replacement, state move, region migration, or physical-resource rename requires a separate feature with an explicit migration policy.

## Protected resource classes

Deletion or replacement errors receive a `protected-resource` classification for at least:

- S3 Terraform state bucket, lock object policy, and state KMS key in the bootstrap stack;
- VPC, subnets, route tables, NAT, security groups, and load balancer;
- RDS instance, subnet group, parameter/configuration resources, and master secret;
- ECR repository, ECS cluster, ECS services, and task execution/task roles;
- web/K-1 buckets and KMS keys;
- CloudFront distribution, ACM validation, WAF ACL/logging, and Route 53 records;
- Secrets Manager secrets;
- EventBridge Scheduler schedules and roles;
- SQS queues/DLQs and K-1 worker resources;
- CloudWatch log groups, alarms, dashboards, SNS topics/subscriptions, budgets, and anomaly monitors.

All other deletions still fail under the default zero-deletion policy.

## Policy result

The validator writes a compact result bound to the saved plan hash:

```json
{
  "schemaVersion": "1.0.0",
  "planSha256": "<64 lowercase hex>",
  "evaluatedAt": "<RFC3339 UTC>",
  "policyMode": "Routine",
  "environmentVerified": true,
  "guardrailsVerified": true,
  "deletionCount": 0,
  "replacementCount": 0,
  "protectedFindings": [],
  "warnings": []
}
```

The result contains resource addresses and rule identifiers when a finding exists, but never before/after values from sensitive attributes.

## Required test fixtures

- Passing no-change production plan.
- Passing safe create/update production plan.
- Wrong environment, region, workspace, backend, and tfvars hash.
- Delete and both replacement action orders for each protected category.
- Unknown action sequence.
- Missing RDS/WAF/alarm/budget/capacity/ECR/ECS rollback/secret/K-1 controls.
- Routine desired count other than one; Bootstrap replay, existing-service scale-down, enabled schedule, worker capacity, or non-create API action.
- Missing/unpriced recurring cost resource, estimate above $110, wrong $125 threshold, or Budget action.
- Secret contract consumer missing, plaintext secret key, broad IAM, wrong account/region ARN, or retired alias.
- Sensitive before/after values proving diagnostics remain redacted.
- Terraform JSON major version mismatch.
