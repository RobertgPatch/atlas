# Production Plan Fixture Safety

Plan-policy fixtures are hand-authored synthetic Terraform JSON fragments. They must contain only fake resource addresses and placeholder identifiers; never copy `terraform show -json`, state, tfvars, backend data, provider responses, account IDs, secret ARNs, or sensitive before/after values from a real environment.

Redaction fixtures may contain `SENTINEL_SECRET_MUST_NOT_LEAK`, and tests must prove that value never appears in diagnostics or result artifacts. Saved plans and raw plan JSON remain under ignored `.artifacts/` and are not normal test fixtures.
