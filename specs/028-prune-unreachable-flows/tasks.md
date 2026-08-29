# Tasks: Prune Unreachable Product Flows

**Input**: Design documents from `/specs/028-prune-unreachable-flows/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/retained-surface.md](./contracts/retained-surface.md), [quickstart.md](./quickstart.md)

**Tests**: The specification requires route-contract, retained-flow, reachability, API consumer, security, build, and regression verification. Test tasks appear before the implementation they protect.

**Organization**: Tasks are grouped by user story. Cleanup decisions and actual results are recorded in `specs/028-prune-unreachable-flows/pruning-manifest.md`; a candidate is removed only after its applicable consumer edges are disproved.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after prior phase dependencies are satisfied because it changes different files and does not depend on another incomplete task in the same parallel group.
- **[Story]**: Maps the task to User Story 1-4 in [spec.md](./spec.md).
- Every task names the file or directory it changes or records evidence in.

---

## Phase 1: Setup (Shared Evidence)

**Purpose**: Establish the implementation artifact and prove the cleanup starts from the required clean Spec 027 baseline.

- [X] T001 Create `specs/028-prune-unreachable-flows/pruning-manifest.md` with Retained Flow, System Root, Consumer Edge, Candidate, API Consumer Matrix, Deletion Group, Protected Surface, Deferred Decision, Verification Record, Diff Reconciliation, and Final Delta sections from `specs/028-prune-unreachable-flows/data-model.md`
- [X] T002 Confirm Spec 027 is captured in the clean implementation baseline and record the commit, branch, worktree status, Node/npm versions, and prerequisite result in `specs/028-prune-unreachable-flows/pruning-manifest.md`; stop implementation if the worktree still mixes uncommitted Spec 027 code
- [X] T003 Record the baseline browser route inventory, design-flag scan, tracked `apps/web/src` files/lines/bytes, direct web dependencies, Vite JS/CSS output, web lint/typecheck/test/color/build results, and known failures in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T004 Record the baseline API route inventory, tracked `apps/api/src` files/lines/bytes, direct API dependencies, API build/test results, Spec 027 security checks, and Terraform fmt/init/validate results in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T005 Record the baseline migration path/hash inventory and authoritative fixture inventory from `apps/api/src/infra/db/migrations/`, `apps/api/tests/fixtures/`, and `apps/web/src/**/fixtures/` in `specs/028-prune-unreachable-flows/pruning-manifest.md`

**Checkpoint**: A named clean baseline exists, every pre-existing failure is recorded, and protected data history can be compared byte-for-byte later.

---

## Phase 2: Foundational (Blocking Inventories)

**Purpose**: Build the evidence structures that all deletion stories depend on.

**CRITICAL**: No deletion task may start until this phase is complete.

- [X] T006 Inventory every tracked browser route, production/test source, export, type, asset, environment entry, script, direct dependency, and documentation candidate as `REMOVE`, `RETAIN`, or `DEFER` records in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T007 Map the 13 retained browser patterns, wildcard fallback, Dashboard/AppShell/contextual navigation edges, Admin/User states, and web-client API calls to Retained Flow records in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T008 Map authentication/security, `/health`, `/internal/readiness`, migrations, K-1 worker/reconciler, Plaid/market schedulers, deployment/security commands, and authoritative fixtures to concrete System Root consumer edges in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T009 Enumerate every registered Fastify method and canonical pattern from `apps/api/src/app.ts`, `apps/api/src/routes/index.ts`, and `apps/api/src/modules/**/*.routes.ts` with its Spec 027 protection policy in the API Consumer Matrix in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T010 Reconcile the Retained Flow, System Root, candidate, and initial API inventories; assign the six planned deletion-group IDs and freeze the initial approved/deferred boundary in `specs/028-prune-unreachable-flows/pruning-manifest.md`

**Checkpoint**: Every initial candidate and registered API route has an evidence record; uncertain items are deferred rather than implicitly approved.

---

## Phase 3: User Story 1 - Keep the Current Dashboard Product (Priority: P1)

**Goal**: Prove every current dashboard/sidebar/contextual flow works and migrate all live partnership handoffs to canonical Investment Tracker query state before any redirect is removed.

**Independent Test**: Sign in as User and Admin, open `/dashboard`, traverse Dashboard, Investment Tracker, Liquidity, Entities/detail, Estate Maps, TIC Registry, Reports, K-1 queue/review, and partnership handoffs, and confirm every destination uses one of the 13 retained route patterns with current role behavior.

### Tests for User Story 1

- [X] T011 [P] [US1] Characterize Dashboard module cards, quick actions, Reports action, recent K-1 actions, and current sidebar destinations in `apps/web/src/pages/magic-patterns/MagicPatternDashboardPage.test.tsx` and `apps/web/src/components/shared/AppShell.test.tsx`
- [X] T012 [P] [US1] Add canonical `partnership`, `area`, and `year` query-state plus legacy-area normalization coverage in `apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternInvestmentTrackerPageContent.test.tsx`
- [X] T013 [P] [US1] Change the K-1 finalize/apply handoff expectation to `/investment-tracker` with preserved partnership/year/area state in `apps/web/src/pages/K1ReviewWorkspace.test.tsx`
- [X] T014 [P] [US1] Add partnership and underlying-asset deep-link expectations for `/investment-tracker` in `apps/web/src/features/estate-map/EstateMapPageContent.test.tsx` and `apps/web/src/features/estate-map/estateMapModel.test.ts`
- [X] T015 [P] [US1] Add current entity-directory/detail partnership handoff and Admin/User permission expectations in `apps/web/src/pages/EntitiesPage.test.tsx` and `apps/web/src/pages/EntityDetail.test.tsx`

### Implementation for User Story 1

- [X] T016 [US1] Centralize canonical Investment Tracker area normalization and query updates in `apps/web/src/features/investment-tracker/components/magic-patterns/MagicPatternInvestmentTrackerPageContent.tsx` so `overview`, `capital-activity`, `valuations`, `k1-history`, `underlying-assets`, and supported legacy input aliases preserve selected partnership/year state
- [X] T017 [P] [US1] Replace the live `/partnership-tracker` review handoff with `/investment-tracker` query state in `apps/web/src/pages/K1ReviewWorkspace.tsx`
- [X] T018 [P] [US1] Replace Estate Map partnership and asset destinations with `/investment-tracker` plus canonical area state in `apps/web/src/features/estate-map/components/EstateMapCanvas.tsx`
- [X] T019 [P] [US1] Replace any retained entity-page legacy partnership destination with canonical Investment Tracker state in `apps/web/src/pages/magic-patterns/MagicPatternEntitiesPage.tsx` and `apps/web/src/pages/magic-patterns/MagicPatternEntityDetailPage.tsx`
- [X] T020 [US1] Run the retained Admin/User route-flow, dashboard, Investment Tracker, K-1 review, entity, Estate Map, Liquidity, Reports, and TIC focused suites plus a production web build; record actual US1 results and navigation-edge updates in `specs/028-prune-unreachable-flows/pruning-manifest.md`

**Checkpoint**: The complete current product is characterized and all live partnership navigation is canonical without relying on a retired redirect.

---

## Phase 4: User Story 2 - Retire Legacy and Direct-Only Browser Surfaces (Priority: P1)

**Goal**: Make the current dashboard UI unconditional, remove the design toggle and nine retired browser patterns, and delete their high-confidence exclusive web closures.

**Independent Test**: Build and run the application without `VITE_MAGIC_PATTERN_DESIGNS`; login/MFA lands on Dashboard, the normalized router contains exactly the 13 retained patterns plus wildcard, and active web source has no retired design identifier or retired browser destination.

### Tests for User Story 2

- [X] T021 [P] [US2] Replace dual-variant router assertions with the exact 13-route-plus-wildcard contract and explicit absence of all nine retired patterns in `apps/web/src/App.test.tsx`
- [X] T022 [P] [US2] Replace design-parameterized login/MFA expectations with unconditional current login rendering and `/dashboard` completion in `apps/web/src/pages/LoginPage.test.tsx`, `apps/web/src/pages/MFAPage.test.tsx`, and `apps/web/src/pages/MFASetupPage.test.tsx`
- [X] T023 [P] [US2] Replace dual-shell tests with the current Overview/Modules/Workspace navigation, responsive/collapsed behavior, logout, and accessibility expectations in `apps/web/src/components/shared/AppShell.test.tsx`
- [X] T024 [P] [US2] Replace legacy/current page-variant assertions with current-only entity, entity-detail, and Investment Tracker behavior in `apps/web/src/pages/EntitiesPage.test.tsx`, `apps/web/src/pages/EntityDetail.test.tsx`, and `apps/web/src/pages/InvestmentTrackerPage.test.tsx`

### Implementation for User Story 2

- [X] T025 [US2] Make the current Dashboard unconditional and remove `PlaceholderPage`, `LegacyPartnershipRedirect`, `AdminRoute`, retired page imports, and all nine retired route registrations without redirects in `apps/web/src/App.tsx`
- [X] T026 [P] [US2] Collapse `AppShell` to the current Magic navigation/layout and remove `legacyNavigation`, `LegacyNavItem`, false-branch layout/interaction code, and obsolete imports in `apps/web/src/components/shared/AppShell.tsx`
- [X] T027 [P] [US2] Collapse login to the current page and make direct password, MFA enrollment, and MFA verification completion always navigate to `/dashboard` in `apps/web/src/pages/LoginPage.tsx`, `apps/web/src/pages/MFAPage.tsx`, and `apps/web/src/pages/MFASetupPage.tsx`
- [X] T028 [P] [US2] Collapse entity directory/detail to `MagicPatternEntitiesPage` and `MagicPatternEntityDetailPage`, removing both legacy inline implementations and design props in `apps/web/src/pages/EntitiesPage.tsx` and `apps/web/src/pages/EntityDetail.tsx`
- [X] T029 [P] [US2] Collapse Investment Tracker to `MagicPatternInvestmentTrackerPageContent`, removing the false-branch Coming Soon page and design prop in `apps/web/src/pages/InvestmentTrackerPage.tsx`
- [X] T030 [US2] Remove the design-flag parser/tests and environment entry from `apps/web/src/config/featureFlags.ts`, `apps/web/src/config/featureFlags.test.ts`, and `apps/web/.env.example`; remove remaining active `VITE_MAGIC_PATTERN_DESIGNS`/`magicPatternDesigns` consumers outside historical specs
- [X] T031 [US2] Delete the retired page/test closure after router imports are gone: `apps/web/src/pages/PartnershipTrackerPage.tsx`, `apps/web/src/pages/PartnershipTrackerPage.test.tsx`, `apps/web/src/pages/PartnershipAggregationPage.tsx`, `apps/web/src/pages/UserManagementPage.tsx`, `apps/web/src/pages/UserDetailPage.tsx`, and `apps/web/src/pages/PermissionDeniedPage.tsx`
- [X] T032 [US2] Remove browser user-management-only types and methods after confirming no retained caller in `apps/web/src/auth/authClient.ts` and retarget or delete their sole-purpose assertions under `apps/web/src/auth/` and `apps/web/src/pages/`
- [X] T033 [US2] Recompute production reachability from `apps/web/src/main.tsx` and classify the standalone legacy partnership/aggregation closure under `apps/web/src/features/partnership-tracker/components/`, `apps/web/src/features/partnership-tracker/components/aggregation/`, `apps/web/src/features/partnership-tracker/index.ts`, and `apps/web/src/features/partnership-tracker/__tests__/` in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T034 [US2] Remove the high-confidence `PartnershipTrackerPageContent`/`PartnershipAggregationPageContent`-exclusive sources, barrels, and sole-purpose tests approved by T033 while retaining `apps/web/src/features/partnership-tracker/components/magic-patterns/`, `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx`, current hooks/client code, and any shared current consumer
- [X] T035 [US2] Recompute the complete web graph after T034 and remove only newly unreachable high-confidence components, hooks, clients, types, assets, and sole-purpose tests under `apps/web/src/`; record every retained/deferred second-order candidate in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T036 [US2] Run exact route inventory, retired-path/design-identifier scans, focused current-page suites, web lint/typecheck/test/color checks, and the production build; record DG-LEGACY-DESIGN, DG-RETIRED-BROWSER-ROUTES, and DG-WEB-DEAD-CLOSURE results in `specs/028-prune-unreachable-flows/pruning-manifest.md`

**Checkpoint**: One current browser UI remains, all nine retired routes are unregistered without aliases, and the proven unreachable web closure is gone.

---

## Phase 5: User Story 3 - Remove Unused Backend and Operational Closures Safely (Priority: P2)

**Goal**: Map every API route to a retained flow/system root, remove no-consumer API and operational closures, and preserve shared domain/security/worker code.

**Independent Test**: Review the completed API Consumer Matrix, confirm every retained route has a current consumer and protection policy, confirm every removed route has no web/worker/scheduler/infra/operator consumer, and run retained API/security/worker verification with no migration change.

### Tests for User Story 3

- [X] T037 [P] [US3] Strengthen retained K-1 apply/manual-year/calculation coverage before direct K-1 tracker route removal in `apps/api/tests/k1.apply.integration.test.ts`, `apps/api/tests/partnership-tracker.manual-year.contract.test.ts`, and `apps/api/tests/partnership-tracker.calculation-regression.test.ts`
- [X] T038 [P] [US3] Strengthen retained Plaid scheduler, production-readiness, and protection-control route coverage while isolating direct user-management contracts in `apps/api/tests/plaid.refresh-policy.contract.test.ts`, `apps/api/tests/abuse-protection/protection-controls.contract.test.ts`, and `apps/api/tests/admin.user-detail.contract.test.ts`
- [X] T039 [P] [US3] Add/retarget route-policy coverage assertions for the post-pruning registered modules in `apps/api/tests/abuse-protection/route-policy-coverage.contract.test.ts` without weakening missing-policy startup enforcement

### Implementation for User Story 3

- [X] T040 [US3] Complete web, intra-API, worker, scheduler, Terraform, deployment, documentation, and external-contract consumer decisions for every row in the API Consumer Matrix in `specs/028-prune-unreachable-flows/pruning-manifest.md`; approve removal only for empty high-confidence consumer closures
- [X] T041 [US3] Remove the approved direct `/v1/k1-tracker` registration closure from `apps/api/src/routes/index.ts`, `apps/api/src/modules/k1-tracker/k1-tracker.routes.ts`, and exclusive handler/import code and tests under `apps/api/src/modules/k1-tracker/` and `apps/api/tests/k1-tracker.*`; retain repository/calculation/contract/form code consumed by `apps/api/src/modules/partnership-tracker/` and `apps/api/src/modules/k1/`
- [X] T042 [US3] Remove approved no-consumer user-management route/handler/repository/invitation contracts from `apps/api/src/modules/admin/admin.routes.ts`, `apps/api/src/modules/admin/admin.handlers.ts`, `apps/api/src/modules/admin/user-admin.repository.ts`, `apps/api/src/modules/admin/invitation.repository.ts`, and sole-purpose API tests while retaining Plaid refresh, production readiness, protection controls, Admin guard, and auth/session role behavior
- [X] T043 [US3] Apply all other high-confidence no-consumer API/script decisions across `apps/api/src/modules/`, `apps/api/src/scripts/`, `apps/api/src/workers/`, `apps/api/src/routes/index.ts`, and `apps/api/tests/`; keep uncertain external/dynamic consumers as documented `DEFER` rows and never edit `apps/api/src/infra/db/migrations/`
- [X] T044 [US3] Remove exports and shared contract types used exclusively by approved retired API interfaces from `packages/types/src/`, module barrel files, and `packages/types/src/index.ts` while retaining types consumed by current web, workers, and provider flows
- [X] T045 [US3] Run API build/full tests, retained partnership/K-1/Plaid/report/TIC/dashboard focused suites, worker/scheduler entry scans, runtime audit, route-policy and cost-envelope checks, and migration diff verification; record DG-API-DEAD-CLOSURE outcomes in `specs/028-prune-unreachable-flows/pruning-manifest.md`

**Checkpoint**: Every registered API route has a current product/system consumer or explicit defer decision, every approved dead interface closure is removed, and protected operational/data roots still pass.

---

## Phase 6: User Story 4 - Leave a Smaller, Enforced Product Boundary (Priority: P2)

**Goal**: Add durable route/stale-surface/reachability guards, remove newly unused dependencies/configuration, and publish exact final evidence.

**Independent Test**: Run persistent route and reachability guards, dependency validation, builds/tests/security checks, and diff reconciliation; the guards reject a retired route/design reference, every deletion is manifested, and production files/lines/browser JS are smaller than baseline.

### Tests for User Story 4

- [X] T046 [P] [US4] Add a current-surface governance test that rejects `VITE_MAGIC_PATTERN_DESIGNS`, `magicPatternDesigns`, legacy navigation, retired browser route registration, and retired Link/navigate/href destinations while excluding `/v1` API strings and historical specs in `apps/web/tests/current-surface-governance.spec.ts`
- [X] T047 [P] [US4] Add import-walker resolution and false-positive fixtures for static/type/barrel imports, index files, assets, tests, and dynamic/config exclusions in `scripts/pruning/find-unreachable-web.test.mjs`

### Implementation for User Story 4

- [X] T048 [US4] Implement the dependency-free production reachability walker from `apps/web/src/main.tsx` with explicit test/config/asset/dynamic edge reporting in `scripts/pruning/find-unreachable-web.mjs`
- [X] T049 [US4] Register the current-surface governance, reachability, and Node test commands in root `package.json` and `apps/web/package.json` so CI/local verification can run the retained boundary without a new dependency
- [X] T050 [US4] Audit and remove direct packages, aliases, npm scripts, environment entries, and active documentation made unused by approved deletion groups in `package.json`, `apps/web/package.json`, `apps/api/package.json`, `apps/web/.env.example`, `apps/api/.env.example`, `docs/`, and `infra/`; regenerate `package-lock.json` with npm and retain required Linux optional bindings
- [X] T051 [US4] Run `npm ci`, `npm ls --workspaces --all`, the reachability/current-surface guards, and API/web production builds; record DG-DEPENDENCY-CONFIG package/lock/bundle results in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T052 [US4] Run the full quickstart verification matrix, including Admin/User retained routes, API/web suites, lint/typecheck/color, security audit/route-policy/cost-envelope, Terraform fmt/init/validate when applicable, and `git diff --check`; record actual results in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T053 [US4] Recompute final web/API reachability and classify every remaining/new candidate and registered route as retained, removed, or deferred with no empty evidence rows in `specs/028-prune-unreachable-flows/pruning-manifest.md`
- [X] T054 [US4] Record exact final tracked production file/line/byte counts, direct dependency counts, emitted JS/CSS sizes, deletion-group inventories, intentional contract breaks, and baseline deltas; reconcile every changed/new/deleted path in `specs/028-prune-unreachable-flows/pruning-manifest.md`

**Checkpoint**: The smaller product boundary is continuously enforced and all success criteria have reproducible evidence.

---

## Phase 7: Polish & Cross-Cutting Validation

**Purpose**: Remove stale exports/comments left by grouped deletion and perform the final completion audit.

- [X] T055 Remove stale deleted-surface exports, imports, comments, and active guidance from `apps/web/src/**/index.ts`, `apps/api/src/routes/index.ts`, `packages/types/src/index.ts`, `docs/`, and environment examples without broad rename-only refactors
- [X] T056 Execute `specs/028-prune-unreachable-flows/quickstart.md` end-to-end, confirm zero migration changes and zero unclassified diff paths, mark every Deletion Group/Verification Record final in `specs/028-prune-unreachable-flows/pruning-manifest.md`, and stop if any retained-flow regression remains

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: Starts only after Spec 027 is captured on a clean implementation baseline.
- **Phase 2 - Foundational**: Depends on Phase 1 and blocks all deletion work.
- **Phase 3 - US1**: Depends on Phase 2; must finish before redirect/legacy route deletion.
- **Phase 4 - US2**: Depends on US1 canonical navigation and characterization.
- **Phase 5 - US3**: Depends on US2 so removed web callers cannot falsely keep backend interfaces alive.
- **Phase 6 - US4**: Depends on US2 and US3 final product/API boundaries.
- **Phase 7 - Polish**: Depends on all selected user stories.

### User Story Dependencies

```text
Setup -> Foundation -> US1 -> US2 -> US3 -> US4 -> Polish
                         \            /
                          `----------'
                 retained-flow tests remain gates throughout
```

- **US1 (P1)**: Independently proves the current product and canonical partnership navigation; it does not delete legacy routes.
- **US2 (P1)**: Requires US1 because live redirects must be migrated before removal; independently proves the one-current-UI browser boundary.
- **US3 (P2)**: Requires the US2 web-client graph; independently proves retained API/operational consumers and backend deletions.
- **US4 (P2)**: Requires the final US2/US3 boundaries; independently proves guards, dependency cleanup, and measurable reduction.

### Within Each User Story

- Add or retarget characterization/contract tests before changing their implementation subject.
- Migrate live consumers before deleting redirects, routes, or shared code.
- Record a high-confidence manifest decision before each deletion group.
- Remove route registration before deleting its exclusive implementation closure.
- Recompute reachability and run focused verification after each deletion group.
- Remove dependencies only after all source closures are final.

## Parallel Opportunities

- After T002, baseline web and API command execution can be performed independently, but their results are serialized into the shared manifest in T003-T005.
- US1 test tasks T011-T015 touch separate focused test files and can run in parallel.
- US1 source tasks T017-T019 touch separate retained features and can run in parallel after T016's query contract is fixed.
- US2 test tasks T021-T024 can run in parallel.
- US2 source tasks T026-T029 touch separate page/shell files and can run in parallel after T025 establishes the router boundary.
- US3 test tasks T037-T039 can run in parallel.
- US4 guard test tasks T046-T047 can run in parallel.
- Candidate classification may be parallelized by directory, but all decisions and deletion-group approval are serialized through `pruning-manifest.md`.

## Parallel Example: User Story 1

```text
Task T011: Dashboard/AppShell navigation characterization
Task T012: Investment Tracker query-state characterization
Task T013: K-1 handoff characterization
Task T014: Estate Map handoff characterization
Task T015: Entity handoff and role characterization

After T016:
Task T017: K-1 canonical destination
Task T018: Estate Map canonical destination
Task T019: Entity canonical destination
```

## Parallel Example: User Story 2

```text
Task T021: Exact router contract tests
Task T022: Login/MFA current-only tests
Task T023: Current AppShell tests
Task T024: Current entity/investment page tests

After T025:
Task T026: Collapse AppShell
Task T027: Collapse Login/MFA landing behavior
Task T028: Collapse Entities/Entity Detail
Task T029: Collapse Investment Tracker
```

## Parallel Example: User Story 3

```text
Task T037: Retained K-1/partnership backend coverage
Task T038: Retained admin operational coverage
Task T039: Reduced route-policy coverage
```

## Parallel Example: User Story 4

```text
Task T046: Current-surface governance test
Task T047: Reachability walker test fixtures
```

---

## Implementation Strategy

### Safe MVP: Current Browser Product Only

For this maintenance feature, the smallest useful cleanup increment is Setup + Foundational + US1 + US2:

1. Complete Phase 1 baseline evidence.
2. Complete Phase 2 inventories and protected-root boundary.
3. Complete US1 canonical navigation and retained-flow verification.
4. Complete US2 current-only browser consolidation and web dead-closure removal.
5. **STOP AND VALIDATE** the exact browser contract, full current route matrix, web build, and manifest before touching backend interfaces.

This increment removes the largest duplicate UI surface while leaving backend pruning for a separately reviewable stage.

### Incremental Delivery

1. **Safety baseline**: Phase 1 + Phase 2 establish the audit trail and block speculative deletion.
2. **Current-flow authority**: US1 removes live dependence on legacy destinations.
3. **Browser reduction**: US2 removes the flag, routes, pages, and proven dead web closure.
4. **Backend reduction**: US3 removes only routes/services/types with a complete empty consumer set.
5. **Durable boundary**: US4 adds guards, dependency cleanup, and exact size evidence.
6. **Completion**: Polish validates the quickstart and reconciles every diff path.

### Review Strategy

- Review/commit each Deletion Group separately where repository policy allows.
- Keep canonical-link migrations separate from redirect deletion.
- Keep direct API route removal with its sole-purpose handlers/tests, while retaining shared services in a visibly separate diff.
- Keep lockfile/dependency changes after source removal.
- Treat any newly discovered consumer as a reason to reclassify or restore, not to weaken tests.

## Notes

- `[P]` tasks are parallel only after their phase prerequisites and any explicitly named prior task are complete.
- Historical Specs 024-028 may mention retired flags/routes as evidence; active code/config/docs may not.
- Browser `/partnerships` retirement does not imply API `/v1/partnerships` retirement.
- Shared `k1-tracker` and `partnership-tracker` directory names do not make current calculation/workspace code obsolete.
- No existing SQL migration is edited or deleted.
- A blocked database/provider/Terraform check is recorded as blocked, never passed.
- Completion requires no retained-flow regression, no API route without a consumer/defer decision, and no unclassified diff path.
