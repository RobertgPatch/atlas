# Feature Specification: Partnership Management

**Feature Branch**: `004-partnership-management`  
**Created**: 2026-04-23  
**Status**: Draft  
**Input**: User description: "I am implementing spec 004 for partnership management and here is the component template to reference" (Partnership Directory reference implementation: PageHeader, SummaryStrip, FilterToolbar, DataTable, StatusBadge, mock Partnership model with id, name, entity, assetClass, latestK1Year, distribution, fmv, status)

## Context & Dependencies

- **Auth and Access (Spec 001)** — every screen MUST be reachable only from an authenticated two-factor session; unauthenticated access MUST redirect to Login. Role gating uses the existing Admin / User split.
- **K-1 Ingestion (Spec 002)** — the K-1 Processing Dashboard already references partnerships and entities; this feature reuses the same `partnerships` and `entities` tables and surfaces K-1 history on the Partnership Detail page.
- **Review and Finalization (Spec 003)** — finalized K-1s produce the `reported distribution` and `latest K-1 year` values shown on the Partnership Directory and Partnership Detail.
- **[Screen Map](../../docs/ui/40-screen-map.md)** — screen #9 Entity Detail, #10 Partnership Directory, #11 Partnership Detail.
- **[Magic Patterns Core Prompts](../../docs/ui/42-magic-patterns-prompts-core.md)** — canonical visual/interaction blueprints for Partnership Directory, Partnership Detail, and Entity Detail.
- **[UI Constitution](../../specs/001-ui-constitution.md)** — all six UI states (loading, empty, error, partial, populated, permission-limited) MUST be rendered per screen.

## Clarifications

### Session 2026-04-23

- Q: How is entity scope defined for non-Admin Users on Partnership/Entity screens? → A: Users see only partnerships whose `entity_id` is in the entities they are explicitly granted access to via Auth & Access; Admins see all.
- Q: What time window do the Directory's Distribution and FMV values represent? → A: Per-partnership latest finalized — Distribution = latest finalized K-1's Reported Distribution; FMV = latest FMV snapshot; KPIs sum those per-partnership values across filtered rows.
- Q: Can Admins edit or delete FMV snapshots, and are multiple snapshots per `as_of_date` allowed? → A: Append-only — multiple snapshots per date allowed; no edit or delete from UI or API; "Latest FMV" = most recent snapshot by `created_at`; corrections are made by recording a newer snapshot that supersedes the previous value.
- Q: What is the partnership write lifecycle beyond create? → A: Admins can edit `name`, `asset_class`, `notes`, and `status` (free transitions across `Active | Pending | Liquidated | Closed`). No hard delete, no separate archive. Every update emits `partnership.updated`.
- Q: What is the Directory's default Status filter on first load? → A: Show all statuses (Active + Pending + Liquidated + Closed); no status pre-filter. Operator narrows manually; KPIs reflect the (unfiltered by status) default view.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and filter the Partnership Directory (Priority: P1)

A CPA, reviewer, or operator signs into Atlas and opens "Partnerships" from the sidebar. They immediately see a KPI summary strip (Total Partnerships, Total Distributions, Total FMV) and a filterable, sortable table of every partnership in their entity scope — each row showing Partnership Name, Entity, Asset Class, Latest K-1 Year, Distribution, FMV, and Status. They can search, narrow by entity / asset class / status, and export the currently filtered list as CSV.

**Why this priority**: This is the primary operational landing surface of the feature. Without it, users cannot see the portfolio of partnerships, cannot cross-reference K-1 ingestion results to their underlying partnerships, and cannot reach any detail screen. It is also the MVP slice that delivers value even without detail pages or write actions.

**Independent Test**: With at least one Admin seed of entities + partnerships + one finalized K-1 (via Spec 003), signing in and navigating to `/partnerships` shows all three KPIs, renders a populated table, supports search + entity/asset-class/status filters, sorts by each header, and exports the filtered set as CSV.

**Acceptance Scenarios**:

1. **Given** the signed-in user has at least one partnership visible in their entity scope, **When** they navigate to the Partnership Directory, **Then** the KPI strip shows counts/amounts that match the filtered table, the table renders all columns, and clicking a row opens Partnership Detail.
2. **Given** the user types into the search input, **When** a 200 ms debounce elapses, **Then** the table filters to rows whose Partnership Name or Entity contains the query (case-insensitive) and the KPI strip updates to reflect the filtered set.
3. **Given** the user applies the Entity, Asset Class, or Status filter, **When** the filter changes, **Then** only matching rows remain and an active-filter indicator is shown; a "Clear filters" affordance returns the table to the default view.
4. **Given** no partnership matches the current filters, **When** the table evaluates results, **Then** the Empty state renders with guidance (adjust filters / add a partnership) instead of a blank table.
5. **Given** the Partnership list API fails, **When** the Directory loads, **Then** the Error state renders with a retry affordance; KPIs show skeleton placeholders and never display stale or zeroed values silently.
6. **Given** the user clicks "Export", **When** the export completes, **Then** a CSV is downloaded containing every currently filtered row with consistent currency formatting (USD, no decimals) and the Status column preserved.

---

### User Story 2 - Open a partnership and review its history (Priority: P2)

From the Directory, an operator clicks a partnership row and lands on Partnership Detail. They see a page header (partnership name + status badge + entity), a KPI summary strip (Latest FMV, Latest Reported Distribution, Latest K-1 Year, Asset Class), and detail sections: K-1 history, Expected Distribution history, FMV Snapshots, Notes, and an Activity Detail preview. They can navigate back to the Directory or open the associated Entity.

**Why this priority**: Detail access is required for any follow-through on a partnership — verifying distributions, tracking FMV over time, and inspecting the K-1 trail. Depends on Directory (P1) for entry.

**Independent Test**: Open a partnership that has at least one finalized K-1 and at least one FMV snapshot; the detail page MUST render all five sections, the KPI strip MUST reflect the most recent finalized K-1, and clicking the entity breadcrumb MUST navigate to Entity Detail.

**Acceptance Scenarios**:

1. **Given** a partnership with ≥1 finalized K-1, **When** Partnership Detail loads, **Then** "Latest Reported Distribution" and "Latest K-1 Year" mirror the most recent finalized `k1_documents` row for this partnership.
2. **Given** a partnership with no FMV snapshots yet, **When** the FMV section renders, **Then** "Latest FMV" shows an unambiguous empty indicator (e.g., "—") instead of "$0", and the FMV Snapshots section renders its Empty state.
3. **Given** a partnership with ≥2 FMV snapshots, **When** the FMV Snapshots section renders, **Then** snapshots are listed most-recent-first with as-of date, amount, source, and note.
4. **Given** a partnership whose latest K-1 is not yet finalized, **When** Partnership Detail loads, **Then** "Latest K-1 Year" shows the latest finalized year (or "—" if none) and the K-1 history row for the in-progress K-1 shows its current lifecycle status via `StatusBadge`.

---

### User Story 3 - Open an entity and see partnerships underneath it (Priority: P3)

From Partnership Detail (or a future Entities index), a user navigates to Entity Detail for the owning client entity. They see the entity name, entity type, and status; a summary strip with aggregated metrics; a table of every partnership under this entity with Latest K-1 Year and Latest FMV; and a Reports preview.

**Why this priority**: Entity Detail provides the "client" view that higher-level stakeholders (family office, CFO) rely on to see what a single legal owner holds. It is valuable but is the lowest-priority read surface in this feature because operators primarily work from the Partnership view.

**Independent Test**: Given a seeded entity with ≥2 partnerships, opening Entity Detail MUST list both partnerships with their latest K-1 Year and latest FMV and MUST NOT list partnerships belonging to other entities.

**Acceptance Scenarios**:

1. **Given** an entity that owns ≥2 partnerships, **When** Entity Detail loads, **Then** the partnerships table lists all of them with Partnership Name, Asset Class, Latest K-1 Year, Latest FMV, and Status.
2. **Given** an entity with zero partnerships, **When** Entity Detail loads, **Then** the partnerships table renders its Empty state with a prompt to add a partnership (Admin only) or contact an admin (User).
3. **Given** a user whose scope does not include this entity, **When** they request Entity Detail by id, **Then** the server returns 403 and the UI shows Permission Denied.

---

### User Story 4 - Admin adds a new partnership (Priority: P4)

From the Partnership Directory, an Admin activates "Add Partnership", enters Partnership Name, selects an Entity from their scope, selects an Asset Class, optionally adds Notes, and submits. The new partnership appears in the Directory and is immediately available as a mapping target in K-1 Review (Spec 003).

**Why this priority**: Onboarding a new partnership is required whenever the operator receives a K-1 for a partnership that has not been seeded. It is a write path and therefore gated behind Admin role.

**Independent Test**: As Admin, submitting Add Partnership with a valid entity + unique name creates a row in `partnerships` and an audit event, and the Directory refresh shows the new row.

**Acceptance Scenarios**:

1. **Given** an Admin with at least one entity in scope, **When** they submit Add Partnership with valid name, entity, asset class, and status, **Then** a new `partnerships` row is created, a `partnership.created` audit event is written, and the Directory shows the new row on its next fetch.
2. **Given** an Admin enters a Partnership Name that already exists under the same Entity, **When** they submit, **Then** the server returns a 409 Conflict with a clear validation message and no row is created.
3. **Given** a non-Admin User, **When** they open the Directory, **Then** the "Add Partnership" action is not rendered; attempts to POST to the create endpoint return 403.

---

### User Story 5 - Admin records an FMV snapshot (Priority: P5)

On Partnership Detail, an Admin records a new FMV snapshot by entering as-of date, amount (USD), source (manager statement, 409A, K-1, manual), and an optional note. The snapshot appears as the most recent row in the FMV Snapshots section, and the "Latest FMV" KPI updates to match.

**Why this priority**: FMV snapshots enable trend reporting and client summaries. Write path, Admin-only.

**Independent Test**: As Admin on a partnership with an existing FMV snapshot, adding a new snapshot with a newer as-of date moves it to the top of the list and updates "Latest FMV" accordingly.

**Acceptance Scenarios**:

1. **Given** an Admin on Partnership Detail, **When** they submit a new FMV snapshot with a valid as-of date and positive amount, **Then** the snapshot is persisted, a `partnership.fmv_recorded` audit event is written, and "Latest FMV" refreshes to the newest value.
2. **Given** an Admin enters a negative or zero amount, **When** they submit, **Then** the form rejects the input with an inline validation message (except `0` on a Liquidated partnership, which is allowed).
3. **Given** a non-Admin user, **When** they view Partnership Detail, **Then** the "Record FMV" action is not rendered; attempts to POST to the FMV endpoint return 403.

---

### Edge Cases

- **No K-1 yet** — a partnership with `latestK1Year = null` MUST still render; Latest K-1, Distribution columns show "—".
- **No FMV yet** — Directory FMV shows "—" (not "$0"); KPI "Total FMV" sums only partnerships with ≥1 FMV snapshot.
- **Liquidated partnership** — default filter set includes Liquidated so an operator can still reach the detail; Status filter allows hiding them.
- **Stale K-1 reference** — if a K-1 is re-finalized after an amendment, "Latest K-1 Year" MUST reflect the amended K-1 once finalized.
- **Scope enforcement** — users MUST only see partnerships whose `entity_id` is in their entity scope; server returns 403 on any out-of-scope id.
- **Rapid search** — typing into search during a prior request MUST NOT show mismatched stale results (the latest query always wins).
- **Currency formatting** — every currency cell, KPI, and export cell uses USD with no decimals and a leading `$`.
- **Mobile viewport** — Directory MUST remain usable at 375 px width with horizontal scroll on the table.

## Requirements *(mandatory)*

### Functional Requirements — Partnership Directory (Screen #10)

- **FR-001**: The Directory MUST render inside the shared `AppShell`; it MUST NOT define its own chrome.
- **FR-002**: The Directory MUST include a `PageHeader` with title "Partnerships", a primary "Add Partnership" action (Admin only), and a secondary "Export" action that downloads the currently filtered set as CSV.
- **FR-003**: The Directory MUST render a KPI summary strip with exactly three cards: Total Partnerships (count of filtered rows), Total Distributions (sum across filtered rows of each partnership's latest finalized K-1 Reported Distribution; partnerships with no finalized K-1 contribute `0`), Total FMV (sum across filtered rows of each partnership's latest FMV snapshot amount; partnerships with no FMV snapshot contribute `0`).
- **FR-004**: KPIs MUST update in lockstep with the filtered table (unlike the K-1 Processing Dashboard, where KPIs are scope-only); every change to Search / Entity / Asset Class / Status MUST recompute KPI values from the same per-partnership latest-finalized-K-1 and latest-FMV-snapshot values shown in the table rows.
- **FR-005**: The Directory MUST render a `FilterToolbar` with: a search input (matches Partnership Name or Entity, case-insensitive, debounced), an Entity dropdown, an Asset Class dropdown, and a Status dropdown. The default view MUST show all statuses (`Active`, `Pending`, `Liquidated`, `Closed`); no status is pre-filtered on first load. KPIs on first load MUST reflect this unfiltered-by-status view.
- **FR-006**: The Directory table MUST include the columns: Partnership Name, Entity, Asset Class, Latest K-1 Year (right-aligned), Distribution (right-aligned USD), FMV (right-aligned USD), Status (center-aligned badge).
- **FR-007**: Each column MUST be sortable; the default sort MUST be Partnership Name ascending.
- **FR-008**: The table MUST have a sticky header and MUST support horizontal scroll at narrow viewports without clipping.
- **FR-009**: A row click MUST navigate to `/partnerships/:partnershipId` (Partnership Detail).
- **FR-010**: The Directory MUST render all six UI-Constitution states: Loading (skeletons), Empty (no matches), Error (with retry), Partial (warning banner if the K-1 distribution rollup failed), Populated, Permission-limited (Add hidden for non-Admin).
- **FR-011**: Currency values MUST be formatted as USD with no decimals and a leading `$`; null values MUST render as "—".

### Functional Requirements — Partnership Detail (Screen #11)

- **FR-020**: The page MUST render a `PageHeader` with the partnership name as title, a `StatusBadge` for current status, an "Entity: <name>" breadcrumb that links to Entity Detail, and Admin-only "Edit Partnership" and "Record FMV" primary actions. Edit MUST allow changing `name`, `asset_class`, `notes`, and `status`; status MAY transition freely across the enum. Saving an edit MUST emit `partnership.updated` and refresh the page header and KPIs on next fetch.
- **FR-021**: The page MUST render a KPI strip with four cards: Latest FMV, Latest Reported Distribution, Latest K-1 Year, Cumulative Reported Distributions (sum of all reported distributions across K-1 history for this partnership). Wire values are uppercase (`ACTIVE`, `PENDING`, etc.); UI displays title-case per research Decision 4.
- **FR-022**: The page MUST render five Detail Sections, in order: K-1 History, Expected Distribution History, FMV Snapshots, Notes, Activity Detail Preview.
- **FR-023**: K-1 History MUST list every `k1_documents` row for this partnership with Tax Year, Status (`StatusBadge`), Reported Distribution, Finalized At, and a link to the K-1 Review Workspace (Spec 003).
- **FR-024**: FMV Snapshots MUST list snapshots most-recent-first (ordered by `created_at` desc, tie-broken by `as_of_date` desc) with As-of Date, Amount (USD), Source, Note, and Recorded By; Admins MUST see a "Record FMV" action that opens an inline form or dialog. Snapshots MUST be append-only: multiple snapshots per `as_of_date` are allowed, and the UI and API MUST NOT expose any edit or delete path. "Latest FMV" is the newest snapshot by `created_at`; corrections are made by recording a newer snapshot.
- **FR-025**: Expected Distribution History MUST list rows read-only from the existing K-1 pipeline; it MUST NOT permit editing in this feature.
- **FR-026**: The page MUST render Loading, Empty (per section), Error, and Permission-limited states per the UI Constitution.

### Functional Requirements — Entity Detail (Screen #9)

- **FR-040**: The page MUST render a `PageHeader` with the entity name as title and an entity-type subtitle; it MUST show a status indicator.
- **FR-041**: The page MUST render a summary strip with aggregated KPIs: Partnerships Count, Total Distributions, Total FMV, Latest K-1 Year (max across partnerships under the entity).
- **FR-042**: The page MUST render a partnerships table scoped to this entity with columns Partnership Name, Asset Class, Latest K-1 Year, Latest FMV, Status; a row click MUST navigate to Partnership Detail.
- **FR-043**: The page MUST render a read-only Reports preview section linking to the relevant reports (Spec 006) — links only in this feature.
- **FR-044**: The page MUST render Loading, Empty (no partnerships), Error, and Permission-limited states.

### Functional Requirements — Access, Security, Audit

- **FR-060**: All three screens MUST be reachable only from an authenticated two-factor session; unauthenticated access MUST redirect to Login.
- **FR-061**: Visibility of every partnership and entity MUST be constrained to the caller's explicit entity grants as defined by Auth and Access and K-1 Ingestion (Spec 002, the existing `entity_memberships` table). A non-Admin User MUST only see partnerships whose `entity_id` appears in their `entity_memberships` rows; Admins MUST see all entities and partnerships. Out-of-scope ids on list / detail / export / CSV endpoints MUST return 403 (not 404).
- **FR-062**: "Add Partnership", "Edit Partnership", and "Record FMV" MUST be Admin-only on both the UI (hidden / disabled) and the API (403 for non-Admins). Admins MUST be able to edit `name`, `asset_class`, `notes`, and `status` on an existing partnership; status MAY transition freely across `Active | Pending | Liquidated | Closed`. Partnerships MUST NOT be hard-deleted or archived in v1.
- **FR-063**: Every create / update action MUST emit an audit event stored in `audit_events` in the same transaction as the business mutation: `partnership.created` — `before_json = null`, `after_json` = full new partnership row; `partnership.updated` — `before_json` = full prior row, `after_json` = full updated row (consumers can derive `changedFields`/`previousValues`/`newValues` by diffing the two snapshots); `partnership.fmv_recorded` — `before_json` = the previous latest FMV snapshot for this partnership (or `null` if none), `after_json` = full new snapshot row.
- **FR-064**: Unique constraint: no two partnerships may share the same `(entity_id, name)` pair; the create endpoint MUST return 409 on violation with a deterministic error code, and an edit that would cause a collision MUST also return 409.
- **FR-065**: CSV export MUST enforce the same scope rules as the list endpoint; it MUST NOT leak partnerships outside the caller's scope.

### Key Entities

- **Entity** (existing, `entities` table) — id, name, entity_type, status, notes.
- **Partnership** (existing, `partnerships` table) — id, entity_id, name, asset_class, status (Active / Pending / Liquidated / Closed), notes.
- **K1Document** (existing, `k1_documents` table) — used read-only on Partnership Detail for K-1 history and to compute Latest K-1 Year and Latest Reported Distribution.
- **FmvSnapshot** (new) — id, partnership_id, as_of_date, amount_usd, source (enum: `manager_statement` | `valuation_409a` | `k1` | `manual`), note, created_by, created_at. Append-only: no `updated_at`, no soft-delete, no uniqueness constraint on `(partnership_id, as_of_date)`.
- **ExpectedDistribution** (existing or inherited from K-1 pipeline) — partnership_id, period, amount_usd, status; shown read-only.
- **AuditEvent** (existing) — gains two new event types above.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can go from "Partnerships" in the sidebar to a populated Directory in under 2 seconds for portfolios up to 500 partnerships (p95) under normal conditions.
- **SC-002**: Search returns filtered results within 500 ms for up to 500 partnerships (p95).
- **SC-003**: From the Directory, users can reach Partnership Detail in under 1 second (p95) once the detail endpoint returns.
- **SC-004**: 100% of partnerships visible to a user in the Directory MUST be within that user's entity scope (verified by automated scope test).
- **SC-005**: Adding a new partnership reflects in the Directory within one refresh and in K-1 Review's partnership mapping typeahead within 5 seconds.
- **SC-006**: Recording an FMV snapshot updates the Partnership Detail "Latest FMV" KPI within one render cycle after the write.
- **SC-007**: CSV export of the filtered set completes within 3 seconds for up to 500 partnerships (p95) and matches on-screen values 100%.
- **SC-008**: Zero partnerships or entities outside the caller's scope MUST appear in any API response (list, detail, export) across regression tests.
- **SC-009**: The three screens MUST render all six UI-Constitution states in a Storybook / preview-level fixture set before ship.

## Assumptions

- Entity CRUD (create / edit / delete of `entities`) is **out of scope** for this feature; entities are seeded by Admins via an existing admin flow or directly via the `entities` table.
- Partnership delete / archive is **out of scope** for v1; partnerships in Liquidated or Closed status remain visible unless filtered out. Admins MAY edit `name`, `asset_class`, `notes`, and `status` in v1 with free status transitions across the enum.
- "Card view" of the Directory is **deferred**; v1 is table-only. The template is structured to add a card view later without breaking API contracts.
- Expected Distribution History is **read-only** from this feature's perspective; the source of truth is the K-1 pipeline (and any future manual override feature is not part of this spec).
- "Reports preview" on Entity Detail is a **links-only** surface; the actual reports are owned by Spec 006.
- The partnership Status enum is `Active | Pending | Liquidated | Closed`, matching the reference template and aligning with the existing `partnerships.status` text field.
- FMV snapshots are **manually recorded** in v1; auto-derivation from finalized K-1s is out of scope and may be added later without contract change.
- CSV export uses the current filtered set (not the full portfolio) and always includes the Status column.
- The shared `AppShell`, `PageHeader`, `FilterToolbar`, `SummaryStrip` / `KpiCard`, `DataTable`, and `StatusBadge` catalog components (per the UI Constitution) are the implementation targets; the reference component template in the user-provided arguments is a visual/behavioral blueprint, not a replacement for the shared catalog.
