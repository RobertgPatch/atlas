# Feature Specification: K-1 Ingestion and Processing Dashboard

**Feature Branch**: `002-k1-ingestion`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "K-1 processing dashboard page created via Magic Patterns; screen shows KPI row by lifecycle status, filterable document table, upload entry point, and row-click into review workspace. Reference UI Constitution, screen map, component catalog, generation contract."

## Clarifications

### Session 2026-04-21

- Q: How should a K-1 whose parsing failed be represented on the dashboard? → A: Keep the row in `Processing` status; render an inline error indicator (icon + tooltip) on the row. Parse failures are "stuck processing" until retried. No sixth status badge and no new KPI card.
- Q: Who is permitted to upload K-1 documents? → A: Any authenticated user (Admin or User), scoped to the entities they are entitled to view. Both roles see the upload action; the server enforces entity scope on the created records.
- Q: How fresh must the dashboard data be? → A: Manual refresh only for V1 — data is fetched on mount and when the user returns to the screen; no background polling or server push. Background refresh (polling or real-time push) is a planned follow-up once external data-source APIs exist; for now the only data source is the K-1 files the user uploads.
- Q: When should the system consider two uploaded files to be the same K-1? → A: Detect duplicates by `(partnership, entity, tax_year)`. Block the second upload with a prompt that lets the user replace the existing K-1 (supersede, audit-logged) or cancel. Superseded K-1s are hidden from the default listing but retained for audit.
- Q: When filters exclude every document, what should the KPI row show? → A: KPIs follow the scope-level filters (Tax Year, Entity) but IGNORE the finding-level filters (Status, Search). Changing Tax Year or Entity rescopes the entire screen, including the KPI row; changing Status or Search narrows only the table.

## Context & References

This specification is governed by and MUST be read alongside:

- **[System Constitution](../000-constitution.md)** — system-wide invariants
  - §9 Security Requirements: RBAC, encryption, audit logging
  - §12 UI Principles: role-aware feature visibility, clarity over decoration
  - §13 System Integrity Rules: never lose audit history; user-corrected financial values must remain distinguishable from raw parsed values
- **[UI Constitution](../001-ui-constitution.md)**
  - §3 Shared Patterns: `PageHeader`, `FilterToolbar`, `DataTable`, `KpiCard`, `StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`, `RowActionMenu`
  - §4 Screen States: loading / empty / error / populated / permission-restricted / finalized-locked
  - §5 Tables: sticky headers, consistent currency/percentage formatting, dense readable rows, totals row patterns
  - §8 Financial Data Integrity: finalized values render as locked
  - §10 Magic Patterns Normalization Rule: Magic Patterns output is a starting point — must be normalized to the component catalog before merge
- **[Screen Map](../../docs/ui/40-screen-map.md)** — screen #5 K-1 Processing Dashboard, #6 Upload Center, #7 K-1 Review Workspace, #8 Issues Queue
- **[Component Catalog](../../docs/ui/46-component-catalog.md)** — `PageHeader`, `KpiCard`, `StatusBadge`, `FilterToolbar`, `DataTable`, `RowActionMenu`, `EmptyState`, `ErrorState`, `LoadingState`, `SummaryStrip`
- **[Generation Contract](../../docs/ui/45-generation-contract.md)** — presentational-first, typed props, all screen states, role-based visibility
- **[Auth and Access Spec](../001-auth-and-access/spec.md)** — this feature assumes a verified two-factor session and an `AppShell` that has already gated route access by role
- **[Postgres DDL](../../docs/schema/21-postgres-ddl.sql)** — `documents`, `k1_documents`, `k1_field_values`, `issues` tables are the persistence contract

**Reference implementation artifact** (Magic Patterns seed, captured in this feature folder):

- `specs/002-k1-ingestion/reference/k1-dashboard.magic-patterns.tsx` — presentational seed for Screen #5 (tokens, KPI row, filter toolbar, table columns, row-click pattern)

Per UI Constitution §10, the Magic Patterns output is a **starting point only**. It MUST be normalized against the component catalog (reusing `AppShell`, `PageHeader`, `KpiCard`, `StatusBadge`, `FilterToolbar`, `DataTable`, `RowActionMenu`, `EmptyState`, `ErrorState`, `LoadingState`) before this feature is considered complete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monitor K-1 lifecycle at a glance (Priority: P1)

A signed-in user opens the K-1 Processing Dashboard from the sidebar. They immediately see a KPI row summarizing how many K-1 documents are in each lifecycle stage (Uploaded, Processing, Needs Review, Ready for Approval, Finalized) for the active tax year, and a listing of every K-1 document with its partnership, entity, tax year, current status, issue count, and upload date.

**Why this priority**: This is the primary landing page for the K-1 workflow and the only surface that aggregates lifecycle state across all K-1s for a tax year. Without it, users cannot tell what needs attention. All other K-1 work (review, finalize, approve) is reached by drilling in from this screen.

**Independent Test**: Seed a set of K-1 documents spanning every status. Open the dashboard; verify each KPI reflects the correct count and the table lists every document with the correct status badge, issue count, and upload date.

**Acceptance Scenarios**:

1. **Given** the user has at least one K-1 document in each lifecycle status for the current tax year, **When** they navigate to the K-1 Processing Dashboard, **Then** five KPI cards display (Uploaded, Processing, Needs Review, Ready for Approval, Finalized), each showing a count that equals the number of matching documents.
2. **Given** the dashboard is rendered, **When** the user inspects the document list, **Then** every K-1 document visible in the user's scope appears as one row with Document Name, Partnership, Entity, Tax Year, Status badge, Issue count, and Uploaded date.
3. **Given** no K-1 documents exist in the user's scope, **When** the dashboard loads, **Then** an `EmptyState` is rendered with a clear message and a primary action to upload the first document.
4. **Given** the dashboard data fails to load, **When** the user views the listing area, **Then** an `ErrorState` is rendered with a retry affordance and no stale data is shown.
5. **Given** the dashboard is fetching data, **When** the user arrives on the screen, **Then** a `LoadingState` (skeleton rows in the table and skeleton tiles in the KPI row) is rendered until data resolves; a flash of empty state MUST NOT appear.

---

### User Story 2 - Find and drill into a specific K-1 (Priority: P1)

A user needs to act on a specific K-1 (for example, review a flagged partnership). They use the filter toolbar to narrow the list by status, tax year, or entity, and/or type a partnership or document name into search. They click a row to open the K-1 Review Workspace for that document.

**Why this priority**: Without filtering/search and row navigation, the dashboard is a read-only summary and users cannot actually act on K-1s. This unlocks the downstream review → approval → finalize workflow. Ranked P1 with Story 1 because neither is independently useful: the dashboard is a directory, and a directory without navigation is not viable.

**Independent Test**: With a seeded dataset, apply each filter individually and in combination; verify the table updates accordingly and the result count reflects the filtered set. Click a row; verify navigation to the review workspace for that document's id.

**Acceptance Scenarios**:

1. **Given** the dashboard is populated, **When** the user types in the search box, **Then** the table filters to rows whose Document Name or Partnership contains the search text (case-insensitive), the result count updates, and the KPI row remains based on the current scope (Tax Year + Entity); a finding-level filter MUST NOT distort lifecycle totals.
2. **Given** the dashboard is populated, **When** the user selects a status from the Status filter, **Then** only documents in that status are listed and the result count reflects the filtered set.
3. **Given** multiple filters are applied (status, tax year, entity, search), **When** the table renders, **Then** only documents matching ALL active filters appear.
4. **Given** the user has applied filters, **When** they click "Clear all", **Then** all filters and the search box reset and the full list is shown.
5. **Given** filters exclude every document, **When** the table renders, **Then** an `EmptyState` is shown with guidance to adjust filters (not an upload action, since documents exist but are hidden by filter).
6. **Given** a populated row, **When** the user clicks it, **Then** the K-1 Review Workspace for that document opens (navigation or route change), and the row-click target area does NOT include the per-row overflow action button.

---

### User Story 3 - Upload new K-1 documents (Priority: P2)

A user initiates an upload of one or more K-1 PDF documents from the dashboard's primary action. After successful upload, the documents appear in the dashboard listing with status `Uploaded`, then transition through `Processing` as extraction runs, and ultimately to `Needs Review`, `Ready for Approval`, or `Finalized` as the lifecycle advances.

**Why this priority**: Upload is the source of all content on this dashboard. Ranked P2 rather than P1 only because the dashboard is independently valuable (and testable) against seeded documents — an existing back-office upload path could feed it during early iteration — but no end-to-end value ships without this story.

**Independent Test**: With Story 1 in place, invoke the upload primary action with a valid K-1 PDF. Verify a new row appears on the dashboard with status `Uploaded`, KPI counts increment accordingly, and (assuming the parser is wired) the row transitions through `Processing` to `Needs Review` / `Ready for Approval` as extraction completes.

**Acceptance Scenarios**:

1. **Given** the user is on the dashboard, **When** they activate the primary "Upload Documents" action, **Then** they are presented with an upload flow (Screen #6 Upload Center — implementation may be a modal, drawer, or separate route) that accepts one or more PDF files with size and type validation.
2. **Given** a valid K-1 PDF is uploaded, **When** the upload completes, **Then** the dashboard listing reflects a new row with status `Uploaded`, the `Uploaded` KPI increments, and the row's Uploaded date is set to the time of upload.
3. **Given** an uploaded K-1 is submitted for extraction, **When** parsing begins, **Then** the row's status transitions to `Processing` and the `Processing` KPI increments / `Uploaded` decrements accordingly.
4. **Given** parsing completes successfully with extracted fields, **When** the extraction result contains one or more issues (missing required value or low confidence), **Then** the row's status becomes `Needs Review`, the row's Issues count reflects the number of open issues, and the `Needs Review` KPI increments.
5. **Given** parsing completes with no issues, **When** the extraction result contains all required fields at acceptable confidence, **Then** the row's status becomes `Ready for Approval` and the `Ready for Approval` KPI increments.
6. **Given** an uploaded file is not a valid K-1 PDF (wrong mime type, corrupt, oversize), **When** the user submits it, **Then** a user-visible error is raised and no `documents` / `k1_documents` records are persisted.
7. **Given** extraction fails due to a processing error, **When** the system records the failure, **Then** the row remains visible with a clearly communicated error status and the failure is eligible for retry; audit history of the attempt MUST NOT be lost (System Constitution §13).

---

### User Story 4 - Export the current view (Priority: P3)

A user applies filters to the dashboard and exports the visible set to a spreadsheet-friendly format for offline review or sharing with a colleague.

**Why this priority**: Useful but not required for the core lifecycle-management loop. Deferring export does not block upload, review, approval, or finalize. Ranked P3 because early internal users can achieve the same by filtering and screenshotting; export is a productivity improvement rather than a correctness requirement.

**Independent Test**: With Story 2 in place, apply any combination of filters and invoke Export; verify that the exported file contains exactly the filtered rows and the same columns visible in the UI (Document Name, Partnership, Entity, Tax Year, Status, Issues, Uploaded date).

**Acceptance Scenarios**:

1. **Given** the dashboard is populated with filters applied, **When** the user activates the Export secondary action, **Then** a file download begins containing the currently filtered rows in a tabular format (e.g., CSV).
2. **Given** no rows match the current filters, **When** the user activates Export, **Then** the action is disabled (or produces a file with only the header row and an informational message).

---

### Edge Cases

- **Mixed tax years**: a user with access to multiple tax years sees all of them in the unfiltered list; KPI counts are scoped to a default "current tax year" selection (see Assumptions) unless the user clears/changes the tax year filter. KPI cards MUST remain scoped to the Tax Year and Entity filters (scope-level) as those filters change, but MUST NOT respond to Status or Search (finding-level).
- **Row-click vs. row-action button**: clicking the per-row overflow menu MUST NOT also trigger the row's navigation to the review workspace; event propagation is stopped in the action control.
- **Status "Finalized" row**: clicking it MUST still open the review workspace, but that workspace renders the K-1 as locked per UI Constitution §8.
- **Concurrent updates**: a K-1 that transitions from `Processing` to `Needs Review` while the user is viewing the dashboard will NOT update automatically in V1 (no background polling). The user sees the new state after manually refreshing, after their own action triggers an auto-refresh, or on route re-entry. Real-time update is a planned follow-up.
- **Issues count badge**: a `0` issue count is rendered as an em-dash (`—`), not the numeral zero, to reduce visual noise on clean rows.
- **Permission scope**: a user who is not permitted to see K-1s for a given entity MUST NOT see those documents in the list, those issue counts in the KPI row, or be able to navigate to their review workspace by typing the URL.
- **Empty vs. filtered-empty**: the `EmptyState` rendered when no documents exist ("Upload Documents" CTA) is distinct from the empty state rendered when filters exclude all documents (guidance to adjust filters, no upload CTA).
- **Network failure mid-session**: if the data refresh fails after an initial successful load, the UI MUST switch to `ErrorState` rather than silently keeping stale data in an ambiguous state.
- **Pending upload**: while a user-initiated upload is in flight, the primary action MUST indicate progress and MUST NOT allow duplicate submissions of the same file within the same upload session.
- **Parse failure on a row**: the row's status badge remains `Processing` and an inline error indicator (icon + tooltip) is shown on the row; the `Processing` KPI still counts the row. The row does NOT move to `Uploaded`, `Needs Review`, or any other lifecycle status, and no new KPI card is introduced. Retry is reached via the row overflow action menu.
- **Duplicate K-1 upload**: if a user uploads a K-1 whose `(partnership, entity, tax_year)` matches an existing K-1 in their scope, the upload is blocked with a Replace / Cancel prompt. Choosing Replace supersedes the prior K-1 (audit-logged, hidden from the default listing) and the new K-1 appears with status `Uploaded`. Choosing Cancel makes no changes. The dashboard MUST NOT show both versions as active rows.

## Requirements *(mandatory)*

### Functional Requirements

**Dashboard composition (Screen #5)**

- **FR-001**: The K-1 Processing Dashboard MUST render using the shared `AppShell` provided by the Auth and Access feature; it MUST NOT define its own chrome.
- **FR-002**: The dashboard MUST render a `PageHeader` with title "K-1 Processing", a supporting subtitle describing its purpose, a primary action to upload documents, and at least one secondary action for export.
- **FR-003**: KPI card counts MUST reflect the current **scope** filters (Tax Year, Entity) but MUST NOT be affected by the **finding** filters (Status, Search). Changing Tax Year or Entity rescopes the entire screen — both the KPI row and the table — whereas changing Status or Search narrows only the table. This preserves the KPI row as a lifecycle snapshot of the user's current scope while letting them drill into specific statuses without distorting totals
- **FR-004**: Each KPI card MUST display a count scoped to the active tax year selection and MUST NOT be affected by the search or status filter (KPIs represent the lifecycle snapshot, not the filtered view).
- **FR-005**: The dashboard MUST render a `FilterToolbar` containing a search input (matching Document Name or Partnership, case-insensitive), a Status filter, a Tax Year filter, an Entity filter, a result count, and a "Clear all" control that becomes active when at least one filter is applied.
- **FR-006**: The dashboard MUST render a `DataTable` with sortable columns: Document Name, Partnership, Entity, Tax Year, Status, Issues, Uploaded date, and a per-row overflow action cell. Status MUST render via `StatusBadge`. Per-row overflow actions MUST use the shared `RowActionMenu` pattern.
- **FR-007**: The `DataTable` MUST render each K-1 document's status as a `StatusBadge` keyed to one of the five lifecycle statuses defined in FR-003; colors and copy MUST use the shared token set — no per-screen badge styling.
- **FR-008**: Clicking a row (outside the overflow action cell) MUST navigate to the K-1 Review Workspace for that document. Clicking the overflow action cell MUST NOT trigger row navigation.

**Screen states (UI Constitution §4)**

- **FR-009**: The dashboard MUST support `loading` state — the KPI row and table render as skeletons until data resolves; a premature `empty` state MUST NOT flash during initial load.
- **FR-010**: The dashboard MUST support `empty` state — when no K-1 documents exist for the user's scope, the table area renders `EmptyState` with an upload CTA.
- **FR-011**: The dashboard MUST support a `filtered-empty` state — when documents exist but none match the active filters, the table area renders `EmptyState` with guidance to adjust filters and no upload CTA.
- **FR-012**: The dashboard MUST support `error` state — when data fetch fails, the table area renders `ErrorState` with a retry affordance; stale data MUST NOT remain visible.
- **FR-013**: The dashboard MUST support `populated` state — the happy path described by FR-001 through FR-008.
- **FR-014**: The dashboard MUST support `permission-restricted` state — a user with no entitlement to any K-1 data sees `EmptyState` or a dedicated permission-restricted variant; data MUST NOT be fetched for scopes the user cannot view.

**Data and lifecycle**

- **FR-015**: The dashboard MUST read its listing from the K-1 documents directory API; each row corresponds to one `k1_documents` record joined with its parent `documents` record and related partnership / entity metadata.
- **FR-016**: The lifecycle status for each row MUST be derived from a single authoritative status field per K-1 document; the UI MUST NOT infer status from combinations of unrelated fields.
- **FR-017**: The five supported statuses (`Uploaded`, `Processing`, `Needs Review`, `Ready for Approval`, `Finalized`) MUST be the only status badges surfaced by the dashboard. A K-1 whose most recent parse attempt failed MUST remain in `Processing` (its authoritative status is unchanged) and MUST render an inline error indicator (icon + tooltip describing the failure) on the row. Any unsupported backend status value MUST be treated as an error for that row and the row MUST render in error state rather than with a misleading badge.
- **FR-018**: The Issues count for a row MUST equal the number of open (unresolved) `issues` records associated with that `k1_documents` record. Resolved issues MUST NOT be counted.
- **FR-019**: A row MUST transition from `Uploaded` → `Processing` when parsing starts, from `Processing` → `Needs Review` when parsing completes and at least one open issue remains, from `Processing` → `Ready for Approval` when parsing completes and no open issues remain, and from `Ready for Approval` → `Finalized` on approval. Transitions are authoritative on the backend; the dashboard only reflects them.
- **FR-020**: A `Finalized` row's review surface MUST render as locked (UI Constitution §8); this dashboard itself does not mutate finalized data and MUST NOT expose destructive actions against finalized rows.

**Upload**

- **FR-021**: The primary "Upload Documents" action MUST launch an upload flow (Screen #6 Upload Center) that accepts one or more PDF files and validates type, size, and (where feasible) content signature before creating `documents` / `k1_documents` records.
- **FR-022**: On successful upload, the new row MUST appear on the dashboard with status `Uploaded`, and the `Uploaded` KPI MUST reflect the new total on the next render.
- **FR-023a**: On upload, the system MUST detect when a K-1 already exists in the user's scope with the same `(partnership, entity, tax_year)` tuple as the incoming file. When a duplicate is detected, the system MUST block the upload and present the user with two choices: (a) **Replace existing** — the new K-1 becomes the active version, the prior K-1 is marked superseded, and both actions are audit-logged; or (b) **Cancel** — no new records are created. The system MUST NOT silently create a second active K-1 for the same tuple.
- **FR-023b**: A superseded K-1 MUST be retained for audit (not deleted) and MUST be excluded from the default dashboard listing and KPI counts. Superseded K-1s MUST remain reachable via audit/history surfaces (out of scope for this screen; defined by later specs).
- **FR-023**: On upload validation failure (wrong type, oversize, corrupt, or unreadable), no `documents` or `k1_documents` records MUST be created and the user MUST see a clear inline error.
- **FR-024**: Upload completion MUST trigger the parsing step for the newly created K-1; the UI MUST reflect the `Processing` status once parsing has begun.
- **FR-025**: If parsing fails, the failure MUST be recorded, the row's authoritative status MUST remain `Processing`, and the row MUST display an inline error indicator (icon + tooltip) conveying that parsing is stalled and retry is required. The `Processing` KPI count MUST continue to include such rows. Retry eligibility MUST be preserved, and the audit history of the failed attempt MUST NOT be lost (System Constitution §13).

**Filtering, sorting, and search**

- **FR-026**: Search MUST match the Document Name and Partnership columns, case-insensitive, with substring semantics; it MUST NOT match across hidden fields.
- **FR-027**: The Status, Tax Year, and Entity filters MUST operate as AND-combined with search; the result count MUST reflect the intersection.
- **FR-028**: Column sorting MUST be stable and MUST be applied to the filtered result set, not the original unfiltered set.
- **FR-029a**: The dashboard MUST fetch its listing and KPI counts on mount and when the user returns to the screen (route re-entry). Background polling and server-push refresh are OUT of scope for V1. A user-visible refresh affordance (e.g., a refresh action in the PageHeader or FilterToolbar) MUST be provided so users can pull the latest state on demand without a full page reload. After a user-initiated action that changes lifecycle state (upload, approve, re-parse), the dashboard MUST refresh automatically so the action's effect is visible without manual refresh.
- **FR-029**: The default sort MUST be Uploaded date descending (newest first) so that recently added K-1s surface at the top.

**Export**

- **FR-030**: Export MUST produce a file that reflects the currently filtered rows and the columns visible in the UI; it MUST NOT include rows excluded by filters or by the user's permission scope.

**Authorization and role visibility**

- **FR-031**: The K-1 Processing Dashboard MUST be reachable only from an authenticated two-factor session per the Auth and Access feature; unauthenticated access MUST redirect to Login.
- **FR-032**: The dashboard MUST scope all data reads to entities the signed-in user is entitled to see; the backend MUST enforce this scope regardless of client-side filtering.
- **FR-033a**: Any authenticated user (role `Admin` or `User`) MUST be able to initiate a K-1 upload via the primary "Upload Documents" action, provided the target entity is within their entitlement scope. The server MUST reject uploads targeting entities outside the caller's scope regardless of role. Uploads MUST NOT be restricted to `Admin` in V1.
- **FR-033**: Per-row actions (including opening the review workspace, initiating approval, or triggering re-parse) MUST be gated by role and entitlement on both the client (visibility/enabled state) and the server (authorization check).
, `k1.superseded`
**Auditability (Constitution §13)**

- **FR-034**: The system MUST record an audit event for every lifecycle-changing action initiated from or reflected on this dashboard, at minimum: `k1.uploaded`, `k1.parse_started`, `k1.parse_completed`, `k1.parse_failed`, `k1.issue_opened`, `k1.issue_resolved`, `k1.approved`, `k1.finalized`.
- **FR-035**: Each audit event MUST record the acting user (or system actor for automated steps), the target `k1_documents` id, the action type, relevant before/after values (e.g., status transition), and a UTC timestamp.
- **FR-036**: If audit persistence fails during a user-initiated action, the action MUST NOT complete and the user MUST see an error.

**UI contract alignment (UI Constitution §3, §4, §5, §8, §10)**

- **FR-037**: The dashboard implementation MUST normalize the Magic Patterns seed to the Atlas component catalog before merge — reusing `AppShell`, `PageHeader`, `KpiCard`, `StatusBadge`, `FilterToolbar`, `DataTable`, `RowActionMenu`, `EmptyState`, `ErrorState`, `LoadingState`. Bespoke local re-implementations of any of these components are prohibited.
- **FR-038**: Financial and tabular formatting MUST follow UI Constitution §5 — currency and percentage formatting, tabular numerics on count/date columns, sticky headers, and dense but readable rows.
- **FR-039**: Every icon MUST come from `lucide-react`; every animation MUST use `framer-motion`; no secondary UI framework (including Material UI) is permitted on this screen.

### Key Entities

- **Document**: the stored uploaded file (PDF) and its blob metadata. One document can be classified as a K-1 document. Attributes include source filename, storage reference, uploader, upload timestamp, mime type, size, classification.
- **K-1 Document**: a typed record extending `Document` with tax-specific attributes — partnership reference, entity reference, tax year, lifecycle status, and link to its extracted field values. One row on the dashboard = one K-1 Document.
- **K-1 Field Value**: a single extracted data point from the K-1 (e.g., Box 1 ordinary income). Each field carries a parsed value, an optional user-corrected value, a confidence signal, and a source reference (page + location) per UI Constitution §8.
- **Issue**: a flagged problem on a K-1 Document (missing required field, low-confidence extraction, cross-field inconsistency). Each issue has an open/resolved state. Open issues drive the `Needs Review` status and the dashboard's Issues count.
- **Partnership**: the issuing partnership named on the K-1; rendered in the table column and used as a filter dimension.
- **Entity**: the client entity receiving the K-1 (e.g., a trust or LLC); used as a filter dimension and as a permission-scoping axis.
- **Tax Year**: the tax year of the K-1; used as a filter dimension and as the scope for the KPI counts.
- **Audit Event**: an immutable record of a lifecycle-changing action against a K-1 Document (see FR-034 / FR-035).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a seeded dataset with K-1 documents in every lifecycle status, every KPI card count exactly matches the number of K-1 documents in that status for the selected tax year (verified by automated check across a 1000-document fixture).
- **SC-002**: The initial populated render of the dashboard (to interactive, with KPIs and at least the first page of rows visible) completes in under 2 seconds on a 1000-document dataset under normal conditions.
- **SC-003**: 100% of rows whose backend status is one of the five supported lifecycle values render with the correct `StatusBadge`; 0 rows render with a mismatched badge across a status-coverage test.
- **SC-004**: With any combination of filters applied, the filtered row set exactly matches the set produced by applying the same logical AND of filter predicates to the source data (verified by property-based test).
- **SC-005**: Clicking a populated row navigates to the correct K-1 Review Workspace for that document in 100% of cases; clicking the per-row overflow action never triggers row navigation (verified by interaction test).
- **SC-006**: Every dashboard state (loading, empty, filtered-empty, error, populated, permission-restricted) renders the catalog component expected by UI Constitution §4 (verified by snapshot + a11y scan on each state).
- **SC-007**: 100% of lifecycle-changing actions (upload, parse start, parse completion, parse failure, approval, finalize) produce a corresponding audit event referencing the target K-1 Document (verified by sampling ≥100 actions).
- **SC-008**: 0 instances of a user viewing a K-1 Document outside their entitlement scope across an authorization test that attempts both UI navigation and direct URL access for every K-1 / entity combination in a seeded fixture.
- **SC-009**: 0 usages of Material UI, a secondary UI framework, or a bespoke local re-implementation of `PageHeader` / `KpiCard` / `StatusBadge` / `FilterToolbar` / `DataTable` / `RowActionMenu` / `EmptyState` / `ErrorState` / `LoadingState` on this screen (verified by source inspection).
- **SC-010**: From a clean upload to visible `Uploaded` status on the dashboard, the round-trip completes in under 5 seconds for a single K-1 PDF under normal conditions.

## Assumptions

- A "current tax year" concept exists and defaults the Tax Year filter when the dashboard first renders; the user can override via the filter. The system of record for "current tax year" is a deployment-level setting (not user preference) for V1.
- Per-user entitlement to view K-1s is derived from entity access, which is managed by admin in a later feature; for V1 of this dashboard, entity scope can be seeded or inherited from the user's membership records. This dashboard does not provide an entitlement management UI.
- Document upload and parsing are handled by an existing or to-be-implemented backend pipeline; this spec defines the dashboard's read/trigger contract against that pipeline but does not specify the extraction technology.
- Issue detection rules (what qualifies as an open issue — missing required field, low confidence threshold, cross-field inconsistency) are defined by the parsing/validation component, not by this dashboard. The dashboard consumes the resultin
- Data freshness in V1 is manual-refresh only. The only data source is K-1 documents uploaded by the user; there are no external APIs or data feeds to subscribe to yet. Background polling and real-time server push are deferred to a later iteration once external data-source APIs exist.g `issues` records and counts unresolved ones.
- The dashboard's listing is expected to scale to ~1–5K K-1 documents per tenant per tax year in V1. Server-side pagination and virtualized rendering are acceptable implementation choices; the user-facing behavior is a single scrollable table.
- Export format defaults to CSV (UTF-8, comma-separated) for V1. XLSX or other formats are deferred.
- Navigation target for row clicks is the K-1 Review Workspace (Screen #7), which is owned by a separate spec; this dashboard depends on that route existing. If the review workspace is not yet implemented, row-click MAY open a placeholder route, but the navigation contract MUST NOT change.
- Row action menu contents (re-parse, download original PDF, remove, etc.) are out of scope for this spec and will be specified alongside the review/admin workflows; the `RowActionMenu` component is reserved.
- The UI stack is Tailwind CSS + headless primitives + `framer-motion` + `lucide-react`, matching the Magic Patterns seed and the amendment to UI Constitution §1 committed under the Auth and Access feature (specs/001-auth-and-access).
- Audit log storage is the same persistence mechanism used by the Auth and Access feature; this feature depends on its availability and fails closed (FR-036) if it is not writable.
