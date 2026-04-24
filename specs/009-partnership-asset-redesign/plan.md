# Implementation Plan: Partnership Asset Redesign

**Branch**: `009-partnership-asset-redesign` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-partnership-asset-redesign/spec.md`

## Summary

Extend the existing Feature 004 Partnership Detail route into an asset-aware workspace without changing Atlas's partnership-first navigation. The implementation adds subordinate partnership asset records, append-only asset FMV snapshots, a new Assets section with asset-rollup KPIs, Admin-only add-asset and add-asset-FMV flows, and an in-page asset drawer that lazily loads full valuation history while preserving the current K-1, distribution, and partnership-level FMV sections. Delivery reuses the existing `apps/web` React 19 + Tailwind + TanStack Query shell, the existing `apps/api` Fastify + Zod + `pg` partnerships module, the current entity-scope plugin, shared wire types in `packages/types`, and the same audit-event and append-only valuation patterns already established by Feature 004.

## Technical Context

**Language/Version**: TypeScript (`^5.7` API, `~6.0.2` web), Node.js 22 LTS runtime, SQL for PostgreSQL 15+  
**Primary Dependencies**:  
- Web: React 19, React Router 7, Vite 8, Tailwind CSS 3, Headless UI 2, Framer Motion 12, `@tanstack/react-query` 5, Lucide React  
- API: Fastify 5, Zod 3, `pg` 8, `dotenv`, `crypto.randomUUID`; reuse the existing `withSession`, `requireAuthenticated`, and `requirePartnershipScope` patterns  
- Shared: `packages/types/src/partnership-management.ts` extended with asset and asset-FMV wire shapes  
**Storage**: PostgreSQL tables `partnerships`, `partnership_fmv_snapshots`, `audit_events`, new `partnership_assets`, new `partnership_asset_fmv_snapshots`; API keeps the existing in-memory fallback shape for local no-DB runs  
**Testing**: Vitest for API contract/integration tests and web unit/state tests, React Testing Library + jsdom for screen behavior, focused regression coverage for asset rollup, duplicate prevention, RBAC, and append-only valuation history  
**Target Platform**: Browser web UI plus Fastify API, same single-tenant deployment topology used by Features 001-004  
**Project Type**: Monorepo web application (frontend + API + shared packages)  
**Performance Goals**:  
- Partnership Detail initial render with asset rows visible in under 1.5 s for a partnership with up to 25 assets  
- Asset drawer open with history visible in under 500 ms for an asset with up to 20 FMV snapshots  
- Asset add / FMV record mutations reflect in the parent page without a manual reload and settle within 1 s after the API response  
- Asset rollup query path stays under 250 ms p95 at tenant scale  
**Constraints**:  
- Partnership Detail remains the only primary asset workflow; no new top-level asset route or disconnected asset workspace  
- Asset rows load with the Partnership Detail page, but full asset history is lazy-loaded only when a drawer opens  
- Manual asset creation and manual FMV entry are complete workflows with no Plaid dependency  
- Asset FMV snapshots are append-only, can share a valuation date, allow zero, reject negative amounts, and reject future-dated valuations  
- Duplicate assets are blocked within a partnership by normalized asset name plus asset type  
- Existing partnership-level FMV remains visible and separate from asset rollup values  
- New UI must stay inside Atlas's React + Tailwind + shared-component patterns and must not introduce Material UI usage for this feature  
**Scale/Scope**: 100-2K partnerships per tenant, 0-25 assets per partnership, 0-20 asset FMV snapshots per asset, narrow-viewport responsive support, Admin-only writes with User read-only visibility in scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Primary constitutions and conventions used for gating:

- `.specify/memory/constitution.md` is currently an unfilled template and is not independently enforceable
- `specs/001-ui-constitution.md`
- Features 001-004 repository conventions for session auth, entity scoping, audit events, append-only valuation history, and shared page composition

### Pre-Phase 0 gate

1. **Partnership-first navigation and information hierarchy**: PASS
  - The feature augments the existing Partnership Detail route and does not create a peer asset workspace. Assets stay subordinate to a partnership and open in a drawer within that route.
2. **Shared UI patterns and required screen states**: PASS
  - The planned UI composes existing `PageHeader`, `KpiCard`, `SectionCard`, `EmptyState`, `ErrorState`, `LoadingState`, and shared action/dialog patterns. The Assets section explicitly covers loading, empty, error, populated, partial, and permission-limited states.
3. **RBAC and entity scope integrity**: PASS
  - Asset reads inherit parent partnership scope. Asset create and asset FMV create remain Admin-only in both UI and API with authoritative server `403` responses.
4. **Auditability and append-only financial history**: PASS
  - New writes emit `partnership.asset.created` and `partnership.asset.fmv_recorded` audit events. Asset FMV is append-only with no edit/delete path.
5. **Financial context separation**: PASS
  - The design keeps asset-rollup FMV and partnership-level FMV as separate labeled valuation contexts and does not auto-reconcile or overwrite either.

### Post-Phase 1 re-check

Re-evaluated after the design artifacts below were written. Result: **PASS**.

- `data-model.md` keeps assets subordinate to partnerships, preserves append-only valuation semantics, and reuses the existing audit/scope patterns.
- `contracts/partnership-assets.openapi.yaml` adds only partnership-scoped asset interfaces; no new top-level asset workspace or unconstitutional UI/API boundary appears.
- `quickstart.md` validates the required UI-state and RBAC behavior without introducing any parallel workflow.

## Project Structure

### Documentation (this feature)

```text
specs/009-partnership-asset-redesign/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── partnership-assets.openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md              # Created later by /speckit.tasks
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/
│       ├── infra/db/
│       │   ├── migrations/
│       │   │   └── 009_partnership_assets.sql
│       │   └── seed/
│       │       └── 004_partnership_fixtures.ts         # extended with assets + asset FMV fixtures
│       ├── modules/
│       │   └── partnerships/
│       │       ├── partnerships.routes.ts              # extend with asset endpoints
│       │       ├── partnerships.handler.ts             # keep parent detail endpoint focused on partnership context
│       │       ├── partnerships.repository.ts          # extend read model where needed
│       │       ├── assets.handler.ts                   # list/create asset rows under a partnership
│       │       ├── assets.repository.ts                # asset list/detail/create + duplicate detection
│       │       ├── assets.zod.ts                       # asset request/response schemas
│       │       ├── assetFmv.handler.ts                 # list/create asset valuation history
│       │       ├── assetFmv.repository.ts              # append-only asset FMV access
│       │       └── partnershipScope.plugin.ts          # reused for inherited entity scope
│       └── tests/
│           ├── assets.list.contract.test.ts
│           ├── assets.create.contract.test.ts
│           ├── asset-detail.contract.test.ts
│           ├── asset-fmv.create.contract.test.ts
│           ├── asset-fmv.append-only.integration.test.ts
│           └── partnership-asset-rollup.integration.test.ts
└── web/
   └── src/
      ├── pages/
      │   └── PartnershipDetail.tsx                   # existing route extended with Assets section and drawer state
      ├── features/
      │   └── partnerships/
      │       ├── api/
      │       │   ├── partnershipsClient.ts
      │       │   └── assetsClient.ts
      │       ├── hooks/
      │       │   ├── usePartnershipQueries.ts
      │       │   ├── useAssetQueries.ts
      │       │   └── useAssetMutations.ts
      │       └── components/
      │           ├── AssetsSection.tsx
      │           ├── AddAssetDialog.tsx
      │           ├── AssetDetailDrawer.tsx
      │           ├── AssetValuationHistory.tsx
      │           └── RecordAssetFmvDialog.tsx
      └── App.tsx                                     # existing partnership route remains the entry point

packages/
├── types/
│   └── src/
│       └── partnership-management.ts                  # extend with asset shapes
└── ui/
   └── src/components/                                # reuse shared UI patterns; no new framework introduced
```

**Structure Decision**: Extend the existing partnerships vertical rather than creating a new asset feature boundary. The backend keeps assets inside `apps/api/src/modules/partnerships/` because asset visibility and writes are always partnership-scoped. The frontend keeps the work inside the current Partnership Detail route and `features/partnerships/` module, with a new Assets section, Admin dialogs, and a lazy asset drawer. Shared wire types stay in the existing `partnership-management.ts` domain file so the asset model evolves alongside the already-shipped partnership detail contract.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                   |

## Phase Outputs

- **Phase 0 (research)**: [research.md](./research.md) — records the decisions on new asset tables, asset-row loading strategy, uniqueness enforcement, append-only asset FMV semantics, server-side rollup derivation, and source modeling.
- **Phase 1 (design + contracts)**:
  - [data-model.md](./data-model.md) — defines the subordinate asset model, asset FMV snapshot model, read shapes, invariants, and migration summary.
  - [contracts/partnership-assets.openapi.yaml](./contracts/partnership-assets.openapi.yaml) — documents the new partnership-scoped asset and asset-FMV interfaces.
  - [quickstart.md](./quickstart.md) — validates the four user stories against a local dev stack.

## Progress Tracking

- [x] Spec available and clarified (8/8 decisions captured on 2026-04-23)
- [x] Pre-Phase 0 Constitution Check: PASS
- [x] Phase 0 research drafted
- [x] Phase 1 data-model drafted
- [x] Phase 1 contracts drafted
- [x] Phase 1 quickstart drafted
- [x] Agent context updated (`.github/copilot-instructions.md` SPECKIT block points at Feature 009 artifacts)
- [x] Post-Phase 1 Constitution Check: PASS
