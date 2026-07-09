# Research: TIC Registry Page

## Decision 1: Persist Registry Data in Existing RDS PostgreSQL

**Decision**: Store TIC Registry records in PostgreSQL/RDS through the existing API `DATABASE_URL` connection. Add a new migration file, `016_tic_registry.sql`, and avoid browser local storage as a production source of truth.

**Rationale**: The user explicitly wants the registry saved to the staging/RDS-backed environment, and the existing Atlas API already runs migrations on startup when `DATABASE_URL` is configured. This keeps the feature durable across refreshes, browser sessions, deployments, and devices.

**Alternatives considered**:

- Browser local storage from `tic-registry.html`: rejected because it is not shared, durable, or environment-safe.
- API in-memory fallback: rejected because the registry should behave like normal RDS-backed CRUD and should not silently diverge from staging/production behavior.
- A new storage service: rejected because existing RDS already satisfies the feature's persistence needs.
- Embedding registry data inside existing partnership tables: rejected because TIC properties, interests, owners, and exchange lineage have their own lifecycle.

## Decision 2: Scope TIC Properties by Entity

**Decision**: Require each TIC property to belong to an existing Atlas entity via `entity_id`. Reuse the existing authenticated request and partnership/entity scope pattern so non-admin users only read permitted entity records.

**Rationale**: Existing Atlas financial records are organized around entities and memberships. Entity scoping gives the registry the same security boundary as Partnerships and Reports without inventing a new organization model.

**Alternatives considered**:

- Global registry visible to every authenticated user: rejected because it can leak ownership and tax-sensitive records.
- User-owned registry records only: rejected because the feature is intended as a shared application page, not a personal browser tool.
- A new organization table: rejected because the current app already uses entities and entity memberships.

## Decision 3: Use Admin-Only Mutations for V1

**Decision**: Allow authenticated scoped users to read registry records; require Admin role for create, update, and delete.

**Rationale**: Existing partnership asset write paths already use Admin-only mutation checks. TIC Registry includes financial/tax-sensitive records, so the conservative default is to prevent accidental edits by read-only users until a richer permission model exists.

**Alternatives considered**:

- Any scoped user can edit: rejected because current app patterns do not expose fine-grained edit permissions.
- New registry-specific roles: rejected for v1 because it increases auth complexity beyond the requested page.

## Decision 4: Model Properties, Interests, and Owners as Separate Tables

**Decision**: Use three normalized tables: `tic_properties`, `tic_interests`, and `tic_owners`, with cascading deletes from property to interests and from interest to owners.

**Rationale**: The reference HTML has a hierarchical model, and the UI needs nested reads plus independent CRUD at each level. Separate tables keep validation and cascade behavior explicit while still allowing one nested response.

**Alternatives considered**:

- Single JSONB blob per entity: rejected because partial updates, scope filtering, auditability, validation, and contract tests become harder.
- One wide table per owner row: rejected because property and interest fields would be duplicated and harder to maintain.

## Decision 5: Store Percentages as Fixed-Precision Numerics and Flag Totals

**Decision**: Store percentages as `numeric(9,4)` with `0 <= value <= 100`. Store dollars as `numeric(18,2)`. Calculate allocation totals and effective owner percentages in the API/web response, but do not require totals to equal 100% before saving.

**Rationale**: The reference behavior intentionally flags under- and over-allocation instead of blocking the record. Four decimal places match the reference input step and are enough for fractional TIC shares.

**Alternatives considered**:

- Floating point values: rejected because financial percentages should not rely on binary floating point.
- Database constraint requiring sum equals 100%: rejected because partial records and reconciliation workflows need under-allocated states.

## Decision 6: Preserve Exchange Lineage with Both Reference and Label

**Decision**: For exchange-acquired interests, store an optional `relinquished_interest_id` and an optional manual `relinquished_source_name`. Also store a `relinquished_source_label` snapshot for display if the referenced source is later deleted or unavailable.

**Rationale**: The reference HTML can link a new TIC interest to a prior interest and mark the prior interest as rolled. A display label preserves historical context even when the linked source cannot be resolved later.

**Alternatives considered**:

- Only free text source: rejected because users lose relationship tracking inside the registry.
- Only foreign key source: rejected because not every relinquished property will already exist in the registry and deleted/inaccessible sources still need display context.

## Decision 7: Translate the HTML Workflow into Atlas UI

**Decision**: Keep the functional ideas from `tic-registry.html` but implement the page using Atlas patterns: `AppShell`, `/tic-registry` route, shared header/KPI/status components, Tailwind styling, lucide icons, accessible dialogs/drawers, and React Query data loading.

**Rationale**: The request asks for a similar look and feel to the rest of the application. Copying the standalone CSS and fonts would make the page feel disconnected from Liquidity and the existing shell.

**Alternatives considered**:

- Embed the HTML file as-is: rejected because it uses local storage, inline scripts, global state, and a separate visual system.
- Build a landing/sales page: rejected because the user needs an operational registry page inside the app.

## Decision 8: Exclude Import and Export from V1

**Decision**: Do not include registry import or export workflows in v1.

**Rationale**: Import/export existed in `tic-registry.html` because the standalone page used browser storage. The production feature persists records to RDS/PostgreSQL, so backup-style import/export is unnecessary and would add avoidable permission, audit, and data-loss considerations.

**Alternatives considered**:

- Full import/replace endpoint: rejected because it creates high data-loss risk and is not needed with durable RDS persistence.
- JSON export endpoint: rejected because the user clarified it is not required for this feature.

## Decision 9: Use REST Contracts Matching Existing API Style

**Decision**: Add `/v1/tic-registry/*` REST endpoints registered from `apps/api/src/routes/index.ts`. Return nested property/interests/owners for reads and use focused POST/PATCH/DELETE endpoints for each record type.

**Rationale**: The current API is Fastify REST with Zod schemas and route groups. A nested list response avoids client-side N+1 calls and gives the web page all allocation context at once.

**Alternatives considered**:

- GraphQL: rejected because the project does not use it.
- Multiple independent list calls for properties, interests, and owners: rejected because it would add client coordination and avoidable load.
