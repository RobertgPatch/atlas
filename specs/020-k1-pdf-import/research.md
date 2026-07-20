# Research: Multi-PDF K-1 Import

**Branch**: `020-k1-pdf-import`
**Date**: 2026-07-19
**Inputs**: [spec.md](./spec.md), the user-supplied AWS recommendation, current K-1 ingestion/review code, the Spec 016-019 tracker design, and the existing AWS Terraform stack.

## Decision 1: Keep the tracker as the only final-value system

**Decision**: Treat PDF import as a durable evidence, normalization, and review pipeline in front of the existing partnership K-1 tracker. Applying a reviewed import calls shared repository logic that creates or revises `k1_tracker_years`, `k1_tracker_value_revisions`, and `official_form_data`; it does not create a second calculation or signoff model.

**Rationale**:

- Spec 019 already provides the complete 42 calculation placements and 48 official-form placements the user wants populated.
- `k1TrackerRepository` already owns atomic year creation/update, optimistic revisions, projection recalculation, source conflicts, and signoff invalidation.
- The legacy `/k1-documents` workflow already proves useful extraction abstractions and source-page review patterns, but its in-memory source of truth and separate approval/finalization lifecycle must not become the new tracker authority.
- Shared apply logic prevents workbook import, manual entry, and PDF import from drifting in merge/replace semantics.

**Alternatives considered**:

- **Populate the legacy review workspace and finalize into annual activity**: rejected because it does not populate the complete tracker form and would leave two competing K-1 workflows.
- **Write extractor output directly to tracker rows**: rejected because duplicate years, uncertain codes, stale revisions, and signed-off data require an explicit review/apply boundary.
- **Replace the tracker with a new document-centric model**: rejected because the existing financial calculations and audit behavior are already canonical.

## Decision 2: Use direct, private S3 uploads with an API-created batch manifest

**Decision**: The API creates a partnership-scoped batch and one server-generated object key per file, then returns short-lived presigned POST instructions. The browser uploads each PDF directly to a private S3 bucket and calls a batch completion endpoint. The API verifies every expected object with `HeadObject` before starting processing; the worker recomputes SHA-256 from the stored bytes before extraction.

**Rationale**:

- Direct upload avoids buffering several PDFs in the Fastify/ECS API process.
- Presigned access lets the browser upload without AWS credentials while preserving the permissions of the signing role. [AWS S3 presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
- Presigned POST conditions can constrain object key, content type, and size; object keys are immutable UUID paths and never derived from filenames.
- The current 25 MB per-file application limit is retained for the first release even though AWS services allow larger asynchronous PDF inputs. This keeps browser hashing, evidence rendering, cost, and latency bounded.
- S3 is already part of the production AWS topology, so the feature adds a separate tax-document bucket rather than introducing a new storage provider.

**Alternatives considered**:

- **Multipart PDFs through Fastify**: retained only as a local/test adapter; rejected for production batches because it scales API memory with total upload size.
- **S3 ObjectCreated events as the only trigger**: rejected because an explicit batch completion step can verify that all expected objects arrived before processing and provides clearer user-visible errors.
- **Public or long-lived object URLs**: rejected because tax documents require scoped, short-lived access.

## Decision 3: Orchestrate batches with Standard Step Functions and Fargate workers

**Decision**: Use one AWS Step Functions Standard workflow per import batch. A bounded `Map` state runs one synchronous ECS/Fargate worker task per PDF using the same versioned API image with a worker command. A final task derives aggregate batch status. Default document concurrency is five and remains configurable below service quotas.

**Rationale**:

- The pipeline lasts longer than a request and must survive browser navigation, API restarts, retries, and mixed per-document outcomes.
- Step Functions supports waiting for an ECS/Fargate task with `ecs:runTask.sync` and supports command overrides, matching the repository's existing one-shot ECS task pattern. [AWS Step Functions ECS integration](https://docs.aws.amazon.com/step-functions/latest/dg/connect-ecs.html)
- Fargate has no Lambda 15-minute ceiling and can reuse the Node 22 build, PostgreSQL access, Zod schemas, logging, and exact normalization code already in `apps/api`.
- A separate worker task role can receive tightly scoped S3, KMS, Textract, BDA, and Bedrock permissions without granting those permissions to the web client.
- The batch and document tables, not Step Functions execution history, remain the product-facing source of status.

**Worker outline**:

1. Lock or create an idempotent extraction run for the document.
2. Verify S3 object metadata, PDF signature, size, and SHA-256.
3. Start Textract and BDA asynchronously with deterministic client tokens and poll with capped exponential backoff.
4. Store provider outputs below a run-specific S3 artifact prefix.
5. Run semantic reconciliation and exhaustive code/statement extraction.
6. Normalize, compare, validate, and transactionally replace that run's proposed items/findings.
7. Mark the document `READY_FOR_REVIEW` or an actionable terminal failure.

**Alternatives considered**:

- **Fire-and-forget `setImmediate` in the API**: rejected because it is not durable across process restarts and cannot represent a multi-document batch reliably.
- **A Lambda for the entire document job**: rejected for the first release because provider polling, large evidence payloads, and benchmark tooling fit the existing container better.
- **A new always-on queue worker service**: viable later for higher volume, but adds an SQS consumer and service lifecycle before current batch scale requires it.
- **Direct Step Functions calls for every provider page and database write**: rejected because Textract pagination, BDA artifacts, reconciliation prompts, and PostgreSQL transactions belong in tested TypeScript modules.

## Decision 4: Use a layered extractor, not a single provider result

**Decision**: Production extraction uses three evidence roles behind a versioned `K1PdfExtractor` interface:

1. **Textract** supplies OCR lines, layout, forms, tables, selection marks, queries, page geometry, and provider confidence.
2. **Bedrock Data Automation (BDA)** supplies schema-directed fixed-field extraction using a versioned Schedule K-1 blueprint/project.
3. **Bedrock Runtime** performs a constrained semantic reconciliation pass over BDA output plus selected Textract evidence, with special focus on exhaustive box/code/detail arrays, statement references, and disagreements.

The semantic model is addressed through a configured, application-tagged inference profile rather than a model ID embedded in source. The exact model/profile is promoted only after the benchmark gate in Decision 10.

**Rationale**:

- Textract asynchronous analysis supports PDFs in S3, idempotent client tokens, pagination, KMS-encrypted output, and `TABLES`, `FORMS`, `QUERIES`, `SIGNATURES`, and `LAYOUT`. [Textract StartDocumentAnalysis](https://docs.aws.amazon.com/textract/latest/APIReference/API_StartDocumentAnalysis.html)
- BDA is designed to turn documents into business-specific structured outputs and supports custom extraction blueprints. [BDA overview](https://docs.aws.amazon.com/bedrock/latest/userguide/bda.html), [BDA custom outputs](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-custom-output-idp.html)
- BDA asynchronous jobs expose durable status and write results to S3. [Using the BDA API](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-using-api.html)
- A BDA async document blueprint can contain up to 100 fields, enough for the fixed Atlas destination inventory when repeated code-bearing content is represented separately. [BDA blueprint limits](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-blueprint-info.html)
- Textract supplies geometry and deterministic OCR evidence; BDA supplies fixed-schema semantics; the Bedrock pass preserves dynamic code arrays and resolves layout ambiguity. Agreement can therefore be scored instead of assumed.

**Extraction policy**:

- Preserve provider candidates independently before ensemble selection.
- Never ask the model to calculate Section L reconciliation or tax treatment; deterministic TypeScript code performs those checks and mapping rules.
- Require structured JSON validated by Zod; reject extra keys, invalid money strings, invalid pages, and unknown destination keys.
- Keep blank as null and retain raw text even when normalization fails.
- Do not auto-accept unknown codes, statement-only values, identity mismatches, or extractor disagreements.
- Record the BDA blueprint version, inference profile/model identity, prompt/schema version, Textract feature/query version, and mapping version on every run.

**Alternatives considered**:

- **Textract only**: rejected because K-1 code/detail and supplemental-statement semantics exceed stable key/value extraction.
- **BDA only**: rejected because independent OCR/layout evidence and a second semantic view are valuable for confidence and audit.
- **One unconstrained multimodal prompt**: rejected because it loses repeatability, independent evidence, and field-specific disagreement handling.
- **Hard-code one Bedrock model forever**: rejected because model availability and measured accuracy change; deployment promotion must remain benchmark-driven.

## Decision 5: Separate exhaustive extraction from Atlas mapping

**Decision**: Use two typed stages:

- `ExhaustiveK1Document`: source-faithful identifiers, checkboxes, fixed fields, every box/code/detail item, every statement reference, page evidence, and provider candidates.
- `K1ImportProposal`: deterministic mapping into current calculation fields, official-form fields, dynamic code values, findings, and exact proposed create/merge/replace effects.

Mappings are versioned code/config records with `source box`, optional code pattern, destination kind/key, aggregation, sign convention, risk class, and effective dates.

**Rationale**:

- Unknown codes must survive even if Atlas cannot yet calculate with them.
- Re-running only the mapper after a rule change is cheaper and more reproducible than re-running OCR/AI.
- The current `K1TrackerCodeEntry[]` official fields can display standard code/value entries, while a new dynamic revision table preserves evidence, statement relationships, and unmapped items.
- Provider output must never be trusted to select canonical calculation behavior.

**Alternatives considered**:

- **Emit only `K1TrackerFieldChange[]`**: rejected because it discards source structure, unknown codes, evidence, and future remapping capability.
- **Create a permanent enum entry for every IRS code**: rejected because codes vary by form year and supplemental context.
- **Store the entire normalized result only as JSON**: rejected because exception queries, evidence joins, review decisions, and applied provenance need relational rows; immutable provider artifacts still remain in S3.

## Decision 6: Add a PDF-specific durable import model and explicit provenance links

**Decision**: Add PDF-specific batch, document, run, item, finding, review-decision, year-mapping, and dynamic-code revision tables. Reuse `documents` and `k1_documents` for the source PDF identity, but do not overload the workbook-only `k1_tracker_import_batches`. Extend tracker source types with `PDF_IMPORT` and add explicit PDF batch/item foreign keys to tracker value revisions.

**Rationale**:

- The existing workbook batch table assumes one filename, one workbook hash, a one-hour preview, sheet/cell sources, and `PREVIEWED|COMMITTED|FAILED|EXPIRED`; changing those invariants would risk the working Excel import.
- `documents`/`k1_documents` already connect a PDF to partnership, year, evidence download, and legacy field provenance.
- Imported official-form JSON also needs field-level provenance, so a companion official-field source table records imported JSON value, source item, confidence, and active state without replacing Spec 019 storage.
- Append-only review decisions meet the audit requirement more cleanly than mutating provider output.

**Alternatives considered**:

- **Generalize the workbook batch table in place**: rejected for MVP because a multi-document async lifecycle is materially different and would produce a high-risk migration.
- **Reuse only `k1_field_values`**: rejected because one mutable reviewer-correction column cannot represent provider candidates, append-only decisions, dynamic code items, and multiple extraction runs cleanly.
- **Duplicate source PDFs in PostgreSQL**: rejected; PostgreSQL stores metadata and provenance while encrypted bytes/artifacts remain in S3.

## Decision 7: Apply reviewed years in one PostgreSQL transaction

**Decision**: `POST .../apply` locks the batch and all target years, verifies batch revision and per-year expected revisions, rejects unresolved blocking findings, then applies every non-skipped year atomically. It reuses/refactors tracker repository primitives for create, merge, replace, recalculation, downstream invalidation, and audit.

**Apply semantics**:

- `CREATE`: allowed only when the year does not exist.
- `MERGE`: imported non-null accepted destinations revise only those fields; existing values remain for destinations absent from the proposal. Every conflicting non-null destination is shown before apply.
- `REPLACE`: deactivates current imported/manual financial destinations represented by the form proposal, replaces official-form data with the reviewed proposal, and preserves non-K-1 Jackson workpaper inputs unless the source explicitly maps them.
- `SKIP`: makes no tracker change and records the disposition.
- Derived dated cash-activity values retain their current ownership and are never overwritten by annual PDF values; the PDF values become comparison findings/evidence.

**Rationale**:

- The user expects a five-file import to produce five years, not a partially applied set.
- Current expected-revision behavior prevents a preview from overwriting newer manual work.
- One transaction keeps source links and final values consistent.

**Alternatives considered**:

- **Apply each document automatically as soon as extraction finishes**: rejected because duplicates, identity mismatches, conflicting years, and extractor uncertainty require a batch decision.
- **Best-effort per-year commit**: rejected because the user cannot reliably reason about a batch that only partly changed the partnership.
- **Treat blank as a replacement value**: rejected; blank remains absent unless the user explicitly clears a field during review.

## Decision 8: Build an exception-first review UI and reuse the complete form

**Decision**: Add `Import K-1 PDFs` to `K1BasisWorkspace`, a multi-file upload/progress dialog, and a batch review workspace with document/year navigation and grouped findings. After apply, the existing K-1 form remains the final review and edit surface. Form fields show import source, confidence/review status, evidence action, and code-item breakdown.

Use `pdfjs-dist` for a controlled PDF canvas with a coordinate overlay instead of the existing native iframe when displaying import evidence. The existing `PdfPanel` page-jump behavior can be adapted, but native browser viewers cannot reliably render source bounding boxes.

**Rationale**:

- The current complete form already presents the correct user mental model and includes manual correction, preview, save, calculations, and signoff.
- Reviewers should start with blocking exceptions, not re-key or inspect every high-confidence value.
- Page and bounding-box evidence materially improve verification of OCR/AI results.

**Alternatives considered**:

- **Create another full K-1 editor inside the import flow**: rejected because it duplicates form rules and would drift from the tracker.
- **Show only a batch summary**: rejected because reviewers need field-level evidence, corrections, and unmapped items.
- **Keep only the browser-native PDF iframe**: rejected for imported evidence because it cannot provide reliable geometry overlays across browsers.

## Decision 9: Encrypt, isolate, and minimize sensitive tax data

**Decision**:

- Use a dedicated S3 bucket with Block Public Access, object ownership enforced, versioning, SSE-KMS with a customer-managed key and bucket keys, TLS-only bucket policy, narrowly scoped CORS for presigned uploads, and lifecycle rules.
- Use the same customer-managed key for Textract output and BDA invocation where supported. BDA supports customer-managed encryption for API operations. [BDA encryption](https://docs.aws.amazon.com/bedrock/latest/userguide/encryption-bda.html)
- Return source-document access only through short-lived presigned GET URLs created after API authorization.
- Keep AWS credentials, model/profile ARNs, blueprint/project ARNs, bucket names, and KMS identifiers in environment/Terraform configuration; secrets remain in Secrets Manager.
- Do not log filenames, extracted values, raw provider payloads, prompts containing document content, presigned URLs, TINs/EINs, or S3 object keys. Use opaque batch/document/run IDs in logs and metrics.
- Use an application inference profile for cost attribution. If geographic cross-region inference is enabled, constrain it to the approved US geography and document that prompts can be processed in another US region. [Bedrock application inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html), [geographic inference considerations](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)

**Alternatives considered**:

- **SSE-S3 only**: AWS encrypts S3 by default, but a customer-managed key provides clearer access control and audit for tax documents. [S3 encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html)
- **Proxy every PDF byte through the API**: rejected for normal viewing because scoped presigned access is less resource-intensive; retain an adapter if organizational policy later requires proxying.
- **Put sensitive values into audit JSON for convenience**: rejected; audit records store IDs, event types, counts, versions, and dispositions only.

## Decision 10: Make the benchmark a release gate, not a separate product

**Decision**: Add `npm run k1-import:benchmark` as an offline/dev command that executes fixture or live adapters against an ignored input directory and writes results to an ignored output directory. A versioned, synthetic/redacted manifest describes the corpus and expected schema; real PDFs and CPA answer keys remain outside source control. Production promotion requires recorded aggregate metrics meeting the spec thresholds.

**Rationale**:

- Accuracy claims are meaningless without a stable, CPA-approved comparison set.
- The benchmark must compare fixed-field accuracy, amount accuracy, code retention, false positives, latency, review rate, and cost by extractor/schema version.
- Application inference profiles provide workload cost attribution without putting document data into cost tags.

**Promotion gate**:

- At least 20 representative K-1 PDFs.
- At least 95% exact normalized accuracy on core identity, year, calculation, and official-form fields.
- At least 98% precision for auto-accepted fields.
- 100% retention of visible code-bearing and supplemental statement lines.
- No real PDF, raw provider response, or answer key containing private values committed to git.

**Alternatives considered**:

- **Select a provider from anecdotal samples**: rejected because it hides issuer/layout variance.
- **Run live AWS calls in ordinary CI**: rejected because CI must be deterministic, offline, safe, and cost-free; recorded synthetic fixtures cover contracts.

## Decision 11: Support local development through adapters and recorded fixtures

**Decision**: Define interfaces for object storage, workflow dispatch, OCR, schema extraction, semantic extraction, and evidence URL generation. Production adapters use AWS; local/test adapters use `.storage`, an in-process fixture workflow, and recorded synthetic provider responses. Live AWS integration tests are opt-in and environment-gated.

**Rationale**:

- Existing tests run without cloud credentials.
- The current local PDF store and extractor selector are useful patterns, but the new interfaces must be durable-Postgres-first and multi-document aware.
- Pure normalization, ensemble, mapping, validation, and apply modules can receive comprehensive unit/contract coverage without network calls.

**Alternatives considered**:

- **Require LocalStack for every developer and CI run**: rejected as a default because BDA/Bedrock fidelity is incomplete and setup cost is high; it may be added as an optional S3/Step Functions smoke environment.
- **Mock only at HTTP route level**: rejected because provider mapping and deterministic financial rules need direct fixture tests.

## Decision 12: Observe workflow health without exposing tax data

**Decision**: Emit structured CloudWatch metrics and logs keyed only by environment, stage, outcome, extractor/schema version, and coarse failure category. Add alarms for stuck batches, worker failures, throttling, queue age-equivalent batch age, and unexpectedly high review rates. Persist per-run duration, provider request identifiers, page count, token/usage counts when available, and estimated cost in PostgreSQL for authorized operational analysis.

**Rationale**:

- Import quality requires both system reliability and extraction quality monitoring.
- Batch/document IDs permit support correlation while keeping tax values out of telemetry.
- Cost and correction-rate trends guide whether the Bedrock reconciliation pass should remain universal or become exception-only.

**Alternatives considered**:

- **Log raw provider payloads for debugging**: rejected because payloads contain sensitive tax information; store encrypted artifacts in S3 and expose them only to authorized support tooling.
- **No cost tracking until scale**: rejected because multimodal extraction costs should be measured from the first benchmark.

## Resolved Technical Unknowns

| Unknown | Resolution |
|---|---|
| Production object storage | Dedicated private S3 bucket with SSE-KMS and short-lived presigned access |
| Batch orchestration | Standard Step Functions workflow with bounded Map and synchronous Fargate worker tasks |
| OCR/layout engine | Textract asynchronous document analysis with forms, tables, queries, layout, and geometry |
| Schema extraction | Versioned BDA Schedule K-1 project/blueprint |
| Dynamic code/statement interpretation | Bedrock Runtime structured semantic reconciliation over BDA + Textract evidence |
| Exact Bedrock model | Configured application inference profile promoted by the benchmark; not hard-coded |
| Canonical final values | Existing K-1 tracker years, value revisions, official-form JSON, calculations, and signoffs |
| Unknown codes | First-class extracted and tracker code-value revisions; never discarded or auto-calculated without a mapping |
| Multi-year apply behavior | Explicit create/merge/replace/skip decisions committed atomically with revision checks |
| Evidence rendering | PDF.js canvas with page/coordinate overlay and authorized short-lived source access |
| Local/CI behavior | Storage/workflow/extractor fixture adapters; no live AWS dependency in ordinary tests |
| Production region | Existing `us-west-2` default supports Textract and Bedrock/BDA quotas; all resources remain environment-configurable |

All technical unknowns are resolved for implementation planning.
