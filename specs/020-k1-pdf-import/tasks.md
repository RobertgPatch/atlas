---

description: "Dependency-ordered implementation tasks for multi-PDF K-1 import"
---

# Tasks: Multi-PDF K-1 Import

**Input**: Design documents from `/specs/020-k1-pdf-import/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The plan explicitly requires failing tests first for deterministic extraction, persistence, API contracts, atomic apply, web workflows, infrastructure, and benchmark gates. Each story phase begins with its independent tests.

**Organization**: Tasks are grouped by user story so batch intake, tracker application, exception review, and exhaustive code retention remain independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on an incomplete task in the same phase.
- **[Story]**: Maps work to User Story 1 through User Story 4 from `spec.md`.
- Every task names the exact implementation or validation path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the feature dependencies, configuration surface, safe fixture conventions, and contract tooling used by every story.

- [ ] T001 Add the focused AWS SDK v3 S3, Step Functions, Textract, Bedrock Data Automation Runtime, and Bedrock Runtime clients to `apps/api/package.json`, add `pdfjs-dist` to `apps/web/package.json`, and update `package-lock.json` without introducing a new workspace.
- [ ] T002 [P] Add local/fixture/AWS backend selectors, batch/file/page limits, evidence URL TTL, provider version identifiers, AWS resource identifiers, concurrency, retry, and feature-flag configuration to `apps/api/src/config.ts` and document safe local defaults in `apps/api/.env.example`.
- [ ] T003 [P] Add ignored private corpus, provider-artifact, benchmark-output, rendered-page, and local K-1 PDF storage patterns to `.gitignore` while keeping synthetic fixture manifests trackable.
- [ ] T004 [P] Create the synthetic/redacted fixture inventory and privacy rules in `apps/api/tests/fixtures/k1-pdf-import/README.md` and `apps/api/tests/fixtures/k1-pdf-import/manifest.json` without committing real PDFs, identities, answer keys, or raw provider outputs.
- [ ] T005 [P] Create reusable database, actor, partnership, batch, document, run, item, finding, and proposal fixture builders in `apps/api/tests/helpers/k1PdfImportFixture.ts` with PostgreSQL tests gated by `ATLAS_TEST_DATABASE_URL`.
- [ ] T006 [P] Add strict JSON Schema and OpenAPI parse/consistency validation in `apps/api/src/scripts/validate-k1-pdf-import-contracts.ts` and expose it through `apps/api/package.json`.

**Checkpoint**: Dependencies install, local defaults require no AWS credentials, and repository-tracked fixtures are demonstrably synthetic.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared contracts, durable schema, deterministic primitives, provider boundaries, and repository lifecycle required by every user story.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

### Foundational tests

> Write these tests first and confirm they fail for the missing foundation.

- [ ] T007 [P] Add strict extraction-schema contract tests for required evidence, null semantics, bounded arrays, item kinds, extra-key rejection, and invalid money/geometry in `apps/api/tests/k1-pdf-extraction.fixture.contract.test.ts` using `specs/020-k1-pdf-import/contracts/k1-extraction-output.schema.json`.
- [ ] T008 [P] Add deterministic unit tests for money signs/blanks/OCR ambiguity, masked identity comparison, normalized geometry, candidate agreement, and canonical proposal hashing in `apps/api/tests/k1-pdf-normalization.test.ts`.
- [ ] T009 [P] Add migration and lifecycle persistence tests for all new tables, constraints, indexes, append-only decisions, active-source uniqueness, retry idempotency, and restrictive deletion behavior in `apps/api/tests/k1-pdf-import.persistence.integration.test.ts`.

### Foundational implementation

- [ ] T010 Define batch, document, run, candidate, item, finding, decision, year-mapping, proposal, evidence, pagination, and permission wire types in `packages/types/src/k1-pdf-import.ts` and export them from `packages/types/src/index.ts`.
- [ ] T011 [P] Extend `PDF_IMPORT` source/provenance contracts and PDF source links in `packages/types/src/k1-tracker.ts`, and re-export partnership-scoped PDF import request/response types from `packages/types/src/partnership-tracker.ts`.
- [ ] T012 Mirror the shared PDF-import contracts and define database-row/internal worker types in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.contracts.ts` and `apps/api/src/modules/k1-pdf-import/k1-pdf-import.types.ts`.
- [ ] T013 [P] Implement strict boundary schemas, controlled public error codes, and version constants for extraction schema, Textract queries/features, BDA blueprint, semantic prompt, ensemble policy, and mapping rules in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.zod.ts`, `apps/api/src/modules/k1-pdf-import/k1-pdf-import.errors.ts`, and `apps/api/src/modules/k1-pdf-import/extraction/schema.ts`.
- [ ] T014 Create `apps/api/src/infra/db/migrations/026_k1_pdf_import.sql` with the eleven entities, lifecycle checks, indexes, active uniqueness, `PDF_IMPORT` source constraints, provenance foreign keys, and no cascade from partnerships specified in `data-model.md`.
- [ ] T015 Extend partnership deletion/reassignment child-row counting and controlled blockers for every PDF-import table in `apps/api/src/modules/partnerships/partnerships.repository.ts`.
- [ ] T016 [P] Add the complete redacted PDF-import audit event vocabulary to `apps/api/src/modules/audit/audit.events.ts` with payload guidance limited to opaque IDs, revisions, counts, states, and dispositions.
- [ ] T017 Implement row mapping, sorted locks, lifecycle-transition guards, append-only review storage, active-run selection, and revision increments in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.repository.ts`.
- [ ] T018 [P] Implement exact two-decimal normalization for symbols, grouping, parentheses, trailing minus, dash/blank nulls, and ambiguous OCR review results in `apps/api/src/modules/k1-pdf-import/normalization/money.ts`.
- [ ] T019 [P] Implement display-safe identity normalization/masked comparison and provider-to-normalized evidence geometry conversion in `apps/api/src/modules/k1-pdf-import/normalization/identity.ts` and `apps/api/src/modules/k1-pdf-import/normalization/geometry.ts`.
- [ ] T020 [P] Define provider-neutral extraction requests/results, evidence requirements, strict semantic-output parsing, and artifact metadata in `apps/api/src/modules/k1-pdf-import/extraction/K1PdfExtractor.ts` and `apps/api/src/modules/k1-pdf-import/extraction/schema.ts`.
- [ ] T021 Define the versioned fixed source-to-calculation/official-form inventory with destination validation, aggregation, sign, and risk metadata in `apps/api/src/modules/k1-pdf-import/mapping/k1SourceFieldMap.ts`.
- [ ] T022 [P] Define the private object-store interface plus safe local presign/head/read/artifact behavior below the ignored storage root in `apps/api/src/modules/k1-pdf-import/storage/K1PdfObjectStore.ts` and `apps/api/src/modules/k1-pdf-import/storage/localK1PdfObjectStore.ts`.
- [ ] T023 [P] Define the durable workflow-dispatch interface and local fixture dispatcher boundary in `apps/api/src/modules/k1-pdf-import/workflow/K1PdfWorkflowDispatcher.ts` and `apps/api/src/modules/k1-pdf-import/workflow/localK1PdfWorkflow.ts`.
- [ ] T024 Implement recorded synthetic Textract/BDA/Bedrock fixture loading and source-faithful exhaustive output in `apps/api/src/modules/k1-pdf-import/extraction/fixtureExtractor.ts`.
- [ ] T025 Implement provider candidate normalization, post-normalization agreement, confidence/risk selection, auto-accept exclusions, selected-candidate IDs, and reason codes in `apps/api/src/modules/k1-pdf-import/extraction/ensemble.ts`.
- [ ] T026 Implement stable canonical JSON serialization, SHA-256 proposal hashing, and immutable proposal snapshot construction in `apps/api/src/modules/k1-pdf-import/proposal.ts`.

**Checkpoint**: Recorded candidates deterministically produce schema-valid exhaustive items and proposal hashes, while PostgreSQL enforces the durable lifecycle and provenance model.

---

## Phase 3: User Story 1 - Import Several K-1 Years Together (Priority: P1) 🎯 Intake MVP

**Goal**: Upload 1–20 PDFs for one selected partnership, process every document durably, detect one year and identity per document, and resume complete/mixed batch status after navigation.

**Independent Test**: Upload five fixture PDFs containing distinct years and mixed text/scanned behavior, leave and restore the batch URL, and verify five scoped year proposals plus independent ready/failure states, identity mismatch blocking, and duplicate-year findings.

### Tests for User Story 1

> Write these tests first and confirm they fail before implementing the story.

- [ ] T027 [P] [US1] Add HTTP contract tests for batch create/list/detail, upload completion, retry, cancel, limits, stale revisions, scope, edit permissions, opaque object keys, and controlled errors in `apps/api/tests/k1-pdf-import.contract.test.ts`.
- [ ] T028 [P] [US1] Extend `apps/api/tests/k1-pdf-import.persistence.integration.test.ts` with document/run lifecycle, SHA-256 duplicate detection, new-attempt retry preservation, active-run selection, process restart, and batch counter assertions.
- [ ] T029 [P] [US1] Add a five-document fixture pipeline contract covering text/scanned PDFs, provider pagination, mixed success/failure, idempotent replay, identity mismatch, and duplicate detected years in `apps/api/tests/k1-pdf-extraction.fixture.contract.test.ts`.
- [ ] T030 [P] [US1] Add deterministic validation tests for file signature/size/hash, unreadable/encrypted/multi-K-1 files, identity/year requirements, duplicate hash/year, Section L, dated-cash comparison, and adjacent-year continuity in `apps/api/tests/k1-pdf-validation.test.ts`.
- [ ] T031 [P] [US1] Add component tests for selecting/hashing five PDFs, per-file validation/removal/retry/progress, duplicate hashes, background-safe close, mixed statuses, URL restoration, read-only users, focus, live regions, and 390-pixel structure in `apps/web/src/features/partnership-tracker/__tests__/K1PdfImportUpload.test.tsx`.

### Implementation for User Story 1

- [ ] T032 [US1] Implement scoped batch/document/run creation, recent-history pagination, upload-slot persistence, object verification state, retry attempt creation, cancellation, counters, and resumable detail reads in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.repository.ts`.
- [ ] T033 [P] [US1] Implement PDF signature, size, page-count, password/multi-form, hash, identity, tax-year, and duplicate-document validation in `apps/api/src/modules/k1-pdf-import/validation/validateDocument.ts`.
- [ ] T034 [P] [US1] Implement deterministic Section L, distribution, dated-cash ownership, and other same-document comparison findings in `apps/api/src/modules/k1-pdf-import/validation/validateCrossField.ts`.
- [ ] T035 [P] [US1] Implement duplicate-year, prior-ending-to-next-beginning, and configurable material year-over-year findings in `apps/api/src/modules/k1-pdf-import/validation/validateYearContinuity.ts`.
- [ ] T036 [US1] Implement one idempotent complete document job—object/hash verification, extraction, candidates, ensemble, mapping, findings, proposal persistence, controlled retry metadata, and terminal status—in `apps/api/src/modules/k1-pdf-import/worker/processDocument.ts`.
- [ ] T037 [US1] Implement batch counter reconciliation and `PROCESSING`, `PARTIAL_FAILURE`, `NEEDS_REVIEW`, `READY_TO_APPLY`, `FAILED`, and cancellation finalization in `apps/api/src/modules/k1-pdf-import/worker/finalizeBatch.ts`.
- [ ] T038 [US1] Complete the local fixture workflow so bounded documents invoke the same worker/finalizer path and injected stage failures remain retry-safe in `apps/api/src/modules/k1-pdf-import/workflow/localK1PdfWorkflow.ts`.
- [ ] T039 [US1] Implement scoped handlers and routes for list/create/detail, complete uploads, retry failed document, and cancel batch in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.handler.ts` and `apps/api/src/modules/k1-pdf-import/k1-pdf-import.routes.ts`.
- [ ] T040 [US1] Register PDF-import dependencies and partnership-scoped routes without changing workbook-import behavior in `apps/api/src/routes/index.ts` and `apps/api/src/app.ts`.
- [ ] T041 [P] [US1] Add batch history/create/detail, upload completion, retry, and cancel client methods with exact request/response typing in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts`.
- [ ] T042 [US1] Add batch query keys, create/upload/start/retry/cancel mutations, capped page-visibility-aware polling, cache invalidation, and `importBatch` URL restoration in `apps/web/src/features/partnership-tracker/hooks/useK1PdfImport.ts`.
- [ ] T043 [P] [US1] Implement the edit-gated multi-file dialog, drop zone/labeled picker, client SHA-256, duplicate detection, privacy disclosure, stage-aware actions, and leave guard in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfImportDialog.tsx`.
- [ ] T044 [P] [US1] Implement independent file hashing/upload states, accessible progress/errors, retry/remove actions, expired-slot handling, and retained successful rows in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfUploadList.tsx`.
- [ ] T045 [US1] Implement resumable batch header/progress, processing and partial-failure states, safe polling announcements, batch history return, and back-to-years behavior in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfImportWorkspace.tsx`.
- [ ] T046 [P] [US1] Implement blocking/failed/warning/ready ordering, detected year/final-amended/status/target labels, and responsive button/list navigation in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfDocumentRail.tsx`.
- [ ] T047 [US1] Add the `Import K-1 PDFs` entry point, prior-batch access, `importBatch` URL state, edit/read permission behavior, and workspace switching in `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx`.

**Checkpoint**: Five PDFs can enter one durable, resumable partnership batch and independently reach reviewable or actionable failure states with no AWS dependency.

---

## Phase 4: User Story 2 - Review and Populate Existing K-1 Forms (Priority: P1) 🎯 Functional MVP

**Goal**: Build reviewed year proposals, require explicit create/merge/replace/skip decisions, and atomically populate existing tracker calculation/official fields while preserving revisions, projections, audit, and signoff integrity.

**Independent Test**: Apply a clean fixture batch containing a new year and an existing year, verify every supported accepted value appears on the existing forms with provenance, and prove stale/failed multi-year apply changes no tracker row.

### Tests for User Story 2

> Write these tests first and confirm they fail before implementing the story.

- [ ] T048 [P] [US2] Add PostgreSQL integration tests for create/merge/replace/skip rules, absent-versus-null behavior, derived cash ownership, proposal/year staleness, five-year atomic rollback, recalculation, downstream invalidation, audit redaction, and repeated-apply idempotency in `apps/api/tests/k1-pdf-import.apply.integration.test.ts`.
- [ ] T049 [P] [US2] Add web tests for allowed year choices, conflict presentation, signed-off/downstream impact warnings, disabled apply states, exact confirmation counts, stale refresh, atomic failure, success links, and newest-year selection in `apps/web/src/features/partnership-tracker/__tests__/K1PdfImportApply.test.tsx`.
- [ ] T050 [P] [US2] Add form integration tests for calculation/official provenance, evidence actions, imported status, manual supersession, unchanged official-source retention, dated-cash comparison, and normal signoff continuation in `apps/web/src/features/k1-tracker/__tests__/K1PdfImportProvenance.test.tsx`.

### Implementation for User Story 2

- [ ] T051 [US2] Build effective reviewed calculation changes, complete official-form data, source rows, code items, conflicts, counts, and immutable proposal revisions from accepted items in `apps/api/src/modules/k1-pdf-import/mapping/mapImportProposal.ts` and `apps/api/src/modules/k1-pdf-import/proposal.ts`.
- [ ] T052 [US2] Refactor reusable create/merge/replace, projection recalculation, conflict refresh, sorted locking, and signoff invalidation primitives without changing workbook/manual semantics in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`.
- [ ] T053 [US2] Implement one-transaction batch/proposal/year lock validation and `CREATE`, `MERGE`, `REPLACE`, `SKIP` application with all-or-nothing tracker, official-data, provenance, projection, signoff, and audit writes in `apps/api/src/modules/k1-pdf-import/apply-import.ts`.
- [ ] T054 [US2] Implement active official-form source rows, imported calculation source links, manual field/full-object supersession, and evidence projection reads in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.repository.ts`.
- [ ] T055 [US2] Implement year-mapping target detection, existing revision snapshots, conflict rebuilding, action eligibility, proposal revision/hash changes, and stale status in `apps/api/src/modules/k1-pdf-import/proposal.ts`.
- [ ] T056 [US2] Add the atomic apply handler/route with batch revision, proposal revision/hash, per-year revision, blocker, permission, idempotency, and controlled 409/422 responses in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.handler.ts` and `apps/api/src/modules/k1-pdf-import/k1-pdf-import.routes.ts`.
- [ ] T057 [P] [US2] Add apply request/response methods and exact cache refresh for batch, partnership detail, year rail, selected year, calculations, and signoff queries in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/useK1PdfImport.ts`.
- [ ] T058 [P] [US2] Implement per-year source identity, mapped counts, dynamic counts, findings, current revision/status, conflicts, and allowed create/merge/replace/skip controls in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfYearMappingPanel.tsx`.
- [ ] T059 [P] [US2] Implement the focus-managed impact confirmation with created/merged/replaced/skipped counts, signoff invalidations, downstream review, stale/blocking explanations, and count-aware primary action in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfApplyDialog.tsx`.
- [ ] T060 [US2] Integrate year decisions, dirty-choice guard, apply readiness, atomic success/failure, applied-year links, and newest-year selection into `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfImportWorkspace.tsx`.
- [ ] T061 [US2] Extend tracker value/official response mapping with authorized PDF-import filename, page, confidence, review status, evidence item IDs, and aggregated source count in `packages/types/src/k1-tracker.ts` and `apps/api/src/modules/k1-tracker/k1-tracker.contracts.ts`.
- [ ] T062 [US2] Render PDF-import source, review/confidence state, evidence action, aggregated-source count, and manual supersession history without removing existing editing in `apps/web/src/features/k1-tracker/components/K1FormFieldCell.tsx`, `apps/web/src/features/k1-tracker/components/K1OfficialFormField.tsx`, and `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`.
- [ ] T063 [US2] Record redacted apply-started/completed/stale and year-created/merged/replaced/skipped audit events in `apps/api/src/modules/k1-pdf-import/apply-import.ts` using `apps/api/src/modules/audit/audit.events.ts` constants.

**Checkpoint**: A clean multi-year batch safely populates the existing K-1 forms, while stale or failed apply is atomic and imported years remain in the normal `NEEDS_REVIEW`/signoff workflow.

---

## Phase 5: User Story 3 - Review Exceptions and Source Evidence (Priority: P2)

**Goal**: Present an exception-first review queue with append-only corrections/dispositions and traceable PDF page/bounding-box evidence for every uncertain item.

**Independent Test**: Review a fixture with low confidence, provider disagreement, statement evidence, and an identity mismatch; inspect page/box evidence, correct and verify values, resolve blockers, and restore the review after refresh without mutating raw extraction.

### Tests for User Story 3

> Write these tests first and confirm they fail before implementing the story.

- [ ] T064 [P] [US3] Extend API contract tests for item filters/pagination, append-only decision validation, required reasons, destination allowlists, evidence URL authorization/TTL, stale batch revisions, and read-only evidence access in `apps/api/tests/k1-pdf-import.contract.test.ts`.
- [ ] T065 [P] [US3] Extend persistence tests for immutable candidates/items, latest-effective decision ordering, verify/correct/reject/map/resolve/waive/reopen transitions, finding resolution links, proposal rebuild scope, and decision audit redaction in `apps/api/tests/k1-pdf-import.persistence.integration.test.ts`.
- [ ] T066 [P] [US3] Add component tests for exception ordering/filters/counts, typed corrections, original/effective values, required reasons, all decision types, optimistic refresh, unsaved decisions, read-only behavior, focus, and polling stability in `apps/web/src/features/partnership-tracker/__tests__/K1PdfImportReview.test.tsx`.
- [ ] T067 [P] [US3] Add PDF.js evidence tests for short-lived URL requests/renewal, page-only fallback, normalized bounding-box overlays, keyboard page/zoom/close controls, textual evidence, focus restoration, and mobile drawer layout in `apps/web/src/features/partnership-tracker/__tests__/K1PdfEvidenceViewer.test.tsx`.

### Implementation for User Story 3

- [ ] T068 [US3] Implement scoped item/finding pagination, filter summaries, provider candidates, evidence metadata, latest-effective decisions, and immutable raw values in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.repository.ts`.
- [ ] T069 [US3] Implement append-only verify/correct/reject/map/resolve/waive/reopen decision validation, reason requirements, finding transitions, batch revisions, and affected-only proposal rebuilds in `apps/api/src/modules/k1-pdf-import/proposal.ts`.
- [ ] T070 [US3] Add item-list, review-decision, and authorized short-lived evidence-URL handlers/routes with read versus edit permission separation in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.handler.ts` and `apps/api/src/modules/k1-pdf-import/k1-pdf-import.routes.ts`.
- [ ] T071 [P] [US3] Add item/finding filters, review-decision mutations, evidence URL requests, safe URL expiry handling, and affected-query invalidation in `apps/web/src/features/partnership-tracker/api/partnershipTrackerClient.ts` and `apps/web/src/features/partnership-tracker/hooks/useK1PdfImport.ts`.
- [ ] T072 [P] [US3] Implement blocking/warning/disagreement/confidence/code/statement/all/verified filters with accessible selected state, result counts, and severity ordering in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfExceptionQueue.tsx`.
- [ ] T073 [P] [US3] Implement source location, normalized/raw values, destination, provider agreement/confidence, review badges, typed correction controls, original/effective comparison, and decision actions in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfExtractedItem.tsx`.
- [ ] T074 [US3] Integrate document selection, query-state filters, unsaved decision guarding, blocker progress, stale-rebase messaging, and completed-document review during mixed processing in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfImportWorkspace.tsx`.
- [ ] T075 [US3] Implement lazy PDF.js loading, page rendering, normalized coordinate overlays, page-only/raw-text fallback, zoom/navigation, URL renewal, focus synchronization, desktop split/tablet stack/mobile drawer, and reduced motion in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfEvidenceViewer.tsx`.
- [ ] T076 [US3] Enforce read-only viewing versus edit actions, accessible live/alert behavior without polling noise, visible focus, dialog/drawer focus restoration, and non-color confidence/severity cues across `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfImportWorkspace.tsx` and `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfEvidenceViewer.tsx`.
- [ ] T077 [US3] Record redacted document processing, retry/failure, review decision, batch-ready, and cancellation audit events in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.repository.ts` using `apps/api/src/modules/audit/audit.events.ts` constants.
- [ ] T078 [US3] Add controlled user-facing message mapping for provider failure categories, stale review, expired evidence, scope loss, and invalid lifecycle states in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.errors.ts` and `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfImportWorkspace.tsx`.

**Checkpoint**: Reviewers can resolve every blocker from an evidence-backed, keyboard-accessible queue while original extraction and prior decisions remain immutable.

---

## Phase 6: User Story 4 - Preserve Unknown Codes and Statements (Priority: P2)

**Goal**: Retain every repeated box/code/detail and supplemental-statement item, deterministically roll up known mappings, preserve unknowns through apply, and show their source and calculation effect in review and the existing form.

**Independent Test**: Process Box 13, 19, and 20 multi-code fixtures plus a statement-only item; verify each source item survives, mapped items disclose aggregation, unmapped items require review and remain visible after apply, and only configured destinations affect calculations.

### Tests for User Story 4

> Write these tests first and confirm they fail before implementing the story.

- [ ] T079 [P] [US4] Extend fixture extraction tests for repeated codes, duplicate-looking distinct lines, amountless codes, codeless amounts, statement-only references, unknown codes, stable item keys, and 100% source-line retention in `apps/api/tests/k1-pdf-extraction.fixture.contract.test.ts`.
- [ ] T080 [P] [US4] Extend apply integration tests for deterministic `FIRST`/`SUM`/`JOIN`/`ANY_TRUE`/`NONE` rules, sign conventions, active dynamic revisions, unmapped persistence, source links, manual supersession, and no unconfigured calculation effect in `apps/api/tests/k1-pdf-import.apply.integration.test.ts`.
- [ ] T081 [P] [US4] Extend review/provenance UI tests for known-rule disclosure, source-item breakdown, import-only mapping, keep-unmapped decisions, statement drilldown, repeatable official controls, and the applied code/details panel in `apps/web/src/features/k1-tracker/__tests__/K1PdfImportProvenance.test.tsx`.

### Implementation for User Story 4

- [ ] T082 [US4] Implement versioned tax-year-aware exact/anchored code mapping rules, destination allowlists, aggregation/sign/risk validation, seeded versions, and reviewer explanations in `apps/api/src/modules/k1-pdf-import/mapping/k1CodeMappingRules.ts`.
- [ ] T083 [US4] Extend exhaustive proposal mapping to preserve every code/statement item, aggregate only configured source IDs, retain destination-null items, and emit unknown/statement findings in `apps/api/src/modules/k1-pdf-import/mapping/mapImportProposal.ts`.
- [ ] T084 [US4] Persist code mapping versions and append-only active/superseded `k1_tracker_code_value_revisions` with deterministic logical keys and complete PDF provenance in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.repository.ts`.
- [ ] T085 [US4] Support `Keep as unmapped` and import-local `MAP` decisions without editing global rule configuration in `apps/api/src/modules/k1-pdf-import/proposal.ts` and `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfExtractedItem.tsx`.
- [ ] T086 [US4] Extend atomic apply to write mapped rollups once, official repeatable code arrays, all dynamic/unmapped revisions, statement relationships, and rollback-safe provenance in `apps/api/src/modules/k1-pdf-import/apply-import.ts`.
- [ ] T087 [US4] Render known mapping rule, aggregation, rollup destination, contributing source list, unknown status, statement relationship, and keep/map actions in `apps/web/src/features/partnership-tracker/components/k1-pdf-import/K1PdfExtractedItem.tsx`.
- [ ] T088 [US4] Add an accessible collapsible applied dynamic code/statement panel with mapping, rollup effect, source, review status, and evidence actions in `apps/web/src/features/k1-tracker/components/K1ImportedCodeDetails.tsx` and integrate it into `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`.
- [ ] T089 [US4] Populate existing official repeatable code/detail controls from accepted mapped items while retaining per-entry active source badges in `apps/web/src/features/k1-tracker/components/K1OfficialFormField.tsx`.
- [ ] T090 [US4] Show multi-source aggregation count and drilldown from calculation fields without treating unmapped items as calculated values in `apps/web/src/features/k1-tracker/components/K1FormFieldCell.tsx` and `apps/web/src/features/k1-tracker/components/K1ImportedCodeDetails.tsx`.

**Checkpoint**: No visible code-bearing or statement line disappears, and only reviewed deterministic mappings affect tracker calculations.

---

## Phase 7: Polish, AWS Production Adapters, Infrastructure, and Promotion Gates

**Purpose**: Replace local edges with secure AWS adapters, provision reviewed infrastructure, add privacy-safe observability, benchmark the promoted configuration, and complete full validation.

- [ ] T091 [P] Implement private presigned POST/GET, constrained conditions, `HeadObject`, streamed SHA-256, immutable versioned artifacts, KMS parameters, and redacted failures in `apps/api/src/modules/k1-pdf-import/storage/s3K1PdfObjectStore.ts`.
- [ ] T092 [P] Implement Standard Step Functions batch dispatch, deterministic execution naming, bounded document payloads, idempotent already-running handling, and controlled status mapping in `apps/api/src/modules/k1-pdf-import/workflow/stepFunctionsK1PdfWorkflow.ts`.
- [ ] T093 [P] Implement asynchronous Textract analysis with deterministic client tokens, required features/queries/layout, pagination, KMS output, throttling/backoff, timeout, artifact storage, and geometry conversion in `apps/api/src/modules/k1-pdf-import/extraction/textract.ts`.
- [ ] T094 [P] Implement versioned BDA project/blueprint async invocation, status polling, KMS output, immutable artifact retrieval, schema rejection, retry, and usage metadata in `apps/api/src/modules/k1-pdf-import/extraction/bedrockDataAutomation.ts`.
- [ ] T095 [P] Implement configured application-inference-profile semantic reconciliation, strict structured output, no destination authority, uncertainty explanations, token/cost capture, timeout/retry, and redacted errors in `apps/api/src/modules/k1-pdf-import/extraction/bedrockSemantic.ts`.
- [ ] T096 Implement the one-shot Fargate document/finalize command with opaque IDs, dependency selection, controlled exit codes, and no tax-data logging in `apps/api/src/scripts/run-k1-pdf-import-worker.ts` and expose it in `apps/api/package.json`.
- [ ] T097 [P] Define environment inputs, outputs, validation, retention, concurrency, provider ARNs, approved geography, alarm thresholds, and tags for the PDF-import Terraform module in `infra/aws/terraform/modules/k1_pdf_import/variables.tf`.
- [ ] T098 Implement the private versioned S3 bucket, KMS key/policies, TLS/public-access controls, lifecycle/CORS, ECS task/role/logs, Standard state machine/role, least-privilege Textract/BDA/Bedrock permissions, and CloudWatch alarms in `infra/aws/terraform/modules/k1_pdf_import/main.tf`.
- [ ] T099 Wire the PDF-import module, API environment/permissions, worker network configuration, feature flag, and reviewed outputs into `infra/aws/terraform/main.tf`, `infra/aws/terraform/variables.tf`, and `infra/aws/terraform/outputs.tf`.
- [ ] T100 Add privacy-safe batch/document stage metrics, latency, outcome, coverage, review/correction rate, provider usage/cost, stuck-workflow detection, and structured redaction helpers in `apps/api/src/modules/k1-pdf-import/k1-pdf-import.observability.ts` and call them from `apps/api/src/modules/k1-pdf-import/worker/processDocument.ts`.
- [ ] T101 Implement the ignored-corpus benchmark CLI, exact field/code metrics, auto-accept precision, latency/review/failure/cost reports, version manifest, and nonzero promotion-gate exit in `apps/api/src/scripts/benchmark-k1-pdf-import.ts` and expose `k1-import:benchmark` in `apps/api/package.json`.
- [ ] T102 [P] Define the committed synthetic benchmark manifest/result contract and expected sanitized aggregates in `apps/api/tests/fixtures/k1-pdf-import/benchmark-manifest.json` and `apps/api/tests/k1-pdf-import.benchmark.test.ts`.
- [ ] T103 [P] Add an opt-in, environment-gated staging smoke command for one text PDF, one scanned PDF, retry idempotency, evidence expiry, disposable-year apply, and redacted telemetry checks in `apps/api/src/scripts/smoke-k1-pdf-import.ts`.
- [ ] T104 Add authorization, presign expiry, object-key isolation, provider artifact secrecy, audit/log/metric redaction, and malicious provider-output tests in `apps/api/tests/k1-pdf-import.security.test.ts`.
- [ ] T105 Run all focused and full API/web tests and builds from `specs/020-k1-pdf-import/quickstart.md`, run scoped lint/type checks, validate OpenAPI/JSON Schema, and record only sanitized pass/fail results in `specs/020-k1-pdf-import/quickstart.md`.
- [ ] T106 Run `terraform fmt -check -recursive`, `terraform init -backend=false`, `terraform validate`, reviewed staging plan, external CPA benchmark, live staging smoke, 1440/200%-zoom/390-pixel keyboard/screen-reader/reduced-motion/read-only checks, and the private-artifact/credential scan; record sanitized promotion evidence in `specs/020-k1-pdf-import/quickstart.md` without committing plans, PDFs, answer keys, provider payloads, or signed URLs.

**Checkpoint**: The production configuration is private, least-privilege, observable, benchmark-approved, accessible, and deployable with local/CI fixture behavior still cloud-independent.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundational**: Depends on Setup and blocks every user story.
- **Phase 3 — US1 intake/resume**: Depends on Foundational; delivers the first demonstrable increment.
- **Phase 4 — US2 atomic apply**: Depends on Foundational and can be developed against seeded clean batch/proposal fixtures; the full user journey integrates with US1.
- **Phase 5 — US3 exception/evidence review**: Depends on Foundational and can be developed against seeded item/finding fixtures; the full user journey integrates with US1 proposals.
- **Phase 6 — US4 codes/statements**: Pure extraction/mapping work can begin after Foundational, while applied/form integrations depend on US2 and review actions depend on US3.
- **Phase 7 — Production/polish**: Depends on the desired story set; production enablement requires all four stories.

### User-story dependency graph

```text
Setup -> Foundational -> US1 batch intake/resume -----------+
                    |                                      |
                    +-> US2 clean proposal/apply -----------+--> Production adapters and promotion
                    |                                      |
                    +-> US3 exception/evidence review ------+
                    |                                      |
                    `-> US4 pure code/statement mapping ----+
                                  |        |
                                  |        `-- applied detail uses US2
                                  `----------- review decisions use US3
```

### Within each user story

- Write the listed tests first and verify they fail for the intended missing behavior.
- Complete repository/domain services before HTTP handlers.
- Complete HTTP/client contracts before UI integration.
- Keep provider/network work behind interfaces; ordinary tests use only recorded synthetic fixtures.
- Stop at each checkpoint and run that story's independent test before moving forward.

## Parallel Opportunities

### Setup and foundation

- T002–T006 can proceed independently after dependency installation begins.
- T007–T009 can be authored in parallel.
- T018–T020 and T022–T023 modify separate deterministic/adapter files and can run in parallel after contracts exist.

### User Story 1

```text
T027 API contract tests || T028 persistence tests || T029 extraction fixture tests || T030 validation tests || T031 upload UI tests
T033 document validation || T034 cross-field validation || T035 continuity validation
T043 upload dialog || T044 upload list || T046 document rail
```

### User Story 2

```text
T048 atomic apply tests || T049 apply UI tests || T050 provenance tests
T058 year mapping panel || T059 apply confirmation
```

### User Story 3

```text
T064 API review tests || T065 decision persistence tests || T066 review UI tests || T067 evidence tests
T072 exception queue || T073 extracted item card
```

### User Story 4

```text
T079 extraction-retention tests || T080 dynamic apply tests || T081 applied-details UI tests
```

### Production adapters

```text
T091 S3 || T092 Step Functions || T093 Textract || T094 BDA || T095 Bedrock
T102 benchmark contract || T103 staging smoke command
```

---

## Implementation Strategy

### Functional MVP first

1. Complete Setup and Foundational phases.
2. Complete US1 to create and resume a five-document fixture batch.
3. Complete US2 to atomically populate new/existing tracker years.
4. **STOP AND VALIDATE**: Demonstrate upload → detected years → explicit actions → populated existing K-1 forms with no AWS dependency.

US1 alone is the intake MVP; US1 + US2 is the smallest functional MVP that delivers the user's requested PDF-to-populated-form outcome.

### Incremental delivery

1. **US1**: Durable multi-document intake, processing, identity/year detection, mixed status, and resume.
2. **US2**: Explicit revision-safe atomic application into the current tracker.
3. **US3**: Exception-first human review and source evidence.
4. **US4**: Exhaustive code/statement retention, mapping transparency, and applied detail.
5. **Production gate**: AWS infrastructure/adapters, observability, benchmark, security, accessibility, and staged rollout.

### Parallel team strategy

After Foundational is complete:

- Team A owns US1 intake/worker/status.
- Team B owns US2 proposal/apply/tracker provenance using seeded fixtures.
- Team C owns US3 review/evidence using seeded fixtures.
- Team D owns US4 code/statement mapping, then integrates with US2/US3.
- Infrastructure work starts against stable adapter interfaces and merges only after story contracts pass locally.

## Notes

- `[P]` tasks change different files and do not depend on another unfinished task in their phase.
- `[US1]`–`[US4]` labels provide direct traceability to `spec.md`.
- Missing and blank always differ from zero; provider outputs never choose calculation destinations.
- Every imported final value retains batch/document/item provenance; audit and telemetry never contain tax data.
- Existing workbook import, dated cash activity, calculations, manual correction, and CPA signoff remain supported.
- Commit after each task or cohesive task group, and never commit real K-1 PDFs or provider/benchmark artifacts containing private values.
