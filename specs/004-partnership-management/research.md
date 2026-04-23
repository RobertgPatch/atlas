# Phase 0 Research — Partnership Management

**Feature**: `004-partnership-management`
**Inputs**: `spec.md` (with Clarifications 2026-04-23), `docs/schema/21-postgres-ddl.sql`, Features 001–003 artifacts.

All NEEDS-CLARIFICATION items from the spec were resolved during `/speckit.clarify`. This document records the remaining design decisions that fell out of context-gathering and were not explicit spec questions.

---

## Decision 1: Reuse the existing `partnership_fmv_snapshots` table; drop the per-date unique constraint

- **Decision**: Keep the existing table `partnership_fmv_snapshots` (already in `docs/schema/21-postgres-ddl.sql`). Migration `004_partnership_management.sql` drops `unique (partnership_id, valuation_date)` so multiple snapshots per `as_of_date` are allowed (Clarification Q3). No new table, no column rename.
- **Rationale**: The column set already matches the spec's intent (id, partnership_id, valuation_date ≈ as_of_date, fmv_amount ≈ amount_usd, source_type ≈ source, notes ≈ note, created_at). Renaming columns would churn every downstream consumer and the DDL canonical file. The only semantic gap is the unique constraint, which is a single DROP.
- **Alternatives considered**:
    - *Create a new `fmv_snapshots` table with our preferred names* — rejected: duplicate schema, needs a view for backward compat, extra migration surface.
    - *Keep the unique constraint and reject same-day re-entry with a 409* — rejected: directly conflicts with Clarification Q3 ("multiple per as_of_date allowed, corrections via newer snapshot").
- **Rollback**: The migration is a single `DROP CONSTRAINT IF EXISTS`; rolling back requires deleting any new duplicate-date rows first, then `ADD CONSTRAINT ... UNIQUE (partnership_id, valuation_date)`.
- **Residual work**: `updated_at` remains on the table but the API handlers MUST NOT write it on insert (it falls back to `now()` from the DDL default and equals `created_at` for a freshly inserted row). We treat `created_at` as the ordering key for "Latest FMV".

## Decision 2: Derive "Latest K-1 Year", "Latest Reported Distribution", "Latest FMV" in a single read CTE per request

- **Decision**: The list and detail endpoints compute derived values inline via a CTE rather than maintaining a denormalized cache. The CTE selects, per partnership in scope:
    - `latest_k1_year` = `max(tax_year)` over `k1_documents` rows with `processing_status = 'FINALIZED'` for that partnership.
    - `latest_distribution` = `reported_distribution_amount` from `k1_reported_distributions` joined by `(partnership_id, tax_year)` at that `latest_k1_year`. If multiple rows exist, pick the one whose `k1_document_id` is the most recently finalized `k1_documents` row (ordered by `finalized_at desc`).
    - `latest_fmv_amount`, `latest_fmv_as_of_date`, `latest_fmv_created_at` = from `partnership_fmv_snapshots` ordered by `(created_at desc, valuation_date desc)` limit 1.
- **Rationale**: At 100–2K partnerships per tenant with appropriate indexes (`k1_reported_distributions (partnership_id, tax_year)`, `partnership_fmv_snapshots (partnership_id, created_at desc)` — added by this migration), the CTE runs in well under the 250 ms list-endpoint budget. Denormalized fields would require a refresh trigger on every K-1 finalization and every FMV insert, which is a much larger blast radius.
- **Alternatives considered**:
    - *Materialized view refreshed on each K-1 finalize + FMV insert* — rejected: requires a refresh trigger owned by two other features (003 finalization, this feature's FMV handler); stale-reads risk if refresh fails.
    - *Application-layer N+1 fetches* — rejected: breaks the p95 budget and re-implements what Postgres already does well.
- **Rollback**: None needed; this is a query-shape choice, not a schema change.

## Decision 3: CSV export is a separate endpoint, not a query parameter

- **Decision**: `GET /v1/partnerships/export.csv?<same filters as list>` returns a streamed `text/csv` body with the exact column set FR-014 specifies and a `Content-Disposition: attachment; filename="partnerships-<yyyymmdd>.csv"` header. Same filter semantics as the list endpoint; no pagination; hard cap at 5 000 rows (tenant scale well below) — over-cap returns 413.
- **Rationale**: Mirrors the K-1 feature's export pattern (`/v1/k1/export.csv`). Keeps JSON list and CSV export on separate cache / content-type paths. Streaming avoids buffering 2K rows in memory.
- **Alternatives considered**:
    - *`GET /v1/partnerships?format=csv`* — rejected: forces list endpoint to branch on `Accept` / query param, complicates the OpenAPI schema, breaks the "one endpoint, one shape" heuristic already in use.

## Decision 4: Status enum uppercase; UI formats for display

- **Decision**: Wire values are uppercase `ACTIVE | PENDING | LIQUIDATED | CLOSED`, matching the K-1 feature's convention and the existing `partnerships.status` default (`'ACTIVE'`). The UI formats to title case ("Active", "Pending", "Liquidated", "Closed") via the shared `StatusBadge` variant map. A DB `CHECK` constraint is added by this migration to keep the enum authoritative.
- **Rationale**: Consistent with `k1_documents.processing_status` (upper-case `UPLOADED` / `PROCESSING` / ...). A CHECK constraint is cheap insurance against typos during seed/migration.
- **Alternatives considered**:
    - *Lowercase wire values* — rejected: inconsistent with K-1 feature; would require touching every consumer of existing status fields.

## Decision 5: Edit Partnership uses last-writer-wins; no ETag in v1

- **Decision**: `PATCH /v1/partnerships/:id` accepts any subset of `name, asset_class, notes, status` and applies them without optimistic-concurrency checks. Audit event includes `before_json` with the full prior row so that concurrent overwrites are at least inspectable after the fact.
- **Rationale**: Partnership rows are edited by a very small Admin group with low contention; the cost of ETag plumbing and `If-Match: <etag>` clients is not justified at v1 scale. Audit events provide forensic recovery.
- **Alternatives considered**:
    - *`If-Match` on `updated_at`* — defer to a later hardening pass if contention becomes real.

## Decision 6: Directory default sort is `partnerships.name ASC` with a deterministic tiebreaker on `id`

- **Decision**: When no `sort` query param is provided, the server orders by `partnerships.name ASC, partnerships.id ASC`. Every sortable column is paired with `id ASC` as the tiebreaker so pagination is stable across requests.
- **Rationale**: Stable sort is required for sticky-header tables and consistent CSV export ordering. `id ASC` is a free tiebreaker and avoids the "rows flicker between refreshes" class of bug.

## Decision 7: "Total Distributions" KPI sums per-partnership latest finalized K-1 distribution; no partial K-1 attribution

- **Decision**: The KPI is `sum` of each filtered row's `latest_distribution` column (see Decision 2). Partnerships with no finalized K-1 contribute `0`, not `null`. The KPI card label is "Total Distributions" with a subtitle "Latest finalized K-1 per partnership".
- **Rationale**: Matches the spec (FR-003) and makes the relationship between the KPI and the table column explicit: every dollar in the KPI is attributable to a visible row.
- **Alternatives considered**:
    - *Sum across every finalized K-1 ever, for every filtered partnership* — rejected: double-counts across years, doesn't match the visible column, and has no clear operator interpretation.

## Decision 8: "Total FMV" KPI and "Latest FMV" field use `created_at` ordering, not `valuation_date`

- **Decision**: Per Clarification Q3, "Latest FMV" is the newest snapshot by `created_at`. When sorting the FMV Snapshots section, order by `created_at desc` with `valuation_date desc` as a tiebreaker.
- **Rationale**: A user recording a correction for an old `as_of_date` expects that correction to be reflected as the latest figure. `created_at` captures the operator's intent; `valuation_date` captures the business event date.

## Decision 9: Admin-only writes enforced with a Fastify role guard, not a per-handler check

- **Decision**: Reuse the existing `requireAdmin` guard (from `apps/api/src/modules/admin/`) at the route registration level for `POST /v1/partnerships`, `PATCH /v1/partnerships/:id`, and `POST /v1/partnerships/:id/fmv-snapshots`. Non-Admin callers receive `403 { error: 'FORBIDDEN_ROLE' }`.
- **Rationale**: Single-source-of-truth role gate; matches the admin module pattern already in place.

## Decision 10: Magic Patterns reference template normalized to the Atlas catalog before merge

- **Decision**: The long React/TS reference block in the spec ("Partnership Directory — 500-line component") is treated as a visual blueprint. The actual screen code lives in `apps/web/src/pages/PartnershipDirectory.tsx` and composes the shared catalog components: `AppShell`, `PageHeader`, `FilterToolbar`, `KpiCard`, `DataTable`, `StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`. Styling uses Tailwind tokens already defined in `packages/ui`.
- **Rationale**: UI Constitution §3, §10 (shared patterns + Magic Patterns normalization rule). Shipping the reference template verbatim would fork styling and duplicate components.

---

## Open Questions Deferred to `/speckit.tasks`

None that block planning. `tasks.md` will break this down into migration, shared types, API module, scope plugin, handlers, Zod schemas, tests, web clients, hooks, pages, dialogs, and wiring.
