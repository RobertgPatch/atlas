# Spec 028 Pruning Manifest

This manifest is the implementation evidence and review authority for pruning unreachable product flows. Decisions follow [data-model.md](./data-model.md) and [contracts/retained-surface.md](./contracts/retained-surface.md). Uncertainty is recorded as `DEFER`; it is never treated as permission to delete.

## Manifest status

| Field | Value |
|---|---|
| Feature branch | `028-prune-unreachable-flows` |
| Implementation status | Complete; all Spec 028 deletion groups verified and no retained-flow regression remains |
| Baseline commit | `a373395fea9c2185d9819337212fc6d64cd42a56` |
| Baseline subject | `fix(api): finalize synchronous cost workloads` |
| Baseline authority | Remote head of `origin/027-implement-vulnerability-fix` at implementation start |
| Upstream `origin/main` | `8426e3a338b0e323b0dc60d4260fdca49c9e135e` (ancestor of baseline) |
| Captured at | 2026-08-26 America/Los_Angeles |

## Baseline identity and prerequisites

### Clean-baseline decision

- Spec 027 is captured by commit `a373395fea9c2185d9819337212fc6d64cd42a56`, which matches `origin/027-implement-vulnerability-fix` at baseline capture.
- PR 027 was still open at branch creation, so this feature branch intentionally starts from the latest Spec 027 remote head instead of omitting its security work.
- `origin/main` is an ancestor of the implementation baseline. The branch therefore includes the latest fetched mainline state available at creation.
- The worktree contained only Spec 028 planning/selection metadata plus the `.gitignore` CodeBoarding entry: `.gitignore`, `.specify/feature.json`, `AGENTS.md`, and `specs/028-prune-unreachable-flows/`. It contained no uncommitted Spec 027 application, test, dependency, or Terraform code.
- Unrelated Project Jackson AWS/Terraform work is isolated in `stash@{0}` (`infra: preserve Project Jackson AWS changes before 028`) and is outside this implementation baseline.

### Toolchain and prerequisite result

| Check | Actual | Status |
|---|---|---|
| Branch | `028-prune-unreachable-flows` | PASS |
| Node.js | `v22.20.0` | PASS (plan requires Node 22+) |
| npm | `10.9.3` | PASS |
| Spec Kit prerequisites | `FEATURE_DIR=D:\Projects\atlas\specs\028-prune-unreachable-flows`; research, data model, contracts, quickstart, and tasks available | PASS |
| Mixed uncommitted Spec 027 code | None | PASS |

## Baseline browser surface

### Router inventory

`apps/web/src/App.tsx` registers 22 explicit browser patterns plus one wildcard fallback:

```text
/
/mfa/setup
/mfa
/dashboard
/k1
/k1/:id/review
/upload
/partnerships
/partnerships/:id
/entities/:id
/entities
/reports
/liquidity
/tic-registry
/partnership-aggregation
/partnership-tracker
/estate-maps
/investment-tracker
/k1-tracker
/admin/users
/admin/users/:id
/forbidden
*
```

The retained contract is 13 explicit patterns plus wildcard. The nine other explicit patterns are initial pruning candidates and are not yet approved for deletion until the foundational inventories are reconciled.

### Design-branch scan

The baseline contains `VITE_MAGIC_PATTERN_DESIGNS`/`magicPatternDesigns` in:

- `apps/web/.env.example`;
- router and feature-flag configuration/tests;
- `AppShell` and its tests;
- login/MFA, entities/detail, Investment Tracker, Partnership Tracker, and Estate Map page wrappers/tests;
- legacy navigation tests under TIC, K-1 tracker, partnerships, and partnership tracker.

Command: `rg -n 'VITE_MAGIC_PATTERN_DESIGNS|magicPatternDesigns' apps/web apps/api infra scripts docs`.

Baseline result: 96 matching lines across 29 files.

### Web size and direct dependencies

| Metric | Baseline |
|---|---:|
| Tracked files under `apps/web/src` | 290 |
| Source-like files counted | 290 |
| Source-like lines | 34,245 |
| Working-tree bytes at baseline | 1,754,977 |
| Direct production dependencies | 11 |
| Direct development dependencies | 19 |

Production dependencies: `@headlessui/react`, `@tanstack/react-query`, `autoprefixer`, `framer-motion`, `lucide-react`, `postcss`, `react`, `react-dom`, `react-plaid-link`, `react-router-dom`, and `tailwindcss`.

Development dependencies: `@eslint/js`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `jsdom`, `msw`, `typescript`, `typescript-eslint`, `vite`, and `vitest`.

### Web verification baseline

| Verification ID | Command | Actual | Status | Baseline relation |
|---|---|---|---|---|
| `BASE-WEB-LINT` | `npm run --workspace=web lint` | Exit 1: 14 errors and 2 warnings across 10 files, dominated by pre-existing `react-hooks/set-state-in-effect`; one unused import | FAIL | NOT_APPLICABLE |
| `BASE-WEB-TYPECHECK` | `npm run --workspace=web typecheck` | Exit 2: 82 diagnostics across 39 files, including stale relative type imports, implicit-any fallout, TS 6 erasable-syntax checks, and fixture/test drift | FAIL | NOT_APPLICABLE |
| `BASE-WEB-TEST` | `npm run --workspace=web test` | Exit 1: 98 files run; 1 failed/98 passed, 1 failed/372 passed tests. `LoginPage.test.tsx` expected `/dashboard` but remained at `/` | FAIL | NOT_APPLICABLE |
| `BASE-WEB-COLORS` | `npm run --workspace=web check:colors` | Exit 1: 2 `competing-action-color` findings in direct K-1 tracker components | FAIL | NOT_APPLICABLE |
| `BASE-WEB-BUILD` | `npm run build:web` | Exit 0; 2,656 modules transformed | PASS | NOT_APPLICABLE |

### Baseline Vite output

| Asset | Bytes | Vite display | Gzip display |
|---|---:|---:|---:|
| `index-DNwZ2qPe.js` | 1,403,116 | 1,403.11 kB | 371.43 kB |
| `index-DCabQ5Dp.css` | 90,443 | 90.44 kB | 15.01 kB |

Total emitted JavaScript/CSS baseline: 1,493,559 bytes. The build passed with Vite's existing chunk-size warning for the single JavaScript bundle.

## Baseline API and infrastructure surface

### API source and dependency inventory

| Metric | Baseline |
|---|---:|
| Tracked files under `apps/api/src` | 225 |
| Source-like files counted | 225 |
| Source-like lines | 41,709 |
| Working-tree bytes at baseline | 1,775,471 |
| Direct production dependencies | 19 |
| Direct development dependencies | 6 |

Production dependencies: `@aws-sdk/client-bedrock-data-automation-runtime`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-s3`, `@aws-sdk/client-sqs`, `@aws-sdk/s3-request-presigner`, `@fastify/cookie`, `@fastify/cors`, `@fastify/multipart`, `@fastify/rate-limit`, `argon2`, `dotenv`, `exceljs`, `fastify`, `otplib`, `pdf-lib`, `pg`, `plaid`, `qrcode`, and `zod`.

Development dependencies: `@types/node`, `@types/pg`, `@types/qrcode`, `tsx`, `typescript`, and `vitest`.

### Initial API registration inventory

The baseline registers liveness/readiness directly in `apps/api/src/app.ts` and route families for authentication, admin/dev administration, dashboard, K-1 ingestion/review, direct K-1 tracker, partnership tracker, partnerships/entities/assets, Plaid, reports, and TIC Registry. The exact method/pattern/protection-policy matrix is maintained in [API Consumer Matrix](#api-consumer-matrix); the raw baseline scan command is:

```text
rg -n '\.(get|post|put|patch|delete)\(' apps/api/src/app.ts apps/api/src/routes/index.ts apps/api/src/modules --glob '*.routes.ts'
```

### API/security/Terraform verification baseline

| Verification ID | Command | Actual | Status | Baseline relation |
|---|---|---|---|---|
| `BASE-API-BUILD` | `npm run build:api` | Exit 0 | PASS | NOT_APPLICABLE |
| `BASE-API-TEST` | `npm run test:api` | Exit 1: 120 passed/1 failed/23 skipped files; 543 passed/1 failed/110 skipped tests. `protection-controls.contract.test.ts` `beforeEach` exceeded its 10-second hook timeout | FAIL | NOT_APPLICABLE |
| `BASE-SEC-RUNTIME` | `npm run security:audit:runtime` | Exit 0; zero API runtime, web runtime, or build/test-only findings | PASS | NOT_APPLICABLE |
| `BASE-SEC-ROUTES` | `npm run security:route-policy` | Exit 0; 2/2 contract tests passed | PASS | NOT_APPLICABLE |
| `BASE-SEC-COST` | `npm run security:cost-envelope` | Exit 0; 9 finite workloads, `$2,204.50` maximum daily cost below `$2,250.00` approved ceiling | PASS | NOT_APPLICABLE |
| `BASE-TF-FMT` | `terraform -chdir=infra/aws/terraform fmt -check -recursive` | Exit 0 | PASS | NOT_APPLICABLE |
| `BASE-TF-INIT` | Clean temporary configuration copy: `terraform init -backend=false -input=false -no-color` | Exit 0 | PASS | NOT_APPLICABLE |
| `BASE-TF-VALIDATE` | Clean temporary configuration copy: `terraform validate -no-color` | Exit 0, configuration valid | PASS | NOT_APPLICABLE |

The repository-local `terraform validate` additionally returned a local-state-only error for historical `aws.us_east_1` provider objects. Validation was repeated from a clean temporary copy containing the tracked `.tf` modules, lock file, and required `infra/aws/bda` schemas; that source configuration passed. No state file was copied, changed, or deleted.

## Migration and authoritative fixture inventory

All hashes are SHA-256 and are compared byte-for-byte at final verification.

### Database migrations

```text
apps/api/src/infra/db/migrations/000_base_schema.sql 04d8a73d985c8545ad5ef55944feac2a02ad0ce2d19471cfccde351c6c36519b
apps/api/src/infra/db/migrations/001_auth_access.sql 0d9d8842443d58c94adb39420b804fe50e20dd9612daf8a51a47ac4e79289173
apps/api/src/infra/db/migrations/001_runtime_fixes.sql 639278aeb33adb780fdc22af26468f70c892ea9321cb1029e157dfbbea84656b
apps/api/src/infra/db/migrations/002_fmv_and_assets.sql e6b74d84852f196d8c95cc12033210cafc5d8f5dd758b76f090505398b29c8c4
apps/api/src/infra/db/migrations/002_k1_ingestion.sql c391b83bea4255e0e0d090d7ebed7e1abcfaa3a8486a2b85510d1b918f1ffdb9
apps/api/src/infra/db/migrations/003_k1_mirror.sql 194315e4f941d83dcfda853ecd6cc539035c2befefa79f28528cb4e92fef31a8
apps/api/src/infra/db/migrations/003_review_finalization.sql a6096b3f3768bcf94d1960c41a31f0d8e3a49e83bf6f6031d92c85edffbd0ca6
apps/api/src/infra/db/migrations/004_partnership_management.sql b56dcc4ed4e3ffb6694d59b9a214b9ca131bb3b0f98983be0d5ff79387092c4d
apps/api/src/infra/db/migrations/009_partnership_assets.sql d690044ed53ff1698355fb68e54bb24ac8b7da88bbfffcd1e4b23a6d331536de
apps/api/src/infra/db/migrations/010_capital_commitments_activity.sql 6c9798e421880afc48e9077c0ac71c510bfb419d40a657cd7bc2389794692254
apps/api/src/infra/db/migrations/011_reports_activity_detail_columns.sql f22e13bc1c1f0877fcf99aaf6ff34bc9ae900a8605c579f3ba94070a3d35293d
apps/api/src/infra/db/migrations/012_consolidated_holdings.sql 89c14cafeb1b9ab6e3770055479cb9915b51d4d714b84495ff47e593756457ee
apps/api/src/infra/db/migrations/012_drop_created_by_user_fks.sql caa88c51d954c826b10a0130caf8fa00f6f298443dcad0a4bcaa5fd32fe53762
apps/api/src/infra/db/migrations/013_persistent_production_data.sql 1af6a1614b5f695c7e3588957a50b2843a1d6cb31b222fbf441d30d6cab90b83
apps/api/src/infra/db/migrations/014_source_holdings_sector_industry.sql 439966026a03b2a024b80c0e04f986250bb395ea8906778a5e57509967cc5a4f
apps/api/src/infra/db/migrations/015_plaid_refresh_policy.sql 6389cc4df73755f64929b0e6d8f80014b8d708d8aa23d3548962723599a3cca2
apps/api/src/infra/db/migrations/016_tic_registry.sql 1ab0ee88ff5628fe658c85540a5ecc7fda85a40b52e60bd1536c38f40c5b4a38
apps/api/src/infra/db/migrations/017_tic_registry_remove_entity_requirement.sql ff87808fbf8f9c15795a64c26388d9ec56fc8fead241106a5d8d11e6cf16197a
apps/api/src/infra/db/migrations/018_k1_tracker.sql f310063c8945db85da8e02717c1660fd9c8d62ceb6efaa8173ef177d1a4bf511
apps/api/src/infra/db/migrations/018_tic_property_details.sql 930ae583da09dc16a9a9592414dec8a2dfab4da44c59f845035d36e4ea211164
apps/api/src/infra/db/migrations/019_partnership_tracker.sql 93f33ae3c076587ac24915834511047b34c890359a5c7035a28e84058ea20db9
apps/api/src/infra/db/migrations/021_partnership_tracker_revisions.sql 1e4b8a8ff4d4855034f39ca768ace6aee1799c703c92747c6f3df2c294e81811
apps/api/src/infra/db/migrations/022_partnership_aggregation_groups.sql 95a2cb4df69f8f2b59d71a6404c31a86ecc8b1eacb3a24876e084056cabddb96
apps/api/src/infra/db/migrations/023_partnership_cash_flows_and_profile.sql 618739d5914dd94dc6a46098d9b21680b946e9565f8c86b74b6bd7720b03a6d3
apps/api/src/infra/db/migrations/024_recallable_distributions.sql cf2b1f055e9f8978446c444a926e28511bfb5600645d029bad56aeb826e2eb2b
apps/api/src/infra/db/migrations/025_k1_complete_form_data.sql 08a611d5bb6bf562e8148e0eb249c3b42ec4f42a405ee78813e774dbb120dc31
apps/api/src/infra/db/migrations/026_partnership_cascade_delete.sql c7ba274fe5eb46cdb284c45737cab2775fe6beb9f59fe9bd547b4d20bd793f39
apps/api/src/infra/db/migrations/027_market_price_observations.sql 4377afc34b94c364485c3e77128ac04c8ed91acc813f9b6dd47a5af5b67ee6af
apps/api/src/infra/db/migrations/028_entity_directory_fields.sql 717cc0fcd4a4663c17b8b41a9c1255a5291a2127d984285f5367964d57240bdc
apps/api/src/infra/db/migrations/029_partnership_asset_categories.sql e0c707cfd9c03b9cdc853e02d4f58201498e177008f5da098d206c951878d735
apps/api/src/infra/db/migrations/030_aws_k1_pdf_ingestion.sql cdbde33095f297b1d2457420a2f7eb205d5a89cbc8ee9a6eaf1647ff539cea9e
apps/api/src/infra/db/migrations/031_k1_applied_document_retention.sql e8cd9d84cd25ae32e259c936b59e4f2781540868de02f6f27d8f7c6720a070a2
apps/api/src/infra/db/migrations/032_capital_activity_settlement.sql e99a78b3533a110d32de18e978a21165d52aeea314ab9397350c7741505b0145
apps/api/src/infra/db/migrations/033_section_l_withdrawal_sign.sql ce934f8fe50c1f67ff762731e04307ad6e0c81d67c11fb145e933ad7eb65bc07
apps/api/src/infra/db/migrations/034_k1_extraction_review_repairs.sql 69785f2d482f22b457bad01a0f2055ec11f9c4e52299dd36729ae496b24ecfed
apps/api/src/infra/db/migrations/035_k1_coded_row_calculation_repairs.sql 78fc6c9f0e8c4c91012313e4511e2ffe8b5e3a982b3e541389617f0d3779cccd
apps/api/src/infra/db/migrations/036_k1_part_three_extraction_artifacts.sql 300cbaae23fced0f6fa6e77ba49471de953f5cd74ec3012eeeb182021a4a9fa5
apps/api/src/infra/db/migrations/037_liquidity_market_close_snapshots.sql 99b13bd10d1b6a3c569aae6ab0da614fb217e945d58c27b380314b5ee9401137
apps/api/src/infra/db/migrations/038_k1_inception_year.sql e02f2af79b75b0386fcd0777824610b1167e34365b4eeed9791524342b38911c
apps/api/src/infra/db/migrations/038_liquidity_daily_valuations.sql f6935262f153a2f56cc102beebd4495980b7c88f8a07199166dbdc31cef0e225
apps/api/src/infra/db/migrations/039_abuse_protection.sql 5d59eb9b35cde8734153c984ea7fd344c20772bc03e47865ab7bf9b0e862fbf1
apps/api/src/infra/db/migrations/039_market_price_latest_index.sql 3f1fa9ad373e17d943d810daa36e37fe336167dc3055cb78d388e444e19d398e
```

### API authoritative fixtures

```text
apps/api/tests/fixtures/k1-bda/evaluation-sample.json bb6512d5d8568824d7f73f693353afc6bb06c5afbb0cda3f6fa8985c77a061db
apps/api/tests/fixtures/k1-bda/expected-canonical.json a57565bddfb559b715492a7b51d48bab9cb71abf1b13870521b88c84081db1b2
apps/api/tests/fixtures/k1-bda/expected-issues.json e1ec4a5d564c2935434459f67ec930d8aacba7a6c40ab97d051f49ab2d9af7eb
apps/api/tests/fixtures/k1-bda/manifest.json 902bb9ca894655789cd400eaf1c088f05ae57b860815c7af960c704afa922016
apps/api/tests/fixtures/k1-bda/README.md 4f3942ce90811f524d8d759f2b29810fcdaffe018573fd6c4186d389582f5d97
apps/api/tests/fixtures/k1-tracker-basis-template.expected.json 204a0275145fd836525b21c8b084a86f6533c15a0f156c1bc8918311646e04a9
apps/api/tests/fixtures/k1-tracker-basis-template.xlsx 5313eb20bfdc5538c120dad6fe353ac3dadb6095dabdeb9c4bc7c413d76b7b83
```

### Web authoritative fixtures

```text
apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts a8b44c14def7ee878c64c72cec6f1525c6addc17435a1d9c5aa155edc81ce54d
```

## Retained Flow records

All records were verified against baseline commit `a373395fea9c2185d9819337212fc6d64cd42a56`. API patterns below are families; the exact method/pattern rows appear in the API Consumer Matrix.

| ID / name | Entry routes | Source roots | Navigation edges | API consumers | Roles | Retained behaviors | Verification IDs |
|---|---|---|---|---|---|---|---|
| `FLOW-AUTH` Authentication and session | `/`, `/mfa/setup`, `/mfa` | `pages/LoginPage.tsx`, `pages/MFA*.tsx`, `pages/magic-patterns/MagicPatternLoginPage.tsx`, `auth/` | Successful login/enrollment/verification -> `/dashboard`; missing flow token -> `/` | `/v1/auth/*` | User, Admin | Password login, server-owned MFA state, session bootstrap/extend/expiry/logout, no pre-MFA session | `BASE-SEC-ROUTES`, `US2-AUTH`, `FINAL-SECURITY` |
| `FLOW-DASHBOARD` Dashboard | `/dashboard` | `pages/magic-patterns/MagicPatternDashboardPage.tsx`, `features/dashboard/`, shared liquidity summary | Dashboard module cards/quick actions -> `/investment-tracker`, `/k1`, `/entities`, `/liquidity`; Reports action -> `/reports`; review actions -> `/k1/:id/review`; AppShell adds Estate Maps and TIC Registry | `GET /v1/dashboard`, retained consolidated-holdings reads | User, Admin | KPIs, liquidity, K-1 status/actions, entity issues/counts, recent activity, refresh, empty/error/loading states | `US1-DASHBOARD`, `US1-NAV`, `FINAL-ROLES` |
| `FLOW-INVESTMENT` Investment Tracker | `/investment-tracker` | `pages/InvestmentTrackerPage.tsx`, `features/investment-tracker/`, retained `features/partnership-tracker` Magic/workspace/client/hooks, shared `features/k1-tracker` form/calculation UI | Portfolio -> selected partnership query state; K-1 history -> `/k1` or `/k1/:id/review`; contextual entity/estate/K-1 handoffs -> selected partnership | `/v1/partnership-tracker/*`, retained `/v1/partnerships/*`, `/v1/entities*` | User, Admin | Portfolio grouping/filtering/sorting, partnership CRUD by role, overview, capital activity, valuations, K-1 history, underlying assets, calculations | `US1-INVESTMENT`, `US1-QUERY`, `FINAL-ROLES` |
| `FLOW-LIQUIDITY` Liquidity | `/liquidity` | `pages/LiquidityPage.tsx`, retained consolidated-holdings/report/Plaid components, hooks, clients | AppShell/Dashboard <-> Liquidity | `/v1/reports/consolidated-holdings*`, `/v1/plaid/*`, `/v1/admin/plaid-refresh-status`, `/v1/admin/production-readiness` | User, Admin | Holdings, account selection/link/refresh, pricing freshness, allocation, performance | `US1-LIQUIDITY`, `FINAL-SCHEDULERS` |
| `FLOW-ENTITIES` Entities and owners | `/entities`, `/entities/:id` | current Magic entity pages, `features/partnerships` entity client/hooks/shared labels | Directory -> detail; detail -> `/entities`; selected partnership -> `/investment-tracker?partnership=...` (required characterization/implementation) | `/v1/entities*`, retained `/v1/partnerships*` | User, Admin | Directory/detail reads; Admin create/update/delete; partnership/report previews | `US1-ENTITIES`, `US1-ROLES` |
| `FLOW-ESTATE` Estate Maps | `/estate-maps` | `pages/EstateMapPage.tsx`, `features/estate-map/` | Root -> `/entities/:id`; partnership -> `/investment-tracker?partnership=...`; asset -> same with `area=underlying-assets` | `/v1/entities*`, `/v1/partnership-tracker/*`, retained partnership asset routes | User, Admin | Map storage, relationships, branch/assets display, zoom/pan/detail | `US1-ESTATE`, `US1-QUERY` |
| `FLOW-TIC` TIC Registry | `/tic-registry` | `pages/TicRegistryPage.tsx`, `features/tic-registry/` | Dashboard/AppShell <-> TIC Registry | `/v1/tic-registry/*` | User, Admin | Property/interest/owner reads, allocation, Admin mutations, validation | `US1-TIC`, `FINAL-ROLES` |
| `FLOW-REPORTS` Reports | `/reports` | `pages/ReportsPage.tsx`, exposed `features/reports/` components/hooks/client | Dashboard/AppShell <-> Reports | `/v1/reports/*`; retained partnership commitment mutations exposed by reports | User, Admin | Portfolio summary, asset-class summary, activity detail, filters, exports, Admin edits/undo | `US1-REPORTS`, `FINAL-ROLES` |
| `FLOW-K1` K-1 queue and review | `/k1`, `/k1/:id/review` | `pages/K1Dashboard.tsx`, `pages/K1ReviewWorkspace.tsx`, `features/k1/`, `features/review/`, shared K-1 form definitions | Dashboard/queue -> review; review -> `/k1`; finalized history -> `/investment-tracker?partnership=...&area=k1-history&year=...` | `/v1/k1-documents*`, `/v1/k1-ingestion-*`, `/v1/k1/lookups/*`, `/v1/review/*` | User, Admin | Upload/presign/complete, queue, review/mapping/correction/issues, retry/cancel/delete, approve/finalize/apply, PDF | `US1-K1`, `US3-K1`, `FINAL-K1-OPS` |

The wildcard route is router infrastructure, not a `RetainedFlow`; it is protected by `PROTECT-BROWSER-CONTRACT` and must resolve unknown/retired URLs to `/` without implementing a compatibility alias.

## System Root records

| ID | Kind / concrete entry | Consumer evidence | Protected closure | Verification IDs |
|---|---|---|---|---|
| `ROOT-API-SERVER` | server: `apps/api/src/server.ts`; `start:api` | root/API package start scripts; API Dockerfile/deploy | `app.ts`, route registry, retained modules, config/logging/db | `BASE-API-BUILD`, `FINAL-API` |
| `ROOT-HEALTH` | health: `GET /health` | `infra/aws/terraform/variables.tf:128`, edge routing, Terraform tests, deploy/dev probes | liveness status plus public cheap protection policy | `BASE-SEC-ROUTES`, `FINAL-HEALTH` |
| `ROOT-READINESS` | health: `GET /internal/readiness` | API readiness contract and internal load-balancer/deployment use; intentionally not exposed through `/v1` | database readiness status | `FINAL-HEALTH` |
| `ROOT-AUTH-SECURITY` | security: auth routes, request boundaries, CSRF/CORS, Spec 027 registrations | retained `FLOW-AUTH`; `security:*` root scripts; policy coverage startup check | auth/session/MFA and `modules/abuse-protection/` | `BASE-SEC-*`, `FINAL-SECURITY` |
| `ROOT-MIGRATIONS` | migration: `apps/api/src/infra/db/migrate.ts` convention-loads `migrations/*.sql` | `server.ts:59-61`; deployment environment strategy | migration runner and every baseline SQL hash | `BASE-MIGRATION-HASH`, `FINAL-MIGRATION-HASH` |
| `ROOT-K1-WORKER` | worker: `start:k1-worker`; `dist/workers/k1-extraction-worker.js` | API package scripts; Terraform `modules/k1_ingestion/worker.tf:48` | worker, object stores, extractors, queues, BDA/stub providers | `FINAL-K1-OPS` |
| `ROOT-K1-RECONCILER` | worker/operator: `reconcile:k1-extractions` | API package script; Terraform `modules/k1_ingestion/worker.tf:100` | reconciler script/service and queue/repository dependencies | `FINAL-K1-OPS` |
| `ROOT-PLAID-SCHEDULER` | scheduler: `dist/scripts/run-plaid-refresh.js` | Terraform scheduler `main.tf:46`; deployment/architecture docs | Plaid refresh service and scheduler-authenticated run endpoint | `US3-OPS`, `FINAL-SCHEDULERS` |
| `ROOT-MARKET-SCHEDULER` | scheduler: `dist/scripts/run-market-price-refresh.js` | API package `refresh-market-prices`; Terraform scheduler `main.tf:80`; deployment docs | market provider/cache/refresh scripts | `US3-OPS`, `FINAL-SCHEDULERS` |
| `ROOT-DEPLOYMENT` | deployment: `deploy:aws:staging`, Docker, Terraform root/modules | root script, `infra/aws/README.md`, deployment docs | `scripts/deploy-to-aws-staging.ps1`, Dockerfile, tracked Terraform source/tests/lock file | `BASE-TF-*`, `FINAL-TERRAFORM` |
| `ROOT-SECURITY-COMMANDS` | security/operator: `security:audit:runtime`, `security:route-policy`, `security:cost-envelope`, `security:abuse:bounded` | root package scripts and AWS runbook/README | `.security/`, `scripts/security/`, protection tests | `BASE-SEC-*`, `FINAL-SECURITY` |
| `ROOT-K1-EVALUATION` | fixture/operator: `evaluate:k1-bda` | API package script and `apps/api/tests/fixtures/k1-bda/README.md:20` | evaluator and K-1 BDA fixtures | `FINAL-FIXTURE-HASH` |
| `ROOT-MARKET-BACKFILL` | operator: `backfill-market-prices` | API package script, inline usage help, backfill and Spec 027 cost/kill-switch tests | backfill script and market provider/admission dependencies | `FINAL-SCHEDULERS`, `FINAL-SECURITY` |
| `ROOT-FIXTURES` | fixture: baseline fixture inventories | direct imports from retained API/web tests plus fixture README | exact baseline API/web fixture hashes | `BASE-FIXTURE-HASH`, `FINAL-FIXTURE-HASH` |

## Consumer Edge inventory

The flow/system tables above are the normalized edge inventory. Concrete baseline edges include:

| From | To | Kind / state | Evidence |
|---|---|---|---|
| Current AppShell | Dashboard, Investment Tracker, Liquidity, Entities, Estate Maps, TIC Registry, Reports | link / authenticated | `AppShell.tsx:48-69` |
| Dashboard cards/actions | Investment Tracker, K-1, Entities, Liquidity, Reports and review | link / authenticated | `MagicPatternDashboardPage.tsx:504,636,669-783` |
| K-1 review | selected partnership K-1 history | link / partnership+year | baseline `K1ReviewWorkspace.tsx:184-191`; destination requires canonicalization |
| Estate Map detail/empty state | entity or selected partnership/asset | link / selected node | baseline `EstateMapCanvas.tsx:199-204,272,395`; partnership destinations require canonicalization |
| Entity directory | entity detail | link / selected entity | `MagicPatternEntitiesPage.tsx:675,903,941` |
| Entity detail partnership table | selected partnership Investment Tracker | replacement edge / selected partnership | required retained-surface transition; baseline table at `MagicPatternEntityDetailPage.tsx:548-596` is not yet interactive |
| Web API clients | `/v1` route families | api-call / User or Admin | `authClient.ts`, dashboard/K-1/review/partnership/report/TIC clients inventoried by `rg` |
| API server | SQL migrations | convention / `DATABASE_URL` | `server.ts:59-61`, `infra/db/migrate.ts:9,28,48` |
| Terraform scheduler | Plaid and market scripts | terraform / scheduled ECS task | `modules/scheduler/main.tf:46,80` |
| Terraform K-1 task | worker and reconciler scripts | terraform / ECS worker and scheduled reconciliation | `modules/k1_ingestion/worker.tf:48,100` |
| Terraform/deploy/dev | `/health` | terraform/script | `variables.tf:128`, `edge/main.tf:133`, deployment/dev scripts |
| Security package commands | protection scripts/tests | script / CI/operator | root `package.json:34-37` |

All edges were verified at baseline `a373395fea9c2185d9819337212fc6d64cd42a56`; source line evidence is refreshed if a file changes.

## Candidate inventory

### Coverage accounting

- The baseline analyzer inventoried all 290 tracked files under `apps/web/src`: 194 production files and 96 test files. From `main.tsx`, 192/194 production files were statically reachable. It was superseded by the tested final walker in `scripts/pruning/find-unreachable-web.mjs` and is not retained.
- The two non-production-reachable files are classified explicitly below: stale `App.css` is `REMOVE`; the consolidated-holdings fixture is `RETAIN` through authoritative test edges.
- Across all tracked web code/config, 201 non-test source/config scripts and 108 test/helper/fixture source files are covered by the retained-flow/config groups or the explicit candidate groups below.
- All three web barrel exports are classified: `features/investment-tracker/index.ts` is `RETAIN`; `features/partnership-tracker/index.ts` and `components/aggregation/index.ts` are `DEFER` pending T033 closure recomputation.
- All nine shared type files under `packages/types/src/` are initially `RETAIN`; `k1-tracker.ts` and `partnership-tracker.ts` have concrete current Investment Tracker/K-1 consumers and cannot be removed by route name.

### Initial candidate and retention records

| ID | Category / subject | Inbound edges and replacement | Decision | Confidence / group | Rationale and verification |
|---|---|---|---|---|---|
| `C-BROWSER-RETIRED` | browser-route: `/upload`, `/partnerships`, `/partnerships/:id`, `/partnership-aggregation`, `/partnership-tracker`, `/k1-tracker`, `/admin/users`, `/admin/users/:id`, `/forbidden` | Router-only/direct/legacy edges; current replacements are K-1, Investment Tracker, or inline denial | REMOVE | HIGH / `DG-RETIRED-BROWSER-ROUTES` | Contract-approved after live partnership links move; exact route guard and current flow suites |
| `C-DESIGN-FLAG` | config: `config/featureFlags.ts`, its test, `.env.example` entry | Compile-time consumers only; current UI becomes unconditional | REMOVE | HIGH / `DG-LEGACY-DESIGN` | 96 baseline references are bounded; zero-reference final guard |
| `C-DESIGN-BRANCHES` | source symbols/branches in `App.tsx`, `AppShell.tsx`, Login/MFA, Entities/detail, Investment Tracker wrappers and associated parameterized tests | Current Magic components are replacement authority | REMOVE | HIGH / `DG-LEGACY-DESIGN` | Retarget tests before removing false branches; current-only suites/build |
| `C-RETIRED-PAGES` | source: `PartnershipTrackerPage.tsx`, `PartnershipAggregationPage.tsx`, `UserManagementPage.tsx`, `UserDetailPage.tsx`, `PermissionDeniedPage.tsx`, plus sole-purpose `PartnershipTrackerPage.test.tsx` | Only retired routes/design branches import them | REMOVE | HIGH / `DG-RETIRED-BROWSER-ROUTES` | Delete after router imports and admin client audit; route/current suite |
| `C-LEGACY-PARTNERSHIP-CLOSURE` | source/test/export: `features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`, `components/aggregation/`, legacy-only siblings, both legacy barrels, and sole-purpose tests | Post-router graph proved 25 production files and 13 tests exclusive to retired browser surfaces | REMOVE | HIGH / `DG-WEB-DEAD-CLOSURE` | Removed after T033; current Magic workspace/client/hooks/K-1 basis code remains reachable |
| `C-LEGACY-NAV-TESTS` | tests: legacy cases in TIC/K-1 tracker/partnership/partnership-tracker navigation suites plus aggregation/page suites | Current TIC assertion was retargeted; remaining subjects exercised only retired routes/shells | REMOVE | HIGH / `DG-LEGACY-DESIGN` or `DG-WEB-DEAD-CLOSURE` | Removed with their retired subjects; current route/shell coverage passes |
| `C-WEB-APP-CSS` | asset/source: `apps/web/src/App.css` | No imports, config, HTML, test, or asset references; Vite root uses `index.css` | REMOVE | HIGH / `DG-WEB-DEAD-CLOSURE` | Static analyzer plus repository scan; build/color check after deletion |
| `C-WEB-ICONS-SPRITE` | asset: `apps/web/public/icons.svg` | No source/HTML/config/test reference; appears to be unused template social/documentation symbols | REMOVE | HIGH / `DG-WEB-DEAD-CLOSURE` | Repository scan then production build |
| `C-WEB-REPORT-FIXTURE` | fixture: `features/reports/fixtures/consolidatedHoldingsFixture.ts` | Imported by retained Dashboard/Liquidity report tests | RETAIN | HIGH | Protected authoritative fixture and final hash |
| `C-WEB-PUBLIC-FAVICON` | asset: `apps/web/public/favicon.svg` | `apps/web/index.html:5` | RETAIN | HIGH | Production HTML/build edge |
| `C-WEB-ADMIN-CLIENT` | type/source symbols: user detail and seven user-management/development methods in `auth/authClient.ts` | Direct-only admin pages; session role/auth methods remain shared | REMOVE | HIGH / `DG-WEB-DEAD-CLOSURE` | Browser callers disappeared with retired pages; retained auth/session methods remain |
| `C-WEB-DEPENDENCIES` | dependency: all 11 direct production packages | Imports/config edges found for every package | RETAIN | HIGH | Re-scan after source pruning and clean install/build |
| `C-WEB-COVERAGE-PLUGIN` | dependency: `@vitest/coverage-v8` | Manifest-only; no source import, Vitest config, package script, CI workflow, or operator documentation edge | REMOVE | HIGH / `DG-DEPENDENCY-CONFIG` | Removed as a direct development dependency; lockfile regenerated and clean install/tests/build passed |
| `C-WEB-DEV-DEPENDENCIES` | dependency: remaining 18 direct development packages | ESLint/TypeScript/Vite/Vitest/RTL/MSW/config consumers | RETAIN | HIGH | Lint/typecheck/test/build and clean install |
| `C-WEB-SCRIPTS` | script/config: web `dev`, `build`, `typecheck`, `lint`, `preview`, `check:colors`, `test`, `test:watch`; Vite/Tailwind/PostCSS/TS/ESLint/color configs | Current development, build, governance, and test entries | RETAIN | HIGH | Existing package/config consumers |
| `C-ROOT-SCRIPTS` | script: root build/start/dev/db/local/deploy/security/test commands | Development, deployment, or protected system-root edges | RETAIN | HIGH | System-root records above |
| `C-API-OPERATOR-SCRIPTS` | script: API server/worker/reconciler/evaluator/market refresh/backfill commands | Package/Terraform/docs/test edges inventoried above | RETAIN | HIGH | `ROOT-*` verification |
| `C-ACTIVE-DOCS` | docs/config guard outside numbered specs | No active docs reference retired browser destinations/design flag; `scripts/ci/guard-partnerships-imports.mjs` references a still-live source directory | RETAIN | HIGH | Final stale-surface scan; update guard only if retained directory layout changes |
| `C-API-K1-TRACKER` | api-route/source/test/type: direct `/v1/k1-tracker/*` route family and exclusive closure | No web, worker, scheduler, Terraform, documentation, or external-contract consumer; current `/v1/partnership-tracker` and K-1 apply share retained repository/calculation code | REMOVE | HIGH / `DG-API-DEAD-CLOSURE` | Removed 10 registrations plus route/import-only closure; retained current manual-year/K-1 apply regression coverage |
| `C-API-ADMIN-USERS` | api-route/source/test/type: `/v1/admin/users*` user-management family | Direct web UI was the sole consumer; auth role/session behavior and retained operational Admin endpoints are independently covered | REMOVE | HIGH / `DG-API-DEAD-CLOSURE` | Removed seven registrations and exclusive handler/repositories/contracts; retained Admin guard/Plaid/readiness/protection controls |
| `C-API-ADMIN-DEV` | api-route/source/test: `/v1/admin/dev/clear`, `/v1/admin/dev/seed` | Retired Admin UI was the sole caller; no setup, test, operator, infrastructure, or production consumer remains | REMOVE | HIGH / `DG-API-DEAD-CLOSURE` | Removed both registrations and the exclusive dev route module; test fixture reset helpers remain |
| `C-API-RETAINED-FAMILIES` | api-route/source/test: auth, health/readiness, dashboard, K-1/review, partnership tracker, partnerships/entities/assets, Plaid, reports, TIC, protection controls | Retained flow or protected system-root consumers | RETAIN | HIGH | Exact matrix, route policy, API suites and operational checks |

No other production/test source, export, shared type, asset, environment entry, script, direct dependency, or active documentation path is initially approved for removal. Newly unreachable items exposed by deletion groups return to this inventory before removal.

## API Consumer Matrix

<!-- BEGIN GENERATED API CONSUMER MATRIX -->

The 144 baseline external rows below were generated from Fastify registration after `npm run build:api`. The decision column now records the final US3 disposition, including intentional contract breaks for removed rows.

| Method | Canonical pattern | Registration module | Spec 027 policy (auth / class / owner / units) | Web consumer(s) | System consumer(s) | Decision | Contract break | Implementation closure / verification |
|---|---|---|---|---|---|---|---|---|
| GET | `/health` | `apps/api/src/app.ts` | public / PUBLIC_HEALTH / platform-security / request | - | ROOT-HEALTH | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/admin/dev/clear` | removed `admin.dev.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | no current consumer; removed by `DG-API-DEAD-CLOSURE`; `FINAL-API-MATRIX` |
| POST | `/v1/admin/dev/seed` | removed `admin.dev.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | no current consumer; removed by `DG-API-DEAD-CLOSURE`; `FINAL-API-MATRIX` |
| GET | `/v1/admin/plaid-refresh-status` | `apps/api/src/modules/admin/admin.routes.ts` | admin / AUTHENTICATED_READ / platform-operations / request | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/admin/plaid-refresh/run` | `apps/api/src/modules/admin/admin.routes.ts` | scheduler / INTERNAL_SCHEDULER / platform-operations / provider_call | - | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/admin/production-readiness` | `apps/api/src/modules/admin/admin.routes.ts` | admin / AUTHENTICATED_READ / platform-operations / request | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/admin/protection-controls` | `apps/api/src/modules/admin/admin.routes.ts` | admin / AUTHENTICATED_READ / platform-operations / request | - | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/admin/protection-controls/:controlKey` | `apps/api/src/modules/admin/admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PUT | `/v1/admin/protection-controls/:controlKey` | `apps/api/src/modules/admin/admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/admin/users` | removed from `admin.routes.ts` | admin / AUTHENTICATED_READ / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| GET | `/v1/admin/users/:userId` | removed from `admin.routes.ts` | admin / AUTHENTICATED_READ / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| POST | `/v1/admin/users/:userId/deactivate` | removed from `admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| POST | `/v1/admin/users/:userId/mfa-reset` | removed from `admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| POST | `/v1/admin/users/:userId/reactivate` | removed from `admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| PATCH | `/v1/admin/users/:userId/role` | removed from `admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| POST | `/v1/admin/users/invitations` | removed from `admin.routes.ts` | admin / ADMIN_WRITE / platform-operations / request | - | - | REMOVE | true | retired UI was sole consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| POST | `/v1/auth/login` | `apps/api/src/modules/auth/auth.routes.ts` | public / AUTH_ATTEMPT / platform-security / password_hash | FLOW-AUTH | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/auth/logout` | `apps/api/src/modules/auth/auth.routes.ts` | session / AUTHENTICATED_READ / platform-security / request | FLOW-AUTH | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/auth/mfa/enroll/complete` | `apps/api/src/modules/auth/auth.routes.ts` | public / AUTH_ATTEMPT / platform-security / password_hash | FLOW-AUTH | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/auth/mfa/verify` | `apps/api/src/modules/auth/auth.routes.ts` | public / AUTH_ATTEMPT / platform-security / password_hash | FLOW-AUTH | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/auth/session` | `apps/api/src/modules/auth/auth.routes.ts` | session / AUTHENTICATED_READ / platform-security / request | FLOW-AUTH | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/auth/session/extend` | `apps/api/src/modules/auth/auth.routes.ts` | session / AUTHENTICATED_READ / platform-security / request | FLOW-AUTH | ROOT-AUTH-SECURITY | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/dashboard` | `apps/api/src/modules/dashboard/dashboard.routes.ts` | session / DATABASE_HEAVY_READ / partnerships / request | FLOW-DASHBOARD | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/entities` | `apps/api/src/modules/partnerships/entities.admin.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-ENTITIES, FLOW-ESTATE, FLOW-INVESTMENT | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/entities` | `apps/api/src/modules/partnerships/entities.admin.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-ENTITIES, FLOW-ESTATE, FLOW-INVESTMENT | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/entities/:id` | `apps/api/src/modules/partnerships/entities.admin.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-ENTITIES, FLOW-ESTATE, FLOW-INVESTMENT | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/entities/:id` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-ENTITIES, FLOW-ESTATE, FLOW-INVESTMENT | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/entities/:id` | `apps/api/src/modules/partnerships/entities.admin.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-ENTITIES, FLOW-ESTATE, FLOW-INVESTMENT | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-documents` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents` | `apps/api/src/modules/k1/k1.routes.ts` | session / K1_UPLOAD_ADMISSION / tax-documents / file, byte, storage_byte_day | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-documents/:k1DocumentId` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/apply` | `apps/api/src/modules/k1/k1.routes.ts` | admin / ADMIN_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/apply-preview` | `apps/api/src/modules/k1/k1.routes.ts` | admin / DATABASE_HEAVY_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/approve` | `apps/api/src/modules/review/review.routes.ts` | admin / ADMIN_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PUT | `/v1/k1-documents/:k1DocumentId/corrections` | `apps/api/src/modules/review/review.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/finalize` | `apps/api/src/modules/review/review.routes.ts` | admin / ADMIN_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/issues` | `apps/api/src/modules/review/review.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/issues/:issueId/resolve` | `apps/api/src/modules/review/review.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PUT | `/v1/k1-documents/:k1DocumentId/map-entity` | `apps/api/src/modules/review/review.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PUT | `/v1/k1-documents/:k1DocumentId/map-partnership` | `apps/api/src/modules/review/review.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PUT | `/v1/k1-documents/:k1DocumentId/match` | `apps/api/src/modules/review/review.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-documents/:k1DocumentId/pdf` | `apps/api/src/modules/k1/k1.routes.ts` | session / DOCUMENT_DOWNLOAD / tax-documents / output_byte | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/reparse` | `apps/api/src/modules/k1/k1.routes.ts` | session / PAID_EXTRACTION / tax-documents / document, page, provider_call, queue_message | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-documents/:k1DocumentId/retry-extraction` | `apps/api/src/modules/k1/k1.routes.ts` | session / PAID_EXTRACTION / tax-documents / document, page, provider_call, queue_message | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-documents/:k1DocumentId/review-session` | `apps/api/src/modules/review/review.routes.ts` | session / DATABASE_HEAVY_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-documents/export.csv` | `apps/api/src/modules/k1/k1.routes.ts` | session / EXPORT_DOWNLOAD / tax-documents / export_row, output_byte | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-documents/kpis` | `apps/api/src/modules/k1/k1.routes.ts` | session / DATABASE_HEAVY_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-ingestion-batches` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-ingestion-batches` | `apps/api/src/modules/k1/k1.routes.ts` | session / K1_UPLOAD_ADMISSION / tax-documents / file, byte, storage_byte_day | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-ingestion-batches/:batchId` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-ingestion-batches/:batchId/complete-uploads` | `apps/api/src/modules/k1/k1.routes.ts` | session / K1_UPLOAD_ADMISSION / tax-documents / file, byte, storage_byte_day | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/k1-ingestion-items/:itemId` | `apps/api/src/modules/k1/k1.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-ingestion-items/:itemId/attempts` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-ingestion-items/:itemId/cancel` | `apps/api/src/modules/k1/k1.routes.ts` | session / BUSINESS_WRITE / tax-documents / request | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PUT | `/v1/k1-ingestion-items/:itemId/local-upload` | `apps/api/src/modules/k1/k1.routes.ts` | session / K1_UPLOAD_ADMISSION / tax-documents / file, byte, storage_byte_day | FLOW-K1 | ROOT-K1-WORKER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-tracker/imports/:importBatchId/commit` | removed route/import closure | admin / WORKBOOK_IMPORT / tax-documents / byte, request | - | - | REMOVE | true | no current consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| POST | `/v1/k1-tracker/imports/preview` | removed route/import closure | admin / WORKBOOK_IMPORT / tax-documents / byte, request | - | - | REMOVE | true | no current consumer; `DG-API-DEAD-CLOSURE`, `FINAL-API-MATRIX` |
| GET | `/v1/k1-tracker/partnerships` | removed route closure | session / AUTHENTICATED_READ / tax-documents / request | - | - | REMOVE | true | replaced by current `/v1/partnership-tracker`; `FINAL-API-MATRIX` |
| GET | `/v1/k1-tracker/partnerships/:partnershipId` | removed route closure | session / AUTHENTICATED_READ / tax-documents / request | - | - | REMOVE | true | replaced by current `/v1/partnership-tracker`; `FINAL-API-MATRIX` |
| POST | `/v1/k1-tracker/partnerships/:partnershipId/years` | removed route closure | admin / ADMIN_WRITE / tax-documents / request | - | - | REMOVE | true | replaced by current manual-year API; `FINAL-API-MATRIX` |
| DELETE | `/v1/k1-tracker/partnerships/:partnershipId/years/:taxYear` | removed route closure | admin / ADMIN_WRITE / tax-documents / request | - | - | REMOVE | true | replaced by current manual-year API; `FINAL-API-MATRIX` |
| GET | `/v1/k1-tracker/partnerships/:partnershipId/years/:taxYear` | removed route closure | session / AUTHENTICATED_READ / tax-documents / request | - | - | REMOVE | true | replaced by current manual-year API; `FINAL-API-MATRIX` |
| PATCH | `/v1/k1-tracker/partnerships/:partnershipId/years/:taxYear` | removed route closure | admin / ADMIN_WRITE / tax-documents / request | - | - | REMOVE | true | replaced by current manual-year API; `FINAL-API-MATRIX` |
| POST | `/v1/k1-tracker/partnerships/:partnershipId/years/:taxYear/calculate` | removed route closure | session / DATABASE_HEAVY_READ / tax-documents / request | - | - | REMOVE | true | replaced by current manual-year API; `FINAL-API-MATRIX` |
| POST | `/v1/k1-tracker/partnerships/:partnershipId/years/:taxYear/signoffs` | removed route closure | admin / ADMIN_WRITE / tax-documents / request | - | - | REMOVE | true | current retained API owns sign-off behavior; `FINAL-API-MATRIX` |
| GET | `/v1/k1/lookups/entities` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/k1/lookups/partnerships` | `apps/api/src/modules/k1/k1.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/aggregation` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / DATABASE_HEAVY_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/partnerships` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnership-tracker/partnerships/:partnershipId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/partnerships/:partnershipId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnership-tracker/partnerships/:partnershipId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/cash-flows` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnership-tracker/partnerships/:partnershipId/cash-flows/:cashFlowId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnership-tracker/partnerships/:partnershipId/cash-flows/:cashFlowId/settlement` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/cash-flows/batch` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/partnerships/:partnershipId/commitments` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/commitments` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnership-tracker/partnerships/:partnershipId/commitments/:commitmentId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnership-tracker/partnerships/:partnershipId/commitments/:commitmentId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/partnerships/:partnershipId/management-fees` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / DATABASE_HEAVY_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/partnerships/:partnershipId/nav` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/nav` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnership-tracker/partnerships/:partnershipId/nav/:navEntryId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnership-tracker/partnerships/:partnershipId/nav/:navEntryId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/years` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear/calculate` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | session / DATABASE_HEAVY_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear/cash-flows` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear/cash-flows/:cashFlowId` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear/cash-flows/batch` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear/signoffs` | `apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ESTATE | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnerships` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:id` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnerships/:id` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:id/fmv-snapshots` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnerships/:id/fmv-snapshots` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:partnershipId/assets` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnerships/:partnershipId/assets` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/partnerships/:partnershipId/assets/:assetId` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:partnershipId/assets/:assetId` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnerships/:partnershipId/assets/:assetId` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:partnershipId/capital-activity` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnerships/:partnershipId/capital-activity` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnerships/:partnershipId/capital-activity/:eventId` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/:partnershipId/commitments` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / AUTHENTICATED_READ / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/partnerships/:partnershipId/commitments` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/partnerships/:partnershipId/commitments/:commitmentId` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | admin / ADMIN_WRITE / partnerships / request | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/partnerships/export.csv` | `apps/api/src/modules/partnerships/partnerships.routes.ts` | session / EXPORT_DOWNLOAD / partnerships / export_row, output_byte | FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/plaid/exchange-public-token` | `apps/api/src/modules/plaid/plaid.routes.ts` | session / EXTERNAL_PROVIDER / financial-integrations / provider_call | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/plaid/investment-accounts` | `apps/api/src/modules/plaid/plaid.routes.ts` | session / BUSINESS_WRITE / financial-integrations / request | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/plaid/investment-accounts` | `apps/api/src/modules/plaid/plaid.routes.ts` | session / AUTHENTICATED_READ / financial-integrations / request | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/plaid/investment-accounts` | `apps/api/src/modules/plaid/plaid.routes.ts` | session / BUSINESS_WRITE / financial-integrations / request | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/plaid/investment-accounts/selection` | `apps/api/src/modules/plaid/plaid.routes.ts` | session / BUSINESS_WRITE / financial-integrations / request | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/plaid/link-token` | `apps/api/src/modules/plaid/plaid.routes.ts` | session / EXTERNAL_PROVIDER / financial-integrations / provider_call | FLOW-LIQUIDITY | ROOT-PLAID-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/activity-detail` | `apps/api/src/modules/reports/reports.routes.ts` | session / DATABASE_HEAVY_READ / reporting / request | FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/reports/activity-detail/:rowId` | `apps/api/src/modules/reports/reports.routes.ts` | session / BUSINESS_WRITE / reporting / request | FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/reports/activity-detail/:rowId/undo` | `apps/api/src/modules/reports/reports.routes.ts` | session / BUSINESS_WRITE / reporting / request | FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/asset-class-summary` | `apps/api/src/modules/reports/reports.routes.ts` | session / DATABASE_HEAVY_READ / reporting / request | FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/consolidated-holdings` | `apps/api/src/modules/reports/reports.routes.ts` | session / DATABASE_HEAVY_READ / reporting / request | FLOW-LIQUIDITY, FLOW-DASHBOARD | ROOT-PLAID-SCHEDULER, ROOT-MARKET-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/consolidated-holdings/export` | `apps/api/src/modules/reports/reports.routes.ts` | session / EXPORT_DOWNLOAD / reporting / export_row, output_byte | FLOW-LIQUIDITY, FLOW-DASHBOARD | ROOT-PLAID-SCHEDULER, ROOT-MARKET-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/consolidated-holdings/performance` | `apps/api/src/modules/reports/reports.routes.ts` | session / DATABASE_HEAVY_READ / reporting / request | FLOW-LIQUIDITY, FLOW-DASHBOARD | ROOT-PLAID-SCHEDULER, ROOT-MARKET-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/reports/consolidated-holdings/refresh` | `apps/api/src/modules/reports/reports.routes.ts` | session / EXTERNAL_PROVIDER / reporting / provider_call | FLOW-LIQUIDITY, FLOW-DASHBOARD | ROOT-PLAID-SCHEDULER, ROOT-MARKET-SCHEDULER | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/export` | `apps/api/src/modules/reports/reports.routes.ts` | session / EXPORT_DOWNLOAD / reporting / export_row, output_byte | FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/reports/portfolio-summary` | `apps/api/src/modules/reports/reports.routes.ts` | session / DATABASE_HEAVY_READ / reporting / request | FLOW-REPORTS | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/review/entities` | `apps/api/src/modules/review/review.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/review/partnerships` | `apps/api/src/modules/review/review.routes.ts` | session / AUTHENTICATED_READ / tax-documents / request | FLOW-K1 | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/tic-registry/interests/:interestId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/tic-registry/interests/:interestId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/tic-registry/interests/:interestId/owners` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/tic-registry/owners/:ownerId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/tic-registry/owners/:ownerId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/tic-registry/properties` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | session / AUTHENTICATED_READ / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/tic-registry/properties` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| DELETE | `/v1/tic-registry/properties/:propertyId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/v1/tic-registry/properties/:propertyId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | session / AUTHENTICATED_READ / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| PATCH | `/v1/tic-registry/properties/:propertyId` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| POST | `/v1/tic-registry/properties/:propertyId/interests` | `apps/api/src/modules/tic-registry/tic-registry.routes.ts` | admin / ADMIN_WRITE / tic-registry / request | FLOW-TIC | - | RETAIN | false | route module plus adjacent handler/service/repository closure; `BASE-SEC-ROUTES`, `FINAL-API-MATRIX` |
| GET | `/internal/readiness` | `apps/api/src/app.ts` | internal-only / not in external Spec 027 inventory | - | ROOT-READINESS | RETAIN | false | readiness status; `FINAL-HEALTH` |

Final matrix totals: 125 external registrations plus one internal readiness registration remain retained; 19 baseline external registrations are removed and zero rows remain deferred.

<!-- END GENERATED API CONSUMER MATRIX -->

### Foundational inventory reconciliation and frozen boundary

The initial boundary is frozen against baseline `a373395fea9c2185d9819337212fc6d64cd42a56` as follows:

- Browser: 13 explicit routes plus wildcard are retained; nine contract-approved retired routes are assigned to `DG-RETIRED-BROWSER-ROUTES`, but their removal waits for US1 canonical navigation coverage.
- Web production graph: 192/194 tracked `apps/web/src` production files are initially reachable. `App.css` is approved for `DG-WEB-DEAD-CLOSURE`; the only other statically unreachable file is a protected retained fixture. The unreferenced public `icons.svg` is also approved for that group.
- Web design closure: flag/config and false branches are approved for `DG-LEGACY-DESIGN`; mixed partnership-tracker directories and shared tests remain `DEFER` until the post-route graph in T033/T035.
- API: all 144 external registrations have complete Spec 027 policies. Together with internal readiness, 126 rows are `RETAIN`, 19 are `DEFER`, and zero are initially `REMOVE`. The deferred rows are exactly 10 direct K-1 tracker routes, seven user-management routes, and two admin development routes.
- Operational/data history: every system root has concrete package, Terraform, runtime, test, or documentation authority. Migrations and authoritative fixtures are protected by exact hashes.
- Dependency/config: all production dependencies are retained initially. `@vitest/coverage-v8` is deferred as manifest-only; dependency removal waits for the final source graph.

No deletion outside the six assigned groups is authorized. A new consumer moves an approved candidate to `DEFER`; a newly unreachable item returns to the candidate inventory before removal.

## Deletion Groups

| ID | Boundary | Replacement authority | Status |
|---|---|---|---|
| `DG-ROUTE-CANONICALIZATION` | Migrate retained partnership links/query state | `/investment-tracker` | VERIFIED |
| `DG-LEGACY-DESIGN` | Remove design flag and false UI branches | Current Magic Patterns product | VERIFIED |
| `DG-RETIRED-BROWSER-ROUTES` | Remove nine retired browser routes and exclusive closures | Retained route contract | VERIFIED |
| `DG-WEB-DEAD-CLOSURE` | Remove recomputed unreachable web artifacts | Retained web graph rooted at `main.tsx` | VERIFIED |
| `DG-API-DEAD-CLOSURE` | Remove no-consumer API contracts and exclusive closures | Retained flows/system roots | VERIFIED |
| `DG-DEPENDENCY-CONFIG` | Remove newly unused dependencies/config/scripts/docs | Final retained source and operational graph | VERIFIED |

Exact candidates, route/file/dependency inventories, retargeted tests, verification results, and deltas are added when each group is approved and applied.

### `DG-ROUTE-CANONICALIZATION` result

Status: `VERIFIED`.

- Centralized Investment Tracker area aliases, year validation, and query updates in `MagicPatternInvestmentTrackerPageContent.tsx`.
- Changed K-1 review history navigation from `/partnership-tracker?...&area=k1` to `/investment-tracker?...&area=k1-history` while preserving partnership and year.
- Changed Estate Map partnership/asset/empty-state destinations to Investment Tracker; underlying assets use `area=underlying-assets`.
- Added the required current entity-detail partnership transition to `/investment-tracker?partnership=...&area=overview`; the current entity directory already routes only to entity detail and contained no legacy partnership destination.
- Retained module/type/API directory names containing `partnership-tracker` or `k1-tracker`; they are current implementation edges, not browser destinations.
- Routes removed: none. Dependencies removed: none. Files removed: none.
- Verification: 15 retained-flow files / 92 tests passed; production web build passed with 2,656 modules. Interim output was 1,403,660 JS bytes and 90,443 CSS bytes. The small pre-deletion JS increase reflects characterization/query helpers and is not a final delta.

### Browser cleanup result

Status: `VERIFIED` for `DG-LEGACY-DESIGN`, `DG-RETIRED-BROWSER-ROUTES`, and the web portion of `DG-WEB-DEAD-CLOSURE`.

- Replaced the dual router with a contract-driven list containing exactly the 13 retained patterns and wildcard. The nine retired patterns now resolve only through the wildcard login fallback; no redirect aliases remain.
- Removed the design flag/config/environment branch, legacy shell, legacy login/entity/detail/Investment Tracker implementations, retired pages, and browser-only user-management client methods.
- The first post-router graph found 34 unreachable production files. It approved 25 legacy partnership/aggregation files and 13 sole-purpose tests, while explicitly retaining the current Magic workspace, `K1BasisWorkspace`, client, hooks, and current tests.
- The second graph approved eight dead duplicate/legacy UI files and `apps/web/public/icons.svg`. The durable final walker reports 156 of 157 production candidates reachable; the sole allowed exception is `consolidatedHoldingsFixture.ts`, retained under `PROTECT-FIXTURES` because current regression suites consume it.
- Active source contains zero `VITE_MAGIC_PATTERN_DESIGNS`, `magicPatternDesigns`, `legacyNavigation`, or `LegacyNavItem` references. Browser route tests, current login/MFA, shell, Dashboard, entities/detail, Estate Map, Investment Tracker, and K-1 handoff passed: 11 files and 65 tests.
- Final full web tests pass: 82 files and 317 tests. Production build passes with 2,620 modules, 1,199,598 JavaScript bytes, and 84,280 CSS bytes (203,518 JS bytes and 6,163 CSS bytes below baseline).
- Lint remains a known baseline failure but improved from 14 errors/2 warnings to 9 errors/1 warning; no cleanup-introduced diagnostic remains. Typecheck remains a known baseline failure but improved from 82 to 72 diagnostics. Color governance remains the same two pre-existing K-1 tracker findings.

### API cleanup result

Status: `VERIFIED` for `DG-API-DEAD-CLOSURE`.

- Audited all 144 baseline external registrations across current web clients, intra-API imports, K-1 worker/reconciler, Plaid and market schedulers, Terraform, deployment scripts/docs, tests, and explicit external contracts. The 19 initially deferred rows had no retained consumer; all other rows remain registered.
- Removed 10 direct `/v1/k1-tracker/*` registrations plus their route/handler/zod/workbook-import-only repository branches and sole-purpose tests. Retained calculation, field contracts, official-form schemas, repository operations used by `/v1/partnership-tracker`, K-1 apply, and historical `WORKBOOK_IMPORT` provenance reads.
- Removed seven `/v1/admin/users*` registrations plus their exclusive handlers, in-memory invitation/user-admin repositories, auth schemas, detail test, and activity query. Retained authentication/session roles, Admin guard, Plaid refresh/status, production readiness, and protection controls.
- Removed two non-production `/v1/admin/dev/*` registrations and their exclusive clear/seed module after confirming no local setup, fixture, script, infrastructure, documentation, or operator consumer. Retained test-only repository reset/seed methods that are independently consumed and removed the newly orphaned clear/seed/overlay/debug inspection helpers.
- Removed the now-unused workbook-import route protection class and its API/Terraform guardrail configuration. Protected database migrations and authoritative workbook fixtures were not edited.
- Final Fastify inventory: 125 external registrations plus internal readiness, all with retained web/system consumers and complete Spec 027 policies; zero deferred rows.
- Verification: API build passed; focused retained/security set passed 7 files/39 tests with one file/8 database tests skipped; full API suite passed 118 files/530 tests with 21 files/103 database/provider tests skipped. Runtime dependency audit, route-policy coverage, cost envelope, Terraform fmt, Terraform guardrail self-test, and clean-copy Terraform init/validate passed. Migration diff is empty.

### `DG-DEPENDENCY-CONFIG` result

Status: `VERIFIED`.

- Audited every web/API direct package against imports, package/config scripts, CI, peer/optional requirements, deployment packaging, and operator documentation. All 11 web and 19 API production dependencies have current consumers.
- Removed the direct web development dependency `@vitest/coverage-v8`: it had no source, Vitest configuration, package script, CI workflow, or documented operator consumer. The remaining 18 web and six API direct development dependencies all have current lint/typecheck/test/build/config consumers.
- Removed the superseded one-off web analyzer, retained the final dependency-free tested reachability walker, and registered current-surface/reachability commands at the root and web workspace.
- Removed stale invitation-alternative wording from the AWS manual deployment runbook; retained `ADMIN_PASSWORD` bootstrap guidance and all current worker/scheduler/deployment roots.
- Regenerated `package-lock.json` with npm while retaining Linux optional bindings. `npm ci` passed in a clean isolated workspace; the in-place clean attempt was blocked only because the active local Vite process held the Windows Rolldown binary, after which `npm install`, `npm ls --workspaces --all`, tests, and both production builds passed in the working tree.
- Final bundle: 1,199,598 JavaScript bytes and 84,280 CSS bytes, respectively 203,518 and 6,163 bytes below baseline.

## Protected Surfaces

| ID | Subject | Reason and authority | Verification IDs |
|---|---|---|---|
| `PROTECT-BROWSER-CONTRACT` | 13 retained explicit routes plus wildcard | Current dashboard product contract | `US1-*`, `US2-ROUTES`, `FINAL-WEB` |
| `PROTECT-ROLE-BEHAVIOR` | Admin/User controls within retained flows | Current authorization behavior | `US1-ROLES`, `FINAL-ROLES` |
| `PROTECT-AUTH` | Login, session, MFA, CSRF/CORS | Retained pre-auth flow and security root | `BASE-SEC-ROUTES`, `FINAL-SECURITY` |
| `PROTECT-SPEC027` | Route policy, abuse, quota, cost and kill-switch controls | Spec 027 security contract | `BASE-SEC-*`, `FINAL-SECURITY` |
| `PROTECT-MIGRATIONS` | All baseline SQL migrations above | Immutable data history | `BASE-MIGRATION-HASH`, `FINAL-MIGRATION-HASH` |
| `PROTECT-K1-OPS` | K-1 workers, reconciliation, BDA/stub, S3/SQS | Retained K-1 flow and Terraform/package consumers | `FINAL-K1-OPS` |
| `PROTECT-SCHEDULERS` | Plaid and market refresh schedulers | Retained Liquidity/Dashboard behavior | `FINAL-SCHEDULERS` |
| `PROTECT-FIXTURES` | Baseline authoritative fixtures above | Stable regression evidence | `BASE-FIXTURE-HASH`, `FINAL-FIXTURE-HASH` |

## Deferred Decisions

None. Every candidate discovered by the baseline and post-deletion scans has a final `RETAIN` or `REMOVE` decision with concrete evidence.

## Verification Records

Baseline records are in the browser/API sections.

| ID | Phase | Command/procedure | Scope | Expected | Actual | Status | Baseline relation |
|---|---|---|---|---|---|---|---|
| `US1-FOCUSED` | GROUP | 15-file retained dashboard/Investment/K-1/entity/Estate/Liquidity/Reports/TIC Vitest run | `FLOW-DASHBOARD` through `FLOW-K1`, Admin/User entity behavior | All focused tests pass | 15 files, 92 tests passed | PASS | NEW_PASS |
| `US1-BUILD` | GROUP | `npm run build:web` | Retained production graph | Build passes | 2,656 modules; 1,403,660 JS bytes; 90,443 CSS bytes | PASS | UNCHANGED_BASELINE |
| `US1-LEGACY-DESTINATION-SCAN` | GROUP | Scan active web source for retired partnership destinations | `DG-ROUTE-CANONICALIZATION` | No retained-flow destination relies on a retired redirect | Remaining hits are confined to router/legacy page/navigation/aggregation candidates or live module/API/type names | PASS | NEW_PASS |
| `US2-FOCUSED` | GROUP | Current router/auth/shell/dashboard/entity/Estate/Investment/K-1 focused Vitest | Retained browser product | All pass | 11 files, 65 tests passed | PASS | NEW_PASS |
| `US2-WEB-TEST` | GROUP | Full web Vitest | Retained web regression suite | All pass | 81 files, 315 tests passed | PASS | IMPROVED_BASELINE |
| `US2-REACHABILITY` | GROUP | Static import graph from `apps/web/src/main.tsx` plus repository consumer scan | `DG-WEB-DEAD-CLOSURE` | No unexplained production orphan | Interim post-deletion graph: 154/155 reachable; protected fixture was the sole reported exception | PASS | NEW_PASS |
| `US2-LINT` | GROUP | Web ESLint | No new cleanup diagnostics | Baseline failures only or improved | 9 errors/1 warning versus baseline 14 errors/2 warnings | PASS_WITH_BASELINE_FAILURE | IMPROVED_BASELINE |
| `US2-TYPECHECK` | GROUP | Web TypeScript build check | No new cleanup diagnostics | Baseline failures only or improved | 72 diagnostics versus baseline 82; no cleanup path diagnostic | PASS_WITH_BASELINE_FAILURE | IMPROVED_BASELINE |
| `US2-COLOR` | GROUP | Color-system audit | No new cleanup findings | Baseline findings only | Same two K-1 tracker findings | PASS_WITH_BASELINE_FAILURE | UNCHANGED_BASELINE |
| `US2-BUILD` | GROUP | Vite production build | Build passes and output shrinks | Pass | 2,620 modules; 1,198,941 JS bytes; 84,275 CSS bytes | PASS | IMPROVED_BASELINE |
| `US3-API-FOCUSED` | GROUP | Retained K-1 apply/manual-year/calculation, Plaid, controls, route-policy, and admission Vitest | Retained API/system roots | Pass or documented DB skip | 7 files/39 tests passed; 1 file/8 DB tests skipped | PASS | NEW_PASS |
| `US3-API-FULL` | GROUP | Full API Vitest | Retained API regression suite | Pass or documented environment skips | 118 files/530 tests passed; 21 files/103 DB/provider tests skipped | PASS | IMPROVED_BASELINE |
| `US3-API-BUILD` | GROUP | API TypeScript build | Build passes | Pass | Exit 0 | PASS | UNCHANGED_BASELINE |
| `US3-ROUTE-POLICY` | GROUP | Post-pruning external route inventory/policy check | 125 retained registrations | Complete policy and explicit retired-route absence | 3 tests passed; 125 unique routes | PASS | NEW_PASS |
| `US3-SECURITY` | GROUP | Runtime audit and cost-envelope validation | Spec 027 protected controls | Pass | Zero runtime findings; 9 finite workloads, $2,204.50/day under $2,250 ceiling | PASS | NEW_PASS |
| `US3-TERRAFORM` | GROUP | fmt, guardrail self-test, clean-copy init/validate | AWS runtime configuration | Pass | All pass; repo-local validate remains affected only by ignored local state alias | PASS | UNCHANGED_BASELINE |
| `US3-MIGRATIONS` | GROUP | Diff from baseline under `apps/api/src/infra/db/migrations` | Protected migration history | No paths | No paths | PASS | UNCHANGED_BASELINE |
| `US4-CURRENT-SURFACE` | GROUP | `npm run test:current-surface` | Retired design identifiers, route contract, JSX routes, and browser navigation destinations | Zero findings | 1 file/1 test passed; exact retained contract excludes all nine retired paths | PASS | NEW_PASS |
| `US4-REACHABILITY-TEST` | GROUP | `npm run test:pruning` | Static/type/barrel/index/literal-dynamic/CSS/asset resolution and test/config/dynamic exclusions | Pass | 2/2 Node tests passed | PASS | NEW_PASS |
| `US4-REACHABILITY` | GROUP | `npm run check:web-reachability` | Final web production graph | No unexpected unreachable file or unresolved dynamic edge | 156/157 reachable; one protected fixture allowed; zero unexpected and zero non-literal dynamic imports | PASS | NEW_PASS |
| `US4-DEPENDENCIES` | GROUP | lockfile regeneration, clean-copy `npm ci`, working-tree `npm install`, and `npm ls --workspaces --all` | Workspace dependency graph and platform optional packages | Clean resolution without invalid/extraneous packages | All passed; non-current-platform optional peers are expected; zero npm audit vulnerabilities | PASS | IMPROVED_BASELINE |
| `FINAL-API` | FINAL | `npm run build:api`; `npm run test:api` | Retained API, workers, schedulers, and route closure | Build and runnable tests pass | Build passed; 118 files/530 tests passed, 21 files/103 environment-gated database/provider tests skipped | PASS | IMPROVED_BASELINE |
| `FINAL-WEB` | FINAL | full Vitest and Vite build | Retained browser product | Tests/build pass | 82 files/317 tests passed; 2,620 modules; 1,199,598 JS bytes and 84,280 CSS bytes | PASS | IMPROVED_BASELINE |
| `FINAL-LIQUIDITY-PLOT` | FINAL | responsive viewport/pointer regression plus consolidated-holdings focused suite | `FLOW-LIQUIDITY` performance chart | Plot fills wide card and hover selects the plotted interval | Wide-card regression passed; 2 report files/16 tests passed; focused lint and production build passed | PASS | NEW_PASS |
| `FINAL-WEB-STATIC` | FINAL | ESLint, TypeScript typecheck, and color audit | Baseline comparison | No new failure | Lint 9 errors/1 warning vs 14/2 baseline; typecheck 72 diagnostics vs 82 baseline; same two K-1 color findings | PASS_WITH_BASELINE_FAILURE | IMPROVED_BASELINE |
| `FINAL-SECURITY` | FINAL | runtime audit, route-policy, and cost envelope | Spec 027 protections on final API inventory | Pass | Zero runtime findings; 3 route-policy tests/125 external routes; 9 workloads at $2,204.50/day below $2,250 | PASS | NEW_PASS |
| `FINAL-TERRAFORM` | FINAL | fmt, guardrail self-test, clean-copy init/validate | Final Terraform source | Pass | Formatting clean; six-category guardrail fails closed; clean-copy configuration valid | PASS | UNCHANGED_BASELINE |
| `FINAL-HYGIENE` | FINAL | protected-path diff, stale-symbol scan, `git diff --check`, and path reconciliation | Migrations, fixtures, stale surface, and complete diff | Zero migration/fixture changes, stale consumers, whitespace errors, or unclassified paths | All passed; 164 final paths classified and zero unclassified | PASS | NEW_PASS |

## Diff Reconciliation

The final comparison to `a373395fea9c2185d9819337212fc6d64cd42a56` contains 67 modified tracked paths, 72 deleted tracked paths, and 25 additions, for 164 paths total. The following mutually exclusive rules classify every path; the reconciliation script reported zero `UNCLASSIFIED` paths.

| Classification rule | Modified | Deleted | Added | Total | Authority |
|---|---:|---:|---:|---:|---|
| `.gitignore`, `.specify/feature.json`, `AGENTS.md`, `specs/028-prune-unreachable-flows/**` | 3 | 0 | 8 | 11 | Planning selection, CodeBoarding local-output ignore, and Spec 028 evidence |
| `apps/web/**` | 36 | 59 | 3 | 98 | `DG-ROUTE-CANONICALIZATION`, `DG-LEGACY-DESIGN`, `DG-RETIRED-BROWSER-ROUTES`, `DG-WEB-DEAD-CLOSURE`, current-flow test retargeting, and current-surface guard |
| `apps/api/**` | 21 | 13 | 0 | 34 | `DG-API-DEAD-CLOSURE`, retained security policy updates, and regression tests |
| `packages/types/**` | 1 | 0 | 0 | 1 | Shared import-only API contract closure in `DG-API-DEAD-CLOSURE` |
| `package.json`, `package-lock.json`, `scripts/maintenance/**`, `scripts/pruning/**` | 2 | 0 | 14 | 16 | `DG-DEPENDENCY-CONFIG`, final API inventory generator, and reachability governance |
| `infra/aws/**`, `scripts/security/**` | 4 | 0 | 0 | 4 | Removed workbook-import-only protection configuration and updated retained deployment guidance |
| **Total** | **67** | **72** | **25** | **164** | **Zero unclassified paths** |

### Exact deletion inventory

- `DG-LEGACY-DESIGN`: `apps/web/.env.example` and `apps/web/src/config/featureFlags.{ts,test.ts}`.
- `DG-RETIRED-BROWSER-ROUTES`: `apps/web/src/pages/PartnershipAggregationPage.tsx`, `PartnershipTrackerPage.tsx`, `PartnershipTrackerPage.test.tsx`, `PermissionDeniedPage.tsx`, `UserDetailPage.tsx`, and `UserManagementPage.tsx`.
- `DG-WEB-DEAD-CLOSURE`: `apps/web/public/icons.svg`; `apps/web/src/App.css`; `apps/web/src/components/{DataTable,PageHeader}.tsx`; `apps/web/src/components/shared/{FilterToolbar,RolePill}.tsx`; `apps/web/src/features/k1-tracker/__tests__/K1TrackerNavigation.test.tsx`; `apps/web/src/features/partnerships/__tests__/PartnershipNavigation.test.tsx`; `apps/web/src/features/partnerships/components/{EntityReportsPreviewSection,PartnershipDirectoryTable,SectionCard}.tsx`; `apps/web/src/features/partnership-tracker/index.ts`; the 14 deleted files under `features/partnership-tracker/__tests__/`; the 13 deleted legacy files directly under `features/partnership-tracker/components/`; and all 11 files formerly under `features/partnership-tracker/components/aggregation/`.
- `DG-API-DEAD-CLOSURE`: `apps/api/src/modules/admin/{admin.dev.routes,admin.handlers,invitation.repository,user-admin.repository}.ts`; `apps/api/src/modules/k1-tracker/{k1-tracker.handler,k1-tracker.import,k1-tracker.routes,k1-tracker.zod}.ts`; and `apps/api/tests/{admin.user-detail.contract,k1-tracker.authz.integration,k1-tracker.contract,k1-tracker.import.integration,k1-tracker.import}.test.ts`.

The 72 deletions above are the complete tracked deletion set. No migration, authoritative fixture, worker, scheduler, health/readiness entry, production dependency, Terraform module, or retained API route is deleted.

## Final Deltas

| Metric | Baseline | Final | Delta |
|---|---:|---:|---:|
| Tracked production files | 428 | 383 | -45 |
| Tracked production lines | 70,563 | 65,506 | -5,057 |
| Normalized tracked production bytes | 3,143,268 | 2,855,238 | -288,030 |
| `apps/web/src` files (including tests) | 290 | 235 | -55 |
| `apps/web/src` lines (including tests) | 34,245 | 29,416 | -4,829 |
| `apps/web/src` working-tree bytes | 1,754,977 | 1,452,366 | -302,611 |
| `apps/api/src` files | 225 | 217 | -8 |
| `apps/api/src` lines | 41,709 | 40,622 | -1,087 |
| `apps/api/src` working-tree bytes | 1,775,471 | 1,721,656 | -53,815 |
| Web direct production dependencies | 11 | 11 | 0 |
| Web direct development dependencies | 19 | 18 | -1 |
| API direct production dependencies | 19 | 19 | 0 |
| API direct development dependencies | 6 | 6 | 0 |
| Explicit browser routes (wildcard excluded) | 22 | 13 | -9 |
| Registered external API routes | 144 | 125 | -19 |
| Emitted Vite JavaScript bytes | 1,403,116 | 1,199,598 | -203,518 |
| Emitted Vite CSS bytes | 90,443 | 84,280 | -6,163 |
| Emitted Vite JS + CSS bytes | 1,493,559 | 1,283,878 | -209,681 |

The normalized production scope is `apps/web/src`, `apps/api/src`, and `packages/types/src`, excluding web `__tests__`/`tests` directories and `*.test.*`/`*.spec.*` files. Baseline bytes are Git blob bytes; final bytes normalize CRLF to LF before counting, making the comparison independent of the Windows working-tree line-ending policy. The per-tree working-byte rows preserve the baseline capture method and report the exact final on-disk values.

Final contract breaks are intentional and enumerated: nine browser patterns and 19 external API method/pattern registrations. No candidate remains deferred, no changed path remains unclassified, and all three measurable reduction criteria (production files, production lines, and browser JavaScript) are satisfied.
