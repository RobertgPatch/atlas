# Terraform gate evidence

**Run**: 2026-08-29, Terraform 1.11.4, backend disabled

| Gate | Sanitized result |
|---|---|
| `terraform fmt -check -recursive` | PASS |
| `terraform init -backend=false -input=false` | PASS; locked provider versions reused |
| `terraform validate -no-tests` | PASS |
| `terraform test` | PASS; 19 passed, 0 failed |

The native tests cover private origin/WAF controls, active-component alarms,
notification-only Budget behavior, one always-on right-sized API, disabled K-1
cost paths, private recoverable Single-AZ RDS, ECS automatic rollback, versioned
private web recovery, preserved encrypted state identity, and fixed runtime
capacity. No backend connection, plan, or apply occurred.
