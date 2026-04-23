# Atlas UI Component Catalog

These are the reusable components Magic Patterns output should align to.

## Layout
### AppShell
Global application layout with sidebar, header, and content area.

### PageHeader
Standard page header with:
- title
- subtitle
- primary action
- optional secondary actions

### SectionCard
Reusable section container with title, optional actions, and body.

## Navigation / Actions
### ActionBar
Top-level action strip for page-specific actions.

### RowActionMenu
Standard overflow menu for per-row actions.

## Data Display
### KpiCard
Single summary metric card with label, value, and optional delta/subtext.

### StatusBadge
Consistent badge system for statuses like:
- Uploaded
- Processing
- Needs Review
- Ready for Approval
- Finalized
- Active
- Inactive

### DataTable
Shared financial table wrapper with:
- sticky header support
- sortable columns
- totals row support
- loading state
- empty state
- error state
- optional inline editing

### FilterToolbar
Shared filter/search/sort strip for data-heavy screens.

### EmptyState
Standard empty state block.

### ErrorState
Standard recoverable error state block.

### LoadingState
Skeleton-based loading treatment.

## Review Workflow
### SplitReviewLayout
Two-pane layout:
- left = structured fields and controls
- right = PDF preview

### ParsedFieldRow
Field display/edit row with:
- label
- parsed value
- corrected value
- confidence indicator
- source reference

## Reports
### EditableCell
Inline editable cell with save feedback and undo affordance.

### TotalsRow
Consistent totals/summary row treatment.

### CurrencyValue
Standard currency formatter display.

### PercentageValue
Standard percentage formatter display.

## Directories / Detail
### SummaryStrip
Horizontal strip of KPI cards used on directory/detail pages.

### DetailSection
Reusable titled section on detail pages.

### TimelineList
Optional activity/history block.

## Admin
### UserTable
Admin user table variant using DataTable conventions.

### RolePill
Small role badge for admin surfaces.

## Charting
### BubbleChartCard
Reusable chart card wrapper for FMV bubble visualization.

### TrendChartCard
Reusable chart card wrapper for line/bar trend visualizations.

## Screen compositions (reference)

### K-1 Processing Dashboard (Feature 002)
Composes — and MUST only compose — these catalog pieces:
`AppShell` → `PageHeader` → (`KpiCard` × 5) → `FilterToolbar` → `DataTable` (+ `StatusBadge`, `RowActionMenu`) with `LoadingState` / `EmptyState` / `ErrorState` for the six required UI states. Local additions (`K1UploadDialog`, duplicate-replace prompt) compose existing primitives — they do not re-implement them. See [40-screen-map.md](40-screen-map.md) §5.

### K-1 Review Workspace (Feature 003)
Composes — and MUST only compose — these catalog pieces:
`AppShell` → `PageHeader` (+ `StatusBadge`) → two-pane body: (left) grouped `SectionCard` × 3 containing `ParsedFieldRow` rows, (right) `PdfPanel` (wraps the future `PdfPreview` catalog primitive; today `<iframe>` with `#page=N`) → sticky action bar → inline issues list. Cross-cutting: `StaleVersionBanner` on optimistic-concurrency conflict, `LoadingState` / `EmptyState` / `ErrorState` per pane. Every mutation auto-injects `If-Match` and surfaces `STALE_K1_VERSION` as a typed client error. Enforced boundary: `pdfjs-dist` is only permitted inside `packages/ui/src/components/PdfPreview/**` (guard: `scripts/ci/guard-k1-imports.mjs`). See [40-screen-map.md](40-screen-map.md) §7.

### PdfPreview (planned, Feature 003)
`packages/ui/src/components/PdfPreview/PdfPreview.tsx` — the single owner of `pdfjs-dist`; props `{ url, page, onPageChange, zoom, onZoomChange, highlight }` where `highlight` is a normalized 0–100 bbox overlay. No consumer may import `pdfjs-dist` directly. Currently scaffolded via `<iframe>` in `apps/web/src/features/review/components/PdfPanel.tsx`; upgrade path is to swap the iframe body with the `PdfPreview` component once T002 is delivered, with no changes to `PdfPanel`'s public props.
