# Implementation Plan: Partnership Tracker Revisions

**Branch**: `017-partnership-tracker-revisions` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-partnership-tracker-revisions/spec.md`

## Summary

Revise Partnership Tracker performance reporting so IRR is displayed to one-hundredth of a percentage point and remains available when the latest NAV predates newer cash flows. Carry the latest NAV amount forward only inside the IRR terminal series while retaining its actual valuation date. Add server-derived annualized cash-on-cash yield, unfunded commitment amount/percentage, and unrealized gain from canonical K-1, commitment, NAV, inception, and outside-basis records. Remove duplicate NAV presentation and make Compare Years show Capital Contributed, Distributions, and Ending Outside Basis across the full available history in an adaptive layout that fits first and scrolls only when readable columns cannot fit.

Extend partnership configuration with an economic inception date and annual management-fee rate. Calculate a transparent day-prorated fee schedule from effective-dated commitments without writing estimates into K-1 records. Split K-1 Line 13 into Other Portfolio Deductions and Management Fees, with a presence-based legacy fallback that preserves historical combined values without double-counting. Rename tracker UI labels, add a URL-addressable Underlying Assets coming-soon tab, repair database-backed owner rename, and allow atomic owner reassignment with child-scope propagation, sign-off invalidation, audit evidence, and cache refresh.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, PostgreSQL SQL migrations.
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, existing session/RBAC/scope/audit and tracker calculation modules. Web: React 19, React Router 7, TanStack Query 5, Tailwind CSS 3, Headless UI 2, lucide-react, existing shared UI components.
**Storage**: Existing PostgreSQL tables. Migration `021_partnership_tracker_revisions.sql` adds nullable `partnerships.inception_date` and `partnerships.management_fee_rate`; K-1 Line 13 continues in append-only `k1_tracker_value_revisions`. No performance or fee-results table.
**Testing**: Vitest pure calculation and API contract tests; PostgreSQL integration tests via `ATLAS_TEST_DATABASE_URL`; React Testing Library/Vitest responsive, accessibility, cache, form, and navigation tests; full API/web suites and builds.
**Target Platform**: Existing Atlas browser application and Fastify API, local Docker PostgreSQL, and AWS staging/production PostgreSQL deployments.
**Project Type**: npm-workspace monorepo with Fastify backend, React frontend, shared TypeScript wire contracts, and versioned SQL migrations.
**Performance Goals**: A 200-partnership scoped list with derived metrics remains a set-based read; a selected partnership with 50 years, 100 commitment changes, and 200 NAV rows becomes usable within 2 seconds; a 50-year comparison opens from the existing detail payload without per-year network requests; management-fee calculation is linear in commitment segments.
**Constraints**: Exact decimal-string money; fixed-decimal unit ratios; one-hundredth percentage display; missing differs from zero; no false NAV source records; canonical K-1 contributions remain the paid-in source; Compare Years contains exactly three financial rows and scrolls only after 12rem/8rem minimum columns cannot fit; fee estimates remain separate from actual K-1 values; owner reassignment is all-or-nothing; historical revisions/sign-offs/audit remain append-only; no new service or browser source of truth.
**Scale/Scope**: Internal Atlas users, hundreds of partnerships, up to 50 K-1 years and 100 effective-dated commitments per partnership, two new partnership configuration fields, six revised summary metrics/statuses, two new K-1 keys, one new read endpoint, and focused owner administration changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still an unfilled template and defines no enforceable project-specific principles. Applied repository-local and financial-workflow gates:

1. **Existing stack and module ownership**: PASS. Work remains in current Partnership Tracker, K-1 Tracker, partnership/entity, shared types, web feature, and migration boundaries.
2. **One durable source of truth**: PASS. PostgreSQL is canonical in deployed mode; derived metrics and fee schedules are not stored; owner names remain normalized references.
3. **Financial correctness**: PASS. IRR terminal convention, percentage precision, cash-on-cash annualization, signed unfunded/unrealized formulas, Line 13 fallback, and fee day-count rules are explicit.
4. **Missing-versus-zero semantics**: PASS. Every nullable metric has a reasoned availability state, including zero-denominator and absent-source cases.
5. **Auditability and provenance**: PASS. Actual NAV dates, legacy Line 13 revisions, resource IDs, sign-off history, and before/after owner evidence are preserved.
6. **Scoped authorization**: PASS. Existing authenticated reads, Admin mutation checks, owner membership scope, and target-owner validation remain mandatory.
7. **Concurrency and atomicity**: PASS. Partnership edits retain `expectedUpdatedAt`; owner moves update all duplicated scope rows and invalidations in one transaction with rollback coverage.
8. **Backward compatibility**: PASS. Changes are additive; old Line 13 and `NAV_PRECEDES_CASH_FLOWS` payloads remain readable during rollout; no existing value is destructively rewritten.
9. **Focused and accessible UI**: PASS. Compare Years uses the viewport before table-only overflow, stable minimum columns, sticky labels, bounded vertical layout, and exactly three requested rows; compact tracker metrics avoid duplicate NAV; placeholder navigation has no misleading controls.
10. **Testing coverage**: PASS. The plan includes deterministic formula, compatibility, durable transaction, cache propagation, responsive layout, accessibility, and full regression gates.

### Post-Phase 1 Re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/partnership-tracker-revisions.openapi.yaml](./contracts/partnership-tracker-revisions.openapi.yaml), and [quickstart.md](./quickstart.md). Result: **PASS**.

- Research resolves every product ambiguity with formulas, source precedence, date conventions, and rejected alternatives.
- The data model adds only two nullable partnership columns and maps every duplicated owner scope row required for atomic reassignment.
- The contract is additive, keeps exact financial types, exposes explicit calculation dates and availability metadata, and adds nullable annual contribution/distribution fields to the existing year summary.
- The quickstart verifies older NAV, cent/day precision, legacy Line 13 compatibility, four-year fit, long-history overflow, complete comparison visibility, owner propagation, rollback, authorization, and cache refresh.

## Project Structure

### Documentation (this feature)

```text
specs/017-partnership-tracker-revisions/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- partnership-tracker-revisions.openapi.yaml
`-- tasks.md                 # created separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
|-- src/
|   |-- infra/db/migrations/
|   |   `-- 021_partnership_tracker_revisions.sql
|   |-- modules/partnership-tracker/
|   |   |-- partnership-performance.ts       # precise IRR and new summary metrics
|   |   |-- management-fee.ts                # pure day/commitment segment calculation
|   |   |-- partnership-tracker.repository.ts # summary, fee read, owner move transaction
|   |   |-- partnership-tracker.handler.ts
|   |   |-- partnership-tracker.routes.ts
|   |   |-- partnership-tracker.contracts.ts
|   |   `-- partnership-tracker.zod.ts
|   |-- modules/k1-tracker/
|   |   |-- k1-tracker.calculation.ts        # effective split Line 13 calculation
|   |   |-- k1-tracker.field-map.ts          # labels/version/deprecation
|   |   |-- k1-tracker.contracts.ts
|   |   `-- k1-tracker.zod.ts
|   `-- modules/partnerships/
|       `-- entities.admin.routes.ts          # database-canonical rename
`-- tests/
    |-- partnership-tracker.performance.test.ts
    |-- partnership-tracker.performance.integration.test.ts
    |-- partnership-tracker.contract.test.ts
    |-- partnership-tracker.lifecycle.integration.test.ts
    |-- partnership-tracker.persistence.integration.test.ts
    |-- partnership-tracker.authz.integration.test.ts
    |-- k1-tracker.calculation.test.ts
    |-- k1-tracker.contract.test.ts          # comparison fields and null/zero semantics
    `-- entities.detail.contract.test.ts

apps/web/src/
|-- pages/
|   `-- EntitiesPage.tsx                     # rename error handling remains visible
`-- features/
    |-- partnership-tracker/
    |   |-- api/partnershipTrackerClient.ts
    |   |-- hooks/usePartnershipTracker.ts
    |   |-- components/
    |   |   |-- PartnershipTrackerPageContent.tsx
    |   |   |-- PartnershipOverview.tsx
    |   |   |-- PerformanceMetricStrip.tsx
    |   |   |-- ManagementFeePanel.tsx
    |   |   |-- UnderlyingAssetsPlaceholder.tsx
    |   |   |-- AddPartnershipDialog.tsx
    |   |   |-- EditPartnershipDialog.tsx
    |   |   `-- CompareYearsDrawer.tsx
    |   `-- __tests__/
    |       |-- PartnershipTrackerPerformance.test.tsx
    |       |-- PartnershipTrackerPageContent.test.tsx
    |       |-- PartnershipTrackerNavigation.test.tsx
    |       |-- PartnershipCreationFlow.test.tsx
    |       |-- PartnershipTrackerAccessibility.test.tsx
    |       `-- partnershipTrackerClient.test.ts
    |-- k1-tracker/
    |   |-- k1FieldGroups.ts
    |   |-- components/CompareYearsDrawer.tsx
    |   `-- __tests__/CompareYearsDrawer.test.tsx
    `-- partnerships/
        |-- api/entitiesClient.ts
        |-- hooks/useEntityQueries.ts
        `-- components/
            |-- AddPartnershipDialog.tsx
            `-- EditPartnershipDialog.tsx

packages/types/src/
|-- k1-tracker.ts                           # split Line 13 and comparison summary fields
`-- partnership-tracker.ts                  # identity, metrics, fee schedule, owner update
```

**Structure Decision**: Extend the existing vertical modules rather than create a new feature service. Keep all financial math in pure API utilities, compose compact metrics in the existing set-based summary, load the fee schedule only for Capital & NAV, and reuse the partnership PATCH transaction for configuration and owner reassignment. Update both consolidated tracker and remaining shared partnership dialogs where the same create/edit owner language is presented.

## Phase 0: Research Outcomes

1. Serialize IRR with at least eight decimal ratio places and display exactly two decimal percentage places.
2. Carry latest NAV amount to the later terminal cash-flow date inside IRR only; retain actual NAV date and expose carry-forward metadata.
3. Calculate annualized cash-on-cash from cumulative distributions, canonical paid-in capital, and actual elapsed years from partnership inception to server as-of date.
4. Derive signed unfunded commitment and unrealized gain in the existing server summary with explicit unavailable states.
5. Store nullable inception date and management-fee unit rate on `partnerships`; do not use `created_at` as inception.
6. Calculate management-fee estimates by calendar-year and effective-commitment segments with actual 365/366 denominators; never persist estimates or copy them into K-1.
7. Add two Line 13 field keys and use presence-based fallback to the legacy combined key only when neither new key has an active revision.
8. Remove the Compare Years selection cap, add annual Capital Contributed and Distributions to the existing year summary, show exactly those values plus Ending Outside Basis, and use a fit-before-scroll 12rem/8rem column layout with bounded overflow.
9. Keep Entity as the internal model but use Owner in partnership UI; make PostgreSQL canonical for deployed entity rename.
10. Reassign owner by updating the partnership plus seven duplicated-scope tables in one transaction, then increment/review tracker years and append invalidations.
11. Keep NAV in the performance strip, remove its duplicate overview card, rename `K1 Entry`, and add a nonfunctional `area=assets` placeholder.

## Phase 1: Design Outcomes

- Migration 021 adds only `inception_date` and `management_fee_rate` with a rate-range constraint; existing rows remain valid and are not backfilled from application timestamps.
- `PartnershipTrackerSummary` gains annualized cash-on-cash, unfunded amount/percentage, unrealized gain, IRR terminal metadata, performance as-of date, and per-metric status.
- `PartnershipTrackerIdentity` and PATCH gain nullable inception/rate plus optional `entityId`; the existing timestamp token covers all edits.
- A detail-only management-fee endpoint accepts optional `asOfDate` and returns configuration, availability, annual schedule, and cumulative estimate.
- Summary aggregation remains one set-based database read; no browser loop fetches every K-1 year to calculate metrics.
- The IRR utility remains deterministic and reports insufficient/ambiguous series; older NAV is no longer an unavailable reason.
- K-1 calculation versioning makes split Line 13 effective across deduction pool, basis, Section L, book-tax, and journal output without changing Box 18C or liability rules.
- Owner reassignment locks and validates source/target rows, duplicate name, scope, and expected timestamp before changing any child scope.
- Owner rename and reassignment invalidate all relevant TanStack Query families, including both source and target owner detail.
- `K1TrackerYearSummary` additively returns nullable `capitalContributed` and `distributions`; Compare Years keeps one or more selected years, displays all by default, and needs no per-year detail fetches.
- Responsive and accessibility verification covers four-year no-scroll fit, long-history table-only overflow, 12rem/8rem minimum tracks, complete three-row visibility, nonoverlapping controls, focus/dialog behavior, tooltips/status text, and the Underlying Assets tab URL.

## Implementation Sequence

1. Add shared contract types and Migration 021 so API and web compile against the final additive shapes.
2. Implement pure performance and management-fee calculations with deterministic unit tests before repository composition.
3. Add split Line 13 normalization and calculation-version tests, then extend field maps and editor groups.
4. Extend summary/detail/fee routes and durable repository tests, including older NAV and missing-input states.
5. Replace the entity rename deployed write path with database-canonical transaction logic and add duplicate/not-found tests.
6. Implement owner reassignment transaction, revision/sign-off invalidation, audit payload, rollback, scope, and conflict tests.
7. Update web clients/caches, owner selectors, revised metrics, fee section, the three-row adaptive Compare Years layout, tab labels, and placeholder.
8. Run focused suites, full API/web tests, builds, migration startup, and desktop/mobile browser verification from the quickstart.

## Complexity Tracking

No constitution violations are introduced. The only new pure module is the management-fee segment calculator because day-count and effective-commitment arithmetic is independently testable and would otherwise complicate the repository. The dedicated fee read endpoint avoids bloating every list response. Two nullable comparison fields are added to the existing year summary instead of introducing a comparison endpoint or N+1 detail reads. Additive owner-scope updates are required by the existing denormalized schema and stay inside one established partnership transaction rather than adding a synchronization service.
