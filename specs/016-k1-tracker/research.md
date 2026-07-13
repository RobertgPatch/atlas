# Phase 0 Research: K1 Tracker

**Feature**: `016-k1-tracker`  
**Inputs**: supplied tax-basis workbook, CPA HTML prototype, current Atlas K-1/partnership/report code, `spec.md`, and repository-local planning gates.

## Decision 1: Treat the workbook as the functional source and redesign its information architecture

- **Decision**: Preserve the workbook's tax-basis, loss-limitation, distribution, liability, Section L, book-tax, journal-entry, and sign-off workflows, but present one partnership and one selected year at a time. Use a compact year rail, summary cards, focused tabs, progressive disclosure, and an optional comparison of at most three years.
- **Rationale**: The workbook uses 174 rows by 10 fixed year columns and the HTML stacks a full card for every partnership. Both become difficult to scan. A selected-year workspace keeps the complete audit trail while eliminating the primary sources of endless vertical and horizontal scrolling.
- **Alternatives considered**:
  - Reproduce the workbook as a web grid: rejected because it preserves the user-reported row/column problem and the hidden Activity Detail report already demonstrates that failure mode.
  - Reactivate the HTML's stacked fund cards: rejected because every partnership includes metrics, two worksheets, warnings, NAV, and edit controls, creating unbounded page length.
  - Show a single dashboard with no line detail: rejected because preparers must trace basis and reconcile source values.

## Decision 2: Keep K1 Tracker distinct from existing K-1 Processing and Reports

- **Decision**: Add `/k1-tracker` and a visible `K1 Tracker` AppShell item. Keep `/k1` as the PDF ingestion/review queue and keep Reports Activity Detail as a portfolio reporting surface.
- **Rationale**: The existing K-1 page is document-centric, while the tracker is partnership/year-centric. Reusing field vocabulary and source links is valuable; merging the workflows would make navigation and permissions ambiguous.
- **Alternatives considered**:
  - Rename `/k1` to K1 Tracker: rejected because upload, extraction, review, and reparse remain separate operational jobs.
  - Embed the tracker only inside Partnership Detail: rejected because the user explicitly requested a navbar destination and needs cross-partnership selection.

## Decision 3: Create canonical tracker tables and project summaries into `partnership_annual_activity`

- **Decision**: Store tracker years, append-only active value revisions, import batches, and sign-offs in dedicated PostgreSQL tables. After each committed change, recalculate the partnership and upsert compatible summary fields into existing `partnership_annual_activity`.
- **Rationale**: `partnership_annual_activity` already feeds reports and contains useful summary columns, but it lacks full K-1 line items, three-class liability detail, suspended-loss history, per-field source/provenance, revisions, and sign-off. A canonical detail model plus an existing summary projection avoids both data loss and report duplication.
- **Alternatives considered**:
  - Extend `partnership_annual_activity` with dozens of columns and provenance fields: rejected because it would turn a report fact row into a sparse source ledger and still make revisions awkward.
  - Store all tracker data as JSON in one row: rejected because field-level provenance, conflict detection, validation, and audit queries become opaque.
  - Reuse current in-memory K-1/review repositories: rejected because they do not survive restart or multi-instance deployment.

## Decision 4: Never overwrite conflicting sources automatically

- **Decision**: Finalized K-1 synchronization and workbook merge fill missing tracker fields. If a non-identical active value already exists, the tracker records a conflict and requires an Admin to select the source or create a reasoned override. Each replacement creates a new append-only value revision and deactivates, but does not delete, the prior revision.
- **Rationale**: A universal precedence rule could silently replace CPA-curated workbook history with an extraction value or preserve stale workbook values over a reviewed amendment. Explicit resolution is safer and fully auditable.
- **Alternatives considered**:
  - Manual always wins: rejected because an old manual entry could hide a later finalized amendment.
  - Finalized K-1 always wins: rejected because the workbook contains fields and book adjustments not present on the K-1 and may include reviewed corrections.
  - Latest timestamp wins: rejected because arrival time does not indicate authority.

## Decision 5: Use server-side ExcelJS preview and atomic commit

- **Decision**: Parse `.xlsx` uploads on the API with the already-installed ExcelJS dependency. Persist a short-lived import-batch preview containing the workbook hash, detected mappings, source cells, conflicts, warnings, and expiry. Commit only the Admin-selected sheets/years and conflict actions in one database transaction.
- **Rationale**: The HTML's CDN SheetJS importer overwrites years by partnership name with no provenance or partial-error handling. Server-side parsing avoids a new browser CDN dependency, applies scope and size checks once, and supports atomic audit records.
- **Alternatives considered**:
  - Parse in the browser and post values: rejected because mapping rules and source evidence could be modified client-side and would be duplicated.
  - Commit immediately on upload: rejected because partnership matching, blank future years, and duplicate-year choices require human review.
  - Keep preview only in process memory: rejected because it fails across restarts and multiple API instances.

## Decision 6: Distinguish missing, zero, formula-derived, and entered workbook values

- **Decision**: Import detection considers populated source-input cells, not cached formula results alone. A year with only formula-generated balances/statuses is previewed as blank. Each field records whether it came from a literal cell, supported formula result, finalized K-1 field, carryforward, or manual entry.
- **Rationale**: The supplied workbook's blank 2026-2030 columns calculate carried balances and show `OK`, even though no K-1 values were entered. Treating cached zeros as real data would create false completeness.
- **Alternatives considered**:
  - Import every four-digit year column: rejected because it imports blank future years.
  - Treat blank as zero: rejected because tax workflow completeness depends on knowing whether a field was reviewed.

## Decision 7: Keep authoritative calculations on the API using integer cents

- **Decision**: Request and response amounts use decimal strings. The API converts them to integer cents for calculation, applies a 100-cent tolerance, and returns decimal strings. The Admin edit drawer calls a non-persistent calculation endpoint for debounced draft previews; the same calculation engine runs inside save/import transactions.
- **Rationale**: Financial calculations must not depend on floating-point browser math or duplicate tax logic. Integer cents are sufficient for the workbook's currency precision and avoid adding a new decimal dependency.
- **Alternatives considered**:
  - JavaScript `number` calculations in web and API: rejected due to precision and duplicated logic.
  - PostgreSQL formulas only: rejected because draft preview and unit testing of ordered year logic become cumbersome.
  - Add a separate shared calculation package: rejected as unnecessary for v1 because the API can serve draft previews.

## Decision 8: Correct known workbook defects and preserve the intended checks

- **Decision**: Calculated current-year net income is the signed K-1 income/gain total less signed loss/deduction effects; it excludes contributions, distributions, and liability changes. Overall reconciliation requires component variances, unexplained book-tax variance, journal balance, completeness, warnings, and sign-off to pass. Blank years are incomplete. Prior suspended losses participate in the later-year loss pool and may be allowed when basis is available.
- **Rationale**: Workbook row 148 incorrectly includes a $3,000,000 inception contribution in net income, and the final status still says reconciled because it ignores the component variance. The HTML's loss-pool logic correctly includes prior suspended amounts. These defects must become regression tests, not application behavior.
- **Alternatives considered**:
  - Match every workbook formula exactly: rejected because it would knowingly reproduce false variance and false reconciliation.
  - Remove component checks: rejected because the preparer needs a traceable Section L validation.

## Decision 9: Normalize sign handling and retain source presentation

- **Decision**: Store signed K-1 income/gain fields as signed amounts and store deductions/distributions as normalized positive decrease amounts. Preserve the original source amount/sign in provenance. The UI labels the active convention in each input group; journal entries alone use debit-positive/credit-negative.
- **Rationale**: The workbook has three simultaneous sign systems: positive loss/decrease input, negative Section L withdrawals, and debit-positive journal entries. Normalization prevents accidental double negatives while keeping source traceability.
- **Alternatives considered**:
  - Require workbook signs everywhere: rejected because finalized K-1 extraction already provides signed values.
  - Store every amount unsigned: rejected because income/loss fields and book values naturally require sign.

## Decision 10: Reuse finalized K-1 mirrors without depending on the in-memory review source

- **Decision**: Read finalized, unsuperseded K-1 documents and effective field values from PostgreSQL mirrors. Add a tracker sync call after finalization and an idempotent backfill on tracker load for older records. Missing database mirror data produces a visible source warning; the tracker never queries process-local maps as its source of truth.
- **Rationale**: Atlas already maps liabilities, capital, and Boxes 1-21, but current review/finalization still has process-local internals. The tracker must be restart-safe and can rely only on durable mirrored rows.
- **Alternatives considered**:
  - Wait for a full K-1 persistence rewrite: rejected because it expands the feature beyond the tracker and is not required if mirrored rows are validated.
  - Duplicate finalized field values during every page read: rejected because append-only tracker source revisions and idempotent sync provide clearer provenance.

## Decision 11: Apply scoped reads, Admin writes, revision conflicts, and sign-off invalidation

- **Decision**: Authenticated scoped users can read. Admins can preview/commit imports, create or edit years, resolve sources, delete, prepare, and review. Every mutation includes an expected year revision; mismatches return a conflict. Any material value or upstream-year change invalidates affected preparation/review sign-off and marks dependent later years for review.
- **Rationale**: This matches existing Atlas role conventions and prevents stale or signed calculations from surviving changed inputs.
- **Alternatives considered**:
  - Allow all scoped users to edit: rejected because the feature changes tax records and journal outputs.
  - Last-write-wins: rejected because concurrent or delayed import/edit flows could silently lose work.

## Decision 12: Exclude prototype-only portfolio analytics from v1

- **Decision**: Exclude NAV history, DPI, RVPI, TVPI, IRR, JSON backup/restore, and a stacked all-fund dashboard. Continue linking to existing FMV/capital/report features where useful.
- **Rationale**: These are HTML prototype additions, not part of the supplied tax-basis workbook's core goal. Excluding them keeps v1 centered on accurate K-1 rollforward, reconciliation, import, and sign-off.
- **Alternatives considered**:
  - Copy the entire prototype: rejected because it increases scope and recreates the endless stacked layout.

## Decision 13: Anchor the default calculation version to the current IRS partner-basis worksheet

- **Decision**: Use the current IRS Partner's Instructions for Schedule K-1 (Form 1065) basis worksheet as the authoritative default ordering: beginning basis and increases (including net liability increase), distributions and liability decreases with excess-distribution gain, then the section 704(d) loss/deduction limitation with prior carryforwards. Allocate insufficient basis across affected loss/deduction categories proportionately. Treat workbook-specific departures, including guaranteed-payment treatment or transaction-specific ordering, as explicit versioned CPA-approved rules rather than implicit formulas.
- **Rationale**: IRS guidance states that Item L capital cannot be used as outside basis, beginning basis equals prior ending basis and cannot be negative, all three Item K liability categories are used for basis, excess loss/deduction items carry forward, and insufficient basis is allocated proportionately across categories. It also warns that transaction timing can require point-in-time basis instead of the general worksheet ordering. This supports the page's separate Section L view and a versioned, reviewable calculation engine rather than hardcoding the workbook's shortcuts. Sources: [2025 Partner's Instructions for Schedule K-1 (Form 1065)](https://www.irs.gov/instructions/i1065sk1), [IRS section 704(d) loss-limit FAQ](https://www.irs.gov/newsroom/new-limits-on-partners-shares-of-partnership-losses-frequently-asked-questions), and [Publication 541](https://www.irs.gov/publications/p541).
- **Alternatives considered**:
  - Use the workbook/prototype order as tax authority: rejected because both are implementation references and the workbook already contains material formula/status defects.
  - Attempt to encode every transaction-specific tax exception in v1: rejected because the IRS instructions themselves identify point-in-time cases; these require explicit CPA treatment and calculation-version extensions.

## Reference Findings Captured for Implementation

- Supplied workbook: one sheet, `A1:K174`, 10 derived years, 716 formulas, populated 2021-2025, no validation or protection, and formula-only 2026-2030 columns.
- Golden ending outside basis: 2021 `$1,932,344`; 2022 `$1,684,727`; 2023 `$1,376,978`; 2024 `$1,144,214`; 2025 `$695,823`.
- Workbook sections: basis, loss limitation, distribution, Line K liabilities, statuses, GL adjustments, balanced journal summary, preparer/reviewer fields, Section L component validation, book-tax explanations, and final status.
- HTML strengths retained: live previews, prior-year carryforward, sticky/compact comparison labels, zero-row suppression, and actionable warnings.
- Legacy reuse retained: partnership lookup/detail, entity scope, Azure canonical field map, audit repository, React Query patterns, ExcelJS, and annual report projection.
- Legacy elements rejected as foundations: hidden MUI dashboard, nested placeholder screens, 21-column Activity Detail UI, browser/process-memory persistence, and limited annual PATCH behavior.
