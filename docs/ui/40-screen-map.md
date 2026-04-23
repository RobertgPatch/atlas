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
