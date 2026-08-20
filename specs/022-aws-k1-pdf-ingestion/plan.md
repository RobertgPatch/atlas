# Implementation Plan: AWS K-1 PDF Ingestion

**Branch**: 022-aws-k1-pdf-ingestion | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from specs/022-aws-k1-pdf-ingestion/spec.md

## Summary

Add durable, multi-file Schedule K-1 (Form 1065) ingestion to the existing Jackson application. Browsers create a batch and upload each PDF independently. Local development uses a local object store, local queue, and deterministic extractor; AWS mode uses a private SSE-KMS S3 bucket, SQS, EventBridge, an ECS/Fargate worker, and Amazon Bedrock Data Automation (BDA). Provider output is mapped into a versioned canonical K-1 draft, matched to existing records, reviewed with page evidence, and applied to tracker calculation and official-form fields through one revision-aware PostgreSQL transaction.

## Technical Context

**Language/Version**: Node.js 22+, TypeScript 5.7+ in the API/shared packages and TypeScript 6/React 19 in the web application
**Primary Dependencies**: Fastify 5, React 19, Vite 8, TanStack Query 5, PostgreSQL pg 8, Zod 3, AWS SDK for JavaScript v3, Amazon Bedrock Data Automation, S3, SQS, EventBridge, KMS, ECS/Fargate, Terraform
**Storage**: PostgreSQL is authoritative for workflow/review/application state; private S3 is authoritative for AWS originals and extraction artifacts; a local object-store adapter is used only for local development
**Testing**: Vitest API/unit/contract/integration tests, React Testing Library, clean/upgrade PostgreSQL migration tests, recorded BDA fixtures, Terraform validation, and an AWS staging smoke test
**Target Platform**: Browser client plus Linux ECS API/worker in us-west-2; Windows/macOS/Linux local development
**Project Type**: npm-workspace web application with Fastify API, React frontend, shared TypeScript contracts, PostgreSQL, and Terraform infrastructure
**Performance Goals**: Submit 25 PDFs in under 3 minutes of active interaction; start with 10 concurrent BDA jobs; keep API memory bounded through direct or streamed upload
**Constraints**: 25 files per batch, 25 MB and 100 pages per file by default, explicit human review before apply, no silent overwrite, atomic financial writes, complete provenance, no raw tax values in logs, and approved US geographic cross-Region inference before production
**Scale/Scope**: Standard U.S. partnership Schedule K-1 forms for tax years 2000 through 2025, all 48 official-form keys, 31 literal calculation-backed destinations, nine repeated coded sections, continuation statements, retries, matching, review, and atomic apply

## Constitution Check

The repository constitution is still an unconfigured template and contains no enforceable project-specific gates. This plan therefore applies the explicit feature and repository constraints:

- Tests precede corresponding implementation work.
- PostgreSQL is the sole workflow source of truth; process-local maps and opportunistic mirrors are retired.
- Provider output never writes directly to tracker fields.
- Background extraction never creates entities or partnerships and never changes financial values.
- Every financial apply is human-reviewed, conflict-aware, revision-aware, auditable, and atomic.
- Originals, raw results, identifiers, and field values are treated as sensitive financial data.
- Existing calculations, dated capital activity, sign-off rules, and historical Line 18 semantics remain authoritative.

The gate passes with these constraints. Re-check after migrations, canonical mapping, and the apply transaction are implemented.

## Architecture

### End-to-end flow

1. The browser creates a k1_ingestion_batch with one item per selected PDF.
2. In local mode, each file uploads through a same-origin local slot. In AWS mode, each file uploads directly to a short-lived presigned S3 PUT URL.
3. The API verifies object metadata, checksum, PDF integrity, encryption state, size, and page count, then creates durable documents and k1_documents rows.
4. One idempotent message per accepted item enters the local queue or SQS.
5. The worker creates an append-only extraction attempt and invokes the configured extractor once per PDF.
6. The local stub returns deterministic canonical fixtures. AWS BDA writes custom and standard output to S3 and emits a completion event through EventBridge to SQS.
7. The completion worker retains the raw result, maps every supported value into K1ExtractionDraft, persists typed occurrences/evidence/issues, and promotes one succeeded attempt.
8. Identifier-first matching proposes partner entity, partnership, and tax year. Ambiguity moves the document to NEEDS_MATCH; no record is auto-created.
9. Review presents the PDF beside every typed field and repeated row. Raw, normalized, corrected, and effective values remain distinguishable.
10. Apply-preview binds conflict decisions to document and tracker revisions.
11. Apply locks the document/year and writes FINALIZED_K1 calculation revisions, official-field revisions and snapshot, provenance, calculations, sign-off invalidations, statuses, decisions, and audit metadata in one PostgreSQL transaction.
12. Batch and item status remain queryable after page navigation, process restarts, duplicate events, and retries.

### Reliability model

- SQS messages, local messages, provider submissions, and completion imports use deterministic idempotency keys.
- EventBridge completion is best effort; a scheduled reconciler checks stale jobs with GetDataAutomationStatus.
- Retries create immutable new attempts and never overwrite prior provider results.
- One document failure never blocks sibling batch items.
- An apply failure rolls back financial values, provenance, statuses, sign-offs, and audit writes together.

### Security model

- Use a dedicated private document/evidence bucket, never the web-assets bucket.
- Enable Block Public Access, bucket-owner enforcement, opaque keys, SSE-KMS, scoped lifecycle rules, and least-privilege API/worker roles.
- Authorize upload, status, PDF range reads, review, corrections, matching, retry, preview, apply, and cancel against the current user and entity scope.
- Mask TIN/EIN evidence and exclude names, identifiers, filenames, and raw field values from logs, metrics, tags, and queue error summaries.
- Keep production activation behind K1_AWS_INGESTION_ENABLED until accuracy, security, residency, cost, and operational gates pass.

## Local Development Modes

### Fully local

The API, web app, PostgreSQL, local object store, local queue, worker, and deterministic fixture extractor run locally. This mode verifies the entire workflow without AWS credentials but does not perform real OCR on arbitrary PDFs.

### Local application with real AWS extraction

The web app, API, worker, and PostgreSQL run locally while S3, KMS, SQS, EventBridge, and BDA run in the approved development account. The local worker long-polls SQS, so AWS never needs an inbound connection to the developer machine.

### AWS staging

ECS/Fargate, IAM, networking, KMS policies, alarms, quotas, reconciliation, throttling, and Terraform are validated with sanitized documents before production activation.

## Provider-neutral extraction and destination rules

- Persist provider, project, blueprint, immutable version, mapping schema, client token, job ID, raw-result key/hash, and custom-output status on every attempt.
- Preserve occurrence ID, sequence, raw/normalized/corrected values, confidence, page/bounding-box evidence, canonical path, destination classification, and mapping-rule version.
- Map every one of the 48 official-form fields exactly once.
- Classify every writable calculation key as direct K-1 input, reviewed derivation, dated-activity authoritative, or workpaper excluded.
- Never emit section_l_capital_contributed or box_13_other_deductions.
- Never populate the 11 workpaper-only basis/book/reconciliation fields from a PDF.
- Preserve every Box 13 and Line 18 coded occurrence. Derive calculation fields only through explicit, versioned, reviewed rules.
- Dated contribution/distribution activity remains authoritative; PDF totals become evidence/conflicts when dated events exist.
- Unknown provider fields, form revisions, fallback/no-match results, unreadable values, and unsupported content become evidence or blocking review issues rather than invented values.
- Recognized Schedule K-1 (Form 1065) revisions from 2000 through 2025 use the canonical review/apply pipeline; missing, pre-2000, and future revision years remain blocking issues.

## Project Structure

### Documentation

- specs/022-aws-k1-pdf-ingestion/spec.md
- specs/022-aws-k1-pdf-ingestion/research.md
- specs/022-aws-k1-pdf-ingestion/data-model.md
- specs/022-aws-k1-pdf-ingestion/contracts/k1-pdf-ingestion.openapi.yaml
- specs/022-aws-k1-pdf-ingestion/quickstart.md
- specs/022-aws-k1-pdf-ingestion/tasks.md

### Shared contracts

- packages/types/src/k1-ingestion.ts
- packages/types/src/review-finalization.ts
- packages/types/src/k1-tracker.ts

### API and worker

- apps/api/src/modules/k1/ for batch/upload, storage, queue, extraction, matching, application, and routes
- apps/api/src/modules/review/ for durable review sessions, corrections, issues, and finalization
- apps/api/src/modules/k1-tracker/ for destination rules, value revisions, official revisions, calculations, provenance, and sign-off integration
- apps/api/src/workers/k1-extraction-worker.ts
- apps/api/src/infra/db/migrations/030_aws_k1_pdf_ingestion.sql
- apps/api/tests/ for contract, integration, mapper, worker, migration, authorization, and apply tests

### Web

- apps/web/src/features/k1/ for upload, batch queue, clients, and queries
- apps/web/src/features/review/ for typed fields, evidence, corrections, candidates, issues, and apply decisions
- apps/web/src/pages/K1Dashboard.tsx
- apps/web/src/pages/K1ReviewWorkspace.tsx
- apps/web/src/features/k1-tracker/ for applied values and provenance display

### AWS infrastructure

- infra/aws/bda/ for source-controlled blueprints and evaluation guidance
- infra/aws/terraform/modules/k1_ingestion/ for storage, queues, events, BDA resources, worker, and IAM
- scripts/promote-k1-bda-blueprint.ps1 for gated immutable version promotion

## Implementation Stages

1. Add SDK/runtime dependencies, typed configuration, feature flags, blueprint directories, and sanitized fixture structure.
2. Add provider-neutral shared contracts and the forward-only durable ingestion migration with clean/upgrade tests.
3. Replace process-local document/review stores with PostgreSQL and remove direct filesystem bypasses.
4. Add local/S3 object stores, local/SQS queue adapters, and worker bootstrap.
5. Implement and test durable multi-file batch upload, validation, duplicate isolation, and local progress UI.
6. Implement canonical destination inventory, normalization, BDA parser/adapter, immutable attempts, completion import, retry, and reconciliation.
7. Provision private S3/KMS, SQS/DLQs, EventBridge, ECS worker, least-privilege IAM, and versioned BDA blueprint/project resources.
8. Implement identifier-first matching and durable typed review with correction and issue history.
9. Implement apply-preview and the explicit atomic calculation/official revision transaction; remove lazy GET-time financial writes.
10. Add the durable batch queue, filters, history, retry/cancel controls, and leave/return behavior.
11. Add authorization, redaction, observability, retention, evaluation, load, migration, and fault-injection tests.
12. Validate the fully local workflow and recorded provider results.
13. Run Terraform validation and the sanitized us-west-2 staging smoke before enabling any production cohort.

## Testing Strategy

- Contract tests cover every documented endpoint, status, stable error, authorization boundary, and optimistic-concurrency response.
- Migration tests cover clean install and upgrade with existing K-1, review, tracker, official JSON, sign-off, and source revision data.
- Mapper inventory tests prove full official/calculation classification, no deprecated output, repeated-row preservation, and unknown-field retention.
- Worker tests cover duplicate messages, deterministic tokens, throttling, missing completion events, retries, attempt promotion, and restart behavior.
- Review tests cover active-attempt scoping, immutable raw values, typed corrections, issue resolution, PDF authorization, and page evidence.
- Apply tests cover empty/populated years, keep/use decisions, dated activity, stale revisions, duplicate submit, fault rollback, provenance, calculations, and sign-off invalidation.
- Web tests cover multi-file upload, progress, review fields, evidence jumps, corrections, matching, conflicts, queue filters, retry/cancel, and applied navigation.
- Production readiness requires 100% source-field accounting, at least 95% normalized exact match, zero false-safe values, zero silent overwrites, and zero partial apply writes.

## Complexity Tracking

| Complexity | Why needed | Simpler alternative rejected because |
|---|---|---|
| Dedicated worker plus two queues and reconciler | BDA is asynchronous and completion delivery is best effort | In-process setImmediate work is lost on restart; polling alone delays completion |
| Canonical draft separate from provider and tracker keys | Provider schemas and form revisions change independently from financial semantics | Direct BDA-to-tracker mapping would turn provider changes into financial migrations |
| Per-field official revision table plus JSON snapshot | Existing UI needs the snapshot while audit requires append-only provenance | Snapshot-only storage cannot prove source, supersession, or conflict history |
| Local and AWS adapters | The complete workflow must run locally while production uses BDA/S3/SQS | Requiring staging for every UI/database change slows feedback and complicates testing |
| Explicit preview/apply transaction | Existing values, dated activity, calculations, and sign-offs require coordinated conflict handling | Manual PATCH and GET-time sync cannot carry source IDs or roll back the full operation |
