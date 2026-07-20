# UI Contract: Multi-PDF K-1 Import

**Feature**: `020-k1-pdf-import`
**Primary surface**: Partnership Tracker → `K1 & Cash Activity`

## Entry Point

`K1BasisWorkspace` adds an edit-permission-gated **Import K-1 PDFs** action beside the existing year actions.

- Visible only when a partnership is selected.
- Enabled for users who can edit that partnership's K-1 data.
- Read-only users can open prior import batches and evidence but cannot upload, decide, retry, cancel, or apply.
- The existing workbook import, Add any year, Compare years, Delete year, annual form, results, and signoff actions remain available.

## Flow Overview

```text
Import K-1 PDFs
  -> Select 1-20 PDFs
  -> Hash and upload each file directly to private storage
  -> Start processing
  -> Leave open or return later
  -> Review batch exceptions and proposed years
  -> Resolve, correct, map, reject, or skip
  -> Choose create/merge/replace/skip per year
  -> Apply all selected years atomically
  -> Open populated existing K-1 year form
  -> Complete CPA review and normal signoff
```

## Surface 1: Upload Dialog

### Structure

1. Dialog title: **Import K-1 PDFs**.
2. Context: selected partnership and entity; these are not editable inside the dialog.
3. Drop zone/file picker accepting PDF only and supporting multi-select.
4. File list with filename, size, hashing/upload progress, retry/remove action, and validation message.
5. Privacy note: documents are private and will be processed for K-1 extraction.
6. Primary action changes by stage:
   - `Upload 5 PDFs`
   - `Start processing`
   - `View import batch`
7. Secondary action: `Cancel` before processing; `Close and continue in background` after processing starts.

### Client validation

- Minimum one and maximum 20 files.
- Each file reports MIME/type, empty file, and 25 MiB limit errors independently.
- Identical hashes in the selected set are blocked before upload.
- Filenames are display-only; no filename influences the storage key or tax-year mapping.
- Hashing and upload progress use an accessible live region and do not freeze other file rows.

### Upload behavior

- The browser computes SHA-256, creates one batch, and uploads to returned presigned POST slots.
- If one upload fails, successful objects remain uploaded; the user can retry only the failed row while the presigned slot remains valid or request a refreshed slot.
- Processing cannot start until every retained row is verified.
- Closing the dialog after processing starts never cancels the batch.

## Surface 2: Batch Status and Review Workspace

### Route

`/partnership-tracker?partnership=<id>&area=k1&importBatch=<batchId>`

The import batch is represented in URL state so browser back/forward and refresh restore the workflow. Closing the batch returns to the selected K-1 year without losing the batch.

### Header

- Partnership identity and **K-1 PDF import** title.
- Batch status badge and aggregate progress: `3 of 5 ready · 1 processing · 1 failed`.
- Started by/date and document count; no object key or provider ARN.
- Actions as allowed by state: `Retry failed`, `Cancel batch`, `Apply selected years`, `Back to K-1 years`.

### Document/year rail

Each PDF row shows:

- filename
- detected tax year or `Year needs review`
- final/amended indicator when known
- document status
- blocking/warning counts
- proposed target state: `New year`, `Existing year r4`, `Duplicate in batch`, or `Skipped`

Ordering:

1. blocking documents
2. failed documents
3. warning documents
4. ready documents
5. tax year descending within a group

The rail becomes a select/list drawer on narrow viewports.

### Processing states

- The workspace polls while any document is queued/processing, with capped refetch intervals and page-visibility awareness.
- Existing completed documents remain reviewable while other documents process or fail.
- A failed document shows a controlled failure category and retry action; raw AWS messages are never displayed.
- A stale batch revision refreshes data and preserves unsaved local decision edits only when they can be safely rebased; otherwise the UI asks the user to review again.

## Surface 3: Exception-First Review

### Default view

The first selected document opens **Needs review** rather than all fields. Filters:

- Blocking
- Warnings
- Extractor disagreement
- Low confidence
- Unknown codes
- Supplemental statements
- All extracted items
- Verified/rejected

Each filter announces result count and is represented in query state when practical.

### Item row/card

Every extracted item can display:

- K-1 location: box, code, label, or official form item
- proposed normalized value
- raw source text
- destination field when mapped
- provider agreement and confidence label
- source page
- badges such as `Needs review`, `Unknown code`, `From statement`, `High confidence`, `Corrected`
- `View evidence`
- actions: `Verify`, `Correct`, `Reject`, `Map`, `Reopen` according to current state

Provider confidence is never represented by color alone. Exact numeric confidence is available in details, while the primary display uses understandable labels.

### Corrections

- Correction input type follows the item kind: money, text, date, choice, checkbox, percentage, or code/detail.
- Money uses the same exact parsing/format rules as the tracker form.
- A reason is required for correction, rejection, ad hoc mapping, or waiver.
- Saving appends a decision and rebuilds only affected year proposals/findings.
- The UI shows both original extraction and effective corrected value afterward.

### Unknown codes and statements

- Box/code items are never collapsed before review.
- A known mapping shows the rule, rollup destination, aggregation, and source item list.
- An unmapped item offers `Keep as unmapped`, `Map for this import`, and, for authorized maintainers only in a later feature, `Create mapping rule`. This feature does not edit global mapping configuration in the UI.
- Statement references remain visible even when there is no amount.

## Surface 4: Evidence Viewer

### Layout

- Desktop: resizable/two-column review list and PDF canvas.
- Tablet: stacked panes with a sticky `Evidence` toggle.
- Mobile: full-screen evidence drawer with `Back to item`.

### Behavior

- Request a short-lived evidence URL only when the viewer opens or needs renewal.
- Render the requested page with PDF.js.
- If geometry exists, draw a high-contrast, non-obscuring rectangle over the normalized bounding box and scroll it into view.
- If only the page is known, jump to that page and state `Exact source region unavailable`.
- Keyboard focus on an item updates evidence without requiring hover.
- Zoom, next/previous page, page number, and close controls are keyboard accessible and have visible focus.
- Never place the evidence URL in durable application state, logs, analytics, or copied deep links.

## Surface 5: Year Mapping and Apply

### Year proposal card

For each detected year:

- source filename and detected identities
- mapped calculation-field count
- mapped official-field count
- dynamic/unmapped code count
- blocking/warning count
- existing tracker revision/status when present
- conflict list with existing vs proposed value
- action choice

Allowed choices:

| Target state | Choices |
|---|---|
| No existing year | `Create`, `Skip` |
| Existing unsigned/reviewable year | `Merge`, `Replace`, `Skip` |
| Existing signed-off year | `Merge`, `Replace`, `Skip`, with explicit signoff invalidation warning |
| Duplicate detected year in batch | `Skip` until duplicate is resolved |
| Blocking findings | `Skip` only |

### Semantics shown to users

- **Create**: make a new reviewable year with imported values.
- **Merge**: update reviewed imported destinations; keep existing destinations absent from the PDF proposal.
- **Replace**: replace K-1 form destinations represented by the reviewed proposal; keep Jackson-only workpaper inputs unless explicitly mapped.
- **Skip**: retain the source document and review history but make no tracker change.

### Apply confirmation

The confirmation dialog summarizes exact impact:

- years created
- years merged
- years replaced
- years skipped
- signed-off years that will be invalidated
- downstream later years that may need recalculation/review

The primary label includes count, for example `Apply 5 years`. Apply stays disabled while blocking findings, stale proposals, or missing decisions remain.

### Success

- Show `5 K-1 years imported` with links/buttons for each applied tax year.
- Refresh partnership detail, year rail, selected-year data, calculations, and signoff state.
- Default selection is the newest applied tax year unless the user chooses another success link.
- Imported years display status `Needs review`; import is never equivalent to reviewed signoff.

### Failure

- Atomic apply failure changes no target year.
- Stale year or proposal errors identify affected years and refresh conflict data.
- Retry is safe and cannot duplicate active revisions.

## Existing K-1 Form Integration

### Calculation fields

Imported `K1TrackerValue` provenance displays:

- `PDF import`
- source filename (authorized display)
- page
- effective confidence/review status
- evidence action
- aggregated item count when more than one source item contributes

Manual edits use existing behavior and become manual revisions. If a manual edit changes an imported value, the imported source remains historical but is no longer the active value.

### Official-form fields

The form continues to persist one `officialFormData` object. Active companion provenance rows supply field badges/evidence. When a manual full-object save changes an imported official field, its active import-source link is deactivated while unchanged official fields retain theirs.

### Dynamic code/detail fields

- Standard supported code arrays populate the existing repeatable controls.
- A collapsible **Imported code and statement details** panel shows every applied dynamic item, mapping/rollup, source, and review status.
- Unmapped items do not enter calculations and are labeled accordingly.

### Dated cash activity

Annual PDF contributions/distributions do not overwrite cash-activity-derived fields. The form shows an import comparison finding when the K-1 annual value differs from dated activity.

## Accessibility Contract

- Upload and review flows are fully operable with keyboard only.
- Drop zone always has an equivalent labeled file input.
- File and document progress uses `aria-live="polite"`; terminal failures use `role="alert"` without repeatedly announcing polling updates.
- Document rail uses listbox/tab semantics only if keyboard behavior fully matches the selected pattern; otherwise use ordinary buttons and headings.
- Filters expose selected state and result counts.
- Every finding is associated with its source item and correction controls.
- Confidence, risk, and status never rely on color alone.
- Evidence overlay has a textual equivalent naming page and raw source text.
- Focus returns to the invoking item when the evidence drawer closes.
- Confirmation dialogs trap focus and restore it on close.
- At 200% zoom and 390 CSS pixels, there is no page-level horizontal scroll; dense comparison tables become stacked cards.
- Motion/progress animation respects `prefers-reduced-motion`.

## Unsaved and Background Work

- Browser navigation guard applies only to unsaved reviewer decisions or apply choices, not to server-side processing.
- Uploads in progress require confirmation before leaving because browser transfer would stop.
- After uploads are completed and processing has started, users can leave freely; status persists on the server.
- Returning via batch history or URL restores the current server state.

## Test Contract

Component/integration coverage must include:

- selecting and hashing five PDFs
- per-file validation, retry, removal, and duplicate hash handling
- resumable processing states and mixed success/failure
- exception filters and accessible counts
- correction, verification, rejection, mapping, waiver, and reopen decisions
- page-only and bounding-box evidence rendering
- create/merge/replace/skip choice rules
- stale batch, proposal, and tracker-year conflicts
- atomic apply success/failure
- signoff invalidation warning and outcome
- imported field provenance and manual supersession
- dynamic code breakdown and unmapped preservation
- read-only user behavior
- keyboard, focus, live-region, 200% zoom, and 390-pixel layout behavior
