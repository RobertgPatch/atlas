# Quickstart — Partnership Asset Redesign

Manual walkthrough for validating Feature 009 end-to-end on a local development stack.

## 0. Prerequisites

- Feature 004 is already present locally and the existing Partnership Detail route works.
- If you are running with PostgreSQL, apply prior migrations through `004_partnership_management.sql` first.
- Seeded users exist for:
  - `admin@atlas.com` with role `Admin`
  - `user@atlas.com` with role `User`
- You have at least one entity and partnership in scope for both users.

## 1. Apply the new migration

Apply `apps/api/src/infra/db/migrations/009_partnership_assets.sql` with your normal Postgres workflow. Example using `psql`:

```powershell
psql "$env:DATABASE_URL" -f "d:\Projects\atlas\apps\api\src\infra\db\migrations\009_partnership_assets.sql"
```

What this adds:

- `partnership_assets`
- `partnership_asset_fmv_snapshots`
- lookup indexes for partnership-scoped asset rows and latest-by-created-at asset valuations

## 2. Seed fixture data

Use the updated partnership fixtures once implementation lands:

```powershell
npx tsx d:\Projects\atlas\apps\api\src\infra\db\seed\004_partnership_fixtures.ts
```

Expected fixture coverage:

- At least one partnership with no assets
- At least one partnership with two or more assets and FMV snapshots
- At least one asset with no FMV snapshot
- At least one partnership-level FMV value that differs from the asset rollup

## 3. Start the apps

```powershell
# Terminal A
cd d:\Projects\atlas\apps\api
npm run dev

# Terminal B
cd d:\Projects\atlas\apps\web
npm run dev
```

Sign in through the web app and navigate to the existing Partnership Directory, then open a partnership detail page.

## 4. Story P1 — Review assets in context

1. Sign in as `user@atlas.com`.
2. Open a partnership that has seeded assets and asset FMV snapshots.

**Expected**:

- The existing partnership header, K-1 context, distribution history, partnership-level FMV section, and other Feature 004 sections still render.
- A new Assets section appears on the same page.
- The Assets section shows:
  - total latest asset FMV
  - asset count
  - one row per asset with source badge, latest FMV, and valuation date
- Partnership-level FMV remains visible separately and can differ from the asset rollup.

3. Click an asset row.

**Expected**:

- An in-page drawer opens without leaving Partnership Detail.
- The drawer shows asset metadata, latest FMV summary, and valuation history.
- Closing the drawer returns you to the same scrolled detail page.

## 5. Story P2 — Admin adds a manual asset without valuation

1. Sign out and sign in as `admin@atlas.com`.
2. Open a partnership detail page.
3. Click **Add Asset**.
4. Enter a valid name and asset type, leave valuation empty, and submit.

**Expected**:

- The new asset appears immediately in the Assets section.
- The row shows a Manual source badge.
- Latest FMV renders as an empty indicator, not `$0`.
- The page remains on the same partnership detail route.

## 6. Story P2 — Admin adds a manual asset with an initial FMV estimate

1. Open **Add Asset** again.
2. Enter a valid name and asset type.
3. Supply an initial valuation date and FMV amount.
4. Submit.

**Expected**:

- The asset is created and visible immediately.
- The latest FMV on that asset row matches the submitted estimate.
- The Assets summary rollup updates without a manual reload.

## 7. Story P3 — Admin records asset FMV history and same-day correction

1. From the Assets section row action or an existing asset drawer, click **Record FMV**.
3. Submit a valid valuation.

**Expected**:

- The asset row refreshes with the new latest FMV.
- The drawer history shows the new snapshot at the top.
- The page-level asset rollup updates.

4. Record a second FMV snapshot using the same valuation date but a different amount.

**Expected**:

- Both snapshots remain visible in history.
- The most recently recorded snapshot becomes the latest visible FMV.
- No prior snapshot is overwritten.

## 8. Story P4 — Optional future Plaid path stays non-blocking

1. View the Assets section in an environment with no connected-account integration configured.

**Expected**:

- Manual Add Asset and section-level or drawer-level Record FMV actions remain available to Admins.
- Any Link Account or connected-source affordance is visibly optional or future-facing.
- Manual workflows remain fully usable even if the placeholder is hidden or inactive.

## 9. Negative checks

### Duplicate asset validation

1. As Admin, try to create another asset under the same partnership with the same name and asset type as an existing row.

**Expected**:

- The API returns `409 DUPLICATE_PARTNERSHIP_ASSET`.
- The UI shows deterministic validation feedback and keeps the user on Partnership Detail.

### Invalid FMV validation

1. Try to record an FMV with a negative amount.
2. Try to record an FMV with a future valuation date.

**Expected**:

- Both saves are rejected with validation feedback.
- No history row is created.

### Localized asset-history failure and retry

1. Open an asset drawer.
2. Force the asset-detail or asset-history request to fail in dev tools or with a temporary API stub.
3. Trigger the drawer fetch again.

**Expected**:

- The parent Partnership Detail page remains visible and usable.
- The drawer shows a localized error state rather than collapsing the whole page.
- A retry action is available inside the drawer or history region.
- Retrying after the failure is removed reloads the asset metadata and valuation history successfully.

### Non-Admin restrictions

1. Sign in as `user@atlas.com`.
2. Open a partnership with assets.

**Expected**:

- Asset rows and drawer history are visible.
- Add Asset and Record FMV actions are not shown.
- Direct write attempts to the new asset endpoints return `403`.

## 10. Responsive validation

1. Resize the browser to a narrow viewport width representative of tablet and mobile.
2. Reopen a partnership with assets and open an asset drawer.

**Expected**:

- The Assets section remains readable without clipping the critical FMV and valuation-date fields.
- The Add Asset and Record FMV actions remain reachable.
- The asset drawer remains usable on narrow viewports and does not hide the retry or close controls.
- Whole-partnership FMV and asset-rollup values remain visually distinct at the smaller layout.

## 11. Performance smoke checks

1. With seeded data approximating the plan targets, load a partnership containing about 25 assets.
2. Observe the network timings for `GET /v1/partnerships/:partnershipId/assets`.
3. Open an asset drawer and observe the network timings for `GET /v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots`.

**Expected**:

- Asset rows become visible within the `1.5 s` initial-render target called out in `plan.md`.
- Asset history becomes visible within the `500 ms` drawer-load target called out in `plan.md`.
- Recording an asset FMV snapshot refreshes the row and rollup without a manual reload and settles within the `1 s` post-response target.

## 12. Success criteria mapping

- SC-001: The page exposes total latest asset FMV, asset count, and partnership-level FMV in one review.
- SC-002: Manual asset creation completes from Partnership Detail without an external integration.
- SC-003: Manual asset FMV entry completes from the asset drawer or section action.
- SC-004: Asset rollup equals the sum of latest valued asset snapshots.
- SC-005: Out-of-scope asset reads and non-Admin writes are rejected.
- SC-006: Partnerships with no assets still show the existing Feature 004 detail experience plus an explicit asset empty state.
- SC-007: Manual asset workflows work with no Plaid integration enabled.
- SC-008: Users can locate the latest asset FMV from the drawer on first attempt.