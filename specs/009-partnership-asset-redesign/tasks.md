---
description: "Task list for Feature 009 — Partnership Asset Redesign"
---

# Tasks: Partnership Asset Redesign

**Input**: Design documents from `/specs/009-partnership-asset-redesign/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/partnership-assets.openapi.yaml, quickstart.md

**Tests**: Included. The spec defines measurable outcomes, multiple authorization rules, append-only financial-history behavior, and API contracts that should be locked down with contract and integration coverage.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]** = can run in parallel with other `[P]` tasks because the files do not overlap
- **[US#]** = maps to a user story in `spec.md`
- Setup / Foundational / Polish tasks have no user-story label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new asset-specific files and test shells so implementation can proceed without inventing structure midstream.

- [X] T001 [P] Create API module file stubs `apps/api/src/modules/partnerships/assets.handler.ts`, `apps/api/src/modules/partnerships/assets.repository.ts`, `apps/api/src/modules/partnerships/assets.zod.ts`, `apps/api/src/modules/partnerships/assetFmv.handler.ts`, and `apps/api/src/modules/partnerships/assetFmv.repository.ts`
- [X] T002 [P] Create web asset feature file stubs `apps/web/src/features/partnerships/api/assetsClient.ts`, `apps/web/src/features/partnerships/hooks/useAssetQueries.ts`, `apps/web/src/features/partnerships/hooks/useAssetMutations.ts`, `apps/web/src/features/partnerships/components/AssetsSection.tsx`, `apps/web/src/features/partnerships/components/AddAssetDialog.tsx`, `apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx`, `apps/web/src/features/partnerships/components/AssetValuationHistory.tsx`, and `apps/web/src/features/partnerships/components/RecordAssetFmvDialog.tsx`
- [X] T003 [P] Create API test file stubs `apps/api/tests/assets.list.contract.test.ts`, `apps/api/tests/assets.create.contract.test.ts`, `apps/api/tests/asset-detail.contract.test.ts`, `apps/api/tests/asset-fmv.create.contract.test.ts`, `apps/api/tests/asset-fmv.append-only.integration.test.ts`, and `apps/api/tests/partnership-asset-rollup.integration.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Land the schema, shared types, validation, repositories, and route skeletons that all user stories depend on.

**⚠️ CRITICAL**: No user story work should start until this phase is complete.

- [X] T004 Write migration `apps/api/src/infra/db/migrations/009_partnership_assets.sql` to create `partnership_assets` and `partnership_asset_fmv_snapshots` plus lookup indexes from `data-model.md` §4
- [X] T005 [P] Extend `packages/types/src/partnership-management.ts` and `packages/types/src/index.ts` with `PartnershipAssetSource`, `AssetFmvSource`, `PartnershipAssetRow`, `PartnershipAssetsResponse`, `PartnershipAssetDetail`, `AssetFmvSnapshot`, `CreatePartnershipAssetRequest`, and `CreateAssetFmvSnapshotRequest`
- [X] T006 [P] Implement `apps/api/src/modules/partnerships/assets.zod.ts` with request/response schemas that mirror `specs/009-partnership-asset-redesign/contracts/partnership-assets.openapi.yaml`
- [X] T007 [P] Extend `apps/api/src/modules/audit/writeAuditEvent.ts` to accept `partnership.asset.created` and `partnership.asset.fmv_recorded`
- [X] T008 Create `apps/api/src/modules/partnerships/assets.repository.ts` with partnership-scoped helpers for asset listing, asset detail lookup, duplicate detection by normalized name + type, asset creation, optional initial-valuation creation, rollup calculation, and in-memory fallback behavior
- [X] T009 [P] Create `apps/api/src/modules/partnerships/assetFmv.repository.ts` with partnership-scoped helpers for asset valuation history listing, latest-by-`created_at` lookup, append-only snapshot insertion, and in-memory fallback behavior
- [X] T010 Extend `apps/api/src/modules/partnerships/partnerships.routes.ts` with the shared asset-route imports, path parameter validation, and registration scaffolding that later route-wiring tasks (`T017`, `T027`, `T035`) will complete serially
- [X] T011 [P] Implement `apps/web/src/features/partnerships/api/assetsClient.ts` as the typed fetch wrapper for all new partnership-asset and asset-FMV endpoints, including `409 DUPLICATE_PARTNERSHIP_ASSET` handling

**Checkpoint**: Schema, shared types, route skeletons, repositories, and client wrappers are in place; user-story work can begin.

---

## Phase 3: User Story 1 — Review partnership assets in context (Priority: P1) 🎯 MVP

**Goal**: A scoped user opens the existing Partnership Detail page and can review asset rows, asset-rollup summary values, and asset valuation history in a drawer without leaving the partnership workflow.

**Independent Test**: Open a seeded partnership with assets and mixed FMV coverage as a non-Admin user. The page must show the existing Feature 004 context plus the new Assets section, compute the asset rollup correctly, display empty FMV states correctly, and open a drawer with asset metadata and valuation history while keeping the parent page intact.

### Tests for User Story 1

- [X] T012 [P] [US1] Implement contract test `apps/api/tests/assets.list.contract.test.ts` covering `GET /v1/partnerships/:partnershipId/assets` shape, mixed valued/unvalued assets, `null` rollup when no asset has FMV, `403` for out-of-scope partnerships, and `404` for missing partnerships
- [X] T013 [P] [US1] Implement contract test `apps/api/tests/asset-detail.contract.test.ts` covering `GET /v1/partnerships/:partnershipId/assets/:assetId` and `GET /v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots`, including partnership/asset mismatch, `403`, and `404` behavior
- [X] T014 [P] [US1] Implement integration test `apps/api/tests/partnership-asset-rollup.integration.test.ts` to verify `totalLatestAssetFmvUsd` equals the sum of the latest valued snapshot per asset and that whole-partnership FMV remains a separate context
- [X] T015 [P] [US1] Implement component test `apps/web/src/features/partnerships/components/AssetsSection.test.tsx` covering loading, empty, error, partial, populated, permission-limited, no-FMV-yet, mixed-valuation, and `manual | imported | plaid` source-badge states
- [X] T015a [P] [US1] Implement component test `apps/web/src/features/partnerships/components/AssetDetailDrawer.test.tsx` covering localized asset-detail/history failure rendering and retry without collapsing the parent `apps/web/src/pages/PartnershipDetail.tsx` screen

### Implementation for User Story 1

- [X] T016 [US1] Implement `apps/api/src/modules/partnerships/assets.handler.ts` read handlers for `listPartnershipAssets` and `getPartnershipAsset`, including scope checks inherited from the parent partnership and localized `404` behavior when an asset is not under the specified partnership
- [X] T017 [P] [US1] Wire `GET /partnerships/:partnershipId/assets` and `GET /partnerships/:partnershipId/assets/:assetId` in `apps/api/src/modules/partnerships/partnerships.routes.ts`
- [X] T018 [P] [US1] Implement `apps/web/src/features/partnerships/hooks/useAssetQueries.ts` with `usePartnershipAssets(partnershipId)`, `useAssetDetail(partnershipId, assetId)`, and `useAssetFmvHistory(partnershipId, assetId)` using lazy history fetch when the drawer opens
- [X] T019 [P] [US1] Implement `apps/web/src/features/partnerships/components/AssetsSection.tsx` using `SectionCard`, `DataTable`, `EmptyState`, `ErrorState`, and `LoadingState` to render asset rows, rollup summary, source badges for `manual | imported | plaid`, and the no-FMV / mixed-valuation states required by `FR-013`, `FR-028`, and `FR-053`
- [X] T020 [P] [US1] Implement `apps/web/src/features/partnerships/components/AssetValuationHistory.tsx` to render append-only asset FMV history in newest-first order with valuation date, source label, optional confidence label, and note
- [X] T021 [P] [US1] Implement `apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx` to render asset metadata, latest FMV summary, and lazy-loaded valuation history without route changes
- [X] T021a [US1] Implement localized asset detail/history error and retry behavior in `apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx` and `apps/web/src/features/partnerships/components/AssetValuationHistory.tsx` so asset-history failures preserve the rest of `apps/web/src/pages/PartnershipDetail.tsx`
- [X] T022 [US1] Extend `apps/web/src/pages/PartnershipDetail.tsx` to render the Assets section, surface the five required summary metrics for Feature 009, preserve the existing partnership-level FMV context separately, and manage drawer open/close state without breaking existing Feature 004 sections

**Checkpoint**: User Story 1 is independently usable and demonstrates the asset-aware redesign without any Admin write path.

---

## Phase 4: User Story 2 — Admin adds a manual asset to a partnership (Priority: P2)

**Goal**: An Admin can create a manual asset directly from Partnership Detail, optionally attach an initial FMV estimate in the same workflow, and see the new row appear immediately in the Assets section.

**Independent Test**: As an Admin, add one asset without valuation and one with initial valuation. Both must appear immediately in the Assets section; the duplicate-name-plus-type path must return deterministic validation feedback; a non-Admin write attempt must fail with `403`.

### Tests for User Story 2

- [X] T023 [P] [US2] Implement contract test `apps/api/tests/assets.create.contract.test.ts` covering `POST /v1/partnerships/:partnershipId/assets` happy path without initial valuation, required-field validation failures, bad `initialValuation` payload `400`s, Admin-only enforcement, out-of-scope `403`, missing partnership `404`, and duplicate asset `409 DUPLICATE_PARTNERSHIP_ASSET`
- [X] T024 [US2] Extend `apps/api/tests/assets.create.contract.test.ts` with the combined create-plus-initial-valuation path and assertions that both `partnership.asset.created` and `partnership.asset.fmv_recorded` audit events capture reconstructable context including `partnershipId`, `assetId`, actor identity, and valuation details
- [X] T025 [P] [US2] Implement component test `apps/web/src/features/partnerships/components/AddAssetDialog.test.tsx` covering required fields, optional initial-valuation fields, duplicate error rendering, and successful submit reset behavior

### Implementation for User Story 2

- [X] T026 [US2] Implement `createPartnershipAsset` in `apps/api/src/modules/partnerships/assets.handler.ts` with Admin guard, duplicate detection, optional initial-valuation creation, and same-transaction audit-event writes
- [X] T027 [US2] Wire `POST /partnerships/:partnershipId/assets` in `apps/api/src/modules/partnerships/partnerships.routes.ts` with the existing authenticated-session and Admin role guard chain
- [X] T028 [P] [US2] Implement `apps/web/src/features/partnerships/hooks/useAssetMutations.ts` with `useCreatePartnershipAsset(partnershipId)` and invalidate asset list, asset detail, asset history, and parent partnership queries after success
- [X] T029 [P] [US2] Implement `apps/web/src/features/partnerships/components/AddAssetDialog.tsx` with name, asset type, optional description/notes, optional initial valuation, and inline duplicate/validation feedback
- [X] T030 [US2] Integrate the Admin-only Add Asset action into `apps/web/src/features/partnerships/components/AssetsSection.tsx` and `apps/web/src/pages/PartnershipDetail.tsx`, preserving non-Admin read-only behavior

**Checkpoint**: User Story 2 is independently testable and lets Admins create manual assets from the partnership page without affecting read-only users.

---

## Phase 5: User Story 3 — Admin records asset FMV snapshots and reviews valuation history (Priority: P3)

**Goal**: After assets exist, an Admin can add append-only FMV snapshots, same-day corrections remain visible in history, the latest snapshot becomes the displayed FMV, and the partnership-level asset rollup refreshes immediately.

**Independent Test**: As an Admin, record an asset FMV snapshot and then a same-day correction. The drawer history must show both entries, the latest value must reflect the most recently recorded snapshot, and the asset rollup must update on the parent page without navigation.

### Tests for User Story 3

- [X] T031 [P] [US3] Implement contract test `apps/api/tests/asset-fmv.create.contract.test.ts` covering `POST /v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots`, zero allowed, negative rejected, future date rejected, missing or foreign asset `404`, Admin-only enforcement, and scope enforcement
- [X] T032 [P] [US3] Implement integration test `apps/api/tests/asset-fmv.append-only.integration.test.ts` to verify multiple same-day snapshots persist, history ordering is newest-first by `created_at`, and latest-FMV derivation uses the most recently recorded snapshot
- [X] T033 [P] [US3] Implement component test `apps/web/src/features/partnerships/components/RecordAssetFmvDialog.test.tsx` covering client-side validation, submit lifecycle, and successful refresh callback wiring
- [X] T033a [P] [US3] Implement component test `apps/web/src/features/partnerships/components/AssetsSection.record-fmv.test.tsx` covering the Admin-only section-level Record FMV affordance and confirming it stays hidden for non-Admins

### Implementation for User Story 3

- [X] T034 [US3] Implement `apps/api/src/modules/partnerships/assetFmv.handler.ts` with `listAssetFmvSnapshots` and `createAssetFmvSnapshot`, including Admin-only writes, date/amount validation, and append-only audit-event behavior
- [X] T035 [US3] Wire `GET /partnerships/:partnershipId/assets/:assetId/fmv-snapshots` and `POST /partnerships/:partnershipId/assets/:assetId/fmv-snapshots` in `apps/api/src/modules/partnerships/partnerships.routes.ts`
- [X] T036 [P] [US3] Extend `apps/web/src/features/partnerships/hooks/useAssetMutations.ts` with `useRecordAssetFmvSnapshot(partnershipId, assetId)` and invalidate the asset list/detail/history and parent partnership detail on success
- [X] T037 [P] [US3] Implement `apps/web/src/features/partnerships/components/RecordAssetFmvDialog.tsx` with valuation date, amount, source, optional confidence label, and note fields plus inline validation errors
- [X] T038 [US3] Integrate the Record FMV action into `apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx` and `apps/web/src/features/partnerships/components/AssetValuationHistory.tsx` so Admins can record snapshots from the drawer while non-Admins remain read-only
- [X] T038a [US3] Integrate an Admin-only section-level Record FMV action into `apps/web/src/features/partnerships/components/AssetsSection.tsx` so FMV entry is available from both the Assets section and the asset detail/history view

**Checkpoint**: User Story 3 is independently functional and locks down the append-only asset-valuation workflow.

---

## Phase 6: User Story 4 — Future connected-account path remains optional and non-blocking (Priority: P4)

**Goal**: The redesigned page communicates a future connected-account path without blocking manual asset creation or manual FMV entry, and the UI is ready to visually distinguish imported/Plaid-sourced assets and valuations.

**Independent Test**: Open the Assets section with no connected integration configured. The placeholder must be visibly optional/future-facing, manual Admin actions must remain primary, and source badges must support manual/imported/Plaid display states.

### Tests for User Story 4

- [X] T039 [P] [US4] Implement component test `apps/web/src/features/partnerships/components/AssetsSection.connected-placeholder.test.tsx` covering optional placeholder copy, placement, and uninterrupted manual add-asset / record-FMV access

### Implementation for User Story 4

- [X] T040 [US4] Extend `apps/web/src/features/partnerships/components/AssetsSection.tsx` to render a non-blocking future Link Account / connected-source placeholder that remains clearly optional and does not displace manual Add Asset behavior
- [X] T041 [US4] Extend `apps/web/src/features/partnerships/components/AssetsSection.tsx` and `apps/web/src/pages/PartnershipDetail.tsx` so the optional placeholder can be shown or hidden without displacing the primary manual actions on desktop or narrow viewports

**Checkpoint**: User Story 4 is complete when the future-facing connected path is visible but never blocks the manual path.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T042 [P] Extend `apps/api/src/infra/db/seed/004_partnership_fixtures.ts` with fixtures covering no-assets, mixed-valued assets, same-day asset-FMV corrections, and a partnership where whole-partnership FMV differs from asset rollup
- [X] T043 [P] Update `docs/ui/40-screen-map.md` and `docs/ui/46-component-catalog.md` to document the redesigned Partnership Detail composition, Assets section, and asset drawer behavior
- [X] T044 [P] Add responsive-verification notes to `specs/009-partnership-asset-redesign/quickstart.md` for narrow-viewport validation of `apps/web/src/pages/PartnershipDetail.tsx`, `apps/web/src/features/partnerships/components/AssetsSection.tsx`, and `apps/web/src/features/partnerships/components/AssetDetailDrawer.tsx`
- [X] T044a [P] Add performance-smoke notes to `specs/009-partnership-asset-redesign/quickstart.md` for `GET /v1/partnerships/:partnershipId/assets` and `GET /v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots` against the plan targets
- [ ] T045 Run the walkthrough in `specs/009-partnership-asset-redesign/quickstart.md` and verify SC-001 through SC-008 against the implemented feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories
- **User Stories (Phases 3-6)**: All depend on Foundational completion
- **Polish (Phase 7)**: Depends on the user stories selected for delivery

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Foundational; this is the MVP slice
- **US2 (P2)**: Depends on Foundational and builds on the asset read path from US1
- **US3 (P3)**: Depends on Foundational and the asset detail/drawer path from US1; integrates with US2's mutation invalidation but remains independently testable
- **US4 (P4)**: Depends on Foundational and layers onto the US1 Assets section UI without blocking US1-US3 delivery

### Within Each User Story

- Tests should be written and failing before implementation work in that story
- Repository and handler work comes before route wiring
- Hooks and clients come before page-level integration
- Section/dialog components come before `PartnershipDetail.tsx` integration

### Parallel Opportunities

- Phase 1 tasks T001-T003 can run in parallel
- In Phase 2, T005-T007 and T011 can run in parallel after T004 starts; T008 and T009 can run in parallel once the migration and types are clear; T010 stays serial because later route tasks depend on it
- In US1, T012-T015a can run in parallel, then T017-T021 can run in parallel before T021a and T022 integrate the shared page behavior
- In US2, T023 and T025 can run in parallel; T024 stays serial with T023 because both edit `apps/api/tests/assets.create.contract.test.ts`; T028 and T029 can run in parallel after T026-T027 establish the write path
- In US3, T031-T033a can run in parallel; T036 and T037 can run in parallel after T034-T035 establish the API behavior; T038 and T038a serialize on shared UI integration files
- Phase 7 tasks T042-T044a can run in parallel after the chosen stories are complete; T045 should run after T042, T044, and T044a as the final verification step

---

## Implementation Strategy

### MVP First

1. Complete Setup
2. Complete Foundational work
3. Deliver US1 only for the read-path MVP, including baseline imported/Plaid display states and localized drawer retry behavior
4. Validate the redesigned Partnership Detail read experience independently

### Incremental Delivery

1. Add US1 for the read-only redesign
2. Add US2 for Admin asset creation
3. Add US3 for append-only asset FMV workflows
4. Add US4 for the non-blocking future connected-account placeholder after the baseline display states already exist

### Team Parallelization

With multiple developers:

1. Complete Foundational work together
2. One developer takes API read paths and rollup tests
3. One developer takes web Assets section + drawer read experience
4. One developer takes Admin dialogs + mutation hooks after the read path stabilizes

---

## Notes

- `[P]` tasks are intentionally separated by file to reduce merge conflicts
- `apps/api/src/modules/partnerships/partnerships.routes.ts` and `apps/web/src/pages/PartnershipDetail.tsx` are shared integration points and should be edited serially
- Keep whole-partnership FMV and asset rollup values visibly separate throughout implementation
- Do not introduce a standalone asset route or asset workspace in v1