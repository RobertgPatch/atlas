# Phase 0 Research — Partnership Asset Redesign

**Feature**: `009-partnership-asset-redesign`  
**Inputs**: `spec.md`, Feature 004 implementation artifacts, `docs/schema/21-postgres-ddl.sql`, current partnerships module and Partnership Detail page.

All explicit `NEEDS CLARIFICATION` items were resolved during `/speckit.clarify`. This document captures the implementation decisions required to turn the clarified spec into a coherent design.

---

## Decision 1: Introduce dedicated subordinate tables `partnership_assets` and `partnership_asset_fmv_snapshots`

- **Decision**: Add two new tables rather than overloading `partnerships` or `partnership_fmv_snapshots`:
  - `partnership_assets` for the holding record under a partnership
  - `partnership_asset_fmv_snapshots` for append-only point-in-time asset valuations
- **Rationale**: The existing schema already models whole-partnership FMV separately from the partnership itself. Reusing `partnership_fmv_snapshots` for asset-level valuations would destroy the required separation between whole-partnership context and asset rollup context. A dedicated subordinate asset model also keeps future imported and Plaid-linked metadata out of the parent `partnerships` row.
- **Alternatives considered**:
  - *Store assets as JSON on `partnerships`* — rejected: impossible to query, audit, validate, or append history cleanly.
  - *Reuse `partnership_fmv_snapshots` with a nullable `asset_id`* — rejected: mixes two valuation contexts in one table and complicates every existing Feature 004 consumer.

## Decision 2: Load asset rows during page load, but fetch drawer detail and full valuation history lazily

- **Decision**: The Partnership Detail screen composes two initial read surfaces:
  - existing `GET /partnerships/:id` for parent partnership context
  - new `GET /partnerships/:id/assets` for the asset rows and asset-rollup summary

  When the user opens a row, the drawer lazily fetches `GET /partnerships/:id/assets/:assetId` and `GET /partnerships/:id/assets/:assetId/fmv-snapshots`.
- **Rationale**: This satisfies FR-015 while preserving localized asset failure handling. If the asset query fails, the rest of Partnership Detail still renders and the Assets section alone can show a retry state. Lazy-loading the drawer avoids over-fetching valuation history for every asset on page load.
- **Alternatives considered**:
  - *Return asset rows and full history inside `GET /partnerships/:id`* — rejected: heavy payload, harder localized failure handling, unnecessary history fetches.
  - *Fetch asset rows only when the Assets section is expanded* — rejected: conflicts with the clarified requirement that asset rows load with the detail page.

## Decision 3: Enforce duplicate prevention in the application layer with a supporting lookup index

- **Decision**: Assets are considered duplicates within a partnership when `lower(trim(name))` and `asset_type` match an existing asset. The API performs a deterministic duplicate check before insert and returns `409 DUPLICATE_PARTNERSHIP_ASSET`. The database adds a supporting index on `(partnership_id, asset_type, lower(name))` but not a hard unique constraint.
- **Rationale**: This matches the current Feature 004 partnership-name conflict pattern and keeps duplicate handling consistent across in-memory and PostgreSQL-backed modes. It also preserves friendlier validation messaging for Admins without surfacing raw database uniqueness violations.
- **Alternatives considered**:
  - *Unique expression index* — rejected for v1 because the repo still supports in-memory fallback and already standardizes on app-layer duplicate handling for nearby write paths.
  - *No duplicate prevention* — rejected: directly conflicts with the clarified spec.

## Decision 4: Asset FMV remains append-only and uses `created_at` as the authoritative "latest" ordering key

- **Decision**: Asset FMV snapshots mirror the existing partnership-FMV semantics:
  - no edit path
  - no delete path
  - multiple snapshots may share a valuation date
  - latest display value is the most recently recorded snapshot by `created_at`, then `valuation_date`, then `id`
  - validation allows `0`, rejects negatives, and rejects future dates
- **Rationale**: This keeps user expectations aligned across Feature 004 and Feature 009. The same-day correction behavior from partnership FMV is reused for asset FMV, which is especially important when an Admin corrects a prior estimate without changing the business as-of date.
- **Alternatives considered**:
  - *Use `valuation_date` to define latest* — rejected: a corrective entry for an older date would not become visible immediately.
  - *Allow edit/delete of asset FMV snapshots* — rejected: conflicts with the append-only audit model.

## Decision 5: Compute asset rollup server-side as sum of latest valued snapshot per asset, and keep partnership-level FMV separate

- **Decision**: `totalLatestAssetFmvUsd` is derived server-side as the sum of each asset's latest snapshot amount when that asset has at least one snapshot. Unvalued assets contribute nothing to the sum and render `null` / empty in the UI, not `$0`. The existing Feature 004 `latestFmvUsd` remains a separate field and is not overwritten or auto-reconciled.
- **Rationale**: The rollup must be authoritative and shared across UI, tests, and exports without client-side drift. Server-side derivation also keeps the "empty vs zero" distinction consistent and prevents the web layer from having to reproduce SQL grouping logic.
- **Alternatives considered**:
  - *Calculate the rollup on the client* — rejected: duplicates logic across surfaces and weakens financial integrity.
  - *Replace partnership-level FMV once assets exist* — rejected: directly violates the clarified spec.

## Decision 6: Separate asset source from valuation source, and make `confidence_label` optional on valuation snapshots only

- **Decision**:
  - Asset rows store a coarse `source_type` of `manual | imported | plaid`
  - Asset FMV snapshots store a valuation source enum that extends current Feature 004 FMV source semantics with future-friendly imported/plaid values
  - `confidence_label` lives only on asset-FMV snapshots and remains optional
- **Rationale**: A manually created asset can later receive an imported valuation, and a Plaid-linked asset can still receive a manual correction. Separating the two source concepts prevents the data model from collapsing asset provenance and valuation provenance into one field.
- **Alternatives considered**:
  - *One source enum shared by both asset and valuation records* — rejected: cannot represent mixed provenance cleanly.
  - *Put confidence on the asset itself* — rejected: confidence is a property of a specific valuation, not the underlying holding.

## Decision 7: Keep all new interfaces partnership-scoped; no independent asset workspace or asset list endpoint outside a partnership context

- **Decision**: Every new endpoint is nested beneath `/partnerships/:id/...`. There is no `/assets` collection route and no separate route-level page for asset detail.
- **Rationale**: This preserves the partnership-first workflow from Feature 004, makes scope inheritance straightforward, and lines up with the clarified drawer interaction model.
- **Alternatives considered**:
  - *Create `/assets/:id` route and page* — rejected: creates a second primary workflow and breaks the spec's information hierarchy.

---

## Open Questions Deferred to `/speckit.tasks`

None that block planning. `tasks.md` should break the work into migration/schema, shared types, backend asset repositories/handlers/routes/tests, frontend asset clients/hooks/components, and Partnership Detail integration.