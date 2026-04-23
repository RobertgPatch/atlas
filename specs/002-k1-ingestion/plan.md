# Implementation Plan: K-1 Ingestion and Processing Dashboard

**Branch**: `002-k1-ingestion` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-k1-ingestion/spec.md`

## Summary

Deliver Screen #5 "K-1 Processing Dashboard" as the primary landing surface of the K-1 workflow: a role-gated route inside the existing `AppShell` that renders a lifecycle KPI row (Uploaded / Processing / Needs Review / Ready for Approval / Finalized) scoped to Tax Year + Entity, a filterable, sortable `DataTable` of every K-1 in the user's entitlement scope, a primary upload action with duplicate-detection by `(partnership, entity, tax_year)`, an inline parse-error indicator that keeps failed rows in `Processing`, CSV export of the filtered view, and manual refresh (no polling in V1). Implementation reuses the existing `apps/web` (React 19 + Tailwind) shell and `apps/api` (Fastify + TypeScript) service, extends the Postgres schema (`documents`, `k1_documents`, `k1_issues`, new `document_versions` supersession table, new `audit_events` rows), and adds a PDF upload pipeline plus a stub extraction step that flips authoritative lifecycle status. No UI framework is introduced; all screen composition normalizes to the Atlas component catalog (UI Constitution §3, §10).

## Technical Context

**Language/Version**: TypeScript `~5.5` (web + api + shared types), Node.js 22 LTS runtime for the API, SQL (PostgreSQL 15+)
**Primary Dependencies**:
- Web: React 19, Vite 8, React Router 7, Tailwind CSS 3, Framer Motion 12, Lucide React, `@tanstack/react-query` (adopted here for request lifecycle + manual-refetch + action-triggered invalidation; no polling in V1)
- API: Fastify 5, Zod 3, `@fastify/multipart` for PDF upload, `pino` logging, `pg` (node-postgres) or existing db client, `crypto.randomUUID` for IDs
- Storage: PostgreSQL (schema), local filesystem under a configured `STORAGE_ROOT` for PDFs in V1 (single-tenant deploy; S3-compatible swap is a post-V1 replacement). Uploads written to `${STORAGE_ROOT}/k1/<yyyy>/<document_id>.pdf`.
- Extraction stub: in-process worker that transitions `UPLOADED → PROCESSING → NEEDS_REVIEW | READY_FOR_APPROVAL` via a deterministic mock (real extractor integration is out of scope for this feature and wired behind a `K1Extractor` interface).
**Storage**:
- Existing tables reused: `users`, `roles`, `user_roles`, `entities`, `partnerships`, `documents`, `k1_documents`, `k1_field_values`, `k1_issues`, `k1_reported_distributions`, `audit_events`
- New (added by this feature's migration): `document_versions` (supersession chain), `entity_memberships` (per-user entity entitlement), extensions to `k1_documents` (`parse_error_code`, `parse_error_message`, `parse_attempts`, `superseded_by_document_id`, `uploader_user_id`)
**Testing**: Vitest + Testing Library (web), Vitest + supertest-style HTTP contract tests (api), Playwright happy-path E2E covering upload → Uploaded row → Processing → Needs Review
**Target Platform**: Browser web UI + Linux-hosted Fastify API, same single-tenant deploy topology as Feature 001
**Project Type**: Monorepo web application (frontend + API + shared packages) — no new project boundary added
**Performance Goals**:
- SC-002: initial populated render (KPIs + first page of rows visible, interactive) < 2 s on a 1000-document fixture
- SC-010: upload → visible `Uploaded` row round trip < 5 s for a single K-1 PDF
- API listing endpoint p95 < 250 ms at 1000 rows in tenant (server-side filter + pagination)
- Upload endpoint p95 < 500 ms for a 10 MB PDF on local storage
**Constraints**:
- Manual refresh only in V1 (FR-029a); no background polling, no server push
- Authoritative lifecycle status lives on `k1_documents.processing_status`; UI never synthesizes status (FR-016)
- Parse failures remain in `Processing` (FR-017/025); a sixth badge is forbidden
- Duplicate detection on `(partnership, entity, tax_year)` with Replace/Cancel (FR-023a/b); supersession is not deletion
- KPI row scope follows Tax Year + Entity only (FR-004); Status + Search are finding-level
- Every lifecycle-changing action writes an `audit_events` row in the same transaction (fail-closed; Constitution §13, FR-036)
- Any authenticated user (`Admin` or `User`) may upload within their entity scope (FR-033a); no upload-only role in V1
- Entity scope is enforced on the server for every read, list, upload, and row action (FR-032)
**Scale/Scope**: 1–5K K-1 documents per tenant per tax year (spec Assumption). Table rendering must stay responsive via server-side pagination + row windowing, not load-all.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Primary constitutions used for gating:

- `specs/000-constitution.md` (system constitution)
- `specs/001-ui-constitution.md` (UI constitution)

### Pre-Phase 0 gate

1. **K-1 workflow invariants (000 §3)**: PASS
    - Lifecycle `UPLOADED → PROCESSING → NEEDS_REVIEW → READY_FOR_APPROVAL → FINALIZED` is honored. No state skip. Backend is authoritative; the dashboard only reflects.
2. **Data source hierarchy (000 §2)**: PASS
    - This feature only handles Parsed data (K-1 field extraction). Distinction from Manual/Calculated is preserved — no value on the dashboard is calculated client-side.
3. **System integrity (000 §13)**: PASS
    - Every lifecycle-changing action emits an audit event in the same transaction; parse failures retain attempt history; supersession is soft (retention required).
4. **Security + RBAC (000 §9, 001 §7)**: PASS
    - Route-guarded by the existing session cookie from Feature 001. All reads and writes are entity-scoped on the server; client visibility mirrors server authorization.
5. **Shared UI patterns + states (001 §3, §4, §10)**: PASS
    - All six required screen states are in scope (loading, empty, filtered-empty, error, populated, permission-restricted). Magic Patterns seed is explicitly normalized; no bespoke re-implementations.
6. **Single badge / card / toolbar system (001 §9)**: PASS
    - The refusal of a sixth status badge for parse errors is codified (FR-017); parse errors are expressed as an inline indicator on the existing `Processing` badge.
7. **Financial data integrity (000 §13, 001 §8)**: PASS
    - Finalized rows are locked; this dashboard exposes no destructive actions against them; raw vs. user-corrected field values are out of scope of this screen (rendered in the Review Workspace, Feature 003).

### Post-Phase 1 re-check

1. **Contracts enforce server-side scope + audit**: PASS — every endpoint in `contracts/k1-ingestion.openapi.yaml` has an auth requirement and returns 403 on out-of-scope entity access; mutations document the audit event they emit.
2. **Data model preserves supersession and parse-attempt history**: PASS — `document_versions` retains superseded records; `k1_documents.parse_attempts` is an append-only counter with `parse_error_code` / `parse_error_message` on the row.
3. **UI normalization honored in quickstart**: PASS — quickstart spells out the exact catalog components the screen composes and forbids local re-implementations.
4. **KPI scope split matches spec**: PASS — both data model and contract carry `tax_year` and `entity_id` as the KPI query's only scope params; `status` and `search` are absent from the KPI endpoint.

No violations; Complexity Tracking below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-k1-ingestion/
├── plan.md                          # This file (/speckit.plan command output)
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── k1-ingestion.openapi.yaml    # Phase 1 output
├── reference/
│   └── k1-dashboard.magic-patterns.tsx  # Magic Patterns seed (reference only)
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md                         # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── src/
│   │   ├── pages/
│   │   │   └── K1Dashboard.tsx                 # Route-level screen; replaces current placeholder
│   │   ├── features/
│   │   │   └── k1/
│   │   │       ├── hooks/
│   │   │       │   ├── useK1List.ts            # react-query listing hook (manual refetch)
│   │   │       │   ├── useK1Kpis.ts            # scope-only KPI hook (tax_year + entity)
│   │   │       │   ├── useK1Upload.ts          # upload mutation + duplicate handling
│   │   │       │   └── useK1Export.ts          # CSV export of current filtered result
│   │   │       ├── components/
│   │   │       │   ├── K1KpiRow.tsx            # composes KpiCard x5
│   │   │       │   ├── K1DocumentsTable.tsx    # composes DataTable + StatusBadge + RowActionMenu
│   │   │       │   ├── K1FilterBar.tsx         # composes FilterToolbar
│   │   │       │   ├── K1UploadDialog.tsx      # composes shared Dialog/FormField primitives
│   │   │       │   └── K1DuplicatePrompt.tsx   # Replace / Cancel dialog
│   │   │       └── api/
│   │   │           └── k1Client.ts             # typed fetch client over /v1/k1/*
│   │   └── components/shared/                  # AppShell, PageHeader, KpiCard, StatusBadge,
│   │                                           # FilterToolbar, DataTable, RowActionMenu,
│   │                                           # EmptyState, ErrorState, LoadingState
│   └── tests/
│       ├── k1-dashboard.spec.tsx               # states + filter behavior
│       └── k1-upload.spec.tsx                  # happy path + duplicate flow
└── api/
    └── src/
        ├── modules/
        │   ├── k1/
        │   │   ├── k1.routes.ts                # GET /v1/k1, GET /v1/k1/kpis, POST /v1/k1/upload, ...
        │   │   ├── k1.schemas.ts               # zod request/response
        │   │   ├── k1.repository.ts            # db access; entity-scoped
        │   │   ├── list.handler.ts
        │   │   ├── kpis.handler.ts
        │   │   ├── upload.handler.ts
        │   │   ├── detail.handler.ts
        │   │   ├── reparse.handler.ts
        │   │   ├── supersede.handler.ts
        │   │   ├── extraction/
        │   │   │   ├── K1Extractor.ts          # interface
        │   │   │   └── stubExtractor.ts        # deterministic V1 implementation
        │   │   └── storage/
        │   │       └── localPdfStore.ts        # filesystem-backed PDF storage
        │   └── audit/
        │       └── writeAuditEvent.ts          # same-tx audit writer (reused / extended)
        ├── infra/db/migrations/
        │   └── 002_k1_ingestion.sql            # document_versions, entity_memberships,
        │                                       # k1_documents parse_error columns
        └── tests/
            ├── k1.list.contract.test.ts
            ├── k1.kpis.contract.test.ts
            ├── k1.upload.contract.test.ts
            ├── k1.supersede.integration.test.ts
            └── k1.authz.integration.test.ts

packages/
├── types/src/
│   ├── k1-ingestion.ts                         # shared wire types (K1Document, K1Kpis, ...)
│   └── index.ts                                # re-export
└── ui/src/components/                          # catalog components (extended as needed)
    ├── RowActionMenu/
    ├── KpiCard/
    ├── DataTable/
    ├── StatusBadge/
    └── FilterToolbar/
```

**Structure Decision**: Reuse the two existing app boundaries (`apps/web`, `apps/api`) plus the shared type package. All dashboard code goes under `apps/web/src/features/k1/*` with route-level wiring in `apps/web/src/pages/K1Dashboard.tsx`. Server code groups under `apps/api/src/modules/k1/*` to mirror the auth and audit modules from Feature 001. A single new migration (`002_k1_ingestion.sql`) adds the supersession / entitlement / parse-error columns. The Magic Patterns seed is preserved under `specs/002-k1-ingestion/reference/` but is not imported from production code — per UI Constitution §10 the production implementation composes catalog components only.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
