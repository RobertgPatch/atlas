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

### Partnership Directory (Feature 004)
Composes — and MUST only compose — these catalog pieces:
`AppShell` → `PageHeader` (primary: Add Partnership — Admin only) → (`KpiCard` × 4) → `FilterToolbar` → `DataTable` (+ `StatusBadge`, `RowActionMenu`) with `LoadingState` / `EmptyState` / `ErrorState` for all six required UI states. Local additions: `AddPartnershipDialog` (Headless UI) composes existing primitives. Export CSV is a plain anchor link. Hard boundary: no `@mui/*`. Enforced by `scripts/ci/guard-partnerships-imports.mjs`. See [40-screen-map.md](40-screen-map.md) §10.

### Partnership Detail (Feature 004)
Composes — and MUST only compose — these catalog pieces:
`AppShell` → `PageHeader` (+ `StatusBadge`; primary: Edit — Admin only) → (`KpiCard` × 4) → `SectionCard` × 5 (Entity Info, K-1 History, Expected Distributions, FMV Snapshots, Activity). FMV Snapshots section has an Admin-only "Record FMV" header action slot. Local additions: `EditPartnershipDialog` + `RecordFmvDialog` (both Headless UI, Admin-only, compose existing primitives). Hard boundary: same guard as Partnership Directory. See [40-screen-map.md](40-screen-map.md) §11.

### Entity Detail (Feature 004)
Composes — and MUST only compose — these catalog pieces:
`AppShell` → `PageHeader` → (`KpiCard` × 4) → embedded `PartnershipDirectoryTable` (reuses `DataTable` + `StatusBadge` scoped to entity) → `EntityReportsPreviewSection` (placeholder for Feature 006). Hard boundary: same guard. See [40-screen-map.md](40-screen-map.md) §9.

#### New components introduced in Feature 004
| Component | Package | Description |
|---|---|---|
| `PartnershipDirectoryTable` | `apps/web/src/features/partnerships/components/` | DataTable variant for partnership rows |
| `PartnershipFiltersBar` | `apps/web/src/features/partnerships/components/` | Feature-scoped filter toolbar |
| `K1HistorySection` | `apps/web/src/features/partnerships/components/` | SectionCard wrapping finalized K-1 rows |
| `ExpectedDistributionSection` | `apps/web/src/features/partnerships/components/` | SectionCard wrapping expected distribution rows |
| `FmvSnapshotsSection` | `apps/web/src/features/partnerships/components/` | SectionCard wrapping append-only FMV snapshot table |
| `ActivityDetailPreview` | `apps/web/src/features/partnerships/components/` | SectionCard wrapping recent audit events |
| `AddPartnershipDialog` | `apps/web/src/features/partnerships/components/` | Headless UI dialog for Admin partnership creation |
| `EditPartnershipDialog` | `apps/web/src/features/partnerships/components/` | Headless UI dialog for Admin partnership updates |
| `RecordFmvDialog` | `apps/web/src/features/partnerships/components/` | Headless UI dialog for Admin FMV snapshot recording |
| `EntityReportsPreviewSection` | `apps/web/src/features/partnerships/components/` | Placeholder section for Feature 006 reports |
