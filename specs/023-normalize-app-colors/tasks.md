# Tasks: Normalize Application Color System

**Input**: Design documents from `/specs/023-normalize-app-colors/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/color-system-ui.md](./contracts/color-system-ui.md), [quickstart.md](./quickstart.md)

**Tests**: The specification explicitly requires automated coverage for shared variants, contrast, module integration, and color governance. Test tasks appear before their corresponding implementation tasks and should fail for the intended reason before implementation begins.

**Organization**: Tasks are grouped by user story so the primary action hierarchy, broader interaction system, and future drift prevention can each be implemented and verified as an independent increment after the foundation is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated prerequisites because it changes a separate file set.
- **[Story]**: Maps the task to User Story 1, 2, or 3 from [spec.md](./spec.md).
- Every task names the exact file or bounded file set it changes or uses for verification.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture the measurable baseline before any palette migration changes source or build output.

- [X] T001 Record current gold/raw-green/blue-focus occurrence counts, affected production files, button/file counts, and production CSS gzip size in specs/023-normalize-app-colors/color-baseline.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the single token source and styling bridges required by every user story.

**CRITICAL**: Complete this phase before migrating any feature consumer.

- [X] T002 [P] Write failing token schema, uppercase-hex, uniqueness, role-boundary, and WCAG contrast tests in apps/web/src/theme/colorSystem.test.ts
- [X] T003 Implement the canonical interaction, neutral, semantic, visualization, decorative, disabled, and inverse token objects in apps/web/design-tokens.js and apps/web/design-tokens.d.ts so T002 passes
- [X] T004 [P] Map the canonical tokens to semantic Tailwind aliases and temporary legacy component adapters in apps/web/tailwind.config.js and apps/web/src/index.css
- [X] T005 [P] Write failing MUI palette and component-state alignment tests in apps/web/src/theme/muiTheme.test.ts
- [X] T006 Implement the token-driven MUI theme and root provider in apps/web/src/theme/muiTheme.ts and apps/web/src/main.tsx so T005 passes
- [X] T007 Run the foundational checks from specs/023-normalize-app-colors/quickstart.md and record token, Tailwind production build, and MUI bridge results in specs/023-normalize-app-colors/color-baseline.md

**Checkpoint**: Tailwind utilities, MUI components, browser code, tests, and later governance tooling can consume one canonical token source.

---

## Phase 3: User Story 1 - Recognize One Consistent Action Hierarchy (Priority: P1) MVP

**Goal**: Make every standard primary, secondary, ghost, destructive, disabled/loading, and inverse action use the same shared hierarchy across all routes and both design variants.

**Independent Test**: Visit every routed surface and representative nested dialog in both supported feature-flag variants; every equivalent primary action is forest green, dark surfaces use the inverse variant, destructive actions remain red, and shared hover/active/focus/disabled states are present.

### Tests for User Story 1

- [X] T008 [P] [US1] Write failing variant, size, pending/disabled, focus-visible, danger, inverse, and button-like-link recipe tests in apps/web/src/components/shared/Button.test.tsx
- [X] T009 [P] [US1] Add failing semantic action-hierarchy assertions to apps/web/src/components/shared/AppShell.test.tsx, apps/web/src/pages/LoginPage.test.tsx, apps/web/src/pages/EntitiesPage.test.tsx, apps/web/src/pages/K1ReviewWorkspace.test.tsx, and apps/web/src/pages/PartnershipTrackerPage.test.tsx

### Implementation for User Story 1

- [X] T010 [US1] Implement Button, buttonClassName, primary/secondary/ghost/danger/inverse variants, sm/md/lg/icon sizes, and pending/disabled behavior in apps/web/src/components/shared/Button.tsx so T008 passes
- [X] T011 [P] [US1] Migrate global and shared action consumers to Button/buttonClassName in apps/web/src/components/PageHeader.tsx, apps/web/src/components/FilterToolbar.tsx, apps/web/src/components/shared/PageHeader.tsx, apps/web/src/components/shared/FilterToolbar.tsx, and apps/web/src/components/shared/ConfirmationDialog.tsx
- [X] T012 [P] [US1] Migrate authentication, MFA, permission, and administration actions in apps/web/src/pages/LoginPage.tsx, apps/web/src/pages/magic-patterns/MagicPatternLoginPage.tsx, apps/web/src/pages/MFAPage.tsx, apps/web/src/pages/MFASetupPage.tsx, apps/web/src/features/features/auth/screens/MfaScreen.tsx, apps/web/src/pages/PermissionDeniedPage.tsx, apps/web/src/pages/UserManagementPage.tsx, and apps/web/src/pages/UserDetailPage.tsx
- [X] T013 [P] [US1] Migrate dashboard and entity actions, including the dark-hero inverse CTA, in apps/web/src/pages/DashboardPage.tsx, apps/web/src/pages/magic-patterns/MagicPatternDashboardPage.tsx, apps/web/src/pages/EntitiesPage.tsx, apps/web/src/pages/magic-patterns/MagicPatternEntitiesPage.tsx, apps/web/src/pages/EntityDetail.tsx, and apps/web/src/pages/magic-patterns/MagicPatternEntityDetailPage.tsx
- [X] T014 [P] [US1] Migrate K-1 dashboard, upload, intake, review, and tracker actions in apps/web/src/pages/K1Dashboard.tsx, apps/web/src/pages/K1ReviewWorkspace.tsx, apps/web/src/features/k1/components/K1UploadDialog.tsx, apps/web/src/features/k1/components/K1PartnershipIntakeRail.tsx, apps/web/src/features/k1-tracker/components/AddYearDialog.tsx, apps/web/src/features/k1-tracker/components/CompareYearsDrawer.tsx, apps/web/src/features/k1-tracker/components/ImportWorkbookDialog.tsx, apps/web/src/features/k1-tracker/components/K1OfficialFormField.tsx, and apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx
- [X] T015 [P] [US1] Migrate current partnership workspace actions in apps/web/src/features/partnership-tracker/components/AddPartnershipDialog.tsx, apps/web/src/features/partnership-tracker/components/EditPartnershipDialog.tsx, apps/web/src/features/partnership-tracker/components/CommitmentEntryDialog.tsx, apps/web/src/features/partnership-tracker/components/NavEntryDialog.tsx, apps/web/src/features/partnership-tracker/components/DatedCashFlowPanel.tsx, apps/web/src/features/partnership-tracker/components/ManagementFeePanel.tsx, apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx, and apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx
- [X] T016 [P] [US1] Migrate legacy partnership actions in apps/web/src/features/partnerships/components/AddAssetDialog.tsx, apps/web/src/features/partnerships/components/AddCapitalActivityDrawer.tsx, apps/web/src/features/partnerships/components/AddCommitmentDrawer.tsx, apps/web/src/features/partnerships/components/AddPartnershipDialog.tsx, apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx, apps/web/src/features/partnerships/components/AssetsSection.tsx, apps/web/src/features/partnerships/components/CapitalOverviewSection.tsx, apps/web/src/features/partnerships/components/EditPartnershipDialog.tsx, apps/web/src/features/partnerships/components/K1HistorySection.tsx, apps/web/src/features/partnerships/components/RecordAssetFmvDialog.tsx, and apps/web/src/features/partnerships/components/RecordFmvDialog.tsx
- [X] T017 [P] [US1] Migrate aggregation and TIC registry actions in apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationFilters.tsx, apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx, apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationTable.tsx, apps/web/src/features/partnership-tracker/components/aggregation/PartnershipLedgerPdfExportDialog.tsx, apps/web/src/features/tic-registry/components/TicPropertyCard.tsx, apps/web/src/features/tic-registry/components/TicRegistryDialogs.tsx, and apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx
- [X] T018 [P] [US1] Migrate reports, estate-map, investment-tracker, and liquidity action hierarchy in apps/web/src/features/reports/components/PlaidAccountSelector.tsx, apps/web/src/features/reports/components/EditableCell.tsx, apps/web/src/features/reports/components/ReportsHeaderActions.tsx, apps/web/src/features/estate-map/components/EstateMapCanvas.tsx, apps/web/src/features/estate-map/components/EstateMapSetupGuide.tsx, apps/web/src/features/estate-map/EstateMapPageContent.tsx, apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternInvestmentControls.tsx, apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternCapitalActivityTable.tsx, and apps/web/src/pages/LiquidityPage.tsx
- [X] T019 [US1] Run the US1 focused tests and action-only route matrix from specs/023-normalize-app-colors/quickstart.md, fix regressions in the US1 consumer files, and record the independent-test result in specs/023-normalize-app-colors/color-baseline.md

**Checkpoint**: The application has one action hierarchy on every route; non-action focus, selection, progress, and semantic color migration may proceed independently in US2.

---

## Phase 4: User Story 2 - See a Coherent Jackson Visual System Everywhere (Priority: P1)

**Goal**: Normalize focus, fields, links, navigation, selection, progress, and branded accents while preserving distinct semantic, financial, chart, map, provenance, and workflow meaning.

**Independent Test**: Traverse all route families with keyboard-only navigation in both design variants; focus and selected states use the shared recipes, fields/links/navigation are coherent, and semantic/data colors retain a non-color cue and their original meaning.

### Tests for User Story 2

- [X] T020 [P] [US2] Add failing focus, selected-navigation, field, link, checkbox/radio, icon-action, file-drop, inverse, and forced-colors recipe assertions to apps/web/src/components/shared/AppShell.test.tsx, apps/web/src/components/shared/CurrencyInput.test.tsx, apps/web/src/pages/LoginPage.test.tsx, and apps/web/src/pages/EntitiesPage.test.tsx
- [X] T021 [P] [US2] Add failing semantic-preservation and non-color-cue assertions to apps/web/src/features/k1-tracker/__tests__/K1FormLayout.test.tsx, apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx, apps/web/src/features/estate-map/EstateMapPageContent.test.tsx, apps/web/src/features/reports/components/AllocationChart.test.tsx, and apps/web/src/features/tic-registry/__tests__/TicRegistryPageContent.test.tsx

### Implementation for User Story 2

- [X] T022 [US2] Implement shared standard/inverse focus, field, choice, interactive-link, icon-action, selected-surface, navigation, and file-drop recipes in apps/web/src/components/shared/colorRecipes.ts so T020 passes
- [X] T023 [P] [US2] Migrate shell and global non-action color roles in apps/web/src/components/shared/AppShell.tsx, apps/web/src/components/GlobalLoadingBar.tsx, apps/web/src/components/shared/CurrencyField.tsx, apps/web/src/components/shared/StatusBadge.tsx, apps/web/src/components/shared/RolePill.tsx, and apps/web/src/components/shared/DataTable.tsx
- [X] T024 [P] [US2] Migrate authentication, administration, dashboard, and entity field/focus/link/selection/decorative roles in apps/web/src/pages/LoginPage.tsx, apps/web/src/pages/magic-patterns/MagicPatternLoginPage.tsx, apps/web/src/features/features/auth/screens/MfaScreen.tsx, apps/web/src/pages/UserManagementPage.tsx, apps/web/src/pages/UserDetailPage.tsx, apps/web/src/pages/magic-patterns/MagicPatternDashboardPage.tsx, apps/web/src/pages/EntitiesPage.tsx, apps/web/src/pages/magic-patterns/MagicPatternEntitiesPage.tsx, apps/web/src/pages/EntityDetail.tsx, and apps/web/src/pages/magic-patterns/MagicPatternEntityDetailPage.tsx
- [X] T025 [P] [US2] Migrate K-1 and review focus, selection, form-header, progress, provenance, warning, and status roles in apps/web/src/pages/K1Dashboard.tsx, apps/web/src/pages/K1ReviewWorkspace.tsx, apps/web/src/features/k1/components/K1UploadDialog.tsx, apps/web/src/features/k1/components/K1PartnershipIntakeRail.tsx, apps/web/src/features/k1-tracker/components/K1FormHeader.tsx, apps/web/src/features/k1-tracker/components/K1FormIdentityPanel.tsx, apps/web/src/features/k1-tracker/components/K1PartThreeGrid.tsx, apps/web/src/features/k1-tracker/components/K1SupplementalWorkpaper.tsx, apps/web/src/features/k1-tracker/components/K1OfficialFormField.tsx, apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx, and apps/web/src/features/k1-tracker/components/YearRail.tsx
- [X] T026 [P] [US2] Migrate partnership workspace focus, selection, navigation, financial direction, workflow, and relationship roles in apps/web/src/features/partnership-tracker/components/DatedCashFlowPanel.tsx, apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx, apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternPrimitives.tsx, apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternCapitalActivityPortfolio.tsx, apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternOperationalDrawers.tsx, apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternPartnershipIndex.tsx, apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternPartnershipWorkspace.tsx, apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternRelationshipsPanel.tsx, and apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternUnderlyingAssets.tsx
- [X] T027 [P] [US2] Migrate estate-map, review, reports, investment-tracker, TIC, and aggregation focus/selection/status/data roles in apps/web/src/features/estate-map/components/EstateMapCanvas.tsx, apps/web/src/features/estate-map/components/EstateMapSetupGuide.tsx, apps/web/src/features/estate-map/EstateMapPageContent.tsx, apps/web/src/features/review/components/EntityTypeahead.tsx, apps/web/src/features/review/components/IssueQueueDialog.tsx, apps/web/src/features/review/components/PartnershipTypeahead.tsx, apps/web/src/features/reports/components/AllocationChart.tsx, apps/web/src/features/reports/components/ConsolidatedHoldingsTable.tsx, apps/web/src/features/reports/components/DataQualityBanner.tsx, apps/web/src/features/reports/components/PortfolioHero.tsx, apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternInvestmentControls.tsx, apps/web/src/features/tic-registry/components/TicRegistryPageContent.tsx, and apps/web/src/features/partnership-tracker/components/aggregation/PartnershipAggregationPageContent.tsx
- [X] T028 [US2] Classify every remaining non-neutral production color occurrence as interaction, semantic, visualization, or decorative and add only exact justified non-interaction entries to apps/web/color-exceptions.json according to specs/023-normalize-app-colors/contracts/color-system-ui.md
- [X] T029 [US2] Run the US2 focused tests and keyboard/selection/status route matrix from specs/023-normalize-app-colors/quickstart.md, fix regressions in the US2 consumer files, and record the independent-test result in specs/023-normalize-app-colors/color-baseline.md

**Checkpoint**: Buttons, fields, links, focus, selection, navigation, progress, and status/data colors now express one documented system without losing domain meaning.

---

## Phase 5: User Story 3 - Prevent Color Drift in Future Changes (Priority: P2)

**Goal**: Make semantic tokens and shared primitives the maintainable default and fail automation when undocumented legacy or raw interaction colors return.

**Independent Test**: Add prohibited and allowed fixture examples, run `npm run --workspace=web check:colors`, and verify exact file/line/token failures for prohibited colors while named semantic/visualization exceptions pass.

### Tests for User Story 3

- [X] T030 [P] [US3] Write failing CLI tests for prohibited literals, JSX/template contexts, exact file/line diagnostics, test/generated exclusions, and successful clean fixtures in apps/web/tests/color-system-governance.spec.ts, apps/web/tests/fixtures/color-system/prohibited.tsx, apps/web/tests/fixtures/color-system/allowed.tsx, and apps/web/tests/fixtures/color-system/exceptions.json
- [X] T031 [P] [US3] Write failing exception-registry tests for required fields, categories, exact paths/matches, duplicates, stale entries, and forbidden interaction exceptions in apps/web/src/theme/colorExceptions.test.ts

### Implementation for User Story 3

- [X] T032 [US3] Implement the TypeScript-AST/string color audit, exception validation, deterministic diagnostics, and nonzero failure exit in apps/web/scripts/check-color-system.mjs so T030 and T031 pass
- [X] T033 [US3] Add the check:colors command and CI-compatible invocation to apps/web/package.json and document its local usage in specs/023-normalize-app-colors/quickstart.md
- [X] T034 [P] [US3] Remove duplicate local action variant implementations or convert them to shared re-exports in apps/web/src/features/partnership-tracker/components/magic-patterns/MagicPatternPrimitives.tsx, apps/web/src/pages/magic-patterns/MagicPatternEntitiesPage.tsx, and apps/web/src/pages/magic-patterns/MagicPatternEntityDetailPage.tsx
- [X] T035 [P] [US3] Replace obsolete gold/raw-green implementation assertions with semantic token/variant assertions in apps/web/src/features/tic-registry/__tests__/TicRegistryNavigation.test.tsx, apps/web/src/features/partnerships/__tests__/PartnershipNavigation.test.tsx, apps/web/src/features/k1-tracker/__tests__/K1TrackerNavigation.test.tsx, apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerNavigation.test.tsx, and apps/web/src/pages/magic-patterns/MagicPatternDashboardPage.test.tsx
- [X] T036 [US3] Run the governance command against apps/web/src, remove legacy jackson-gold/jackson-hover interaction aliases and temporary raw primary/focus overrides from apps/web/tailwind.config.js and apps/web/src/index.css, resolve all undocumented findings, and confirm only active entries in apps/web/color-exceptions.json remain

**Checkpoint**: A new standard action can be created without feature-local palette classes, and automated checks prevent legacy interaction colors from returning.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete full-suite, responsive, visual, accessibility, and performance verification across all stories.

- [X] T037 [P] Run all representative module tests listed in specs/023-normalize-app-colors/quickstart.md and fix only color-system regressions in the corresponding apps/web/src test and consumer files
- [X] T038 Run npm workspace lint, typecheck, full Vitest suite, check:colors, and production build from specs/023-normalize-app-colors/quickstart.md, then record command results in specs/023-normalize-app-colors/color-baseline.md
- [X] T039 Compare final production CSS gzip size with the T001 baseline, keep growth below 5 KB, and document any token/utility cleanup in specs/023-normalize-app-colors/color-baseline.md and apps/web/tailwind.config.js
- [ ] T040 Complete the desktop and 390px route matrix for both VITE_MAGIC_PATTERN_DESIGNS values, keyboard focus, forced-colors, disabled/loading, inverse, warning/error/success, chart/map, and non-color cues, then append evidence and final status to specs/023-normalize-app-colors/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on T001 and blocks all consumer migration.
- **User Story 1 (Phase 3)**: Depends on T002-T007. Tests T008-T009 precede T010-T018; T019 validates the completed story.
- **User Story 2 (Phase 4)**: Depends on T002-T007. Tests T020-T021 precede T022-T028; T029 validates the completed story.
- **User Story 3 (Phase 5)**: Scanner/registry tests T030-T031 can begin after T002-T007. T032-T033 implement the audit; T034-T036 require the US1/US2 migrations and classification to be complete before final zero-drift enforcement.
- **Polish (Phase 6)**: Depends on all selected user stories; T040 is the final acceptance gate.

### User Story Dependency Graph

```text
Setup T001
   |
Foundation T002-T007
   |--------------------|
   v                    v
US1 T008-T019       US2 T020-T029
   |                    |
   +---------+----------+
             v
       US3 T030-T036
             |
             v
       Polish T037-T040
```

### User Story Independence

- **US1 (P1)**: Independently delivers a consistent action hierarchy after Foundation. It does not require US2 or US3 to pass its route-based primary/secondary/destructive/inverse test.
- **US2 (P1)**: Independently delivers coherent non-action focus, selection, navigation, fields, progress, and semantic/data color roles after Foundation. It can be verified without the governance CLI.
- **US3 (P2)**: Its scanner and exception behavior are independently testable with fixtures after Foundation. Final repository enforcement waits for US1 and US2 so legitimate migration work is not blocked by temporary findings.

### Within Each User Story

- Write the listed tests first and confirm they fail for the intended missing or legacy behavior.
- Implement shared primitives/recipes before migrating consumers.
- Parallel consumer groups may start only after their story's shared primitive/recipe exists.
- Complete the independent checkpoint before treating the story as done.

### Parallel Opportunities

- T002, T004, and T005 change separate foundational files after their prerequisites.
- T008 and T009 can be authored in parallel.
- T011-T018 are module-separated consumer migrations after T010.
- T020 and T021 can be authored in parallel.
- T023-T027 are module-separated non-action migrations after T022.
- T030 and T031 can be authored in parallel.
- T034 and T035 can run in parallel after the app-wide migrations.
- T037 can begin while T039 prepares the final size comparison after a successful build artifact exists.

---

## Parallel Example: User Story 1

```text
After T010 completes:
- T011: shared action consumers
- T012: authentication and administration
- T013: dashboard and entities
- T014: K-1 surfaces
- T015: current partnership workspace
- T016: legacy partnership surfaces
- T017: aggregation and TIC registry
- T018: reports, estate map, investment tracker, and liquidity
```

## Parallel Example: User Story 2

```text
After T022 completes:
- T023: shell and global roles
- T024: auth, admin, dashboard, and entities
- T025: K-1 and review
- T026: partnership workspaces
- T027: estate map, review, reports, investment, TIC, and aggregation
```

## Parallel Example: User Story 3

```text
After Foundation:
- T030: CLI behavior fixtures/tests
- T031: exception-registry validation tests

After US1 and US2 migrations:
- T034: duplicate variant cleanup
- T035: obsolete assertion cleanup
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete T001-T007.
2. Complete T008-T019.
3. Stop and validate the action-only route matrix.
4. Demo one consistent primary/secondary/destructive/inverse hierarchy across every route and both variants.

### Incremental Delivery

1. **Foundation**: Canonical tokens, Tailwind aliases, and MUI bridge.
2. **US1**: Consistent actions across the application (MVP).
3. **US2**: Coherent focus, fields, links, navigation, selections, progress, and semantic/data roles.
4. **US3**: Automated governance, exception validation, and duplicate-recipe removal.
5. **Polish**: Full regression, responsive, keyboard, forced-colors, route-matrix, and CSS-size validation.

### Parallel Team Strategy

After the foundation, one owner can implement the shared US1 action primitive while another writes US2 recipe tests. Once shared APIs stabilize, distribute module groups exactly as shown in the parallel examples. Reserve final ownership of `apps/web/tailwind.config.js`, `apps/web/src/index.css`, and `apps/web/color-exceptions.json` to avoid merge conflicts during enforcement.

---

## Notes

- `[P]` means different files and no dependency on an incomplete task beyond the prerequisites stated above.
- `[US1]`, `[US2]`, and `[US3]` provide traceability to [spec.md](./spec.md).
- Preserve event handlers, accessible names, DOM roles, routing, permissions, calculations, persistence, and responsive behavior while changing color roles.
- Use semantic tokens for interaction; retain status, financial, chart, map, category, and decorative colors only when classified and supported by a non-color cue.
- Commit after each task or logical module group; do not include the unrelated untracked `tmp/` directory.
