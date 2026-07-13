# Research: Partnership Tracker

**Feature**: `016-k1-tracker`
**Date**: 2026-07-12

## Decision 1: Consolidate the visible experience around a selected partnership

**Decision**: Replace the separate Partnerships and K1 Tracker navigation items with one `Partnership Tracker` item. The page uses a searchable partnership picker plus three bounded areas: Overview, K-1 & Basis, and Capital & NAV.

**Rationale**: The user wants partnership creation and relevant management alongside the K-1-driven workspace but explicitly does not want every legacy partnership detail section. A selected-partnership shell keeps context stable and prevents the workbook-like problem from reappearing as an endlessly scrolling page.

**Alternatives considered**:

- Keep separate directory, detail, and K1 pages: rejected because creating or managing the partnership still interrupts the main workflow.
- Copy all sections from `PartnershipDetail`: rejected because assets, manual capital activity, expected distributions, and activity-detail reporting are outside the requested focused v1.
- Put all retained panels on one page: rejected because a partnership with many years and history entries would still require excessive scrolling.

## Decision 2: Reuse `asset_class` as controlled Partnership Type

**Decision**: Label the field `Partnership Type` in the new UI and constrain new/edited values to Private Equity, Real Estate, Hedge Fund, Venture Capital, Credit, Infrastructure, and Other. Continue storing the value in `partnerships.asset_class` and exposing it to existing reports as `assetClass`.

**Rationale**: The user confirmed that the current asset-class choices are the desired partnership types. Reusing the field avoids a migration that would split reporting and tracker identity.

**Alternatives considered**:

- Add a new `partnership_type` column: rejected because it would duplicate the same classification and create reconciliation work across reports.
- Leave the field free-text: rejected because the requested selection workflow benefits from consistent types and filters.
- Rewrite legacy unknown values automatically: rejected because it could silently change reporting. Unknown legacy values remain readable and require an explicit Admin choice when edited.

## Decision 3: Separate partnership creation from optional first-year creation

**Decision**: Use a short Add Partnership dialog for entity, name, type, and optional advanced details. After success, select the new partnership and show Add K-1 Year as the primary next action; do not require the year in the same database transaction.

**Rationale**: The partnership should remain valid even when the Admin is not ready to enter K-1 data. The flow still feels continuous while keeping validation and failure recovery understandable.

**Alternatives considered**:

- One multi-step modal that commits partnership and year together: rejected because a later-year validation failure would make partnership creation semantics ambiguous.
- Redirect to the legacy partnership detail page: rejected because it defeats the consolidated workspace goal.

## Decision 4: Make manual K-1 entry the only v1 ingestion path

**Decision**: Partnership Tracker v1 creates tracker values only through manual entry and deterministic carryforwards. Remove Excel import controls/routes from the new contract and do not auto-sync finalized K-1 document fields. Preserve existing imported/source revisions as readable legacy provenance.

**Rationale**: The user wants to validate the data vocabulary, signs, calculations, and workflow before introducing probabilistic extraction. Manual-first reduces simultaneous variables and establishes the labeled dataset needed to evaluate PDF extraction in v2.

**Alternatives considered**:

- Retain Excel import as an optional advanced action: rejected because the user explicitly removed it from v1.
- Keep finalized-document auto-sync enabled invisibly: rejected because values could change without the user understanding why in a manual-only validation phase.
- Drop import tables and provenance columns: rejected because it would destroy existing data and make the planned PDF/OCR path require another redesign.

## Decision 5: Reuse commitments as effective-dated total snapshots

**Decision**: Treat each `partnership_commitments` row as the total committed capital effective on `commitment_date`. Preserve all dated rows. For any as-of date, choose the greatest effective date not after the as-of date. A backdated insertion never overwrites a later row.

**Rationale**: The existing table already stores amount, date, source, notes, actor, and timestamps. Explicit snapshot semantics answer the user's preservation requirement and avoid ambiguity between total commitment and incremental capital calls.

**Alternatives considered**:

- Store only one current amount on `partnerships`: rejected because it loses history.
- Treat every commitment row as an incremental delta and sum them: rejected because the current UI/API calls the field commitment amount and the user asked for dated committed-capital values, not capital-call events.
- Add a new commitment-history table: rejected because the current table already holds the required data.

**Operational detail**: New v1 entries require `commitment_date`. Legacy null dates remain readable using `created_at::date` as a fallback display/effective date. The existing ACTIVE marker is maintained for the latest-effective entry, but historical projections use dates rather than status alone.

## Decision 6: Reuse partnership FMV snapshots as NAV history

**Decision**: Present `partnership_fmv_snapshots` as NAV entries in the new feature. New entries use the manual source, require a valuation date and nonnegative amount, allow multiple dates in the same year, and reject a duplicate exact date for the same partnership.

**Rationale**: Partnership-level FMV and the requested partnership NAV are the same stored valuation concept in the current system. The table already has the required date, amount, source, note, and audit-related metadata.

**Alternatives considered**:

- Add a parallel NAV table: rejected because it would create two competing latest-value calculations.
- Limit NAV to one annual value: rejected because the user explicitly wants multiple entries per year.
- Aggregate multiple annual observations before plotting: rejected because it hides the actual entered history.

## Decision 7: Use a native accessible SVG for the NAV plot

**Decision**: Build a small responsive SVG line plot using time-proportional x positions and value-proportional y positions. Pair it with a textual trend summary and always-available table; each point exposes its exact date/value through focusable controls or an associated details list.

**Rationale**: The web app has no chart dependency. A simple one-series plot does not justify a new bundle dependency, while native SVG can meet the visual and accessibility needs with deterministic testing.

**Alternatives considered**:

- Add Recharts or another chart library: rejected for a single uncomplicated series and increased bundle/dependency surface.
- Draw a sparkline without axes/table: rejected because it would not communicate exact historical values accessibly.
- Plot by index rather than date: rejected because irregular valuation intervals would be visually misleading.

## Decision 8: Compose one scoped read model without duplicating repositories

**Decision**: Add a thin `partnership-tracker` API module that composes existing partnership identity, K-1 tracker, commitment, and FMV/NAV repositories. It owns the consolidated wire response and new route prefix, not duplicate persistence logic.

**Rationale**: The page needs a coherent selected-partnership payload and summary list without client-side N+1 requests. Existing repositories remain authoritative for their tables and can be tested independently.

**Alternatives considered**:

- Make the frontend call four APIs per selection: rejected because loading/error states become fragmented and list summaries would create N+1 requests.
- Move all existing repository logic into one large tracker repository: rejected because it would blur existing module responsibilities and increase regression risk.

## Decision 9: Standardize new money contracts on exact decimal strings

**Decision**: New Partnership Tracker requests/responses represent money as strings matching `^-?\d+\.\d{2}$`. The server converts to integer cents for calculation and PostgreSQL numeric values for storage.

**Rationale**: K-1 calculations already require exact values, and commitment/NAV should not introduce binary floating-point differences. This also makes contract behavior consistent across the consolidated page.

**Alternatives considered**:

- Continue the legacy JavaScript-number contract for commitment and FMV: rejected for the new surface because it conflicts with tracker exactness.
- Use integer cents in the public contract: rejected because decimal strings are easier for forms, APIs, and users to inspect.

## Decision 10: Redirect legacy web routes while retaining legacy data/APIs

**Decision**: Redirect `/partnerships`, `/partnerships/:id`, and `/k1-tracker` into `/partnership-tracker`, preserving partnership and tax-year selection where possible. Remove their separate navigation items. Keep unrelated legacy APIs and stored data until explicitly retired; do not expose their legacy sections on the new page.

**Rationale**: Redirects prevent broken bookmarks and duplicate maintained pages. Retaining APIs protects reports and other existing screens while the visible workflow is consolidated.

**Alternatives considered**:

- Delete old routes and APIs immediately: rejected because internal links and reports may still depend on them.
- Keep old pages hidden but directly accessible: rejected because behavior would diverge and users could unknowingly edit through two experiences.

## Decision 11: Preserve a deliberate v2 extraction seam

**Decision**: Keep source/provenance fields and append-only value revisions capable of representing future PDF/OCR candidates, but make the v2 pipeline land in a review step before values become effective.

**Rationale**: Manual v1 entries form a CPA-approved golden dataset. V2 can compare extracted candidates against it without changing the partnership, annual calculation, commitment, or NAV model.

**Alternatives considered**:

- Design v1 as if all values will remain manual: rejected because the user has already identified PDF automation as v2.
- Implement provider-specific OCR fields now: rejected because the provider and accuracy strategy have not been benchmarked and are outside v1.
