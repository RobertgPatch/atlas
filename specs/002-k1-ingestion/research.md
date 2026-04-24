# Phase 0 Research: K-1 Ingestion and Processing Dashboard

All Technical Context items in `plan.md` resolved; no `NEEDS CLARIFICATION` markers remain. Each decision below is traceable to a spec requirement, a clarification answer, or an existing convention from Feature 001.

## Decision 1: Authoritative lifecycle status on `k1_documents.processing_status`

- **Decision**: The `k1_documents.processing_status` column (`text not null default 'UPLOADED'`) is the single source of truth for row lifecycle on the dashboard. The UI MUST NOT infer status from field counts, issue counts, or extractor internals.
- **Rationale**: FR-016 requires a single authoritative field; the existing DDL at `docs/schema/21-postgres-ddl.sql` already carries `processing_status`. Deriving status client-side would violate Constitution §13 (no silent mutation / no inference without traceability).
- **Alternatives considered**:
  - Derive status from `k1_issues` + `user_approved`: rejected — fragile, not auditable, couples UI to internal parser representation.
  - Add a separate `status_events` timeline: deferred — useful for audit history surfaces (Feature 003+) but not required for this screen.

## Decision 2: Parse failures remain `PROCESSING` with inline error indicator

- **Decision**: When the extractor fails, the row stays in `processing_status = 'PROCESSING'`; the failure is recorded in new columns `parse_error_code`, `parse_error_message`, and the counter `parse_attempts` is incremented. The UI renders an inline error icon + tooltip on the `Processing` badge. No sixth status.
- **Rationale**: Clarification Q1 (Option B); FR-017 and FR-025 restrict the status vocabulary to the five lifecycle values. A sixth badge would violate UI Constitution §9 (one badge system) and distort KPIs.
- **Alternatives considered**:
  - Introduce `ERROR` status: rejected — breaks the state machine in Constitution §3 and introduces a sixth card that nothing else counts against.
  - Silent retry without user visibility: rejected — users lose ability to act on stalled parses.

## Decision 3: Duplicate detection on `(partnership_id, entity_id, tax_year)` with Replace / Cancel

- **Decision**: Upload endpoint checks for an active (non-superseded) `k1_documents` row matching the incoming `(partnership_id, entity_id, tax_year)` tuple. On hit, the upload returns `409 DUPLICATE_K1` with a body containing the existing document id. The client prompts Replace or Cancel. On Replace, a follow-up `POST /v1/k1/upload` call with `replace_document_id` atomically: (a) inserts the new `documents`/`k1_documents` row, (b) sets the prior row's `superseded_by_document_id`, (c) appends a `document_versions` row linking them, (d) writes `k1.superseded` audit event. Cancel is a client-side no-op.
- **Rationale**: Clarification Q4 (Option B); FR-023a/b require block + prompt + supersession + audit retention. Two-phase keeps idempotency and avoids a prompt embedded inside a single multipart upload.
- **Alternatives considered**:
  - Auto-supersede (Option D): rejected — silent overwrite is a Constitution §13 violation surface.
  - File-hash dedupe (Option C): rejected — misses the common "corrected K-1" case.
  - Single-call "force replace" flag: acceptable but loses the audit opportunity to distinguish "user confirmed replacement" from "first upload".

## Decision 4: Manual refresh only in V1; action-triggered invalidation via React Query

- **Decision**: The dashboard uses `@tanstack/react-query` with `refetchOnMount: 'always'`, `refetchOnWindowFocus: false`, and no polling. User-initiated actions (upload, re-parse, supersede, approve-from-menu) `invalidate` the `k1-list` and `k1-kpis` query keys on success, triggering an immediate refetch. A visible "Refresh" action in `PageHeader` secondary slot calls the same invalidation.
- **Rationale**: Clarification Q3 — manual only in V1; FR-029a requires automatic post-action refresh. React Query is already a common dependency and avoids hand-rolling a cache.
- **Alternatives considered**:
  - SWR: equivalent; React Query chosen for its first-class mutation + invalidation ergonomics.
  - Hand-rolled fetch + `useEffect`: rejected — loses caching, stale-while-revalidate, and concurrent request de-duplication without payoff.
  - 30s polling: rejected — explicitly out of scope per user direction ("plans to build in automation with APIs fetching real time data").

## Decision 5: KPI endpoint is a dedicated, scope-only query

- **Decision**: Expose `GET /v1/k1/kpis?tax_year=&entity_id=` separately from `GET /v1/k1?tax_year=&entity_id=&status=&q=&cursor=`. KPI endpoint accepts only Tax Year and Entity. Listing endpoint accepts all filters.
- **Rationale**: Clarification Q5 (Option B) — KPIs follow scope filters only. Making this impossible at the API level (rather than trusting the client to ignore Status/Search) removes a whole class of bugs.
- **Alternatives considered**:
  - Single combined endpoint with optional fields: rejected — invites misuse by returning KPI counts that silently respect finding-level filters.
  - Computed client-side from full list: rejected — doesn't scale to 1–5K rows and tends to drift from server reality.

## Decision 6: Any authenticated user may upload within entity scope; enforce via `entity_memberships`

- **Decision**: Every user has zero or more rows in a new `entity_memberships` table (user_id, entity_id). Every K-1 read endpoint filters by `entity_id IN (memberships)`. The upload endpoint rejects 403 if the target `entity_id` is not in the caller's memberships. No role check on upload (FR-033a).
- **Rationale**: Clarification Q2 — both Admin and User may upload; only entity scope gates. Separating scope from role keeps Constitution §9 (RBAC) orthogonal to operational capability.
- **Alternatives considered**:
  - Role-based upload (Admin only): rejected — creates bottleneck with no audit benefit.
  - Approval queue for non-admin uploads: rejected — adds ceremony for no clear V1 value.

## Decision 7: PDF storage on local filesystem in V1, behind a `PdfStore` interface

- **Decision**: `apps/api/src/modules/k1/storage/localPdfStore.ts` implements a simple interface:
  ```ts
  interface PdfStore {
    put(documentId: string, buffer: Buffer): Promise<string> // returns storage_path
    get(storagePath: string): Promise<NodeJS.ReadableStream>
    delete(storagePath: string): Promise<void>  // only used by supersede cleanup policy (not in V1)
  }
  ```
  Files live at `${STORAGE_ROOT}/k1/<yyyy>/<document_id>.pdf`. `STORAGE_ROOT` defaults to `./.storage` in development.
- **Rationale**: Single-tenant deployment (Constitution §10). An S3-compatible implementation swaps in behind the same interface post-V1 without touching handlers.
- **Alternatives considered**:
  - S3/minio now: deferred — adds deployment complexity before needed.
  - Store blob in `documents.storage_path` column: rejected for obvious reasons.

## Decision 8: Extraction behind `K1Extractor` interface; V1 uses a deterministic stub

- **Decision**: Handlers depend only on a `K1Extractor` interface:
  ```ts
  interface K1Extractor {
    extract(ctx: { k1DocumentId: string; pdfStream: NodeJS.ReadableStream }): Promise<ExtractResult>
  }
  ```
  V1 implementation is an in-process stub that: (a) sleeps briefly to exercise the `PROCESSING` state, (b) produces a deterministic set of `k1_field_values` keyed off file size, and (c) opens 0–3 `k1_issues` rows.
- **Rationale**: This feature's user-visible contract is lifecycle + issues + row visibility, not extraction accuracy. Isolating the extractor prevents coupling the UI spec to a specific ML implementation and keeps SC-010 (upload → visible `Uploaded` row < 5 s) achievable against any future extractor.
- **Alternatives considered**:
  - Integrate a real extractor (e.g., Textract, Azure Document Intelligence) now: rejected — extractor selection is its own decision with compliance implications for a financial system.
  - Synchronous extraction on upload thread: rejected — upload response would couple to extraction latency; user would see no `Processing` state.

## Decision 9: Extraction runs in-process on V1; no queue

- **Decision**: Upload handler responds `201` after persisting `documents`/`k1_documents` and writing the `k1.uploaded` audit event. It then dispatches extraction via `setImmediate`/async kickoff on the same Node process; the extractor updates `processing_status` and writes `k1.parse_started`, then `k1.parse_completed` or `k1.parse_failed` in its own transaction.
- **Rationale**: Keeps V1 deployable as a single API process (Constitution §10). Small-scale (1–5K K-1s / tenant / year) does not warrant a worker queue.
- **Alternatives considered**:
  - BullMQ / pg-boss queue: deferred — a sensible upgrade when extractor is a real external service with retry + rate-limit needs.
  - Separate worker service: deferred for the same reason.

## Decision 10: Listing uses keyset pagination + server-side sort, default `uploaded_at desc`

- **Decision**: `GET /v1/k1` supports `cursor`, `limit` (default 50, max 200), and `sort` (`uploaded_at`, `partnership`, `entity`, `tax_year`, `status`, `issues`, direction opt-in). Default is `uploaded_at desc`. Server returns `items[]` + `next_cursor` (opaque).
- **Rationale**: FR-029 default sort; spec scale (1–5K) and SC-002 (< 2s initial render) need server-side paging; keyset (vs offset) avoids drift on insert.
- **Alternatives considered**:
  - Offset pagination: acceptable for this scale but unstable during uploads; keyset is cheap to implement.
  - Return everything: fails SC-002 at upper bound.

## Decision 11: CSV export is server-rendered, streams filtered set

- **Decision**: `GET /v1/k1/export.csv?...` accepts the same filters as the listing endpoint and streams a UTF-8 CSV with BOM. Columns mirror the UI: Document Name, Partnership, Entity, Tax Year, Status, Issues, Uploaded. The endpoint enforces the same entity scope and bypasses `limit` (max 50K rows per export).
- **Rationale**: FR-030 requires the export to match filters and entitlement scope; doing it client-side would require loading every row, which violates SC-002.
- **Alternatives considered**:
  - Client-side CSV from the currently loaded page: rejected — leaks user expectation ("I filtered to 300, got 50").
  - XLSX: deferred per Assumptions.

## Decision 12: Audit event names are the FR-034 vocabulary, written in the same transaction as the mutation

- **Decision**: New audit event names introduced by this feature: `k1.uploaded`, `k1.parse_started`, `k1.parse_completed`, `k1.parse_failed`, `k1.issue_opened`, `k1.issue_resolved`, `k1.approved`, `k1.finalized`, `k1.superseded`, `k1.reparse_requested`. Each is emitted via the shared `writeAuditEvent` helper in the same `BEGIN ... COMMIT` boundary as the state change.
- **Rationale**: FR-034/035/036 + Constitution §13 mandate in-transaction audit; reusing the Feature 001 helper prevents drift.
- **Alternatives considered**:
  - Event bus / outbox: deferred — overkill before a multi-service topology exists.

## Decision 13: Refresh affordance placement

- **Decision**: A `Refresh` control is rendered as a `PageHeader` secondary action (alongside `Export`). It invokes the same `invalidate(['k1-list']); invalidate(['k1-kpis'])` used by mutations.
- **Rationale**: FR-029a requires a user-visible refresh. `PageHeader`'s secondary slot is where low-weight utilities belong per UI Constitution §3.
- **Alternatives considered**:
  - Pull-to-refresh: not applicable to a desktop data-dense surface.
  - Hidden keyboard shortcut only: rejected — not discoverable.
