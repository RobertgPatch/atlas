# Tasks: Prune Obsolete Code — Iteration 2

**Input**: Design documents from `specs/025-prune-obsolete-code-iteration-2/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/pruning-safety.md`, `quickstart.md`

**Tests**: Required. Each behavior change and deletion closure must be protected by focused tests before implementation or removal, followed by the full validation matrix.

**Organization**: Tasks are grouped by user story. Because every story is P1, the execution order follows technical dependencies: classify first (US1), reconnect MFA behind the runtime flag (US3), remove stale closures (US2), and then prove protected surfaces remain intact (US4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase because the tasks touch different files and have no unfinished dependency.
- **[US#]**: Maps the task to a user story from `spec.md`.
- Every implementation task names the exact file or directory it changes.

## Phase 1: Setup (Shared Evidence)

**Purpose**: Establish a reproducible baseline and the evidence structure used to authorize every deletion.

- [X] T001 Create the baseline, candidate, protected-surface, deletion, verification, deferred-item, and delta tables defined by `data-model.md` in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T002 Record branch `025-prune-obsolete-code-iteration-2`, baseline commit `8baaadda1eb483414f4f5e62c54d672e7dfba8a8`, tracked/source file counts, byte counts, workspace layout, and pre-existing working-tree changes in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T003 Run the baseline API build, focused provider/auth tests, and full API test suite from `specs/025-prune-obsolete-code-iteration-2/quickstart.md`, recording commands, results, and any accepted baseline failures in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T004 Run the baseline web lint, typecheck, test, color guard, and both `VITE_MAGIC_PATTERN_DESIGNS` build variants from `specs/025-prune-obsolete-code-iteration-2/quickstart.md`, recording results and bundle sizes in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T005 Run baseline workspace, dependency, Azure-provider, asset-reference, seed-reference, and operational-script scans from `specs/025-prune-obsolete-code-iteration-2/quickstart.md`, recording exact results in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

---

## Phase 2: Foundational Safety Controls

**Purpose**: Define deletion boundaries and verification ownership before changing production code.

**Critical**: Complete this phase before starting any user-story implementation.

- [X] T006 Add protected-surface records for both Magic UI variants, MFA login/admin flows, `stub` and `aws_bda` extraction, database migrations and test fixtures, Terraform/deployment assets, current partnership and K-1 routes, and operational scripts to `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T007 Add planned deletion groups for the 56-file boundary and map each group to focused tests, full-suite gates, reference scans, build variants, and rollback evidence in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

**Checkpoint**: The manifest can account for every protected surface and every planned deletion before source changes begin.

---

## Phase 3: User Story 1 — Reclassify Deferred Source Closures (Priority: P1) 🎯 MVP

**Goal**: Re-run reachability and repository-evidence analysis so every inherited deferred candidate has an explicit `REMOVE`, `RETAIN`, or `DEFER` disposition.

**Independent Test**: Starting from the recorded baseline, reproduce the TypeScript reachability graph and repository scans and confirm that all six inherited deferred groups, all 45 production-unreachable modules, and all 56 planned file deletions have evidence-backed classifications without modifying production behavior.

- [X] T008 [US1] Re-run the TypeScript production-entry reachability analysis from `specs/025-prune-obsolete-code-iteration-2/quickstart.md` and record all 45 production-unreachable modules plus inbound-edge evidence in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T009 [US1] Classify the legacy partnership presentation, CRUD, query, and sole-purpose test closure while documenting retained shared partnership clients, hooks, tables, and workspace surfaces in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T010 [US1] Classify the older K-1 web closure and partnership-tracker proxy closure while documenting the retained backend `/k1-tracker` contract, canonical K-1 components, Magic workspaces, and live aggregation paths in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T011 [US1] Classify stale report/review leaves, unreferenced assets, the MUI/Emotion dependency closure, obsolete seed scripts, broken root scripts, and related documentation references in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T012 [US1] Classify MFA enrollment/verification UI as `RETAIN_AND_RECONNECT`, Azure Document Intelligence as absent from active code/config/dependencies/tests/scripts/operator docs, and every remaining inherited deferred item as `REMOVE`, `RETAIN`, or `DEFER` in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

**Checkpoint**: Every candidate and inherited deferred item has evidence, a disposition, an owner, and a verification path. This classification-only phase is the MVP.

---

## Phase 4: User Story 3 — Toggle MFA Login with One Runtime Feature Flag (Priority: P1)

**Goal**: Make the existing MFA enrollment and verification login flow reachable only when the API runtime flag `MFA_LOGIN_ENABLED` is enabled, with password-only login preserved by default.

**Independent Test**: With no web rebuild, verify `MFA_LOGIN_ENABLED=false` and unset produce the current direct session, while `true` produces `MFA_ENROLL_REQUIRED` for unenrolled users and `MFA_REQUIRED` for enrolled users, creates no session cookie until successful MFA completion, and routes both Magic UI variants to their correct post-login destination.

### Tests for User Story 3

- [X] T013 [P] [US3] Extend `apps/api/tests/auth.login.test.ts` with initially failing cases for unset/false direct-session login, true unenrolled/enrolled MFA responses, absence of a session cookie before completion, and unchanged invalid-password and lockout behavior
- [X] T014 [P] [US3] Create `apps/api/tests/auth.mfa-enroll.test.ts` with characterization coverage for enrollment-token validation, valid and invalid TOTP confirmation, audit behavior, session creation only after success, token consumption, and the enabled/disabled flag boundary
- [X] T015 [P] [US3] Create `apps/api/tests/auth.mfa-verify.test.ts` with characterization coverage for challenge-token validation, valid and invalid TOTP codes, consumed-token replay behavior, audit behavior, and session creation only after success
- [X] T016 [P] [US3] Extend `apps/web/src/pages/LoginPage.test.tsx` with initially failing cases for the login response union, auth-flow token storage, `/mfa/setup` and `/mfa` navigation, direct-session login, and both Magic UI post-login destinations
- [X] T017 [P] [US3] Extend `apps/web/src/App.test.tsx` with initially failing cases proving `/mfa/setup` and `/mfa` are public pre-auth routes while the session store is unauthenticated
- [X] T018 [P] [US3] Create `apps/web/src/pages/MFAPage.test.tsx` with initially failing cases for TOTP verification, error handling, missing-token login redirect, flow-token cleanup, and `/dashboard` versus `/liquidity` completion routing
- [X] T019 [P] [US3] Create `apps/web/src/pages/MFASetupPage.test.tsx` with initially failing cases for enrollment QR/manual secret rendering, valid and invalid TOTP confirmation, missing-token redirect, flow-token cleanup, and `/dashboard` versus `/liquidity` completion routing

### Implementation for User Story 3

- [X] T020 [P] [US3] Parse `MFA_LOGIN_ENABLED` with a false default in `apps/api/src/config.ts` and document the runtime variable in `apps/api/.env.example`
- [X] T021 [P] [US3] Add a false-defaulted `mfa_login_enabled` variable and shared API environment wiring in `infra/aws/terraform/variables.tf` and `infra/aws/terraform/main.tf`, add examples to `infra/aws/terraform/staging.tfvars.example` and `infra/aws/terraform/production.tfvars.example`, and document API-restart-only toggling in `docs/deployment/aws-liquidity-production-readiness.md`
- [X] T022 [US3] Restore the existing MFA enrollment/challenge branching behind `config.mfaLoginEnabled` while preserving the false-path direct session, lockout behavior, and cookie boundary in `apps/api/src/modules/auth/login.handler.ts`
- [X] T023 [US3] Model direct-session, `MFA_ENROLL_REQUIRED`, and `MFA_REQUIRED` login results in `apps/web/src/auth/authClient.ts` and handle their token storage and navigation in `apps/web/src/pages/LoginPage.tsx`
- [X] T024 [US3] Register the existing MFA setup and verification pages as public pre-auth routes with safe missing-token redirects in `apps/web/src/App.tsx`
- [X] T025 [US3] Preserve the selected Magic UI post-login destination and clear transient auth-flow state after successful completion in `apps/web/src/pages/MFAPage.tsx` and `apps/web/src/pages/MFASetupPage.tsx`
- [X] T026 [US3] Run all focused API/web MFA tests with `MFA_LOGIN_ENABLED` unset, false, and true plus Terraform validation, recording cookie timing, route outcomes, flag ownership, and results in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

**Checkpoint**: MFA login can be toggled with one API runtime flag, defaults off, requires no web rebuild, and all existing MFA source files are proven reachable.

---

## Phase 5: User Story 2 — Remove the Next Proven Stale Set (Priority: P1)

**Goal**: Remove the approved 56-file stale closure, four orphaned packages, one broken script, and stale documentation references without restoring any removed implementation to pass validation.

**Independent Test**: Compare the final tree to the deletion manifest, verify all approved paths are absent and all retained paths remain, then pass the focused tests, full API/web gates, reference scans, dependency installation, and both Magic UI builds.

### Pre-deletion Test Retargeting for User Story 2

- [X] T027 [P] [US2] Retarget `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerSignoff.test.tsx` from the stale proxy to the canonical `apps/web/src/features/k1-tracker/components/SignOffPanel.tsx` and prove the focused test passes before proxy deletion
- [X] T028 [P] [US2] Remove only the stale summary-card imports and describe block from `apps/web/src/features/reports/components/ConsolidatedHoldingsReport.test.tsx` while retaining coverage for `apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts`

### Legacy Partnership Closure

- [X] T029 [P] [US2] Delete `apps/web/src/features/partnerships/api/fmvClient.ts`, `apps/web/src/features/partnerships/hooks/useFmvMutations.ts`, `apps/web/src/features/partnerships/hooks/usePartnershipExport.ts`, `apps/web/src/features/partnerships/hooks/usePartnershipMutations.ts`, and `apps/web/src/features/partnerships/hooks/usePartnershipQueries.ts`
- [X] T030 [P] [US2] Delete the stale partnership components `ActivityDetailPreview.tsx`, `AddAssetDialog.tsx`, `AddCapitalActivityDrawer.tsx`, `AddCommitmentDrawer.tsx`, `AddPartnershipDialog.tsx`, `AssetDetailDrawer.tsx`, `AssetsSection.tsx`, `AssetValuationHistory.tsx`, `CapitalActivitySection.tsx`, `CapitalOverviewSection.tsx`, `EditPartnershipDialog.tsx`, `ExpectedDistributionSection.tsx`, `FmvSnapshotsSection.tsx`, `K1HistorySection.tsx`, `PartnershipFilters.tsx`, `PartnershipKpiStrip.tsx`, `RecordAssetFmvDialog.tsx`, and `RecordFmvDialog.tsx` from `apps/web/src/features/partnerships/components/`
- [X] T031 [P] [US2] Delete `apps/web/src/features/partnerships/components/AddAssetDialog.test.tsx`, `AssetDetailDrawer.test.tsx`, `AssetsSection.connected-placeholder.test.tsx`, `AssetsSection.record-fmv.test.tsx`, `AssetsSection.test.tsx`, and `RecordAssetFmvDialog.test.tsx`
- [X] T032 [US2] Run the partnership-focused tests and zero-reference scans, verify retained `entitiesClient.ts`, `assetsClient.ts`, `partnershipsClient.ts`, directory/report tables, and live workspace paths, and record the group result in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

### Older K-1 and Partnership-Tracker Proxy Closures

- [X] T033 [US2] Delete `apps/web/src/features/k1-tracker/api/k1TrackerClient.ts`, `apps/web/src/features/k1-tracker/components/ImportWorkbookDialog.tsx`, `apps/web/src/features/k1-tracker/components/K1InputsPanel.tsx`, `apps/web/src/features/k1-tracker/components/PartnershipPicker.tsx`, `apps/web/src/features/k1-tracker/hooks/useK1Tracker.ts`, and `apps/web/src/features/k1-tracker/__tests__/ImportWorkbookDialog.test.tsx`
- [X] T034 [US2] Run the canonical K-1 dashboard/upload/review tests and backend `/k1-tracker` API/import tests, verify those retained paths have production entries, and record the closure result in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T035 [US2] Delete `JournalEntryPanel.tsx`, `K1InputsPanel.tsx`, `LiabilitiesPanel.tsx`, `OutsideBasisPanel.tsx`, `ReconciliationPanel.tsx`, `SignOffPanel.tsx`, `UnderlyingAssetsPlaceholder.tsx`, `YearStatusPanel.tsx`, and `YearSummaryCards.tsx` from `apps/web/src/features/partnership-tracker/components/`
- [X] T036 [US2] Run the retargeted sign-off and partnership-tracker focused tests, verify `AddYearDialog.tsx`, `CompareYearsDrawer.tsx`, and `YearRail.tsx` remain reachable, and record the proxy-group result in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

### Other Leaves, Seeds, Scripts, and Documentation

- [X] T037 [P] [US2] Delete `apps/web/src/features/reports/components/ConsolidatedHoldingsFilters.tsx`, `apps/web/src/features/reports/components/ConsolidatedHoldingsSummaryCards.tsx`, `apps/web/src/features/review/components/IssueQueueDialog.tsx`, `apps/web/src/features/review/components/K1ApplyPanel.tsx`, `apps/web/src/assets/hero.png`, `apps/web/src/assets/react.svg`, and `apps/web/src/assets/vite.svg`
- [X] T038 [US2] Run focused report/review tests and asset-reference scans, verify `apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts` remains used, and record the leaf-group result in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T039 [P] [US2] Delete `apps/api/src/infra/db/seed/002_k1_fixtures.ts`, `apps/api/src/infra/db/seed/003_review_fixtures.ts`, and `apps/api/src/infra/db/seed/006_reports_fixtures.ts` while retaining `apps/api/src/infra/db/seed/004_partnership_fixtures.ts`
- [X] T040 [P] [US2] Replace stale seed-run instructions with current test-fixture or migration guidance in `specs/002-k1-ingestion/tasks.md`, `specs/003-review-and-finalization/quickstart.md`, `specs/003-review-and-finalization/tasks.md`, and `specs/006-reports/tasks.md`
- [X] T041 [P] [US2] Remove the broken `transfer:prepare` entry that targets the absent `scripts/prepare-laptop-transfer.ps1` from `package.json`
- [X] T042 [US2] Run seed/script/document reference scans, repository guard tests, and migration/fixture inventory checks, then record retained operational assets and the group result in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

### MUI and Emotion Closure

- [X] T043 [US2] Remove `ThemeProvider` and `muiTheme` from `apps/web/src/main.tsx`, then delete `apps/web/src/theme/muiTheme.ts` and `apps/web/src/theme/muiTheme.test.ts`
- [X] T044 [US2] Remove `@mui/material`, `@mui/icons-material`, `@emotion/react`, and `@emotion/styled` from `apps/web/package.json` and regenerate `package-lock.json` with the repository package manager
- [X] T045 [US2] Run zero-reference scans, clean dependency installation/listing, web lint/typecheck/tests, and both Magic UI builds, then record the MUI/Emotion closure result in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

### Post-deletion Reachability

- [X] T046 [US2] Re-run the production-entry reachability graph after all approved deletions, compare it to the baseline, and classify every newly exposed candidate without expanding this iteration's deletion boundary in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

**Checkpoint**: All 56 approved files, four orphaned packages, one broken script, and exact stale documentation references are gone; no unapproved source is deleted.

---

## Phase 6: User Story 4 — Preserve Supported and Operational Surfaces (Priority: P1)

**Goal**: Prove the pruning did not regress supported providers, authentication, Magic UI variants, data history, repository guards, or operational workflows.

**Independent Test**: Run the complete validation matrix from `quickstart.md`; both UI variants build and route correctly, MFA behaves correctly in both flag states, `stub` and `aws_bda` remain supported, Azure Document Intelligence has no active references, migrations/fixtures/guards remain intact, and operational scans report no broken paths.

- [X] T047 [US4] Run exact active-reference scans for Azure Document Intelligence and the supported `stub | aws_bda` extractor set plus focused provider tests and the API build, recording evidence in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T048 [US4] Run the full API test suite with focused authentication coverage in both `MFA_LOGIN_ENABLED=false` and `MFA_LOGIN_ENABLED=true` states, recording regressions and cookie/session outcomes in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T049 [US4] Run web lint, typecheck, the full web test suite, and the color guard, recording results and any baseline comparison in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T050 [US4] Build and exercise route ownership with `VITE_MAGIC_PATTERN_DESIGNS=false`, including login, MFA completion, liquidity, partnership, K-1, report, and review destinations, recording results and bundle size in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T051 [US4] Build and exercise route ownership with `VITE_MAGIC_PATTERN_DESIGNS=true`, including login, MFA completion, dashboard, partnership, K-1, report, and review destinations, recording results and bundle size in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T052 [US4] Run clean root/workspace dependency installation and listing plus Terraform format/validation for `infra/aws/terraform/`, recording lockfile integrity and deploy-time MFA wiring in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T053 [US4] Run repository guard tests, migration and fixture inventory/diff checks, operational-script path scans, and protected-surface scans, recording proof that only approved targets changed in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

**Checkpoint**: Every protected surface has passing evidence or a documented, unchanged baseline failure.

---

## Phase 7: Polish and Cross-Cutting Verification

**Purpose**: Reconcile the evidence, review the complete diff, and leave the iteration ready for a clean commit and PR review.

- [X] T054 Finalize removed file/byte/line/dependency counts, before/after bundle sizes, verification status, and deferred follow-up candidates in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T055 Reconcile every changed or deleted path from `git diff --name-status` with a deletion group, MFA implementation record, documentation correction, or planning artifact in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`
- [X] T056 Run `git diff --check`, inspect `git status --short`, confirm every approved deletion is absent and every protected path is present, and record the final review outcome in `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately and records the unchanged baseline.
- **Foundational Safety (Phase 2)**: Depends on Phase 1 and blocks all story work.
- **US1 Classification (Phase 3)**: Depends on Phase 2 and authorizes the exact iteration boundary.
- **US3 MFA Flag (Phase 4)**: Depends on US1 because the MFA files must be reclassified before reconnection; it blocks deletion work that relies on the final reachability graph.
- **US2 Removal (Phase 5)**: Depends on US1 and US3. Within the phase, each verification task depends on its corresponding retarget/delete tasks.
- **US4 Preservation (Phase 6)**: Depends on completion of US2 and verifies the integrated result.
- **Polish (Phase 7)**: Depends on all user stories and all validation evidence.

### User Story Dependencies

- **US1**: Independent after the shared baseline and safety controls; produces the deletion authorization.
- **US3**: Depends on US1 classification but is independently testable with the two runtime flag states.
- **US2**: Depends on US1 authorization and US3 reconnection; each deletion group remains independently verifiable.
- **US4**: Depends on the integrated US2 result and independently validates every protected surface.

### Within Each User Story

- Write and run focused tests before implementation or deletion.
- Retarget valid behavioral coverage before deleting proxy or sole-purpose files.
- Run focused verification immediately after each deletion group.
- Recompute reachability only after all approved groups are removed.
- Do not expand the deletion boundary when post-deletion analysis reveals new candidates; classify them for a later iteration.

### Parallel Opportunities

- T013–T019 can run in parallel because they create or extend distinct test files.
- T020 and T021 can run in parallel because API configuration and Terraform/deployment wiring touch separate files.
- T027 and T028 can run in parallel because they retarget distinct test suites.
- T029–T031 can run in parallel after their classifications are approved because they delete separate source/test subsets.
- T037, T039, T040, and T041 can run in parallel because they operate on separate feature, seed, specification, and root-package paths.
- Validation tasks intentionally converge on `pruning-manifest.md` and should be serialized when performed in one working tree.

---

## Parallel Example: User Story 3

```text
Task T013: Extend apps/api/tests/auth.login.test.ts
Task T014: Create apps/api/tests/auth.mfa-enroll.test.ts
Task T015: Create apps/api/tests/auth.mfa-verify.test.ts
Task T016: Extend apps/web/src/pages/LoginPage.test.tsx
Task T017: Extend apps/web/src/App.test.tsx
Task T018: Create apps/web/src/pages/MFAPage.test.tsx
Task T019: Create apps/web/src/pages/MFASetupPage.test.tsx
```

## Parallel Example: User Story 2

```text
Task T029: Delete the legacy partnership API/hook closure
Task T030: Delete the legacy partnership component closure
Task T031: Delete sole-purpose partnership tests
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Setup and Foundational Safety.
2. Complete US1 classification and reproduce its evidence.
3. Stop and review the manifest before any source deletion.

### Incremental Delivery

1. Establish the baseline and protected-surface contract.
2. Deliver US1 as an auditable classification checkpoint.
3. Deliver US3 so MFA sources are reachable behind the default-off runtime flag.
4. Deliver US2 one deletion closure at a time, validating after each group.
5. Deliver US4 as the integrated preservation proof.
6. Finalize counts, evidence, and the review-ready diff.

### Commit Boundaries

- Commit planning and baseline evidence after US1 if a review checkpoint is desired.
- Commit the MFA runtime-flag slice after US3 passes independently.
- Commit pruning groups together only after all US2 focused and full gates pass.
- Keep post-deletion newly exposed candidates classified for the next iteration rather than adding them to this commit.

---

## Notes

- `[P]` tasks are safe to parallelize only when each worker uses a non-conflicting working tree or coordinates shared-file writes.
- Historical references in immutable prior specs are removed only where they are executable stale instructions; historical decision prose remains evidence, not active provider support.
- Azure Document Intelligence is not an approved implementation or deletion target because it is already absent from active code/config/dependencies/tests/scripts/operator docs.
- `MFA_LOGIN_ENABLED` belongs to the API runtime environment and defaults to false; do not introduce a Vite MFA flag.
- A passing test obtained by restoring approved stale code is not acceptable; correct the live implementation or test boundary instead.
