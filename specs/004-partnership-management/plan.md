# Implementation Plan: Partnership Management

**Branch**: `004-partnership-management` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-partnership-management/spec.md`

## Summary

Deliver Screens #9 (Entity Detail), #10 (Partnership Directory), #11 (Partnership Detail) as CRM-style operational views on top of the entities / partnerships the K-1 workflow already writes to. Screen #10 is the MVP landing surface: a filterable, sortable, CSV-exportable `DataTable` with a three-card KPI strip (Total Partnerships, Total Distributions, Total FMV) that stays in lockstep with applied filters. Screen #11 adds a four-card KPI strip plus five detail sections (K-1 History, Expected Distribution History, FMV Snapshots, Notes, Activity Detail Preview) and Admin-only "Edit Partnership" and "Record FMV" actions. Screen #9 provides the entity-level rollup. Implementation reuses the existing `apps/web` (React 19 + Tailwind + TanStack Query) shell, the `apps/api` (Fastify + TypeScript) service, the existing `entity_memberships` scoping plugin pattern, and the existing `partnerships` / `partnership_fmv_snapshots` / `partnership_annual_activity` / `k1_reported_distributions` / `audit_events` tables. A single migration drops the `unique (partnership_id, valuation_date)` constraint on `partnership_fmv_snapshots` to make the table append-only (per Clarification Q3). No UI framework is introduced; all screen composition normalizes to the Atlas component catalog (UI Constitution §3, §10).

## Technical Context

**Language/Version**: TypeScript `~5.5` (web + api + shared types), Node.js 22 LTS runtime for the API, SQL (PostgreSQL 15+)
**Primary Dependencies**:
- Web: React 19, Vite, React Router 7, Tailwind CSS 3, Framer Motion 12, Lucide React, `@tanstack/react-query` (request lifecycle + action-triggered invalidation; no polling)
- API: Fastify 5, Zod 3, `pino` logging, `pg` client, `crypto.randomUUID` for IDs; reuses the existing `k1Scope.plugin.ts` pattern for `entity_memberships` enforcement
- Shared: `packages/types` for `Partnership`, `PartnershipDirectoryRow`, `PartnershipDetail`, `EntityDetail`, `FmvSnapshot` wire types
**Storage**:
- Existing tables reused read-only: `entities`, `k1_documents`, `k1_reported_distributions`, `partnership_annual_activity`, `audit_events`
- Existing tables reused with writes: `partnerships` (create + update), `partnership_fmv_snapshots` (insert-only), `audit_events` (insert)
- Migration `004_partnership_management.sql` added by this feature:
    - `ALTER TABLE partnership_fmv_snapshots DROP CONSTRAINT IF EXISTS partnership_fmv_snapshots_partnership_id_valuation_date_key` (drops the per-date uniqueness; multiple snapshots per date become legal)
    - `CHECK` constraint on `partnerships.status IN ('ACTIVE','PENDING','LIQUIDATED','CLOSED')` (keeps the enum authoritative)
    - Index `partnership_fmv_snapshots_partnership_created_idx ON partnership_fmv_snapshots (partnership_id, created_at DESC)` for `latest-by-created_at` lookups
    - Index `partnerships_entity_name_idx ON partnerships (entity_id, lower(name))` for the `(entity_id, name)` conflict check (enforced by app-layer 409 per FR-064, not a DB unique, to allow rename races to be a friendly error rather than a 500)
- Computed/denormalized values (Latest K-1 Year, Latest Reported Distribution, Latest FMV) are resolved server-side via CTEs on top of `k1_documents` (latest finalized `tax_year`), `k1_reported_distributions` (reported distribution amount at that year), and `partnership_fmv_snapshots` (latest row by `created_at`). No new materialized tables.
**Testing**: Vitest + Testing Library (web), Vitest + supertest-style HTTP contract tests (api), Playwright happy-path E2E for Directory → Detail navigation and Add Partnership / Record FMV writes (Admin).
**Target Platform**: Browser web UI + Linux-hosted Fastify API, same single-tenant deploy topology as Features 001–003.
**Project Type**: Monorepo web application (frontend + API + shared packages) — no new project boundary added.
**Performance Goals**:
- SC-001: Directory populated render (KPIs + first page of rows visible, interactive) < 2 s at 500 partnerships in tenant
- SC-002: Search-filtered results < 500 ms at 500 partnerships (p95), served server-side with `ILIKE` on `partnerships.name` + `entities.name`
- SC-003: Partnership Detail first render < 1 s after endpoint returns
- SC-007: CSV export < 3 s at 500 partnerships (p95)
- List endpoint p95 < 250 ms at 500 rows in tenant; detail endpoint p95 < 200 ms
**Constraints**:
- Entity scope is enforced on the server for every read, list, export, update, and FMV write (FR-061, FR-065) via the existing `entity_memberships` plugin pattern
- Admin-only for write paths: `POST /v1/partnerships`, `PATCH /v1/partnerships/:id`, `POST /v1/partnerships/:id/fmv-snapshots` (FR-062)
- Append-only for FMV: no PATCH, no DELETE for snapshots; migration removes the per-date unique constraint (FR-024, Clarification Q3)
- No hard delete, no archive for partnerships in v1 (FR-062, Clarification Q4)
- No polling, no background push; manual refresh + TanStack Query invalidation on mutations
- KPIs recompute from the filtered set on every filter change (FR-004), distinct from the K-1 Processing Dashboard which is scope-only
- Every create/update writes an `audit_events` row in the same transaction (FR-063); fail-closed
- Shared catalog components only (UI Constitution §3, §10); Magic Patterns reference component template is a visual blueprint, not the implementation target
**Scale/Scope**: 100–2K partnerships per tenant, 1–20 FMV snapshots per partnership, 1–20 K-1s per partnership across years. Table rendering stays responsive via server-side pagination + sort + filter; no load-all on client.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Primary constitutions used for gating:

- `specs/000-constitution.md` (system constitution — placeholder file in repo; treated as inherit from Features 001–003 conventions)
- `specs/001-ui-constitution.md` (UI constitution)
- Conventions established by Features 001–003 (auth, scope plugin, audit events, no Material UI, catalog-only components)

> Note: `.specify/memory/constitution.md` is currently an unfilled template. The gate below is evaluated against `specs/000-constitution.md`, `specs/001-ui-constitution.md`, and the de facto conventions carried forward from Features 001–003. This gap is flagged as repository-level housekeeping, not as a blocker for this feature.

### Pre-Phase 0 gate

1. **K-1 workflow invariants (000 §3, inherited)**: PASS
    - This feature reads `k1_documents` and `k1_reported_distributions` but NEVER mutates them. "Latest K-1 Year" and "Latest Reported Distribution" are derived from the existing lifecycle; no status skips, no synthetic finalization.
2. **Data source hierarchy (inherited)**: PASS
    - FMV snapshots are explicitly marked with `source_type` (`manager_statement` / `valuation_409a` / `k1` / `manual`). Parsed K-1 values remain the K-1 feature's responsibility. No value shown in Partnership Management is calculated client-side — KPI sums are server-side over per-row values.
3. **System integrity (audit + scope, inherited §13)**: PASS
    - Every create/update (partnership create, partnership update, fmv snapshot create) emits an audit event in the same transaction.
    - Every read enforces `entity_memberships` scope on the server; Admins bypass the join.
    - FMV append-only semantics preserve historical truth (no snapshot is edited or deleted).
4. **Security + RBAC (000 §9, 001 §7)**: PASS
    - Route-guarded by the existing session cookie. Admin role gate on all write endpoints. 403 on out-of-scope reads (not 404).
5. **Shared UI patterns + states (001 §3, §4, §10)**: PASS
    - Directory, Partnership Detail, and Entity Detail all compose from `AppShell`, `PageHeader`, `FilterToolbar`, `KpiCard` (via a summary-strip wrapper), `DataTable`, `StatusBadge`, `SectionCard`, `EmptyState`, `ErrorState`, `LoadingState`. All six required states (loading, empty, filtered-empty, error, populated, permission-restricted) are in scope per screen. The Magic Patterns reference component template is acknowledged as a blueprint and explicitly normalized.
6. **No Material UI, motion limited to catalog (001 §1, §10)**: PASS
    - Tailwind + catalog components. Motion is confined to the existing `KpiCard` / `DataTable` patterns already in the catalog.

### Post-Phase 1 re-check

Re-evaluated after Phase 1 artifacts were written. Expected to remain PASS; the only contentious choice is the FMV append-only migration, which is surfaced in [research.md](./research.md) with an explicit rollback note. Result: **PASS**. No new violations introduced by `data-model.md` or `contracts/partnership-management.openapi.yaml`.

## Project Structure

### Documentation (this feature)

```text
specs/004-partnership-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── partnership-management.openapi.yaml   # Phase 1 output
├── checklists/
│   └── requirements.md  # From /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/
│       ├── modules/
│       │   └── partnerships/
│       │       ├── partnerships.routes.ts       # route registration
│       │       ├── partnerships.handler.ts      # list / detail / create / update
│       │       ├── partnerships.export.ts       # CSV export handler
│       │       ├── partnerships.repository.ts   # entity-scoped queries + writes
│       │       ├── partnerships.zod.ts          # request/response schemas
│       │       ├── partnershipScope.plugin.ts   # reuses K-1 pattern over entity_memberships
│       │       ├── entities.handler.ts          # entity detail (read-only)
│       │       ├── entities.repository.ts       # scoped entity reads
│       │       ├── fmv.handler.ts               # FMV snapshot create + list
│       │       └── fmv.repository.ts            # append-only snapshot queries
│       ├── infra/db/migrations/
│       │   └── 004_partnership_management.sql   # drop unique + add indexes + status CHECK
│       └── routes/index.ts                       # registers partnerships routes (edit existing)
│   └── tests/
│       ├── partnerships.list.contract.test.ts
│       ├── partnerships.detail.contract.test.ts
│       ├── partnerships.create.contract.test.ts
│       ├── partnerships.update.contract.test.ts
│       ├── partnerships.export.contract.test.ts
│       ├── partnerships.authz.integration.test.ts
│       ├── entities.detail.contract.test.ts
│       └── fmv.append-only.integration.test.ts
└── web/
    └── src/
        ├── pages/
        │   ├── PartnershipDirectory.tsx
        │   ├── PartnershipDetail.tsx
        │   └── EntityDetail.tsx
        ├── features/partnerships/
        │   ├── api/partnershipsClient.ts
        │   ├── api/entitiesClient.ts
        │   ├── api/fmvClient.ts
        │   ├── hooks/usePartnershipQueries.ts
        │   ├── hooks/useEntityQueries.ts
        │   ├── hooks/useFmvMutations.ts
        │   └── components/
        │       ├── PartnershipDirectoryTable.tsx
        │       ├── PartnershipKpiStrip.tsx
        │       ├── PartnershipFilters.tsx
        │       ├── AddPartnershipDialog.tsx
        │       ├── EditPartnershipDialog.tsx
        │       ├── RecordFmvDialog.tsx
        │       ├── FmvSnapshotsSection.tsx
        │       ├── K1HistorySection.tsx
        │       ├── ExpectedDistributionSection.tsx
        │       └── ActivityDetailPreview.tsx
        └── App.tsx                              # adds /partnerships, /partnerships/:id, /entities/:id routes

packages/
└── types/
    └── src/
        └── partnership-management.ts            # shared wire types (added; exported from index)
```

**Structure Decision**: Monorepo web application with a new `partnerships` module under `apps/api/src/modules/` that mirrors the `k1` module's layout (routes → handler → repository → scope plugin → Zod schemas), a new `features/partnerships/` folder under `apps/web/src/` mirroring the `features/k1/` and `features/review/` folders, one shared types file in `packages/types`, and one SQL migration file under `apps/api/src/infra/db/migrations/`. Three new route-level pages are added under `apps/web/src/pages/` and wired into `App.tsx`. The existing `entity_memberships` table and its scope enforcement pattern are reused; no new auth table.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                    |

## Phase Outputs

- **Phase 0 (research)**: [research.md](./research.md) — resolved questions on FMV append-only migration, KPI derivation query strategy, CSV export shape, status enum normalization, and Edit Partnership optimistic-concurrency choice.
- **Phase 1 (design + contracts)**:
    - [data-model.md](./data-model.md) — entities, invariants, derivations, audit event schemas, migration summary.
    - [contracts/partnership-management.openapi.yaml](./contracts/partnership-management.openapi.yaml) — REST contract for `/v1/partnerships` (list, create, detail, update, export), `/v1/partnerships/:id/fmv-snapshots` (list, create), `/v1/entities/:id` (detail).
    - [quickstart.md](./quickstart.md) — end-to-end walkthrough validating the spec's five user stories.

## Progress Tracking

- [x] Spec available and clarified (5/5 questions answered on 2026-04-23)
- [x] Pre-Phase 0 Constitution Check: PASS
- [x] Phase 0 research drafted
- [x] Phase 1 data-model drafted
- [x] Phase 1 contracts drafted
- [x] Phase 1 quickstart drafted
- [x] Agent context updated (`.github/copilot-instructions.md` SPECKIT block points at this plan)
- [x] Post-Phase 1 Constitution Check: PASS
