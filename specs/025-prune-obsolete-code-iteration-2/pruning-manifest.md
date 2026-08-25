# Pruning Manifest: Obsolete Code Pruning, Iteration 2

This manifest records the evidence, decisions, deletion boundaries, and verification results for Spec 025. Commands run from the repository root unless stated otherwise.

## Baseline

| Field | Value |
|---|---|
| Branch | `025-prune-obsolete-code-iteration-2` |
| Baseline commit | `8baaadda1eb483414f4f5e62c54d672e7dfba8a8` |
| Implementation environment | Windows PowerShell; Node `v22.20.0`; npm `10.9.3` |
| Tracked files | 1,028 |
| `apps/web/src` files | 339 |
| `apps/api/src` files | 206 |
| Tracked bytes | 7,034,802 |
| Workspaces | `api@0.1.0`, `web@0.0.0`, `@jackson/types@0.1.0`; `npm ls --workspaces --depth=0` resolved successfully, with only expected Windows-missing Linux optional binaries |
| Implementation-start changes | Planning artifacts under `specs/025-prune-obsolete-code-iteration-2/`, `.specify/feature.json`, `AGENTS.md`; `.gitignore` setup verification update |

## Reachability Records

| ID | Target | Entry graph | Inbound/dynamic evidence | Flag reachability | Test-only | Replacement authority | Baseline |
|---|---|---|---|---|---:|---|---|
| RR-001 | Production web graph | `WEB_MAIN` | TypeScript parser walk from `apps/web/src/main.tsx` found 45 production-unreachable modules; exact inventory below | Both variants represented in `App.tsx`; both production builds passed | No | Current route tree | `8baaadda` |
| RR-002 | Legacy partnership closure | `NONE` | No production edge; remaining edges are internal or from six sole-purpose tests; dynamic/config/script scans clear | `UNFLAGGED` | Mixed | Current partnership tracker and shared clients | `8baaadda` |
| RR-003 | Older K-1 web closure | `NONE` | No production edge; sole-purpose workbook-dialog test only; backend API contract separately retained | `UNFLAGGED` | Mixed | Current K-1 dashboard/upload/review and canonical tracker components | `8baaadda` |
| RR-004 | Stale partnership proxies | `NONE` | No production edge; sign-off test can target canonical component | `UNFLAGGED` | Mixed | Canonical `features/k1-tracker` components | `8baaadda` |
| RR-005 | Report/review leaves and assets | `NONE` | No production importer or asset reference; consolidated fixture has four retained test consumers | `UNFLAGGED` | Mixed | Current report/review components and retained fixture | `8baaadda` |
| RR-006 | Process-local seeds | `OPERATOR_DOC` | Only stale historical execution instructions; scripts mutate obsolete process-local repositories | `NOT_APPLICABLE` | No | Current test fixtures/migrations; PostgreSQL partnership seed retained | `8baaadda` |
| RR-007 | MUI/Emotion closure | `WEB_MAIN` | Only root provider/theme/test and package peers; no live component consumes MUI/Emotion | `BOTH` | No | Existing Tailwind/component styling | `8baaadda` |
| RR-008 | MFA pages and flow store | `NONE` before reconnection | Existing API methods/handlers and tests are retained; user-requested flag makes these an intentional security surface | `BOTH` | No | Existing MFA protocol | `8baaadda` |
| RR-009 | Post-deletion production web graph | `WEB_MAIN` | Recomputed after all approved removals; only `consolidatedHoldingsFixture.ts` remains production-unreachable and it has four retained test consumers | `BOTH` | Yes | Test fixture retained; no newly exposed production candidates | working tree after DG-01 through DG-07 |

### Baseline production-unreachable inventory (45)

The parser follows relative imports, referenced files, index files, and dynamic-import syntax from `apps/web/src/main.tsx`. Static absence is complemented by test, package, infrastructure, documentation, and convention scans before classification.

```text
apps/web/src/auth/authFlowStore.ts
apps/web/src/features/k1-tracker/api/k1TrackerClient.ts
apps/web/src/features/k1-tracker/components/ImportWorkbookDialog.tsx
apps/web/src/features/k1-tracker/components/K1InputsPanel.tsx
apps/web/src/features/k1-tracker/components/PartnershipPicker.tsx
apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts
apps/web/src/features/partnership-tracker/components/JournalEntryPanel.tsx
apps/web/src/features/partnership-tracker/components/K1InputsPanel.tsx
apps/web/src/features/partnership-tracker/components/LiabilitiesPanel.tsx
apps/web/src/features/partnership-tracker/components/OutsideBasisPanel.tsx
apps/web/src/features/partnership-tracker/components/ReconciliationPanel.tsx
apps/web/src/features/partnership-tracker/components/SignOffPanel.tsx
apps/web/src/features/partnership-tracker/components/UnderlyingAssetsPlaceholder.tsx
apps/web/src/features/partnership-tracker/components/YearStatusPanel.tsx
apps/web/src/features/partnership-tracker/components/YearSummaryCards.tsx
apps/web/src/features/partnerships/api/fmvClient.ts
apps/web/src/features/partnerships/components/ActivityDetailPreview.tsx
apps/web/src/features/partnerships/components/AddAssetDialog.tsx
apps/web/src/features/partnerships/components/AddCapitalActivityDrawer.tsx
apps/web/src/features/partnerships/components/AddCommitmentDrawer.tsx
apps/web/src/features/partnerships/components/AddPartnershipDialog.tsx
apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx
apps/web/src/features/partnerships/components/AssetValuationHistory.tsx
apps/web/src/features/partnerships/components/AssetsSection.tsx
apps/web/src/features/partnerships/components/CapitalActivitySection.tsx
apps/web/src/features/partnerships/components/CapitalOverviewSection.tsx
apps/web/src/features/partnerships/components/EditPartnershipDialog.tsx
apps/web/src/features/partnerships/components/ExpectedDistributionSection.tsx
apps/web/src/features/partnerships/components/FmvSnapshotsSection.tsx
apps/web/src/features/partnerships/components/K1HistorySection.tsx
apps/web/src/features/partnerships/components/PartnershipFilters.tsx
apps/web/src/features/partnerships/components/PartnershipKpiStrip.tsx
apps/web/src/features/partnerships/components/RecordAssetFmvDialog.tsx
apps/web/src/features/partnerships/components/RecordFmvDialog.tsx
apps/web/src/features/partnerships/hooks/useFmvMutations.ts
apps/web/src/features/partnerships/hooks/usePartnershipExport.ts
apps/web/src/features/partnerships/hooks/usePartnershipMutations.ts
apps/web/src/features/partnerships/hooks/usePartnershipQueries.ts
apps/web/src/features/reports/components/ConsolidatedHoldingsFilters.tsx
apps/web/src/features/reports/components/ConsolidatedHoldingsSummaryCards.tsx
apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts
apps/web/src/features/review/components/IssueQueueDialog.tsx
apps/web/src/features/review/components/K1ApplyPanel.tsx
apps/web/src/pages/MFAPage.tsx
apps/web/src/pages/MFASetupPage.tsx
```

## Candidates

| ID | Inherited group | Path or name | Kind | Decision | Confidence | Evidence/rationale | Verification IDs |
|---|---|---|---|---|---|---|---|
| CAND-001 | `DEFER-001` | Legacy partnership presentation/CRUD/query closure | Source/test closure | REMOVE | HIGH | 29-file closed graph; no production/config/dynamic/operator consumer; shared live clients and tracker retained | DG-01 checks |
| CAND-002 | `DEFER-002` | Older K-1 client/workbook/input closure | Source/test closure | REMOVE | HIGH | Six-file closed web graph; current K-1 UI and backend `/k1-tracker` contract independently retained | DG-02 checks |
| CAND-003 | `DEFER-003` | Partnership-tracker proxies/placeholders | Source/test closure | REMOVE | HIGH | Nine unconsumed proxies/placeholders; valid sign-off coverage retargets to canonical component | DG-03 checks |
| CAND-004 | `DEFER-004` | Report/review leaves and starter assets | Source/asset closure | REMOVE | HIGH | Four isolated modules and three zero-reference assets; shared consolidated fixture retained | DG-04 checks |
| CAND-005 | `DEFER-005` | Process-local seeds and stale operational guidance | Script/documentation closure | REMOVE | HIGH | No importer/current operator entry; obsolete process-local repository model; PostgreSQL seed retained | DG-05 checks |
| CAND-006 | `DEFER-006` | MUI/Emotion root theme closure | Dependency/source/test closure | REMOVE | HIGH | Root-only provider/theme/test plus package peer closure; no component use or deployment consumer | DG-06 checks |
| CAND-007 | None | Root `transfer:prepare` | Script entry | REMOVE | HIGH | Target `scripts/prepare-laptop-transfer.ps1` is absent and the package entry is the only active reference | DG-07 checks |
| CAND-008 | None | MFA enrollment/verification web and API flow | Security surface | RETAIN | HIGH | Reconnect existing protocol behind requested server-owned, false-default runtime flag | MFA checks |
| CAND-009 | None | Azure Document Intelligence | Provider | RETAIN | HIGH | No implementation remains; preserve zero-active-reference invariant and historical retirement evidence | VR-PROVIDER |
| CAND-010 | None | `apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts` | Test fixture | RETAIN | HIGH | Production-unreachable by design and consumed by four current report/dashboard test surfaces | VR-REACHABILITY, VR-WEB-LEAVES |

### Approved REMOVE inventory (56 files)

All paths below existed at baseline. Total: 56 files, 233,356 bytes, and 4,763 raw TypeScript lines (the planning estimate was 4,386 TypeScript lines; byte and file totals match exactly).

#### DG-01 — legacy partnership web (29 files; 143,277 bytes)

```text
apps/web/src/features/partnerships/api/fmvClient.ts
apps/web/src/features/partnerships/components/ActivityDetailPreview.tsx
apps/web/src/features/partnerships/components/AddAssetDialog.tsx
apps/web/src/features/partnerships/components/AddCapitalActivityDrawer.tsx
apps/web/src/features/partnerships/components/AddCommitmentDrawer.tsx
apps/web/src/features/partnerships/components/AddPartnershipDialog.tsx
apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx
apps/web/src/features/partnerships/components/AssetsSection.tsx
apps/web/src/features/partnerships/components/AssetValuationHistory.tsx
apps/web/src/features/partnerships/components/CapitalActivitySection.tsx
apps/web/src/features/partnerships/components/CapitalOverviewSection.tsx
apps/web/src/features/partnerships/components/EditPartnershipDialog.tsx
apps/web/src/features/partnerships/components/ExpectedDistributionSection.tsx
apps/web/src/features/partnerships/components/FmvSnapshotsSection.tsx
apps/web/src/features/partnerships/components/K1HistorySection.tsx
apps/web/src/features/partnerships/components/PartnershipFilters.tsx
apps/web/src/features/partnerships/components/PartnershipKpiStrip.tsx
apps/web/src/features/partnerships/components/RecordAssetFmvDialog.tsx
apps/web/src/features/partnerships/components/RecordFmvDialog.tsx
apps/web/src/features/partnerships/hooks/useFmvMutations.ts
apps/web/src/features/partnerships/hooks/usePartnershipExport.ts
apps/web/src/features/partnerships/hooks/usePartnershipMutations.ts
apps/web/src/features/partnerships/hooks/usePartnershipQueries.ts
apps/web/src/features/partnerships/components/AddAssetDialog.test.tsx
apps/web/src/features/partnerships/components/AssetDetailDrawer.test.tsx
apps/web/src/features/partnerships/components/AssetsSection.connected-placeholder.test.tsx
apps/web/src/features/partnerships/components/AssetsSection.record-fmv.test.tsx
apps/web/src/features/partnerships/components/AssetsSection.test.tsx
apps/web/src/features/partnerships/components/RecordAssetFmvDialog.test.tsx
```

#### DG-02 — obsolete K-1 web client (6 files; 23,812 bytes)

```text
apps/web/src/features/k1-tracker/api/k1TrackerClient.ts
apps/web/src/features/k1-tracker/components/ImportWorkbookDialog.tsx
apps/web/src/features/k1-tracker/components/K1InputsPanel.tsx
apps/web/src/features/k1-tracker/components/PartnershipPicker.tsx
apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts
apps/web/src/features/k1-tracker/__tests__/ImportWorkbookDialog.test.tsx
```

#### DG-03 — stale partnership proxies (9 files; 1,177 bytes)

```text
apps/web/src/features/partnership-tracker/components/JournalEntryPanel.tsx
apps/web/src/features/partnership-tracker/components/K1InputsPanel.tsx
apps/web/src/features/partnership-tracker/components/LiabilitiesPanel.tsx
apps/web/src/features/partnership-tracker/components/OutsideBasisPanel.tsx
apps/web/src/features/partnership-tracker/components/ReconciliationPanel.tsx
apps/web/src/features/partnership-tracker/components/SignOffPanel.tsx
apps/web/src/features/partnership-tracker/components/UnderlyingAssetsPlaceholder.tsx
apps/web/src/features/partnership-tracker/components/YearStatusPanel.tsx
apps/web/src/features/partnership-tracker/components/YearSummaryCards.tsx
```

#### DG-04 — isolated web leaves/assets (7 files; 48,802 bytes)

```text
apps/web/src/features/reports/components/ConsolidatedHoldingsFilters.tsx
apps/web/src/features/reports/components/ConsolidatedHoldingsSummaryCards.tsx
apps/web/src/features/review/components/IssueQueueDialog.tsx
apps/web/src/features/review/components/K1ApplyPanel.tsx
apps/web/src/assets/hero.png
apps/web/src/assets/react.svg
apps/web/src/assets/vite.svg
```

#### DG-05 — process-local seeds (3 files; 12,158 bytes)

```text
apps/api/src/infra/db/seed/002_k1_fixtures.ts
apps/api/src/infra/db/seed/003_review_fixtures.ts
apps/api/src/infra/db/seed/006_reports_fixtures.ts
```

#### DG-06 — orphaned MUI theme (2 files; 4,130 bytes)

```text
apps/web/src/theme/muiTheme.ts
apps/web/src/theme/muiTheme.test.ts
```

## Protected Surfaces

| ID | Paths or behavior | Reason | Consumer/authority | Verification IDs |
|---|---|---|---|---|
| PS-01 | Both `VITE_MAGIC_PATTERN_DESIGNS` graphs | Feature flag | `apps/web/src/App.tsx` and route tests | VR-WEB-FALSE, VR-WEB-TRUE |
| PS-02 | Current partnership tracker and shared entity/assets clients | Public workflow | Live entity, estate, partnership, and Magic routes | VR-PARTNERSHIP |
| PS-03 | Current K-1 dashboard/upload/review and canonical tracker components | Public workflow/API | Live web routes and backend contracts | VR-K1 |
| PS-04 | Exact extractor set `stub | aws_bda` | Provider | API configuration, workers, tests, and Terraform | VR-PROVIDER |
| PS-05 | SQL migrations and authoritative fixtures | Persisted history/fixture | Filename discovery and regression tests | VR-DATA |
| PS-06 | Both `MFA_LOGIN_ENABLED` states, completion handlers, admin reset/status, and cookie timing | Security | API runtime and pre-auth web routes | VR-MFA-OFF, VR-MFA-ON, VR-MFA-WEB |
| PS-07 | Terraform/package/operator scripts and `004_partnership_fixtures.ts` | Operational entry | Infrastructure and operator documentation | VR-OPS |
| PS-08 | Non-Azure historical specifications | Retention policy | Repository audit history | VR-HYGIENE |

## Deletion Groups

| ID | Boundary | Authority/replacement | Files before | Files after | Bytes removed | Dependency changes | Retargeted tests/docs | Verification | Status |
|---|---|---|---:|---:|---:|---|---|---|---|
| DG-01 | Legacy partnership web: 23 sources + 6 tests | Current partnership tracker and shared clients | 1,028 | 999 present tracked files | 143,277 | None | None | VR-PARTNERSHIP | VERIFIED |
| DG-02 | Obsolete K-1 web client: 5 sources + 1 test | Current K-1 routes/components; backend contract retained | 999 present tracked files | 993 present tracked files | 23,812 | None | None | VR-K1 | VERIFIED |
| DG-03 | Nine stale partnership proxies/placeholders | Canonical K-1 tracker components | 993 present tracked files | 984 present tracked files | 1,177 | None | `PartnershipTrackerSignoff.test.tsx` | VR-PARTNERSHIP | VERIFIED |
| DG-04 | Four report/review leaves + 3 assets | Current report/review implementations | 984 present tracked files | 977 present tracked files | 48,802 | None | `ConsolidatedHoldingsReport.test.tsx` | VR-WEB-LEAVES | VERIFIED |
| DG-05 | Three process-local seeds | Current migrations/test fixtures and PostgreSQL partnership seed | 977 present tracked files | 974 present tracked files | 12,158 | None | Specs 002, 003, 006 | VR-OPS, VR-DATA | VERIFIED |
| DG-06 | MUI theme source/test/provider + four packages | Existing Tailwind/component styling | 974 present tracked files | 972 present tracked files | 4,130 | Removed `@mui/material`, `@mui/icons-material`, `@emotion/react`, and `@emotion/styled`; regenerated lockfile | `main.tsx`, package manifests | VR-MUI, VR-WEB-FALSE, VR-WEB-TRUE | VERIFIED |
| DG-07 | Broken `transfer:prepare` script entry | None; target is absent | 974 present tracked files | 974 present tracked files | N/A | Root manifest only | None | VR-OPS | VERIFIED |

## Verification Records

| ID | Phase | Command/procedure | Environment | Scope | Expected | Actual | Status | Baseline relation |
|---|---|---|---|---|---|---|---|---|
| VR-API | BASELINE | `npm run build:api`; `npm run test:api` | Windows/Node | API protected surfaces | Record baseline | Build passed; suite: 94 files passed, 22 skipped, 2 failed (379 tests passed, 109 skipped, 2 failed). Failures: BDA reparse error-code expectation and missing `ATLAS_TEST_DATABASE_URL` accounting-values test (plus cleanup error). | FAIL | NOT_APPLICABLE |
| VR-WEB | BASELINE | Web lint, typecheck, tests, and color guard | Windows/Node | Web protected surfaces | Record baseline | Lint: 21 errors/3 warnings. Typecheck: extensive existing errors including stale closures. Tests: 89 files passed, 14 failed; 354 tests passed, 22 failed. Color audit: 2 findings in canonical K-1 files. | FAIL | NOT_APPLICABLE |
| VR-WEB-FALSE | FINAL | Web build with Magic flag false | Windows/Node | Legacy graph | Build succeeds | Passed; baseline JS 1,472.52 kB / 397.34 kB gzip and CSS 97.12 kB / 15.82 kB gzip; final JS 1,401.78 kB / 371.97 kB gzip and CSS 90.44 kB / 15.01 kB gzip | PASS | IMPROVED |
| VR-WEB-TRUE | FINAL | Web build with Magic flag true | Windows/Node | Magic graph | Build succeeds | Passed; baseline JS 1,472.52 kB / 397.34 kB gzip and CSS 97.12 kB / 15.82 kB gzip; final JS 1,401.78 kB / 371.97 kB gzip and CSS 90.44 kB / 15.01 kB gzip | PASS | IMPROVED |
| VR-PROVIDER | FINAL | Active Azure scan; provider registry scan; six focused BDA suites; API build | Windows/Node | Provider boundary | Zero active Azure; exact supported providers | Active scan returned no matches; registry exposes exactly `stub` and `aws_bda`; 41/41 focused tests and API build passed | PASS | NEW_PASS |
| VR-MFA-OFF | FINAL | API login/enrollment/verification suites with flag unset and false | Windows/Node | Password-only compatibility | Direct session/cookie; completion endpoints remain characterized | 18/18 tests passed in each isolated state; direct login issues the session cookie and no web rebuild flag exists | PASS | EXTENDED_PASS |
| VR-MFA-ON | FINAL | API login/enrollment/verification suites with flag true | Windows/Node | MFA enforcement | No pre-MFA session; completion creates session | 18/18 tests passed; unenrolled and enrolled password success return the proper flow token without a session cookie, and valid TOTP completion creates the session | PASS | NEW_PASS |
| VR-MFA-WEB | FINAL | Web `App`, `LoginPage`, `MFAPage`, and `MFASetupPage` tests | Windows/Node | Browser flow | Direct session and both pre-auth MFA routes/destinations | 22/22 focused MFA tests passed; missing tokens return to login, transient tokens clear on success, and completion routes to `/dashboard` or `/liquidity` by the existing design flag | PASS | EXTENDED_PASS |
| VR-PARTNERSHIP | GROUP | Partnership focused routes/components, exact-path scans, and import guard | Windows/Node | DG-01, DG-03, PS-02 | Pass or unchanged baseline | DG-01: 18/18 focused tests passed. DG-03: 18/18 sign-off/year/workspace tests passed. Approved paths absent; same-named live components and `AddYearDialog`/`CompareYearsDrawer`/`YearRail` retained; guard passed. | PASS | NEW_PASS |
| VR-K1 | GROUP | Current K-1 web/API focused tests, exact-path scans, and import guard | Windows/Node | DG-02, PS-03 | Pass or unchanged baseline | 31/31 web tests passed; 8 API tests passed/1 skipped; approved closure absent; same-named live partnership picker retained; guard passed | PASS | NEW_PASS |
| VR-WEB-LEAVES | GROUP | Report/review focused tests, exact-path checks, asset scan, fixture-consumer scan | Windows/Node | DG-04 | Approved paths absent; retained behavior passes | 17/17 focused tests passed; asset scan returned no active references; consolidated fixture remains used by four test surfaces | PASS | NEW_PASS |
| VR-MUI | FINAL | Narrow MUI/Emotion zero-reference scan, `npm ci`, workspace listing, static web gates, and both builds | Windows/Node | DG-06 | No active direct references; no pruning regression | No direct MUI/theme or removed Emotion references; clean install completed (720 packages) and workspace tree is healthy apart from expected Windows-missing Linux optional binaries. Lint improved from 21 errors/3 warnings to 14/2; typecheck still fails only on retained baseline findings; full web tests improved from 14 files/22 tests failing to 13 files/21 tests failing; both builds pass with smaller bundles. | PASS | IMPROVED_NO_REGRESSION |
| VR-API-FINAL | FINAL | API build and full test suite | Windows/Node | API protected surfaces | Pass or unchanged baseline failures | Build passed; suite: 96 files passed, 22 skipped, 2 failed (391 tests passed, 109 skipped, 2 failed). The exact baseline failures remain: BDA reparse error-code expectation and missing `ATLAS_TEST_DATABASE_URL` accounting-values test (plus its cleanup error). | FAIL | UNCHANGED_BASELINE |
| VR-WEB-FINAL | FINAL | Web lint, typecheck, full tests, color guard, route-focused tests | Windows/Node | Web protected surfaces | Pass or no new failure | Lint improved to 14 errors/2 warnings; typecheck retains existing non-MFA errors and no removed-path or MFA finding; full suite improved to 84 files/347 tests passed and 13 files/21 tests failed; color guard retains the same two canonical K-1 findings; 47/47 route-focused tests passed. | FAIL | IMPROVED_NO_REGRESSION |
| VR-REACHABILITY | FINAL | TypeScript production-entry graph from `apps/web/src/main.tsx` | Windows/Node | Post-deletion graph | Classify all remaining/new candidates | Only `consolidatedHoldingsFixture.ts` remains unreachable; it is intentionally retained for four test surfaces. No newly exposed candidate exists. | PASS | IMPROVED |
| VR-OPS | FINAL | Seed/script/operator scans, API build, guards, clean install/listing, Terraform format/init/validate, and protected-seed checks | Windows/Node/Terraform 1.14.1 | DG-05, DG-07, PS-07 | No stale executable references; valid deploy wiring | Removed paths absent; active reference scan clean; `004_partnership_fixtures.ts` retained; API build and both guards passed; `npm ci` and `npm ls` passed; Terraform format, offline-backend initialization, and validation passed with one `mfa_login_enabled` input mapped to `MFA_LOGIN_ENABLED` | PASS | NEW_PASS |
| VR-DATA | FINAL | Migration and fixture diffs | Git | PS-05 | No protected changes | Migration diff and authoritative `apps/**/fixtures/**` diff are empty; all 56 approved deletion paths are absent and the protected seed/fixture inventory is present | PASS | NEW_PASS |
| VR-HYGIENE | FINAL | Diff reconciliation, status, deletion/protected inventory, and whitespace checks | Git | Entire iteration | Exact boundary; clean whitespace | `git diff --check` passed; all 56 actual deletions exactly equal the approved inventory; all protected paths are present; 85 tracked changes plus 12 intended new paths are reconciled below; migration and authoritative-fixture diffs are empty; status contains no unclassified artifact | PASS | NEW_PASS |

## Diff Reconciliation

The 56 deleted paths are enumerated exactly in the approved REMOVE inventory. Every other changed or new path is assigned below; there are no unclassified paths.

### Feature planning and repository setup (11)

```text
.gitignore
.specify/feature.json
AGENTS.md
specs/025-prune-obsolete-code-iteration-2/contracts/pruning-safety.md
specs/025-prune-obsolete-code-iteration-2/data-model.md
specs/025-prune-obsolete-code-iteration-2/plan.md
specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md
specs/025-prune-obsolete-code-iteration-2/quickstart.md
specs/025-prune-obsolete-code-iteration-2/research.md
specs/025-prune-obsolete-code-iteration-2/spec.md
specs/025-prune-obsolete-code-iteration-2/tasks.md
```

### MFA runtime flag, protocol reconnection, tests, infrastructure, and operator guidance (20)

```text
apps/api/.env.example
apps/api/src/config.ts
apps/api/src/modules/auth/login.handler.ts
apps/api/tests/auth.login.test.ts
apps/api/tests/auth.mfa-enroll.test.ts
apps/api/tests/auth.mfa-verify.test.ts
apps/web/src/App.test.tsx
apps/web/src/App.tsx
apps/web/src/auth/authClient.ts
apps/web/src/pages/LoginPage.test.tsx
apps/web/src/pages/LoginPage.tsx
apps/web/src/pages/MFAPage.test.tsx
apps/web/src/pages/MFAPage.tsx
apps/web/src/pages/MFASetupPage.test.tsx
apps/web/src/pages/MFASetupPage.tsx
docs/deployment/aws-liquidity-production-readiness.md
infra/aws/terraform/main.tf
infra/aws/terraform/production.tfvars.example
infra/aws/terraform/staging.tfvars.example
infra/aws/terraform/variables.tf
```

### Dependency and entry cleanup (4)

```text
apps/web/package.json
apps/web/src/main.tsx
package-lock.json
package.json
```

### Retargeted retained tests (2)

```text
apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerSignoff.test.tsx
apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx
```

### Corrected historical execution guidance (4)

```text
specs/002-k1-ingestion/tasks.md
specs/003-review-and-finalization/quickstart.md
specs/003-review-and-finalization/tasks.md
specs/006-reports/tasks.md
```

## Deferred Decisions

| ID | Candidate | Missing decision/evidence | Reason retained for later iteration |
|---|---|---|---|
| DEF-001 | Backend `/k1-tracker` routes, repository, and import services | Product/API retirement decision | Public/integration contract remains independently tested |

The post-deletion graph exposed no new candidates. The single remaining production-unreachable test fixture is classified as `RETAIN` in CAND-010.

## Final Deltas

| Metric | Baseline | Final | Delta |
|---|---:|---:|---:|
| Projected tracked files after commit | 1,028 | 984 | -44 (56 removals plus 12 new tests/planning artifacts) |
| Projected tracked bytes after commit | 7,034,802 | 6,943,793 | -91,009 |
| Approved files removed | 0 | 56 | +56 |
| Approved bytes removed | 0 | 233,356 | +233,356 |
| `apps/web/src` files | 339 | 288 | -51 |
| `apps/api/src` files | 206 | 203 | -3 |
| Raw TypeScript lines removed | 0 | 4,763 | +4,763 |
| Web runtime dependencies | 15 | 11 | -4 |
| Magic=false bundle | JS 1,472.52 kB / 397.34 kB gzip; CSS 97.12 kB / 15.82 kB gzip | JS 1,401.78 kB / 371.97 kB gzip; CSS 90.44 kB / 15.01 kB gzip | JS -70.74 kB / -25.37 kB gzip; CSS -6.68 kB / -0.81 kB gzip |
| Magic=true bundle | JS 1,472.52 kB / 397.34 kB gzip; CSS 97.12 kB / 15.82 kB gzip | JS 1,401.78 kB / 371.97 kB gzip; CSS 90.44 kB / 15.01 kB gzip | JS -70.74 kB / -25.37 kB gzip; CSS -6.68 kB / -0.81 kB gzip |

Projected tracked counts include the 12 currently untracked but intentional MFA test and Spec 025 artifact files. The pruning boundary itself removes 56 files; the planning and test additions explain why the net repository file delta is smaller.
