# Implementation verification — 2026-09-21

Branch: `031-liquidity-redesign-statement-upload`. Checks ran locally with Node 22.20.0 and a dedicated PostgreSQL fixture database. No deployment, live token revocation, commit or push was performed. Existing unrelated capital-activity edits were preserved.

## Executed checks

| Check | Result |
|---|---|
| API build (`npm run build:api`) | Passed |
| Web production build (`npm run build:web`) | Passed; existing large-bundle advisory remains |
| CSV, migration, backfill, HTTP journeys, history and synthetic retirement database group | **21 files / 65 tests passed; none skipped** |
| Pricing, default-off config, retained reports, exports, performance and route-policy group | **7 files / 36 tests passed** |
| All web report tests | **17 files / 52 tests passed** |
| Live deployment fixtures | **6 tests passed** |
| Terraform formatting | Passed |
| Terraform configuration validation (`-no-tests`) | Passed |
| CSV Terraform mock test | **1 passed**, no live resource calls |
| Environment topology | Passed: local + production, no staging/AWS development |
| Cost envelope | Passed; existing finite workload ceiling retained |
| Runtime dependency audit | Zero findings in API runtime, web runtime and API build/test scopes |
| Web reachability | Passed; three exact legacy Plaid exceptions retained until T072 |
| PostgreSQL dump/restore | 11 source/import tables, 799,724 synthetic rows; counts/content digests match |

Focused application coverage totals **153 tests**, excluding the additional deployment/Terraform checks. Route policy was also rerun after the bounded review-payload allowance; its six tests passed. Resource measurements and the failed 25,000-row stress qualification are reported separately in [performance.md](./performance.md), not hidden in a pass count.

Database command (set `ATLAS_TEST_DATABASE_URL` to the dedicated local fixture DB and `REPORT_EXPORTS_ENABLED=true`):

```powershell
npm run --workspace=api test -- tests/liquidity-statements tests/liquidity-source-migration.integration.test.ts tests/liquidity-source-backfill.integration.test.ts tests/liquidity-csv-journey.integration.test.ts tests/liquidity-csv-history.integration.test.ts tests/liquidity-plaid-retirement.integration.test.ts
```

Separate in-memory/provider regression command (without the test database environment):

```powershell
npm run --workspace=api test -- tests/liquidity-csv-equivalence.test.ts tests/liquidity-market-pricing.test.ts tests/market-data.service.test.ts tests/real-time-equities.config.test.ts tests/reports.consolidated-holdings.export.contract.test.ts tests/reports.liquidity-performance.contract.test.ts tests/abuse-protection/route-policy-coverage.contract.test.ts
npm run --workspace=web test -- src/features/reports
node --test scripts/deployment/live-production.test.mjs
terraform -chdir=infra/aws/terraform fmt -check
terraform -chdir=infra/aws/terraform validate -no-tests
terraform -chdir=infra/aws/terraform test -filter='tests\liquidity_csv_configuration.tftest.hcl'
npm run security:environment-topology
npm run security:cost-envelope
npm run security:audit:runtime
npm run check:web-reachability
```

On this Windows Terraform installation, the backslash test filter is required. A forward-slash filter returned zero tests and was not counted as verification. Full `terraform validate` including all existing test fixtures encountered pre-existing provider-alias fixture errors; normal configuration validation and the feature's actual mock test both pass.

## Remaining repository and operational limitations

- Full `npm run --workspace=web typecheck` remains failing with **72 diagnostics**, principally existing K-1 type-import paths, legacy user/report fixtures, erasable-syntax settings and report-client union typing. No diagnostics were reported in the new CSV client/components or the changed pricing hook/currency components in the recorded run. This is not a clean repository-wide typecheck claim. API TypeScript build passes.
- UI behavior is tested with Testing Library/Vitest. No visual browser/screenshot acceptance or production authenticated user journey is claimed.
- Optional percentage-only/cash-at-par/unverified multiplier estimates remain unavailable; reviewed actual values and signed-dollar basis calculation are supported.
- The default is 5,000 holdings/10 MiB. Raising it toward 25,000 requires more runtime capacity and new measurements.
- Live storage/IAM/CORS/KMS, deployed flag values, real replacement observations, compatible-image rollback and Plaid retirement require the normal release workflow. T072 remains open. See [the runbook](../../../docs/deployment/liquidity-csv-runbook.md).
- The optional `git` after-implement extension (`/speckit.git.commit`, “Auto-commit after implementation”) was not run on this mixed worktree.
