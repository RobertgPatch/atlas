# Phase 0 Research - Reports Phased Delivery

**Feature**: `006-reports`  
**Inputs**: `spec.md`, `plan.md`, `specs/000-constitution.md`, `specs/001-ui-constitution.md`, current dashboard and partnership modules.

This research resolves implementation choices needed to execute the phased delivery sequence: Portfolio Summary first, Asset Class Summary second, Activity Detail plus export completion last.

## Decision 1: Use a dedicated reports API module and route surface

- **Decision**: Add a new reports vertical under `apps/api/src/modules/reports/` with authenticated routes under `/v1/reports` for Portfolio Summary, Asset Class Summary, Activity Detail, Activity Detail edit/undo, and export.
- **Rationale**: Existing `/dashboard` and `/partnerships/:id` payloads are screen-specific and not suited for report-grade filtering, paging, and export contracts. A dedicated module keeps report read models cohesive and easier to test.
- **Alternatives considered**:
  - Extend `/dashboard` to return all report data: rejected due to payload coupling and route bloat.
  - Derive reports only on the web side from multiple existing endpoints: rejected because it duplicates financial computation logic and weakens auditability.

## Decision 2: Standardize a shared filter grammar across all report endpoints

- **Decision**: Use one query grammar across report endpoints: `search`, `dateRange`, `entityType`, `entityId`, `partnershipId`, `taxYear`, `sort`, `direction`, `page`, and `pageSize` (where applicable by report).
- **Rationale**: A single filter contract enables consistent user expectations, shared toolbar behavior, and export parity (export must reflect exactly what the user filtered).
- **Alternatives considered**:
  - Custom query parameters per report: rejected because it increases UI branching and makes cross-report consistency harder.
  - Server-side session-persisted filter state only: rejected because URLs should remain reproducible and testable.

## Decision 3: Build Portfolio Summary from persisted activity and commitment sources

- **Decision**: Source Portfolio Summary rows and totals from `partnership_annual_activity` joined to entity and partnership metadata, with commitment edits flowing through existing commitment write semantics.
- **Rationale**: `partnership_annual_activity` already centralizes normalized annual financial metrics and remains the correct persisted layer for report computations. Reusing commitment write logic avoids duplicate mutation paths.
- **Alternatives considered**:
  - Compute all metrics directly from raw K-1 field values on each request: rejected due to repeated heavy joins and drift risk.
  - Introduce report-only write tables in Phase 1: rejected because commitment updates already exist and should remain authoritative.

## Decision 4: Restrict Phase 1 original-commitment inline edit to eligible rows

- **Decision**: Original-commitment edit in Portfolio Summary is enabled only when a row maps deterministically to a single active commitment target; otherwise the cell remains read-only with clear UI feedback.
- **Rationale**: This preserves correctness and traceability while still satisfying the requirement that original commitment editing is supported in Phase 1.
- **Alternatives considered**:
  - Force entity-level aggregate overrides for all rows: rejected because aggregate edits are hard to map consistently back to commitment-level sources.
  - Disable editing entirely until Phase 3: rejected because Phase 1 explicitly requires inline edit support.

## Decision 5: Extend activity-detail storage to support full report columns

- **Decision**: Extend `partnership_annual_activity` with missing activity-detail columns required by Feature 006 (for example beginning basis, contributions, remaining K-1, other adjustments, ending tax basis, book-to-book adjustment, K-1 vs tax difference, excess distribution, negative basis flag, ending basis).
- **Rationale**: Activity Detail is keyed by `(entity_id, partnership_id, tax_year)` and must persist across finalization-triggered refreshes with manual fields preserved. Extending the existing keyed table keeps this invariant intact.
- **Alternatives considered**:
  - Build Activity Detail as a purely computed runtime view: rejected because manual-field persistence and undo behavior become brittle.
  - Create a second annual report table: rejected because it duplicates keying and sync logic already owned by `partnership_annual_activity`.

## Decision 6: Implement single-step undo through audited write events

- **Decision**: Persist inline edits immediately, write audit events with before/after payloads, and support single-step undo by replaying the latest eligible edit per user and row context.
- **Rationale**: This matches constitution requirements for immediate persistence, auditability, and single-step undo while keeping behavior deterministic.
- **Alternatives considered**:
  - Client-only optimistic undo buffer: rejected because page refreshes and multi-user edits would lose correctness.
  - Multi-level undo stack in v1: rejected as unnecessary complexity beyond current requirements.

## Decision 7: Keep Phase 1 and Phase 2 export action informational, complete export in Phase 3

- **Decision**: In Phases 1 and 2, clicking Export shows a non-blocking message that CSV/XLSX is available in Phase 3 and does not generate files. Phase 3 adds real export for all reports with shared filter parity.
- **Rationale**: This preserves UX continuity from day one without committing to partial file-generation behavior that would diverge from final contracts.
- **Alternatives considered**:
  - Hide Export until Phase 3: rejected because visibility is a Phase 1 requirement.
  - Implement CSV in Phase 1 and XLSX in Phase 3: rejected because inconsistent behavior would complicate operator expectations and test coverage.

## Decision 8: Normalize the generated Portfolio Summary UI into Atlas shared patterns

- **Decision**: Use the generated Portfolio Summary composition as a behavior reference but implement with Atlas shared components and conventions (`PageHeader`, `FilterToolbar`, `DataTable`, reusable `EditableCell`, `TotalsRow`) under the existing React + Tailwind stack.
- **Rationale**: This honors the provided reference while complying with the UI constitution and avoiding one-off design drift.
- **Alternatives considered**:
  - Copy generated component tree verbatim: rejected because Atlas currently enforces shared component normalization.
  - Rebuild from scratch without using the provided reference: rejected because it ignores explicit user direction.

## Open Questions Deferred To `/speckit.tasks`

- Define the exact export row-limit and fallback response shape for very large datasets (the spec currently defers this detail).
