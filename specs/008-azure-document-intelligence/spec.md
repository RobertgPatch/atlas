# Feature Specification: Azure Document Intelligence K-1 Extraction

**Feature Branch**: `008-azure-document-intelligence`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "I have setup a Microsoft Document Intelligence service so I can intelligently scan my K-1 PDFs and reliably extract the data I care about from it. Endpoint: `https://atlaswc.cognitiveservices.azure.com/`. Two keys (Key 1, Key 2). Guide me on how to set this up correctly."

## Context & References

This specification is governed by and MUST be read alongside:

- **[System Constitution](../000-constitution.md)** — §3 K-1 workflow invariants, §9 security, §13 system integrity
- **[002 K-1 Ingestion Spec](../002-k1-ingestion/spec.md)** — this feature replaces the V1 stub extractor (`apps/api/src/modules/k1/extraction/stubExtractor.ts`) referenced by 002 Decision 8
- **[003 Review & Finalization Spec](../003-review-and-finalization/spec.md)** — consumer of extracted field values; the field taxonomy (section + fieldName + required + sourceLocation) is unchanged
- **[Postgres DDL](../../docs/schema/21-postgres-ddl.sql)** — `k1_field_values`, `k1_issues`, `k1_documents.parse_*` columns remain the persistence contract

## Primary User Story

As an Admin or User uploading a K-1 PDF, I want the system to automatically read the IRS Schedule K-1 (Form 1065) page and populate the review workspace with high-confidence extracted values — partnership EIN and name, partner info, Box 1–22 income/deduction/credit lines, distributions, liabilities, capital account — so that I spend minutes confirming/correcting rather than re-typing the entire form.

## Success Criteria

- **SC-001** On upload of a standard IRS Schedule K-1 (Form 1065) PDF, the system extracts at least the following fields with ≥ 80% field-level accuracy on a 20-document internal fixture: Partnership EIN, Partnership name, Partner TIN, Partner type, Profit/Loss/Capital percentages (beginning + ending), Partner share of liabilities (nonrecourse/qualified-nonrecourse/recourse), Capital account analysis lines (beginning, contributions, net income, other, withdrawals, ending), Part III boxes 1, 2, 3, 4a, 4b, 4c, 5, 6a, 6b, 6c, 7, 8, 9a, 9b, 9c, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21.
- **SC-002** Each extracted field is written with a `confidence_score ∈ [0,1]` provided by Azure Document Intelligence and a `source_location` (page + bbox normalized to PDF points) so the review workspace can highlight the source region on click.
- **SC-003** Extraction completes within p95 ≤ 10 s for a single-page K-1 and p95 ≤ 25 s for a 3-page K-1 (1 round-trip + poll cycle), excluding PDF upload time.
- **SC-004** If the Azure DI call fails (network, auth, throttled, or schema mismatch) the K-1 transitions to `PROCESSING` with `parse_error_code` + `parse_error_message` set and `parse_attempts` incremented by 1 — exactly the same failure surface the V1 stub produces.
- **SC-005** No Azure DI key ever appears in source control, logs, response bodies, audit events, or client bundles. Keys are read exclusively from process environment variables.
- **SC-006** A developer can switch between `stub` and `azure` extractor backends by flipping a single env variable (`K1_EXTRACTOR=stub|azure`) with zero code changes required, preserving local dev ergonomics and CI determinism.
- **SC-007** The existing `stubExtractor.extract()` contract (`K1Extractor` interface) is preserved; downstream `runParsePipeline` code in `k1.routes.ts` is unchanged except for extractor selection.

## Functional Requirements

- **FR-001** The API MUST expose a `K1Extractor` backend named `azure` that calls the Azure Document Intelligence REST API using the `prebuilt-tax.us.1065SchK1` model.
- **FR-002** The backend MUST authenticate using a subscription key supplied via the `Ocp-Apim-Subscription-Key` HTTP header, sourced from `process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY`.
- **FR-003** The endpoint URL MUST be sourced from `process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` (e.g., `https://atlaswc.cognitiveservices.azure.com/`); the API version MUST be sourced from `process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION` with a default of `2024-11-30`.
- **FR-004** The backend MUST submit the PDF bytes via `POST {endpoint}/documentintelligence/documentModels/prebuilt-tax.us.1065SchK1:analyze?api-version={apiVersion}` as `application/pdf`.
- **FR-005** The backend MUST poll the returned `Operation-Location` URL every ≥ 1 s until `status ∈ {succeeded, failed}` or a max wall-clock of 60 s is reached; on timeout, emit `PARSE_TIMEOUT`.
- **FR-006** On `status = succeeded`, the backend MUST map each recognized Azure DI field to one `K1FieldValueRecord` with: `fieldName` (snake_case canonical form, e.g. `partnership_ein`), `label` (human-facing), `section` (`entityMapping` | `partnershipMapping` | `core`), `required` boolean, `rawValue` (string form of Azure DI `content`), `normalizedValue` (same string unless deterministic normalization applies — e.g., currency, percentage, date), `confidenceScore` (float), `sourceLocation` (first page number + bounding polygon converted to `[x,y,w,h]` points).
- **FR-007** For fields that Azure DI does NOT return or returns with `confidence < 0.5`, the backend MUST still create a `K1FieldValueRecord` with `rawValue = null`, `confidenceScore = null | <0.5>`, and MUST append a `MISSING_FIELD` issue on the K-1 with severity `MEDIUM` and a message that names the missing canonical field.
- **FR-008** Mapping coverage MUST include all fields listed in SC-001 at minimum. An explicit `fieldMap` table (canonical `fieldName` ↔ Azure DI field path) is part of this feature's data model and MUST be exported as a typed constant.
- **FR-009** The `nextStatus` returned by the extractor MUST be `NEEDS_REVIEW` when any issue was appended OR when any required field has `rawValue = null`; otherwise `READY_FOR_APPROVAL`.
- **FR-010** No PII/EIN/TIN value MUST appear in structured logs. The backend MAY log only: operation ID, HTTP status, duration, bytes sent, count of fields returned, and average confidence.
- **FR-011** The Azure DI client module MUST live in `apps/api/src/modules/k1/extraction/azureExtractor.ts` and MUST NOT be imported by test suites that run in CI without network access; CI continues to use `stubExtractor`.
- **FR-012** The backend selection MUST be centralized in `apps/api/src/modules/k1/extraction/index.ts` exporting a single `getExtractor()` function that reads `process.env.K1_EXTRACTOR` and returns the appropriate implementation.
- **FR-013** `apps/api/.env.example` MUST be updated with commented entries for `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_API_VERSION`, and `K1_EXTRACTOR` (default `stub`).
- **FR-014** A targeted contract test MUST run against a recorded Azure DI response fixture (no live network) asserting the field map produces the expected `K1FieldValueRecord[]` shape and required-field issue behavior.

## Out of Scope

- Custom-trained models (we use the prebuilt 1065 Schedule K-1 model only in V1).
- Form 1120-S (S-corp) or Form 1041 (trust) K-1 variants — these have different prebuilt model IDs and will be follow-up features.
- Batch extraction (multi-PDF async jobs) — V1 processes one K-1 per upload, synchronous poll.
- OCR of handwritten or photographed K-1s with page skew > 15° — out of scope; users should re-scan.
- Storing the raw Azure DI response JSON — V1 stores only the mapped `K1FieldValueRecord`s and the audit event. Re-extraction requires re-sending the PDF.

## Assumptions

- The Azure DI resource is deployed in a region that supports the `prebuilt-tax.us.1065SchK1` model (East US, West US, West Europe as of 2024-11-30 API version).
- The two keys provided (Key 1, Key 2) are for rotation. Application uses one at a time; rotation is out of the deployment pipeline for V1.
- Network egress from the API host to `*.cognitiveservices.azure.com` is allowed.
