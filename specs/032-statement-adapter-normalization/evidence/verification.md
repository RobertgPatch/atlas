# 032 Verification Evidence

This file records synthetic/local verification only. It contains no original
statement contents, account identifiers, credentials, or production evidence.

## Baseline — 2026-09-28

Environment: Windows local workspace, Node 22 project toolchain, branch
`032-statement-adapter-normalization`. The 032 application changes had not yet
been implemented when this baseline was captured.

Command:

```powershell
npm run --workspace=api test -- tests/liquidity-statements/csv-adapters.test.ts tests/liquidity-statements/normalization.test.ts tests/liquidity-statements/reconciliation.test.ts tests/consolidated-holdings.identity.test.ts tests/liquidity-csv-journey.integration.test.ts tests/liquidity-csv-history.integration.test.ts
```

Result: 4 files passed, 2 files skipped; 31 tests passed, 3 tests skipped.
The skipped files require a configured local PostgreSQL test database. They are
baseline gaps, not passing evidence for publication, replay, persistence, or
history behavior.

The passing characterization covers the two existing CSV layouts, exact-string
retention, normalization/reconciliation unit behavior, and consolidated-holding
identity logic. Database-backed monthly replacement and persistent reload remain
to be proven with `ATLAS_REQUIRE_LIQUIDITY_DB_TESTS=true` and a dedicated
loopback `ATLAS_TEST_DATABASE_URL`.

## Inherited release obligations

Local implementation does not establish production readiness. Unique operator
identity/MFA, retention approval, dependency and secret scanning, route policy,
recovery evidence, applicable legal review, main-branch review, explicit release
authorization, production preflight, rollback and smoke checks remain governed
by the constitution and deployment runbooks. No deployment is part of 032
implementation unless separately requested from `main`.

## Running record

| Date | Scope | Result | Notes |
|---|---|---|---|
| 2026-09-28 | Existing adapter/normalization/report baseline | PASS WITH SKIPS | 31 passed; 3 database-dependent tests skipped and remain unverified |
| 2026-09-28 | Foundational 032 checkpoint (T033) | PASS | 33 files and 321 tests passed against fresh loopback PostgreSQL; zero skipped; API/shared build passed |
| 2026-09-28 | Morgan Stanley XLSX golden adapter (T036/T042) | PASS | 4 focused tests passed; API/shared build passed; private workbook inspected read-only and excluded from repository |
| 2026-09-28 | CSV/XLSX upload and immutable storage (T037/T044/T045) | PASS | 55 tests passed against loopback PostgreSQL with zero skips; API/shared build passed |
| 2026-09-28 | Statement rollup and quote safety (T038/T047 unit scope) | PASS | 40 focused unit tests passed; API/shared build passed |

## Foundational checkpoint â€” 2026-09-28

Command: `ATLAS_TEST_DATABASE_URL=postgresql://...@127.0.0.1:15432/atlas_statement_checkpoint_032 ATLAS_REQUIRE_LIQUIDITY_DB_TESTS=true REPORT_EXPORTS_ENABLED=true npm run --workspace=api test -- tests/liquidity-statements`.

Result: 33 test files passed; 321 tests passed; zero skipped. Coverage includes shared schema/legacy decoding, fresh and upgrade migrations, exact decimal/CSV/XLSX readers, hostile ZIP/XML handling, adapter registry ambiguity, privacy/minimization, worker timeout/cancellation, normalization/control comparison, reprocessing, evidence pagination, authorization, repository compatibility, and lifecycle behavior. `npm run build:api` also passed.

An initial run found one repository-compatibility regression from a redundant scoped read inside the new record pager. The detail path now reuses its already-authorized import row; both the focused regression and complete checkpoint pass. XLSX remains default-off. No deployment, commit, push, or production action was performed.

## Final local acceptance — 2026-09-28

Environment: Windows local workspace, Node 22, PostgreSQL 16 in Docker on loopback, branch `032-statement-adapter-normalization`. Mandatory database suites used fresh dedicated databases with `ATLAS_REQUIRE_LIQUIDITY_DB_TESTS=true`; no database test was counted from a skipped run.

| Gate | Result |
|---|---|
| API statement suite | PASS — 42 files, 432 tests, 0 skipped |
| Related journey/history/report/pricing API suite | PASS — 5 files, 50 tests, 0 skipped; `REPORT_EXPORTS_ENABLED=true` |
| Web report feature suite | PASS — 17 files, 61 tests |
| Real browser CSV/XLSX/account-selection/history/retry suite | PASS — 7 tests, one worker, fresh loopback database |
| API/shared and production web builds | PASS; web emits the pre-existing >500 KiB chunk warning |
| Changed 032 web ESLint scope | PASS |
| Changed 032 web standalone TypeScript scope | PASS |
| Route-policy inventory | PASS — 1 file, 7 tests; 140 declared routes |
| Runtime dependency audit | PASS — 0 findings, 0 high/critical |
| `npm audit --omit=dev` | PASS — 0 vulnerabilities |
| Diff whitespace check | PASS; Git reports only configured LF-to-CRLF checkout notices |
| Performance/resource suite | PASS — 2 files, 5 tests; see `performance.md` |
| Recovery suite | PASS — 1 file, 2 tests; see `recovery.md` |
| Authorized sample structure review | PASS — all three matched, all records accounted, no blocking finding; see `sample-review.md` |

Final browser acceptance command used a fresh dedicated database through `ATLAS_E2E_DATABASE_URL`; the default named E2E database must exist before the runner starts. The first attempt correctly failed its server-start prerequisite because that database did not exist. A later reused-database run exposed accumulated-state flakiness, so the recorded pass uses a newly created isolated database, as required by the quickstart.

Two failures found during acceptance were fixed rather than waived: a 5,000-row statement exceeded the 32 MiB worker boundary because the worker returned duplicate document/draft payloads, and concurrent test-app bootstrap could race on the unique Admin email. The worker now returns only required parent evidence and the bootstrap insert is idempotent. The unchanged configured limits then passed on a fresh database.

Repository-wide `npm run --workspace=web typecheck` and `npm run --workspace=web lint` remain non-green because of existing unrelated K-1, partnership, TIC, authentication-test-fixture, and general report typing/lint debt. The 032 files pass a standalone TypeScript check and targeted ESLint check, both application builds pass, and all changed feature/browser tests pass. The repository-wide debt is a release prerequisite; it is not hidden as a 032 pass and was not expanded into unrelated remediation.

## Requirement and conformance audit

| Boundary | Evidence | Result |
|---|---|---|
| FR-001–FR-005 | bounded CSV/XLSX readers, structural registry, executable adapter declarations, disposition/account-section tests | PASS |
| FR-006–FR-013 | schema contracts, exact lexical decimal tests, normalization/precedence/classification/cash/identity tests, typed evidence pagination | PASS |
| FR-014–FR-016 | consolidated symbol/subrow tests, complete replacement/idempotency, pinned recipes/reprocess/history | PASS |
| FR-017–FR-019 | actionable findings/evidence UI, onboarding/conformance guide, legacy migration/repository compatibility | PASS |
| FR-020–FR-021 | hostile ZIP/XML and worker termination/fencing tests; real browser raw-byte/reload/retry journeys | PASS |
| FR-022–FR-024 | exhaustive account selection/exclusion, Morgan adjusted-cost rules, sample-assisted adapter workflow and retained CSV mapper | PASS |
| SC-001 | Merrill, Schwab, and Morgan independent golden suites | PASS |
| SC-002 | fourth synthetic adapter added only through conformance registry/fixture; no downstream custodian branch | PASS |
| SC-003 | conformance plus unclaimed-section tests account for every relevant source record exactly once | PASS |
| SC-004 | API/browser monthly replacement, reload, rollup, history, and no-op replay | PASS |
| SC-005–SC-006 | optional-value/unsafe-derivation tests and immutable legacy/correction history | PASS |
| SC-007 | 2,000-position worker p95 768 ms; configured-limit persistence and responsiveness pass | PASS LOCALLY; deployment-equivalent RSS remains required before XLSX enablement |
| SC-008 | hostile/ambiguous/no-network/privacy/auth/resource suites | PASS |

Runtime source contains no Plaid routes, jobs, credentials, or dependencies; historical migration references and explicit no-Plaid documentation/tests remain intentionally. Real-time pricing stays server-controlled and default-off, and price equal to one never proves cash without confirmed semantics. Exact authorized filenames do not occur in tracked implementation/evidence. No private fixture, statement value, screenshot, or raw row was committed.

## Supported layouts, rollback, and release prerequisites

- Supported automatic layouts: Merrill Lynch holdings CSV v1.0.0, Charles Schwab positions CSV v1.0.0, and Morgan Stanley holdings XLSX v1.0.0. Unknown CSV retains the import-scoped mapper. Unknown or ambiguous XLSX requires a tested adapter.
- New XLSX admission remains default-disabled. CSV defaults to 10 MiB/5,000 rows; statement and workbook limits are listed in the quickstart/runbook. A file beneath a resource limit is not automatically a supported layout.
- Migration 051 is additive. Rollback must use a 032-compatible image after neutral `STATEMENT` publication, retain both originals and all database evidence, and keep at least the current and prior adapter generations. No down migration was tested or authorized.
- Before release: resolve or explicitly govern the repository-wide web typecheck/lint debt; run the ordinary reviewed main-branch process; confirm unique operator identity/MFA, backup/retention/legal obligations, live S3/KMS/CORS/IAM, deployment-sized combined API/worker memory, production PITR/RPO/RTO, smoke checks, and explicit deployment authorization.

No production, deployment, commit, push, merge, or external statement publication was performed.
