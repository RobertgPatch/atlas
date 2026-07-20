# Implementation Plan: Multi-PDF K-1 Import

**Branch**: `020-k1-pdf-import` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-k1-pdf-import/spec.md` and the user-supplied AWS human-in-the-loop K-1 extraction recommendation.

## Summary

Add a partnership-scoped, multi-PDF Schedule K-1 import workflow that lets a user select a batch such as five historical K-1s, processes every PDF durably, detects one tax year per document, preserves exhaustive source evidence and unknown box/code items, and atomically creates or updates the matching existing K-1 tracker years after CPA review.

Production uses direct private S3 uploads, a Standard Step Functions workflow, bounded Fargate worker tasks, Textract OCR/layout evidence, a versioned Bedrock Data Automation K-1 blueprint, and a constrained Bedrock semantic reconciliation pass. PostgreSQL stores batch/run/review state and normalized evidence; accepted values flow into the current tracker value revisions and `official_form_data`. The existing complete K-1 form remains the final edit/calculation/signoff surface. AI output never bypasses deterministic validation, review metadata, revision checks, or signoff invalidation.

## Technical Context

**Language/Version**: Node.js 22+; API TypeScript 5.7; web TypeScript `~6.0.2`; Terraform `>=1.6`
**Primary Dependencies**: Existing Fastify 5, React 19.2, TanStack Query, Zod 3, `pg`, Tailwind CSS 3.4, Lucide, Vitest 2, React Testing Library; add focused AWS SDK for JavaScript v3 clients for S3/presigning, Step Functions, Textract, Bedrock Data Automation Runtime, and Bedrock Runtime; add `pdfjs-dist` for page rendering and evidence overlays
**Storage**: Existing PostgreSQL 16 tracker/value/signoff model plus new PDF import evidence tables; dedicated private S3 bucket for original PDFs and immutable provider artifacts with SSE-KMS/versioning/lifecycle
**Testing**: Vitest unit/contract/component tests; isolated PostgreSQL integration tests; recorded synthetic Textract/BDA/Bedrock fixtures; opt-in live AWS smoke; benchmark CLI against an external CPA-approved corpus; web/API builds; Terraform fmt/validate/plan; responsive/keyboard/evidence verification
**Target Platform**: Jackson React browser application; Node API and one-shot workers on AWS ECS/Fargate; AWS Step Functions Standard, S3, KMS, Textract, Bedrock Data Automation/Runtime, CloudWatch; local fixture adapters for development/CI
**Project Type**: npm-workspace web/API/shared-types monorepo with Terraform infrastructure
**Performance Goals**: Upload five PDFs in one action; keep upload progress responsive; process documents concurrently with default maximum five; 95% of supported batches reach reviewable/actionable failure within five minutes; batch/detail polling responses remain sub-second at current scale; atomic apply of 20 year decisions completes within the normal API timeout
**Constraints**: One partnership per batch; 1-20 PDFs; 25 MiB per PDF for MVP; one Schedule K-1 per file; no password-protected PDFs; no direct extractor-to-final write; missing is distinct from zero; preserve all 42 calculation placements, 48 official-form placements, calculation formulas, dated-cash ownership, optimistic revisions, audit, and signoff semantics; no raw tax data in logs/telemetry/source control; no live AWS dependency in ordinary CI; no page-level overflow at 390 CSS pixels
**Scale/Scope**: Single-tenant financial application; low tens of users; batch history per partnership; up to 20 documents and approximately 1,000 exhaustive items per document; bounded AWS concurrency and per-run cost attribution

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific principles. The following repository-local financial, security, and delivery gates are authoritative for this plan.

1. **Canonical financial model**: PASS. Imported values enter the existing tracker repository, calculation projection, revision, and signoff model; no duplicate final ledger is introduced.
2. **Human review boundary**: PASS. Extracted candidates and proposals remain separate from final values until an authorized user explicitly applies create/merge/replace/skip decisions.
3. **No information loss**: PASS. Dynamic box/code/detail and statement items remain first-class even when no canonical mapping exists.
4. **Exact financial normalization**: PASS. Money normalization is deterministic, decimal-string compatible, and preserves blank/null separately from zero.
5. **Optimistic and atomic writes**: PASS. Batch/proposal/year revisions are checked and all selected year decisions apply in one PostgreSQL transaction.
6. **Audit and provenance**: PASS. Every imported tracker/official/dynamic value links to batch, PDF, run, source item, evidence, and append-only review decisions.
7. **Signoff integrity**: PASS. Material import changes use existing revision increments and signoff invalidation; import readiness is never signoff.
8. **Least privilege and privacy**: PASS. Private S3/KMS, short-lived authorized URLs, separate worker/API roles, no public objects, and telemetry redaction are designed in.
9. **Provider isolation**: PASS. AWS services sit behind typed adapters and strict Zod/JSON Schema validation; ordinary tests use recorded synthetic fixtures.
10. **Durable background work**: PASS. Step Functions, Fargate, PostgreSQL states, deterministic tokens, and retry-safe writes replace process-local fire-and-forget work.
11. **Backward compatibility**: PASS. Workbook import and legacy K-1 review remain operational; PDF import gets separate tables and explicit source columns rather than mutating workbook invariants.
12. **Accessibility and responsive access**: PASS. Upload, review, evidence, decisions, and apply have keyboard, focus, live-region, non-color, 200%-zoom, and 390-pixel contracts.
13. **Private-reference handling**: PASS. Real K-1 PDFs, answer keys, provider outputs, prompts containing tax data, and benchmark reports remain outside git.
14. **Measured AI quality**: PASS. A versioned CPA-approved benchmark gates production schema/blueprint/inference-profile promotion.
15. **Infrastructure review**: PASS. Terraform models storage, KMS, Step Functions, ECS worker, IAM, logs, and alarms; staging validation precedes production.

### Post-Phase 1 Re-check

Re-evaluated after [research.md](./research.md), [data-model.md](./data-model.md), [API contract](./contracts/k1-pdf-import.openapi.yaml), [extraction schema](./contracts/k1-extraction-output.schema.json), [UI contract](./contracts/k1-pdf-import-ui.md), and [quickstart.md](./quickstart.md). All gates remain **PASS** and no unresolved clarification or constitution exception remains.

## Architecture

```text
Partnership K-1 workspace
  |
  | create batch + direct presigned uploads
  v
Private S3 (raw PDFs, SSE-KMS)
  |
  | complete uploads / start execution
  v
Step Functions Standard (one batch)
  |
  `-- bounded Map (one Fargate worker per PDF)
        |-- verify object, PDF, SHA-256, idempotency
        |-- Textract async OCR/forms/tables/queries/layout
        |-- BDA async versioned K-1 blueprint
        |-- Bedrock structured code/statement reconciliation
        |-- deterministic normalize/map/validate
        `-- persist items, evidence, findings, year proposal
  |
  v
Import review workspace (exceptions + PDF evidence)
  |
  | atomic create / merge / replace / skip
  v
Existing k1_tracker_years
  |-- calculation value revisions
  |-- official_form_data + field source links
  |-- dynamic code value revisions
  |-- projection recalculation/conflicts
  `-- normal CPA review and signoff
```

### Trust Boundaries

- The browser may provide filename, size, client hash, and UI decisions; the API/worker verifies object identity, hash, scope, destinations, revisions, and lifecycle.
- Presigned upload/download instructions are capabilities with short expiry, narrow object keys, and no durable client storage.
- Provider payloads are untrusted inputs validated against versioned schemas before persistence or mapping.
- The semantic model proposes source-faithful values; deterministic code alone selects calculation/official destinations and financial aggregation behavior.
- Step Functions execution status is operational; PostgreSQL is the product-facing lifecycle source.
- Only the atomic apply transaction may create active imported tracker revisions.

## Project Structure

### Documentation (this feature)

```text
specs/020-k1-pdf-import/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
`-- contracts/
    |-- k1-pdf-import.openapi.yaml
    |-- k1-extraction-output.schema.json
    `-- k1-pdf-import-ui.md
```

`tasks.md` is intentionally not generated by this planning command; run the separate Spec Kit tasks workflow after reviewing this plan.

### Source Code (repository root)

```text
packages/types/src/
|-- k1-pdf-import.ts                  # shared lifecycle, item, finding, proposal, API types
|-- k1-tracker.ts                     # PDF_IMPORT source type and provenance extensions
`-- partnership-tracker.ts            # route request/response re-exports

apps/api/src/modules/k1-pdf-import/
|-- k1-pdf-import.contracts.ts        # API/domain contracts
|-- k1-pdf-import.zod.ts              # strict boundary schemas
|-- k1-pdf-import.types.ts            # database rows/internal types
|-- k1-pdf-import.repository.ts       # batch/document/run/review/proposal persistence
|-- k1-pdf-import.handler.ts          # scoped HTTP handlers
|-- k1-pdf-import.routes.ts           # partnership-scoped endpoints
|-- k1-pdf-import.errors.ts           # controlled public errors
|-- apply-import.ts                    # atomic multi-year tracker application
|-- proposal.ts                        # effective review decisions -> exact proposal
|-- normalization/
|   |-- money.ts                       # exact sign/null normalization
|   |-- identity.ts                    # masked comparison normalization
|   `-- geometry.ts                    # provider boxes -> normalized page geometry
|-- extraction/
|   |-- K1PdfExtractor.ts              # provider-neutral interface
|   |-- schema.ts                      # semantic schema/Zod validation
|   |-- textract.ts                    # OCR/layout/forms/tables/query adapter
|   |-- bedrockDataAutomation.ts       # BDA async blueprint adapter
|   |-- bedrockSemantic.ts             # strict Bedrock reconciliation adapter
|   |-- ensemble.ts                    # candidates/agreement/risk selection
|   `-- fixtureExtractor.ts            # recorded synthetic local/CI adapter
|-- mapping/
|   |-- k1SourceFieldMap.ts             # fixed source -> tracker/official destinations
|   |-- k1CodeMappingRules.ts           # versioned dynamic code rules
|   `-- mapImportProposal.ts            # exhaustive items -> proposal
|-- validation/
|   |-- validateDocument.ts
|   |-- validateCrossField.ts
|   `-- validateYearContinuity.ts
|-- storage/
|   |-- K1PdfObjectStore.ts             # presign/head/get/artifact interface
|   |-- localK1PdfObjectStore.ts
|   `-- s3K1PdfObjectStore.ts
|-- workflow/
|   |-- K1PdfWorkflowDispatcher.ts
|   |-- localK1PdfWorkflow.ts
|   `-- stepFunctionsK1PdfWorkflow.ts
`-- worker/
    |-- processDocument.ts              # one idempotent complete document job
    `-- finalizeBatch.ts                # aggregate batch status

apps/api/src/scripts/
|-- run-k1-pdf-import-worker.ts         # Fargate command entry
`-- benchmark-k1-pdf-import.ts          # ignored-corpus benchmark CLI

apps/api/src/infra/db/migrations/
`-- 026_k1_pdf_import.sql

apps/api/tests/
|-- fixtures/k1-pdf-import/             # synthetic provider/result fixtures only
|-- k1-pdf-import.contract.test.ts
|-- k1-pdf-import.persistence.integration.test.ts
|-- k1-pdf-import.apply.integration.test.ts
|-- k1-pdf-extraction.fixture.contract.test.ts
|-- k1-pdf-normalization.test.ts
`-- k1-pdf-validation.test.ts

apps/web/src/features/partnership-tracker/
|-- api/partnershipTrackerClient.ts      # batch upload/review/apply client methods
|-- hooks/useK1PdfImport.ts              # resumable queries/mutations/polling
|-- components/K1BasisWorkspace.tsx      # Import K-1 PDFs entry point
|-- components/k1-pdf-import/
|   |-- K1PdfImportDialog.tsx
|   |-- K1PdfUploadList.tsx
|   |-- K1PdfImportWorkspace.tsx
|   |-- K1PdfDocumentRail.tsx
|   |-- K1PdfExceptionQueue.tsx
|   |-- K1PdfExtractedItem.tsx
|   |-- K1PdfEvidenceViewer.tsx
|   |-- K1PdfYearMappingPanel.tsx
|   `-- K1PdfApplyDialog.tsx
`-- __tests__/
    |-- K1PdfImportUpload.test.tsx
    |-- K1PdfImportReview.test.tsx
    `-- K1PdfImportApply.test.tsx

apps/web/src/features/k1-tracker/
|-- components/K1YearEntryForm.tsx       # imported provenance/evidence integration
|-- components/K1FormFieldCell.tsx
|-- components/K1OfficialFormField.tsx
|-- components/K1ImportedCodeDetails.tsx
`-- __tests__/K1PdfImportProvenance.test.tsx

infra/aws/terraform/
|-- main.tf                              # compose new module and API environment/IAM inputs
|-- variables.tf
|-- outputs.tf
`-- modules/k1_pdf_import/
    |-- main.tf                          # S3/KMS, task, state machine, IAM, logs/alarms
    `-- variables.tf
```

**Structure Decision**: Keep all business logic in the existing API/web workspaces and add one feature module per layer. Reuse the existing API container image for a one-shot worker command, following the repository's Plaid refresh task pattern, rather than add a new application workspace or runtime. Keep AWS adapters at module edges so pure extraction/mapping/validation code and ordinary tests remain cloud-independent.

## Phase 0: Research Outcomes

Detailed rationale and alternatives are in [research.md](./research.md). The implementation-relevant decisions are:

1. The tracker remains the sole final-value/calculation/signoff authority.
2. Production uploads go directly to a dedicated private S3 bucket via API-created presigned POST slots.
3. Standard Step Functions runs a bounded document Map and waits for one Fargate worker per PDF.
4. Textract supplies OCR/layout evidence, BDA supplies versioned fixed-schema extraction, and Bedrock supplies constrained code/statement reconciliation.
5. Exhaustive source extraction is persisted before deterministic Atlas mapping.
6. PDF batches use dedicated durable tables; workbook import remains untouched.
7. Reviewed multi-year apply is explicit, revision-safe, and atomic.
8. The UI is exception-first and returns users to the existing complete K-1 form.
9. PDF evidence uses PDF.js with bounding-box overlays and short-lived authorized source URLs.
10. Production provider/schema promotion requires a CPA-approved benchmark; local/CI use recorded synthetic fixtures.

## Phase 1: Design Outcomes

- The API contract creates all upload slots in one batch request, verifies the complete set before starting work, and exposes resumable detail/status.
- The normalized extraction schema is source-faithful and contains no Atlas destination selection; typed deterministic mapping owns destinations.
- Provider candidates remain independently queryable so confidence and agreement can be explained.
- Review corrections and dispositions are append-only.
- Year proposals are immutable snapshots identified by revision and canonical JSON hash.
- `CREATE`, `MERGE`, `REPLACE`, and `SKIP` behaviors are explicit and tested; absent PDF fields never become silent zeroes or clears.
- PDF imports add `PDF_IMPORT` tracker provenance and companion official-field/dynamic-code source rows.
- Derived dated cash activity remains authoritative; PDF annual totals create comparison findings.
- The batch UI can be closed after upload and restored by URL/history.
- Applied years remain `NEEDS_REVIEW`; the existing CPA signoff process is unchanged.

## Implementation Sequence

### Phase A: Benchmark and contract foundation

1. Create a synthetic/redacted fixture manifest and benchmark result schema without committing real PDFs or answer keys.
2. Add shared lifecycle/item/finding/proposal types and strict Zod/JSON Schema validators.
3. Add exact money, identity, geometry, candidate-agreement, and canonical proposal serialization utilities with failing tests first.
4. Define version constants for source schema, BDA blueprint, Textract queries/features, semantic prompt, ensemble policy, and mapping rules.

**Exit**: The same recorded provider candidates produce deterministic normalized items, findings, proposal JSON, and proposal hash.

### Phase B: Durable PostgreSQL model

1. Add migration 026 tables, indexes, constraints, source-type change, and provenance foreign keys from [data-model.md](./data-model.md).
2. Extend partnership deletion/reassignment child-row accounting for every new table.
3. Implement repository mapping and state-transition guards.
4. Add isolated PostgreSQL tests for lifecycle, append-only decisions, active source rows, retry idempotency, and delete/reassign behavior.

**Exit**: Batches, documents, runs, candidates, items, findings, decisions, proposals, and applied provenance survive process restart and enforce invalid transitions at the repository boundary.

### Phase C: Pure extraction, mapping, and validation

1. Implement provider-neutral contracts and the fixture extractor.
2. Normalize Textract/BDA/Bedrock recorded outputs into provider candidates.
3. Build ensemble selection with risk classes and reason codes.
4. Build fixed source-field mappings against the current 42 calculation and 48 official-form inventories.
5. Build versioned code mapping and exhaustive dynamic item retention.
6. Implement document, cross-field, dated-cash, and year-continuity validations.
7. Build exact `K1ImportProposal` snapshots and conflicts against current tracker years.

**Exit**: Recorded text/scanned/code-heavy fixtures meet schema coverage, null/sign rules, unknown-code retention, and deterministic validation tests without network access.

### Phase D: Local end-to-end pipeline

1. Implement object-store and workflow interfaces plus local adapters.
2. Implement the idempotent document worker and batch finalizer against fixture providers.
3. Add controlled retry injection at each stage.
4. Verify restart/retry never duplicates candidates, items, findings, proposals, or active runs.

**Exit**: A local five-PDF batch reaches mixed success/review/failure states and resumes from PostgreSQL.

### Phase E: Partnership-scoped API and atomic apply

1. Implement batch creation/list/detail and scoped upload slot contracts.
2. Implement upload completion verification and workflow dispatch.
3. Implement item/finding queries, append-only review decisions, evidence URLs, retry, and cancel.
4. Refactor tracker create/update/import primitives so PDF apply shares calculation, projection, conflict, and signoff behavior rather than reimplementing it.
5. Implement one-transaction multi-year apply with batch/proposal/year locks and revisions.
6. Add contract and persistence tests for scope, permissions, idempotency, stale writes, blockers, create/merge/replace/skip, rollback, and audit redaction.

**Exit**: API fixtures can upload, review, and atomically populate five existing tracker forms without AWS.

### Phase F: AWS extraction and infrastructure

1. Add the minimal AWS SDK v3 packages and lazy production adapters.
2. Implement presigned POST/private evidence GET, S3 metadata verification, streamed SHA-256, and immutable artifact writes.
3. Implement Textract async analysis with deterministic token, pagination, configured features/queries, KMS output, timeouts, throttling retry, and geometry normalization.
4. Implement BDA async invocation/status/artifact retrieval with versioned project/blueprint and KMS.
5. Implement Bedrock structured semantic reconciliation through a configured application inference profile, strict schema validation, and token/cost capture.
6. Add Terraform for private S3/KMS, worker task/role/logs, Standard state machine/role, API permissions/config, CloudWatch metrics/alarms, and environment variables.
7. Run Terraform fmt/validate/plan and opt-in staging smoke tests.

**Exit**: Staging processes approved text and scanned PDFs end-to-end with private artifacts, least-privilege roles, observable retries, and no sensitive logs.

### Phase G: Upload and resumable status UI

1. Add the `Import K-1 PDFs` workspace action.
2. Implement multi-select/drop, client SHA-256, per-file validation/progress/retry, batch creation, direct upload, and processing start.
3. Implement background-safe close behavior, batch history, URL restoration, capped polling, mixed success/failure, and controlled errors.
4. Cover keyboard/file-input equivalence, live regions, focus restoration, read-only permissions, 200% zoom, and mobile layout.

**Exit**: A user can upload five PDFs, leave, return, and understand every document's state.

### Phase H: Exception review and PDF evidence UI

1. Implement document/year navigation and exception filters.
2. Render provider agreement, confidence, findings, mappings, raw text, and effective values.
3. Implement verify/correct/reject/map/resolve/waive/reopen decision flows with reasons and optimistic batch revision.
4. Add PDF.js evidence rendering, short-lived URL refresh, page navigation, coordinate overlays, textual fallback, and accessible desktop/mobile presentations.
5. Add unknown-code and statement drilldowns.

**Exit**: A reviewer can resolve every blocking item and trace representative values to the correct PDF page/region without checking all high-confidence fields.

### Phase I: Year decisions and existing-form integration

1. Implement proposal conflict cards and allowed create/merge/replace/skip choices.
2. Implement impact confirmation covering signoff and downstream invalidation.
3. Apply the batch and refresh partnership/year queries with newest applied year selection.
4. Add calculation-field and official-field import provenance/evidence badges.
5. Add applied dynamic code/statement detail panel and aggregated-source breakdown.
6. Ensure manual edits supersede only affected active imported sources.

**Exit**: Accepted PDF values populate the existing year forms with provenance; unknowns remain visible; users complete the normal calculation/review/signoff workflow.

### Phase J: Quality, security, and promotion

1. Run the external-corpus benchmark and record sanitized aggregate results.
2. Promote only schema/blueprint/inference-profile/mapping versions that pass accuracy and retention gates.
3. Run focused/full API/web suites, production builds, Terraform validation/plan, and live staging smoke.
4. Test stuck workflow, throttling, provider outage, worker failure, retry, stale apply, and transaction rollback.
5. Validate CloudWatch metrics/alarms and cost attribution.
6. Run responsive, keyboard, screen-reader, reduced-motion, and read-only-user checks.
7. Audit git/log/audit/telemetry/artifact output for private PDFs, values, identities, prompts, AWS credentials, object keys, and signed URLs.

**Exit**: [quickstart.md](./quickstart.md) completion criteria pass and the production configuration is benchmark-approved.

## Idempotency and Concurrency Strategy

- Batch creation uses server-generated UUIDs; client file IDs are unique only inside a batch.
- S3 object keys are deterministic from environment/batch/document IDs and cannot be selected by the client.
- `StartDocumentAnalysis` uses a deterministic client token derived from document hash + extractor version.
- Each BDA/Bedrock invocation belongs to a unique extraction run; retry creates a new attempt while retaining old artifacts.
- Candidate/item writes are unique by run/provider/source key and are transactionally replaced only within the active run.
- Review decisions are append-only and guarded by batch revision.
- Proposal revisions/hashes change when effective decisions, mappings, or target conflicts change.
- Apply obtains `FOR UPDATE` locks in sorted year order, checks every revision/hash before the first tracker mutation, and records one audit event group.
- A repeated successful apply returns the recorded result when request decisions match; mismatched repeats return conflict.

## Error and Retry Policy

- **Non-retryable intake**: invalid PDF signature, oversize, password protection, hash mismatch, unsupported packet, cross-scope access.
- **Retryable provider**: throttling, provider 5xx, network timeout, transient artifact retrieval; capped exponential backoff with jitter and maximum attempts.
- **Reviewable extraction**: missing year/identity, low confidence, disagreements, unknown codes, statement dependencies, failed normalization, reconciliation mismatch.
- **Retryable workflow**: Fargate task start/exit failures when the run remains incomplete and idempotency guard permits another attempt.
- **Apply conflict**: stale batch/proposal/year revisions refresh review state; never automatic retry against new financial data.
- **Batch partial failure**: successful documents remain reviewable; failed documents can retry or be skipped before apply.

## Validation Strategy

### Unit and schema

- exact money/null/sign normalization
- geometry conversion from provider coordinate systems
- strict semantic output schema and extra-key rejection
- candidate agreement/confidence/risk selection
- fixed and code mapping inventories
- deterministic proposal serialization/hash
- cross-field and continuity findings

### Contract and persistence

- all endpoints and error/status codes from OpenAPI
- partnership scope and edit/read permissions
- direct-upload verification and duplicate hash handling
- state-transition and append-only constraints
- provider retry/idempotency
- atomic apply rollback and stale revision behavior
- source links and manual supersession
- deletion/reassignment child-row handling
- audit/log redaction

### Web

- multi-file upload/progress/retry
- background/resume and URL state
- exception filters and decisions
- evidence page/box behavior
- create/merge/replace/skip impact
- imported form provenance and dynamic details
- accessibility and responsive behavior

### Live/benchmark

- versioned 20+ PDF corpus outside git
- text/scanned/multi-page/code/statement/negative/blank variations
- accuracy, code retention, auto-accept precision, latency, review rate, failure rate, and cost
- private S3/KMS/IAM/URL expiry and CloudWatch redaction

## Deployment and Rollout

1. Merge database/API/types with the feature flag off and fixture adapters available.
2. Apply Terraform in staging; create/version the BDA blueprint/project and application inference profile.
3. Run the benchmark and staging smoke; promote exact version IDs in environment configuration.
4. Enable upload/review for Admins in staging, then all authorized editors after audit/metric review.
5. Deploy production infrastructure with feature flag off, validate permissions and alarms, then enable for Admins.
6. Monitor failure, review, correction, latency, and cost rates; retain the ability to disable Bedrock reconciliation or all new processing without hiding prior batches/evidence.
7. Keep the existing manual form and workbook import as supported fallbacks throughout rollout.

## Complexity Tracking

No constitution violations require exceptions. The added S3/KMS, Step Functions, Fargate worker, Textract, BDA, Bedrock, and relational evidence model are the minimum architecture that satisfies durable multi-document processing, exhaustive source retention, independent extraction evidence, auditable human review, and atomic tracker integration on the project's existing AWS platform. Provider and infrastructure complexity is isolated behind adapters and one feature module; final financial logic remains in the existing tracker.
