# Deployment Fixture Safety

Fixtures in this directory are synthetic and must never contain real AWS account IDs, ARNs, backend coordinates, domains, credentials, database URLs, cookies, TOTP values, secret versions, Terraform state, saved plans, or provider output.

Use unmistakable sentinels such as `SENTINEL_SECRET_MUST_NOT_LEAK` when testing redaction. Tests must assert the sentinel is absent from stdout, stderr, exceptions, manifests, policy results, execution records, and smoke evidence.

Fixture commands may simulate Plan, Bootstrap, Prepare, Apply, smoke failure, and Rollback, but they must inject provider/process adapters and must never invoke a real AWS mutation or `terraform apply`.
