---
description: "Task list for Feature 004 — Partnership Management"
---

# Tasks: Partnership Management

**Input**: Design documents from `/specs/004-partnership-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/partnership-management.openapi.yaml ✅, quickstart.md ✅

**Tests**: Included. The spec defines nine measurable success criteria and the inherited system conventions (Features 001–003) require traceable, auditable mutations — contract + integration tests are treated as required, not optional.

**Organization**: Tasks are grouped by user story (US1 P1, US2 P2, US3 P3, US4 P4, US5 P5). Each story is independently testable per `spec.md` acceptance scenarios.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]** = different file, no dependency on another in-flight task
- **[US#]** = maps to a user story; Setup / Foundational / Polish tasks have no story label
- All paths are repository-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Land the module skeletons and shared types folder before any feature code is written.

- [X] T001 [P] Create API module skeleton folder `apps/api/src/modules/partnerships/` (empty `.gitkeep`)
- [X] T002 [P] Create web feature folder skeleton `apps/web/src/features/partnerships/` with `api/`, `hooks/`, `components/` subfolders (empty `.gitkeep` in each)
- [X] T003 [P] Add shared types file stub `packages/types/src/partnership-management.ts` (empty exports) and re-export from `packages/types/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, shared wire types, scope plugin, audit event registration, and repository skeleton that every user story depends on.

**⚠️ CRITICAL**: No user story work can start until this phase is complete.

- [X] T004 Write migration `apps/api/src/infra/db/migrations/004_partnership_management.sql` — drops `partnership_fmv_snapshots_partnership_id_valuation_date_key` unique constraint; adds `partnerships_status_check` CHECK constraint pinning status to `ACTIVE|PENDING|LIQUIDATED|CLOSED`; adds indexes `partnership_fmv_snapshots_partnership_created_idx`, `partnerships_entity_name_idx`, `k1_reported_distributions_partnership_year_idx` (all per `specs/004-partnership-management/data-model.md` §4)
- [X] T005 [P] Fill `packages/types/src/partnership-management.ts` with wire types from `data-model.md` §3 (`PartnershipStatus`, `FmvSource`, `EntitySummary`, `Partnership`, `PartnershipDirectoryRow`, `PartnershipDirectoryResponse`, `PartnershipDetail`, `EntityDetail`, `FmvSnapshot`, `CreatePartnershipRequest`, `UpdatePartnershipRequest`, `CreateFmvSnapshotRequest`) and re-export from `packages/types/src/index.ts`
- [X] T006 [P] Create `apps/api/src/modules/partnerships/partnerships.zod.ts` with Zod schemas mirroring `contracts/partnership-management.openapi.yaml` (list query params, create / update / fmv-create request bodies, response envelopes)
- [X] T007 [P] Extend `apps/api/src/modules/audit/writeAuditEvent.ts` to accept the new event names defined in `data-model.md` §2.3 (`partnership.created`, `partnership.updated`, `partnership.fmv_recorded`) while preserving same-transaction semantics
- [X] T008 [P] Create `apps/api/src/modules/partnerships/partnershipScope.plugin.ts` Fastify plugin that loads the caller's `entity_memberships` onto `req.partnershipScope` and returns `403 { error: 'FORBIDDEN_ENTITY' }` when a requested `entityId` or a partnership's `entity_id` is not in scope; Admins bypass the join (mirrors `apps/api/src/modules/k1/k1Scope.plugin.ts`)
- [X] T009 Create `apps/api/src/modules/partnerships/partnerships.repository.ts` with entity-scope-aware queries: `listPartnerships(filters, scope, page)` (single CTE per Decision 2 of research.md), `getTotals(filters, scope)`, `getPartnershipById(id, scope)`, `getPartnershipDetail(id, scope)`, `findByEntityAndName(entityId, name)` (for 409 check), `insertPartnership(row, actor)`, `updatePartnership(id, patch, actor)`, `listForExport(filters, scope)` — each write helper runs inside a transaction that also writes the audit event
- [X] T010 [P] Create `apps/api/src/modules/partnerships/entities.repository.ts` with `getEntityDetail(entityId, scope)` returning the shape in `data-model.md` §3.4 (entity row + scoped partnerships rows reusing `listPartnerships` CTE + rollup totals)
- [X] T011 [P] Create `apps/api/src/modules/partnerships/fmv.repository.ts` with `listFmvSnapshots(partnershipId, scope)` (ordered `created_at DESC, valuation_date DESC, id DESC`) and `insertFmvSnapshot(partnershipId, payload, actor)` (single transaction writes snapshot + `partnership.fmv_recorded` audit event, including prior-latest snapshot in `before_json`)
- [X] T012 Create `apps/api/src/modules/partnerships/partnerships.routes.ts` as an empty registration skeleton (`registerPartnershipRoutes(app)`) and mount it from `apps/api/src/routes/index.ts` under `/v1` (so full paths are `/v1/partnerships`, `/v1/partnerships/:id`, `/v1/partnerships/:id/fmv-snapshots`, `/v1/entities/:id`)
- [X] T013 [P] Create `apps/web/src/features/partnerships/api/partnershipsClient.ts` typed fetch wrapper over `/v1/partnerships/*` — returns `ApiError` on non-2xx and preserves the `409 DUPLICATE_PARTNERSHIP_NAME` body shape
- [X] T014 [P] Create `apps/web/src/features/partnerships/api/entitiesClient.ts` typed fetch wrapper over `/v1/entities/:id`
- [X] T015 [P] Create `apps/web/src/features/partnerships/api/fmvClient.ts` typed fetch wrapper over `/v1/partnerships/:id/fmv-snapshots` (GET list, POST create)

**Checkpoint**: Migration in place, shared types shipped, scope plugin and audit writer extended, repositories ready, routes mounted as a skeleton. User stories may now proceed.

---

## Phase 3: User Story 1 — Browse and filter the Partnership Directory (Priority: P1) 🎯 MVP

**Goal**: A non-Admin user signs in and lands on `/partnerships`. They see a three-card KPI strip (Total Partnerships, Total Distributions, Total FMV), a filterable sortable table of every partnership in their entity scope, and an Export-to-CSV secondary action. KPIs recompute in lockstep with every filter change.

**Independent Test**: With seeded partnerships across multiple entities and statuses, load `/partnerships` as a scoped user, observe three KPI cards summing per-row values, verify KPIs change on every filter interaction (search / entity / asset class / status), verify "Add Partnership" button is hidden, click Export and confirm the CSV mirrors the filtered rows (spec §US1 + FR-001..017, FR-061).

### Tests for User Story 1

- [X] T016 [P] [US1] Contract test `apps/api/tests/partnerships.list.contract.test.ts` — asserts `GET /v1/partnerships` shape (rows + totals + page), default sort `name ASC` with `id ASC` tiebreaker, pagination envelope, all four filter params accepted, unknown `sort` values → 400; schema matches `contracts/partnership-management.openapi.yaml`
- [X] T017 [P] [US1] Integration test `apps/api/tests/partnerships.authz.integration.test.ts` — user with no `entity_memberships` receives empty `rows` and zeroed `totals`; user scoped to entity A cannot see entity B's partnerships; requesting `?entityId=<B>` when B is out of scope returns `403 FORBIDDEN_ENTITY` (not 404); Admin sees all entities
- [X] T018 [P] [US1] Integration test `apps/api/tests/partnerships.kpi-derivation.integration.test.ts` — seeds a partnership with a finalized K-1 for 2024 ($42k) + a 2024-12-31 FMV snapshot ($250k) and another partnership with no K-1 and no FMV; asserts list row values and that `totals.totalDistributionsUsd`, `totals.totalFmvUsd` sum only non-null values
- [X] T019 [P] [US1] Contract test `apps/api/tests/partnerships.export.contract.test.ts` — `GET /v1/partnerships/export.csv` returns `text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="partnerships-*.csv"`, row count matches filter, columns match FR-006 (Partnership Name, Entity, Asset Class, Latest K-1 Year, Distribution, FMV, Status) + export action per FR-002, entity-scope 403, 413 when cap exceeded

### Implementation for User Story 1

- [X] T020 [P] [US1] Implement `apps/api/src/modules/partnerships/partnerships.handler.ts` with `listPartnerships` handler — Zod-validate query, call `repository.listPartnerships` + `repository.getTotals` (single transaction / consistent snapshot), map to `PartnershipDirectoryResponse`, 403 on out-of-scope `entityId`
- [X] T021 [P] [US1] Implement `apps/api/src/modules/partnerships/partnerships.export.ts` — streams CSV with columns Partnership Name, Entity, Asset Class, Latest K-1 Year, Distribution (USD), FMV (USD), Status; UTF-8 BOM; 5 000-row cap → 413; reuses `repository.listForExport`
- [X] T022 [US1] Wire `GET /v1/partnerships` and `GET /v1/partnerships/export.csv` into `apps/api/src/modules/partnerships/partnerships.routes.ts` with Zod validation and the `partnershipScope.plugin.ts` preHandler
- [X] T023 [P] [US1] Implement `apps/web/src/features/partnerships/hooks/usePartnershipQueries.ts` with `usePartnershipList(filters)` — `useQuery(['partnerships-list', filters])`, 200 ms debounce on `search`, syncs filter state to URL query string, no polling
- [X] T024 [P] [US1] Implement `apps/web/src/features/partnerships/hooks/usePartnershipExport.ts` — builds the URL from current filters and triggers browser download via a transient `<a download>` element
- [X] T025 [P] [US1] Implement `apps/web/src/features/partnerships/components/PartnershipKpiStrip.tsx` composing catalog `KpiCard` x3 (Total Partnerships, Total Distributions, Total FMV) driven by `totals` from the list response
- [X] T026 [P] [US1] Implement `apps/web/src/features/partnerships/components/PartnershipFilters.tsx` composing catalog `FilterToolbar` (search, Entity, Asset Class, Status, Clear all, result count); default Status filter set shows all four statuses (FR-005, Clarification Q5)
- [X] T027 [P] [US1] Implement `apps/web/src/features/partnerships/components/PartnershipDirectoryTable.tsx` composing catalog `DataTable` + `StatusBadge`; columns per FR-006; default sort `name ASC`; sticky header; row click navigates to `/partnerships/:id`; Latest K-1 Year / Distribution / FMV render `—` when null
- [X] T028 [US1] Create `apps/web/src/pages/PartnershipDirectory.tsx` composing `PageHeader` (title "Partnerships"; primary "Add Partnership" hidden for non-Admin via the existing session role check; secondary "Export" wired to `usePartnershipExport`) + `PartnershipKpiStrip` + `PartnershipFilters` + `PartnershipDirectoryTable`; adds `EmptyState`, `FilteredEmptyState`, `ErrorState`, `LoadingState` for all six screen states (UI Constitution §4)
- [X] T029 [US1] Register the `/partnerships` route in `apps/web/src/App.tsx` pointing at `PartnershipDirectory` and add a nav entry to the existing `AppShell` side nav

**Checkpoint**: US1 fully functional — Directory loads, KPIs recompute in lockstep with filters, table sorts/filters/paginates, CSV export downloads, non-Admin role correctly hides the Add action, out-of-scope ids return 403.

---

## Phase 4: User Story 2 — Open a partnership and review its history (Priority: P2)

**Goal**: From the Directory, a user clicks a row and lands on `/partnerships/:id`. The page renders a four-card KPI strip plus five detail sections (K-1 History, Expected Distribution History, FMV Snapshots, Notes, Activity Detail Preview) and offers navigation back to the K-1 Review Workspace.

**Independent Test**: Open a seeded partnership as a scoped user; KPIs match the Directory row; K-1 History lists every `k1_documents` row for the partnership with a link to `/k1/:id/review`; FMV Snapshots ordered `created_at DESC`; no "Edit" / "Record FMV" buttons for non-Admin (spec §US2, FR-020..026).

### Tests for User Story 2

- [X] T030 [P] [US2] Contract test `apps/api/tests/partnerships.detail.contract.test.ts` — asserts `GET /v1/partnerships/:id` shape including all five section arrays, correct FMV ordering (`created_at DESC, valuation_date DESC`), 403 on out-of-scope id (not 404), 404 only on non-existent id within scope

### Implementation for User Story 2

- [X] T031 [US2] Add `getPartnershipDetail` handler to `apps/api/src/modules/partnerships/partnerships.handler.ts` — calls `repository.getPartnershipDetail(id, scope)` which composes in one request: partnership row, KPI aggregates, `k1_documents` history, `partnership_annual_activity` history, `partnership_fmv_snapshots` list
- [X] T032 [US2] Register `GET /v1/partnerships/:id` in `apps/api/src/modules/partnerships/partnerships.routes.ts` with Zod uuid validation and scope preHandler
- [X] T033 [P] [US2] Add `usePartnershipDetail(id)` hook to `apps/web/src/features/partnerships/hooks/usePartnershipQueries.ts` — `useQuery(['partnership', id])`
- [X] T034 [P] [US2] Implement `apps/web/src/features/partnerships/components/K1HistorySection.tsx` composing catalog `SectionCard` + `DataTable`; row click navigates to `/k1/:k1DocumentId/review` (Feature 003 route)
- [X] T035 [P] [US2] Implement `apps/web/src/features/partnerships/components/ExpectedDistributionSection.tsx` composing `SectionCard` + `DataTable` (read-only; no inline editing per FR-025)
- [X] T036 [P] [US2] Implement `apps/web/src/features/partnerships/components/FmvSnapshotsSection.tsx` composing `SectionCard` + `DataTable`; rows ordered newest-first; no edit/delete affordance; "Record FMV" button slot visible only to Admin (wired in US5)
- [X] T037 [P] [US2] Implement `apps/web/src/features/partnerships/components/ActivityDetailPreview.tsx` composing `SectionCard` with a static "Detail feed coming with Feature 005" placeholder per FR-022
- [X] T038 [US2] Create `apps/web/src/pages/PartnershipDetail.tsx` composing `PageHeader` (title = partnership name, back-link to Directory, primary "Edit Partnership" slot hidden for non-Admin) + four-card KPI strip reusing `KpiCard` + `K1HistorySection` + `ExpectedDistributionSection` + `FmvSnapshotsSection` + a Notes `SectionCard` + `ActivityDetailPreview`; supports all six screen states
- [X] T039 [US2] Register the `/partnerships/:id` route in `apps/web/src/App.tsx` pointing at `PartnershipDetail`

**Checkpoint**: US2 fully functional — row-click navigation, detail page renders all five sections with correct ordering and scope enforcement; still no write paths.

---

## Phase 5: User Story 3 — Open an entity and see partnerships underneath it (Priority: P3)

**Goal**: From the Directory or the Partnership Detail breadcrumb, a user clicks an entity link and lands on `/entities/:id`. The page renders entity header, rollup KPIs, and the scoped list of partnerships under that entity.

**Independent Test**: As a scoped user, open `/entities/:id` for an entity with two scoped partnerships; rollup equals the sum of their Directory values; out-of-scope entity id returns 403 (spec §US3, FR-040..044).

### Tests for User Story 3

- [X] T040 [P] [US3] Contract test `apps/api/tests/entities.detail.contract.test.ts` — asserts `GET /v1/entities/:id` shape (entity + partnerships[] + rollup), rollup equals sum over scoped partnerships, 403 on out-of-scope id, 404 on non-existent id within scope

### Implementation for User Story 3

- [X] T041 [P] [US3] Implement `apps/api/src/modules/partnerships/entities.handler.ts` — calls `entities.repository.getEntityDetail(id, scope)`
- [X] T042 [US3] Register `GET /v1/entities/:id` in `apps/api/src/modules/partnerships/partnerships.routes.ts` with Zod uuid validation and scope preHandler
- [X] T043 [P] [US3] Implement `apps/web/src/features/partnerships/hooks/useEntityQueries.ts` with `useEntityDetail(id)` — `useQuery(['entity', id])`
- [X] T043a [P] [US3] Implement `apps/web/src/features/partnerships/components/EntityReportsPreviewSection.tsx` composing catalog `SectionCard` with a static list of placeholder links to future Spec 006 report routes (FR-043); renders "Reports (coming with Feature 006)" until Spec 006 ships
- [X] T044 [US3] Create `apps/web/src/pages/EntityDetail.tsx` composing `PageHeader` (title = entity name, secondary link back to Directory) + rollup `KpiCard` x4 (Partnerships Count, Total Distributions, Total FMV, Latest K-1 Year) + embedded `PartnershipDirectoryTable` bound to `entity.partnerships` (reused, not re-implemented) + `EntityReportsPreviewSection`; supports all six screen states
- [X] T045 [US3] Register the `/entities/:id` route in `apps/web/src/App.tsx`; wire the entity name in `PartnershipDirectoryTable` (US1) and `PartnershipDetail` breadcrumb (US2) as clickable links to `/entities/:id`

**Checkpoint**: US3 fully functional — entity page renders with rollup and scoped partnerships; navigation in and out works from both the Directory and the Partnership Detail breadcrumb.

---

## Phase 6: User Story 4 — Admin adds a new partnership (Priority: P4)

**Goal**: An Admin clicks "Add Partnership" from the Directory, fills Entity / Name / Asset Class / Status / Notes, and submits. The new row appears in the Directory, a `partnership.created` audit event is written, and attempts to reuse the same `(entityId, name)` return a friendly 409 with an inline validation message.

**Independent Test**: As Admin, add a partnership under a scoped entity → row visible, KPIs updated, audit event present. Resubmit the same `(entity, name)` → inline 409. As non-Admin, attempting the same POST directly returns 403 (spec §US4, FR-062..064, Clarification Q4).

### Tests for User Story 4

- [X] T046 [P] [US4] Contract test `apps/api/tests/partnerships.create.contract.test.ts` — asserts `POST /v1/partnerships` 201 happy path + `partnership.created` audit row in same transaction; 400 on Zod failure; 403 when caller is non-Admin (`FORBIDDEN_ROLE`); 403 when target `entityId` is out of scope (`FORBIDDEN_ENTITY`); 409 on `(entityId, lower(name))` conflict (`DUPLICATE_PARTNERSHIP_NAME`)
- [X] T047 [P] [US4] Contract test `apps/api/tests/partnerships.update.contract.test.ts` — asserts `PATCH /v1/partnerships/:id` accepts any subset of `name|asset_class|notes|status`, 400 on empty body or unknown keys, 403 on non-Admin and out-of-scope, 409 on rename collision, emits `partnership.updated` audit with `before_json` carrying the full prior row

### Implementation for User Story 4

- [X] T048 [P] [US4] Add `createPartnership` handler to `apps/api/src/modules/partnerships/partnerships.handler.ts` — Zod-validate body, role-guard Admin, verify `entityId` in scope, pre-check `findByEntityAndName` → 409, otherwise insert partnership + audit event in one transaction, return 201
- [X] T049 [P] [US4] Add `updatePartnership` handler to `apps/api/src/modules/partnerships/partnerships.handler.ts` — Zod-validate patch, role-guard Admin, scope-guard, fetch prior row, on `name` change re-check conflict → 409, otherwise update + audit event in one transaction; free status transitions per Clarification Q4
- [X] T050 [US4] Wire `POST /v1/partnerships` and `PATCH /v1/partnerships/:id` into `apps/api/src/modules/partnerships/partnerships.routes.ts` with Zod guards and the `requireAdmin` guard from `apps/api/src/modules/admin/` (Decision 9)
- [X] T051 [P] [US4] Implement `apps/web/src/features/partnerships/hooks/usePartnershipMutations.ts` with `useCreatePartnership()` and `useUpdatePartnership()` — `useMutation` invalidates `['partnerships-list']`, `['partnership', id]`, and affected `['entity', entityId]`; surfaces 409 as a discriminated `{ kind: 'duplicate-name' }` result so the dialog can render an inline field error
- [X] T052 [P] [US4] Implement `apps/web/src/features/partnerships/components/AddPartnershipDialog.tsx` using Headless UI `Dialog` (UI Constitution §1) — fields Entity (scoped dropdown), Name, Asset Class, Status (default ACTIVE), Notes; client-side trim + length guards mirror server; inline 409 error on Name field
- [X] T053 [P] [US4] Implement `apps/web/src/features/partnerships/components/EditPartnershipDialog.tsx` — same shape minus Entity (entity_id is immutable per Clarification Q4 + FR-062; editable fields: name, asset_class, notes, status); prefills from `PartnershipDetail`
- [X] T054 [US4] Surface the "Add Partnership" primary action in `apps/web/src/pages/PartnershipDirectory.tsx` (Admin-only) wired to `AddPartnershipDialog`; on success close dialog and rely on query invalidation to reveal the new row
- [X] T055 [US4] Surface the "Edit Partnership" primary action in `apps/web/src/pages/PartnershipDetail.tsx` (Admin-only) wired to `EditPartnershipDialog`; on success close dialog and let query invalidation refresh KPIs / row values

**Checkpoint**: US4 fully functional — Admin-only create + update with audit events, conflict handling, and role / scope guards on both client and server.

---

## Phase 7: User Story 5 — Admin records an FMV snapshot (Priority: P5)

**Goal**: An Admin clicks "Record FMV" on Partnership Detail, fills as-of date / amount / source / note, and submits. The snapshot is append-only: multiple snapshots per as-of date are legal, no edit or delete path exists, "Latest FMV" = newest by `created_at`, and a `partnership.fmv_recorded` audit event is written with the previous latest captured in `before_json`.

**Independent Test**: As Admin, record a snapshot → newest row at top, Latest FMV KPI reflects the new amount; record another snapshot with the same as-of date → both rows appear, Latest FMV reflects the most recent by `created_at`; non-Admin POST returns 403; zero amount rejected unless partnership status is LIQUIDATED (spec §US5, FR-024, Clarification Q3).

### Tests for User Story 5

- [X] T056 [P] [US5] Contract test `apps/api/tests/fmv.list.contract.test.ts` — asserts `GET /v1/partnerships/:id/fmv-snapshots` returns rows ordered `created_at DESC, valuation_date DESC, id DESC`; 403 on out-of-scope partnership; no PATCH or DELETE verbs exposed (OPTIONS check)
- [X] T057 [P] [US5] Contract test `apps/api/tests/fmv.create.contract.test.ts` — asserts `POST /v1/partnerships/:id/fmv-snapshots` 201 happy path + `partnership.fmv_recorded` audit row in same transaction with prior-latest in `before_json`; 400 on negative amount; 400 on zero amount when status != LIQUIDATED; 400 on future `asOfDate`; 403 on non-Admin; 403 on out-of-scope partnership
- [X] T058 [P] [US5] Integration test `apps/api/tests/fmv.append-only.integration.test.ts` — inserts three snapshots for the same `(partnership_id, valuation_date)` at different `created_at`; asserts all three persist (no unique violation); asserts "Latest FMV" query returns the one with greatest `created_at`; asserts detail endpoint FMV list order matches

### Implementation for User Story 5

- [X] T059 [P] [US5] Implement `apps/api/src/modules/partnerships/fmv.handler.ts` — `listFmvSnapshots` (delegates to repo; scope-guarded) and `createFmvSnapshot` (Zod + role + scope guards, zero-allowed-only-for-LIQUIDATED check, future-date reject, single-transaction insert + audit with prior-latest in `before_json`)
- [X] T060 [US5] Wire `GET /v1/partnerships/:id/fmv-snapshots` and `POST /v1/partnerships/:id/fmv-snapshots` into `apps/api/src/modules/partnerships/partnerships.routes.ts` with Zod guards; POST uses `requireAdmin`
- [X] T061 [P] [US5] Implement `apps/web/src/features/partnerships/hooks/useFmvMutations.ts` with `useRecordFmvSnapshot(partnershipId)` — `useMutation` invalidates `['partnership', id]` and `['partnerships-list']` on success
- [X] T062 [P] [US5] Implement `apps/web/src/features/partnerships/components/RecordFmvDialog.tsx` using Headless UI `Dialog` — fields As-of Date (date picker, no future dates), Amount (numeric, positive; warns instead of blocks when status is LIQUIDATED and amount is 0), Source (dropdown of four enum values), Note; inline server-error surface
- [X] T063 [US5] Surface the Admin-only "Record FMV" action inside `FmvSnapshotsSection.tsx` (US2) wired to `RecordFmvDialog`; on success close dialog and rely on query invalidation so the new row appears at the top and the Latest FMV KPI refreshes

**Checkpoint**: US5 fully functional — append-only FMV writes, correct ordering, audit events, role and scope enforcement, no edit/delete exposed.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T064 [P] Seed script `apps/api/src/infra/db/seed/004_partnership_fixtures.ts` — creates ~50 partnerships across 3 entities with varied statuses, optional finalized K-1s, and varied FMV snapshot counts (including one partnership with three same-day snapshots to exercise append-only). Run via `npx tsx src/infra/db/seed/004_partnership_fixtures.ts` from `apps/api`.
- [X] T065 [P] CI grep guard `scripts/ci/guard-partnerships-imports.mjs` — fails the build if any file under `apps/web/src/pages/PartnershipDirectory.tsx`, `apps/web/src/pages/PartnershipDetail.tsx`, `apps/web/src/pages/EntityDetail.tsx`, or `apps/web/src/features/partnerships/**` imports from `@mui/*` (UI Constitution §1, §10). Wire into CI via `node scripts/ci/guard-partnerships-imports.mjs`.
- [X] T066 [P] Update `docs/ui/40-screen-map.md` (§Composition notes — Partnership Directory / Partnership Detail / Entity Detail) and `docs/ui/46-component-catalog.md` (§Screen compositions) to document the catalog-only composition for Screens #9 / #10 / #11.
- [X] T067 Run `specs/004-partnership-management/quickstart.md` steps 1–9 manually and confirm all nine success criteria (SC-001..009) plus the audit-event spot-checks in steps 6 and 7.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no prereqs
- **Foundational (Phase 2)** → requires Phase 1; BLOCKS every user story
- **User Stories (Phases 3–7)** → all require Phase 2 complete
  - US1 has no code dependency on US2–US5; is the MVP slice
  - US2 depends only on Phase 2 but reuses the list CTE shape from US1's repo work (already delivered in T009)
  - US3 depends on Phase 2 and reuses `PartnershipDirectoryTable` from US1 (T027) — schedule after US1 or stub the table to avoid coupling
  - US4 depends on Phase 2; touches shared file `partnerships.routes.ts` (serialized against US1 / US2 / US5 route edits)
  - US5 depends on US2 (shares `FmvSnapshotsSection.tsx`) and Phase 2; touches shared file `partnerships.routes.ts`
- **Polish (Phase 8)** → after all user stories in scope are complete

### Within-Story Ordering

- Tests before implementation within a story (traceability; tests establish the contract)
- Handlers depend on `partnerships.repository.ts` (T009), `entities.repository.ts` (T010), `fmv.repository.ts` (T011), and `partnershipScope.plugin.ts` (T008)
- Web components depend on hooks (`usePartnershipQueries`, `useEntityQueries`, `usePartnershipMutations`, `useFmvMutations`, `usePartnershipExport`)
- Page components (`PartnershipDirectory.tsx`, `PartnershipDetail.tsx`, `EntityDetail.tsx`) compose everything else; their touching tasks (T028, T038, T044, T054, T055, T063) run last in each story
- Route registration in `App.tsx` (T029, T039, T045) happens after its page component exists
- `partnerships.routes.ts` (T012 skeleton, then T022, T032, T042, T050, T060) is edited serially across stories; stagger across stories or coordinate patches

### Parallel Opportunities

- Phase 1: T001 / T002 / T003 in parallel
- Phase 2: T005 / T006 / T007 / T008 / T010 / T011 / T013 / T014 / T015 in parallel; T004 first (migration); T009 after T008; T012 after T009–T011
- US1 tests T016 / T017 / T018 / T019 in parallel; implementation T020 / T021 in parallel, then T022; T023 / T024 / T025 / T026 / T027 in parallel, then T028 and T029 serialize
- US2 after T030; T033 / T034 / T035 / T036 / T037 in parallel; then T038 / T039
- US3 T043 parallel with T041; then T044 / T045 serialize on App.tsx
- US4 tests T046 / T047 in parallel; T048 / T049 in parallel (same file — coordinate exports); T051 / T052 / T053 in parallel; T054 / T055 serialize per page
- US5 tests T056 / T057 / T058 in parallel; T061 / T062 in parallel; T063 serializes on `FmvSnapshotsSection.tsx`

### Parallel Example (US1 implementation)

```text
# After T022 wires routes, kick off concurrently:
T023 usePartnershipQueries.ts
T024 usePartnershipExport.ts
T025 PartnershipKpiStrip.tsx
T026 PartnershipFilters.tsx
T027 PartnershipDirectoryTable.tsx
# Then serialize:
T028 PartnershipDirectory.tsx
T029 App.tsx route registration
```

---

## Implementation Strategy

- **MVP = US1 only** — Directory + KPI strip + Export. Everything else is additive.
- **Second increment** = US2 (Partnership Detail) + US3 (Entity Detail) — read-only depth; same data stack as US1.
- **Third increment** = US4 (Admin create/edit) + US5 (Admin FMV). Unlocks the full write surface.
- Each increment is independently shippable; user stories do not share mutation paths except via `partnerships.routes.ts` registration order.

## Format Validation

All 67 tasks above follow the required format: `- [ ] T### [P?] [US?] Description with file path`. Setup / Foundational / Polish tasks carry no `[US#]` label; every Phase 3–7 task carries its story label.
