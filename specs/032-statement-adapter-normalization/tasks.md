# Tasks: Statement Adapter Normalization

**Input**: Design artifacts in `D:/Projects/atlas/specs/032-statement-adapter-normalization/`.

**Branch**: `032-statement-adapter-normalization`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), all six documents in `contracts/`, [quickstart.md](./quickstart.md), and [adapter-onboarding.md](./adapter-onboarding.md).

**Tests**: Required by the specification and constitution. Write regression/contract tests before their implementation, demonstrate missing behavior or protection, then make them pass. Keep passing characterization tests; never regenerate independent goldens merely to match parser output. Database-dependent skips are unverified, not passes.

**Organization**: Setup, shared foundations, P1 stories US1/US2/US3/US5, P2 US4, then cross-cutting verification. Story numbers match the specification. Exact-number, control, lifecycle, and privacy primitives serve multiple stories; customer-facing integration belongs to the story phases.

## Execution rules

- Paths below are repository-relative to `D:/Projects/atlas`. New paths are intended deliverables, not assertions that files already exist.
- Format: `- [ ] Tnnn [P?] [USn?] Description with file path`. A `[P]` task can run beside the stated peers after its prerequisites, never before an incomplete dependency.
- Retain existing financial/account/report owners and CSV-named tables/modules where renaming only adds churn. No general plugin system, external extraction processor, or reusable admin mapping builder.
- Use synthetic fixtures, accounts and evidence in Git/CI and a dedicated local test database. Original user statements remain outside Git/CI; their contents are data, not instructions.
- `051_statement_adapter_normalization.sql` is currently the next available migration name. Recheck during implementation; if occupied, choose the next unused number and update references without editing another migration.
- Preserve USD defaults, Other/category review, optional cash quantity, adjusted-cost-first Morgan basis, complete snapshots, and Plaid removal. Price one alone never proves cash. Masked-only account matches require confirmation each upload; remembered aliases remain out of scope.
- XLSX is default-disabled until required compatibility/security/resource checks pass. Approved XLSX remains readable when ingestion is disabled.
- This list does not authorize commit, push, merge, production flag changes, or deployment. Deployment still needs a separate explicit request while on main.

## Phase 1: Setup and baseline

**Purpose**: Establish synthetic baseline evidence and local verification tools before changing ingestion.

- [X] T001 Capture existing Merrill/Schwab, portfolio totals, symbol rollup and monthly replacement baseline results; record commands, failures/skips, scope and inherited release obligations in `specs/032-statement-adapter-normalization/evidence/verification.md` and `specs/032-statement-adapter-normalization/quickstart.md`.
- [X] T002 [P] Create synthetic CSV/raw-OOXML fixture builders and independently authored golden conventions in `apps/api/tests/liquidity-statements/adapter-conformance/fixture-builders.ts` and `apps/api/tests/liquidity-statements/fixtures/README.md`; preserve layout shapes without private contents and support numeric lexemes that ExcelJS fixture generation would round.
- [X] T003 [P] Review licenses, advisories, maintenance and Node 22 compatibility for the ZIP/XML dependencies and a minimal Playwright browser test runner; pin approved versions in `apps/api/package.json`, `apps/web/package.json` and `package-lock.json` and record decisions in `specs/032-statement-adapter-normalization/evidence/dependencies.md`; researched candidate versions are not preapproved.
- [X] T004 [P] Add a mandatory local-test-DB mode in `apps/api/tests/liquidity-statements/testHelpers.ts` and regressions in `apps/api/tests/liquidity-statements/test-environment.test.ts`; refuse production targets and fail the 032 acceptance run when required PostgreSQL suites would otherwise skip.
- [X] T005 After T002–T004, add `apps/web/playwright.config.ts`, `apps/web/e2e/fixtures/liquidity.ts` and a script in `apps/web/package.json` for real local web/API/object-store acceptance tests; isolate synthetic state, avoid mocked upload success and logged credentials, and document the command in `specs/032-statement-adapter-normalization/quickstart.md`.

**Checkpoint**: Baseline is recorded and fixtures, real-DB tests and browser verification can run locally. Dependency findings block their affected scope.

## Phase 2: Shared foundations

**Purpose**: Establish safe format-neutral contracts and runtime primitives required by all stories. Foundation tests use small synthetic adapters; real custodian implementations follow in US1.

### Contract and persistence foundations

- [X] T006 [P] Add schema-3/legacy projection tests in `apps/api/tests/liquidity-statements/schema.contract.test.ts` and `apps/api/tests/liquidity-statements/draft-compat.test.ts` covering tagged locations, availability, interpretation versus derivation, units, controls, recipe identity and unchanged stored schema-2 amounts/hashes.
- [X] T007 [P] Add fresh/upgrade tests in `apps/api/tests/liquidity-statements/migration.integration.test.ts` for file/source kinds, typed record checks, immutable runs, scoped active reviews, monotonic revisions, retained-source uniqueness and concurrent duplicates using synthetic pre-032 records.
- [X] T008 [P] Add `apps/api/tests/liquidity-statements/worker.integration.test.ts` for actual termination/cancellation, stale generations, unavailable pinned versions, wrong source/output, output/retry bounds, heartbeat recovery and rollback of incomplete persistence.
- [X] T009 [P] Add `apps/api/tests/liquidity-statements/evidence-privacy.test.ts` for account/title/filename masking, unknown metadata and extra columns, mapping previews, opaque occurrence IDs, full/masked/unreliable numeric identities and sanitized legacy responses without stored-evidence rewrites.
- [X] T010 Implement the public schema owner in `packages/types/src/liquidity-statements.ts`, API re-exports in `apps/api/src/modules/liquidity-statements/liquidity-statement.types.ts`, typed source records in `apps/api/src/modules/liquidity-statements/statement-document.types.ts` and in-memory legacy decoding in `apps/api/src/modules/liquidity-statements/statement-draft.compat.ts`; include the fields, controls, interpretations, units, recipes, completeness and selection contracts in `specs/032-statement-adapter-normalization/data-model.md`.
- [X] T011 Add `apps/api/src/infra/db/migrations/051_statement_adapter_normalization.sql` with CSV-compatible file metadata, NEEDS_ADAPTER, recipe/hash, format-aware locations/roles, scoped active review, exclusions, retained-source backfill/duplicate index, STATEMENT constraints and bounded-query indexes; extend immutability guards without changing old keys, payloads, IDs or hashes.
- [X] T012 Extend `apps/api/src/modules/liquidity-statements/liquidity-statement.repository.ts` for typed evidence, recipes, selections and application history; allocate import-wide review revisions under lock, clear only the active pointer on a new run, and never select another run's historical review as current.
- [X] T013 Implement and test all independent ceilings from `specs/032-statement-adapter-normalization/contracts/readers-and-adapters.md` in `apps/api/src/modules/liquidity-statements/liquidity-statement.config.ts`, `apps/api/src/config.ts` and `apps/api/tests/liquidity-statements/resource-config.test.ts`; include one worker, 30-second deadline, at most two transient retries and default-false XLSX capability while preserving existing kill switches.

### Exact readers and detection

- [X] T014 [P] Add `apps/api/tests/liquidity-statements/lexical-decimal.test.ts` for bounded exponent expansion, signed/zero values, eight/twelve-place quantization, half-away-from-zero rounding, canonical magnitude limits, 256-character tokens and exponent magnitude 100, including lexical cases binary floats would change.
- [X] T015 Implement `apps/api/src/modules/liquidity-statements/readers/lexical-decimal.ts` with bounded BigInt arithmetic over `apps/api/src/modules/liquidity-statements/csv/decimal.ts`; never use Number/parseFloat for authoritative money/identifiers and preserve raw tokens plus quantization evidence.
- [X] T016 Adapt the existing tokenizer in `apps/api/src/modules/liquidity-statements/readers/csv.reader.ts` with tests in `apps/api/tests/liquidity-statements/csv-reader.test.ts`; preserve BOM/delimiter/quoted-newline behavior, array cells and physical spans, permit declared metadata widths, and reject malformed/oversized records without skipped lines.
- [X] T017 [P] Add `apps/api/tests/liquidity-statements/xlsx-package.test.ts` for arbitrary ZIP, encryption/macros/embedded executable content, forged sizes, duplicate/traversal paths, invalid relationships, malformed XML, DTD/entities, XML work limits and attempted external resolution.
- [X] T018 [P] Add `apps/api/tests/liquidity-statements/xlsx-reader.test.ts` for shared/inline/rich strings, sparse/duplicate coordinates, styles and absurd dimensions, merges, hidden/filtered rows/sheets, 1900/1904 dates and serial 60, percentage representations and cached/missing/error/external formulas without evaluation.
- [X] T019 Implement `apps/api/src/modules/liquidity-statements/readers/xlsx-package.ts` with lazy standard-OOXML package validation, actual streamed inflation counters, per-part/aggregate/XML bounds, safe relationships and abort cleanup; perform no disk extraction, macro execution or outbound resolution.
- [X] T020 Implement `apps/api/src/modules/liquidity-statements/readers/xlsx.reader.ts` over T019 with exact numeric lexemes, typed sparse cells, style/date-system/visibility/merge/cache metadata and global ordinals; use real sheet/row/A1 evidence, never fake CSV lines, dimension-based allocation or numeric forward fill.
- [X] T021 Implement `apps/api/src/modules/liquidity-statements/adapters/adapter.types.ts`, `apps/api/src/modules/liquidity-statements/adapters/registry.ts` and `apps/api/src/modules/liquidity-statements/adapters/detect.ts` with tests in `apps/api/tests/liquidity-statements/adapter-registry.test.ts`; require pure deterministic adapters, named header access, complete row/sheet disposition, nonoverlapping matches, explicit ambiguous/no-match/custodian mismatch outcomes and structurally validated hints.

### Financial, privacy and lifecycle primitives

- [X] T022 Extend `apps/api/tests/liquidity-statements/normalization.test.ts` and `apps/api/tests/liquidity-statements/reconciliation.test.ts` with the precedence, confirmed cash, incomplete/estimated basis, negative gain, USD/non-USD, units/accrual, source-subset controls, reviewed overlay, rounding and unknown-versus-zero cases in `specs/032-statement-adapter-normalization/contracts/normalization-and-controls.md`.
- [X] T023 Implement versioned shared rules in `apps/api/src/modules/liquidity-statements/csv/normalize.ts` and `apps/api/src/modules/liquidity-statements/csv/fields.ts`; recompute only owned financial derivations, preserve interpretations/reviews, require confirmed cash, retain incomplete/optional values, prefer compatible imported/dollar-gain basis before estimated percentages and gate quantity/price math on verified conventions.
- [X] T024 Implement immutable original control comparisons and separate effective reviewed comparisons in `apps/api/src/modules/liquidity-statements/csv/reconcile.ts`; honor account/currency/metric/original subset/tolerance, keep canonical coverage separate, preserve original mismatches and resolve only compatible reasoned corrections.
- [X] T025 Implement parent-side scoped HMAC matching and minimized evidence in `apps/api/src/modules/liquidity-statements/csv/account-identity.ts` and `apps/api/src/modules/liquidity-statements/statement-evidence.ts`; preserve leading-zero full IDs transiently, reject masked/precision-lost numeric auto-matches, mask identity locations and omit unclassified raw values from routine persistence/responses.
- [X] T026 Implement `apps/api/src/modules/liquidity-statements/statement-processing.worker.ts` for bounded read/detect/extract/normalize/reconcile work using bytes and validated recipe/config only; bound and validate output and provide no application path for DB/secrets/network, formula evaluation or uploaded code.
- [X] T027 Implement `apps/api/src/modules/liquidity-statements/statement-processing.service.ts` and wire the existing `apps/api/src/modules/liquidity-statements/csv-processing.service.ts` owner to it; pin actual reader/adapter/schema/rule/catalog/config versions, minimize/fingerprint before persistence, terminate on timeout/cancel, fence source/run/generation and preserve bounded retries, atomic persistence and safe audit/error outcomes.
- [X] T028 Extend `apps/api/src/modules/liquidity-sources/liquidity-source.types.ts`, `apps/api/src/modules/liquidity-sources/liquidity-source.zod.ts` and `apps/api/src/modules/liquidity-sources/liquidity-source.repository.ts` for legacy CSV plus neutral STATEMENT and file/adapter/unit provenance without relabeling old rows or granting unknown source kinds pricing eligibility.
- [X] T029 Add `apps/api/tests/liquidity-statements/reprocess.integration.test.ts` for explicit new runs, preserved originals/reviews/approvals, monotonic revisions, active-lease refusal, recipe changes, duplicate reopen, custodian conflicts and correction cancellation retaining duplicate identity under concurrent upload.
- [X] T030 Implement explicit reprocess/abandon behavior in `apps/api/src/modules/liquidity-statements/liquidity-statement.service.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.repository.ts`; create pinned runs without copying incompatible edits or changing published holdings, retain accepted source identity, restore the prior applied view on abandonment and distinguish retry from reprocess.
- [X] T031 Add `POST /:statementId/reprocess` in `apps/api/src/modules/liquidity-statements/liquidity-statement.zod.ts`, `apps/api/src/modules/liquidity-statements/liquidity-statement.handler.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.routes.ts` with `apps/api/tests/liquidity-statements/reprocess.contract.test.ts`; validate version/reason/registered hints and existing Admin/CSRF/entity/admission policy without dynamic code or arbitrary claimed versions.
- [X] T032 Add bounded detail/evidence reads in `apps/api/src/modules/liquidity-statements/liquidity-statement.repository.ts`, `apps/api/src/modules/liquidity-statements/liquidity-statement.routes.ts`, `apps/api/src/modules/liquidity-statements/liquidity-statement.handler.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.zod.ts`; implement records cursors, bounded account/position paging and legacy projection, enforce 100-record/1-MiB record pages and test scope/payload limits in `apps/api/tests/liquidity-statements/evidence-pagination.contract.test.ts`.
- [X] T033 Run foundational schema, real-DB migration/lifecycle, reader, privacy and termination suites plus API/shared builds; record exact results and affected-scope blockers in `specs/032-statement-adapter-normalization/evidence/verification.md` before story integration.

**Checkpoint**: Synthetic adapters exercise the safe versioned pipeline; stored drafts remain readable and reprocessing never publishes. XLSX activation remains gated.

## Phase 3: US1 — Import supported monthly statements accurately (P1, local MVP)

**Goal**: Merrill CSV, Schwab CSV and Morgan XLSX reach durable, correctly grouped Liquidity holdings through the actual upload/review/preview/apply workflow.

**Independent test**: Upload one synthetic complete account per format, check exact canonical fields/evidence, apply and reload. A later statement replaces only its account; older history does not displace it; compatible same-symbol holdings across custodians show one parent with account subrows.

### Tests first

- [X] T034 [P] [US1] Add `apps/api/tests/liquidity-statements/fixtures/merrill/holdings.csv`, `apps/api/tests/liquidity-statements/fixtures/merrill/expected.json` and `apps/api/tests/liquidity-statements/merrill-adapter.test.ts` for headers/date/account, optional richer columns, unrealized versus cumulative gain, leading zeros and named bank-deposit/BLF cash programs.
- [X] T035 [P] [US1] Add `apps/api/tests/liquidity-statements/fixtures/schwab/positions.csv`, `apps/api/tests/liquidity-statements/fixtures/schwab/expected.json` and `apps/api/tests/liquidity-statements/schwab-adapter.test.ts` for title metadata, explicit type/basis/day change, incomplete basis, totals, masked identity, repeated symbols and unexpected footer rejection.
- [X] T036 [P] [US1] Add `apps/api/tests/liquidity-statements/fixtures/morgan-stanley/holdings.fixture.ts`, `apps/api/tests/liquidity-statements/fixtures/morgan-stanley/expected.json` and `apps/api/tests/liquidity-statements/morgan-stanley-adapter.test.ts` for dynamic headers, percentage points, adjusted/total basis zero/incomplete/fallback, separate partial controls, broad product labels, value-only cash, non-cash price one and percent-of-par bonds.
- [X] T037 [P] [US1] Extend `apps/api/tests/liquidity-statements/upload.contract.test.ts` and `apps/api/tests/liquidity-statements/storage.contract.test.ts` for kind/MIME/content consistency, exact bytes, local PUT/S3 headers, old keys, safe downloads, expiry/hash failures and unsupported kind rejection.
- [X] T038 [P] [US1] Extend `apps/api/tests/liquidity-csv-journey.integration.test.ts`, `apps/api/tests/consolidated-holdings.identity.test.ts` and `apps/api/tests/liquidity-market-pricing.test.ts` with three-format monthly removal/replacement/history, durable totals, compatible same-symbol/different-description rollups and incompatible currency/units/identity and unsafe-pricing negatives.
- [X] T039 [P] [US1] Add `apps/web/e2e/liquidity-statements.spec.ts` for real CSV/XLSX upload/complete/poll/detail/review/preview/apply, bytes/MIME, retryable draft-load failure, USD/category controls and portfolio/account-row persistence after navigation and authenticated reload.

### Implementation

- [X] T040 [P] [US1] After T034, implement `apps/api/src/modules/liquidity-statements/adapters/merrill/holdings-csv.ts` from the working profile with structural aliases, schema-3 interpretations, date/account quality, source dispositions, optional fields, named cash mappings and absent-total support.
- [X] T041 [P] [US1] After T035, implement `apps/api/src/modules/liquidity-statements/adapters/charles-schwab/positions-csv.ts` with title/header semantics, richer fields, full/masked identity distinction, scoped controls, row accounting and rejection of incompatible export grains.
- [X] T042 [P] [US1] After T036, implement `apps/api/src/modules/liquidity-statements/adapters/morgan-stanley/holdings-xlsx.ts` with statement-level dates, typed percentages, adjusted-cost-first policy, original/adjusted observations and controls, tested classification, explicit bond conventions and complete account/section boundaries independent of fixed row numbers.
- [X] T043 [US1] Register initial families and the mapper in `apps/api/src/modules/liquidity-statements/adapters/registry.ts` and `apps/api/src/modules/liquidity-statements/adapters/mapped-csv.ts`; replace hard-coded dispatch in `apps/api/src/modules/liquidity-statements/csv/profiles.ts` while retaining old adapter identities for historical decoding and import-bound mapping behavior.
- [X] T044 [US1] Extend `apps/api/src/modules/liquidity-statements/csv-object-store.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.service.ts` for immutable kind-correct storage, strict ID-based original.csv/original.xlsx paths, required headers/checksums/object versions and safe download names without changing old keys.
- [X] T045 [US1] Extend `apps/api/src/modules/liquidity-statements/liquidity-statement.zod.ts`, `apps/api/src/modules/liquidity-statements/liquidity-statement.routes.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.handler.ts` for omitted-kind CSV compatibility, XLSX MIME/raw-buffer handling, actual-kind verification, specific errors and default-off capability enforcement.
- [X] T046 [US1] Integrate schema-3 financial provenance in `apps/api/src/modules/liquidity-statements/csv-review.service.ts`, `apps/api/src/modules/liquidity-statements/csv-application-preview.service.ts` and `apps/api/src/modules/liquidity-statements/csv-application.service.ts`; retain atomic audit/outbox/idempotency and compare prior publication by source, target account, effective snapshot and order-independent financial digest preserving multiplicity but excluding recipe/evidence IDs.
- [X] T047 [US1] Replace source-kind arithmetic shortcuts in `apps/api/src/modules/liquidity-sources/liquidity-source.read.ts` and `apps/api/src/modules/reports/consolidatedHoldings.service.ts` with explicit unit/multiplier/accrual/provider-identity eligibility; preserve source values and compatible symbol rollups, separate conflicting currencies/units/reliable identifiers and keep quotes default-off.
- [X] T048 [US1] Update `apps/web/src/features/reports/api/liquidityStatementsClient.ts`, `apps/web/src/features/reports/components/LiquidityCsvUploadDialog.tsx` and `apps/web/src/features/reports/components/LiquidityCsvDialog.tsx` for CSV/XLSX byte hashing and required headers, “Upload statements” labels, format/status display and retryable detail reads without duplicate uploads or publication.
- [X] T049 [US1] Integrate neutral fields and typed evidence in `apps/web/src/features/reports/components/LiquidityCsvReview.tsx` and `apps/web/src/features/reports/components/LiquidityCsvApplicationPreview.tsx`; display source date/account, controls/availability, USD values, category dropdowns and basic located findings without fabricated zeros.
- [X] T050 [US1] Update `apps/web/src/features/reports/hooks/useLiquidityStatements.ts`, `apps/web/src/features/reports/components/LiquiditySourceAccountManager.tsx` and `apps/web/src/features/reports/components/ConsolidatedHoldingsRow.tsx` to invalidate holdings/totals/account freshness/uploads/history after apply and preserve source details and rollups across reload.
- [X] T051 [US1] Update `apps/api/src/modules/liquidity-sources/liquidity-source-history.ts`, `apps/api/src/modules/market-data/liquidity-valuation.repository.ts` and `apps/api/src/modules/reports/reports.export.ts` for neutral sources while retaining old CSV_FALLBACK labels, exact history and safe spreadsheet exports; test both generations in `apps/api/tests/liquidity-csv-history.integration.test.ts`.
- [X] T052 [US1] Run all three golden and actual-browser/monthly-sequence suites; record synthetic totals, rows, history ordering, reload results and gate outcomes in `specs/032-statement-adapter-normalization/evidence/us1.md` without production activation.

**Checkpoint / local MVP**: All three formats work through the browser. This local demonstration does not bypass the remaining selection, compatibility, security or resource gates.

## Phase 4: US2 — Add a new recurring export pattern (P1)

**Goal**: A normal new layout needs one adapter, registration and fixtures. Unknown or ambiguous layouts cannot silently publish.

**Independent test**: Register a fourth synthetic pattern with no normalization/reconciliation/application/report edits; run conformance and monthly replacement. Unknown XLSX stays NEEDS_ADAPTER; one-off CSV mapping remains import-bound.

### Tests first

- [X] T053 [P] [US2] Implement `apps/api/tests/liquidity-statements/adapter-conformance/run-conformance.ts` and `apps/api/tests/liquidity-statements/adapter-conformance/all-adapters.test.ts` with shared positive/negative/determinism/row-accounting/exact-field/provenance/completeness/monthly tests and independently authored goldens for every adapter.
- [X] T054 [P] [US2] Add `apps/api/tests/liquidity-statements/detection.contract.test.ts` for unsupported, competing match, custodian mismatch, duplicate semantic headers, extra/reordered columns, unknown/overlapping regions and structurally invalid hints.
- [X] T055 [P] [US2] Add `apps/api/tests/liquidity-statements/adapter-versioning.test.ts` for independent family versions, unaffected unrelated recipes, unavailable-version rejection and forbidden adapter database/network/report imports.

### Implementation

- [X] T056 [US2] Complete drift/unsupported outcomes in `apps/api/src/modules/liquidity-statements/adapters/detect.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.errors.ts`; preserve bounded structural explanations and dispositions and return NEEDS_ADAPTER for unsupported/ambiguous XLSX rather than partial success or CSV mapping.
- [X] T057 [US2] Adapt `apps/api/src/modules/liquidity-statements/csv-mapping.service.ts` and `apps/web/src/features/reports/components/LiquidityCsvMapping.tsx` to typed evidence and explicit new runs; retain safe import-bound declarative mappings and completeness/financial checks without reusable templates or executable expressions.
- [X] T058 [US2] Add `apps/api/tests/liquidity-statements/adapter-conformance/synthetic-fourth.adapter.ts`, `apps/api/tests/liquidity-statements/adapter-conformance/test-registry.ts`, `apps/api/tests/liquidity-statements/fixtures/synthetic-fourth/holdings.csv` and `apps/api/tests/liquidity-statements/fixtures/synthetic-fourth/expected.json`; prove extension through the ordinary registry/shared pipeline without shipping a fictional production custodian.
- [X] T059 [US2] Add clear unsupported/ambiguous format guidance in `apps/web/src/features/reports/components/LiquidityCsvDialog.tsx` with tests in `apps/web/src/features/reports/components/LiquidityCsvUploadDialog.test.tsx`; distinguish adapter development, permitted CSV mapping and transient failure without promising arbitrary XLSX support.
- [X] T060 [US2] Verify the fourth-adapter change boundary and all-family conformance; update actual commands/sample handoff/versioning/layout limits in `specs/032-statement-adapter-normalization/adapter-onboarding.md` and record proof in `specs/032-statement-adapter-normalization/evidence/us2.md`.

**Checkpoint**: Extensibility is demonstrated by a new executable adapter, not only an interface.

## Phase 5: US3 — Understand missing data and reconciliation (P1)

**Goal**: Distinguish optional omissions, control scope, estimates and genuine correctable mismatches.

**Independent test**: Review a synthetic draft containing value-only cash, incomplete basis, non-cash price one, partial controls and a real mismatch. Save a valid correction while preserving original evidence, resolving only compatible effective blockers and keeping remaining findings visible.

### Tests first

- [X] T061 [P] [US3] Extend `apps/api/tests/liquidity-statements/review.contract.test.ts` for expected/actual/difference/location, original versus effective controls, reasons, category recalculation, warning hashes and denial of clear-total/tolerance bypasses.
- [X] T062 [P] [US3] Extend `apps/web/src/features/reports/components/LiquidityCsvReview.test.tsx` for USD/unknown display, source versus canonical comparisons, material warnings, finding navigation and blocker visibility/focus after Save review.
- [X] T063 [P] [US3] Add `apps/web/src/features/reports/components/LiquidityStatementEvidence.test.tsx` for CSV lines versus XLSX sheet/A1 evidence, page boundaries, masked metadata and account totals independent of loaded pages.

### Implementation

- [X] T064 [US3] Integrate reasoned overlays, normalization, acknowledgment invalidation and located findings in `apps/api/src/modules/liquidity-statements/csv-review.service.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.zod.ts`; persist structurally valid reviews with unresolved findings and preserve original comparisons/actor/reason rather than a generic save failure.
- [X] T065 [US3] Extend `apps/api/src/modules/liquidity-statements/csv-application-preview.service.ts` for original/effective controls and separate known/unknown/estimated coverage; bind effective values/control hashes, acknowledgments, recipe/run and review into preview identity.
- [X] T066 [US3] Add `apps/web/src/features/reports/components/LiquidityStatementFindings.tsx` and integrate `apps/web/src/features/reports/components/LiquidityCsvReview.tsx` with a persistent severity/account/field/location/expected/actual/difference/action summary and keyboard-accessible navigation.
- [X] T067 [US3] Complete `apps/web/src/features/reports/components/LiquidityCsvReview.tsx` and `apps/web/src/features/reports/components/LiquidityCsvApplicationPreview.tsx` coverage/correction UI; distinguish source and normalized subtotals, keep optional omissions quiet, show estimates/cache warnings and preserve visible unresolved findings after save without unrelated scroll-to-top behavior.
- [X] T068 [US3] Implement `apps/web/src/features/reports/components/LiquidityStatementEvidence.tsx` and paging in `apps/web/src/features/reports/api/liquidityStatementsClient.ts`; resolve cross-page findings, preserve original precision/locations and avoid raw unknown metadata or page-derived portfolio totals.
- [X] T069 [US3] Add/run `apps/web/e2e/liquidity-statement-review.spec.ts` for partial controls, optional omissions, real mismatches and corrected fresh previews, including genuine negative Liquidity gain; record results in `specs/032-statement-adapter-normalization/evidence/us3.md`.

**Checkpoint**: Review explains what must change without fabricating values or suppressing genuine discrepancies.

## Phase 6: US5 — Select complete accounts from a workbook (P1)

**Goal**: Detect all supported candidates, explicitly select/exclude accounts, and atomically publish selected complete snapshots.

**Independent test**: A workbook contains accounts A/B, overview and notes; apply A/exclude B, reprocess through the shared API, then apply B. A's prior approval survives; no account is implicitly emptied; unknown sections that could belong to A block unsafe publication.

### Tests first

- [X] T070 [P] [US5] Add `apps/api/tests/liquidity-statements/fixtures/morgan-stanley/multi-account.fixture.ts` and `apps/api/tests/liquidity-statements/account-sections.test.ts` for hidden sheets/rows, overview/detail overlap, split accounts, conflicting dates/currencies and unknown sections affecting completeness.
- [X] T071 [P] [US5] Add `apps/api/tests/liquidity-statements/account-selection.integration.test.ts` for every-candidate disposition, nonempty selection, unique scoped bindings, account/global blockers, empty confirmation, stale selection/version/hash, unchanged exclusions and rollback on audit/outbox/apply failure.
- [X] T072 [P] [US5] Add `apps/web/src/features/reports/components/LiquidityStatementAccountSelection.test.tsx` for account grouping and required sections, exclusion reasons, reliable full-ID prebinding, manual masked/last-four confirmation and no hidden-sheet auto-selection.

### Implementation

- [X] T073 [US5] Implement `apps/api/src/modules/liquidity-statements/adapters/account-sections.ts` and wire declared boundaries from `apps/api/src/modules/liquidity-statements/adapters/morgan-stanley/holdings-xlsx.ts`; combine only proven disjoint sections, account for every sheet and prohibit exclusions hiding missing or overlapping selected-account holdings.
- [X] T074 [US5] Implement selected/excluded decisions in `apps/api/src/modules/liquidity-statements/csv-review.service.ts`, `apps/api/src/modules/liquidity-statements/liquidity-statement.repository.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.zod.ts`; require every candidate exactly once, preserve legacy omitted-exclusion behavior, enforce masked/full-ID rules and retain reasons in review history.
- [X] T075 [US5] Update `apps/api/src/modules/liquidity-statements/csv-application-preview.service.ts` for selected-account deltas and excluded summaries; hash decisions, completeness, bindings, warnings, order and current account versions and distinguish independent account issues from global/shared-section blockers.
- [X] T076 [US5] Update `apps/api/src/modules/liquidity-statements/csv-application.service.ts` for atomic selected-account locks/publication, unique targets, fresh preview validation and retained-source/digest replay checks; excluded accounts receive no snapshots, empty holdings, pointers or valuation writes.
- [X] T077 [US5] Implement `apps/web/src/features/reports/components/LiquidityStatementAccountSelection.tsx` and integrate `apps/web/src/features/reports/components/LiquidityCsvReview.tsx` and `apps/web/src/features/reports/components/LiquidityCsvApplicationPreview.tsx`; show masks, sheets, completeness, decisions/reasons, binding confirmation and explicit empty-account acknowledgments.
- [X] T078 [US5] Add `apps/web/e2e/liquidity-statement-accounts.spec.ts` for A-only apply then shared-API reprocess/B apply, preserved earlier applications, stale changed selections and concurrent account-update rejection.
- [X] T079 [US5] Run section, scoped authorization, rollback, replacement and browser selection suites against the local DB; record selected/excluded invariants and results in `specs/032-statement-adapter-normalization/evidence/us5.md`.

**Checkpoint**: Complete publication scope is explicit; a formerly excluded account uses a new reviewed run against the same original.

## Phase 7: US4 — Preserve earlier imports and corrections (P2)

**Goal**: Old drafts/approvals remain readable and explicit corrections preserve history and duplicate-source identity.

**Independent test**: Upgrade synthetic 031 state, review an old draft, reopen an applied duplicate, apply a changed-version correction and abandon another correction. Hashes/approvals remain intact, revisions increase and identical uploads still reopen the retained source.

### Tests first

- [X] T080 [P] [US4] Extend `apps/api/tests/liquidity-statements/repository-compatibility.test.ts` and `apps/api/tests/liquidity-statements/migration.integration.test.ts` for legacy adapter IDs/schema-2, safe detail/download, old operation identities, immutable success, active-review backfill and CSV/STATEMENT reads with parsing disabled.
- [X] T081 [P] [US4] Extend `apps/api/tests/liquidity-statements/reprocess.integration.test.ts` and `apps/api/tests/liquidity-statements/apply.integration.test.ts` for corrections/former exclusions, recipe/row-order-only no-op publication preserving multiplicity, identical/altered idempotency payloads, cancel/reupload races and old/active review isolation.
- [X] T082 [P] [US4] Extend `apps/web/src/features/reports/components/LiquidityCsvJourney.test.tsx` for explicit recipe reprocess, prior approval display, safe abandonment, stale versions, active-lease refusal and notice that old edits are historical rather than copied.

### Implementation

- [X] T083 [US4] Complete legacy projection in `apps/api/src/modules/liquidity-statements/statement-draft.compat.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.repository.ts`; mark missing conventions unknown, avoid monetary recomputation, retain authoritative stored hashes, sanitize identifiers and expose prior approvals independently of workflow state.
- [X] T084 [US4] Complete old/new publication compatibility in `apps/api/src/modules/liquidity-statements/csv-application-preview.service.ts` and `apps/api/src/modules/liquidity-statements/csv-application.service.ts`; preserve exact prior idempotent results, require fresh authorization for changed content and avoid metadata-only duplicate snapshots without suppressing genuine corrections.
- [X] T085 [US4] Complete recipe-upgrade/applied-source responses in `apps/api/src/modules/liquidity-statements/liquidity-statement.service.ts` and `apps/api/src/modules/liquidity-statements/liquidity-statement.handler.ts`; advertise applicable versions without auto-reparse, separate active/prior runs and distinguish retry, new draft and correction abandonment.
- [X] T086 [US4] Add reprocess/abandon actions in `apps/web/src/features/reports/api/liquidityStatementsClient.ts` and `apps/web/src/features/reports/hooks/useLiquidityStatements.ts`; send versions/reasons, refresh active/history views and never treat parse completion as publication.
- [X] T087 [US4] Add explicit correction/new-draft and provenance/history UI in `apps/web/src/features/reports/components/LiquidityCsvDialog.tsx` and `apps/web/src/features/reports/components/LiquidityCsvReview.tsx`; explain preserved approval/non-copied edits and restore the prior applied view after abandonment.
- [X] T088 [US4] Add `apps/web/e2e/liquidity-statement-history.spec.ts` for upgrade, duplicate, correction and abandonment; compare source identity, exact totals, revision/history before/after and unchanged financial publication for metadata/row-order-only changes.
- [X] T089 [US4] Run fresh/upgrade DB and history browser scenarios including approved XLSX reads when ingestion is disabled; record unchanged source/canonical/application hashes, authorized correction deltas and rollback limits in `specs/032-statement-adapter-normalization/evidence/us4.md`.

**Checkpoint**: Parser improvements never rewrite approval history, and abandoned corrections cannot release accepted-source uniqueness.

## Phase 8: Cross-cutting verification and handoff

**Purpose**: Finish measured security, capacity, recovery and operational evidence. These gates verify controls built earlier, not postpone their implementation.

- [X] T090 [P] Expand `apps/api/tests/liquidity-statements/security.integration.test.ts`, `apps/api/tests/liquidity-statements/auth.contract.test.ts` and `apps/api/tests/abuse-protection/route-policy-coverage.contract.test.ts` for new routes/formats: Admin/entity/run scope, capability/CSRF/rate policy, cross-account denial, inert formulas/exports, no outbound parsing and identifier/log canaries.
- [X] T091 [P] Complete every configured-limit/hostile-input case in `apps/api/tests/liquidity-statements/resource-bounds.integration.test.ts` and `apps/api/tests/liquidity-statements/worker.integration.test.ts`; prove actual termination, bounded output/persistence, no partial publication, fenced recovery and no stable-invalid retry loops.
- [X] T092 After T091, add/run `apps/api/tests/liquidity-statements/statement-benchmark.test.ts`; record sample/run counts, deployment-equivalent CPU/memory, upload-capability latency, ordinary <=2,000-position p95 (<5 seconds), hard-limit total RSS including external buffers/copies, DB duration and concurrent-request responsiveness in `specs/032-statement-adapter-normalization/evidence/performance.md`; lower limits or keep XLSX disabled on failure.
- [X] T093 [P] Extend `apps/api/src/modules/liquidity-statements/csv-observability.ts` and `apps/api/tests/liquidity-statements/observability.test.ts` for safe low-cardinality reader/adapter/version/outcome/resource metrics and correlation IDs; verify durable reprocess/selection/correction/download/cancel/apply audit without private values or filenames in telemetry.
- [X] T094 [P] Extend `apps/api/tests/liquidity-statements/recovery.integration.test.ts` for isolated synthetic checkpoint/restore of both originals, typed evidence, selections, pointers, approvals/history and authorized reports; record measured local integrity/timing and separately unverified production RPO/RTO/PITR obligations in `specs/032-statement-adapter-normalization/evidence/recovery.md` without production restore or destructive down migrations.
- [X] T095 [P] Update `docs/architecture/10-system-architecture.md` and `docs/deployment/liquidity-csv-runbook.md` with ZIP/XML data flow/inventory, no new provider, parser containment, safe troubleshooting/reprocess, compatibility-capable rollback, flags, inherited retention and incident/recovery procedures.
- [X] T096 After T092–T095, update `specs/032-statement-adapter-normalization/quickstart.md`, `specs/032-statement-adapter-normalization/adapter-onboarding.md` and `docs/deployment/aws-liquidity-production-readiness.md` with verified commands/layouts/limits and two-generation rollout; retain explicit identity/MFA, retention, legal, backup and exception obligations rather than claiming this feature resolves them.
- [X] T097 Run API/web builds/type checks, changed unit/contract suites, mandatory real-DB migration/integration/recovery tests, all browser scenarios and repository dependency/secret/security/route gates from `specs/032-statement-adapter-normalization/quickstart.md`; record commands/environment/passed/failed/skipped totals in `specs/032-statement-adapter-normalization/evidence/verification.md`.
- [X] T098 Privately verify the three authorized original examples through local upload/review only, without applying real holdings merely for parser testing; record structure-only observations in `specs/032-statement-adapter-normalization/evidence/sample-review.md`, keep private filenames/values/screenshots out of Git and request samples only if unavailable.
- [X] T099 Audit every FR/SC and conformance boundary against `specs/032-statement-adapter-normalization/spec.md` and `specs/032-statement-adapter-normalization/evidence/verification.md`; confirm exactly-once row accounting, fourth-adapter independence, no Plaid, safe pricing defaults, no private fixtures and no blocking defects hidden by skipped or weakened tests.
- [X] T100 Complete `specs/032-statement-adapter-normalization/evidence/verification.md` with local acceptance, supported layouts/limits, migration/rollback constraints, scoped exceptions if any and remaining release prerequisites; check diff hygiene and leave production untouched until separately requested from main.

## Dependencies and execution order

### Phase graph

```text
Setup (T001-T005)
  -> Shared foundations (T006-T033)
     -> US1 supported formats / local MVP (T034-T052)
        -> US2 extensibility (T053-T060)
        -> US3 review clarity (T061-T069)
        -> US5 account selection (T070-T079)
           -> US4 full correction/history acceptance (T080-T089)
All stories -> Cross-cutting verification (T090-T100)
```

US4 characterization may start earlier, but its full formerly-excluded-account acceptance depends on US5. US5 does not wait for the US4 UI: its independent test uses the foundational reprocess API. US3/US5 both build on US1, but shared review/preview edits must be serialized or deliberately integrated. Whole-story branches are not automatically conflict-free.

### Foundation ordering

- T006–T009 are independent test-writing lanes after setup. T010 precedes dependent schemas/readers/services; T011 precedes DB behavior in T012.
- After T010/T013, T014/T017/T018 can be authored independently. T014 precedes T015; T017 precedes T019; T015/T018/T019 precede T020. T016 is the CSV reader lane.
- T021 uses typed document contracts and synthetic documents before production adapters exist. T022 precedes T023/T024; T009 precedes T025.
- T026 needs readers/detection/financial rules/bounds. T027 additionally needs repository and parent-side identity support. T008 must detect ineffective timeout/fencing and pass before T033.
- T029 precedes T030/T031, using T012/T027 run/review primitives. T032 follows types, repository and privacy; serialize its shared route/repository edits.
- T033 closes the shared foundation gate. No story is accepted while supporting safety/migration tests fail.

### Within stories

- Tests and independent expected results precede implementation, then services, API/UI, integration and recorded checkpoint.
- US1 T040/T041/T042 run independently after their fixtures; T043 joins them. T044–T046 must agree on kind/recipe/storage. T047/T051 protect downstream reads before accepting new STATEMENT approvals.
- US2 proves detector/version/onboarding boundaries and uses the same shared financial pipeline. No custodian-specific financial/report forks.
- US3 exposes shared financial controls through review; it does not introduce another normalizer.
- US5 review decisions precede preview hashing, which precedes atomic apply. T078 follows T073–T077.
- US4 T088 follows T083–T087 and the completed US5 selection path.
- T090/T091/T093/T094/T095 can proceed independently once their story dependencies are ready. T092 follows resource tests; T096–T100 consolidate results.
- Required security/recovery/compatibility/capacity evidence gates activation. No task authorizes deployment.

## Parallel execution examples

These are implementation scheduling examples, not instructions to spawn agents during task generation.

| Scope | Independent tasks after prerequisites | Join |
|---|---|---|
| Setup | T002 fixture tools; T003 dependency pins; T004 DB guard | T005 browser harness |
| Foundation | T006 schema; T007 migration; T008 worker; T009 privacy tests | Contract/persistence implementation |
| US1 | T034/T035/T036 format fixtures, T037 transport, T038 reports, T039 browser tests; then T040/T041/T042 separate adapter modules | T043 registration, T052 acceptance |
| US2 | T053 harness; T054 detection; T055 version/boundary tests | T056–T058 integration, T060 proof |
| US3 | T061 API review; T062 UI review; T063 evidence tests | T064–T068 shared-file implementation |
| US5 | T070 sections; T071 selection API; T072 selection UI tests | T073–T077 implementation, T078 journey |
| US4 | T080 legacy; T081 lifecycle; T082 UI tests | T083–T087 implementation, T088 journey |
| Final gates | T090 security; T091 bounds; T093 telemetry; T094 restore; T095 runbooks | T096–T100 handoff |

Never run tasks concurrently when they share files, migration numbering, mutable test DB state, fixture output, or unfinished prerequisites.

## Requirement coverage

| Requirement | Primary tasks |
|---|---|
| FR-001 file kinds/transport | T013, T016–T020, T037, T044–T045, T048 |
| FR-002 layered owners | T010, T016, T019–T021, T026–T027, T043 |
| FR-003 structural detection | T021, T054, T056 |
| FR-004 adapter declarations | T034–T036, T040–T043, T053 |
| FR-005 row/sheet disposition | T021, T034–T036, T053–T054, T070, T073 |
| FR-006 common schema/evidence | T006, T010, T012, T025, T032, T040–T043 |
| FR-007 exact numbers/units | T014–T015, T018–T020, T022–T024, T047 |
| FR-008 precedence | T022–T024, T036, T042, T061, T064 |
| FR-009 classification | T023, T034–T036, T040–T042, T047, T067 |
| FR-010 cash/quantity | T022–T023, T034–T036, T069 |
| FR-011 scoped controls | T022, T024, T036, T061, T064–T067 |
| FR-012 scoped identity | T009, T025, T034–T036, T071–T074 |
| FR-013 rich optional fields | T010, T022–T023, T034–T036, T040–T042, T049 |
| FR-014 compatible rollups | T038, T047, T050–T052 |
| FR-015 snapshots/idempotency | T007, T011–T012, T029–T030, T038, T046, T071, T076, T080–T089 |
| FR-016 recipes/reprocess | T012, T027, T029–T031, T055, T081, T084–T088 |
| FR-017 actionable findings | T049, T056, T059, T061–T069 |
| FR-018 guide/harness | T002, T053–T055, T058, T060, T096 |
| FR-019 additive compatibility | T007, T010–T012, T028, T044, T051, T080–T089 |
| FR-020 bounds/cancellation | T008, T013–T020, T026–T027, T091–T092 |
| FR-021 actual browser parity | T005, T037–T039, T048–T052, T069, T078, T088 |
| FR-022 account selection | T070–T079 |
| FR-023 Morgan basis/control | T036, T042, T061, T064–T065 |
| FR-024 assisted onboarding/mapper | T043, T057–T060, T096 |
| SC-001 three golden suites | T034–T036, T052–T053 |
| SC-002 fourth adapter | T055, T058, T060 |
| SC-003 exactly-once holdings | T021, T053–T054, T070, T073, T079 |
| SC-004 replacement/persistence | T038–T039, T046–T052, T078–T079, T081, T088 |
| SC-005 safe optional omissions | T022–T024, T061–T069 |
| SC-006 protected history | T007, T029–T030, T080–T089 |
| SC-007 measured performance | T091–T092 |
| SC-008 hostile/ambiguous safety | T008–T009, T017–T021, T054–T056, T090–T091 |

## Implementation strategy

1. Complete setup and shared foundations with existing compatibility and new ingestion default-disabled.
2. Deliver US1 as the first local MVP: three pattern families through the browser, exact totals, replacement and persistent rollups. This is not a production-readiness claim.
3. Prove extension via US2, then finish review clarity and account selection via US3/US5 while retaining initial-format regressions.
4. Complete US4 correction/history acceptance, including cancellation identity and no-op replay.
5. Run all cross-cutting gates with a real local DB/browser. Record failures/skips and inherited production obligations honestly.
6. Hand off evidence and onboarding instructions. Commit/push/merge/deployment require their own requested scope.

## Task totals

| Scope | Tasks |
|---|---:|
| Setup | 5 |
| Shared foundations | 28 |
| US1 (P1) | 19 |
| US2 (P1) | 8 |
| US3 (P1) | 9 |
| US5 (P1) | 10 |
| US4 (P2) | 10 |
| Cross-cutting verification | 11 |
| **Total** | **100** |
