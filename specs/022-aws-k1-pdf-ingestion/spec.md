# Feature Specification: AWS K-1 PDF Ingestion

**Feature Branch**: `022-aws-k1-pdf-ingestion`  
**Created**: 2026-08-17  
**Status**: Draft  
**Input**: User description: "Upload multiple partnership Schedule K-1 PDFs, parse every field with AWS managed document automation, and enter the K-1s into the application."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload a batch of K-1 PDFs (Priority: P1)

An authorized user selects or drops multiple partnership Schedule K-1 PDF files in one action. The application validates the files, creates one tracked item per PDF, uploads valid files, and begins processing each document independently so one bad file does not block the rest of the batch.

**Why this priority**: Batch upload is the entry point for the entire workflow and removes the need to enter documents one at a time.

**Independent Test**: Upload a mixed batch of valid PDFs, an unsupported file, and a duplicate PDF; verify that valid documents begin processing while each rejected file shows a specific reason and can be removed or retried independently.

**Acceptance Scenarios**:

1. **Given** an authorized user has several valid PDF files, **When** they select all files and submit the batch, **Then** each file receives its own progress and processing status without requiring a separate upload action.
2. **Given** a batch contains an invalid, corrupt, encrypted, oversized, or duplicate file, **When** validation runs, **Then** the affected file is rejected with a clear reason while other valid files continue.
3. **Given** a network interruption occurs during upload, **When** the user retries, **Then** already accepted documents are not duplicated and incomplete files can resume or restart safely.

---

### User Story 2 - Extract every K-1 field into a reviewable draft (Priority: P1)

For each accepted Schedule K-1, the application extracts the tax period, partnership and partner identity, selections and checkboxes, ownership percentages, liabilities, capital-account information, every Part III amount, and every coded or supplemental detail row. The application preserves the original document and associates each extracted value with confidence and source location so users can compare the draft with the PDF.

**Why this priority**: Comprehensive, traceable extraction is the core user value and is required before the document can populate the application safely.

**Independent Test**: Process a representative fixture set spanning supported tax years, multi-page statements, negative values, checked boxes, and coded detail rows; verify that every field present in the source has a corresponding draft value or an explicit unresolved-field issue.

**Acceptance Scenarios**:

1. **Given** a readable partnership Schedule K-1, **When** processing completes, **Then** all fields present on the form and attached continuation statements appear in a structured draft with value, confidence, page reference, and extraction status.
2. **Given** a field is blank, unreadable, ambiguous, or unsupported, **When** extraction completes, **Then** the field is not invented and an explicit blank or review issue is recorded.
3. **Given** the document includes repeated code/value rows or continuation statements, **When** processing completes, **Then** all rows remain separate and retain their form line, code, description, amount, and page provenance.
4. **Given** document processing fails, **When** the failure is recorded, **Then** the document remains visible, retains its attempt history, and can be retried without uploading the PDF again.

---

### User Story 3 - Match and review the extracted K-1 (Priority: P1)

The application uses extracted identifiers and names to propose the existing partnership, partner entity, and tax year. Unique matches are preselected; ambiguous or missing matches require a user decision. A reviewer sees the source PDF beside the populated K-1 form, with low-confidence, missing, invalid, and conflicting values clearly identified.

**Why this priority**: A financial document must not update the wrong partnership or silently introduce inaccurate data.

**Independent Test**: Process documents with exact matches, ambiguous names, unknown entities, low-confidence values, and conflicts with existing year data; verify that only safe matches are proposed and every exception is reviewable before data is applied.

**Acceptance Scenarios**:

1. **Given** extracted identifiers uniquely match an existing partnership and partner entity, **When** review opens, **Then** that match and the extracted tax year are preselected and the evidence used for the match is visible.
2. **Given** identifiers are missing, conflicting, or match more than one record, **When** review opens, **Then** the user must select or create the correct record before applying the K-1.
3. **Given** a value has low confidence, violates field rules, conflicts with an existing value, or lacks a destination field, **When** review opens, **Then** it is visually flagged and cannot be silently accepted.
4. **Given** the reviewer changes an extracted value, **When** the draft is saved, **Then** both the machine-extracted value and the user-corrected value remain distinguishable in history.

---

### User Story 4 - Apply reviewed K-1s to the application (Priority: P1)

After review, an authorized user applies a document to the matched partnership tax year. The application creates the year when allowed, or presents field-level merge decisions when data already exists. Applying a K-1 updates the complete K-1 form in one operation and records document provenance, reviewer, decisions, and the prior values.

**Why this priority**: Extraction only saves work when reviewed data becomes usable application data without sacrificing auditability.

**Independent Test**: Apply a reviewed document to an empty year and to an existing populated year; verify complete population, conflict handling, calculations, provenance, revision behavior, and rollback on any failure.

**Acceptance Scenarios**:

1. **Given** a reviewed K-1 maps to an empty tax year, **When** the user applies it, **Then** all supported calculation and official-form fields are populated together and the document is linked as their source.
2. **Given** the target year already contains values, **When** the user applies the document, **Then** existing values are not silently overwritten; the user can keep existing values or accept extracted values for each conflict.
3. **Given** the target year changed after review began, **When** the user applies the draft, **Then** the operation is rejected as stale and the user is shown the new conflicts before retrying.
4. **Given** any part of the apply operation fails, **When** the transaction ends, **Then** no partial K-1 update is visible and the reviewed draft remains available.
5. **Given** the K-1 is applied successfully, **When** the partnership year is opened, **Then** the existing calculation, review, and sign-off workflows operate on the imported values and show document provenance.

---

### User Story 5 - Manage batch progress and exceptions (Priority: P2)

Users can leave the upload flow and later return to a processing queue that shows batch and document progress. They can filter for documents requiring attention, retry transient failures, cancel documents that have not been applied, and continue reviewing completed drafts.

**Why this priority**: Managed document extraction is asynchronous; users need a durable place to monitor and resolve long-running or failed work.

**Independent Test**: Start a batch, leave the page, complete and fail different documents in the background, then return and verify accurate status, retry controls, and navigation to each completed review.

**Acceptance Scenarios**:

1. **Given** a batch is still processing, **When** the user leaves and returns, **Then** current per-document status and completed results are available without re-uploading.
2. **Given** a transient extraction failure, **When** the user retries the document, **Then** a new attempt is recorded and the previous failure remains in history.
3. **Given** one document in a batch needs review, **When** the user filters the queue, **Then** they can find and open that document without waiting for the rest of the batch.

### Edge Cases

- A single PDF contains more than one Schedule K-1, or a package combines a K-1 with unrelated tax forms.
- A K-1 uses a tax year or revision of the form whose labels or line structure differ from the current application model.
- The form is scanned, rotated, skewed, handwritten, password-protected, corrupt, or missing pages.
- Negative values use parentheses, trailing minus signs, or nonstandard typography.
- Checkboxes are faint, multiple mutually exclusive choices are selected, or ownership percentages do not reconcile.
- A line points to an attached statement containing more rows than the standard form can display.
- The same binary file is uploaded twice, or a different PDF represents the same partnership, partner, and tax year.
- Extraction completes after the target partnership, entity, or tax year is modified or deleted.
- A batch partially succeeds, a processing callback is delivered more than once, or a transient service limit delays work.
- A user loses permission to the target entity while the document is processing or under review.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an authorized user to upload multiple PDF files in one batch and MUST track validation, upload, processing, review, and apply status independently for every file.
- **FR-002**: The system MUST validate file type, file integrity, encryption state, configured size and page limits, and duplicate content before processing.
- **FR-003**: Failure of one document MUST NOT prevent other valid documents in the same batch from progressing.
- **FR-004**: The system MUST process accepted documents asynchronously and preserve durable status so users can leave and return without losing work.
- **FR-005**: The system MUST extract every value present in the standard partnership Schedule K-1 header, Part I, Part II, Part III, and associated coded or continuation-statement details supported by the application.
- **FR-006**: Every extracted value MUST retain its raw value, normalized value when applicable, confidence, source page/location, extraction attempt, and validation status.
- **FR-007**: The system MUST NOT fabricate values for blank, unreadable, ambiguous, or unsupported fields; it MUST record an explicit review issue instead.
- **FR-008**: The system MUST retain the original PDF and a versioned raw extraction result for audit and reprocessing subject to the application's document-retention policy.
- **FR-009**: The system MUST propose a partnership, partner entity, and tax year using extracted identifiers and names, but MUST require user resolution when a match is absent or ambiguous.
- **FR-010**: The system MUST present a review experience that lets a user compare the PDF with all extracted fields and clearly identifies low-confidence, missing-required, invalid, unmatched, and conflicting values.
- **FR-011**: Authorized users MUST be able to correct draft values while preserving the original extracted values and correction history.
- **FR-012**: The system MUST require explicit review before extracted values update a partnership tax year; background extraction alone MUST NOT silently alter the financial source of truth.
- **FR-013**: The system MUST populate both calculation-backed fields and official-form-only fields represented by the application, including repeated coded rows and checkboxes.
- **FR-014**: Applying a reviewed document MUST be atomic, revision-aware, and auditable, and MUST preserve the prior application values.
- **FR-015**: Existing target values MUST NOT be silently overwritten; conflicts MUST support an explicit keep-existing or use-extracted decision.
- **FR-016**: Successfully applied values MUST participate in the existing calculation, provenance, review, and sign-off workflows without changing their financial semantics.
- **FR-017**: The system MUST detect exact duplicate files and potential duplicate K-1s for the same partnership, partner, and tax year, and MUST prevent multiple active documents from being applied unknowingly.
- **FR-018**: Users MUST be able to retry transient processing failures without re-uploading the source PDF, with each attempt retained in history.
- **FR-019**: The system MUST enforce the existing authentication, entity-level authorization, encryption, audit, and sensitive-document access rules at upload, processing, review, download, and apply time.
- **FR-020**: The system MUST expose batch and per-document statuses including pending upload, uploaded, processing, needs match, needs review, ready to apply, applied, failed, and cancelled.
- **FR-021**: The system MUST make processing and apply failures actionable without exposing sensitive document contents in logs or error messages.
- **FR-022**: The first release MUST support standard U.S. partnership Schedule K-1 forms for tax years 2000 through 2025 and MUST route missing, pre-2000, future, or otherwise unrecognized form revisions and non-K-1 tax forms to review rather than applying them automatically.

### Key Entities

- **Ingestion Batch**: A user-initiated group of files with creator, timestamps, aggregate progress, and per-document outcomes.
- **K-1 Document**: The original PDF and its content fingerprint, file metadata, access scope, lifecycle status, proposed target, and active extraction attempt.
- **Extraction Attempt**: A versioned processing run with provider job identity, timing, status, raw result reference, model/schema version, failure details, and retry lineage.
- **Extracted Field**: A field-level raw and normalized value with form location, confidence, source evidence, validation status, and optional corrected value.
- **Match Candidate**: A scored proposed relationship between extracted partnership/partner identity and an existing application record, including the evidence used.
- **Review Issue**: A low-confidence, invalid, missing, unmatched, unsupported, or conflict condition requiring user attention and resolution.
- **Apply Decision**: The reviewer-approved target and field-level conflict choices used to populate one partnership tax year.
- **Document Provenance Link**: The durable relationship from applied application values back to the source document, extraction attempt, and reviewer decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can submit a batch of 25 valid K-1 PDFs in under 3 minutes of active interaction.
- **SC-002**: At least 95% of uploaded readable K-1 PDFs reach a reviewable draft without manual re-upload.
- **SC-003**: For the agreed representative fixture set, 100% of source fields are accounted for as an extracted value, an explicit blank, or a review issue; no present field disappears silently.
- **SC-004**: At least 95% of machine-populated field values in the representative fixture set exactly match the source after normalization, and all remaining mismatches are visibly flagged before apply.
- **SC-005**: Users can identify and resolve every flagged field and apply a clean K-1 in under 5 minutes of active review time.
- **SC-006**: Zero existing financial values are silently overwritten, and zero failed apply operations leave a partially updated tax year.
- **SC-007**: Every applied value can be traced to its source PDF, extraction attempt, source location, and any user correction or conflict decision.
- **SC-008**: A failure in one document leaves all other valid documents in the same batch available to process, review, and apply.

## Assumptions

- The existing authenticated, entity-scoped user model and partnership K-1 annual editor remain the destinations for imported data.
- The first release supports Schedule K-1 (Form 1065) for tax years 2000 through 2025; corporate, trust/estate, and S-corporation K-1 variants are outside this feature.
- Extraction creates a draft and always requires explicit human review before financial data is applied.
- The application already represents the standard form fields required for the supported revision; unrecognized fields are retained as review issues rather than discarded.
- A default batch limit of 25 PDFs, a configurable per-file size limit, and configured page limits are acceptable for the first release.
- Original documents and extraction evidence are sensitive financial records and follow the application's established retention, encryption, and access-control policies.
- The existing tax-year calculations and sign-off rules remain authoritative; ingestion supplies source values but does not redefine tax logic.
