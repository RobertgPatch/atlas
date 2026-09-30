# Feature Specification: Statement Adapter Normalization

**Feature Branch**: `032-statement-adapter-normalization`

**Created**: 2026-09-28

**Status**: Planned; ready for task generation

**Input**: Extend Liquidity statement ingestion with an adapter per custodian export pattern, supporting CSV and XLSX, starting with Merrill Lynch, Charles Schwab, and Morgan Stanley. Define how additional formats are onboarded and tested.

## Scope and inherited product decisions

This feature extends the merged 031 implementation at `14cc1c9`. It supersedes its CSV-only file restriction and overly broad inference that a unit price of $1 establishes cash basis. Other confirmed product behavior continues:

- Statements are complete point-in-time account snapshots. A newer snapshot replaces only its bound account; historical snapshots and other accounts remain intact.
- Account matching is scoped to entity and custodian. Full account identifiers can support automatic matching through keyed fingerprints; last-four characters alone do not establish identity.
- Liquidity aggregates compatible holdings by normalized symbol across accounts and custodians and preserves the source account subrows. Uploads do not imply trades or additive purchases.
- Use all available supported columns, derive missing values only by named rules, and preserve unavailable values. Default absent currency to USD and unknown asset classification to Other with a review dropdown.
- Cash can have value without quantity. Confirmed cash without reported basis uses value as basis when the cash-at-value convention applies.
- Missing optional basis, day change, or statement totals do not block application. Day change can be stored when supplied; restoring its Liquidity display is outside this feature.
- Plaid remains removed. Real-time equity pricing remains controlled by the existing server flag, default off.
- This request authorizes branch creation and planning. Deployment still requires being on `main` and an explicit deployment request.

## User Scenarios & Testing

### User Story 1 - Import supported monthly statements accurately (Priority: P1)

An Admin uploads an unmodified supported CSV or XLSX, sees the detected format, account, date, normalized holdings, source totals, and actionable review findings, then applies a complete account snapshot to Liquidity.

**Independent test**: Synthetic Merrill CSV, Schwab CSV, and Morgan Stanley XLSX fixtures all produce expected canonical fields and reviewed account totals through the real upload route.

**Acceptance scenarios**:

1. Given any of the three supported formats, uploading it uses its registered adapter and preserves imported fields, their evidence, units, and missing-value meanings.
2. Given the same symbol with different descriptions in two accounts, applying both yields one compatible security rollup with two account subrows.
3. Given a later statement for an existing account, applying it replaces that account, removes holdings absent from the new complete snapshot, and leaves other accounts unchanged.
4. Given an older statement, it can be reviewed and retained without displacing newer approved holdings.
5. Given a page reload or navigation, the approved snapshot remains visible and portfolio totals match the approved selected account positions.

### User Story 2 - Add a new recurring export pattern (Priority: P1)

The operator supplies a representative file and its intended account/date/total semantics. A developer adds one versioned adapter and synthetic conformance cases. Future files with that pattern are detected without recurring column setup.

**Independent test**: A fourth synthetic custodian pattern can be registered by adding its adapter, fixtures, and registry entry without modifying normalization, reconciliation, application, or reporting logic.

**Acceptance scenarios**:

1. Unrecognized files remain drafts and explain the unsupported structure; they do not publish partial account data.
2. Additional columns and reordered known columns are accepted when they do not change meaning; conflicting or ambiguous headers require review or adapter maintenance.
3. An adapter has an identity and version independent of the reader and financial rules. Updating one adapter does not reprocess unrelated formats.
4. A new adapter receives the same authorization, row-accounting, decimal, reconciliation, and monthly-replacement tests as existing adapters.

### User Story 3 - Understand missing data and reconciliation (Priority: P1)

The reviewer can distinguish a real inconsistency from absent source information, inspect the specific account/row/field, and make a recorded correction where appropriate.

**Independent test**: A synthetic workbook with missing basis, a cash-only value, a non-cash $1 holding, and partial source footers reaches the expected warning/blocking states without fabricated values.

**Acceptance scenarios**:

1. A confirmed cash holding without quantity preserves quantity as unavailable and uses the permitted cash basis convention.
2. A non-cash holding priced at $1 does not receive cash basis merely because of its price.
3. A source basis subtotal covering only known basis rows reconciles to those source rows, even when normalization derives basis for other rows.
4. A mismatched complete market-value total shows reported value, computed value, difference, currency, and source location, with a link to the relevant review field.
5. Saving review keeps unresolved findings visible and does not silently scroll away from the blocking issue.
6. Reported market value is authoritative. Fixed-income percentage-of-par prices and ambiguous stock/option categories cannot enter unit-price multiplication or live repricing without a verified convention.

### User Story 4 - Preserve earlier imports and corrections (Priority: P2)

Existing 031 drafts and approved snapshots remain readable after the new parser is introduced. Reprocessing is an explicit draft operation; a parser update never rewrites approved history.

**Independent test**: Load and review an older draft, reopen an applied duplicate, and create a correction using new parser versions while preserving the original source, approval, and historical amounts.

### User Story 5 - Select complete accounts from a workbook (Priority: P1)

The Admin sees all supported accounts/sheets and chooses which complete account snapshots to apply. Excluded accounts remain unchanged, and the application records the exclusion decisions.

**Independent test**: A synthetic two-account workbook updates only the selected account; a later explicit reprocess can apply the previously excluded account while preserving the first approval and all historical revisions.

**Acceptance scenarios**:

1. Every detected account is selected or explicitly excluded, and overview/note sheets have an explained disposition.
2. Selecting an account that spans multiple source sections includes every required section; excluding a sheet cannot make a partial account look complete.
3. Selected accounts apply atomically, excluded accounts remain unchanged, and stale selections invalidate previews.

### Edge cases

- Same custodian, incompatible export pattern; multiple structural matches; unknown worksheet; overlapping overview/detail; partial/filtered account export.
- Full versus masked/rounded numeric account identifiers; same last four in different accounts; multiple dates or currencies within a candidate account.
- Blank versus zero, incomplete basis, adjusted/original cost differences, non-cash price of one, percentage-point versus ratio cells, and fixed-income quote units.
- Footer totals over only known source rows; derived cash basis after source reconciliation; notes and subtotals adjacent to positions.
- Hidden rows/sheets, formulas/cached errors, huge dimensions, corrupt ZIP/XML, and resource exhaustion.
- Reprocessing a reviewed/applied source, stale workers/previews, monotonically increasing review revisions, excluded-account later application, and old-schema reads.

## Security, Privacy & Operational Requirements

### Actors, tenancy, and authorization

- Robert Patch is the operator and implementation owner. Existing Admin authorization governs upload, mapping, review, selection, reprocessing, and apply. Scoped reporting users only read authorized entities; parser jobs use the entity persisted on the import.
- The application remains single tenant. A file belongs to one selected entity and custodian. Multiple accounts in one file cannot cross that entity boundary.
- No new external parser, AI extraction provider, database, queue service, or always-on runtime is introduced.

### Data protection and audit

- Originals, cell/row evidence, account identifiers, financial fields, and corrections are Restricted. Read user-authorized local samples only for structural analysis; committed fixtures and verification artifacts contain synthetic values.
- Preserve protected, versioned originals. Fingerprint full identifiers before persisting sanitized parsed evidence; normal API responses, logs, metrics, and filenames must not disclose full identifiers.
- Imported, derived, defaulted, reviewed, incomplete, and unavailable values remain distinguishable. Source controls use original reported operands, independently of later derived or reviewed values.
- Record source hash, immutable object version, reader/adapter/rules/schema versions, account binding, reviewer, time, changes, and application identity.
- Retention and deletion inherit the existing record class and organizational policy; this feature does not invent a retention period, delete historical imports, or change the unresolved organization-wide retention schedule. Production readiness must verify the applicable existing policy.

### Threats, failure, and recovery

- Treat extensions, MIME types, ZIP metadata, XML, headers, formulas, worksheets, and file contents as untrusted. Enforce upload and decompression limits, deadlines, deterministic detection, inert formulas, and no external relationship resolution.
- Structural ambiguity, corrupted input, missing account/date/value information required for publication, or unsupported completeness cannot silently remove positions or overwrite an account.
- Failures leave the last approved portfolio unchanged. Review/apply remain transactional, version-bound, and idempotent.
- Existing recovery targets remain RPO <=15 minutes, RTO <=8 hours, and >=35-day database PITR. Additive schema changes and explicit rollback compatibility protect old and new statement history.
- Update the existing data-flow, threat, dependency, incident, and recovery documentation for ZIP/XML ingestion. This plan makes no new legal compliance or production-readiness claim.

### Approved exceptions

None required for this planning scope. Existing operational obligations remain production release gates; planning does not establish their completion.

## Requirements

### Functional requirements

- **FR-001**: Accept bounded `.csv` and `.xlsx` holdings snapshots with content validation and type-correct upload/download handling. `.xls`, `.xlsm`, PDFs, images, encrypted workbooks, and transaction-only exports are outside the initial reader contract.
- **FR-002**: Separate raw file reading from format detection, adapter extraction, shared financial normalization, reconciliation, and publication.
- **FR-003**: Select adapters by validated file structure and custodian compatibility, never filename or custodian label alone. Zero, multiple, and incompatible matches have explicit outcomes.
- **FR-004**: Adapters declare required/optional headers, aliases, source units, account/date extraction, section and footer roles, product mappings, and completeness assumptions as executable contracts.
- **FR-005**: Every nonblank source row and relevant sheet has an accounted disposition. Summary, subtotal, note, metadata, or repeated-header rows cannot become holdings or disappear without a declared rule.
- **FR-006**: All formats emit the same versioned canonical schema. Preserve extra columns as protected supporting evidence; map known optional columns and never infer meaning solely from position.
- **FR-007**: Preserve original numeric lexemes through XLSX reading and use exact decimal calculations with explicit scales, rounding, currency, percentage units, and price conventions.
- **FR-008**: Financial normalization prefers usable imported values, then applicable documented derivations. Explicitly incomplete basis stays incomplete. Estimated percentage-derived basis is identified as estimated.
- **FR-009**: Classification uses reviewed choice, verified adapter/instrument mappings, source product labels, and vetted symbol fallback with defined precedence. Broad labels such as Stocks / Options cannot classify every row as equity.
- **FR-010**: Cash basis inference requires confirmed cash semantics. Price equal to one alone is insufficient. Quantity is optional for cash holdings.
- **FR-011**: Reconcile controls by account, currency, measurement, scope, and source coverage. No-total and optional missing data are nonblocking; proven inconsistent controls are actionable findings.
- **FR-012**: Account identity extraction and recurring matching preserve entity/custodian scope and distinguish full, masked, unreliable, and absent identifiers.
- **FR-013**: Persist recognized extra fields needed by Liquidity uniformly, including basis, gain/loss, day change, accrued interest, security identifiers, and valuation conventions. Optional field absence does not make the whole upload fail.
- **FR-014**: Keep symbol rollups and account subrows outside adapters, preserving financially compatible aggregation and absence of fabricated quantities, basis, or returns.
- **FR-015**: Preserve complete snapshot replacement, date ordering, approval, corrections, immutable evidence, and exact duplicate idempotency across file kinds.
- **FR-016**: Persist parser provenance and allow controlled reprocessing against explicitly selected versions while keeping old runs and approved snapshots intact.
- **FR-017**: Expose concrete review findings with severity, account, sheet/row/column, affected field, expected/actual values where authorized, and a corrective action.
- **FR-018**: Publish an adapter onboarding guide and reusable conformance harness. Adding a normal new layout must not require downstream financial/report changes.
- **FR-019**: Expand existing storage and database constraints without renaming or rewriting historical CSV originals or approved snapshot payloads.
- **FR-020**: Bound XLSX archive expansion, XML work, cells, strings, sheets, rows, time, and concurrency before publication; test cancellation and lease recovery.
- **FR-021**: Provide parity coverage for the actual browser upload path as well as direct API calls, including content type, raw bytes, review loading, persistence, and portfolio refresh.
- **FR-022**: Detect all supported account/sheet candidates and allow explicit account selection/exclusion, applying selected complete snapshots atomically and retaining exclusion evidence.
- **FR-023**: Morgan Stanley canonical basis uses usable Adjusted Cost, falling back to Total Cost when adjusted cost is unavailable; preserve both reported source fields and reconcile each footer to its own source scope.
- **FR-024**: New-format onboarding is Codex/developer-assisted using samples and synthetic conformance tests. Retain the existing one-off CSV mapper; a reusable admin adapter builder is outside this feature.

### Key entities

- Statement source and immutable parse run.
- Reader document, sheet, row, cell, and evidence location.
- Registered adapter and structural match.
- Canonical account snapshot and position.
- Source control, normalization derivation, review finding, and coverage.
- Account binding, review revision, preview, and application.

## Success criteria

- **SC-001**: All three initial format suites reproduce synthetic golden holdings, classifications, totals, optional fields, and evidence exactly within declared source rounding tolerances.
- **SC-002**: A fourth test adapter is added using only its module, manifest/registration, and conformance fixtures; shared downstream logic remains unchanged.
- **SC-003**: Every source holding is accounted for exactly once, and no note, footer, overview, or duplicated section is counted as a position.
- **SC-004**: Monthly-sequence tests prove correct replacement, no duplicate reapplication, protected other-account holdings, historical ordering, and stable aggregation after reload.
- **SC-005**: Missing currency defaults to USD; missing optional basis, day change, classification, and totals do not generate blocking findings. Unsafe derivation cases remain unavailable.
- **SC-006**: Old drafts and snapshots remain readable, and parser upgrades never alter approved values without a new authorized correction.
- **SC-007**: Ordinary files up to 2,000 holdings target p95 parse/normalize/reconcile under five seconds. Hard-limit CPU, memory, cancellation, and API responsiveness are measured before enabling XLSX.
- **SC-008**: Unsupported or ambiguous structures and hostile archives fail without any publication, identifier leakage in routine responses, external network access, or uncontrolled resource use.

## Clarification log

Confirmed by the user on 2026-09-28:

1. **New layouts**: Give Codex the sample so it can add and test a reusable adapter.
2. **Multiple accounts/sheets**: Detect all supported candidates, then let the user confirm which complete account snapshots to apply.
3. **Morgan Stanley basis**: Use Adjusted Cost, falling back to Total Cost when adjusted cost is unavailable.

The three core planning questions are resolved. An additional optional preference was asked about remembering a manually confirmed masked-account match. Until that preference is answered, retain existing full-identifier automatic matching and explicit confirmation for masked-only accounts; this does not prevent parsing their statements. A remembered masked alias is not part of the current scope.

The three original samples remain available locally; no re-upload is required for planning. Implementation-time security scans, performance measurements, and real upload verification remain required work, not unanswered technical choices.
