# Production deployment gate evidence

**Run**: 2026-08-29, fixture-only; no AWS calls or mutations

| Gate | Sanitized result |
|---|---|
| Topology, smoke-contract, cost, and local-only abuse tests | PASS; 12 tests |
| Shared production plan policy | PASS; all core positive and negative fixtures |
| Production plan adapter | PASS; hashes/modes bound and exactly one policy invocation |
| Legacy guardrail wrapper | PASS; zero independent rules and preserved success/failure exit codes |
| Release primitives | PASS; schemas, paths, hashes, checkpoints, append-only evidence, redaction |
| Secret preflight | PASS; existence, `AWSCURRENT`, VersionId, wiring, drift, redaction |
| Production smoke | PASS; 14 ordered named checks and prohibited-call enforcement |
| Deployment flow | PASS; Plan, Bootstrap, Prepare, exact-artifact Apply, failed activation, artifact-only Rollback |
| Cost calculation | PASS; $98.02 fixed, $104.00 upper, $110 target, $125 notification-only Budget, 0 unpriced resources |
| Linux production shape | PASS; amd64, 0.25 vCPU/0.5 GiB, migrations, readiness, pinned CA, 7 retained reads |

Negative fixtures reject wrong identity/hash, protected deletion/replacement,
capacity drift, stale secrets, cost drift, altered artifacts, invalid checkpoint,
migration incompatibility, prohibited provider/mutation smoke calls, and secret
sentinels. Fixture Rollback has no Terraform or database-rewind capability.
