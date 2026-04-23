# Phase 0 Research: K-1 Review Workspace and Finalization

This document resolves every technical choice that was left open in the spec's Assumptions and the plan's Technical Context. Each entry is in the "Decision / Rationale / Alternatives considered" format.

## R1. In-browser PDF renderer

**Decision**: Use `pdfjs-dist` 4.x, wrapped by a new catalog component `PdfPreview` in `packages/ui/src/components/PdfPreview/`. The wrapper exposes page navigation (`page`, `onPageChange`), zoom (`zoom`, `onZoomChange`), and an overlay highlight API (`highlight: { page: number; bbox: [x1,y1,x2,y2] } | null`, coordinates are 0–100 page-relative per spec Assumption). The wrapper owns worker configuration and canvas rendering; consumers never import `pdfjs-dist` directly.

**Rationale**:
- Ships as an npm package (no CDN dependency), works with Vite's asset pipeline, and is MIT-licensed.
- Already the de-facto standard for in-browser rendering; stable API surface since 4.0.
- Fully client-side — no server-side rasterization; keeps the API stateless for PDF delivery.
- Isolating it behind `PdfPreview` keeps the UI-framework prohibition clean (FR-039): `pdfjs-dist` is a renderer, not a UI kit, and only one module imports it.

**Alternatives considered**:
- **`react-pdf`** (wrapper around pdfjs-dist): rejected — adds a dependency layer we don't need; our `PdfPreview` is ~150 LOC and gives us the overlay highlight API natively.
- **Server-side rasterization to PNG per page**: rejected — breaks the performance goal (SC-002 <2 s initial render for a 10-page PDF), adds server CPU, prevents client-side zoom/search.
- **Embed `<object>` or `<iframe>`**: rejected — no way to surface bounding-box highlights, no page navigation API, platform-specific rendering inconsistency.

## R2. Optimistic concurrency mechanism (FR-010a)

**Decision**: Monotonic `k1_documents.version integer not null default 0`. Every write endpoint on this screen accepts a `If-Match: <version>` header carrying the client-held version. The repository performs the write with a CAS pattern:

```sql
update k1_documents
set ..., version = version + 1, updated_at = now()
where id = $1 and version = $2
returning version;
```

If zero rows are updated, the server returns `HTTP 409 STALE_K1_VERSION` with `{ currentVersion: <db version> }` in the body; the transaction rolls back. The response to every successful write returns the new `version` in the body and mirrors it in an `ETag: <version>` header. `GET /v1/k1/:id/review-session` includes `version` in its body so the client can seed the value on open and after each successful write.

**Rationale**:
- Single source of truth on a single column; no need for row locks or advisory locks.
- Survives multi-row transactions — we increment exactly once per request inside the same transaction as all field updates, mapping writes, status transitions, and audit events. SC-011 holds by construction because CAS failure aborts the whole transaction before any dependent write.
- `If-Match` / `ETag` are the HTTP-idiomatic carriers for this; consumers don't need to learn a custom header.
- Integer `version` is 4 bytes; negligible storage cost even at millions of K-1s.

**Alternatives considered**:
- **Row-level `SELECT ... FOR UPDATE`**: rejected — requires holding a DB connection for the reviewer's entire session and does not protect against stale client state when the reviewer's tab sits idle.
- **`updated_at` timestamp as ETag**: rejected — clock precision and clock-skew risks; two writes at the same `now()` are possible on identical transactions.
- **Last-writer-wins**: explicitly rejected by FR-010a.

## R3. Two-person rule enforcement (FR-019a)

**Decision**: Add `k1_documents.approved_by_user_id uuid references users(id)` and `k1_documents.finalized_by_user_id uuid references users(id)`, both nullable. On Approve (`POST /v1/k1/:id/approve`), the handler sets `approved_by_user_id = auth.userId` inside the same transaction that flips status to `READY_FOR_APPROVAL`. On Finalize (`POST /v1/k1/:id/finalize`), the handler enforces `auth.userId != approved_by_user_id` as the very first guard (after authn/role/scope and version CAS); on violation it returns `HTTP 403 SAME_ACTOR_FINALIZE_FORBIDDEN`. Regression from `READY_FOR_APPROVAL` back to `NEEDS_REVIEW` (caused by a correction that invalidates Approve preconditions) clears `approved_by_user_id = NULL` in the same transaction so the next Approve records a fresh actor.

**Rationale**:
- Matches the standard SOX / dual-control pattern: one person approves, a different person finalizes. Clear audit trail (both column values persist, and `k1.approved` + `k1.finalized` events carry actor IDs).
- Column on `k1_documents` keeps the check O(1) with the row we're already loading; no join required.
- Clearing on regression prevents a stale `approved_by_user_id` from blocking the original Admin after their own Approve was invalidated.

**Alternatives considered**:
- **Derive the approver from the `k1.approved` audit event at Finalize time**: rejected — adds a read dependency on the audit log for a gating decision, which inverts the dependency arrow (audit is immutable history, not a query source for live business rules).
- **Soft warning only (no server enforcement)**: rejected — the spec (FR-019a) mandates server-side rejection.

## R4. Field-linked issue auto-resolve (FR-012)

**Decision**: Add `k1_issues.k1_field_value_id uuid references k1_field_values(id)`, nullable. The corrections handler (`POST /v1/k1/:id/corrections`) accepts a batch of field corrections, validates each against its rules, and — on a successful save — for each corrected field whose id is referenced by one or more **open** `k1_issues` rows, sets those issues' `status = 'RESOLVED'` and `resolved_at = now()` in the same transaction, emitting a `k1.issue_resolved` audit event per resolved issue. Issues with `k1_field_value_id IS NULL` are never auto-resolved by field corrections (they're resolved via `POST /v1/k1/:id/issues/:issueId/resolve`).

**Rationale**:
- Explicit linkage — the only issues that auto-resolve are those whose creator chose to link them to a specific field. Matches the clarified behavior in spec §Clarifications Q3.
- Keeps the write transactionally clean: one save trip updates fields, resolves linked issues, writes per-field and per-issue audit events, increments `version`, and (if appropriate) transitions status (e.g., if the K-1 was in `NEEDS_REVIEW` and the last required field just got populated with no remaining open issues, the status does NOT auto-advance to `READY_FOR_APPROVAL`; that still requires an explicit Approve).
- `resolved_issue_ids: string[]` in the response lets the client invalidate its issue cache precisely.

**Alternatives considered**:
- **Auto-resolve any open issue whose `issue_type` string matches the corrected field's name**: rejected — brittle string matching couples issue text to field names; the explicit FK is unambiguous.
- **Resolve all open issues on the K-1 when any correction passes validation**: rejected — would lose real problems that are not addressed by a field correction.

## R5. `partnership_annual_activity` upsert on Finalize

**Decision**: Finalize upserts into `partnership_annual_activity` keyed by the existing unique constraint `(entity_id, partnership_id, tax_year)`. The minimum payload required to succeed is `reported_distribution_amount` from `k1_reported_distributions` for the K-1 (Box 19A). All other `partnership_annual_activity` columns remain null on first write and may be backfilled by later features (004 Partnership Management, 005 Dashboards). `finalized_from_k1_document_id` is set to the K-1's id. The upsert uses `ON CONFLICT (entity_id, partnership_id, tax_year) DO UPDATE SET ...` so that a re-finalization after a hypothetical future reversal (out of scope for V1) overwrites parsed fields while preserving manual fields; for V1, Finalize is one-way (FR-035) so each `(entity_id, partnership_id, tax_year)` tuple is written at most once per lifetime of the K-1.

**Rationale**:
- Keys match Constitution §7 exactly.
- Leaving the larger field surface (FMV, commitments, IRR, TVPI, DPI, RVPI) null is correct — those values do not come from a K-1 and are the responsibility of downstream features. This prevents the screen from lying about provenance.
- `ON CONFLICT` handles the race where two Admins race to Finalize concurrently (FR-020 edge case): combined with the version CAS, exactly one wins; the loser returns 409 without inserting a duplicate.

**Alternatives considered**:
- **Insert without `ON CONFLICT`**: rejected — concurrent finalization would violate the unique constraint and leak a raw SQL error instead of the 409 contract.
- **Compute all derived columns on Finalize**: rejected — mixes responsibilities; dashboard/reporting features own those calculations.

## R6. Regression from `READY_FOR_APPROVAL` back to `NEEDS_REVIEW`

**Decision**: When a save or map write in the corrections handler invalidates Approve preconditions (a previously-satisfied Required field is cleared, a new field-linked issue opens, mapping is unset), the handler transitions status back to `NEEDS_REVIEW` in the same transaction, clears `approved_by_user_id`, and emits a `k1.approval_revoked` audit event referencing the previous approver and the cause.

**Rationale**:
- Preserves the FR-017 invariant that Approve requires a clean K-1; a regressed K-1 must require a fresh Approve by an eligible Admin.
- Clearing `approved_by_user_id` is what allows the original approver to re-approve after fixing the problem (otherwise the two-person rule would lock them out of a K-1 they never successfully approved).
- Dedicated audit event (`k1.approval_revoked`) makes the downgrade visible in the audit log without overloading `k1.approved`.

**Alternatives considered**:
- **Reject the save instead of regressing**: rejected — the reviewer must be able to correct mistakes even after Approve; blocking saves is worse UX than transparently downgrading.
- **Keep status at `READY_FOR_APPROVAL` with a warning banner**: rejected — breaks the invariant that `READY_FOR_APPROVAL` implies "ready to finalize"; Finalize would then be callable on a regressed K-1.

## R7. Reviewer session payload shape

**Decision**: A single `GET /v1/k1/:id/review-session` returns everything the workspace needs for its initial render: the `k1_documents` row (including `version`, `approved_by_user_id`, `finalized_by_user_id`), the full `k1_field_values` list grouped into `entityMapping`, `partnershipMapping`, `core` sections, the open `k1_issues` list, the resolved `partnership` and `entity` mappings (if any), and a short-lived signed URL-like path `pdfUrl` that resolves to `GET /v1/k1/:id/pdf`. Typeahead queries for unresolved entity/partnership fields are their own endpoints (`GET /v1/entities?q=...`, `GET /v1/partnerships?q=...`) and fire on demand, not eagerly.

**Rationale**:
- Single round-trip unblocks the screen's initial render within SC-002.
- Server-side grouping into `entityMapping` / `partnershipMapping` / `core` keeps the client's FieldSections simple and keeps grouping rules on the server (the authoritative place).
- Lazy typeaheads avoid loading the entire entities + partnerships tables on every workspace open.

**Alternatives considered**:
- **Split into `GET /:id`, `GET /:id/fields`, `GET /:id/issues`**: rejected — three round-trips on open break SC-002 on slower networks.
- **WebSocket push for live collaboration**: rejected — out of scope for V1; FR-029a from 002 and edge case "re-parse while workspace is open" explicitly preserve manual-refresh semantics.

## R8. Testing strategy

**Decision**:
- **API** uses Vitest + Fastify `app.inject()` exactly as established in 002. A new test helper `apps/api/tests/helpers/reviewFixture.ts` composes the 002 fixture and seeds (a) a K-1 in `NEEDS_REVIEW` with a mix of valid, invalid, and empty-required fields, (b) a K-1 in `READY_FOR_APPROVAL` with and without `approved_by_user_id` set, (c) a finalized K-1 for lock-state tests, (d) a fixture PDF on disk.
- **Web** adopts Vitest + Testing Library + jsdom for the first time (deferred from 002). A new `apps/web/vitest.config.ts` + `tests/setup.ts` gets added in Phase 3.1 tasks. The four web specs listed in the plan cover the five screen states, the happy finalize flow, the 409 stale-version UX, and linked-vs-unlinked issue auto-resolve. `PdfPreview` is mocked in web tests (the real `pdfjs-dist` worker runs only in E2E).
- **E2E** uses Playwright (also new — deferred from 002). One spec covers open → correct → approve (Admin A) → finalize (Admin B) → upstream dashboard shows `Finalized`.
- **Rollback coverage** (SC-007): `review.finalize-rollback.integration.test.ts` uses a repository seam that forces each write step in Finalize (status update, `partnership_annual_activity` upsert, mapping freeze, `finalized_by_user_id` update, audit event) to throw in turn, and asserts that the DB state is identical to pre-Finalize in every case.

**Rationale**:
- Builds on the 002 pattern wherever possible; introduces web test infra only because spec 003 explicitly mandates per-state + happy-path coverage (SC-001, SC-009).
- Mocking `PdfPreview` in unit tests keeps those tests fast and deterministic; real PDF rendering is exercised once in E2E.

**Alternatives considered**:
- **Defer web tests again**: rejected — SC-001 and SC-009 require per-state snapshot + axe coverage; deferring would fail the success criteria.
- **Use a real `pdfjs-dist` in unit tests**: rejected — adds jsdom canvas shims and worker plumbing just to re-test something E2E already covers.

## R9. Accessibility (SC-009)

**Decision**: All catalog components used on this screen are already a11y-audited in `packages/ui`. This feature adds:
- Keyboard-only flow: Tab through fields, Enter to edit, Esc to cancel, Tab to leave; Section headings are `<h2>`; ActionBar is a landmark.
- Screen-reader labels on the confidence indicator (e.g., `aria-label="High confidence"`), the Modified marker, the source-locator button, and the PDF page navigator.
- `aria-live="polite"` on the stale-version banner and finalized-lock indicator.
- axe integration in web unit tests (`vi` + `@axe-core/react`) asserts zero serious/critical violations per rendered state.

**Rationale**: SC-009 ("every screen state ... passes an a11y scan") is a hard gate; axe-in-unit-tests catches regressions before E2E.

**Alternatives considered**:
- **axe only in E2E**: rejected — per-state coverage is cheaper in unit tests and gives faster feedback.

## R10. Audit event names and shapes

**Decision**: Add these event names to the `audit_events.event_name` vocabulary:

| Event | Object | `before_json` | `after_json` |
|---|---|---|---|
| `k1.field_corrected` | `k1_field_values` | `{ raw_value, normalized_value, reviewer_corrected_value }` (prior) | same keys (new) |
| `k1.entity_mapped` | `k1_documents` | `{ entity_id: old \| null }` | `{ entity_id: new }` |
| `k1.partnership_mapped` | `k1_documents` | `{ partnership_id: old \| null }` | `{ partnership_id: new }` |
| `k1.approved` | `k1_documents` | `{ processing_status: 'NEEDS_REVIEW', approved_by_user_id: null }` | `{ processing_status: 'READY_FOR_APPROVAL', approved_by_user_id }` |
| `k1.approval_revoked` | `k1_documents` | `{ processing_status: 'READY_FOR_APPROVAL', approved_by_user_id }` | `{ processing_status: 'NEEDS_REVIEW', approved_by_user_id: null, cause }` |
| `k1.finalized` | `k1_documents` | `{ processing_status: 'READY_FOR_APPROVAL', finalized_by_user_id: null }` | `{ processing_status: 'FINALIZED', finalized_by_user_id, partnership_annual_activity_id }` |
| `k1.issue_opened` | `k1_issues` | `null` | `{ status: 'OPEN', message, k1_field_value_id?, severity }` |
| `k1.issue_resolved` | `k1_issues` | `{ status: 'OPEN' }` | `{ status: 'RESOLVED', resolved_at, resolution_cause: 'auto' \| 'manual' }` |

Every event carries `actor_user_id` (from the session), `object_type`, `object_id`, and `created_at`. Audit writes happen in the same transaction as their causing mutation; any audit write failure rolls the whole transaction back (FR-034, fail-closed, matches 002 FR-036).

**Rationale**: This extends the 002 event vocabulary consistently. Spec FR-032 enumerates the required events; the `k1.approval_revoked` event in R6 is an implementation-discovered addition covered by Constitution §13 ("all changes must be audit logged").

**Alternatives considered**:
- **Omit `k1.approval_revoked`**: rejected — status regression is a state change and §13 requires logging every state change.
