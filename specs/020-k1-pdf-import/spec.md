# Feature Specification: Multi-PDF K-1 Import

**Feature Branch**: `020-k1-pdf-import`
**Created**: 2026-07-19
**Status**: Draft
**Input**: User description: "Upload one or more K-1 PDFs for a single partnership, detect the tax year in each PDF, create the corresponding tracker years, and populate every matching K-1 entry field for that year."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import Several K-1 Years Together (Priority: P1)

As an authorized user working in one partnership, I can select one or several Schedule K-1 PDFs and start one import batch so that Jackson detects the tax year represented by each document and prepares the corresponding K-1 tracker years without manual re-entry.

**Why this priority**: Multi-year population is the core value of the feature. A batch of five historical K-1s should become five reviewable tracker years in one workflow.

**Independent Test**: Upload five valid K-1 PDFs for one partnership, wait for extraction to finish, and verify that the batch presents five detected years with a complete per-document status and no document assigned to another partnership.

**Acceptance Scenarios**:

1. **Given** a partnership and five readable K-1 PDFs for five distinct tax years, **When** the user uploads them as one batch, **Then** Jackson creates one document record per PDF, detects one tax year per document, and presents five proposed year mappings.
2. **Given** a batch containing both text-based and scanned PDFs, **When** processing completes, **Then** every document reaches either a reviewable result or an actionable failure state without blocking successful documents in the same batch.
3. **Given** a document whose partnership or partner identity conflicts with the selected partnership, **When** extraction completes, **Then** Jackson flags the mismatch and prevents that document from being applied until a user resolves or skips it.
4. **Given** two PDFs in the same batch that resolve to the same tax year, **When** the batch is validated, **Then** Jackson flags the duplicate-year conflict and does not silently choose one.

---

### User Story 2 - Review and Populate Existing K-1 Forms (Priority: P1)

As a CPA or authorized preparer, I can review the extracted values and exceptions for each detected year, choose how each year should be applied, and populate the existing K-1 entry page with imported draft values while preserving the current calculation and signoff workflow.

**Why this priority**: Extraction is useful only when it safely reaches the existing complete-form editor and does not overwrite reviewed financial data without an explicit decision.

**Independent Test**: Review one extracted year, resolve required exceptions, apply it to a new or existing tracker year, and verify that all supported calculation and official-form inputs are populated with the selected values and the year remains reviewable before signoff.

**Acceptance Scenarios**:

1. **Given** a detected year that does not yet exist, **When** the user applies that year, **Then** Jackson creates the year, populates all supported extracted inputs, marks it as needing review, and opens or links to that year's existing K-1 form.
2. **Given** a detected year that already exists, **When** the user reviews it, **Then** Jackson requires an explicit `merge`, `replace`, or `skip` decision and shows conflicts before changing the existing year.
3. **Given** an existing year has changed since the preview was loaded, **When** the user applies the import, **Then** Jackson rejects the stale decision and preserves the newer year revision.
4. **Given** an imported year was previously signed off, **When** imported values materially change it, **Then** Jackson increments its revision, invalidates the current signoff, and records the reason.
5. **Given** a batch contains several valid year decisions, **When** the user applies them, **Then** either every selected year decision commits with its evidence links or none of them commits.

---

### User Story 3 - Review Exceptions and Source Evidence (Priority: P2)

As a CPA reviewer, I can work from an exception-first queue and inspect the PDF evidence behind each imported value so that I correct uncertain values instead of rechecking every high-confidence field.

**Why this priority**: K-1s contain codes, statements, OCR ambiguity, and unusual layouts. Evidence and targeted review make AI-assisted import auditable and practical.

**Independent Test**: Process a fixture containing a low-confidence amount, an extractor disagreement, a supplemental-statement value, and an unknown box code; verify that all four appear in the review queue with document, page, raw text, confidence, and a route to the matching form field or retained unmapped item.

**Acceptance Scenarios**:

1. **Given** extractors disagree or confidence is below the configured threshold, **When** the batch becomes reviewable, **Then** the value is marked `needs review` and cannot be presented as verified.
2. **Given** the reviewer opens evidence for a value, **When** the PDF is available, **Then** Jackson shows the source document and page and highlights the source region when geometry exists.
3. **Given** a reviewer corrects an extracted value, **When** the correction is saved, **Then** Jackson retains the raw extraction, records the corrected value and actor, and uses the correction in the proposed year mapping.
4. **Given** all blocking exceptions for a document are resolved, **When** the reviewer verifies the document, **Then** its status changes to ready to apply without changing other documents in the batch.

---

### User Story 4 - Preserve Unknown Codes and Statements (Priority: P2)

As a CPA reviewer, I can see every extracted box/code/detail item, including codes Jackson does not yet map to a fixed calculation field, so that no tax information disappears during import.

**Why this priority**: Code-bearing boxes and supplemental statements vary by year and issuer. Flattening them into one scalar would make the import incomplete and unsafe.

**Independent Test**: Upload a K-1 containing several Box 13, 19, and 20 codes plus a statement-only item; verify that each distinct item is retained, mapped items show their rollup destination, and unmapped items remain visible and require review.

**Acceptance Scenarios**:

1. **Given** a PDF contains multiple entries for one box, **When** extraction completes, **Then** Jackson stores each code/detail entry separately before applying any deterministic aggregation rule.
2. **Given** an extracted code has a configured destination, **When** the year preview is built, **Then** Jackson shows the source items, the aggregation rule, and the proposed destination value.
3. **Given** an extracted code has no configured destination, **When** the batch is reviewed or applied, **Then** Jackson retains it as an unmapped item, flags it for review, and never silently discards it.
4. **Given** the K-1 contains a statement reference with no extractable amount, **When** processing completes, **Then** Jackson retains the reference text and statement page relationship rather than treating it as zero.

## Edge Cases

- A file is encrypted, corrupt, password protected, not actually a PDF, or exceeds the configured upload limit.
- One document contains several K-1 forms or a combined packet rather than one K-1 for one tax year.
- A batch mixes K-1s from different partnerships or different partner entities.
- Tax year, partnership identity, or partner identity is missing or has low confidence.
- Two files are byte-for-byte duplicates, two files map to the same year, or a prior batch already imported the same document hash.
- A PDF includes an amended K-1 for a year that already has an original K-1.
- A code/detail line has text but no amount, an amount but no code, a code Jackson has never seen, or several statement pages.
- Parentheses, trailing minus signs, dashes, blanks, OCR substitutions, and locale-like punctuation must not turn missing values into zero or change signs silently.
- Extraction succeeds for some documents while another document times out or is throttled.
- The user leaves the page while processing and later returns to the batch.
- The selected partnership, target year, or source document is deleted or moved out of the user's scope while a batch is processing.
- A year changes after extraction but before apply, or a signoff is added after preview.
- Applying one of several years fails partway through a transaction.
- Source evidence has text but no reliable bounding box.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Jackson MUST let an authorized user start a partnership-scoped import batch containing one or more PDF files.
- **FR-002**: The system MUST validate file type, size, count, and PDF readability before or during intake and MUST report failures per document.
- **FR-003**: The system MUST persist the original document and a SHA-256 digest before asynchronous extraction begins.
- **FR-004**: The system MUST expose durable batch and document statuses so a user can leave and later resume the workflow.
- **FR-005**: Processing failure for one document MUST NOT discard successful extraction results for other documents in the same batch.
- **FR-006**: The system MUST detect tax year, partnership identity, partner identity, final/amended status, and the supported K-1 fields represented in each PDF.
- **FR-007**: The system MUST extract the fields represented by the current 42 calculation placements and 48 official-form placements when source values exist.
- **FR-008**: The system MUST preserve every extracted box/code/detail and supplemental-statement item even when it has no current canonical destination.
- **FR-009**: Missing or blank source values MUST remain null and MUST NOT be converted to zero.
- **FR-010**: Money MUST be normalized to exact decimal strings using deterministic sign and punctuation rules before it can be proposed to a tracker field.
- **FR-011**: Every extracted item MUST retain its source document, page when known, raw source text, extraction method, confidence when available, review status, and source geometry when available.
- **FR-012**: The system MUST create deterministic validation findings for identity mismatch, missing/duplicate year, duplicate document, unknown code, low confidence, extractor disagreement, Section L reconciliation, relevant cross-field comparisons, and year-over-year continuity.
- **FR-013**: The review experience MUST prioritize blocking and warning findings and MUST let a reviewer inspect evidence and correct, reject, or verify proposed values.
- **FR-014**: Reviewer corrections MUST be append-only and MUST preserve the original extracted value, actor, timestamp, and reason or disposition.
- **FR-015**: The system MUST maintain configurable deterministic mappings from raw box/code items to canonical tracker or official-form fields, including aggregation and sign conventions.
- **FR-016**: Unmapped extracted items MUST remain visible after a batch is applied and MUST NOT alter financial calculations automatically.
- **FR-017**: For each detected tax year, the user MUST explicitly choose `create`, `merge`, `replace`, or `skip` as applicable before applying the batch.
- **FR-018**: Applying a selected new year MUST create it and populate supported calculation values and official-form data in the existing K-1 tracker.
- **FR-019**: Applying to an existing year MUST require its expected revision and MUST reject stale writes.
- **FR-020**: A multi-year apply MUST be atomic across all selected decisions.
- **FR-021**: Applied imported values MUST participate in the existing value-revision, projection, conflict, recalculation, and audit behavior without changing calculation formulas.
- **FR-022**: Any material imported change MUST invalidate signoff according to the existing tracker rules and leave the affected year in a reviewable state.
- **FR-023**: The existing K-1 entry page MUST show imported provenance, confidence/review state, evidence access, and any aggregated code-item breakdown without removing manual correction capabilities.
- **FR-024**: Only users already authorized to edit the selected partnership's K-1 data MAY upload, review, apply, retry, or cancel an import; read-only users MAY view results and evidence within their scope.
- **FR-025**: Source documents and derived artifacts MUST be encrypted in transit and at rest, isolated from public access, and served only through short-lived authorized access.
- **FR-026**: The system MUST record audit events for batch creation, upload completion, processing transitions, retries, reviewer decisions, apply decisions, year creation/update, and signoff invalidation without logging document contents or sensitive extracted values.
- **FR-027**: Processing MUST be idempotent by document and stage so a retry does not create duplicate extracted items, years, or tracker revisions.
- **FR-028**: The system MUST support cancelling an unapplied batch and retrying a failed document without deleting its prior failure evidence.
- **FR-029**: The system MUST expose operational metrics for latency, failure reason, extraction coverage, confidence/review rates, correction rates, and cost attribution at batch/document level without exposing tax data in metric dimensions.
- **FR-030**: The production extractor selection MUST be justified against a versioned, CPA-approved benchmark dataset; fixtures committed to the repository MUST contain synthetic or fully redacted data only.

### Key Entities

- **K-1 Import Batch**: A partnership-scoped group of uploaded documents with lifecycle, owner, aggregate progress, apply decisions, and audit metadata.
- **K-1 Import Document**: One uploaded PDF, its hash, storage identity, detected metadata, extraction lifecycle, retry state, and relationship to a proposed tax year.
- **Extraction Run**: One idempotent execution of a named extraction strategy and version against a document, including raw artifact locations, timing, cost metadata, and outcome.
- **Extracted K-1 Item**: A raw or normalized K-1 field, box/code/detail, checkbox, identifier, or statement value with source evidence and confidence.
- **Validation Finding**: A deterministic or extractor-comparison result with severity, blocking state, affected item/year, and resolution.
- **Reviewer Decision**: An append-only correction, verification, rejection, mapping selection, or explanatory disposition made by a user.
- **Year Mapping**: The proposed and committed relationship between one import document and one partnership tracker year, including create/merge/replace/skip decision and expected revision.
- **Code Mapping Rule**: A versioned rule connecting a box/code pattern to a canonical destination, aggregation behavior, and sign convention.
- **Tracker Value Revision**: The existing canonical financial-value history populated by an applied import and linked back to its source item and document.
- **Official Form Data**: The existing typed K-1 header, identity, checkbox, percentage, money, and repeatable code/detail data populated from accepted extracted items.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can upload five K-1 PDFs for one partnership in one action and receive five independently tracked document results and proposed tax-year mappings.
- **SC-002**: Applying a clean five-document batch creates or updates all five selected tracker years in one operation, and each existing K-1 form displays the imported supported values immediately after refresh.
- **SC-003**: On a versioned CPA-approved benchmark of at least 20 representative K-1 PDFs, core identity, tax-year, calculation, and official-form fields achieve at least 95% exact normalized-value accuracy before manual correction.
- **SC-004**: On the same benchmark, 100% of visible code-bearing and supplemental-statement lines are retained as extracted items even when no destination mapping exists.
- **SC-005**: At least 98% of values that the system marks high-confidence and non-blocking match the CPA-approved answer key.
- **SC-006**: Every applied imported value can be traced to an import batch, source document, extracted item, and source page; geometry is available whenever the extraction provider supplies it.
- **SC-007**: Duplicate documents, duplicate years, partnership/partner mismatches, unknown codes, and stale target revisions never cause a silent overwrite.
- **SC-008**: For documents up to the supported size and page limit, 95% of batches reach a terminal reviewable or actionable-failure state within five minutes, excluding time spent waiting for a user decision.
- **SC-009**: A failed extraction stage can be retried without producing duplicate extracted items, tracker years, or active tracker values.
- **SC-010**: No raw tax document, extracted tax value, credential, or pre-signed access URL appears in source control, application logs, audit payloads, or telemetry dimensions.

## Assumptions

- Each uploaded file in the first release contains one Schedule K-1 (Form 1065) for one tax year; splitting multi-K-1 packets is deferred.
- All PDFs in one batch are intended for the partnership selected before upload; identity mismatches require review rather than automatic reassignment.
- The existing 42 calculation fields, 48 official-form fields, calculation semantics, revision model, and signoff flow remain authoritative destinations.
- Existing tracker years are never overwritten automatically; the user selects merge, replace, or skip after reviewing conflicts.
- K-3 semantic extraction, automated tax treatment for every rare code, amended-versus-original diff presentation, model fine-tuning, and cross-partnership packet ingestion are deferred.
- AWS is the target production platform, while local development and CI use recorded synthetic fixtures and local service adapters without requiring live cloud credentials.
- The first release retains raw and derived import artifacts according to the application's tax-record retention policy; an explicit operational retention period will be configured outside this feature specification.
