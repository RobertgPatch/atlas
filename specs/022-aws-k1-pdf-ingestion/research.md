# Phase 0 Research: AWS K-1 PDF Ingestion

**Date**: 2026-08-17  
**Feature**: [spec.md](./spec.md)

## Decision 1: Use Bedrock Data Automation as the primary extractor

**Decision**: Process each PDF with Amazon Bedrock Data Automation (BDA) custom document output plus standard document output. Use a versioned Schedule K-1 (Form 1065) blueprint for structured fields and request page/element/word output with bounding boxes for audit and review evidence.

**Rationale**:

- BDA supplies managed document classification, structured custom extraction, confidence, OCR/layout output, and visual grounding through one AWS service.
- The async document API accepts S3 input and writes JSON and optional supporting files to S3, matching the application's AWS deployment.
- A Schedule K-1 schema fits within the current async blueprint limit when repeated code/detail rows are modeled as arrays rather than one leaf per occurrence.
- Standard output ensures that content which does not fit the application schema is still retained instead of disappearing silently.

**Alternatives considered**:

- **Amazon Textract for every document**: rejected for the first release. It is strong at OCR, tables, forms, and geometry but would still require a second semantic layer for K-1 meaning and continuation statements.
- **Direct Bedrock foundation-model prompting for every document**: rejected as the primary path because prompt/model operations, response grounding, and schema stability would become application responsibilities.
- **Non-AWS extraction**: removed from the executable K-1 path; the deterministic stub remains for offline tests only.

**Sources**: [BDA API workflow](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-using-api.html), [document standard output](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-output-documents.html), [blueprint concepts and limits](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-blueprint-info.html)

## Decision 2: Make the batch asynchronous and event-driven

**Decision**: Treat a multi-file upload as an application batch and invoke BDA once per PDF. The browser uploads each file directly to S3 using a short-lived presigned URL. After upload completion, the API validates S3 object metadata and sends one idempotent work message per document to SQS. A dedicated worker submits `InvokeDataAutomationAsync`. BDA completion events flow through EventBridge to SQS, and a scheduled reconciler checks stale jobs with `GetDataAutomationStatus`.

**Rationale**:

- BDA async invocation is one asset per request; batching belongs in the application.
- Direct-to-S3 upload avoids buffering up to 25 PDFs in the Fastify process and avoids ALB/request-duration constraints.
- SQS isolates each document, supports retries and a dead-letter queue, and prevents one failed PDF from blocking a batch.
- EventBridge delivery is best effort, so reconciliation is required to guarantee eventual completion.
- The existing `setImmediate` pipeline loses work when the API process restarts and cannot provide durable leave-and-return behavior.

**Alternatives considered**:

- **One multipart request containing all files**: rejected because it increases API memory, request duration, and all-or-nothing failure risk.
- **Polling BDA only**: rejected as the sole completion mechanism because it adds delay and waste; retained only as reconciliation.
- **Step Functions per document**: deferred. PostgreSQL already owns workflow state and SQS plus an idempotent worker is sufficient for the initial scale.

**Sources**: [BDA CLI async invocation and EventBridge notification](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-document-processing-cli.html), [BDA runtime operations](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_Operations_Runtime_for_Amazon_Bedrock_Data_Automation.html)

## Decision 3: Use one blueprint per materially different K-1 revision

**Decision**: Maintain one compact blueprint for each materially different Schedule K-1 layout family, all within one BDA project, plus a fallback blueprint. Persist the matched blueprint ARN, immutable version, application mapping version, and output schema version on every extraction attempt. Promote tested versions from DEVELOPMENT to LIVE; never mutate the interpretation of an already processed attempt.

The application recognizes Schedule K-1 (Form 1065) revision years 2000 through 2025. A matched form in that range proceeds through the same canonical extraction, review, and apply pipeline; a missing, pre-2000, or future revision year remains a blocking issue. The fallback blueprint and unmatched-evidence path continue to catch materially incompatible layouts rather than fabricating current-form values.

**Rationale**:

- A single blueprint without a fallback is forcibly matched and reports a misleading matcher confidence of 1.0. A fallback forces real classification and makes unexpected tax forms visible as `FALLBACK` or `NO_MATCH`.
- BDA selects one matching blueprint; separate blueprints must represent alternative document types/revisions, not separate halves of one K-1.
- Version pinning makes reprocessing and audit results reproducible.
- Repeated Part III codes and continuation details fit as list/table fields; the current form uses nine repeated coded sections, below the applicable list-field limits.

**Alternatives considered**:

- **Split Part I/II and Part III into multiple blueprints and merge them**: rejected because BDA classifies to one blueprint rather than combining outputs.
- **One unversioned generic tax-form blueprint**: rejected because it would conceal form-revision drift and weaken field-specific validation.

**Sources**: [fallback blueprint behavior](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-fallback-blueprint.html), [creating and versioning blueprints](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-idp.html), [current BDA quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html)

## Decision 4: Do not add Textract or an FM second pass to the happy path

**Decision**: Ship the first release with BDA only. Retain the provider-neutral extraction interface so a selective fallback can later use Textract for scan/layout failure classes or a grounded Bedrock FM pass for continuation-statement overflow. Any fallback output must retain page/source evidence and require review.

**Rationale**:

- A second service on every file increases cost, reconciliation complexity, and disagreement handling before there is evidence it is needed.
- BDA standard output already supplies OCR, tables, reading order, word locations, and page images/crops.
- A labeled fixture set will show whether failure classes justify a targeted fallback.

**Alternatives considered**:

- **Run BDA and Textract in parallel and choose the higher confidence**: rejected because confidence scores are not calibrated across providers and disagreements would create false assurance.
- **Use an FM to fill blank BDA fields automatically**: rejected because missing financial values must become review issues, not inferred facts.

## Decision 5: Make PostgreSQL and S3 authoritative before adding AWS processing

**Decision**: Refactor the current K-1 document and review repositories so PostgreSQL is the source of truth and route every PDF operation through an object-store interface with local and S3 implementations. Remove process-local maps, direct filesystem reads, opportunistic database mirroring, and fire-and-forget parse state from the production path.

**Rationale**:

- Current upload/review state is held in process-local maps; a restart loses workflow state even though table definitions already exist.
- The former extractor, PDF review handler, and delete path bypassed the storage abstraction and read local files directly.
- BDA requires S3 input/output, and sensitive originals plus raw results need durable, encrypted retention.
- PostgreSQL row locks, uniqueness constraints, and transactions provide idempotency for duplicate queue deliveries and concurrent review/apply attempts.

**Alternatives considered**:

- **Keep the in-memory store and mirror more often**: rejected because dual sources of truth cannot guarantee correctness under restart or concurrent workers.
- **Store all workflow state in DynamoDB**: rejected because the existing relationships, authorization, audit, review, and tracker data are already relational and transactional in PostgreSQL.

## Decision 6: Define one provider-neutral canonical extraction contract

**Decision**: Map provider output into a versioned `K1ExtractionDraft` before it reaches review or tracker logic. Inventory tests must prove that all 48 official-form keys and all 31 literal calculation-backed K-1 fields are either mapped exactly once or explicitly handled by a documented derived/conflict rule.

**Rationale**:

- Only 31 of the 42 writable calculation fields are literal K-1 destinations. The 11 Jackson workpaper-only fields must never be populated from a PDF.
- The two deprecated write keys must never be emitted.
- Repeated code/detail rows require stable occurrence IDs, sequence, descriptions, amounts, and source locations; flat field-name maps collapse data.
- BDA, offline fixtures, and any future AWS fallback should share the same review and apply logic.

**Special mapping rules**:

- Map printed capital contribution to canonical `capital_contributions`, never deprecated `section_l_capital_contributed`.
- Do not write deprecated `box_13_other_deductions`. Populate portfolio-deduction and management-fee calculation fields only through an explicit reviewed code policy; preserve every Box 13 row in official coded data.
- Preserve the application's historical Line 18 calculation semantics. Generic extracted Box 18 rows remain official coded rows unless a versioned, reviewed mapping rule identifies the compatible calculation field.
- Dated capital activity remains authoritative for contributions and distributions. PDF totals become evidence/conflicts when dated activity already exists.
- Never populate opening basis, suspended loss, book values, or reconciliation workpaper fields from the K-1.

**Alternatives considered**:

- **Write BDA field names directly into tracker keys**: rejected because provider schema changes would become financial data migrations and would bypass destination-specific rules.

## Decision 7: Match by identifiers first and never auto-create silently

**Decision**: Resolve the partner entity using normalized TIN, then resolve the partnership using normalized EIN within that entity. Use normalized name similarity only to rank candidates. Zero matches, duplicate identifiers, mismatched name/identifier evidence, or multiple candidates move the document to `NEEDS_MATCH`. Creating a missing entity or partnership requires an explicit user action with the extracted evidence visible.

**Rationale**:

- The current name-only match and automatic partnership creation can attach sensitive financial data to the wrong record.
- The repository now has partner tax ID and partnership EIN fields that provide stronger signals.
- Ambiguity must remain a review issue rather than an implicit mutation.

**Alternatives considered**:

- **Continue auto-creating from extracted partnership name**: rejected because OCR/name variation can create duplicates and incorrect ownership relationships.

## Decision 8: Apply reviewed data through a dedicated transaction

**Decision**: Add an explicit apply-preview/apply service and API. Applying a K-1 locks the document and target tracker year, checks both versions, writes `FINALIZED_K1` calculation revisions, writes append-only official-form field revisions, updates the official JSON snapshot, records every keep/use conflict decision, invalidates sign-offs according to existing rules, recalculates projections, links provenance, audits the operation, and marks the document applied in one PostgreSQL transaction.

**Rationale**:

- The existing manual year PATCH cannot carry document source IDs and only permits manual source types.
- Current lazy finalized-source synchronization runs on reads, does not populate official data, does not increment tracker revision correctly, and does not invalidate sign-offs.
- Official form JSON currently has no field-level provenance or revision history.
- An explicit preview makes existing-vs-extracted decisions visible before the atomic write.

**Alternatives considered**:

- **Extend lazy `syncFinalizedSources()`**: rejected because a GET must not create financial revisions and it cannot present pre-commit conflict choices.
- **Call the manual PATCH endpoint as the reviewer**: rejected because that would mislabel document-derived values as manual entries and lose source lineage.

## Decision 9: Encrypt and isolate every document artifact

**Decision**: Use a dedicated private S3 bucket for original PDFs, standard output, custom output, and normalized evidence. Enable Block Public Access, bucket-owner enforcement, versioning as required by retention policy, SSE-KMS with a customer-managed key, scoped lifecycle rules, opaque object keys, and no sensitive names/TINs in tags. Use short-lived presigned PUT URLs and application-authorized PDF reads. The worker receives least-privilege S3, SQS, BDA, KMS, and status permissions.

**Rationale**:

- K-1s contain TINs, names, addresses, and financial values.
- BDA async processing and customer-managed encryption are supported through API operations.
- The existing web-assets bucket is public-delivery infrastructure and must not store private tax documents.

**Alternatives considered**:

- **Reuse the web-assets S3 bucket**: rejected due to incompatible access, caching, lifecycle, and blast-radius requirements.
- **Return presigned GET URLs directly to the iframe**: rejected for the primary review path; keep same-origin authorization and stream/range proxying or issue a very short-lived redirect only after an access check.

**Sources**: [BDA encryption](https://docs.aws.amazon.com/bedrock/latest/userguide/encryption-bda.html), [Bedrock S3 access](https://docs.aws.amazon.com/bedrock/latest/userguide/s3-bucket-access.html)

## Decision 10: Deploy BDA configuration as versioned infrastructure plus a promotion step

**Decision**: Add an AWS ingestion Terraform module for S3, KMS, SQS/DLQ, EventBridge, ECS worker, IAM, endpoints, logs, and alarms. Manage the BDA blueprint and project with Cloud Control resources where supported, keep blueprint JSON in source control, and use an explicit release script/API step to create and promote immutable blueprint versions to LIVE. Record the LIVE ARNs/versions as worker configuration.

**Rationale**:

- AWS exposes CloudFormation resource types for BDA blueprints and projects, and the HashiCorp AWS Cloud Control provider exposes those resources.
- Blueprint version promotion is a model release and should be gated by fixture evaluation rather than coupled blindly to every infrastructure apply.
- The current Terraform stack already supplies ECS, RDS, network, secrets, CloudWatch, and budget patterns.

**Alternatives considered**:

- **Configure blueprints manually only**: rejected because schema drift would be unreviewable and environments could not be reproduced.
- **Promote every schema edit automatically**: rejected because a financial extraction model must pass evaluation before LIVE use.

**Sources**: [CloudFormation BDA project](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrock-dataautomationproject.html), [CloudFormation BDA blueprint](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrock-blueprint.html)

## Decision 11: Gate production on a sanitized evaluation corpus

**Decision**: Build a non-production fixture set across supported years, tax-software vendors, digital PDFs, scans, amended/final forms, negative formats, checkboxes, and continuation statements. Measure field accounting, normalized exact match, issue recall, false-safe rate, matcher accuracy, page grounding, and apply equivalence. Use BDA blueprint optimization only with sanitized representative ground truth and promote a version only after the agreed thresholds pass.

**Rationale**:

- BDA accuracy must be measured on the application's document distribution, not assumed from a demo.
- The success criterion is not that every field is auto-accepted; it is that every present value is extracted or visibly routed to review.
- Blueprint optimization supports representative labeled examples and reports extraction metrics.

**Alternatives considered**:

- **Test only a single sample K-1**: rejected because layout, scan quality, code rows, and vendor differences are the main sources of production error.

**Source**: [BDA blueprint optimization](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-optimize-blueprint-info.html)

## Decision 12: Control throughput and cost at the application boundary

**Decision**: Default to `us-west-2`, matching the current deployment. Limit a user batch to 25 PDFs, a file to 25 MB, and a document to 100 pages unless configuration explicitly raises them. Start with 10 concurrent BDA document jobs, exponential backoff on throttles, a queue-age alarm, page-count metrics, and monthly budget alerts. Confirm account quotas and cross-Region inference policy during staging readiness.

**Rationale**:

- Current BDA document limits are much higher than normal K-1 needs, but permissive limits increase abuse and cost exposure.
- The documented default async document concurrency is 25 in `us-west-2`; keeping headroom avoids immediate throttling.
- BDA document pricing is page- and custom-field-based, so page count and blueprint size are the useful cost drivers.
- BDA uses cross-Region inference within a geography; sensitive-tax-data policy must explicitly accept this before production.

**Alternatives considered**:

- **Submit all batch documents immediately with no cap**: rejected because it makes throttling, fairness, and cost unpredictable.

**Sources**: [Bedrock endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html), [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
