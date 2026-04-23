# Feature Specification: K-1 Review Workspace and Finalization

**Feature Branch**: `003-review-and-finalization`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "begin spec for 003-review-and-finalization" — expand the stub into a full specification for the K-1 Review Workspace (Screen #7) that validates parsed K-1 data, captures corrections, maps entity + partnership, and locks the K-1 on finalization. A Magic Patterns seed accompanies the request (split-view `K1ReviewWorkspace` with `ParsedFieldRow`, `ConfidenceIndicator`, `PDFPreview`, `ActionBar`).

## Context & References

This specification is governed by and MUST be read alongside:

- **[System Constitution](../000-constitution.md)**
  - §9 Security: RBAC, encryption, audit logging
  - §12 UI Principles: role-aware feature visibility
  - §13 System Integrity Rules: never lose audit history; user-corrected financial values MUST remain distinguishable from raw parsed values; finalized values are immutable
- **[UI Constitution](../001-ui-constitution.md)**
  - §3 Shared Patterns: `PageHeader`, `StatusBadge`, `SectionCard`, `EmptyState`, `ErrorState`, `LoadingState`, `ActionBar` / row action menu
  - §4 Screen States: loading / empty / error / populated / permission-restricted / finalized-locked
  - §6 Forms and Editing: shared editable-cell behavior, subtle validation messages, visible save state + undo
  - §8 Financial Data Integrity: finalized values render as locked; user-corrected values visually distinguishable from raw parsed values; source traceability must be accessible from the K-1 review workflow
  - §10 Magic Patterns Normalization Rule: Magic Patterns output is a starting point — must be normalized to the component catalog before merge
- **[Screen Map](../../docs/ui/40-screen-map.md)** — screen #7 K-1 Review Workspace, #8 Issues Queue
- **[Component Catalog](../../docs/ui/46-component-catalog.md)** — `PageHeader`, `StatusBadge`, `SectionCard`, `EditableCell`, `EmptyState`, `ErrorState`, `LoadingState`, `ActionBar`
- **[Generation Contract](../../docs/ui/45-generation-contract.md)** — presentational-first, typed props, all screen states, role-based visibility
- **[Auth and Access Spec](../001-auth-and-access/spec.md)** — verified two-factor session, `AppShell` gates route access; role model is `Admin` and `User`
- **[K-1 Ingestion Spec](../002-k1-ingestion/spec.md)** — upstream feature that creates `k1_documents` rows, runs extraction, seeds `k1_field_values` and `k1_issues`, and routes row-clicks from the K-1 Processing Dashboard to this screen via `/k1/:k1DocumentId/review`
- **[Postgres DDL](../../docs/schema/21-postgres-ddl.sql)** — `documents`, `k1_documents`, `k1_field_values`, `k1_issues`, `partnerships`, `entities`, `partnership_annual_activity` are the persistence contract

**Reference implementation artifact** (Magic Patterns seed, captured with this request):

- `K1ReviewWorkspace`, `ParsedFieldRow`, `ConfidenceIndicator`, `PDFPreview`, `ActionBar`, `StatusBadge` — presentational seed for Screen #7 (tokens, split layout, inline editing pattern, confidence bar, PDF highlight overlay, action bar with Save / Approve / Finalize / Send to Issue Queue)

Per UI Constitution §10, the Magic Patterns output is a **starting point only**. It MUST be normalized against the component catalog before this feature is considered complete — in particular `ParsedFieldRow` MUST be rebuilt on the shared `EditableCell` and `SectionCard` primitives; `ActionBar` MUST use the shared action-bar pattern; `StatusBadge` MUST use the shared token set rather than the seed's six ad-hoc variants.

## Clarifications

### Session 2026-04-21

- Q: Must Approve and Finalize be performed by different Admins (two-person rule)? → A: Yes — enforced. The Admin who clicks Approve MUST NOT be the Admin who clicks Finalize; server rejects with `SAME_ACTOR_FINALIZE_FORBIDDEN` when violated.
- Q: How are concurrent edits to the same K-1 reconciled? → A: Optimistic locking — client sends the `version` it read; server increments on successful write and rejects stale saves with 409 `STALE_K1_VERSION` so the reviewer can refresh and retry.
- Q: How does a field correction auto-resolve an open issue? → A: By explicit linkage — a `k1_issues` row MAY carry a `k1_field_value_id` reference; when the referenced field's correction passes validation on save, the linked issue transitions to resolved in the same transaction. Issues with no field reference are manual-resolve only.
- Q: From which lifecycle statuses may Approve be invoked? → A: Only `Needs Review`. `Uploaded` and `Processing` are pre-review and Approve must be hidden/rejected; `Ready for Approval` and `Finalized` remain as already excluded by FR-017.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate parsed K-1 data against its source PDF (Priority: P1)

A reviewer opens a K-1 that is in `Needs Review` or `Ready for Approval` from the K-1 Processing Dashboard. They see the parsed fields on the left (grouped into Entity Mapping, Partnership Mapping, and Core Fields) and the source PDF on the right. Each field displays its parsed value and a confidence indicator. Clicking a field's source-locator reveals where in the PDF it was extracted from, with a visible highlight.

**Why this priority**: This is the minimum viable surface for human-in-the-loop validation of parser output. Without it, no K-1 can be trusted downstream. Every other story in this feature depends on the reviewer being able to see parsed values next to their source. It is also the only story that works standalone against a seeded K-1 without requiring write paths.

**Independent Test**: Seed a K-1 in `Needs Review` with ≥8 parsed fields of varying confidence and at least one field with a `source_location` pointing into a known PDF. Open the review workspace; confirm the left panel renders the fields grouped correctly with confidence indicators, the right panel renders the PDF, and clicking the source-locator on a field highlights the correct region in the PDF and scrolls to the correct page.

**Acceptance Scenarios**:

1. **Given** a `Needs Review` K-1 is seeded with parsed fields, **When** the user navigates to `/k1/:id/review`, **Then** the workspace renders within 2 s with a `PageHeader` (title, breadcrumb, `StatusBadge`), a left panel of parsed fields grouped into Entity Mapping, Partnership Mapping, and Core Fields, and a right panel containing the source PDF.
2. **Given** the workspace has rendered, **When** the user inspects any parsed field, **Then** the field row displays its label, current value, a confidence indicator (High ≥ 90, Medium 70-89, Low < 70), a Required marker where applicable, and a source-locator control when a `source_location` is present.
3. **Given** a field with a known `source_location`, **When** the user activates its source-locator, **Then** the PDF panel scrolls to the correct page and renders a highlight overlay over the recorded bounding box.
4. **Given** the K-1 data or PDF fails to load, **When** the workspace resolves, **Then** an `ErrorState` is rendered for the failed panel with a retry affordance and no stale data is shown.
5. **Given** the user has no entitlement to the owning entity, **When** they attempt to open `/k1/:id/review`, **Then** the request is rejected with a permission-denied response and no parsed values are disclosed.
6. **Given** the K-1 has status `Finalized`, **When** the user opens the workspace, **Then** all parsed-field rows render as locked (read-only), the action bar hides Save / Approve / Finalize, and a "Document finalized" indicator is shown.

---

### User Story 2 - Correct parsed values and map entity + partnership (Priority: P1)

A reviewer identifies a field that the parser got wrong, or a Partnership/Entity reference that did not map to an existing record. They edit the field inline, see validation feedback in place, and save their corrections. The system records the correction as a user-supplied value distinct from the raw parsed value, clears any issues that the correction resolves, and persists the change before the reviewer navigates away. Entity and Partnership mapping fields resolve against existing records — the reviewer picks from a typeahead rather than free-text, guaranteeing downstream referential integrity.

**Why this priority**: Without corrections, the review workflow is only a reader and cannot move K-1s to `Ready for Approval`. Entity and Partnership mapping in particular is load-bearing for every downstream feature (distributions, FMV, reports, dashboards) — an unmapped K-1 cannot feed any of them. Ranked P1 with Story 1 because the pair is the MVP; approval and finalization (Story 3) presuppose corrected data.

**Independent Test**: With Story 1 available, pick a field with an obviously wrong parsed value and edit it inline; observe validation for empty-required and format violations. Save; reload the workspace and confirm the corrected value persists, the original parsed value is still retained in the audit record, and the corresponding issue (if any) is cleared. For mapping, try to save a free-typed Entity name not in the directory; confirm the save is rejected with a clear message; pick an existing Entity from typeahead and confirm the save succeeds.

**Acceptance Scenarios**:

1. **Given** a `Needs Review` K-1 with editing enabled for the current user, **When** the user activates a field's edit control, **Then** an inline input replaces the static value, the original value is preserved for cancel/undo, and focus moves to the input.
2. **Given** an inline edit is active, **When** the user submits an empty value on a Required field, **Then** an inline validation message is shown and the save button on the action bar remains enabled only if at least one other change is valid; the invalid field is marked in error.
3. **Given** the user has made one or more valid corrections, **When** they activate Save, **Then** all pending changes are sent as a single atomic update, each corrected `k1_field_values` row carries both the raw parsed value and the user-corrected value (§8 integrity), a `k1.field_corrected` audit event is written per changed field, and the UI clears the "unsaved changes" indicator.
4. **Given** a Partnership Mapping field is being edited, **When** the user opens the picker, **Then** they see a typeahead of Partnerships within their entity scope; selecting one stores its `partnership_id` on the K-1 document. Free-typed values that do not resolve to an existing Partnership MUST be rejected at save time with a message; the system MUST NOT silently create a new Partnership from this screen.
5. **Given** an Entity Mapping field is being edited, **When** the user opens the picker, **Then** they see a typeahead of Entities the user is entitled to; selecting one stores its `entity_id` on the K-1 document. Free-typed values MUST be rejected as in scenario 4.
6. **Given** a correction that fully resolves an open `k1_issues` row (e.g., a missing required field is now filled), **When** the save succeeds, **Then** that issue is automatically marked resolved and a `k1.issue_resolved` audit event is written; the Issues count for the row on the upstream K-1 Processing Dashboard reflects the drop on its next fetch.
7. **Given** a save fails due to a server or network error, **When** the save returns, **Then** the local edits remain in the UI with a retry affordance, an `ErrorState` banner is shown, and no partial writes are persisted on the server (transaction-scoped).
8. **Given** the user has unsaved changes, **When** they attempt to navigate away, **Then** they are prompted to save or discard and cannot silently lose edits.
9. **Given** the K-1 is `Finalized` or the user's role is not permitted to edit, **When** they load the workspace, **Then** the edit controls MUST NOT be rendered and any attempted direct API write MUST be rejected server-side.

---

### User Story 3 - Approve and finalize a reviewed K-1 (Priority: P2)

An authorized user (Admin per the current role model) confirms that a K-1's parsed values are correct, moves it to `Ready for Approval` by approving the parsed values, and finalizes it. Finalization locks the K-1 (no further edits), creates or updates the corresponding `partnership_annual_activity` row for the `(entity_id, partnership_id, tax_year)` tuple, and writes `k1.approved` and `k1.finalized` audit events. The workspace then renders as locked.

**Why this priority**: Finalization is the end state that makes K-1 data trustworthy for reporting and distribution tracking. It is ranked P2 rather than P1 because Stories 1 and 2 are independently valuable to a reviewer even before the approve/finalize surface exists (the K-1 can still be inspected and corrected), and a narrow early iteration could merge corrections via a separate admin path. That said, without Story 3 the feature does not close the loop end-to-end.

**Independent Test**: With Stories 1 and 2 available, bring a K-1 to a state with no open issues, no validation errors, and all required fields populated. As an Admin, activate Approve; confirm the `StatusBadge` transitions to `Ready for Approval`. Activate Finalize; confirm the status transitions to `Finalized`, the action bar collapses to the locked state, a `partnership_annual_activity` row exists for the `(entity_id, partnership_id, tax_year)` tuple with the finalized distribution, and `k1.approved` + `k1.finalized` audit events are present.

**Acceptance Scenarios**:

1. **Given** a K-1 has at least one open issue, one validation error, or one empty Required field, **When** the Admin views the action bar, **Then** the Finalize button MUST be disabled with a visible reason ("Resolve errors before finalizing" / "Missing required fields") and any attempted direct API call to finalize MUST be rejected.
2. **Given** a K-1 meets all finalize prerequisites, **When** the Admin activates Approve, **Then** the K-1 status transitions from `Needs Review` or the current pre-approval state to `Ready for Approval`, a `k1.approved` audit event is written, and the Finalize button becomes enabled (subject to the same prerequisites).
3. **Given** a K-1 is `Ready for Approval`, **When** the Admin activates Finalize, **Then** within a single server transaction: the K-1 status transitions to `Finalized`, the entity mapping and partnership mapping are frozen, a `partnership_annual_activity` row is upserted for `(entity_id, partnership_id, tax_year)` carrying at minimum the confirmed Reported Distribution (Box 19A), a `k1.finalized` audit event is written, and the change is visible on the next upstream dashboard fetch.
4. **Given** the Admin activates Finalize, **When** the `partnership_annual_activity` upsert fails or any other write in the transaction fails, **Then** the entire operation MUST roll back (K-1 remains `Ready for Approval`), an error is surfaced to the user, and no partial state is persisted.
5. **Given** a K-1 has been finalized, **When** any user (including an Admin) opens the workspace, **Then** all field rows render read-only, the action bar hides Save / Approve / Finalize and displays a "Document finalized" indicator, and any attempted direct API write MUST be rejected server-side.
6. **Given** the current user is not permitted to approve/finalize (role is `User`, not `Admin`), **When** they view the action bar, **Then** Approve and Finalize buttons MUST NOT be rendered, and any attempted direct API call for those operations MUST be rejected server-side.

---

### User Story 4 - Route a K-1 to the issue queue (Priority: P3)

A reviewer encounters a K-1 that cannot be resolved in the current session — for example, it needs input from the source accountant, a missing source document, or manager sign-off. They activate "Send to Issue Queue", optionally attach a note, and the K-1 appears in the shared issue queue (Screen #8) for follow-up. The K-1 remains in `Needs Review` on the K-1 Processing Dashboard; it is not approved, finalized, or hidden.

**Why this priority**: This is a productivity feature that routes blocked work to a shared queue. Useful but not required for the core lifecycle-management loop; reviewers can informally hand off work (Slack, email, assignment fields) before this ships. Ranked P3 because deferring it does not block ingestion, correction, approval, or finalization.

**Independent Test**: With Stories 1 and 2 available, activate "Send to Issue Queue" from the action bar on a `Needs Review` K-1; confirm a new `k1_issues` row is created linked to the K-1, a `k1.issue_opened` audit event is written, the K-1's Issues count on the upstream dashboard reflects the new open issue on its next fetch, and the K-1's status is unchanged.

**Acceptance Scenarios**:

1. **Given** a K-1 in `Needs Review`, **When** the user activates "Send to Issue Queue", **Then** a confirmation with an optional note field is shown; on confirm, a queue-visible issue is created referencing the K-1 and carrying the note.
2. **Given** the issue is created, **When** the save completes, **Then** a `k1.issue_opened` audit event is written, the K-1's status remains unchanged (stays `Needs Review`), and the open Issues count on the upstream dashboard increments on its next fetch.
3. **Given** the queue-routed issue is later resolved (outside this spec's scope — see Screen #8), **When** the upstream dashboard re-fetches, **Then** the K-1's Issues count decrements correspondingly.
4. **Given** a K-1 is `Finalized`, **When** any user views the action bar, **Then** "Send to Issue Queue" MUST NOT be rendered.

---

### Edge Cases

- **Field with no source_location**: the source-locator control on that row MUST NOT be rendered; the PDF panel is unaffected by the absence.
- **Confidence bands**: values render as High / Medium / Low exactly per the bands in Story 1 scenario 2; there is no fourth band. A missing confidence value renders neutrally (no color) rather than defaulting to Low.
- **Modified indicator**: a field whose current value differs from `original_value` displays a "Modified" marker until it is either saved (then cleared) or reverted to the original (then cleared).
- **Concurrent finalization**: if two Admins attempt to finalize the same K-1 simultaneously, exactly one MUST succeed and the other MUST fail cleanly with a message indicating the K-1 is already finalized; no double `partnership_annual_activity` row is created, and no duplicate `k1.finalized` audit event is written.
- **Partnership or Entity not yet in the directory**: the save MUST be rejected with a message instructing the user to create the record in the Partnership Management or Entity Management feature first. Mapping does not become a back-door for record creation (per System Constitution §13 and spec 004).
- **Required field cleared during editing**: the row remains in error state, the cumulative "Missing required fields" indicator on the action bar remains active, and Finalize remains disabled until the field is populated.
- **Finalized K-1 reached via direct URL**: the workspace MUST still load in locked state (no permission error) as long as the user has entity scope; read-only access is allowed for traceability.
- **Permission scope**: a user who is not permitted to see the K-1's owning entity MUST receive a permission-denied response on `/v1/k1/:id` and `/v1/k1/:id/review-session`; the workspace MUST NOT attempt to render any parsed values or the PDF.
- **PDF panel failure while left panel succeeds**: the right panel renders an isolated `ErrorState` with a retry affordance; editing and saving on the left panel remain available (reviewer can still work without the PDF, accepting the tradeoff).
- **Re-parse fired from the upstream dashboard while the workspace is open**: the workspace does not auto-refresh (V1 — matches 002 FR-029a); a user-visible refresh affordance is provided and a stale-state banner is shown if the server indicates the data is no longer current.
- **Stale write after a concurrent edit**: any save / map / approve / finalize / issue-queue write returns HTTP 409 `STALE_K1_VERSION` when the client-held `version` is behind the server (per FR-010a). The UI MUST render a stale-state banner, preserve the user's in-flight edits, and offer a Refresh action that re-reads the K-1 (including the new `version`) before the reviewer retries.
- **Admin who approved attempts to finalize**: the server rejects with 403 `SAME_ACTOR_FINALIZE_FORBIDDEN` (per FR-019a); the client hides Finalize for that Admin and shows an informational row ("Awaiting a second Admin to finalize"); the K-1 remains in `Ready for Approval` until a different Admin acts.

## Requirements *(mandatory)*

### Functional Requirements

**Workspace composition (Screen #7)**

- **FR-001**: The K-1 Review Workspace MUST render inside the shared `AppShell`; it MUST NOT define its own chrome.
- **FR-002**: The workspace MUST render a `PageHeader` with a breadcrumb back to the K-1 Processing Dashboard, a title containing the partnership name, a `StatusBadge` keyed to the K-1's lifecycle status, and metadata chips (Tax Year, Uploaded date, Assigned to where applicable).
- **FR-003**: The body MUST be a two-column split view — left panel of parsed fields, right panel containing the source PDF preview — with a persistent `ActionBar` footer carrying the state-change actions.
- **FR-004**: The left panel MUST group parsed fields into three sections, rendered in this order: Entity Mapping, Partnership Mapping, Core Fields. Each section MUST use the shared `SectionCard` pattern.
- **FR-005**: Each parsed field row MUST render its label, current value, a Required marker where applicable, a Modified marker when the current value differs from the original parsed value, a confidence indicator, and (when a `source_location` is present) a source-locator control that highlights the field in the PDF.
- **FR-006**: The right panel MUST render the source PDF with page navigation (previous / next / current-page indicator), zoom controls, and an overlay highlight layer that surfaces the bounding box of the currently selected field's `source_location`.

**Inline editing and corrections**

- **FR-007**: Parsed fields MUST be editable inline via the shared `EditableCell` behavior (UI Constitution §6) when the user has write permission and the K-1 is not `Finalized`.
- **FR-008**: Inline validation MUST surface empty-Required violations and format violations (e.g., numeric formatting on currency fields) as subtle per-row messages; invalid rows MUST be visually distinguishable from modified-but-valid rows (UI Constitution §6).
- **FR-009**: Saved corrections MUST persist both the raw parsed value and the user-corrected value in `k1_field_values` (System Constitution §13; UI Constitution §8). The raw value MUST remain recoverable and MUST NOT be overwritten.
- **FR-010**: A save MUST be atomic across all pending changes in a single request; on any failure, no partial state MUST be persisted and the user's unsaved changes MUST remain in the UI.
- **FR-010a**: Optimistic concurrency — every write endpoint on this screen (save corrections, entity/partnership map, approve, finalize, send-to-issue-queue) MUST accept the client-held `k1_documents.version` the reviewer read at open time and MUST reject stale writes with HTTP 409 and error code `STALE_K1_VERSION`. On successful write, the server MUST increment `version` and return the new value. On 409, the client MUST show a stale-state banner with a Refresh affordance; no partial state is persisted.
- **FR-011**: The workspace MUST prompt the user to save or discard unsaved changes before navigating away; silent discard is prohibited.
- **FR-012**: A `k1_issues` row MAY carry a `k1_field_value_id` reference naming the field whose correction would resolve it. When a save corrects a field that is the target of one or more such linked open issues AND the new value passes validation, those linked issues MUST transition to resolved in the same transaction as the save and MUST each emit a `k1.issue_resolved` audit event. Issues without a `k1_field_value_id` reference are manual-resolve only and MUST NOT be auto-resolved by field corrections.

**Entity and Partnership mapping**

- **FR-013**: The Entity Mapping field MUST resolve against existing `entities` records via a typeahead scoped to the caller's entity scope. Free-typed values that do not resolve to an existing record MUST be rejected at save time.
- **FR-014**: The Partnership Mapping field MUST resolve against existing `partnerships` records via a typeahead scoped to the caller's entity scope. Free-typed values that do not resolve to an existing record MUST be rejected at save time.
- **FR-015**: This screen MUST NOT create new Entity or Partnership records. Creation is the responsibility of later specs (Partnership Management, Entity Management). A save against an unmapped value MUST produce a message directing the user to create the record in the appropriate feature first.

**Approval and finalization**

- **FR-016**: The `ActionBar` MUST expose Save Corrections, Approve Values, Finalize, and Send to Issue Queue actions subject to role and state gating per FR-017 through FR-022.
- **FR-017**: Approve Values MUST be visible and enabled only when the current user's role is `Admin`, the K-1 status is exactly `Needs Review` (Approve MUST be hidden/rejected for `Uploaded`, `Processing`, `Ready for Approval`, and `Finalized`), and there are no validation errors or open issues on the K-1.
- **FR-018**: Approve Values MUST transition the K-1 status to `Ready for Approval`, MUST persist the acting user's id in `k1_documents.approved_by_user_id` (see FR-019a), and MUST write a `k1.approved` audit event referencing the K-1 and the acting user.
- **FR-019**: Finalize MUST be visible only when the current user's role is `Admin`; it MUST remain disabled until all of the following are true: no validation errors, no empty Required fields, no open issues, Entity Mapping and Partnership Mapping both resolve to existing records, and the K-1 status is `Ready for Approval`.
- **FR-019a**: Two-person rule — Finalize MUST be rejected (HTTP 403, error code `SAME_ACTOR_FINALIZE_FORBIDDEN`) when the acting user's id equals `k1_documents.approved_by_user_id`. The client MUST also disable Finalize for the Admin who performed the prior Approve. If the K-1 regresses from `Ready for Approval` back to `Needs Review` (e.g., a required field is cleared) the `approved_by_user_id` MUST be cleared; a subsequent Approve records the new acting Admin.
- **FR-020**: Finalize MUST, in a single server transaction: (a) transition the K-1 status to `Finalized`, (b) upsert a `partnership_annual_activity` row keyed by `(entity_id, partnership_id, tax_year)` carrying at minimum the confirmed Reported Distribution (Box 19A), (c) freeze Entity Mapping and Partnership Mapping, (d) persist the acting user's id in `k1_documents.finalized_by_user_id`, and (e) write a `k1.finalized` audit event referencing the K-1 and the acting user. If any step fails, the entire transaction MUST roll back.
- **FR-021**: Send to Issue Queue MUST be available for any user with write permission on a non-`Finalized` K-1; it MUST create a queue-visible `k1_issues` row linked to the K-1 (with the user's optional note) and write a `k1.issue_opened` audit event. It MUST NOT change the K-1's lifecycle status.
- **FR-022**: Any attempt to Save, Approve, Finalize, or Send to Issue Queue on a `Finalized` K-1 MUST be rejected server-side regardless of UI state.

**Screen states (UI Constitution §4)**

- **FR-023**: The workspace MUST support `loading` state — both panels render skeletons until data and PDF resolve; a premature `empty` or `error` flash MUST NOT occur.
- **FR-024**: The workspace MUST support `error` state, scoped per panel — a failure to load K-1 data MUST render `ErrorState` on the left panel; a failure to load the PDF MUST render `ErrorState` on the right panel only; the two failure modes MUST NOT take each other down.
- **FR-025**: The workspace MUST support `populated` state — the happy path described by FR-001 through FR-006.
- **FR-026**: The workspace MUST support `permission-restricted` state — a user without entity scope MUST be redirected or shown a permission-denied view; the workspace MUST NOT fetch any parsed values for scopes the user cannot access.
- **FR-027**: The workspace MUST support `finalized-locked` state — all field rows read-only, no edit controls, no Save / Approve / Finalize / Send to Issue Queue actions, a visible "Document finalized" indicator (UI Constitution §8).

**Authorization and role visibility (System Constitution §9, §12; UI Constitution §7)**

- **FR-028**: The workspace MUST be reachable only from an authenticated two-factor session; unauthenticated access MUST redirect to Login.
- **FR-029**: The workspace MUST scope all reads and writes to the K-1's owning entity; the server MUST enforce the scope on every endpoint regardless of client-side state.
- **FR-030**: Any authenticated user (role `Admin` or `User`) with entity scope MUST be able to open the workspace, view parsed values and the PDF, edit corrections, map Entity and Partnership, and send to the issue queue. Approve and Finalize MUST be restricted to `Admin`.
- **FR-031**: Client-side visibility of Approve and Finalize MUST be hidden for non-Admin users; server-side enforcement is authoritative.

**Auditability (System Constitution §13)**

- **FR-032**: The system MUST record an audit event for every user-initiated write on this screen: `k1.field_corrected` (one per changed field on save), `k1.entity_mapped`, `k1.partnership_mapped`, `k1.approved`, `k1.finalized`, `k1.issue_opened`, `k1.issue_resolved`.
- **FR-033**: Each audit event MUST record the acting user, the target `k1_documents` id, the action type, relevant before/after values (e.g., original vs corrected field value, prior vs new status), and a UTC timestamp.
- **FR-034**: If audit persistence fails during a user-initiated action, the action MUST NOT complete and the user MUST see an error. Fail-closed behavior is mandatory (matches 002 FR-036).
- **FR-035**: Finalization MUST be permanent in V1. There is no unfinalize / unlock action on this screen. (Reversal, if ever needed, is a separate admin/audit operation outside this feature.)

**UI contract alignment (UI Constitution §3, §4, §6, §8, §10)**

- **FR-036**: The implementation MUST normalize the Magic Patterns seed to the Atlas component catalog before merge — reusing `AppShell`, `PageHeader`, `StatusBadge`, `SectionCard`, `EditableCell`, `EmptyState`, `ErrorState`, `LoadingState`, and the shared `ActionBar` pattern. Bespoke local re-implementations of any of these components are prohibited.
- **FR-037**: The `StatusBadge` on this screen MUST use the shared token set aligned with 002's five lifecycle statuses (`Uploaded`, `Processing`, `Needs Review`, `Ready for Approval`, `Finalized`); the Magic Patterns seed's six ad-hoc variants (`draft`, `in_review`, `approved`, `finalized`, `error`, `needs_attention`) MUST NOT be adopted verbatim.
- **FR-038**: User-corrected values MUST be visually distinguishable from raw parsed values per UI Constitution §8 (e.g., a "Modified" marker on the row until next parse supersedes it).
- **FR-039**: Every icon MUST come from `lucide-react`; every animation MUST use `framer-motion`; no secondary UI framework (including Material UI) is permitted on this screen.

### Key Entities

- **K-1 Document**: the record under review; status transitions through this feature. One row in the upstream dashboard = one K-1 document = one review workspace instance. Carries `version` (monotonic, used for optimistic concurrency per FR-010a), `approved_by_user_id` (set on Approve, cleared on regression from `Ready for Approval`, checked at Finalize per FR-019a), and `finalized_by_user_id` (set on Finalize).
- **K-1 Field Value**: a single parsed datum. Stores the raw parsed value, an optional user-corrected value, a confidence score, a source location (page + bounding box) when available, and a Required flag when applicable. Corrections performed on this screen write to `k1_field_values`.
- **Issue**: a flagged problem on a K-1 (missing required field, low-confidence extraction, manual flag from this screen). MAY reference a specific `k1_field_values.id` via `k1_field_value_id` for field-linked issues that auto-resolve when the field is corrected (FR-012); issues without that reference are manual-resolve only.
- **Partnership**: the issuing partnership named on the K-1; referenced by `partnership_id` on the K-1 document after Partnership Mapping.
- **Entity**: the client entity receiving the K-1; referenced by `entity_id` on the K-1 document after Entity Mapping. Also the unit of permission scope.
- **Annual Activity**: a derived annual record keyed by `(partnership_id, entity_id, tax_year)` that captures finalized K-1 outcomes (at minimum the confirmed Reported Distribution from Box 19A). Created or updated on finalization; consumed by downstream dashboards and reports.
- **Audit Event**: an immutable record of every user-initiated write on this screen (see FR-032 / FR-033).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of K-1s whose status is one of the five supported lifecycle values, the workspace renders with the correct `StatusBadge` and the correct finalized-locked vs. editable state (verified by snapshot + state-coverage test across a seeded fixture covering every status).
- **SC-002**: Initial render of a populated workspace (both panels interactive, with the PDF first page and all parsed fields visible) completes in under 2 seconds for a K-1 with up to 50 parsed fields on a 10-page PDF under normal conditions.
- **SC-003**: 100% of saved corrections retain the raw parsed value alongside the user-corrected value in `k1_field_values`, verified by a property-based test that saves corrections across a fixture and then reads back both values.
- **SC-004**: 100% of field corrections produce a `k1.field_corrected` audit event; 100% of approvals produce a `k1.approved` event; 100% of finalizations produce a `k1.finalized` event AND a `partnership_annual_activity` upsert for the matching `(entity_id, partnership_id, tax_year)` tuple (verified by sampling ≥100 actions).
- **SC-005**: 0 instances of a user reading or writing a K-1 outside their entitlement scope across an authorization test that attempts direct URL access and direct API calls for every K-1 / entity / role combination in a seeded fixture.
- **SC-006**: 0 instances of a Finalize operation completing when one or more of the following is true: open issues on the K-1, validation errors, empty Required fields, unmapped Entity, unmapped Partnership, K-1 status not `Ready for Approval`, actor role not `Admin`, or acting user equals `approved_by_user_id` (verified by a guardrail test covering each condition independently, including a dedicated same-actor test that asserts HTTP 403 `SAME_ACTOR_FINALIZE_FORBIDDEN`).
- **SC-007**: 100% of Finalize failures leave the K-1 in its pre-finalize state (no status change, no `partnership_annual_activity` row, no `k1.finalized` audit event), verified by a transaction-rollback test that injects failures at each write step.
- **SC-008**: 0 usages of Material UI, a secondary UI framework, or a bespoke local re-implementation of `PageHeader` / `StatusBadge` / `SectionCard` / `EditableCell` / `EmptyState` / `ErrorState` / `LoadingState` / `ActionBar` on this screen (verified by source inspection).
- **SC-009**: Every screen state (loading, populated, error per panel, permission-restricted, finalized-locked) renders the expected catalog component and passes an a11y scan (verified by per-state snapshot + axe test).
- **SC-010**: From Finalize click to the upstream K-1 Processing Dashboard reflecting the new `Finalized` status on its next fetch, the round-trip completes in under 3 seconds under normal conditions.
- **SC-011**: 100% of concurrent writes against a stale `version` return HTTP 409 `STALE_K1_VERSION` with no mutation to `k1_documents`, `k1_field_values`, `k1_issues`, `partnership_annual_activity`, or `audit_events` (verified by a concurrency test that fires two interleaved saves and asserts only one commits).
- **SC-012**: 100% of field-linked open issues (carrying a `k1_field_value_id`) are auto-resolved on a successful correcting save of the referenced field and emit a `k1.issue_resolved` audit event; 0 issues without a `k1_field_value_id` are auto-resolved by field corrections (verified by a fixture covering linked and unlinked issues on the same K-1).

## Assumptions

- The role model from the Auth and Access feature is `Admin` and `User`. Approve and Finalize are restricted to `Admin`; all other actions on this screen are available to any user with entity scope. A separate `Reviewer` role is not introduced in V1 (the Magic Patterns seed's `reviewer` role is mapped to `User` at normalization time).
- Upstream ingestion (spec 002) is the sole producer of K-1 documents reaching this workspace; the workspace does not create K-1 documents and does not re-parse them. Re-parse is triggered from the upstream dashboard's row action menu.
- `partnership_annual_activity` is keyed by `(entity_id, partnership_id, tax_year)` and carries at minimum the Reported Distribution (Box 19A). Additional columns (FMV, expected distribution, etc.) are the responsibility of later specs (004 Partnership Management, 005 Dashboards) and are not required for Finalize to succeed in V1 — they default to null or to the inbound K-1's parsed values where present.
- PDF rendering uses an existing or to-be-added in-browser PDF renderer (e.g., `pdfjs-dist`); the spec defines the contract (page navigation, zoom, overlay highlight) but not the renderer choice.
- Bounding boxes are persisted in the existing `k1_field_values.source_ref` column (serialized as `sourceLocation` in the wire type) in normalized 0–100 page-relative coordinates with `{ page, bbox: [x1, y1, x2, y2] }`, matching the Magic Patterns seed and keeping the client renderer-agnostic.
- Confidence thresholds (High ≥ 90, Medium 70–89, Low < 70) are presentational. The parser is the authority on the numeric score; this screen only colors it. Thresholds are a product-level default and may be revised without altering this spec's FRs.
- Entity and Partnership directories are managed in separate features (later specs). For V1, fixtures seeded in the upstream feature (002) provide enough records to exercise mapping; no directory maintenance UI is introduced here.
- Data freshness on this screen is manual-refresh only in V1, matching 002 FR-029a. A refresh affordance is provided; background polling and server-push are deferred.
- Audit log storage is the same persistence mechanism used by Auth and Access and K-1 Ingestion; this feature depends on its availability and fails closed (FR-034) if it is not writable.
- "Send to Issue Queue" creates a queue-visible `k1_issues` row; the Issue Queue screen itself (Screen #8) is owned by a separate spec and is not in scope here.
