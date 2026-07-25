# Quickstart: Multi-PDF K-1 Import

**Branch**: `020-k1-pdf-import`
**Purpose**: Implementation and validation sequence for the PDF-to-populated-tracker workflow.

## 1. Confirm feature context

```powershell
git branch --show-current
Get-Content specs/020-k1-pdf-import/spec.md
Get-Content specs/020-k1-pdf-import/plan.md
```

Expected branch: `020-k1-pdf-import`.

Read these contracts before implementation:

- [API contract](./contracts/k1-pdf-import.openapi.yaml)
- [semantic extraction schema](./contracts/k1-extraction-output.schema.json)
- [UI contract](./contracts/k1-pdf-import-ui.md)
- [data model](./data-model.md)

## 2. Install and start the existing local stack

```powershell
npm install
npm run dev:db
npm run dev:api
npm run dev:web
```

Use the normal local authentication bootstrap and a partnership visible to the current user.

The migration runner must apply `026_k1_pdf_import.sql` before the API registers PDF-import routes.

## 3. Use local fixture adapters by default

Ordinary development and CI must not require AWS credentials or send tax data to a live provider.

Suggested local environment:

```text
K1_PDF_STORAGE_BACKEND=local
K1_PDF_WORKFLOW_BACKEND=fixture
K1_PDF_EXTRACTOR_BACKEND=fixture
K1_PDF_IMPORT_MAX_FILES=20
K1_PDF_UPLOAD_MAX_BYTES=26214400
K1_PDF_EVIDENCE_URL_TTL_SECONDS=300
```

Fixture behavior:

- local storage writes below the existing ignored storage root
- workflow dispatch runs the same worker pipeline in-process or as a child command
- extractor reads synthetic recorded Textract/BDA/Bedrock results
- provider artifacts and benchmark output remain ignored
- no real TIN, EIN, name, amount, PDF text, or page image is committed

## 4. Implement in dependency order

1. Shared types, Zod schemas, error codes, and migration.
2. Pure exact-money normalization, ensemble, mapping, validation, and proposal builders.
3. Storage/workflow/extractor interfaces and fixture adapters.
4. PostgreSQL repositories and idempotent worker command.
5. Partnership-scoped API routes, presigned upload completion, review decisions, evidence URL, retry, cancel, and atomic apply.
6. AWS adapters and Terraform module.
7. Upload/status/review UI and PDF.js evidence viewer.
8. Existing K-1 form provenance and dynamic code detail integration.
9. Benchmark CLI, observability, security checks, and full regression.

## 5. Focused automated validation

Expected test groups after implementation:

```powershell
npm run --workspace=api test -- tests/k1-pdf-import.contract.test.ts
npm run --workspace=api test -- tests/k1-pdf-import.persistence.integration.test.ts
npm run --workspace=api test -- tests/k1-pdf-import.apply.integration.test.ts
npm run --workspace=api test -- tests/k1-pdf-extraction.fixture.contract.test.ts
npm run --workspace=api test -- tests/k1-pdf-normalization.test.ts
npm run --workspace=api test -- tests/k1-pdf-validation.test.ts
npm run --workspace=web test -- src/features/partnership-tracker/__tests__/K1PdfImportUpload.test.tsx
npm run --workspace=web test -- src/features/partnership-tracker/__tests__/K1PdfImportReview.test.tsx
npm run --workspace=web test -- src/features/partnership-tracker/__tests__/K1PdfImportApply.test.tsx
npm run --workspace=web test -- src/features/k1-tracker/__tests__/K1PdfImportProvenance.test.tsx
```

Required assertions:

- one batch accepts five PDF descriptors and creates five opaque upload slots
- no route trusts partnership, object key, hash, tax year, or destination key from the client without server validation
- retry uses a new run while preserving old failure evidence
- provider pagination/retry cannot duplicate candidates or extracted items
- blanks remain null, parentheses/trailing minus normalize correctly, and OCR-like ambiguity is reviewable
- every dynamic code/statement line survives mapping even when its destination is null
- target-year create/merge/replace/skip rules match the contract
- a five-year apply is atomic and stale revisions change no tracker rows
- calculations remain unchanged except through accepted existing tracker fields
- material imports invalidate signoff and later-year projections exactly once
- source item/document/batch links exist for every applied imported value
- official-form manual edits deactivate only changed imported source links
- logs and audit payloads do not contain filenames, object keys, source text, values, identities, prompts, or signed URLs

## 6. Full repository validation

```powershell
npm run test:api
npm run test:web
npm run build:api
npm run build:web
```

Run scoped lint/type checks for every changed web and API file according to the existing repository baseline.

Validate JSON and OpenAPI contracts with the chosen repository tooling; the JSON schema itself must parse as strict JSON.

## 7. Terraform validation

From `infra/aws/terraform`:

```powershell
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform plan -var-file staging.tfvars
```

The plan should add or update only reviewed resources such as:

- private K-1 document/artifact S3 bucket
- customer-managed KMS key and policies
- BDA project/blueprint identifiers or inputs
- Fargate import worker task definition and least-privilege task role
- Standard Step Functions state machine and execution role
- API permissions to create upload slots, evidence URLs, and start executions
- CloudWatch logs, metrics, dashboards/alarms, and optional budget dimensions

Review all IAM wildcards. Where Step Functions requires broader ECS task monitoring permissions, constrain task definition, cluster, pass-role, and network inputs as tightly as the service integration permits.

Do not commit Terraform state, real tfvars, account IDs that policy treats as sensitive, bucket object keys, KMS grants, presigned URLs, or raw plans.

## 8. Benchmark gate

Keep the real corpus and answer keys outside the repository. A committed synthetic manifest may describe fixture coverage.

Suggested command:

```powershell
npm run k1-import:benchmark -- --pdf-dir C:\secure\k1-benchmark\pdfs --answer-key-dir C:\secure\k1-benchmark\answers --output .\tmp\k1-benchmark
```

Expected output:

```text
tmp/k1-benchmark/
|-- manifest-summary.json
|-- field-accuracy.csv
|-- code-retention.csv
|-- review-rate.csv
|-- latency-cost.csv
|-- failures.json
`-- benchmark-report.html
```

Promotion criteria:

- at least 20 representative K-1 PDFs
- at least 95% exact normalized accuracy for core identity, tax-year, calculation, and official-form fields
- at least 98% precision for auto-accepted values
- 100% visible code/statement line retention
- documented schema, blueprint, prompt, inference profile/model, query, and mapping versions
- CPA approval of the result summary
- output directory confirmed ignored and free of repository-tracked private data

If a provider/model version fails the gate, keep it disabled in production configuration even if the feature's fixture tests pass.

## 9. Live AWS staging smoke test

Use only approved staging documents and identities. Never use production credentials locally.

1. Confirm Bedrock/BDA/Textract access and quotas in the configured region.
2. Confirm the BDA project references the live versioned K-1 blueprint.
3. Upload one text PDF and one scanned PDF through the partnership workspace.
4. Close the browser after processing starts, return, and verify status resumes.
5. Verify Step Functions execution, Fargate task, provider calls, artifacts, and database rows correlate through opaque IDs.
6. Verify one intentionally failed document can retry without duplicate runs/items.
7. Open evidence and confirm the URL expires and the bounding box matches the source.
8. Apply to disposable test years; verify source links, calculations, status, and signoff behavior.
9. Delete/dispose test records and objects according to the approved staging cleanup procedure.
10. Inspect CloudWatch and audit events to confirm no tax values or signed URLs were emitted.

Record only sanitized counts, timings, error categories, and pass/fail evidence in this document or a linked release record.

## 10. Five-PDF acceptance walkthrough

Prepare five approved K-1 PDFs for one partnership with distinct tax years and at least:

- one scanned document
- one negative amount in parentheses
- one Box 13 or Box 20 code list
- one supplemental statement reference
- one existing target year to exercise merge/replace

Walkthrough:

1. Open the partnership's `K1 & Cash Activity` area.
2. Select **Import K-1 PDFs** and choose all five PDFs.
3. Confirm all files hash, upload, and enter one batch.
4. Leave the page, return via batch history, and verify progress/state.
5. Resolve identity, duplicate, confidence, disagreement, statement, and unknown-code findings.
6. Inspect evidence for representative identity, money, checkbox, percentage, code, and statement items.
7. Choose create/merge/replace/skip decisions as appropriate.
8. Confirm the impact summary and apply selected years.
9. Verify all selected years appear on the existing year rail.
10. Open each applied year and confirm matching inputs are populated, imported provenance is visible, dynamic codes are retained, and missing values remain blank.
11. Confirm dated cash activity was not overwritten.
12. Confirm affected signed-off or downstream years show the expected review/invalidation state.
13. Complete normal CPA review and signoff on one imported year.

## 11. Responsive and accessibility verification

Verify upload, batch review, evidence, and apply flows at:

- 1440 CSS pixels
- 200% zoom
- 390 CSS pixels
- keyboard only
- screen-reader smoke pass
- reduced motion
- read-only user permissions

Acceptance points:

- no page-level horizontal overflow
- document/year navigation preserves logical order
- progress and errors are announced without polling noise
- every review action has an accessible name and visible focus
- evidence has a textual page/raw-source equivalent
- focus returns correctly after dialogs/drawers
- confidence and finding severity do not depend on color
- atomic-apply impact and signoff invalidation are understandable before confirmation

## 12. Security and artifact audit

Before handoff:

```powershell
git status --short
git diff --check
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!tmp/**' "BEGIN (RSA|OPENSSH) PRIVATE KEY|AWS_SECRET_ACCESS_KEY|X-Amz-Signature|AKIA[0-9A-Z]{16}" .
rg --files | rg "(?i)(\.pdf$|textract.*\.json$|bda.*\.json$|bedrock.*\.json$|benchmark-report|answer-key)"
```

Manually inspect changed fixtures and documentation for real names, TINs/EINs, amounts, source text, page images, provider payloads, prompts containing tax data, object keys, account IDs, or signed URLs.

## Completion Criteria

- A five-PDF batch can be uploaded, resumed, reviewed, and atomically applied.
- Existing K-1 years are created or explicitly merged/replaced/skipped with revision safety.
- Every supported extracted field appears in the existing year form when accepted.
- Every unknown code/statement item is retained and reviewable.
- Every applied value has document/item/page provenance.
- Benchmark thresholds pass for the promoted production configuration.
- Focused/full tests, builds, Terraform validation, live staging smoke, responsive/accessibility checks, and private-artifact audit pass.
