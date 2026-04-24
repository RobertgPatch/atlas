# Tasks: K-1 Review Workspace and Finalization

**Input**: Design documents from `specs/003-review-and-finalization/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/review-finalization.openapi.yaml, quickstart.md

**Tests**: Tests ARE requested for this feature — the spec enumerates Success Criteria (SC-001..SC-012) that require test-based verification (snapshot, axe, concurrency, rollback, autoresolve, two-person, scope).

**Organization**: Tasks are grouped by user story (US1..US4 from spec.md) after Setup + Foundational phases. Each user story's Checkpoint marks a fully testable increment.

## Format: `- [ ] TaskID [P?] [Story?] Description with file path`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks in the same phase)
- **[US1..US4]**: maps to spec.md user stories; omitted for Setup / Foundational / Polish phases

## Path conventions

- Backend: `apps/api/src/**`, `apps/api/tests/**`
- Frontend: `apps/web/src/**`, `apps/web/tests/**`
- Shared types: `packages/types/src/**`
- Shared UI: `packages/ui/src/**`
- DB migration: `apps/api/src/infra/db/migrations/003_review_finalization.sql`

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create branch `003-review-and-finalization` from `002-k1-ingestion` (or `main` after 002 lands) and update `.specify/feature.json` if needed; ensure working tree is clean before the tasks phase starts
- [ ] T002 [P] Add `pdfjs-dist@^4` to `apps/web/package.json` dependencies (NOT to `apps/api`); configure Vite to copy the worker asset by importing `pdfjs-dist/build/pdf.worker.mjs?url` in `packages/ui/src/components/PdfPreview/PdfPreview.tsx` only
- [ ] T003 [P] Add dev dependencies to `apps/web/package.json`: `vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@axe-core/react`, `msw` (for API mocking in web tests)
- [ ] T004 [P] Add dev dependency to repo root (or `tests/e2e/`): `@playwright/test`; add `playwright.config.ts` at repo root scoped to `tests/e2e/**`
- [ ] T005 [P] Create `apps/web/vitest.config.ts` (jsdom env, `setupFiles: tests/setup.ts`, `tests/**/*.spec.tsx` include)
- [ ] T006 [P] Create `apps/web/tests/setup.ts` importing `@testing-library/jest-dom/vitest`, mocking `pdfjs-dist` globally, and extending `expect` with axe matcher
- [X] T007 [P] Extend `scripts/ci/guard-k1-imports.mjs` scan list to include `apps/web/src/pages/K1ReviewWorkspace.tsx` and `apps/web/src/features/review/**`; add guard for direct `pdfjs-dist` imports outside `packages/ui/src/components/PdfPreview/**`

---

## Phase 2: Foundational (Blocking Prerequisites)

**CRITICAL**: User story tasks MUST NOT begin until Phase 2 completes.

- [X] T008 Write migration `apps/api/src/infra/db/migrations/003_review_finalization.sql`: add `k1_documents.version int not null default 0`, `k1_documents.approved_by_user_id uuid references users(id)`, `k1_documents.finalized_by_user_id uuid references users(id)`, `k1_issues.k1_field_value_id uuid references k1_field_values(id)`, `k1_issues.resolved_at timestamptz`, `k1_issues.resolved_by_user_id uuid references users(id)`; add `CHECK` constraints per data-model §2.1; create partial indexes per data-model §2.2
- [ ] T009 Extend `apps/api/src/infra/db/index.ts` (or equivalent migration runner) so the new migration is applied at server boot and by the test harness
- [X] T010 [P] Add new wire types file `packages/types/src/review-finalization.ts` with `K1Status`, `K1ConfidenceBand`, `K1SourceLocation`, `K1FieldValue`, `K1Issue`, `K1ReviewSession`, `K1CorrectionRequest`, `K1CorrectionsResponse`, `K1MapEntityRequest`, `K1MapPartnershipRequest`, `K1ApproveResponse`, `K1FinalizeResponse`, `K1OpenIssueRequest`, `K1OpenIssueResponse`, `K1ResolveIssueResponse` per data-model §3
- [X] T011 [P] Re-export the review-finalization types from `packages/types/src/index.ts`
- [X] T012 Create new module skeleton `apps/api/src/modules/review/` with `review.routes.ts`, `review.schemas.ts`, `review.repository.ts`, `session.handler.ts`, `corrections.handler.ts`, `map.handler.ts`, `approve.handler.ts`, `finalize.handler.ts`, `issue.handler.ts`, `pdf.handler.ts`; wire `review.routes.ts` into `apps/api/src/routes/index.ts` behind the existing k1Scope plugin (reuse `apps/api/src/modules/k1/k1Scope.plugin.ts`)
- [X] T013 Implement `apps/api/src/modules/review/review.repository.ts` with optimistic-concurrency CAS helper `updateWithVersion(k1DocumentId, expectedVersion, setters, tx)` that returns the new version or throws `StaleVersionError`; include `findOpenIssuesForField(k1FieldValueId, tx)` and `listFieldValuesGrouped(k1DocumentId, tx)` readers
- [X] T014 Implement `apps/api/src/modules/review/review.schemas.ts` with zod schemas for every request body + `If-Match` header pattern; wire responses through the shared error envelope from 001/002
- [X] T015 Extend the audit module (`apps/api/src/modules/audit/**`) with the 8 new event name constants: `k1.field_corrected`, `k1.entity_mapped`, `k1.partnership_mapped`, `k1.approved`, `k1.approval_revoked`, `k1.finalized`, `k1.issue_opened`, `k1.issue_resolved`; update its in-tx writer helper to accept `cause` / `resolution_cause` discriminator fields
- [X] T016 [P] Create `apps/api/tests/helpers/reviewFixture.ts` extending the 002 fixture with three seeded K-1s: (a) `NEEDS_REVIEW` with mixed-validity fields and 1 field-linked open issue + 1 unlinked open issue, (b) `READY_FOR_APPROVAL` with `approved_by_user_id = adminA`, (c) `FINALIZED`; also seed `k1_reported_distributions.reported_distribution_amount`
- [X] T017 [P] Create `apps/web/src/features/review/api/reviewClient.ts` scaffold — typed fetch over `/v1/k1/:id/*` endpoints; every write method auto-injects `If-Match` from the current session version and surfaces `STALE_K1_VERSION` as a typed error
- [X] T018 [P] Create `apps/web/src/features/review/hooks/useReviewSession.ts` scaffold (react-query `queryKey: ['review', k1DocumentId]`, fetcher calls reviewClient, stale-time 0)
- [X] T018a [P] Integration test `apps/api/tests/review.raw-value-immutability.integration.test.ts` — fuzz ≥200 field corrections across the `NEEDS_REVIEW` fixture (random field × value combinations, including revert-then-re-edit cycles); assert every `k1_field_values.raw_value` and `original_value` are byte-for-byte unchanged post-save, while `reviewer_corrected_value` / `normalized_value` reflect the latest edits (SC-003)
- [X] T018b [P] Integration test `apps/api/tests/review.authorization.matrix.integration.test.ts` — enumerate the cartesian product of (actor ∈ {Admin-in-scope, Admin-out-of-scope, User-in-scope, User-out-of-scope, unauthenticated, MFA-not-verified}) × (every 003 endpoint: GET review-session, PATCH fields, POST approve, POST revoke-approval, POST finalize, POST send-to-issue-queue); assert each pair returns the expected 200 / 401 / 403 / 404 and that no forbidden call produces any mutation or audit event (SC-005)

**Checkpoint**: DB migration applied, wire types exported, backend module skeleton wired, fixture helper available, authorization-matrix + raw-value-immutability harnesses ready. User story phases may now begin.

---

## Phase 3: User Story 1 — Validate parsed K-1 data against its source PDF (Priority: P1) 🎯 MVP

**Goal**: A reviewer opens a K-1 in `Needs Review`/`Ready for Approval` from the Processing Dashboard, sees parsed fields (grouped into Entity Mapping / Partnership Mapping / Core) on the left with confidence indicators and source-locator controls, sees the source PDF on the right, and can highlight the field's bounding box in the PDF by clicking the source-locator.

**Independent Test**: Seed a K-1 in `Needs Review` with ≥8 fields of varying confidence and at least one `source_location`. Open `/k1/:id/review`; the left panel renders 3 `SectionCard`s with confidence indicators, the right panel renders the PDF first page, and clicking the source-locator highlights the correct region and scrolls to the correct page. No writes occur (story is read-only).

### Tests for User Story 1

- [X] T019 [P] [US1] Contract test `apps/api/tests/review.session.contract.test.ts` — asserts `GET /v1/k1/:id/review-session` 200 shape matches OpenAPI schema (version, status, fields grouped into 3 sections, issues, pdfUrl, canApprove/canFinalize/canEdit flags), sets `ETag` header equal to body's `version`, returns 404 when K-1 does not exist, 403/404 for out-of-scope entity, 401 when no session cookie
- [X] T020 [P] [US1] Contract test `apps/api/tests/review.pdf.contract.test.ts` — asserts `GET /v1/k1/:id/pdf` streams `application/pdf`, sets `Cache-Control: private, max-age=300`, 403 for out-of-scope, 404 for unknown id
- [ ] T021 [P] [US1] Web states spec `apps/web/tests/review-workspace.states.spec.tsx` — renders loading (skeleton both panels), populated, error-left-only, error-right-only, permission-restricted, finalized-locked; axe assertions zero serious/critical violations per state

### Implementation for User Story 1

- [X] T022 [US1] Implement `apps/api/src/modules/review/session.handler.ts` — loads K-1 row + field values + open issues + reported distribution; groups fields by section (`entityMapping`/`partnershipMapping`/`core`) via field-name prefix or a server-side mapping table; computes `confidenceBand` per research R1 thresholds (high≥0.9, medium 0.7..<0.9, low <0.7, none when null); computes `canApprove`/`canFinalize`/`canEdit` server-side from role + status + approved_by_user_id check; returns `pdfUrl = /v1/k1/:id/pdf`
- [X] T023 [US1] Implement `apps/api/src/modules/review/pdf.handler.ts` — enforces scope via k1Scope plugin, streams bytes from `${STORAGE_ROOT}/k1/<yyyy>/<document_id>.pdf` (reuse 002's `localPdfStore.ts`), sets headers, 404 when file missing on disk
- [X] T024 [US1] Register `GET /v1/k1/:id/review-session` and `GET /v1/k1/:id/pdf` in `apps/api/src/modules/review/review.routes.ts`
- [ ] T025 [P] [US1] Implement `packages/ui/src/components/PdfPreview/PdfPreview.tsx` — wraps `pdfjs-dist` with props `{ url, page, onPageChange, zoom, onZoomChange, highlight }`; overlay highlight normalized 0–100 bbox; handle worker init once; export from `packages/ui/src/components/index.ts`; lucide-react icons only
- [ ] T026 [P] [US1] Implement `packages/ui/src/components/PdfPreview/PdfPreview.test.tsx` (mocks pdfjs-dist) covering props contract
- [X] T027 [P] [US1] Implement `apps/web/src/pages/K1ReviewWorkspace.tsx` — route-level screen; composes `AppShell`, `ReviewHeader`, two-column body, `ReviewActionBar`; wires loading/error/populated/permission-restricted/finalized-locked states
- [X] T028 [P] [US1] Add `<Route path="/k1/:k1DocumentId/review" element={<K1ReviewWorkspace />} />` to `apps/web/src/App.tsx` inside the authenticated section; also make the upstream K1Dashboard row-click navigate to this route
- [X] T029 [P] [US1] Implement `apps/web/src/features/review/components/ReviewHeader.tsx` — composes `PageHeader` + `StatusBadge` (shared 5-status token set) + breadcrumb back to `/k1` + Tax Year / Uploaded metadata chips
- [X] T030 [P] [US1] Implement `apps/web/src/features/review/components/FieldSections.tsx` — renders 3 `SectionCard`s (Entity Mapping / Partnership Mapping / Core Fields) and delegates each row to `ParsedFieldRow`
- [X] T031 [P] [US1] Implement `apps/web/src/features/review/components/ParsedFieldRow.tsx` — label + value + Required marker + Modified marker + confidence indicator (mapped to band) + source-locator button when `sourceLocation` present; built on shared `EditableCell` (read-only in this story's scope; edit wiring lands in US2); accepts `onSourceLocatorClick` callback
- [X] T032 [P] [US1] Implement `apps/web/src/features/review/components/PdfPanel.tsx` — wraps `PdfPreview`, owns `currentPage` + `zoom` + `highlight` state, receives `highlight` from parent when a field is selected; renders isolated panel-scoped `ErrorState` on load failure (FR-024)
- [X] T033 [US1] Wire US1 data flow in `K1ReviewWorkspace.tsx`: `useReviewSession` → pass fields to `FieldSections`; field click sets `selectedFieldId` + `highlight` prop on `PdfPanel`; verify SC-002 (<2 s render) via React Query suspense/skeleton
- [ ] T034 [US1] Update [quickstart.md](specs/003-review-and-finalization/quickstart.md) step 1 + step 2 pass manually (source-locator highlights correct bbox; page navigation works)

**Checkpoint**: US1 is fully functional and testable standalone. Reviewer can open the workspace, see fields + PDF, highlight source locations. No writes yet.

---

## Phase 4: User Story 2 — Correct parsed values and map entity + partnership (Priority: P1)

**Goal**: Reviewer edits a parsed field inline, saves atomically, sees raw value preserved alongside user-corrected value; typeahead-maps Entity and Partnership against existing records only; linked issues auto-resolve; regression from `READY_FOR_APPROVAL` back to `NEEDS_REVIEW` is explicit and audited.

**Independent Test**: On a `NEEDS_REVIEW` K-1 with 1 field-linked open issue, correct the linked field; observe response `resolvedIssueIds` includes that issue, DB shows `raw_value` unchanged + `reviewer_corrected_value` populated, and audit log has `k1.field_corrected` + `k1.issue_resolved` (auto). On a `READY_FOR_APPROVAL` K-1, clear a Required field; observe status regression to `NEEDS_REVIEW`, `approved_by_user_id` cleared, `k1.approval_revoked` audit event.

### Tests for User Story 2

- [X] T035 [P] [US2] Contract test `apps/api/tests/review.corrections.contract.test.ts` — asserts 200 response shape (`{ version, status, resolvedIssueIds, approvalRevoked }`); validation error for missing `If-Match`; 409 `STALE_K1_VERSION` when `If-Match` is behind; 400 `VALIDATION_FAILED` on bad value format; 409 `K1_FINALIZED` when K-1 already finalized
- [X] T036 [P] [US2] Contract test `apps/api/tests/review.map.contract.test.ts` — asserts 200 on valid entity/partnership map; 400 `UNMAPPED_ENTITY` when id does not exist; 400 `PARTNERSHIP_ENTITY_MISMATCH` when partnership's entity doesn't match K-1; 403 when caller lacks scope on target entity
- [X] T037 [P] [US2] Integration test `apps/api/tests/review.concurrency.integration.test.ts` — fire two interleaved corrections requests against the same K-1 with the same starting version; assert only one commits, the other returns 409 `STALE_K1_VERSION`, DB mutated exactly once (SC-011)
- [ ] T038 [P] [US2] Integration test `apps/api/tests/review.issue-autoresolve.integration.test.ts` — fixture with 1 linked + 1 unlinked open issue; correct the linked field to a valid value; assert linked issue transitions to RESOLVED with `resolution_cause='auto'` audit event, unlinked issue stays OPEN (SC-012)
- [ ] T039 [P] [US2] Integration test `apps/api/tests/review.regression.integration.test.ts` — on `READY_FOR_APPROVAL` K-1 with `approved_by_user_id=adminA`, clear a Required field; assert status transitions to `NEEDS_REVIEW`, `approved_by_user_id` is NULL, `k1.approval_revoked` event with `cause='cleared_required_field'`
- [ ] T040 [P] [US2] Web spec `apps/web/tests/review-stale-version.spec.tsx` — mock API to return 409 `STALE_K1_VERSION`; assert `StaleVersionBanner` renders with Refresh action, in-flight edits are preserved
- [ ] T041 [P] [US2] Web spec `apps/web/tests/review-issue-autoresolve.spec.tsx` — seed two linked + one unlinked issue; correct the 2 linked fields; assert linked issues' count decreases, unlinked issue remains visible

### Implementation for User Story 2

- [X] T042 [US2] Implement `apps/api/src/modules/review/corrections.handler.ts` — single-transaction write: validate all corrections via zod + business rules; update `k1_field_values` (never touching `raw_value`); look up `findOpenIssuesForField` for each corrected field, resolve linked issues that now pass validation; check Approve-preconditions post-save — if K-1 was `READY_FOR_APPROVAL` and a required field was cleared, or a new issue exists, transition to `NEEDS_REVIEW` + clear `approved_by_user_id` + emit `k1.approval_revoked`; call `updateWithVersion` with version bump; emit `k1.field_corrected` per changed field, `k1.issue_resolved` per auto-resolved issue
- [X] T043 [US2] Implement `apps/api/src/modules/review/map.handler.ts` — two endpoints: entity and partnership mapping; enforce `entity_id` in caller's memberships, partnership's `entity_id` matches K-1 entity; version CAS + `k1.entity_mapped` / `k1.partnership_mapped` audit events
- [X] T044 [US2] Register `POST /v1/k1/:id/corrections`, `POST /v1/k1/:id/map/entity`, `POST /v1/k1/:id/map/partnership` in `apps/api/src/modules/review/review.routes.ts`
- [ ] T045 [US2] Add typeahead endpoints the UI will hit (scope to 002 / base API): either reuse existing `/v1/entities` and `/v1/partnerships` listing, or add scoped `/v1/review/entities?q=` and `/v1/review/partnerships?entity_id=&q=` thin wrappers with `?limit=20` server-side scope filter
- [X] T046 [P] [US2] Implement `apps/web/src/features/review/hooks/useSaveCorrections.ts` — react-query mutation; on success invalidates `['review', id]`; on 409 captures `currentVersion` and surfaces `StaleVersionBanner` signal
- [X] T047 [P] [US2] Implement `apps/web/src/features/review/hooks/useMapEntity.ts` and `useMapPartnership.ts` (same mutation pattern)
- [X] T048 [P] [US2] Extend `ParsedFieldRow.tsx` from US1 — wire edit mode via shared `EditableCell`; track Modified marker on local dirty state; call `useSaveCorrections` on blur/save-all batch; visually distinguish `reviewerCorrectedValue` from `rawValue` per FR-038
- [ ] T049 [P] [US2] Implement `apps/web/src/features/review/components/EntityTypeahead.tsx` — debounced input → typeahead endpoint; rejects unresolved free-text at commit with the spec-mandated directive message
- [ ] T050 [P] [US2] Implement `apps/web/src/features/review/components/PartnershipTypeahead.tsx` — same pattern, scoped by mapped entity id
- [X] T051 [P] [US2] Implement `apps/web/src/features/review/components/StaleVersionBanner.tsx` — reads React Query mutation error; renders banner with Refresh button that refetches `['review', id]` (replaces version) while preserving local unsaved form state
- [X] T052 [US2] Wire Save Corrections button in the ActionBar to `useSaveCorrections` (batched, single request); surface success toast with `resolvedIssueIds` count
- [ ] T053 [US2] Update quickstart steps 3, 4, 5, 6, 10, 13 pass manually
- [X] T053a [P] [US2] Implement `apps/web/src/features/review/hooks/useUnsavedChangesGuard.ts` using React Router `useBlocker` and a `beforeunload` listener; wire into `K1ReviewWorkspace.tsx` to prompt on route navigation and browser unload whenever the local dirty set is non-empty; add web spec `apps/web/tests/review-unsaved-changes.spec.tsx` asserting the prompt fires, Cancel preserves edits + dirty markers, and Discard clears them before navigating (FR-011)

**Checkpoint**: US1 and US2 both work independently. Reviewer can now read, correct, and map. No approvals yet.

---

## Phase 5: User Story 3 — Approve and finalize a reviewed K-1 (Priority: P2)

**Goal**: Admin A approves a clean `NEEDS_REVIEW` K-1 → `READY_FOR_APPROVAL` with `k1.approved` audit. Admin B (different Admin) finalizes → `FINALIZED` with single-transaction `partnership_annual_activity` upsert + `k1.finalized` audit. Admin A attempting finalize is rejected with `SAME_ACTOR_FINALIZE_FORBIDDEN`.

**Independent Test**: Approve as Admin A, verify status + approved_by_user_id + audit. Attempt finalize as Admin A: 403. Finalize as Admin B: 200, status FINALIZED, partnership_annual_activity row upserted keyed by `(entity_id, partnership_id, tax_year)` carrying `reported_distribution_amount`, `finalized_from_k1_document_id` set, `k1.finalized` audit written. Rollback test: inject failure at each write step → no partial state.

### Tests for User Story 3

- [X] T054 [P] [US3] Contract test `apps/api/tests/review.approve.contract.test.ts` — 200 happy (sets approved_by_user_id, version++, audit); 403 for non-Admin; 409 `INVALID_STATE_TRANSITION` when K-1 is not `NEEDS_REVIEW`; 409 when there are open issues; 409 `STALE_K1_VERSION`
- [X] T055 [P] [US3] Contract test `apps/api/tests/review.finalize.contract.test.ts` — 200 happy (status FINALIZED, partnershipAnnualActivityId returned); 403 `ROLE_REQUIRED_ADMIN`; 403 `SAME_ACTOR_FINALIZE_FORBIDDEN` when auth.userId == approved_by_user_id; 409 `FINALIZE_PRECONDITION_FAILED` on unmapped entity/partnership/missing 19A/open issues/empty required; 409 `INVALID_STATE_TRANSITION` when not READY_FOR_APPROVAL
- [ ] T056 [P] [US3] Integration test `apps/api/tests/review.two-person.integration.test.ts` — full round-trip: seed NEEDS_REVIEW, approve as Admin A, attempt finalize as Admin A (403), finalize as Admin B (200); assert audit events actor IDs are distinct (SC-006)
- [X] T057 [P] [US3] Integration test `apps/api/tests/review.finalize-rollback.integration.test.ts` — parameterized over each write step inside Finalize (status update, annual_activity upsert, finalized_by_user_id write, audit event); inject a throw at each step; assert the entire DB state is identical to pre-Finalize (SC-007)
- [ ] T058 [P] [US3] Web spec `apps/web/tests/review-finalize.flow.spec.tsx` — renders ActionBar with Approve visible+enabled for Admin on NEEDS_REVIEW only; after Approve, Finalize becomes visible for a different Admin; same-Admin sees Finalize disabled with the "Awaiting a second Admin" tooltip

### Implementation for User Story 3

- [X] T059 [US3] Implement `apps/api/src/modules/review/approve.handler.ts` — guard Admin role; assert status == `NEEDS_REVIEW`; assert no validation errors and no open issues; version CAS; set `approved_by_user_id = auth.userId` + status `READY_FOR_APPROVAL`; emit `k1.approved`
- [X] T060 [US3] Implement `apps/api/src/modules/review/finalize.handler.ts` — guard Admin role; check `auth.userId != approved_by_user_id` first (403 `SAME_ACTOR_FINALIZE_FORBIDDEN`); assert status == `READY_FOR_APPROVAL`; assert all finalize preconditions (mapped entity + partnership, no open issues, no empty required, non-null 19A); in one transaction: version CAS + status `FINALIZED` + `finalized_by_user_id` + upsert `partnership_annual_activity` on `(entity_id, partnership_id, tax_year)` with `reported_distribution_amount` from `k1_reported_distributions` + `finalized_from_k1_document_id` + emit `k1.finalized`
- [X] T061 [US3] Register `POST /v1/k1/:id/approve` and `POST /v1/k1/:id/finalize` in `apps/api/src/modules/review/review.routes.ts`
- [X] T062 [P] [US3] Implement `apps/web/src/features/review/hooks/useApproveK1.ts` and `useFinalizeK1.ts` — mutations; on success invalidate `['review', id]` and the upstream `['k1', 'list']` + `['k1', 'kpis']` queries from 002 (so the dashboard reflects the new status)
- [X] T063 [P] [US3] Implement `apps/web/src/features/review/components/ReviewActionBar.tsx` — catalog ActionBar; Approve button visible+enabled only when `canApprove` from session; Finalize button visible only when role=Admin, hidden/disabled for the approver (based on `approvedByUserId === currentUserId`), enabled when `canFinalize`; show "Awaiting a second Admin to finalize" tooltip when role=Admin but current user is the approver
- [X] T064 [US3] Wire `ReviewActionBar` into `K1ReviewWorkspace.tsx`; on Approve/Finalize success, the session hook re-fetches and the UI updates the status badge
- [ ] T065 [US3] Update quickstart steps 7, 8, 9 pass manually

**Checkpoint**: US1 + US2 + US3 all work independently. The full happy path (open → correct → approve → finalize) is deliverable as the feature's core MVP.

---

## Phase 6: User Story 4 — Route a K-1 to the issue queue (Priority: P3)

**Goal**: Any user with write permission can open an issue against a non-finalized K-1 (with optional note and optional field linkage) without changing the K-1's lifecycle status. Admins can also manually resolve an open issue.

**Independent Test**: Click Send to Issue Queue on a `NEEDS_REVIEW` K-1; confirm dialog with optional note field appears; on confirm, a `k1_issues` row is created, `k1.issue_opened` audit written, status unchanged. Resolve the issue via API; `k1.issue_resolved` with `resolution_cause='manual'`.

### Tests for User Story 4

- [X] T066 [P] [US4] Contract test `apps/api/tests/review.issue.contract.test.ts` — `POST /v1/k1/:id/issues` 200 with issueId + version; 400 on bad body; 409 `K1_FINALIZED`; `POST /v1/k1/:id/issues/:issueId/resolve` 200; 404 unknown issue; 409 already resolved; assert audit events for both

### Implementation for User Story 4

- [X] T067 [US4] Implement `apps/api/src/modules/review/issue.handler.ts` — open and resolve handlers; open accepts optional `k1FieldValueId` + `message` + `severity` + `issueType`; version CAS; emit `k1.issue_opened`; resolve sets status + resolved_at + resolved_by_user_id; emit `k1.issue_resolved` with `resolution_cause='manual'`
- [X] T068 [US4] Register `POST /v1/k1/:id/issues` and `POST /v1/k1/:id/issues/:issueId/resolve` in `apps/api/src/modules/review/review.routes.ts`
- [X] T069 [P] [US4] Implement `apps/web/src/features/review/hooks/useOpenIssue.ts` and `useResolveIssue.ts`
- [ ] T070 [P] [US4] Implement `apps/web/src/features/review/components/IssueQueueDialog.tsx` — catalog-based Dialog + optional note + optional field picker (when triggered from a row)
- [ ] T071 [US4] Wire Send to Issue Queue button in ActionBar to `IssueQueueDialog`; hide the button when `status === 'FINALIZED'` (FR-021, FR-027)
- [ ] T072 [US4] Update quickstart step 14 passes manually

**Checkpoint**: All four user stories complete and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T073 [P] Add E2E Playwright spec `tests/e2e/review-finalize.e2e.ts` — full browser flow: sign in Admin A → open K-1 → correct → approve → sign out → sign in Admin B → finalize → navigate to `/k1` → assert dashboard row reads `Finalized` within 3 s (SC-010)
- [ ] T074 [P] Add seeding helper `apps/api/src/infra/db/seed/003_review_fixtures.ts` that extends 002's perf seeder to include varying field-value + issue distributions for per-state UI snapshot coverage (SC-001)
- [X] T075 [P] Update `docs/ui/40-screen-map.md` "Composition notes" section with screen #7 K-1 Review Workspace composition details (catalog components used, panel boundaries, action-bar gating)
- [X] T076 [P] Update `docs/ui/46-component-catalog.md` "Screen compositions (reference)" with the K-1 Review Workspace entry; add `PdfPreview` to the catalog listing
- [ ] T077 [P] Add a minimal README or inline doc block in `packages/ui/src/components/PdfPreview/PdfPreview.tsx` describing the props contract and the "do not import `pdfjs-dist` directly" rule
- [X] T078 Run `scripts/ci/guard-k1-imports.mjs` against the new tree; assert 0 violations (SC-008)
- [X] T079 Run `cd apps/api; npm test` — all review contract + integration tests pass
- [ ] T080 Run `cd apps/web; npm test` — all review web specs pass; axe returns zero serious/critical violations (SC-009)
- [X] T081 Run `cd apps/api; npm run build` and `cd apps/web; npm run build` — clean build
- [ ] T082 Walk [quickstart.md](specs/003-review-and-finalization/quickstart.md) end-to-end (all 16 steps) against the running dev stack; confirm every step's expected state holds
- [X] T083 Final cleanup pass: remove any `console.log`, unused imports, `@ts-ignore`; confirm no `@mui/*` or direct `pdfjs-dist` imports outside the wrapper

---

## Dependencies — Story completion order

```
Phase 1 (Setup) ──► Phase 2 (Foundational) ──► Phase 3 (US1, MVP) ──► Phase 4 (US2) ──► Phase 5 (US3) ──► Phase 6 (US4) ──► Phase 7 (Polish)
```

- Phase 1 can be parallelized internally (T001..T007 are independent file adds except T001 which is branch setup)
- Phase 2 has an internal DAG: T008/T009 (migration) block everything else; T010/T011 (types) can run in parallel with T012 (module skeleton); T013/T014/T015 depend on T012; T016/T017/T018 are parallel after T010/T012
- Phase 3 (US1) is independently deliverable — no dependency on US2/3/4
- Phase 4 (US2) depends on US1 only for the workspace chrome and `ParsedFieldRow` scaffold; could be delivered standalone once US1 is merged
- Phase 5 (US3) depends on US2's status-transition + mapping guards (Approve requires mapped entity + partnership + no open issues, which come from US2)
- Phase 6 (US4) depends only on US1's workspace shell; can be delivered after US1 and before/after US2/3
- Phase 7 is end-of-feature polish

## Parallel execution examples

Within Phase 1 (all independent file adds):
```
T002 (pdfjs-dist) + T003 (web test deps) + T004 (Playwright) + T005 (vitest.config) + T006 (tests/setup.ts) + T007 (CI guard) — all in parallel
```

Within Phase 3 tests (before implementation):
```
T019 (session contract) + T020 (pdf contract) + T021 (web states) — all in parallel
```

Within Phase 3 implementation (after handlers land):
```
T025 (PdfPreview) + T026 (PdfPreview test) + T029 (ReviewHeader) + T030 (FieldSections) + T031 (ParsedFieldRow) + T032 (PdfPanel) — all parallel after T024 routes registered
```

Within Phase 5 tests:
```
T054 (approve contract) + T055 (finalize contract) + T056 (two-person) + T057 (rollback) + T058 (web finalize flow) — all parallel
```

## Independent testing criteria per story

- **US1**: Navigate to `/k1/:id/review` for a `NEEDS_REVIEW` K-1 with ≥8 seeded fields; confirm 3 `SectionCard`s render, PDF loads, source-locator highlights correct bbox. Only `GET` endpoints are exercised — US1 is read-only.
- **US2**: Seed a K-1 with 1 linked + 1 unlinked open issue; correct the linked field via the UI; verify `resolvedIssueIds` in the response and DB state. Additionally on a `READY_FOR_APPROVAL` K-1, clear a required field and confirm regression → `NEEDS_REVIEW` with cleared approver.
- **US3**: Run the two-person dance: approve as Admin A, attempt finalize as Admin A (403), finalize as Admin B (200). Verify `partnership_annual_activity` upsert and audit trail.
- **US4**: Open an issue via the dialog; verify DB row + audit event; resolve manually; verify `resolution_cause='manual'` on the audit.

## Implementation strategy — MVP first

- **Suggested MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1). This ships a working read-only review workspace that proves the PDF split view, the server-side session payload, and the screen-state coverage. No writes yet.
- **V1 core**: add Phase 4 (US2) + Phase 5 (US3). This is the minimum to close the loop through Finalize and produce `partnership_annual_activity` rows.
- **V1 complete**: add Phase 6 (US4) + Phase 7 (polish + E2E + docs). At this point all FRs (FR-001..FR-039) and all SCs (SC-001..SC-012) are verifiable.

## Format validation

All 86 tasks follow the required format `- [ ] TID [P?] [Story?] Description with file path`. Setup/Foundational/Polish tasks intentionally omit `[Story]`. US1..US4 tasks all carry their story label. Parallel markers applied only where the task writes a distinct file and has no dependency on other in-phase tasks.
