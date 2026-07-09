# Quickstart: TIC Registry Page

## 1. Start Local Persistence

```powershell
npm install
npm run dev:db
```

Copy `apps/api/.env.example` to `apps/api/.env` if it is not already present. Local development defaults to:

```text
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/atlas
```

The API runs migrations on startup when `DATABASE_URL` is set, so `016_tic_registry.sql` should apply automatically.

## 2. Start the App

In one terminal:

```powershell
npm run dev:api
```

In another terminal:

```powershell
npm run --workspace=web dev
```

Open the web dev URL, sign in, and confirm the side navigation includes `TIC Registry` beside `Liquidity`.

## 3. Manual Acceptance Flow

1. Open `/tic-registry` from the side navigation.
2. Confirm the empty state appears if no registry records exist.
3. Create a TIC property with an entity, name/address, type, held status, acquisition date, and estimated value.
4. Add a cash-purchased TIC interest and confirm no relinquished source is required.
5. Add a 1031 exchange TIC interest with either a manual relinquished source or a reference to another registry interest.
6. Add underlying owners to each TIC interest.
7. Enter owner and TIC percentages that total under 100, exactly 100, and over 100. Confirm each allocation state displays correctly.
8. Refresh the browser and confirm the records still appear.
9. Sign in from a second browser session with access to the same entity and confirm the same records appear.

## 4. API Verification

Run focused TIC Registry tests:

```powershell
npm run test:api -- tic-registry
```

Expected coverage:

- Authenticated scoped users can list permitted entity records.
- Non-admin users cannot create, update, or delete registry records.
- Admin users can create property, interest, and owner records.
- Records persist through PostgreSQL and are returned in nested shape.
- Allocation totals and effective owner percentages are derived correctly.
- Referencing an active source interest marks it `rolled` in the same transaction.
- Stale `expectedUpdatedAt` updates return a conflict error.
- Cross-entity access returns `FORBIDDEN_ENTITY` or not found, matching existing app patterns.

## 5. Web Verification

Run focused web tests:

```powershell
npm run test:web -- tic-registry
```

Expected coverage:

- AppShell renders a `TIC Registry` navigation item and marks it active on `/tic-registry`.
- The registry page shows loading, empty, error, and loaded states.
- Summary cards show property count, TIC interest count, owner count, and estimated held value.
- Property cards display allocation bars and under/over/ok allocation messages.
- Owner rows show TIC percentage and effective property percentage.
- Dialogs validate required names, percentages, dates, and dollar values before submit.
- Delete actions require confirmation.

## 6. Build Checks

```powershell
npm run build:api
npm run build:web
```

## 7. Staging/RDS Smoke Check

After deployment to staging:

1. Confirm staging API has `DATABASE_URL` configured for RDS and `REQUIRE_DURABLE_PERSISTENCE=true`.
2. Start the staging API and confirm logs show migrations completed, including `016_tic_registry.sql`.
3. Sign in to staging as an Admin.
4. Create a TIC property, interest, and owner.
5. Restart/redeploy the API.
6. Sign in again and confirm the records remain.
7. Confirm a non-admin scoped user can view permitted records but cannot mutate them.
8. Confirm a user outside the entity scope cannot view the records.
