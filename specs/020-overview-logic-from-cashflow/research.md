# Research: Cash-Flow-Sourced Overview and Private Investment Tracker

## Workbook Findings

The supplied `Private_Investment_Metrics.xlsx` contains two worksheets:

- `Data Source` is the direct model for the requested page. Its top table has one row per Entity + Fund and columns for asset class, commitment, remaining commitment, status, vintage, invested capital, both distribution classes, valuation, DPI, TVPI, XIRR, and simplified return. Its bottom `CashFlows` table contains Entity, Fund, Date, Cash Flow, Type, and Source.
- `Executive Dashboard` adds portfolio-level cards and asset-allocation summaries. Those elements are useful reference material but are not required for the first two-section page described by the user.

The bottom table contains four distinct types: Capital Call, Non-Recallable Distribution, Recallable Distributions, and Valuation. Calls are negative display cash flows; the other cash types are positive. Recallable distributions increase remaining commitment, are included in XIRR cash timing, and are excluded from DPI/TVPI. The workbook's top formulas use the full cash-flow table rather than visible filtered rows.

## Decision 1: Operational Records Are the Only Investment Source

**Decision**: Partnership investment metrics will read only `capital_activity_events`, effective `partnership_commitments`, `partnership_fmv_snapshots`, and partnership identity/classification. K-1 years and revisions remain tax metadata and reconciliation inputs, never fallback investment values.

**Rationale**: The current repository uses activity when present and otherwise falls back to K-1 contributions/distributions. That makes metrics change with tax-accounting basis and contradicts the requested operational/tax separation.

**Alternatives considered**:

- Keep K-1 fallback when operational rows are missing: rejected because missing real-time history must remain visible rather than silently inferred from a tax document.
- Prefer K-1 after annual reconciliation: rejected for investment reporting; reconciliation can flag a difference without replacing operational history.

## Decision 2: Refactor One Canonical Performance Composer

**Decision**: Replace the annual-K-1-shaped composer input with an operational input containing dated calls, non-recallable distributions, recallable distributions, current effective commitment, latest NAV, inception/earliest-call dates, and an as-of date. Reuse it in Overview, existing aggregation, and the new tracker.

**Rationale**: The current query and composer can disagree about sources and currently combine both distribution types. One operational composer prevents three surfaces from drifting.

**Alternatives considered**:

- Add a second private-tracker-only calculator: rejected because Overview would keep a different source policy.
- Calculate ratios in React: rejected because exact finance rules, authorization, PDF export, and testability belong on the server.

## Decision 3: Recallable Distribution Semantics

**Decision**:

- Total invested = magnitude sum of capital calls.
- Non-recallable distributions = magnitude sum of `distribution`.
- Recallable distributions = magnitude sum of `recallable_distribution`.
- DPI = non-recallable distributions / total invested.
- TVPI = (non-recallable distributions + latest NAV) / total invested.
- XIRR includes calls as negative, both distribution types as positive, and latest NAV as terminal value.
- Effective commitment comes from the latest commitment snapshot. Linked recallable snapshots already contain the cumulative increase, so Remaining Commitment = effective commitment - calls.

**Rationale**: This matches the workbook notes and avoids double-counting the existing linked commitment update.

**Alternatives considered**:

- Include recallable distributions in DPI/TVPI: rejected because capital can be recalled and is not a permanent realized return.
- Add recallable distributions again to the current app commitment: rejected because `recomputeRecallableCommitments` already persists the increased effective snapshot.

## Decision 4: Real NAV Only

**Decision**: Latest valuation is the most recent eligible `partnership_fmv_snapshots` record. If absent, valuation, TVPI, and NAV-dependent IRR are unavailable. No paid-in fallback is synthesized.

**Rationale**: The user asked for latest NAV entries from Capital & NAV. The workbook's paid-in fallback masks missing valuation data and would overstate confidence.

**Alternatives considered**:

- Use invested capital as a valuation fallback: rejected because it fabricates a current value.
- Use K-1 ending capital: rejected because it restores the tax-accounting source problem.

## Decision 5: Entity-Fund Identity

**Decision**: Use the existing owner-specific `partnerships.id` as the durable fund-position identity and expose `entityId + partnershipId` as the composite summary relationship. Do not use `aggregation_group_id` to merge owners on this page.

**Rationale**: The same named fund held by multiple entities has independent calls, commitment, NAV, and tax history. The workbook intentionally repeats the fund once per owner.

**Alternatives considered**:

- Group by normalized entity and fund names: rejected because names can change and collide.
- Group by `aggregation_group_id`: rejected because that intentionally consolidates the same fund across owners, opposite this page's key.

## Decision 6: Unified Detail Ledger

**Decision**: Union three cash activity event types with NAV snapshots:

- `funded_contribution` -> `CAPITAL_CALL`
- `distribution` -> `NON_RECALLABLE_DISTRIBUTION`
- `recallable_distribution` -> `RECALLABLE_DISTRIBUTION`
- NAV snapshot -> `VALUATION`

Commitment snapshots provide top Total Committed but are not emitted as activity rows.

**Rationale**: This matches the workbook types and resolves the prompt's ambiguous reference to "Capital Call entries from that tab." Capital calls already exist in Net Cash Activity; commitment history is not a cash flow.

**Alternatives considered**:

- Include commitment snapshots as a fifth ledger type: rejected because the workbook and requested type filters omit them, and they would be confused with capital calls.
- Persist a reporting ledger: rejected because it duplicates canonical events and introduces synchronization risk.

## Decision 7: Bottom Filters Select Positions; Top Metrics Stay Lifetime

**Decision**: The complete filtered ledger determines which entity-partnership pairs appear in the top section. Once a pair matches, its top metrics are calculated from complete operational history and current commitment/latest NAV, not the filtered subset.

**Rationale**: This matches the workbook's full-table formulas and avoids misleading results such as a distribution-only filter producing no invested denominator. The UI and PDF will label the summary as lifetime metrics for filtered positions.

**Alternatives considered**:

- Recalculate top metrics from only filtered events: rejected because type/date/amount filters can make DPI/TVPI financially meaningless.
- Let top and bottom have independent filters: rejected because the user explicitly wants the bottom to dictate the top.

## Decision 8: Filter and Range Semantics

**Decision**: Type, entity, and fund are URL-owned multi-select autocomplete values. Categories combine with AND; values within one category combine with OR. Date bounds are inclusive. Amount bounds apply to positive magnitude, regardless of cash direction. Page sizes are 25, 50, and 100; default is 50. Detail order is date descending, created-at descending, type order, source ID.

**Rationale**: Magnitude lets a $1,750 call and $1,750 distribution both match an amount investigation while type controls direction. Stable ties prevent pagination gaps/duplicates.

**Alternatives considered**:

- Filter on signed amount: rejected as surprising when users enter positive dollar bounds.
- Single-select entity/fund/type: rejected because portfolio users often compare several owners or funds.
- Client-only filtering: rejected because facets, top membership, pagination, authorization, and export must describe one complete scope.

## Decision 9: Set-Based API Shape

**Decision**: Add `GET /v1/partnership-tracker/private-investments`. It returns normalized query, scoped facets, all lifetime position summaries represented by the complete filtered ledger, one paged ledger slice, and page metadata. The repository obtains activity candidates, matching position IDs, and complete position inputs through bounded set-based queries.

**Rationale**: One response keeps top and bottom synchronized and avoids N+1 calls. Position rows are at most the number of scoped partnerships and are small enough to return in full at the stated scale.

**Alternatives considered**:

- Separate top, detail, and facet endpoints: rejected because concurrent responses could describe different snapshots and add request coordination.
- Reuse the existing aggregation endpoint: rejected because it groups across owners and has a different filter/row contract.

## Decision 10: Exact Return Fields

**Decision**: Preserve exact XIRR using the current bounded root solver. Add a simplified annualized return from TVPI and the holding period beginning at the earliest call. `displayIrr` uses XIRR when available and simplified return otherwise.

**Rationale**: This retains the standalone return fields while keeping availability and calculation type explicit.

**Alternatives considered**:

- Use simplified return even when XIRR exists: rejected because exact dates are more informative.
- Omit return metrics: rejected because exact and simplified returns remain useful standalone measures, but they remain optional columns.

## Decision 11: Server-Generated PDF

**Decision**: Add `POST /v1/partnership-tracker/private-investments/pdf` with normalized filters and ordered summary/detail column IDs. The server reapplies scope, reloads the complete filtered data, creates a pure report model, and renders a landscape PDF with repeated headers, page numbers, filter context, and Jackson/workbook styling.

**Rationale**: The current browser print helper can only print rows already supplied by the client, depends on popup settings, and cannot guarantee a download or server reauthorization. A real binary endpoint meets the C-suite artifact requirement.

**Alternatives considered**:

- Reuse `window.print()`: rejected for full-scope and download guarantees.
- Generate PDF in the browser from raw rows: rejected because client-calculated totals and untrusted row scope would become part of the artifact.
- Export XLSX only: rejected because the request explicitly requires PDF.

## Decision 12: Navigation and Default Route

**Decision**: Add `/private-investment-tracker` to `App.tsx` and `AppShell`. Successful login and authenticated `/dashboard` redirect there. Existing explicit protected routes and browser history are unchanged.

**Rationale**: This satisfies the default-page request without a global authenticated redirect that could override deep links.

**Alternatives considered**:

- Redirect every authenticated `/` render automatically: rejected because login/logout behavior and deep-link restoration need separate handling.
- Replace Partnership Tracker: rejected because the new page is portfolio reporting, while the workspace remains the editing surface.

## Decision 13: Cache and Mutation Consistency

**Decision**: Add a `privateInvestments()` TanStack Query family and invalidate it after partnership identity/entity changes, cash activity changes, commitment changes, NAV changes, and partnership deletion. K-1-only edits may invalidate legacy shared lists but must not change operational outputs.

**Rationale**: The new page aggregates all affected sources and must refresh after each operational mutation.

**Alternatives considered**:

- Poll continuously: rejected as unnecessary and more expensive than targeted invalidation.
- Invalidate only after Net Cash Activity: rejected because commitments, NAV, owner, asset class, and status also affect the summary.

## Decision 14: Schema and Index Strategy

**Decision**: Add no persisted reporting schema or migration in the initial implementation. Reuse current activity entity/partnership/date indexes, commitment effective-date index, NAV partnership/valuation-date indexes, and bounded target scale. Capture `EXPLAIN (ANALYZE, BUFFERS)` in the performance test and add only an evidence-backed composite index if required.

**Rationale**: The existing tables already express the model and are indexed by the dominant relationships. Premature summary persistence would create source drift.

**Alternatives considered**:

- Add a materialized view: rejected because operational mutations would require refresh coordination.
- Add broad speculative indexes: rejected because they increase write cost without a demonstrated query plan benefit.
