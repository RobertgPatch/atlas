# Quickstart — Partnership Management

**Feature**: `004-partnership-management`
**Purpose**: Let a developer or reviewer validate the five user stories end-to-end against a local dev stack.

## Prerequisites

- You have Features 001 (Auth), 002 (K-1 Ingestion), and 003 (Review & Finalization) running locally.
- Postgres reachable via the settings in `apps/api/src/config.ts`.
- Both apps started: `pnpm --filter @atlas/api dev` and `pnpm --filter @atlas/web dev`.
- You have two users seeded:
    - `admin@atlas.com` (role `Admin`)
    - `user@atlas.com` (role `User`, with `entity_memberships` to a single entity — call it Entity A)

## Step 1 — Apply the migration

From `apps/api`:

```powershell
pnpm run migrate   # runs 004_partnership_management.sql along with earlier migrations
```

What this does (see `data-model.md` §4):
- Drops `unique (partnership_id, valuation_date)` on `partnership_fmv_snapshots` so multiple snapshots per as-of date are allowed.
- Adds a `CHECK` constraint pinning `partnerships.status` to `ACTIVE | PENDING | LIQUIDATED | CLOSED`.
- Adds three indexes supporting "latest finalized K-1 per partnership", "latest FMV by created_at", and "(entity_id, lower(name)) conflict".

## Step 2 — Seed minimum data

If your dev seed does not already include them, create:

- Entity A with one existing partnership `P-Alpha` under it.
- A finalized K-1 for `P-Alpha` for tax year 2024 with `reported_distribution_amount = 42 000`.
- A single FMV snapshot for `P-Alpha` at `valuation_date = 2024-12-31`, `fmv_amount = 250 000`, `source_type = 'manager_statement'`.

## Step 3 — Story P1: Non-Admin browses the Directory

1. Sign in as `user@atlas.com`.
2. Navigate to `/partnerships`.
3. Expect:
    - `AppShell` chrome, `PageHeader` titled "Partnerships".
    - KPI strip shows `Total Partnerships = 1`, `Total Distributions = $42,000`, `Total FMV = $250,000`.
    - Table shows `P-Alpha | Entity A | <asset class> | 2024 | $42,000 | $250,000 | Active`.
    - "Add Partnership" button is **not** rendered (Admin-only).
    - Typing `alp` in search narrows the table to `P-Alpha` within 500 ms; KPIs recompute to the same values.
4. Type `zzz` in search → table shows the filtered-empty state ("No partnerships match these filters"), KPIs show `0 | $0 | $0`.
5. Clear search. Click "Export" → a CSV download starts; open it; the seven columns listed in FR-014 match the visible table.

## Step 4 — Story P2: Open Partnership Detail

1. Still as `user@atlas.com`, click the `P-Alpha` row.
2. URL becomes `/partnerships/<id>`.
3. Expect:
    - `PageHeader` shows `P-Alpha` with back-link to Directory. No "Edit" button (Admin-only).
    - Four KPI cards: `Latest K-1 Year = 2024`, `Latest Distribution = $42,000`, `Latest FMV = $250,000`, `Cumulative Reported Distributions = $42,000`.
    - Five sections render in order: K-1 History (one row: 2024, Finalized, $42,000), Expected Distribution History (one row for 2024), FMV Snapshots (one row, 2024-12-31 / $250,000 / Manager Statement), Notes, Activity Detail Preview.
    - Clicking the K-1 row opens the K-1 Review Workspace from Feature 003.

## Step 5 — Story P3: Entity Detail

1. From Partnership Detail, click the breadcrumb / entity link `Entity A`.
2. URL becomes `/entities/<id>`.
3. Expect:
    - Entity rollup: `1 partnership | $42,000 distributions | $250,000 FMV`.
    - Embedded partnership list shows the same single row (`P-Alpha`), reusing the Directory row shape.

## Step 6 — Story P4: Admin adds a partnership

1. Sign out; sign in as `admin@atlas.com` (completing MFA).
2. Navigate to `/partnerships`. "Add Partnership" button is visible.
3. Click it. Fill:
    - Entity: `Entity A`
    - Name: `P-Beta`
    - Asset Class: `Venture`
    - Status: `Pending`
    - Notes: `Closing 2026-05-01`
4. Submit → toast success; dialog closes; table now shows `P-Beta` with Status `Pending`, empty Latest K-1 Year, `—` Distribution, `—` FMV.
5. KPI `Total Partnerships` increments to `2`; `Total Distributions` and `Total FMV` are unchanged.
6. Try to re-submit the same name under the same entity → expect an inline 409 validation message "A partnership with this name already exists for this entity."
7. Confirm `audit_events` got a new row: `event_name = partnership.created`, `object_id = <new P-Beta id>`.

## Step 7 — Story P5: Admin records an FMV snapshot

1. Still as Admin, click `P-Alpha` to open Partnership Detail.
2. In the FMV Snapshots section, click "Record FMV". Fill:
    - As-of date: `2025-06-30`
    - Amount (USD): `275000`
    - Source: `Valuation (409A)`
    - Note: `Mid-year re-mark`
3. Submit → snapshot list refreshes; newest row is on top; `Latest FMV` KPI updates to `$275,000`.
4. Record another snapshot with the **same** `2025-06-30` as-of date at `$280,000` → both rows appear (append-only); `Latest FMV` now `$280,000`.
5. Confirm `audit_events` got two new `partnership.fmv_recorded` rows.
6. Confirm the Directory `Total FMV` for the filtered set reflects `$280,000` for `P-Alpha` when you go back to `/partnerships`.

## Step 8 — Negative test: scope enforcement

1. Sign out; sign back in as `user@atlas.com` (only scoped to Entity A).
2. If a partnership exists under Entity B (create one as Admin beforehand if needed), open the browser devtools network tab and hit `GET /v1/partnerships/<entity-b-partnership-id>` directly.
3. Expect `403` (not `404`), matching FR-061.

## Step 9 — Cleanup / rollback

The migration is idempotent — rerunning it is safe. To roll back:

```sql
drop index if exists k1_reported_distributions_partnership_year_idx;
drop index if exists partnerships_entity_name_idx;
drop index if exists partnership_fmv_snapshots_partnership_created_idx;
alter table partnerships drop constraint if exists partnerships_status_check;
-- Re-adding the FMV unique constraint requires first deleting any duplicate-date rows.
```

## Success Criteria Mapped

- SC-001 Directory < 2 s → observed in Step 3.
- SC-002 Search < 500 ms → observed in Step 3.
- SC-003 Detail < 1 s → observed in Step 4.
- SC-004 Entity rollup correct → observed in Step 5.
- SC-005 Admin add works → observed in Step 6.
- SC-006 FMV recorded + latest reflects → observed in Step 7.
- SC-007 CSV export completes < 3 s and values match screen → observed in Step 3 (click Export).
- SC-008 Zero cross-scope items in API responses → verified via automated scope tests + Step 8.
- SC-009 Six UI-Constitution states render on all three screens → verify Loading / Empty / Error states via Storybook fixtures for `PartnershipDirectory`, `PartnershipDetail`, and `EntityDetail` before ship.
- SC-007 CSV export < 3 s → observed in Step 3.
- SC-008 Scope enforced with 403 → observed in Step 8.
- SC-009 Audit events written → spot-checked in Step 6 and Step 7.
