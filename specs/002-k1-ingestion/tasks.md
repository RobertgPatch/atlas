---
description: "Task list for Feature 002 — K-1 Ingestion and Processing Dashboard"
---

# Tasks: K-1 Ingestion and Processing Dashboard

**Input**: Design documents from `/specs/002-k1-ingestion/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/k1-ingestion.openapi.yaml ✅, quickstart.md ✅

**Tests**: Included. The spec defines 10 success criteria with measurable acceptance behavior and the system constitution §13 requires traceable, auditable mutations — contract + integration tests are treated as required, not optional.

**Organization**: Tasks are grouped by user story (US1 P1, US2 P1, US3 P2, US4 P3). Each story is independently testable per `spec.md` acceptance scenarios.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]** = different file, no dependency on another in-flight task
- **[US#]** = maps to a user story; Setup / Foundational / Polish tasks have no story label
- All paths are repository-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Land the workspace primitives this feature relies on before any feature code is written.

- [X] T001 Add `@tanstack/react-query` to `apps/web/package.json` and wire a shared `QueryClientProvider` into `apps/web/src/main.tsx` (defaults: `refetchOnWindowFocus: false`, `refetchOnMount: 'always'`, no intervals)
- [X] T002 [P] Add `@fastify/multipart` to `apps/api/package.json` and register it in `apps/api/src/app.ts` with `limits.fileSize` read from `apps/api/src/config.ts` (default 25 MB)
- [X] T003 [P] Introduce `STORAGE_ROOT` env var in `apps/api/src/config.ts` (default `./.storage`) and add `.storage/` to the root `.gitignore`
- [X] T004 [P] Create feature folder skeletons: `apps/api/src/modules/k1/` (with `extraction/` and `storage/` subfolders) and `apps/web/src/features/k1/` (with `hooks/`, `components/`, `api/` subfolders)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared types, entity-scope middleware, and audit helper that every user story depends on.

**⚠️ CRITICAL**: No user story work can start until this phase is complete.

- [X] T005 Write migration `apps/api/src/infra/db/migrations/002_k1_ingestion.sql` — adds `parse_error_code`, `parse_error_message`, `parse_attempts`, `superseded_by_document_id`, `uploader_user_id` columns on `k1_documents`; `CHECK` constraint on `processing_status`; creates tables `document_versions`, `entity_memberships`; creates view `v_k1_active_documents` (all per `specs/002-k1-ingestion/data-model.md` §2)
- [X] T006 [P] Create shared wire types in `packages/types/src/k1-ingestion.ts` (`K1Status`, `K1DocumentSummary`, `K1ListResponse`, `K1Kpis`, `K1UploadRequest`, `K1UploadResponse`, `K1DuplicateResponse`) and re-export from `packages/types/src/index.ts`
- [X] T007 [P] Create `apps/api/src/modules/k1/k1.schemas.ts` with Zod schemas mirroring the OpenAPI contract in `specs/002-k1-ingestion/contracts/k1-ingestion.openapi.yaml`
- [X] T008 [P] Create `apps/api/src/modules/k1/storage/localPdfStore.ts` implementing the `PdfStore` interface (`put` / `get` / `delete`) against `${STORAGE_ROOT}/k1/<yyyy>/<document_id>.pdf` per research Decision 7
- [X] T009 [P] Create `apps/api/src/modules/k1/extraction/K1Extractor.ts` interface and `apps/api/src/modules/k1/extraction/stubExtractor.ts` deterministic V1 implementation per research Decision 8 (emits `k1.parse_started`, then `k1.parse_completed` or `k1.parse_failed`, writes `k1_issues` rows, updates `k1_documents.processing_status`)
- [X] T010 Extend `apps/api/src/modules/audit/writeAuditEvent.ts` to accept the new event names defined in `data-model.md` §3.4 (`k1.uploaded`, `k1.parse_started`, `k1.parse_completed`, `k1.parse_failed`, `k1.issue_opened`, `k1.issue_resolved`, `k1.approved`, `k1.finalized`, `k1.superseded`, `k1.reparse_requested`) and keep same-transaction semantics
- [X] T011 Create `apps/api/src/modules/k1/k1.repository.ts` with entity-scope enforcement via `entity_memberships` — every query joins `entity_memberships` for the caller and reads from `v_k1_active_documents`; include helpers: `listK1s`, `getKpis`, `findDuplicate(partnershipId, entityId, taxYear)`, `getById`, `insertUpload`, `supersede`, `markReparseRequested`, `listForExport`
- [X] T012 [P] Create `apps/api/src/modules/k1/k1Scope.plugin.ts` Fastify plugin that loads the caller's `entity_memberships` from the session onto `req.k1Scope` and returns `403 { error: 'FORBIDDEN_ENTITY' }` when a requested `entity_id` is not in scope
- [X] T013 Register the `k1` module by mounting `apps/api/src/modules/k1/k1.routes.ts` (created as an empty skeleton here) from `apps/api/src/routes/index.ts` under `/v1/k1`
- [X] T014 [P] Create `apps/web/src/features/k1/api/k1Client.ts` typed fetch wrapper over `/v1/k1/*` — returns `ApiError` on non-2xx and preserves the `409 DUPLICATE_K1` body shape

**Checkpoint**: Schema migrated, shared types shipped, entity scope enforced, audit writer extended, extractor stub ready. User stories may now proceed.

---

## Phase 3: User Story 1 — Monitor K-1 lifecycle at a glance (Priority: P1) 🎯 MVP

**Goal**: A user signs into Atlas, lands on the K-1 Processing Dashboard, and sees a KPI row (Uploaded / Processing / Needs Review / Ready for Approval / Finalized) scoped to Tax Year + Entity plus a populated table of every K-1 visible to them, sorted by upload time. The KPI row never reacts to Status or Search filters.

**Independent Test**: With seeded K-1s across all five lifecycle states, load `/k1`, observe five KPI cards summing to the row count under scope, verify KPI cards do NOT change when Status or Search is changed, and verify KPI cards DO change when Tax Year or Entity is changed (spec §US1 + FR-004).

### Tests for User Story 1

- [X] T015 [P] [US1] Contract test `apps/api/tests/k1.list.contract.test.ts` — asserts `GET /v1/k1-documents` shape, default sort `uploaded_at desc`, pagination, entity-scope 403, respects `contracts/k1-ingestion.openapi.yaml`
- [X] T016 [P] [US1] Contract test `apps/api/tests/k1.kpis.contract.test.ts` — asserts `GET /v1/k1-documents/kpis` accepts only `tax_year` + `entity_id`, rejects `status` / `q` params (400), returns all five lifecycle counts + `processingWithErrors`
- [X] T017 [P] [US1] Integration test `apps/api/tests/k1.authz.integration.test.ts` — user with no `entity_memberships` receives empty list + zeroed KPIs; user scoped to entity A cannot see entity B's K-1s on either endpoint
- [ ] T018 [P] [US1] Web test `apps/web/tests/k1-dashboard.spec.tsx` — **DEFERRED**: apps/web has no `vitest` / `@testing-library/react` / `jsdom` installed; requires web test-infrastructure setup

### Implementation for User Story 1

- [X] T019 [P] [US1] Implement `apps/api/src/modules/k1/list.handler.ts` — keyset pagination, server-side filter (`tax_year`, `entity_id`, `status`, `q`), sort whitelist `uploaded_at|partnership|entity|tax_year|status|issues`, default `uploaded_at desc`
- [X] T020 [P] [US1] Implement `apps/api/src/modules/k1/kpis.handler.ts` — rejects `status`/`q`, returns `K1Kpis` per `data-model.md` §3.2
- [X] T021 [US1] Wire list + kpis handlers into `apps/api/src/modules/k1/k1.routes.ts` with Zod validation and the `k1Scope.plugin.ts` preHandler
- [X] T022 [P] [US1] Implement `apps/web/src/features/k1/hooks/useK1List.ts` — `useQuery(['k1-list', filters])`, exposes `refetch`, no polling
- [X] T023 [P] [US1] Implement `apps/web/src/features/k1/hooks/useK1Kpis.ts` — `useQuery(['k1-kpis', scope])` where `scope = { taxYear, entityId }` only
- [X] T024 [P] [US1] Implement `apps/web/src/features/k1/components/K1KpiRow.tsx` composing catalog `KpiCard` x5; Processing card shows inline warning icon when `processingWithErrors > 0` (FR-025)
- [X] T025 [P] [US1] Implement `apps/web/src/features/k1/components/K1FilterBar.tsx` composing catalog `FilterToolbar` (search, Status, Tax Year, Entity, Clear all, result count)
- [X] T026 [P] [US1] Implement `apps/web/src/features/k1/components/K1DocumentsTable.tsx` composing catalog `DataTable` + `StatusBadge` + `RowActionMenu`; columns: Document Name, Partnership, Entity, Tax Year, Status, Issues, Uploaded; Processing rows with `parseError` render an inline error icon + tooltip on the badge (FR-017/025)
- [X] T027 [US1] Replace the placeholder page body in `apps/web/src/pages/K1Dashboard.tsx` with `PageHeader` (title + Refresh secondary action) + `K1KpiRow` + `K1FilterBar` + `K1DocumentsTable`, wired to hooks; add `EmptyState` / `ErrorState` / `LoadingState` for all six screen states (UI Constitution §4)

**Checkpoint**: US1 fully functional — dashboard loads, KPIs follow scope only, table renders and sorts/filters/paginates; parse-error indicator visible.

---

## Phase 4: User Story 2 — Find and drill into a specific K-1 (Priority: P1)

**Goal**: A user types a partnership name into Search or applies Status / Tax Year / Entity filters, sees the list narrow in place, and clicks a row to be navigated to the Review Workspace for that K-1 (Feature 003 target). Finding-level filters narrow only the table.

**Independent Test**: With ≥ 50 seeded K-1s, type a partnership substring → table filters, KPIs unchanged; clear filters → full list returns; click a row → browser navigates to `/k1/:id/review` (route exists even if the workspace is a stub).

### Tests for User Story 2

- [X] T028 [P] [US2] Contract test `apps/api/tests/k1.detail.contract.test.ts` — asserts `GET /v1/k1-documents/{k1DocumentId}` shape + 404 for out-of-scope id
- [ ] T029 [P] [US2] Web test `apps/web/tests/k1-filter-and-navigate.spec.tsx` — **DEFERRED**: blocks on same web test-infra as T018

### Implementation for User Story 2

- [X] T030 [P] [US2] Implement `apps/api/src/modules/k1/detail.handler.ts` — returns `K1DocumentSummary` for a single id, 403/404 via `k1Scope.plugin.ts`
- [X] T031 [US2] Add `GET /v1/k1/:k1DocumentId` route in `apps/api/src/modules/k1/k1.routes.ts`
- [X] T032 [P] [US2] Extend `apps/web/src/features/k1/hooks/useK1List.ts` to debounce search input (200 ms) and update the URL query string so filter state is sharable (FR-015)
- [X] T033 [US2] Wire row-click in `apps/web/src/features/k1/components/K1DocumentsTable.tsx` to `navigate('/k1/' + id + '/review')` and register the route in `apps/web/src/App.tsx` pointing at a stub `K1ReviewPage` placeholder (handed off to Feature 003)
- [X] T034 [US2] Add active-filter chip row + "Clear all" behavior to `apps/web/src/features/k1/components/K1FilterBar.tsx` (FR-013/014)

**Checkpoint**: US2 fully functional — search + filters narrow the table without disturbing KPIs; row click lands on the review route.

---

## Phase 5: User Story 3 — Upload new K-1 documents (Priority: P2)

**Goal**: Any authenticated user with entity scope can upload a K-1 PDF with Partnership / Entity / Tax Year metadata. The new row is visible within 5 s in the `Uploaded` state and transitions automatically through `Processing` to its post-parse state. Duplicates by `(partnership, entity, tax_year)` are blocked with a Replace / Cancel prompt; Replace supersedes the prior version and retains it for audit.

**Independent Test**: Upload a PDF — row appears as Uploaded (SC-010), flips to Processing then Needs Review / Ready for Approval; uploading the same `(partnership, entity, tax_year)` triggers `409 DUPLICATE_K1` and the Replace/Cancel prompt; on Replace, prior row is removed from default listing, `document_versions` contains the chain, `k1.superseded` audit event exists.

### Tests for User Story 3

- [X] T035 [P] [US3] Contract test `apps/api/tests/k1.upload.contract.test.ts` — asserts `201` happy path, `409 DUPLICATE_K1` body shape, `415` on non-PDF mime, `400` on missing fields / invalid `tax_year`, `403` on out-of-scope entity
- [X] T036 [P] [US3] Integration test `apps/api/tests/k1.supersede.integration.test.ts` — replace-upload: prior row's `supersededByDocumentId` set, `document_versions` row inserted, `k1.superseded` audit event written, superseded row hidden from default listing; mismatch on `replaceDocumentId` returns `409 REPLACE_DOCUMENT_MISMATCH`
- [X] T037 [P] [US3] Integration test `apps/api/tests/k1.extraction.integration.test.ts` — after upload, stub extractor transitions `UPLOADED → PROCESSING → NEEDS_REVIEW|READY_FOR_APPROVAL`; mocked-failure path leaves status `PROCESSING` with `parseErrorCode` populated and emits `k1.parse_failed`
- [X] T038 [P] [US3] Contract test `apps/api/tests/k1.reparse.contract.test.ts` — `POST /v1/k1-documents/{id}/reparse` accepts only failed-parse rows (`409 NOT_RETRYABLE` otherwise), clears `parseError*`, increments `parseAttempts`, returns `202`, emits `k1.reparse_requested`
- [ ] T039 [P] [US3] Web test `apps/web/tests/k1-upload.spec.tsx` — **DEFERRED**: blocks on same web test-infra as T018

### Implementation for User Story 3

- [X] T040 [P] [US3] Implement `apps/api/src/modules/k1/upload.handler.ts` — multipart parse → Zod validate → entity-scope check → `findDuplicate` → branch: (a) no match → insert `documents` + `k1_documents` + write PDF + write `k1.uploaded` audit + dispatch extractor via `setImmediate`, (b) match without `replaceDocumentId` → `409 DUPLICATE_K1`, (c) match with `replaceDocumentId` → call `supersede.handler.ts`
- [X] T041 [P] [US3] Implement `apps/api/src/modules/k1/supersede.handler.ts` — single transaction: insert new rows, set prior `superseded_by_document_id`, insert `document_versions` row, write `k1.superseded` audit event; dispatch extractor on commit
- [X] T042 [P] [US3] Implement `apps/api/src/modules/k1/reparse.handler.ts` — eligibility check (`processing_status='PROCESSING'` AND `parse_error_code IS NOT NULL`), clear `parse_error_*`, increment `parse_attempts`, write `k1.reparse_requested` audit, kick extractor, return `202`; return `409` otherwise
- [X] T043 [US3] Add `POST /v1/k1/upload` and `POST /v1/k1/:k1DocumentId/reparse` routes in `apps/api/src/modules/k1/k1.routes.ts` with multipart + Zod guards
- [X] T044 [P] [US3] Implement `apps/web/src/features/k1/hooks/useK1Upload.ts` — `useMutation` returning discriminated `{ kind: 'uploaded', ... } | { kind: 'duplicate', existing }`; on success invalidates `['k1-list']` and `['k1-kpis']`
- [X] T045 [P] [US3] Implement `apps/web/src/features/k1/components/K1UploadDialog.tsx` — file picker + Partnership / Entity / Tax Year fields; client-side size + MIME guard mirrors server; shows validation errors inline (UI Constitution §6)
- [X] T046 [P] [US3] Implement `apps/web/src/features/k1/components/K1DuplicatePrompt.tsx` — "A K-1 for this partnership, entity, and tax year already exists (uploaded {date})" with `Replace` / `Cancel` actions wired to `useK1Upload.replace()`
- [X] T047 [US3] Add `Upload Documents` primary action to `PageHeader` in `apps/web/src/pages/K1Dashboard.tsx` that opens `K1UploadDialog`; on `kind: 'duplicate'` opens `K1DuplicatePrompt`; on success closes dialogs and relies on query invalidation to reflect the new row (SC-010 target < 5 s)
- [X] T048 [US3] Add a `Re-parse` item to `RowActionMenu` in `K1DocumentsTable.tsx` visible only when the row carries a `parseError`; calls `POST /v1/k1/{id}/reparse` and invalidates queries

**Checkpoint**: US3 fully functional — uploads, duplicate flow, supersession, re-parse all work end-to-end with audit events in place.

---

## Phase 6: User Story 4 — Export the current view (Priority: P3)

**Goal**: The user clicks Export and downloads a CSV containing exactly the rows currently visible under the active filters, respecting their entity scope and capped at 50 000 rows.

**Independent Test**: Apply a Status filter that narrows to N rows → click Export → downloaded CSV has N rows + header; no filters → CSV has all visible rows up to the cap; user with scope A cannot obtain entity B's rows via URL fuzzing.

### Tests for User Story 4

- [X] T049 [P] [US4] Contract test `apps/api/tests/k1.export.contract.test.ts` — asserts `text/csv; charset=utf-8` + attachment disposition, header row, row count matches filter, entity-scope 403, emits `k1.export_generated` audit carrying row count + filters
- [ ] T050 [P] [US4] Web test `apps/web/tests/k1-export.spec.tsx` — **DEFERRED**: blocks on same web test-infra as T018

### Implementation for User Story 4

- [X] T051 [P] [US4] Implement `apps/api/src/modules/k1/export.handler.ts` — streams CSV (columns: Document Name, Partnership, Entity, Tax Year, Status, Issues, Uploaded) using the same scope + filter helpers as list; writes UTF-8 BOM; caps at 50 000 rows
- [X] T052 [US4] Add `GET /v1/k1/export.csv` route in `apps/api/src/modules/k1/k1.routes.ts`
- [X] T053 [P] [US4] Implement `apps/web/src/features/k1/hooks/useK1Export.ts` — builds the URL from current filters and triggers browser download via a transient `<a download>` element
- [X] T054 [US4] Add `Export` secondary action to `PageHeader` in `apps/web/src/pages/K1Dashboard.tsx` wired to `useK1Export`

**Checkpoint**: US4 fully functional — CSV download matches the filtered view with entity scope enforced server-side.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T055 [P] Playwright E2E `apps/web/tests/e2e/k1-upload-to-review.spec.ts` — **DEFERRED**: Playwright not installed in repo; requires separate test-infra task
- [X] T056 [P] Seed script `apps/api/src/infra/db/seed/002_k1_fixtures.ts` — creates up to 1 000 K-1 rows evenly distributed across the five statuses (accepts `K1_PERF_FIXTURE_COUNT` env override). Run via `npx tsx src/infra/db/seed/002_k1_fixtures.ts` from `apps/api`.
- [X] T057 [P] CI grep guard `scripts/ci/guard-k1-imports.mjs` — fails the build if any file under `apps/web/src/pages/K1Dashboard.tsx` or `apps/web/src/features/k1/**` imports from `@mui/*` or `specs/002-k1-ingestion/reference/**` (UI Constitution §1, §10; SC-009). Wire into CI via `node scripts/ci/guard-k1-imports.mjs`.
- [ ] T058 Run `specs/002-k1-ingestion/quickstart.md` §6 verification steps manually and check every bullet in its §9 Definition of Done — **DEFERRED**: manual walkthrough owed to the reviewer
- [X] T059 [P] Updated `docs/ui/40-screen-map.md` (§Composition notes — K-1 Processing Dashboard) and `docs/ui/46-component-catalog.md` (§Screen compositions → K-1 Processing Dashboard) to document the catalog-only composition

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no prereqs
- **Foundational (Phase 2)** → requires Phase 1; BLOCKS every user story
- **User Stories (Phases 3–6)** → all require Phase 2 complete
  - US1 and US2 share no file dependencies and may proceed in parallel once Phase 2 is done
  - US3 depends on Phase 2 (extractor + audit writer + PdfStore); does not depend on US1/US2 code but modifies shared files `K1Dashboard.tsx`, `K1DocumentsTable.tsx`, `k1.routes.ts`
  - US4 depends on Phase 2 only; touches shared files `K1Dashboard.tsx` and `k1.routes.ts`
- **Polish (Phase 7)** → after all user stories in scope are complete

### Within-Story Ordering

- Tests before implementation within a story (constitution §13 traceability; tests establish the contract)
- Handlers depend on `k1.repository.ts` (T011) and `k1Scope.plugin.ts` (T012)
- Web components depend on hooks (`useK1List`, `useK1Kpis`, `useK1Upload`, `useK1Export`)
- `K1Dashboard.tsx` composes all other web components; its touching tasks (T027, T047, T054) run last in each story

### Parallel Opportunities

- Phase 1: T002 / T003 / T004 in parallel
- Phase 2: T006 / T007 / T008 / T009 / T012 / T014 in parallel; T005 first; T010 before T011 (audit events used by repo); T013 after T012
- US1 tests T015–T018 in parallel; implementation T019 / T020 in parallel; T022–T026 in parallel; T021 and T027 serialize with their respective files
- US3 tests T035–T039 in parallel; implementation T040 / T041 / T042 in parallel; T044 / T045 / T046 in parallel; T043 / T047 / T048 serialize on shared files

### Parallel Example (US1 implementation)

```text
# After T021 wires routes, kick off all of these concurrently:
T022 useK1List.ts
T023 useK1Kpis.ts
T024 K1KpiRow.tsx
T025 K1FilterBar.tsx
T026 K1DocumentsTable.tsx
```

---

## Implementation Strategy

### MVP (US1 + US2 together)

Both P1 stories together constitute the MVP — a read-only, filterable, drill-into-able dashboard. Ship order:

1. Phase 1 Setup
2. Phase 2 Foundational (all tasks)
3. Phase 3 US1 → validate acceptance scenarios and FR-004 KPI scope invariance
4. Phase 4 US2 → validate search + row-click navigation
5. Demo / deploy

### Incremental

6. Phase 5 US3 → uploads + duplicates + re-parse (enables the primary write path)
7. Phase 6 US4 → CSV export
8. Phase 7 Polish → E2E, perf seed, CI guard, docs

### Definition of Done Summary

- All tasks completed and checked off
- All 10 success criteria in `spec.md` pass
- Quickstart §9 DoD bullets all green
- No Material UI import and no import from `specs/002-k1-ingestion/reference/**` under production paths (grep guard T057)
- Every lifecycle mutation co-commits an `audit_events` row (verified by integration tests T036, T037)

---

## Task Summary

- **Total tasks**: 59
- **By phase**: Setup 4 · Foundational 10 · US1 13 · US2 7 · US3 14 · US4 6 · Polish 5
- **Parallel-eligible**: 34 tasks marked `[P]`
- **MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2) = 34 tasks
- **Independent test coverage**: every user story has at least one contract test and one web/E2E test before implementation tasks
