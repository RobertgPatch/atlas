# Tasks: AWS K-1 PDF Ingestion

**Input**: Design documents from `specs/022-aws-k1-pdf-ingestion/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/k1-pdf-ingestion.openapi.yaml`, `quickstart.md`

**Tests**: The specification defines independent test scenarios, measurable extraction-accuracy gates, atomicity requirements, and restart/idempotency behavior. Test tasks are therefore included and should be written first so they fail before their implementation tasks begin.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested with seeded prerequisites before the complete workflow is connected.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same phase.
- **[Story]**: Maps the task to a user story in `spec.md`.
- Every task names the exact file or directory it changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the dependencies, configuration surface, and source-controlled AWS extraction assets needed by later phases.

- [X] T001 [P] Add AWS SDK v3 clients for S3 presigning, SQS, and Bedrock Data Automation Runtime plus PDF validation dependencies and API worker scripts in `apps/api/package.json` and `package-lock.json`
- [X] T002 [P] Add typed local/AWS ingestion settings, limits, feature flags, queue names, bucket/KMS identifiers, and BDA project/blueprint versions in `apps/api/src/config.ts` and `apps/api/.env.example`
- [X] T003 [P] Create version-controlled K-1 blueprint, mapping-schema, and sanitized evaluation-manifest directories with ownership notes in `infra/aws/bda/README.md`, `infra/aws/bda/blueprints/`, and `apps/api/tests/fixtures/k1-bda/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish durable persistence, provider-neutral contracts, object storage, and worker boundaries before implementing any user journey.

**Critical**: No user story implementation begins until this phase is complete.

- [X] T004 Define batch, item, extraction-attempt, canonical typed field, source-location, match, review, application, and official-provenance contracts in `packages/types/src/k1-ingestion.ts`, `packages/types/src/review-finalization.ts`, and `packages/types/src/k1-tracker.ts`
- [X] T005 [P] Add clean-install and legacy-upgrade integration tests covering new ingestion tables, constraints, backfill behavior, and unchanged tracker calculations in `apps/api/tests/k1-ingestion.migration.integration.test.ts`
- [X] T006 Add `k1_ingestion_batches`, `k1_ingestion_items`, `k1_extraction_attempts`, `k1_match_candidates`, `k1_document_applications`, `k1_application_field_decisions`, `k1_tracker_official_value_revisions`, and required document/field/issue columns and indexes in `apps/api/src/infra/db/migrations/030_aws_k1_pdf_ingestion.sql`
- [X] T007 Replace the process-local K-1 document map and opportunistic database mirror with PostgreSQL CRUD, version checks, and row-lock helpers in `apps/api/src/modules/k1/k1.repository.ts`
- [X] T008 Replace the process-local review map with PostgreSQL-backed fields, issues, correction history, and active-attempt queries in `apps/api/src/modules/review/review.repository.ts`
- [X] T009 Introduce a streaming `K1ObjectStore` interface and local implementation, then route upload, PDF range reads, extractor reads, and deletion through it in `apps/api/src/modules/k1/storage/K1ObjectStore.ts`, `apps/api/src/modules/k1/storage/localK1ObjectStore.ts`, `apps/api/src/modules/k1/storage/localPdfStore.ts`, and `apps/api/src/modules/k1/k1.routes.ts`
- [X] T010 [P] Implement private S3 put/head/read-range/delete and raw-result operations with checksum, version, and SSE-KMS metadata handling in `apps/api/src/modules/k1/storage/s3K1ObjectStore.ts`
- [X] T011 [P] Define idempotent start-work and completion message contracts plus local and SQS queue adapters in `apps/api/src/modules/k1/queue/K1WorkQueue.ts`, `apps/api/src/modules/k1/queue/localK1WorkQueue.ts`, and `apps/api/src/modules/k1/queue/sqsK1WorkQueue.ts`
- [X] T012 Create the extraction worker bootstrap, dependency wiring, graceful shutdown, and provider registry in `apps/api/src/workers/k1-extraction-worker.ts` and `apps/api/src/modules/k1/extraction/index.ts`
- [X] T013 Centralize entity-scope authorization, stable PII-safe ingestion errors, audit metadata, and sensitive-value log redaction in `apps/api/src/modules/k1/k1Scope.plugin.ts`, `apps/api/src/modules/k1/k1.schemas.ts`, and `apps/api/src/modules/k1/k1.types.ts`

**Checkpoint**: K-1 workflow state survives API restarts, every PDF access uses the storage abstraction, and local/AWS providers share the same durable contracts.

---

## Phase 3: User Story 1 - Upload a Batch of K-1 PDFs (Priority: P1) - MVP

**Goal**: Let an authorized user select up to 25 PDFs once, upload each independently, validate each object, and start durable processing without one failure blocking the batch.

**Independent Test**: With the local object-store and queue adapters, submit valid, invalid, encrypted, corrupt, oversized, duplicate, and interrupted uploads; valid items reach `QUEUED`, rejected items show stable reasons, retries do not create duplicate documents, and the batch survives an API restart.

### Tests for User Story 1

- [X] T014 [P] [US1] Add contract tests for create batch, upload slots, complete uploads, per-item validation errors, authorization, and batch status responses in `apps/api/tests/k1.batch.contract.test.ts`
- [X] T015 [P] [US1] Add integration tests for checksum verification, PDF signature/encryption/page validation, duplicate isolation, idempotent completion, interrupted retry, and restart persistence in `apps/api/tests/k1.batch-upload.integration.test.ts`
- [X] T016 [P] [US1] Add component tests for multi-select/drop, client validation, per-file progress, partial failure, retry, and duplicate messaging in `apps/web/src/features/k1/components/K1UploadDialog.test.tsx`

### Implementation for User Story 1

- [X] T017 [P] [US1] Add create-batch, complete-upload, batch snapshot, item status, upload slot, and stable error request/response validators in `apps/api/src/modules/k1/k1.schemas.ts` and `apps/api/src/modules/k1/k1.types.ts`
- [X] T018 [US1] Implement transactional batch/item creation, item transitions, derived batch status/counts, and content-hash duplicate queries in `apps/api/src/modules/k1/k1.repository.ts`
- [X] T019 [US1] Implement batch creation policy for 1-25 files, declared metadata validation, opaque object keys, idempotency, and per-file isolation in `apps/api/src/modules/k1/ingestion/k1Batch.service.ts`
- [X] T020 [P] [US1] Implement short-lived S3 presigned PUT slots constrained by checksum, content type, size policy, quarantine prefix, and KMS encryption in `apps/api/src/modules/k1/ingestion/k1UploadSlots.service.ts`
- [X] T021 [P] [US1] Implement same-origin local development upload slots that exercise the production batch contract without AWS credentials in `apps/api/src/modules/k1/ingestion/localUploadSlots.service.ts` and `apps/api/src/modules/k1/k1.routes.ts`
- [X] T022 [US1] Verify uploaded object size/checksum/version, inspect PDF signature/encryption/page count, persist `documents` and `k1_documents`, and reject exact duplicates safely in `apps/api/src/modules/k1/ingestion/k1UploadCompletion.service.ts`
- [X] T023 [US1] Enqueue one deterministic start-work message per accepted item and commit item/batch state transitions idempotently in `apps/api/src/modules/k1/ingestion/k1UploadCompletion.service.ts`
- [X] T024 [US1] Register create, get, local-upload, and complete-upload endpoints with entity authorization and per-item error responses in `apps/api/src/modules/k1/k1.routes.ts`
- [X] T025 [P] [US1] Add browser SHA-256, create-batch, direct PUT progress, completion, retry, and typed error methods in `apps/web/src/features/k1/api/k1Client.ts`
- [X] T026 [US1] Replace the single-file dialog with accessible multi-select/drop, per-file validation/progress/retry/removal, partial-success completion, and duplicate-safe resume behavior in `apps/web/src/features/k1/components/K1UploadDialog.tsx`
- [X] T027 [US1] Show the active batch summary and navigation to independently progressing items on the existing K-1 dashboard in `apps/web/src/pages/K1Dashboard.tsx` and `apps/web/src/features/k1/hooks/useK1Queries.ts`

**Checkpoint**: A local user can upload a mixed batch in one action, valid files queue independently, and no application server deployment is required for the MVP upload path.

---

## Phase 4: User Story 2 - Extract Every K-1 Field into a Reviewable Draft (Priority: P1)

**Goal**: Process each accepted PDF through the local stub or AWS BDA, retain immutable attempts/raw output, and account for every present K-1 value or an explicit issue with page evidence.

**Independent Test**: Seed an accepted document and process the sanitized fixture set through the stub and recorded BDA result importer; all 48 official keys and 31 literal calculation destinations are covered, repeated rows remain distinct, unsupported content becomes issues, duplicate events are idempotent, and retries preserve prior attempts.

### Tests for User Story 2

- [X] T028 [P] [US2] Add destination-inventory and canonical-mapper tests proving all 48 official keys and all writable calculation keys are mapped, derived, dated-activity-authoritative, or excluded exactly once with no deprecated output in `apps/api/tests/k1.bda-mapper.test.ts`
- [X] T029 [P] [US2] Add tolerant BDA result parser tests for `MATCH`, `NO_MATCH`, `FALLBACK`, unknown statuses, standard-output geometry, repeated rows, continuation pages, blank fields, signs, and unknown provider fields in `apps/api/tests/k1.bda-output-parser.test.ts`
- [X] T030 [P] [US2] Add worker integration tests for duplicate start/completion messages, deterministic client tokens, raw-result integrity, missing-event reconciliation, throttling backoff, and atomic attempt promotion in `apps/api/tests/k1.extraction-worker.integration.test.ts`
- [X] T031 [P] [US2] Add retry tests proving immutable prior attempts, no PDF re-upload, version conflict handling, and active-attempt promotion only after success in `apps/api/tests/k1.retry-extraction.integration.test.ts`
- [X] T032 [P] [US2] Build the sanitized fixture manifest, synthetic PDF generator, expected canonical JSON, expected issues, and coverage assertions described by the quickstart in `apps/api/tests/fixtures/k1-bda/manifest.json` and `apps/api/tests/helpers/k1BdaFixture.ts`

### Implementation for User Story 2

- [X] T033 [US2] Define and implement the versioned destination inventory, direct mappings, reviewed derivations, dated-activity rules, workpaper exclusions, Box 13 policy, and historical Line 18 policy in `apps/api/src/modules/k1/extraction/k1DestinationInventory.ts`
- [X] T034 [US2] Parse BDA custom and standard output into provider-neutral typed occurrences with confidence, reading order, page/bounding-box evidence, and unmatched evidence retention in `apps/api/src/modules/k1/extraction/mapBdaResult.ts`
- [X] T035 [P] [US2] Implement deterministic normalization and validation for money signs, dates, percentages, choices, checkboxes, identifiers, mutually exclusive fields, and repeated rows in `apps/api/src/modules/k1/extraction/k1DraftValidation.ts`
- [X] T036 [US2] Implement `InvokeDataAutomationAsync` and `GetDataAutomationStatus` behind the existing extractor abstraction with pinned project/blueprint/mapping versions and deterministic client tokens in `apps/api/src/modules/k1/extraction/bdaExtractor.ts` and `apps/api/src/modules/k1/extraction/K1Extractor.ts`
- [X] T037 [P] [US2] Define the recent Form 1065 Schedule K-1 custom blueprint plus fallback configuration, repeated coded sections, and output schema metadata in `infra/aws/bda/blueprints/k1-form-1065.json` and `infra/aws/bda/blueprints/fallback.json`
- [X] T038 [US2] Implement append-only extraction-attempt creation, submission/job identity updates, terminal transitions, raw-result hashes, retry lineage, and active-attempt promotion in `apps/api/src/modules/k1/extraction/k1ExtractionAttempt.repository.ts`
- [X] T039 [US2] Consume start-work messages, lock/idempotently create the attempt, submit one BDA job per PDF, and persist retryable/non-retryable failures in `apps/api/src/modules/k1/worker/k1StartWork.handler.ts`
- [X] T040 [US2] Consume completion messages, retrieve and integrity-check raw output, persist versioned field occurrences/issues/evidence, run matching eligibility, and promote one succeeded attempt atomically in `apps/api/src/modules/k1/worker/k1Completion.handler.ts`
- [X] T041 [P] [US2] Reconcile stale submitted/in-progress jobs with `GetDataAutomationStatus` and import missed EventBridge completions idempotently in `apps/api/src/modules/k1/worker/k1ExtractionReconciler.ts` and `apps/api/src/scripts/run-k1-extraction-reconciler.ts`
- [X] T042 [US2] Add version-aware retry-extraction validation, attempt creation, queueing, and audit behavior to `apps/api/src/modules/k1/k1.routes.ts` and `apps/api/src/modules/k1/extraction/k1Retry.service.ts`
- [X] T043 [US2] Detect multiple-K-1 packages, unrelated tax forms, unsupported revisions, missing pages, fallback classification, and unknown fields and route them to explicit review issues in `apps/api/src/modules/k1/extraction/k1DocumentClassification.ts`
- [X] T044 [US2] Extend the deterministic stub to run through the same attempt, queue, canonical-draft, issue, matching, and persistence pipeline for fully local development in `apps/api/src/modules/k1/extraction/stubExtractor.ts` and `scripts/dev-local.ps1`
- [X] T045 [P] [US2] Provision a dedicated private versioned document/evidence bucket, customer-managed KMS key, lifecycle rules, and bucket policies in `infra/aws/terraform/modules/k1_ingestion/storage.tf`, `infra/aws/terraform/modules/k1_ingestion/variables.tf`, and `infra/aws/terraform/modules/k1_ingestion/outputs.tf`
- [X] T046 [P] [US2] Provision start/completion queues, dead-letter queues, redrive/visibility policies, and the BDA EventBridge completion target in `infra/aws/terraform/modules/k1_ingestion/queues.tf` and `infra/aws/terraform/modules/k1_ingestion/events.tf`
- [X] T047 [US2] Provision the ECS/Fargate worker, scheduled reconciler, VPC access, least-privilege S3/SQS/KMS/BDA IAM, and environment wiring in `infra/aws/terraform/modules/k1_ingestion/worker.tf`, `infra/aws/terraform/modules/k1_ingestion/iam.tf`, and `infra/aws/terraform/main.tf`
- [X] T048 [US2] Add the Cloud Control provider resources and gated DEVELOPMENT-to-LIVE evaluation/promotion script for immutable BDA blueprint/project versions in `infra/aws/terraform/providers.tf`, `infra/aws/terraform/modules/k1_ingestion/bda.tf`, and `scripts/promote-k1-bda-blueprint.ps1`

**Checkpoint**: Every fixture field is either a traceable typed value or an explicit issue, retries and duplicate events are safe, local extraction works offline, and real BDA can be exercised by a local or staged worker.

---

## Phase 5: User Story 3 - Match and Review the Extracted K-1 (Priority: P1)

**Goal**: Propose safe identifier-first targets and let a reviewer compare every typed field with the source PDF, resolve issues, and preserve machine and human values separately.

**Independent Test**: Seed exact, ambiguous, conflicting, and missing TIN/EIN/name cases plus low-confidence/invalid/unmapped fields; only unique identifier-consistent targets are preselected, no records are silently created, every exception blocks apply, and corrections retain raw history and evidence.

### Tests for User Story 3

- [X] T049 [P] [US3] Add matching integration tests for normalized/masked TIN and EIN, duplicate identifiers, conflicting names, missing records, tax-year resolution, authorization changes, and no background auto-create in `apps/api/tests/k1.matching.integration.test.ts`
- [X] T050 [P] [US3] Extend review tests for PostgreSQL restart durability, active-attempt scoping, typed repeated fields, correction history, optimistic concurrency, issue resolution, and object-store PDF authorization in `apps/api/tests/review.flow.integration.test.ts`, `apps/api/tests/review.concurrency.integration.test.ts`, and `apps/api/tests/review.raw-value-immutability.integration.test.ts`
- [X] T051 [P] [US3] Add review workspace tests for all form sections, repeated rows, flags, candidate resolution, PDF page jumps, corrections, unsaved changes, and apply blocking reasons in `apps/web/src/pages/K1ReviewWorkspace.test.tsx`

### Implementation for User Story 3

- [X] T052 [US3] Implement identifier normalization, masked evidence, entity-by-TIN and partnership-by-EIN lookup, name candidate scoring, contradiction detection, and tax-year inference in `apps/api/src/modules/k1/matching/k1Matcher.service.ts`
- [X] T053 [US3] Persist proposed/selected/rejected candidates and reviewer decisions without storing unmasked identifiers in candidate signals in `apps/api/src/modules/k1/matching/k1Match.repository.ts`
- [X] T054 [US3] Implement revision-aware match resolution with entity/partnership consistency checks, explicit reviewed creation handoff, issue updates, and authorization recheck in `apps/api/src/modules/k1/matching/k1Match.service.ts` and `apps/api/src/modules/k1/k1.routes.ts`
- [X] T055 [US3] Return the active attempt, typed occurrences, raw/normalized/corrected/effective values, issues, candidate evidence, history summaries, PDF URL, and apply blockers from PostgreSQL in `apps/api/src/modules/review/session.handler.ts` and `apps/api/src/modules/review/review.types.ts`
- [X] T056 [US3] Save typed corrections with `If-Match`, retain immutable provider values, append reviewer history/audit, and reject inactive-attempt fields in `apps/api/src/modules/review/corrections.handler.ts` and `apps/api/src/modules/review/review.repository.ts`
- [X] T057 [US3] Resolve field/row and document-level issues only when validation and reviewer requirements are met, including unsupported/unmatched evidence acknowledgements, in `apps/api/src/modules/review/issue.handler.ts` and `apps/api/src/modules/review/finalize.handler.ts`
- [X] T058 [P] [US3] Stream authorized local/S3 PDFs with HTTP range support through the object-store abstraction and remove direct filesystem access in `apps/api/src/modules/k1/k1.routes.ts` and `apps/api/src/modules/k1/storage/K1ObjectStore.ts`
- [X] T059 [US3] Extend review and K-1 route schemas for typed values, source locations, attempt history, match candidates/resolution, blockers, and status transitions in `apps/api/src/modules/review/review.schemas.ts`, `apps/api/src/modules/review/review.routes.ts`, and `apps/api/src/modules/k1/k1.schemas.ts`
- [X] T060 [P] [US3] Update typed review/match/correction clients and React Query cache/version behavior in `apps/web/src/features/review/api/reviewClient.ts`, `apps/web/src/features/review/hooks/useReviewSession.ts`, and `apps/web/src/features/k1/api/k1Client.ts`
- [X] T061 [US3] Render all supported header, Part I, Part II, Part III, checkbox, capital, liability, and repeated coded fields from the canonical draft while reusing tracker field definitions in `apps/web/src/pages/K1ReviewWorkspace.tsx` and `apps/web/src/features/review/components/ParsedFieldRow.tsx`
- [X] T062 [P] [US3] Add source-page/bounding-box selection, keyboard navigation, and accessible evidence highlighting to `apps/web/src/features/review/components/PdfPanel.tsx`
- [X] T063 [US3] Add masked candidate evidence, explicit record creation/selection handoff, issue filters, correction history, attempt history, and clear readiness blockers in `apps/web/src/pages/K1ReviewWorkspace.tsx`, `apps/web/src/features/review/components/EntityTypeahead.tsx`, `apps/web/src/features/review/components/PartnershipTypeahead.tsx`, and `apps/web/src/features/review/components/IssueQueueDialog.tsx`

**Checkpoint**: Reviewers can resolve target identity and inspect or correct every extracted occurrence with source evidence, while ambiguous data and unresolved issues cannot be silently accepted.

---

## Phase 6: User Story 4 - Apply Reviewed K-1s to the Application (Priority: P1)

**Goal**: Preview field-level conflicts and atomically populate calculation and official-form data with complete provenance, revision safety, recalculation, and sign-off invalidation.

**Independent Test**: Seed a ready reviewed draft and apply it to empty and populated years; verify explicit merge decisions, `FINALIZED_K1` and official revisions, stale-preview rejection, dated-activity authority, downstream calculations/sign-offs, and complete rollback after injected failures.

### Tests for User Story 4

- [X] T064 [P] [US4] Add apply-preview/apply integration tests for empty/populated years, conflict defaults, stale document/year revisions, expired previews, retries, duplicate submits, injected rollback, and authorization loss in `apps/api/tests/k1.apply.integration.test.ts`
- [X] T065 [P] [US4] Extend tracker regression tests for `FINALIZED_K1` provenance, official-field revisions, dated capital activity authority, calculation equivalence, revision increments, and target/downstream sign-off invalidation in `apps/api/tests/k1-tracker.source-sync.integration.test.ts`, `apps/api/tests/k1-tracker.persistence.integration.test.ts`, `apps/api/tests/partnership-tracker.reconciliation.integration.test.ts`, and `apps/api/tests/partnership-tracker.signoff.contract.test.ts`
- [X] T066 [P] [US4] Add web tests for conflict decisions, stale refresh, atomic failure retention, applied navigation, and field provenance display in `apps/web/src/pages/K1ReviewWorkspace.test.tsx` and `apps/web/src/features/k1-tracker/components/K1YearEntryForm.test.tsx`

### Implementation for User Story 4

- [X] T067 [P] [US4] Add apply-preview, field-decision, apply request/response, official source metadata, expiry, and concurrency validators in `packages/types/src/k1-ingestion.ts`, `apps/api/src/modules/k1/k1.schemas.ts`, and `apps/api/src/modules/k1-tracker/k1-official-form.zod.ts`
- [X] T068 [US4] Compile reviewed typed occurrences into the 31 literal calculation destinations and 48 official destinations with explicit Box 13/Line 18/deduction-sign/dated-activity policies in `apps/api/src/modules/k1/application/k1ApplicationMapper.ts`
- [X] T069 [US4] Implement revision-bound preview creation, existing-value comparison, conflict/evidence decisions, target-year creation policy, and preview expiry in `apps/api/src/modules/k1/application/k1ApplyPreview.service.ts`
- [X] T070 [P] [US4] Implement append-only active official-field revisions and deterministic `official_form_data` snapshot rebuilding in `apps/api/src/modules/k1-tracker/k1OfficialRevision.repository.ts`
- [X] T071 [US4] Implement the row-locked atomic apply transaction covering version revalidation, calculation revisions, official revisions/snapshot, decisions, status/provenance links, audit, and rollback in `apps/api/src/modules/k1/application/k1Apply.service.ts`
- [X] T072 [US4] Reuse tracker recalculation, projection persistence, revision increments, and existing target/downstream sign-off invalidation policy from the apply transaction in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T073 [US4] Register authorized `apply-preview` and `apply` endpoints with stable `409` stale/conflict responses and idempotent success behavior in `apps/api/src/modules/k1/k1.routes.ts`
- [X] T074 [US4] Remove financial writes from lazy GET-time `syncFinalizedSources()` and route legacy finalized documents through the explicit apply path in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T075 [US4] Return official field source metadata alongside the compatibility snapshot and calculation provenance in `apps/api/src/modules/k1-tracker/k1-tracker.contracts.ts`, `apps/api/src/modules/k1-tracker/k1-tracker.handler.ts`, and `packages/types/src/k1-tracker.ts`
- [X] T076 [P] [US4] Add typed preview/apply mutations, optimistic cache invalidation, stale-refresh handling, and idempotency behavior in `apps/web/src/features/k1/api/k1Client.ts` and `apps/web/src/features/review/hooks/useReviewSession.ts`
- [X] T077 [US4] Add field-level keep-existing/use-extracted decisions, grouped conflict summaries, dated-activity explanations, and blocking validation to `apps/web/src/pages/K1ReviewWorkspace.tsx`
- [X] T078 [US4] Show applied status, source-document/reviewer metadata, and navigation to the populated partnership year in `apps/web/src/pages/K1ReviewWorkspace.tsx`, `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`, and `apps/web/src/pages/K1TrackerPage.tsx`

**Checkpoint**: Reviewed K-1s update the financial source of truth only through one explicit, atomic, revision-aware transaction with no silent overwrite and complete field-level lineage.

---

## Phase 7: User Story 5 - Manage Batch Progress and Exceptions (Priority: P2)

**Goal**: Provide a durable processing queue where users can leave and return, filter attention items, inspect attempts, retry transient failures, cancel eligible items, and open completed reviews.

**Independent Test**: Seed a batch with every operational state, restart the API/worker, and verify list/filter counts, polling, retry lineage, eligible cancellation, terminal-state protection, and navigation to review without relying on in-memory state.

### Tests for User Story 5

- [X] T079 [P] [US5] Add API tests for batch collection filters, authorization scope, aggregate status, cancellation, retry eligibility, attempt history, pagination, and restart durability in `apps/api/tests/k1.batch-queue.integration.test.ts`
- [X] T080 [P] [US5] Add queue UI tests for status/count rendering, attention filters, leave-and-return refresh, retry/cancel actions, per-file errors, and review navigation in `apps/web/src/features/k1/components/K1BatchQueue.test.tsx`

### Implementation for User Story 5

- [X] T081 [P] [US5] Extend the API contract with paginated/filterable batch collection and attempt-history response schemas in `specs/022-aws-k1-pdf-ingestion/contracts/k1-pdf-ingestion.openapi.yaml`, `apps/api/src/modules/k1/k1.schemas.ts`, and `packages/types/src/k1-ingestion.ts`
- [X] T082 [US5] Implement entity-scoped batch/item listing, filtering, pagination, counts, and latest-attempt summaries in `apps/api/src/modules/k1/k1.repository.ts`
- [X] T083 [US5] Recompute batch aggregate state transactionally after every item transition, retry, cancel, and apply outcome in `apps/api/src/modules/k1/ingestion/k1BatchStatus.service.ts`
- [X] T084 [US5] Implement cancellation eligibility, row locking, queue-safe state transitions, recoverable quarantine cleanup, and applied/retained-document protections in `apps/api/src/modules/k1/ingestion/k1Cancel.service.ts` and `apps/api/src/modules/k1/k1.routes.ts`
- [X] T085 [US5] Expose immutable attempt/error/retry history with PII-safe summaries and active-attempt identification in `apps/api/src/modules/k1/k1.routes.ts` and `apps/api/src/modules/k1/extraction/k1ExtractionAttempt.repository.ts`
- [X] T086 [P] [US5] Add batch collection/status/history queries, bounded polling, retry/cancel mutations, and reconnect refetch behavior in `apps/web/src/features/k1/hooks/useK1Queries.ts` and `apps/web/src/features/k1/api/k1Client.ts`
- [X] T087 [US5] Build the accessible processing queue with per-batch/item progress, status labels, counts, timestamps, errors, and review links in `apps/web/src/features/k1/components/K1BatchQueue.tsx` and `apps/web/src/pages/K1Dashboard.tsx`
- [X] T088 [US5] Add attention/status filters, retry confirmation, cancel confirmation, attempt-history detail, and durable resume behavior in `apps/web/src/features/k1/components/K1BatchQueue.tsx`

**Checkpoint**: Users can manage asynchronous work after leaving the upload flow, and all controls operate on durable server state.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Harden security, observability, evaluation, operations, and rollout across all five stories.

- [X] T089 [P] Add end-to-end entity authorization and permission-loss regression coverage for upload, status, PDF read, retry, match, correction, issue resolution, preview, apply, and cancel in `apps/api/tests/k1.authz.integration.test.ts`
- [X] T090 [P] Add structured IDs-only workflow logging, sensitive-value redaction tests, operational metrics, and actionable error classification in `apps/api/src/modules/k1/k1Observability.ts` and `apps/api/tests/k1.logging-security.test.ts`
- [X] T091 Add CloudWatch dashboards/alarms for queue age/depth, DLQs, worker errors, extraction failures, reconciliation lag, apply failures, page counts, and budget thresholds in `infra/aws/terraform/modules/observability/main.tf` and `infra/aws/terraform/modules/budgets/main.tf`
- [X] T092 [P] Document and enforce S3/database retention, backup/restore, applied-document deletion restrictions, KMS rotation, and incident recovery in `docs/deployment/k1-document-retention.md` and `infra/aws/terraform/modules/k1_ingestion/storage.tf`
- [X] T093 Build the sanitized evaluation runner and report field accounting, normalized exact match, issue recall, false-safe rate, matcher accuracy, grounding accuracy, and apply equivalence in `apps/api/src/scripts/evaluate-k1-bda.ts` and `apps/api/tests/fixtures/k1-bda/README.md`
- [X] T094 [P] Add a 25-document load/idempotency test covering upload interaction time, queue throughput, throttling/backoff, memory bounds, and one-document failure isolation in `apps/api/tests/k1.batch-load.integration.test.ts`
- [X] T095 [P] Validate and synchronize the OpenAPI contract, shared contracts, environment documentation, local/AWS modes, and operational commands in `specs/022-aws-k1-pdf-ingestion/contracts/k1-pdf-ingestion.openapi.yaml`, `specs/022-aws-k1-pdf-ingestion/quickstart.md`, and `docs/deployment/environment-strategy.md`
- [X] T096 Execute the local batch, matching/review, atomic-apply, retry/idempotency, restart, and fault-injection scenarios and record verified results in `specs/022-aws-k1-pdf-ingestion/quickstart.md`
- [X] T097 Run clean and upgrade migration suites against legacy K-1/review/tracker/sign-off data and document any required forward-fix procedure in `specs/022-aws-k1-pdf-ingestion/quickstart.md`
- [ ] T098 Run Terraform formatting/validation/plan plus the approved `us-west-2` staging BDA smoke, reconciliation, throttling, DLQ, IAM, KMS, and cross-Region-inference checks and record evidence in `specs/022-aws-k1-pdf-ingestion/quickstart.md`
- [ ] T099 Run full API/web test and build gates, keep `K1_AWS_INGESTION_ENABLED=false` until production criteria pass, and document cohort rollout/rollback in `specs/022-aws-k1-pdf-ingestion/quickstart.md` and `apps/api/.env.example`
- [X] T100 Expand recognized Schedule K-1 (Form 1065) revisions from the 2024/2025-only gate to the application-supported 2000-2025 range, retain blocking behavior for unknown/out-of-range revisions, and add classifier/fixture regressions in `apps/api/src/modules/k1/extraction/k1DocumentClassification.ts`, `infra/aws/bda/`, and `apps/api/tests/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: No dependencies; T001-T003 can run in parallel.
- **Phase 2 - Foundational**: Depends on Phase 1 and blocks all user stories. Write T005 before T006; complete T006 before T007-T008; T009-T011 can then proceed in parallel; finish T012-T013 before story work.
- **Phase 3 - US1**: Depends on Phase 2 and delivers the first independently demonstrable local increment.
- **Phase 4 - US2**: Depends on Phase 2 for seeded-document tests; connecting upload to extraction depends on US1.
- **Phase 5 - US3**: Depends on Phase 2 for seeded-draft tests; the complete journey depends on US2 output.
- **Phase 6 - US4**: Depends on Phase 2 for seeded reviewed-draft tests; the complete journey depends on US2 and US3.
- **Phase 7 - US5**: Depends on Phase 2 for seeded queue-state tests; retry/review/apply navigation integrates US1-US4.
- **Phase 8 - Polish**: Depends on all stories selected for release; staging gates require the AWS portions of US2.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 Batch Upload ---------+
                     -> US2 Extraction ----------+--> US5 Durable Queue
                     -> US3 Match and Review ----+
                     -> US4 Atomic Apply --------+

Integrated production journey: US1 -> US2 -> US3 -> US4
Seeded independent tests: Foundation -> each US1/US2/US3/US4/US5
```

### Within Each User Story

1. Write the listed tests first and confirm they fail for the intended missing behavior.
2. Add schemas/contracts and persistence before services.
3. Implement services before route handlers and UI clients.
4. Connect UI components only after API contracts pass.
5. Run the independent test at the story checkpoint before moving to dependent integration work.

---

## Parallel Opportunities

### User Story 1

- T014, T015, and T016 can be written in parallel.
- T020 and T021 can proceed in parallel after T019 defines slot policy.
- T025 can proceed against the contract while T022-T024 implement the server.

### User Story 2

- T028-T032 can be written in parallel against recorded/synthetic fixtures.
- T035 and T037 can proceed in parallel after T033 defines the inventory.
- T041, T045, and T046 can proceed in parallel with core worker handlers.

### User Story 3

- T049-T051 can be written in parallel.
- T058 and T060 can proceed in parallel with T052-T057.
- T062 can proceed after the source-location response contract is fixed.

### User Story 4

- T064-T066 can be written in parallel.
- T070 can proceed in parallel with T068-T069.
- T076 can proceed against T067 while the apply transaction is implemented.

### User Story 5

- T079 and T080 can be written in parallel.
- T081 and T086 can proceed in parallel after the response shape is agreed.
- T087 can be built against fixtures while T082-T085 implement server behavior.

---

## Implementation Strategy

### Local MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 using local object-store and queue adapters.
3. Complete US2 through the deterministic stub and recorded BDA importer.
4. Complete US3 and US4 locally with PostgreSQL and synthetic fixtures.
5. Validate the entire financial workflow locally before requiring AWS staging.

### Incremental AWS Delivery

1. Deploy dormant storage, queue, worker, BDA, and observability infrastructure behind the feature flag.
2. Run the sanitized fixture corpus against the DEVELOPMENT blueprint.
3. Promote an immutable passing blueprint to LIVE and run the 25-document staging smoke test.
4. Enable internal staging users, then a small reviewed production cohort.
5. Expand only while accuracy, false-safe, queue, failure, security, and cost gates remain within thresholds.

### Suggested MVP Scope

The smallest useful slice is Phase 1 + Phase 2 + US1: durable multi-file local upload with independent validation/status. The first complete business-value release is US1-US4 in local/stub mode; AWS BDA activation follows the staging gates in US2 and Phase 8.

---

## Notes

- `[P]` means different files or isolated test work; do not parallelize tasks that modify the same listed file without coordination.
- PostgreSQL is the workflow source of truth; do not add new process-local state or best-effort mirrors.
- The original PDF, raw provider result, provider value, reviewer correction, conflict decision, and applied revision remain distinguishable.
- Never emit the deprecated `section_l_capital_contributed` or `box_13_other_deductions` keys or populate the 11 workpaper-only fields from a PDF.
- Background extraction never creates entities/partnerships or updates tracker values.
- Commit after each task or coherent task group, while preserving unrelated worktree changes.
