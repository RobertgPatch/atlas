# Implementation Plan: Cash-Flow-Sourced Overview and Private Investment Tracker

**Branch**: `020-overview-logic-from-cashflow` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-overview-logic-from-cashflow/spec.md`

## Summary

Make dated operational records—not K-1 values—the canonical source for partnership investment performance. Refactor the current partnership summary projection and performance composer to use only `capital_activity_events`, effective `partnership_commitments`, and `partnership_fmv_snapshots`; treat recallable distributions as XIRR cash inflows and commitment increases while excluding them from DPI/TVPI.

Add an authenticated, default `/private-investment-tracker` page modeled on `Private_Investment_Metrics.xlsx`. One scoped API response supplies a bottom, newest-first ledger of cash activity and valuations plus lifetime summary rows keyed by entity and partnership for every position represented by the filtered ledger. The bottom section owns type/entity/fund/date/amount filters and pagination; the top section has no independent filters. Add a server-generated, column-selectable landscape PDF so the complete filtered result—not only the visible page—can be downloaded as a C-suite artifact.

## Technical Context

**Language/Version**: TypeScript (`^5.7.2` API, `~6.0.2` web), Node.js 22+, PostgreSQL SQL reads.
**Primary Dependencies**: API: Fastify 5, Zod 3, `pg` 8, existing session/RBAC/scope middleware, exact-money helpers and XIRR solver, plus a focused server PDF renderer such as PDFKit for binary export. Web: React 19, React Router 7, TanStack Query 5, Tailwind CSS 3, Headless UI 2 Combobox/Dialog, Framer Motion 12, Lucide, and existing Jackson shared components.
**Storage**: Existing PostgreSQL `partnerships`, `entities`, `capital_activity_events`, `partnership_commitments`, and `partnership_fmv_snapshots`. K-1 tables remain tax-only inputs and are excluded from investment projections. No new summary table or event duplication.
**Testing**: Vitest pure financial/projection tests; PostgreSQL integration, authorization, filter, pagination, export, and performance tests via `ATLAS_TEST_DATABASE_URL`; React Testing Library/Vitest for URL state, autocomplete/range filters, top/bottom synchronization, PDF selection/download, routing, cache invalidation, responsive layout, and accessibility; API/web builds.
**Target Platform**: Existing Jackson browser application and Fastify `/v1` API, local Docker PostgreSQL, and AWS staging/production PostgreSQL.
**Project Type**: npm-workspace monorepo with Fastify backend, React frontend, shared TypeScript wire contracts, and versioned SQL migrations.
**Performance Goals**: A scoped request covering 500 entity-fund positions and 10,000 activity/valuation rows returns the first detail page, complete matching lifetime summaries, and facets within 2 seconds; PDF generation covers that fixture without per-position reads.
**Constraints**: Exact decimal-string money; fixed-decimal ratios; missing differs from zero; calls display as outflows but store/aggregate as positive magnitudes; recallable distributions affect commitment and XIRR but not DPI/TVPI; latest NAV is never synthesized from paid-in capital; filters are applied after scope and before position membership; top metrics remain lifetime values; no K-1 fallback; no browser financial source of truth; complete filtered PDF export; no page-level horizontal overflow.
**Scale/Scope**: Internal Jackson users, hundreds of owner-specific partnership positions, up to 10,000 operational rows in the primary test fixture, one new page/route, one read endpoint, one PDF endpoint, six filter dimensions, two workbook-inspired tables, and focused changes to Overview, navigation, routing, caching, and tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific principles. Applied repository-local and financial-workflow gates:

1. **Existing stack and module ownership**: PASS. The work extends the current Partnership Tracker API/web feature, shared contracts, routing, and shell; only a focused PDF renderer is added for a requirement the current stack cannot fulfill as a direct download.
2. **One durable source of truth**: PASS. Existing operational PostgreSQL records remain canonical. Summary rows, facets, return metrics, ledger rows, and PDFs are derived reads and are not persisted.
3. **Tax/operational separation**: PASS. K-1 values remain tax-basis and reconciliation inputs. Investment metrics have no K-1 fallback or write-back.
4. **Financial correctness**: PASS. Exact cents, explicit sign rules, separate recallable/non-recallable totals, availability states, current effective commitment, real NAV, and exact-dated XIRR are specified.
5. **Scoped authorization**: PASS. Entity scope is applied before filters, facets, summaries, pagination, and export; client-supplied rows/totals are never trusted.
6. **Deterministic query behavior**: PASS. Normalized URL/API filters, inclusive ranges, stable event tie-breaking, and server-side pagination are defined.
7. **Cross-view consistency**: PASS. Overview, current aggregation, and Private Investment Tracker share the operational performance composer and invalidation family.
8. **Backward compatibility**: PASS. New routes/contracts are additive. Existing K-1 editing and tax fields remain available, and valid protected deep links keep their destination.
9. **Focused and accessible UI**: PASS. The workbook is a model, not a pixel clone; Jackson styling, autocomplete semantics, keyboard focus, table-local overflow, responsive controls, and reduced motion remain required.
10. **Performance and test discipline**: PASS. Set-based reads, no N+1 loops, bounded pagination, export model tests, exact finance fixtures, scope leakage checks, and 500-position/10,000-row timing are explicit.

### Post-Phase 1 Re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/private-investment-tracker.openapi.yaml](./contracts/private-investment-tracker.openapi.yaml), and [quickstart.md](./quickstart.md). Result: **PASS**.

- Research resolves the operational source policy, recallable treatment, entity-fund identity, filter-to-summary relationship, amount semantics, PDF generation, routing, caching, and schema choices.
- The data model uses existing persisted records and introduces only read projections, normalized query state, availability metadata, and export request/report models.
- The API contract scopes both endpoints, validates ranges and column identifiers, paginates only detail rows, returns complete matching lifetime positions, and generates the PDF from server-reloaded data.
- The quickstart verifies K-1 disagreement, no-fallback behavior, recallable commitment handling, exact ratios/XIRR inputs, full-history summary semantics under filters, scope, URL restoration, complete PDF output, routing, responsive behavior, and performance.

## Project Structure

### Documentation (this feature)

```text
specs/020-overview-logic-from-cashflow/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- private-investment-tracker.openapi.yaml
`-- tasks.md                                  # created separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
|-- package.json                              # focused PDF renderer dependency
|-- src/modules/partnership-tracker/
|   |-- partnership-performance.ts            # operational-only totals, ratios, XIRR, simplified return
|   |-- private-investment-tracker.ts          # pure row mapping, filtering, facets, position composition
|   |-- private-investment-tracker.pdf.ts      # validated report model and landscape PDF rendering
|   |-- partnership-tracker.contracts.ts       # API-local tracker query/response/export mirrors
|   |-- partnership-tracker.repository.ts      # shared operational projection and private tracker reads
|   |-- partnership-tracker.zod.ts             # filter/range/page/PDF-column validation
|   |-- partnership-tracker.handler.ts         # read and PDF download handlers
|   `-- partnership-tracker.routes.ts           # private-investments and PDF routes
`-- tests/
    |-- partnership-tracker.performance.test.ts
    |-- partnership-tracker.performance.integration.test.ts
    |-- private-investment-tracker.test.ts
    |-- private-investment-tracker.integration.test.ts
    |-- private-investment-tracker.authz.integration.test.ts
    |-- private-investment-tracker.pdf.test.ts
    `-- private-investment-tracker.performance.integration.test.ts

apps/web/src/
|-- App.tsx                                   # protected route and authenticated dashboard default
|-- pages/
|   |-- LoginPage.tsx                         # post-login destination
|   `-- PrivateInvestmentTrackerPage.tsx       # wide-shell page wrapper
|-- components/shared/
|   `-- AppShell.tsx                           # navbar link and active-state rules
`-- features/partnership-tracker/
    |-- api/partnershipTrackerClient.ts        # normalized read and binary PDF requests
    |-- hooks/usePartnershipTracker.ts         # query keys, previous data, cross-mutation invalidation
    |-- components/
    |   |-- PartnershipOverview.tsx            # operational/tax visual separation
    |   `-- private-investment/
    |       |-- PrivateInvestmentTrackerPageContent.tsx
    |       |-- PrivateInvestmentSummaryTable.tsx
    |       |-- PrivateInvestmentActivityTable.tsx
    |       |-- PrivateInvestmentFilters.tsx
    |       |-- PrivateInvestmentFilterCombobox.tsx
    |       |-- PrivateInvestmentPdfExportDialog.tsx
    |       `-- privateInvestmentFormatting.ts
    `-- __tests__/
        |-- PrivateInvestmentTrackerPage.test.tsx
        |-- PrivateInvestmentTrackerUrlState.test.tsx
        |-- PrivateInvestmentTrackerAccessibility.test.tsx
        |-- PrivateInvestmentTrackerPdf.test.tsx
        |-- PartnershipTrackerPerformance.test.tsx
        |-- PartnershipTrackerNavigation.test.tsx
        `-- partnershipTrackerClient.test.ts

packages/types/src/
`-- partnership-tracker.ts                    # shared operational, private tracker, and PDF contracts
```

**Structure Decision**: Extend the existing Partnership Tracker vertical module because it already owns the source records, scope middleware, exact finance composer, mutation invalidation, and aggregation UI patterns. Keep private-tracker composition and PDF rendering in focused files so source selection, financial arithmetic, query behavior, and layout can be tested independently. Do not add a new persistence module or copy events into a reporting table.

## Phase 0: Research Outcomes

1. Remove all K-1 annual-value fallback from operational performance; retain tax-position fields as separately labeled metadata.
2. Split non-recallable and recallable distributions in the canonical composer. Only non-recallable values feed DPI/TVPI; both feed XIRR; linked commitment snapshots already incorporate recallable increases.
3. Use the existing owner-specific partnership ID, paired with entity ID in the contract, as the stable entity-fund position identity; do not group across owners.
4. Union `capital_activity_events` and `partnership_fmv_snapshots` for the detail ledger. Use commitment history only for effective Total Committed and Remaining Commitment.
5. Let bottom filters choose which entity-fund positions appear, while keeping each matching position's metrics lifetime-to-date. This matches workbook SUMIFS behavior and avoids partial-period DPI/TVPI.
6. Apply amount ranges to positive magnitude and expose signed/accounting display semantics separately.
7. Return normalized query, facets, all matching lifetime positions, one detail page, and page metadata from one endpoint; filters and aggregation occur after scope in a set-based repository read.
8. Preserve the workbook's core summary columns and offer XIRR and simplified return as optional executive columns.
9. Add a server-generated PDF endpoint because client print windows cannot guarantee a download, full filtered scope, or server reauthorization. Build a pure report model before rendering binary PDF.
10. Reuse Headless UI combobox/dialog patterns, Jackson tables, local overflow, tabular numerics, URL-owned filters, and TanStack Query keep-previous-data behavior.
11. Make `/private-investment-tracker` the explicit login and `/dashboard` destination without intercepting valid deep links.
12. Reuse current indexes and add no migration initially; the target data volume is covered by existing partnership/date indexes. Add a migration only if the required integration plan demonstrates an index-supported gap.

## Phase 1: Design Outcomes

- `OperationalPartnershipPerformanceInput` contains exact dated calls, non-recallable and recallable distributions, latest NAV, effective commitment, and identity dates. It contains no annual K-1 values.
- `PrivateInvestmentActivityRow` is a discriminated read projection over cash activity and NAV sources with positive magnitude plus display direction.
- `PrivateInvestmentPosition` is one lifetime entity-partnership summary with exact commitment, cash, NAV, ratio, return, and availability fields.
- `PrivateInvestmentTrackerQuery` holds multi-select event/entity/partnership filters, optional inclusive date/amount bounds, and detail pagination. Top positions are never independently queried.
- The read response returns facets from the authorized base scope, position rows for every distinct entity-partnership pair in the complete filtered event set, and only the requested detail page.
- Filtering controls position membership, not the arithmetic scope of each position. The response declares `positionMetricScope: LIFETIME_FOR_MATCHED_POSITIONS`.
- Current total commitment selects the latest effective snapshot. Remaining commitment subtracts lifetime calls only because linked recallable snapshots already increased the commitment.
- DPI/TVPI use non-recallable distributions; XIRR uses both distribution types and the latest NAV terminal value; missing NAV is never replaced by invested capital.
- PDF export accepts the same normalized filters plus ordered summary/detail column IDs. The server reloads scoped data, builds a complete report model, and streams `application/pdf`.
- The web page uses a wide shell, a compact workbook-inspired header, a top ruled summary table, bottom filter toolbar, newest-first detail table, sticky identity cells, and clear source/metric-scope notes.
- Every mutation affecting partnership identity, cash activity, commitment, or NAV invalidates the private tracker family; K-1-only edits do not need to change investment results.

## Implementation Sequence

1. Add shared/API-local operational performance, private tracker query/row/facet/page, PDF column, and export contracts.
2. Refactor `composePartnershipPerformance` and the summary repository projection to remove K-1 cash fallbacks, separate recallable distributions, preserve tax metadata, and update exact unit/integration regression tests.
3. Implement the pure private tracker composer, normalized Zod query, set-based repository read, facets, lifetime matched-position projection, detail pagination, handler, and authenticated route.
4. Add the pure PDF report model and server renderer, validate ordered column selections, stream the complete scoped filtered artifact, and cover authorization/content-disposition/PDF-byte behavior.
5. Add client serialization, URL normalization, binary export handling, query keys, keep-previous-data behavior, and invalidation from cash/commitment/NAV/identity mutations.
6. Build the wide Private Investment Tracker page, top summary table, autocomplete/range filters, active-filter context, detail table, pagination, export dialog, and distinct loading/empty/error/export states.
7. Add the navbar item and active state, protected route, login destination, and `/dashboard` redirect while preserving valid deep links.
8. Run focused pure/API/web suites, full API/web tests and builds, the 500-position/10,000-row read and PDF checks, and desktop/tablet/mobile keyboard and reduced-motion verification from quickstart.

## Complexity Tracking

No constitution violations are introduced. A dedicated PDF dependency is justified because the requirement is a downloadable, complete, reauthorized C-suite PDF; the existing print-window helper cannot guarantee those properties. The private tracker endpoints remain inside the existing Partnership Tracker module and introduce no new service or persistent reporting source.

## As-Built Contract Audit

- The JSON read response exposes only the documented normalized query, lifetime positions, base-scope facets, paged activities, page metadata, and as-of date. Complete unpaged activities remain internal to the PDF report composition.
- Entity and partnership selections that are syntactically valid but unavailable in the authenticated base scope are removed from the normalized query rather than causing a blocking error.
- PDF filter fields use explicit `null` for open date and amount bounds; the OpenAPI contract records this wire behavior.
- Money filters remain decimal strings through URL parsing, validation, filtering, and export. Browser and server range comparisons use integer cents.
- No implementation deviation remains from `contracts/private-investment-tracker.openapi.yaml`.
