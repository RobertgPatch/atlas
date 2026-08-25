# Tasks: First-Pass Obsolete Code Pruning

**Input**: Design documents from `/specs/024-prune-obsolete-code/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/pruning-safety.md](./contracts/pruning-safety.md), [quickstart.md](./quickstart.md)

**Tests**: Required. The specification mandates focused provider coverage, dual-variant route tests, full API/web suites, both production builds, guard scripts, dependency validation, and repository scans.

**Organization**: Tasks are grouped by user story. This branch contains only the conservative first pass; newly exposed high-risk or ambiguous candidates are recorded for a later numbered spec and branch.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and does not depend on an incomplete task.
- **[Story]**: Maps the task to User Story 1, 2, or 3 from [spec.md](./spec.md).
- Every task names the exact file or directory it changes or the evidence file where command results are recorded.

## Phase 1: Setup (Shared Evidence)

**Purpose**: Establish the auditable baseline and manifest used by every deletion decision.

- [X] T001 Create the candidate, protected-surface, deletion-group, and verification tables from [data-model.md](./data-model.md) in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T002 Record the branch/base commit, tracked-file count, candidate byte totals, workspace list, installed top-level packages, and current Git status in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T003 Run the baseline API build/tests, web lint/typecheck/tests/color audit, import guards, and both `VITE_MAGIC_PATTERN_DESIGNS` production builds from [quickstart.md](./quickstart.md), then record every result and pre-existing failure in `specs/024-prune-obsolete-code/pruning-manifest.md`

---

## Phase 2: Foundational Classification (Blocking Prerequisites)

**Purpose**: Prove the protection and evidence boundaries before any source or documentation deletion.

**CRITICAL**: No user-story deletion task may begin until this phase is complete.

- [X] T004 Populate protected-surface records for both Magic Patterns graphs, `stub | aws_bda`, migrations, authoritative fixtures, operational scripts, seeds, MFA, and non-Azure historical specs in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T005 Classify every planned Azure, artifact, workspace, package, web-root, API-leaf, type-export, sole-purpose test, and documentation candidate with inbound references, entry-point checks, flag reachability, dynamic checks, replacement, and decision in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T006 Record the explicitly deferred 59-file provisional web closure and the later-branch boundary required by FR-016 in `specs/024-prune-obsolete-code/pruning-manifest.md`

**Checkpoint**: Every planned removal is marked `REMOVE` with complete evidence; every protected or uncertain surface is marked `RETAIN` or `DEFER`.

---

## Phase 3: User Story 1 - Retire Superseded Extraction Artifacts (Priority: P1) MVP

**Goal**: Remove obsolete Azure Document Intelligence planning material while proving Amazon BDA and the offline stub remain the only supported extractor paths.

**Independent Test**: Active code/config/dependency/operator paths contain no Azure provider integration; the provider selector exposes only `stub | aws_bda`; focused BDA/stub tests and the API build pass.

### Tests for User Story 1

- [X] T007 [P] [US1] Strengthen provider-selection assertions for exactly `stub` and `aws_bda` in `apps/api/tests/k1.bda-extractor.test.ts`

### Implementation for User Story 1

- [X] T008 [P] [US1] Delete the superseded seven-file Azure design package under `specs/008-azure-document-intelligence/`
- [X] T009 [P] [US1] Replace the obsolete provider example with provider-neutral managed-extraction wording in `specs/002-k1-ingestion/research.md`
- [X] T010 [P] [US1] Replace the Azure-specific manual-entry statement with external-extraction-neutral wording in `specs/016-k1-tracker/quickstart.md`
- [X] T011 [US1] Run the active-tree Azure reference scan from `specs/024-prune-obsolete-code/quickstart.md` and record the zero-result evidence for `retired-azure-spec` in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T012 [US1] Run focused BDA extractor/mapper/output/EventBridge/worker tests and `npm run build:api`, then mark the `retired-azure-spec` deletion group verified in `specs/024-prune-obsolete-code/pruning-manifest.md`

**Checkpoint**: User Story 1 is independently complete; Azure is absent from active integration surfaces and BDA/stub verification passes.

---

## Phase 4: User Story 2 - Preserve Both Design Variants (Priority: P1)

**Goal**: Establish executable protection for every route, redirect, shell, and page behavior required with the Magic Patterns flag false and true.

**Independent Test**: Focused route tests and separate false/true production builds pass for login, dashboard, entities/detail, investment tracker, partnership tracker, shared shell, Estate Map, compatibility redirects, and query/alias behavior.

### Tests for User Story 2

- [X] T013 [P] [US2] Add top-level authenticated route tests for false `/dashboard -> /liquidity`, true Magic dashboard rendering, and `/partnerships`, `/partnerships/:id`, and `/k1-tracker` compatibility redirects in `apps/web/src/App.test.tsx`
- [X] T014 [P] [US2] Extend compile-time environment coverage using isolated module imports for enabled and disabled `VITE_MAGIC_PATTERN_DESIGNS` values in `apps/web/src/config/featureFlags.test.ts`
- [X] T015 [P] [US2] Add the missing `magicPatternDesigns={false}` legacy-detail regression case in `apps/web/src/pages/EntityDetail.test.tsx`
- [X] T016 [P] [US2] Extend query-preservation coverage to include `partnership`, `area`, and `year` on the true redirect in `apps/web/src/pages/PartnershipTrackerPage.test.tsx`
- [X] T017 [P] [US2] Add legacy area alias and valid/invalid year query coverage for the enabled workspace in `apps/web/src/pages/InvestmentTrackerPage.test.tsx`
- [X] T018 [P] [US2] Add a page-level regression test for the current explicit Magic appearance exception in `apps/web/src/pages/EstateMapPage.test.tsx`
- [X] T019 [P] [US2] Extend Admin/User, legacy/Magic navigation, mobile menu, collapse, and sign-out coverage in `apps/web/src/components/shared/AppShell.test.tsx`

### Verification for User Story 2

- [X] T020 [US2] Run the focused tests from T013-T019 plus `LoginPage`, `EntitiesPage`, and Magic dashboard/workspace suites, then record results in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T021 [US2] Build `apps/web` separately with `VITE_MAGIC_PATTERN_DESIGNS=false` and `true`, record bundle sizes and results in `specs/024-prune-obsolete-code/pruning-manifest.md`, and confirm neither bundle grows from the T003 baseline
- [X] T022 [US2] Complete the desktop/mobile dual-variant smoke matrix from `specs/024-prune-obsolete-code/quickstart.md` and record route, role, redirect, query, loading, error, and empty-state evidence in `specs/024-prune-obsolete-code/pruning-manifest.md`

**Checkpoint**: User Story 2 is independently complete; both maintained UI graphs are protected before dead-code removal begins.

---

## Phase 5: User Story 3 - Remove High-Confidence Dead Weight (Priority: P2)

**Goal**: Remove the approved local artifacts, unused workspaces, stale package output/dependencies, unreachable web roots, and isolated API/type leaves without expanding into the deferred high-risk closure.

**Independent Test**: The manifest accounts for every deletion; npm clean-install/workspace checks, retained-behavior tests, API/web builds, both Magic builds, artifact scans, guards, lint, typecheck, color governance, and full suites pass without restoring removed content.

### Local/generated artifact group

- [X] T023 [P] [US3] Delete `new_k1.pdf`, `tmp/pdfs/`, `apps/api/tmp-live-k1-check.mjs`, `design-qa.md`, and `tic-registry.html`
- [X] T024 [P] [US3] Add exact recurrence rules for `/tmp/`, `/new_k1.pdf`, `/apps/api/tmp-live-k1-check.mjs`, `/design-qa.md`, and `/tic-registry.html` without ignoring test fixtures in `.gitignore`
- [X] T025 [US3] Run the tracked-artifact scan from `specs/024-prune-obsolete-code/quickstart.md`, confirm authoritative files under `apps/api/tests/fixtures/` remain tracked, and verify `local-generated-artifacts` in `specs/024-prune-obsolete-code/pruning-manifest.md`

### Workspace and package-hygiene group

- [X] T026 [P] [US3] Delete the empty, unreferenced workspace under `packages/utils/`
- [X] T027 [P] [US3] Delete the unconsumed component workspace under `packages/ui/` while preserving `apps/web/src/components/` and MUI/Emotion dependencies
- [X] T028 [P] [US3] Remove the unused `@ui` aliases from `apps/web/vite.config.ts` and `apps/web/tsconfig.app.json`
- [X] T029 [P] [US3] Retarget live shared-component and PDF guard guidance away from `packages/ui` in `scripts/ci/guard-k1-imports.mjs`, `scripts/ci/guard-partnerships-imports.mjs`, `docs/ui/40-screen-map.md`, and `docs/ui/46-component-catalog.md`
- [X] T030 [P] [US3] Delete stale `packages/types/src/k1-ingestion.js` and `packages/types/src/partnership-management.js` plus redundant `apps/api/.gitkeep`, `apps/api/src/.gitkeep`, `apps/api/src/modules/partnerships/.gitkeep`, `apps/web/.gitkeep`, `apps/web/src/features/.gitkeep`, `apps/web/src/features/partnerships/api/.gitkeep`, `apps/web/src/features/partnerships/components/.gitkeep`, `apps/web/src/features/partnerships/hooks/.gitkeep`, `apps/web/src/features/reports/components/.gitkeep`, `apps/web/src/features/reports/hooks/.gitkeep`, `apps/web/src/features/reports/utils/.gitkeep`, `docs/api/.gitkeep`, `docs/architecture/.gitkeep`, `docs/prd/.gitkeep`, `docs/schema/.gitkeep`, `docs/ui/.gitkeep`, `packages/types/.gitkeep`, and `packages/types/src/.gitkeep` while preserving the TypeScript sources and NodeNext `.js` specifiers
- [X] T031 [US3] Remove `pnpm-lock.yaml`, root `jsdom` from `package.json`, and `@types/react-router-dom` from `apps/web/package.json`, then regenerate `package-lock.json` with npm
- [X] T032 [US3] Run `npm ci` and `npm ls --workspaces --depth=0`, confirm only active workspaces remain, and verify `unused-workspaces` plus `stale-package-output` in `specs/024-prune-obsolete-code/pruning-manifest.md`

### Reviewed unreachable source group

- [X] T033 [P] [US3] Delete `apps/web/src/features/features/`, `apps/web/src/auth/mockAuthService.ts`, `apps/web/src/components/StatusBadge.tsx`, and `apps/web/src/features/estate-map/components/EstateMapSetupGuide.tsx`
- [X] T034 [P] [US3] Delete obsolete route roots `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/pages/K1TrackerPage.tsx`, `apps/web/src/pages/PartnershipDirectory.tsx`, and `apps/web/src/pages/PartnershipDetail.tsx`
- [X] T035 [P] [US3] Delete `apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternCapitalActivityTable.tsx`, `apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternInvestmentControls.tsx`, and `apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternPartnershipTrackerPageContent.tsx`, then remove its export from `apps/web/src/features/partnership-tracker/index.ts`
- [X] T036 [P] [US3] Delete `apps/api/src/modules/k1/storage/localPdfStore.ts` and `apps/api/src/modules/partnership-tracker/index.ts`, then remove `packages/types/src/auth-access.ts` and its export from `packages/types/src/index.ts`
- [X] T037 [US3] Re-run web/API import, export, sole-purpose test/documentation, script, Terraform, fixture, and feature-flag reachability scans after T033-T036 and record every newly exposed candidate as `RETAIN` or `DEFER` for the next numbered branch in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T038 [US3] Run `npm run build:api`, focused API tests `apps/api/tests/k1.bda-extractor.test.ts`, `apps/api/tests/k1.extraction-worker.unit.test.ts`, and `apps/api/tests/partnership-tracker.contract.test.ts`, web typecheck, and focused web tests `apps/web/src/App.test.tsx`, `apps/web/src/pages/LoginPage.test.tsx`, `apps/web/src/pages/EntitiesPage.test.tsx`, `apps/web/src/pages/EntityDetail.test.tsx`, `apps/web/src/pages/PartnershipTrackerPage.test.tsx`, `apps/web/src/pages/InvestmentTrackerPage.test.tsx`, `apps/web/src/pages/EstateMapPage.test.tsx`, `apps/web/src/pages/magic-patterns/MagicPatternDashboardPage.test.tsx`, `apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternInvestmentTrackerPageContent.test.tsx`, and `apps/web/src/components/shared/AppShell.test.tsx`, then verify `unreachable-web-roots` and `isolated-api-type-leaves` in `specs/024-prune-obsolete-code/pruning-manifest.md`

**Checkpoint**: User Story 3 is independently complete; only pre-approved first-pass candidates are deleted and the higher-risk closure remains deferred.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Prove all three stories coexist and close the first-pass branch with complete evidence.

- [X] T039 Run `npm run build:api` and `npm run test:api`, then record final API/BDA/stub results in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T040 Run web lint, typecheck, full tests, and color governance, then record final results in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T041 Build `apps/web` separately with `VITE_MAGIC_PATTERN_DESIGNS=false` and `true`, compare final bundle sizes with T003, and record results in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T042 Run both import guards, the active Azure scan, tracked-artifact scan, `npm ls --workspaces --depth=0`, `git diff --check`, `git diff --name-status -- apps/api/src/infra/db/migrations`, and `git diff --name-status -- ':(glob)apps/**/fixtures/**'`, then record the zero-violation migration/fixture preservation evidence in `specs/024-prune-obsolete-code/pruning-manifest.md`
- [X] T043 Finalize actual file/byte/dependency deltas, deletion-group statuses, complete verification evidence, and the next-branch deferred list in `specs/024-prune-obsolete-code/pruning-manifest.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: No dependency; T001-T003 run sequentially because they build one baseline manifest.
- **Phase 2 - Foundational**: Depends on Phase 1 and blocks all deletion tasks.
- **User Story 1 (Phase 3)**: Depends on Phase 2; independent of User Story 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2; independent of User Story 1.
- **User Story 3 (Phase 5)**: Depends on Phase 2 and completion of User Story 2's protection tests/matrix; it may proceed whether or not User Story 1 has merged.
- **Phase 6 - Polish**: Depends on all three user stories.

### User Story Dependency Graph

```text
Setup -> Foundational -> US1 -----------------> Polish
                    \-> US2 -> US3 ----------> Polish
```

### Within Each User Story

- **US1**: Add provider assertion -> remove Azure design/docs -> scan -> focused BDA/stub verification.
- **US2**: Add route/flag tests -> run focused suite -> build both variants -> complete route matrix.
- **US3**: Confirm US2 protection -> delete one group at a time -> run group checks -> classify exposed candidates -> focused retained-surface verification.
- A deletion group cannot be marked `VERIFIED` until every linked check passes.
- Any uncertainty found during US3 becomes `DEFER`; it does not create an unplanned deletion task on this branch.

### Parallel Opportunities

- T007-T010 touch independent API test/spec files and can run in parallel.
- T013-T019 are independent web regression tests and can run in parallel.
- T023 and T024 can run in parallel before T025.
- T026-T030 touch separate workspace/config/docs/type paths and can run in parallel before T031-T032.
- T033-T036 remove separately classified source groups and can run in parallel after US2 completes.
- T039 and T040 validate API and web independently but update the shared manifest sequentially before the final dual-build and repository checks.
- US1 and US2 may run in parallel after the foundational manifest is complete.

---

## Parallel Example: User Story 1

```text
Task T007: Strengthen extractor provider assertions in apps/api/tests/k1.bda-extractor.test.ts
Task T008: Delete specs/008-azure-document-intelligence/
Task T009: Update specs/002-k1-ingestion/research.md
Task T010: Update specs/016-k1-tracker/quickstart.md
```

## Parallel Example: User Story 2

```text
Task T013: Add App route gating and compatibility redirect tests
Task T014: Add isolated environment flag tests
Task T015: Add legacy entity-detail test
Task T016: Add partnership query-preservation test
Task T017: Add investment alias/year tests
Task T018: Add Estate Map exception test
Task T019: Extend AppShell variant/role interaction tests
```

## Parallel Example: User Story 3

```text
Task T026: Delete packages/utils/
Task T027: Delete packages/ui/
Task T028: Remove @ui resolver aliases
Task T029: Update active guard/documentation paths
Task T030: Remove stale source-adjacent JavaScript and redundant placeholders
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundational classification.
2. Add the provider-selection assertion.
3. Remove the obsolete Azure design package and generalize incidental prose.
4. Run the Azure scan and focused BDA/stub verification.
5. Stop and review the manifest before beginning UI or package deletions.

### Incremental Delivery

1. **Baseline**: T001-T006 create the evidence/protection foundation.
2. **MVP**: T007-T012 retire Azure guidance without changing runtime code.
3. **Protection increment**: T013-T022 make both UI variants independently verifiable.
4. **Pruning increment**: T023-T038 remove only approved first-pass dead weight group by group.
5. **Closure**: T039-T043 run the complete matrix and hand deferred candidates to the next numbered branch.

### Parallel Team Strategy

After Phase 2:

- Developer A may complete US1.
- Developer B may complete US2.
- US3 waits for US2, then artifact, workspace/package, web-root, and API/type deletion groups can be assigned in parallel.
- One integrator owns `pruning-manifest.md` updates to avoid evidence conflicts.

---

## Notes

- `[P]` tasks touch independent files or deletion groups; manifest-writing tasks are intentionally serialized.
- Tests protecting retained behavior are written before the deletion groups they guard.
- Do not remove migrations, authoritative fixtures, BDA/AWS assets, MFA surfaces, manual seeds, operational scripts, non-Azure historical specs, or any code reachable from either Magic Patterns value.
- Keep Emotion and optional Vitest coverage tooling; they remain valid peer/optional dependencies.
- Use npm and `package-lock.json` as the single package-manager authority.
- Commit after each verified deletion group so rollback stays localized.
- Stop the branch after T043; execute deferred higher-risk pruning through a new numbered spec and branch.
