# Feature Specification: Partnership Asset Redesign

**Feature Branch**: `009-partnership-asset-redesign`  
**Created**: 2026-04-23  
**Status**: Draft  
**Input**: User description: "redesign partnership details page to include assets and a way to add assets and their FMV estimates," using the existing Feature 009 draft as the starting intent and a user-provided UI sample as a visual/interaction blueprint only.

## Context & Dependencies

- **Partnership Management (Spec 004)** — this feature extends the existing Partnership Detail experience from Screen #11; it does not replace the current partnership record, route structure, or partnership-first navigation model introduced in Feature 004.
- **Auth and Access (Spec 001)** — all new asset visibility and write behavior MUST inherit the existing authenticated two-factor session requirements, entity-scoped visibility rules, and Admin/User role split.
- **K-1 Ingestion (Spec 002)** and **Review and Finalization (Spec 003)** — Partnership Detail continues to surface K-1 history, latest K-1 year, and reported distributions alongside the new asset information.
- **[Screen Map](../../docs/ui/40-screen-map.md)** — Partnership Detail remains Screen #11; this feature augments that screen rather than introducing a new primary asset workspace.
- **[UI Constitution](../../specs/001-ui-constitution.md)** — the redesigned detail page and its new Assets section MUST continue to render Atlas's required UI states and shared composition patterns.
- **[Magic Patterns Core Prompts](../../docs/ui/42-magic-patterns-prompts-core.md)** and the user-provided sample UI — the sample may inform information hierarchy, section structure, and interaction pacing, but Atlas MUST continue using its own theme, shared components, typography, spacing, and state patterns rather than copying the sample literally.
- **Feature 004 FMV behavior** — the existing partnership-level FMV snapshots and summary values remain valid and MUST continue to be available on the redesigned page as a separate valuation context from the new asset-based rollup.
- **Product rules carried into this feature**:
	- Partnership remains the primary record.
	- Assets are subordinate to partnerships.
	- FMV is contextual and should only appear where it improves decisions.
	- Manual FMV entry is fully supported without Plaid.
	- Plaid integration is optional and must not block core usage.

## Clarifications

### Session 2026-04-23

- Q: Does this feature replace the existing Partnership Detail page from Feature 004? → A: No. It extends the existing page by adding an Assets section, asset valuation history/detail interactions, and asset-based summary values while preserving the existing partnership context and downstream sections.
- Q: Does asset FMV rollup replace the existing partnership-level FMV from Feature 004? → A: No. The redesigned page MUST show asset-based FMV rollup as the primary asset valuation summary when asset snapshots exist, while keeping Feature 004 partnership-level FMV visible as a separate, clearly labeled whole-partnership context and as the fallback valuation context when no asset FMV exists.
- Q: Is Plaid required to add assets or FMV snapshots? → A: No. Manual asset creation and manual FMV snapshot entry are the default and complete workflows in this feature. Any Plaid Link path is future-facing, optional, and cannot block the manual path.
- Q: Can the add-asset flow capture an initial FMV estimate at the same time? → A: Yes. The add-asset experience may optionally capture an initial FMV estimate and valuation date; when present, Atlas creates the asset and its first FMV snapshot in one workflow. Users may also skip valuation and add it later.
- Q: How should asset detail and valuation history open from the Assets section? → A: The spec requires a side panel or drawer within Partnership Detail so users stay anchored to the partnership page while reviewing a selected asset.
- Q: How should Atlas prevent duplicate assets under one partnership? → A: Assets are unique within a partnership by normalized asset name plus asset type. Atlas should block obvious duplicates but still allow similarly named holdings when the type differs.
- Q: What FMV validation rules apply in v1? → A: FMV snapshots may be zero but not negative, and valuation dates cannot be in the future.
- Q: How should asset valuation history load on the redesigned page? → A: Atlas loads asset rows with the partnership detail, then fetches full valuation history when the user opens an asset drawer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review partnership assets in context (Priority: P1)

A user opens an existing Partnership Detail page and sees the same partnership-level context introduced in Feature 004, now expanded with an Assets section that shows the partnership's assets, latest FMV per asset, source badges, and an asset-based rollup. They can understand the partnership's underlying holdings without leaving the partnership record and can open an inline asset detail/history view for deeper inspection.

**Why this priority**: This is the core value of the feature. The redesign only succeeds if users can review assets as part of the existing partnership workflow instead of treating assets as a disconnected record type.

**Independent Test**: Open a partnership that already has assets and asset FMV snapshots. The detail page MUST show the existing partnership context plus the new Assets section, MUST calculate the total latest asset FMV correctly, and MUST allow the user to expand or open an in-page asset detail/history view without leaving Partnership Detail.

**Acceptance Scenarios**:

1. **Given** a partnership with at least two assets and at least one FMV snapshot on each, **When** the user opens Partnership Detail, **Then** the page shows an Assets section, shows each asset's latest FMV, and shows a partnership-level asset rollup equal to the sum of the latest FMV snapshot for each valued asset.
2. **Given** a partnership with no assets yet, **When** the detail page loads, **Then** the existing Feature 004 sections still render normally and the Assets section renders an explicit Empty state with an add-asset call to action for Admins and a read-only empty explanation for non-Admins.
3. **Given** a partnership with assets but only some assets have FMV snapshots, **When** the Assets section renders, **Then** each unvalued asset shows an empty FMV indicator instead of `$0`, and the rollup includes only assets that have at least one recorded FMV snapshot.
4. **Given** a user opens an asset detail/history subview or expansion, **When** that view renders, **Then** they can see the asset's key metadata, latest FMV summary, and FMV snapshot history in the context of the parent partnership without navigating to a separate primary page.

---

### User Story 2 - Admin adds a manual asset to a partnership (Priority: P2)

An Admin reviewing a partnership realizes a holding has not yet been represented in Atlas. From the redesigned Partnership Detail page, they add the asset manually, classify its type, optionally enter an initial FMV estimate, and save it directly under the partnership so it immediately appears in the Assets section.

**Why this priority**: Assets are subordinate to partnerships, so the partnership detail workflow must support creating them directly. Manual asset entry is the core write path and must work independently of any future connected-account capability.

**Independent Test**: As an Admin on a partnership in scope, submit the add-asset flow with valid required inputs. The new asset MUST appear under that partnership immediately, display a Manual source badge, and show either its initial FMV estimate or an empty FMV state depending on the form inputs.

**Acceptance Scenarios**:

1. **Given** an Admin is viewing an in-scope partnership, **When** they submit a valid add-asset form without valuation fields, **Then** Atlas creates a new asset subordinate to that partnership, shows it in the Assets section immediately, and labels it with a Manual source badge and an empty latest FMV state.
2. **Given** an Admin is viewing an in-scope partnership, **When** they submit a valid add-asset form including an initial FMV estimate and valuation date, **Then** Atlas creates the asset and its first FMV snapshot in one workflow, shows the asset in the Assets section immediately, and includes that snapshot in the partnership's total latest asset FMV rollup.
3. **Given** an Admin omits required asset information such as asset name or asset type, **When** they attempt to submit, **Then** Atlas prevents the save and displays deterministic validation feedback without losing the rest of the Partnership Detail context.
4. **Given** a non-Admin User opens the same partnership, **When** they view the Assets section, **Then** they can review existing assets but do not see the add-asset action, and any direct write attempt is rejected by the server with `403`.

---

### User Story 3 - Admin records asset FMV snapshots and reviews valuation history (Priority: P3)

After an asset exists, an Admin records one or more FMV snapshots for that asset over time. The latest FMV becomes visible on the asset row, the partnership-level asset rollup updates, and the asset's detail/history view shows the full append-only valuation history with source labels, valuation dates, and notes.

**Why this priority**: Adding assets without valuations leaves the redesign incomplete. FMV snapshots turn the asset list into an operational tool and support the page's valuation summary.

**Independent Test**: As an Admin, add an FMV snapshot to an existing asset and confirm that the asset's latest FMV updates, the partnership-level asset rollup recalculates, and the asset history shows the new entry at the top without overwriting prior snapshots.

**Acceptance Scenarios**:

1. **Given** an Admin selects an asset with no FMV history, **When** they record a valid FMV snapshot with an as-of date, amount, source, and optional note, **Then** the asset's latest FMV becomes visible and the partnership's total latest asset FMV updates on the same detail page.
2. **Given** an asset already has one or more FMV snapshots, **When** an Admin records another snapshot, **Then** the prior snapshots remain visible in history, the new one becomes the latest FMV if it is the most recently recorded snapshot, and Atlas does not overwrite or edit prior history.
3. **Given** two FMV snapshots are recorded for the same asset on the same valuation date, **When** the asset history renders, **Then** both snapshots remain in the append-only history and Atlas uses the most recently recorded one as the latest display value.
4. **Given** a non-Admin User opens the asset history, **When** they review the asset, **Then** they can see FMV history but do not see the add-FMV action and cannot create snapshots through the API.

---

### User Story 4 - Future connected-account path remains optional and non-blocking (Priority: P4)

A user reviewing partnership assets sees that Atlas is prepared for future connected-account onboarding, such as Plaid Link, but the current feature still works completely through manual entry. The page may show a placeholder or future path for connected assets, and any connected or imported assets that exist later will fit into the same section with clear source badges.

**Why this priority**: The feature needs a forward-compatible path for connected accounts without dragging the current scope into external-integration work or making manual workflows dependent on third parties.

**Independent Test**: Open the Assets section in an environment with no connected-account integration enabled. The page MUST still support manual asset and manual FMV workflows end to end, and any Link Account placeholder MUST not block or interrupt those actions.

**Acceptance Scenarios**:

1. **Given** the Assets section shows a future Link Account or equivalent connected-source placeholder, **When** a user views it, **Then** Atlas clearly communicates that the capability is optional or coming later and keeps the manual add-asset path fully available.
2. **Given** no connected-account integration is configured or enabled, **When** an Admin uses the redesigned detail page, **Then** they can still add assets and record FMV snapshots manually with no dependency on external availability.
3. **Given** Atlas later contains assets or valuations originating from an imported or Plaid-connected source, **When** those records appear on Partnership Detail, **Then** they render inside the same Assets section and asset history patterns with distinct source badges rather than requiring a separate disconnected experience.

---

### Edge Cases

- **No assets yet** — the redesigned page MUST preserve the existing Feature 004 detail experience and add an explicit asset empty state rather than making the page feel incomplete or broken.
- **Asset exists with no FMV** — the asset row MUST show `—` or equivalent empty value rather than `$0`, and the partnership-level asset rollup MUST not imply the asset has been valued.
- **No assets have FMV yet** — the partnership-level total latest asset FMV summary MUST show an empty indicator rather than `$0`.
- **Mixed coverage** — if only some assets have FMV snapshots, the rollup MUST sum only the latest FMV for valued assets and leave unvalued assets visibly unvalued.
- **Legacy partnership-level FMV and asset rollup disagree** — Atlas MUST show both values with clear labels and MUST NOT silently reconcile, replace, or hide either value in v1.
- **Same-day corrections** — multiple FMV snapshots for the same asset on the same valuation date MUST remain append-only and visible in history.
- **Asset section failure** — if asset-specific data fails to load but the parent partnership detail succeeds, Atlas MUST preserve the rest of the partnership page and render a localized asset error state with retry rather than failing the entire detail page.
- **Permission boundaries** — users outside the parent partnership's scope MUST not be able to view or write asset data; the server returns `403` for out-of-scope access.
- **Manual-only operation** — absence of Plaid or any other connected-account capability MUST never block asset creation or FMV entry.
- **Responsive behavior** — the asset list and in-page detail/history view MUST remain usable on narrow viewports through Atlas's existing responsive table and stacking patterns rather than clipping critical valuation fields.
- **Stale valuation rules** — Atlas MUST show the latest FMV valuation date, but any automated stale-value warning logic is deferred and is not required to ship this feature.

## Requirements *(mandatory)*

### Functional Requirements — Partnership Detail Redesign

- **FR-001**: The feature MUST extend the existing Partnership Detail experience from Feature 004 on the existing partnership route; it MUST NOT introduce a new standalone asset page as the primary user workflow.
- **FR-002**: The redesigned page MUST preserve the existing partnership header, entity context, status context, and existing non-asset detail sections from Feature 004 while adding assets as a first-class subsection of the partnership record.
- **FR-003**: The user-provided UI sample MUST be treated as a visual and interaction blueprint only. Atlas MUST retain its own theme, typography, spacing, motion, shared components, and page composition patterns instead of copying the sample literally.
- **FR-004**: The redesigned Partnership Detail summary area MUST surface the following values clearly and simultaneously:
	- Total Latest Asset FMV
	- Asset Count
	- Latest Partnership-Level FMV
	- Latest Reported Distribution
	- Latest K-1 Year
- **FR-005**: Total Latest Asset FMV MUST equal the sum of the latest FMV snapshot for each asset under the partnership that has at least one FMV snapshot recorded.
- **FR-006**: If no asset under the partnership has an FMV snapshot, Total Latest Asset FMV MUST render as an explicit empty indicator rather than `$0`.
- **FR-007**: The existing partnership-level FMV from Feature 004 MUST remain visible on the redesigned page as a separate, clearly labeled whole-partnership valuation context; asset-based FMV rollup supplements it and does not replace it.
- **FR-008**: Atlas MUST NOT automatically derive partnership-level FMV from asset FMV snapshots or automatically distribute partnership-level FMV into asset records in this feature.
- **FR-009**: When both asset-based FMV rollup and partnership-level FMV are present and differ, Atlas MUST display both values with clear labeling and MUST NOT silently reconcile or hide the difference.
- **FR-010**: The Partnership Detail page MUST include an Assets section that lists every asset subordinate to the partnership and makes assets navigable within the partnership context rather than as peer records to partnerships.
- **FR-011**: Each asset in the Assets section MUST display, at minimum, asset name, asset type, source badge, latest FMV, latest FMV valuation date, and an affordance to open an asset detail/history subview or expansion.
- **FR-012**: The asset detail/history experience MUST open in a side panel or drawer within Partnership Detail so that users remain in the partnership workflow while reviewing asset history.
- **FR-013**: The Assets section MUST visibly support the following states: no assets yet, has manual assets only, has imported or Plaid assets, no FMV yet, and populated mixed-valuation assets.
- **FR-014**: The page and the Assets section MUST honor Atlas's required UI states: loading, empty, error, partial, populated, and permission-limited.
- **FR-015**: Partnership Detail MUST load asset rows with the parent page data, but Atlas MAY fetch full asset valuation history only when a user opens a specific asset drawer.

### Functional Requirements — Asset Creation and Asset Metadata

- **FR-020**: Admins MUST be able to add a new asset directly from Partnership Detail.
- **FR-021**: Every asset created by this feature MUST belong to exactly one partnership and MUST NOT be created as an independent top-level record outside a partnership workflow.
- **FR-022**: The add-asset flow MUST capture, at minimum, asset name and asset type, with source type defaulting to `manual` for user-entered assets.
- **FR-023**: The add-asset flow MAY capture supporting descriptive information such as description or notes, but such detail MUST remain subordinate to the partnership and MUST NOT displace the partnership as the primary record.
- **FR-024**: The add-asset flow MUST support optional initial valuation fields. When an Admin supplies an initial FMV estimate and valuation date, Atlas MUST create the asset and its first FMV snapshot as one user workflow.
- **FR-025**: Newly created assets in v1 MUST be operationally usable without any external account-linking setup.
- **FR-026**: After a successful add-asset action, the new asset MUST appear immediately in the Assets section with a Manual source badge and either its initial latest FMV or an empty latest FMV indicator depending on the submitted data.
- **FR-027**: The system MUST validate required asset fields and return deterministic validation feedback without forcing the user to leave Partnership Detail.
- **FR-028**: Atlas MUST support asset source labeling that distinguishes, at minimum, manually entered assets, imported assets, and Plaid-linked assets so that future connected assets can fit into the same model without redefining the UI.
- **FR-029**: Asset type MUST be captured and displayed consistently using an Atlas-supported controlled classification so that users can distinguish what kind of holding each asset represents.
- **FR-030**: Atlas MUST enforce uniqueness for assets within a partnership by normalized asset name plus asset type, returning deterministic validation feedback when an Admin attempts to create an obvious duplicate.

### Functional Requirements — Asset FMV Snapshots and Valuation History

- **FR-040**: Admins MUST be able to record an FMV snapshot for any asset directly from the Assets section or the asset detail/history view.
- **FR-041**: Manual FMV entry MUST be supported for every asset regardless of whether the asset was created manually, imported, or later linked through Plaid.
- **FR-042**: Each FMV snapshot MUST capture, at minimum, a valuation date, FMV amount, valuation source type, and optional note.
- **FR-043**: The snapshot model MUST support an optional confidence label field for future imported or model-assisted valuation contexts, but a confidence label is not required for manual entry.
- **FR-043a**: FMV amounts MAY be zero but MUST NOT be negative.
- **FR-043b**: Valuation dates MUST NOT be in the future.
- **FR-044**: Latest FMV per asset MUST be defined as the most recently recorded FMV snapshot for that asset, and Atlas MUST use that latest snapshot when computing the partnership's total latest asset FMV.
- **FR-045**: Asset FMV snapshots MUST be append-only. This feature MUST NOT expose edit or delete behavior for existing asset FMV snapshots.
- **FR-046**: Atlas MUST allow multiple FMV snapshots for the same asset on the same valuation date; all such snapshots MUST remain visible in history.
- **FR-047**: The asset detail/history view MUST display FMV snapshots in reverse chronological order of when they were recorded, along with their valuation date, amount, source label, optional confidence label, and note when present.
- **FR-048**: After an FMV snapshot is recorded successfully, Atlas MUST refresh both the asset's latest FMV display and the partnership's total latest asset FMV without requiring the user to leave or reload the page manually.
- **FR-049**: The existing partnership-level FMV workflow from Feature 004 MUST remain available as a separate valuation context and MUST NOT be removed, overwritten, or reinterpreted by the asset FMV workflow in this feature.

### Functional Requirements — Future Plaid Path

- **FR-050**: The Assets section MUST provide a non-blocking placeholder, affordance, or visible path for future connected-account onboarding such as Plaid Link.
- **FR-051**: Any future Link Account placeholder shown in this feature MUST clearly communicate that it is optional, future-facing, or unavailable without blocking the manual add-asset path.
- **FR-052**: The absence, failure, or non-configuration of Plaid functionality MUST NOT block, disable, or degrade the manual asset and manual FMV workflows required by this feature.
- **FR-053**: If Plaid-sourced or imported asset data exists now or later, Atlas MUST display it using the same asset list, source badges, and asset history patterns as manually entered assets rather than creating a separate disconnected experience.

### Functional Requirements — Access, Auditability, and Page Integrity

- **FR-060**: Asset visibility MUST inherit the same partnership and entity scope rules defined in Feature 004. A user who cannot view the parent partnership MUST not be able to view its assets or asset FMV history.
- **FR-061**: Add-asset and add-asset-FMV actions MUST be Admin-only in both the UI and the API. Non-Admin users may view asset information when they have partnership access, but any write attempt MUST return `403`.
- **FR-062**: All new create mutations introduced by this feature MUST be auditable. At minimum, Atlas MUST record auditable events for `partnership.asset.created` and `partnership.asset.fmv_recorded`.
- **FR-063**: Audit events for asset writes MUST capture sufficient before/after context to reconstruct what asset or valuation was added and under which partnership it occurred.
- **FR-064**: Asset-specific failures MUST be localized when possible. If the asset list or asset-history data fails independently, Atlas MUST preserve the rest of the Partnership Detail page and show a localized error state with retry.
- **FR-065**: The redesigned page MUST preserve existing back-navigation, entity linking, and overall partnership-detail composition conventions established in Feature 004.
- **FR-066**: This feature MUST preserve Atlas's authenticated-session and role-gating requirements from existing features, including existing two-factor session expectations where applicable.
- **FR-067**: FMV values shown by this feature MUST remain contextual to the Partnership Detail experience and its subordinate asset views; this feature does not require asset-level FMV to appear on unrelated list or cross-portfolio surfaces.

## Key Entities

- **Partnership** (existing, primary record) — the parent record introduced in Feature 004. The partnership remains the owning context for the redesigned page, asset list, partnership-level FMV context, K-1 history, and all subordinate asset activity.
- **PartnershipAsset** (new, subordinate record) — represents a holding attached to a single partnership. Key attributes include `id`, `partnership_id`, `name`, `asset_type`, `source_type`, `description`, `plaid_item_id` nullable, `plaid_account_id` nullable, `status`, `created_at`, and `updated_at`. Assets cannot exist without a parent partnership.
- **AssetFmvSnapshot** (new, append-only subordinate record) — represents a point-in-time FMV estimate for a single asset. Key attributes include `id`, `asset_id`, `valuation_date`, `fmv_amount`, `source_type`, `confidence_label` nullable, `notes`, `created_at`, and `updated_at`. Multiple snapshots may exist for the same asset and the same valuation date.
- **Partnership-Level FmvSnapshot** (existing, Feature 004 context) — represents a whole-partnership valuation not tied to a specific asset. It remains visible on the redesigned page as a separate context and is not automatically transformed into asset FMV snapshots.
- **AuditEvent** (existing) — the append-only audit record that captures asset creation and asset FMV creation activity in the same audit model used by other Atlas features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open an in-scope Partnership Detail page and identify the partnership's total latest asset FMV, asset count, and latest partnership-level FMV within 30 seconds on first review.
- **SC-002**: An Admin can add a manual asset to an in-scope partnership in under 2 minutes without relying on any external integration.
- **SC-003**: An Admin can record a manual FMV snapshot for an existing asset in under 1 minute once the asset is selected.
- **SC-004**: In automated regression tests, 100% of partnership asset rollup assertions match the sum of the latest FMV snapshot per valued asset for that partnership.
- **SC-005**: In automated authorization tests, 100% of out-of-scope asset reads and non-Admin asset write attempts are rejected.
- **SC-006**: In partnerships with no assets, the redesigned detail page continues to render the existing Feature 004 experience successfully with the Assets section in an explicit empty state.
- **SC-007**: In partnerships with assets but no Plaid integration enabled, manual asset creation and manual FMV entry remain fully usable with no blocked primary workflow.
- **SC-008**: In usability or acceptance testing, users can open an asset detail/history view and locate the latest FMV entry for a selected asset on the first attempt in at least 90% of test runs.

## Assumptions

- The existing Partnership Directory and Entity Detail experiences from Feature 004 remain in place; this feature is focused on redesigning Partnership Detail and does not require broader cross-screen FMV model changes in v1.
- Existing partnership-level FMV values from Feature 004 remain authoritative as whole-partnership context and continue to exist even when asset-level FMV is introduced.
- Atlas will not automatically reconcile differences between partnership-level FMV and asset-based FMV rollups in v1; users see both contexts clearly labeled when both exist.
- Asset edit, delete, archive, reassignment, or advanced lifecycle management are out of scope for this feature; v1 centers on viewing assets, adding assets, and recording append-only asset FMV history.
- Plaid integration itself, including consent, credential management, account selection, and data synchronization, is out of scope for this feature; only a non-blocking placeholder or path is required here.
- Asset-type taxonomy can be finalized during planning, but the shipped feature must use a consistent Atlas-supported classification rather than free-form ad hoc labeling alone.
- Automated stale-FMV warning rules, valuation confidence scoring, and cross-page propagation of asset-level FMV are deferred unless a later feature specifies them explicitly.