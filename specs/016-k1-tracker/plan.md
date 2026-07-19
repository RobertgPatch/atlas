# Implementation Plan: Partnership Tracker Single-Page K-1 Entry and Overview

**Branch**: `016-k1-tracker` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)
**Input**: Revised feature specification from `/specs/016-k1-tracker/spec.md`

## Summary

Revise the implemented Partnership Tracker so one selected K-1 year is entered and edited as a continuous inline form instead of a six-step drawer and category-tab workspace. Every supported opening, K-1 box, liability, Section L, book, and reconciliation field remains grouped and sign-aware on the same page; annual navigation remains compact, but Back, Next, step tabs, and category tabs are removed.

Make `capital_contributions` the canonical annual paid-in value and project the legacy `section_l_capital_contributed` key into it only for backward-compatible provenance. Keep liability values editable and carryforward-aware, but treat them as reference-only data: they no longer affect basis, distribution limitations, warning/status aggregation, sign-off, or performance metrics. Extend the set-based Partnership Tracker summary with cumulative contributions and Box 19 distributions, latest Section L capital, NAV, outside basis, DPI, TVPI, and dated IRR. Reuse existing PostgreSQL years/revisions/NAV records, exact-money conventions, audit history, authorization, and calculation infrastructure.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, SQL for PostgreSQL migrations.
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, existing auth/session/RBAC/scope/audit modules. Web: React 19, React Router 7, TanStack Query 5, Headless UI 2, Tailwind CSS 3, lucide-react, existing native responsive SVG NAV plot.
**Storage**: Existing PostgreSQL via `DATABASE_URL`; reuse `partnerships`, `partnership_commitments`, `partnership_fmv_snapshots`, `k1_tracker_years`, `k1_tracker_value_revisions`, and `k1_tracker_signoffs`. Add `020_partnership_tracker_entry_overview.sql` only if an active-value aggregation index or compatibility metadata is required; do not add a duplicate contribution or stored-performance table.
**Testing**: Vitest API calculation/contract/integration tests; Testing Library/Vitest single-page form, overview, accessibility, and navigation tests; `npm run build:api`; `npm run build:web`; durable tests through `ATLAS_TEST_DATABASE_URL`.
**Target Platform**: Existing Atlas browser app and Fastify API; local Docker PostgreSQL and deployed durable PostgreSQL.
**Project Type**: Monorepo web application with backend API, React frontend, shared TypeScript wire contracts, and SQL migrations.
**Performance Goals**: A 100-row scoped picker and selected partnership with 50 K-1 years, 50 commitments, and 200 NAV entries become usable within 2 seconds; one selected year with all supported inputs renders without interaction-driven field loading; overview aggregation uses one set-based server composition.
**Constraints**: Manual K-1 entry only; one primary year; no annual wizard/category navigation; no Next button; exact decimal-string money; fixed-decimal ratio strings; missing differs from zero; liabilities are display-only for calculation purposes; canonical contributions must never double count legacy Section L values; no browser/process-memory source of truth.
**Scale/Scope**: Internal Atlas users, hundreds of partnerships, up to 50 K-1 years and dozens of fields per year, one annual entry page, up to 50 commitment changes and 200 NAV observations per partnership, and compatibility with existing routes and historical revisions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific gates. Applied repository-local and financial-workflow gates:

1. **Existing stack and boundaries**: PASS. Work stays inside current Fastify, React, shared types, and migration boundaries.
2. **One durable source of truth**: PASS. Active K-1 revisions and latest NAV produce the summary; no duplicate performance or contribution store is introduced.
3. **Scoped authorization**: PASS. Existing entity scope and Admin-only mutation rules remain unchanged.
4. **Financial correctness**: PASS. Contribution/distribution formulas, ratio denominators, IRR dates, liability exclusion, null states, and deterministic ordering are explicit.
5. **Auditability**: PASS. Legacy contribution revisions are retained; edits continue to append revisions with actor/time evidence.
6. **Focused UI and accessibility**: PASS. One grouped form removes hidden step state while retaining keyboard navigation, visible labels, focus management, and unsaved-change protection.
7. **Backward compatibility**: PASS. The legacy contribution key remains readable, existing API/data routes remain compatible, and no historical values are destructively rewritten.
8. **Infrastructure restraint**: PASS. The design composes existing rows and extends the versioned calculation engine without a new service or persistence layer.
9. **Testing coverage**: PASS. The plan covers all-field editing, no-Next behavior, duplicate-key projection, liability exclusion, metric formulas/unavailable states, stale writes, accessibility, and performance-sized fixtures.

### Post-Phase 1 Re-check

Re-evaluated after updating [research.md](./research.md), [data-model.md](./data-model.md), [contracts/k1-tracker.openapi.yaml](./contracts/k1-tracker.openapi.yaml), and [quickstart.md](./quickstart.md). Result: **PASS**.

- Research resolves the single-page interaction, canonical contribution, liability boundary, and dated performance formulas.
- The data model keeps one active financial source per concept and defines compatibility behavior without deleting provenance.
- The contract extends the composed summary with exact ratios and explicit availability status.
- The quickstart verifies one-screen entry, no category/step controls, cumulative metrics, liability exclusion, and legacy contribution handling.

## Project Structure

### Documentation (this feature)

```text
specs/016-k1-tracker/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- k1-tracker.openapi.yaml
|-- checklists/
|   `-- requirements.md
`-- tasks.md                 # regenerated separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
|-- src/
|   |-- infra/db/migrations/
|   |   `-- 020_partnership_tracker_entry_overview.sql
|   |-- modules/k1-tracker/
|   |   |-- k1-tracker.calculation.ts       # liability-free calculation version
|   |   |-- k1-tracker.field-map.ts         # canonical/deprecated field metadata
|   |   |-- k1-tracker.repository.ts        # legacy contribution projection
|   |   |-- k1-tracker.contracts.ts
|   |   `-- k1-tracker.zod.ts               # reject deprecated writes
|   `-- modules/partnership-tracker/
|       |-- partnership-tracker.repository.ts # set-based performance summary
|       |-- partnership-tracker.contracts.ts
|       `-- partnership-tracker.zod.ts
`-- tests/
    |-- partnership-tracker.calculation.test.ts
    |-- partnership-tracker.contract.test.ts
    |-- partnership-tracker.lifecycle.integration.test.ts
    `-- partnership-tracker.persistence.integration.test.ts

apps/web/src/features/
|-- k1-tracker/components/
|   |-- K1YearEntryForm.tsx                 # single canonical annual form
|   |-- K1YearResults.tsx                   # derived schedules below the form
|   `-- LiabilitiesPanel.tsx                # manual-reference wording
`-- partnership-tracker/
    |-- components/
    |   |-- K1BasisWorkspace.tsx            # inline selected-year editing
    |   |-- PartnershipOverview.tsx         # reference-aligned metric strip
    |   `-- PerformanceMetricStrip.tsx
    `-- __tests__/
        |-- ManualK1Editor.test.tsx
        |-- ManualK1Workflow.test.tsx
        |-- PartnershipTrackerPageContent.test.tsx
        `-- PartnershipTrackerAccessibility.test.tsx

packages/types/src/
|-- k1-tracker.ts                           # canonical/deprecated field types
`-- partnership-tracker.ts                  # performance summary contract
```

**Structure Decision**: Keep the implemented Partnership Tracker vertical and K-1 calculation module. Replace the current `EditYearDrawer` and `SelectedYearTabs` interaction with an inline `K1YearEntryForm` plus derived results on the same selected-year page. Extend the existing composed summary query rather than calling every year from the browser. Keep deprecated contribution revisions in storage while narrowing the mutation vocabulary to the canonical key.

## Phase 0: Research Outcomes

1. Use one inline annual form with grouped headings and one action row; remove step/category tabs, Back, Next, and the primary editor drawer.
2. Keep one selected year and compact year navigation rather than making all years editable simultaneously.
3. Make `capital_contributions` canonical for outside basis, Section L, cumulative paid-in capital, DPI, TVPI, and IRR.
4. Project `section_l_capital_contributed` only when canonical data is absent; canonical wins conflicts, and mismatches remain visible for manual resolution.
5. Store and show liabilities as raw annual reference values, but exclude them from every calculated sum, status gate, and performance metric.
6. Sum absolute Box 19 distributions and canonical contributions across all active saved years.
7. Compute DPI and TVPI from K-1 aggregates and latest NAV, never from committed capital or legacy capital-activity rows.
8. Compute dated IRR with year-end K-1 cash flows and exact-date terminal NAV; return a reasoned null for unsupported series.
9. Mirror the compact per-partnership metric hierarchy in `IMG_3797.heic` without copying its separate portfolio/fund-list shell.

## Phase 1: Design Outcomes

- Add nullable `totalCapitalContributions` and `totalDistributions` plus `latestSectionLCapital`, `dpi`, `tvpi`, `irr`, and per-metric `performanceStatus` to `PartnershipTrackerSummary`; preserve missing-versus-explicit-zero semantics.
- Return money as exact two-decimal strings and ratios as fixed-decimal strings representing unit ratios; format DPI/TVPI with `x` and IRR as a percentage in the web client.
- Aggregate active revisions in a set-based lateral/CTE query, resolving canonical contribution values once per year and never issuing N+1 year requests.
- Version the calculation behavior so liabilities still appear in `LiabilityAnalysis` but contribute zero to basis/distribution arithmetic and no longer affect warnings or sign-off.
- Render all editable annual fields in document-oriented order: opening/capital, K-1 boxes, distributions/deductions, liabilities, Section L, then book-tax reconciliation.
- Keep preview and save mutations unchanged at the route level; send one change set from the continuous form using the existing expected revision.
- Preserve unsaved-change prompts for year, partnership, top-level area, and route navigation.
- Add compatibility tests for legacy contribution-only, equal duplicate, and conflicting duplicate records.

## Complexity Tracking

No constitution violations are introduced. The performance summary adds derived fields to the existing scoped read model, and the canonical contribution projection is limited to the established revision boundary. IRR is the only iterative calculation; it remains a pure, deterministic server utility with explicit unavailable states and no persisted cache.
