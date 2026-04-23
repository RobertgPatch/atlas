# Screen Map

Shared:
1. Login
2. MFA Verification
3. App Shell
4. Main Dashboard
5. K-1 Processing Dashboard
6. Upload Center
7. K-1 Review Workspace
8. Issues Queue
9. Entity Detail
10. Partnership Directory
11. Partnership Detail
12. Portfolio Summary Report
13. Asset Class Summary Report
14. Activity Detail Report

Admin:
15. User Management
16. User Detail / Role Assignment

## Composition notes

### 5. K-1 Processing Dashboard (Feature 002)
Composed entirely from the shared Atlas catalog — no bespoke primitives:

- `AppShell` + `PageHeader` (primary: Upload Documents · secondary: Export, Refresh)
- `KpiCard` × 5 (Uploaded · Processing · Needs Review · Ready for Approval · Finalized) — scope-only; invariant to table filters (FR-004)
- `FilterToolbar` (Tax Year · Entity · Status · Search; active-filter chips + Clear all)
- `DataTable` + `StatusBadge` + `RowActionMenu`
- `LoadingState` / `EmptyState` / `ErrorState` (all six required UI-Constitution §3 states)
- `K1UploadDialog` + duplicate-Replace prompt (local composition over shared primitives)

Hard rules: no Material UI, no `framer-motion` animations outside the catalog, every icon from `lucide-react` (FR-039). Enforced by `scripts/ci/guard-k1-imports.mjs`.

### 7. K-1 Review Workspace (Feature 003)
Two-pane review surface composed from the shared catalog; invoked from the Processing Dashboard row-click for K-1s in `NEEDS_REVIEW` / `READY_FOR_APPROVAL` / `FINALIZED`:

- `AppShell` + `PageHeader` (title: partnership name · subtitle: entity · tax year · uploaded date · status)
- Left pane: grouped `SectionCard`s (Entity Mapping · Partnership Mapping · Core Fields) containing `ParsedFieldRow` — label + value + Required marker + Modified marker + confidence band chip + source-locator button
- Right pane: `PdfPanel` (browser-native `<iframe>` with `#page=N` fragment; bbox highlighting deferred pending `packages/ui/src/components/PdfPreview` wrapper for `pdfjs-dist`)
- `StaleVersionBanner` (rendered on `409 STALE_K1_VERSION` from any mutation)
- Action bar (sticky bottom): Save / Cancel / Approve / Finalize / Send to Issue Queue — visibility + enabled-state gated by server-computed `canEdit` / `canApprove` / `canFinalize` flags; Finalize disabled for the approver (two-person rule)
- Issues list (inline, below sections): shows open + recently-resolved `K1Issue` rows with optional Resolve button for Admins
- `LoadingState` / `EmptyState` / `ErrorState` per UI-Constitution §3; PDF panel renders its own isolated `ErrorState` on load failure (FR-024)

Hard rules: no Material UI; no `pdfjs-dist` outside `packages/ui/src/components/PdfPreview/**` (enforced by `scripts/ci/guard-k1-imports.mjs`); every write auto-injects `If-Match` from the current session version; reviewer corrections never touch `raw_value` or `original_value` (SC-003).

### 10. Partnership Directory (Feature 004)
Listed at screen #10 in the navigation map; shows the full partnership list filtered/searched/sorted and supports Admin creation.

- `AppShell` + `PageHeader` (primary: "Add Partnership" — Admin only)
- `KpiCard` × 4 (Total Partnerships · Active · Pending · Closed+Liquidated)
- `FilterToolbar` (Status · Asset Class · Search; active-filter chips + Clear all)
- `DataTable` + `StatusBadge` + `RowActionMenu` (View Detail — all users; rows link to Partnership Detail)
- `LoadingState` / `EmptyState` / `ErrorState` (all six UI-Constitution §3 states)
- `AddPartnershipDialog` (Headless UI Dialog over shared primitives — Admin only)
- Export CSV link (scoped to current filters)

Hard rules: no `@mui/*` anywhere in this screen or in `features/partnerships/**`. Enforced by `scripts/ci/guard-partnerships-imports.mjs`.

### 11. Partnership Detail (Feature 004)
Detail view for a single partnership; Admin can edit metadata and record FMV snapshots.

- `AppShell` + `PageHeader` (title: partnership name · subtitle: entity name + status badge · primary: "Edit" — Admin only)
- `KpiCard` × 4 (Latest FMV · Total Distributions · Expected Next Distribution · Partnership Age)
- `SectionCard`: Entity Info — entity name (clickable link to `/entities/:id`), asset class, notes
- `SectionCard`: K-1 History — `DataTable` of finalized K-1 rows ordered by tax year desc
- `SectionCard`: Expected Distributions — scheduled distribution rows
- `SectionCard`: FMV Snapshots — ordered newest first, append-only, header action "Record FMV" (Admin only)
- `SectionCard`: Activity — audit event preview
- `EditPartnershipDialog` (Headless UI Dialog — Admin only)
- `RecordFmvDialog` (Headless UI Dialog — Admin only, opened from FMV Snapshots header action)
- `LoadingState` / `EmptyState` / `ErrorState` per UI-Constitution §3

Hard rules: same MUI guard as #10.

### 9. Entity Detail (Feature 004)
Detail view for a legal entity; shows associated partnerships and reports preview.

- `AppShell` + `PageHeader` (title: entity name · subtitle: entity type)
- `KpiCard` × 4 (Partnerships Count · Total Distributions · Total FMV · Latest K-1 Year)
- Embedded `PartnershipDirectoryTable` (scoped to entity's partnerships; rows link to Partnership Detail)
- `EntityReportsPreviewSection` — placeholder "Reports coming with Feature 006"
- `LoadingState` / `EmptyState` / `ErrorState` per UI-Constitution §3

Hard rules: same MUI guard as #10.
