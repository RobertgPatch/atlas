# Quickstart: K-1 Ingestion and Processing Dashboard

Audience: engineers picking up the implementation of Feature 002.

## 1. What exists already

- `apps/api` and `apps/web` from Feature 001 are running; sessions are cookie-based after MFA.
- Seeded accounts: `admin@atlas.com` / `password123`, `user@atlas.com` / `password123`. Both require MFA enrollment on first login.
- `apps/web/src/pages/K1Dashboard.tsx` exists as a placeholder (Magic Patterns seed).
- The Magic Patterns seed for this screen is captured at `specs/002-k1-ingestion/reference/k1-dashboard.magic-patterns.tsx` — **do not import from production code**; per UI Constitution §10 it is a starting point.

## 2. What you are building

A production implementation of Screen #5 composed from the Atlas catalog components only:

```
AppShell
└─ PageHeader (title + Refresh + Export + Upload Documents)
   ├─ KpiCard x5          (Uploaded, Processing, Needs Review, Ready for Approval, Finalized)
   ├─ FilterToolbar       (search + Status + Tax Year + Entity + Clear all + result count)
   └─ DataTable           (Document Name, Partnership, Entity, Tax Year, Status [StatusBadge],
                           Issues, Uploaded, overflow [RowActionMenu])
                          │
                          ├─ LoadingState (skeleton rows)
                          ├─ EmptyState   ("no documents" — upload CTA)
                          ├─ EmptyState   ("no matches" — adjust filters, no upload CTA)
                          └─ ErrorState   (retry)
```

Plus:

- `K1UploadDialog` composed from shared dialog/form primitives.
- `K1DuplicatePrompt` (Replace / Cancel) shown when the upload returns `409 DUPLICATE_K1`.
- Inline parse-error indicator on the `Processing` status badge (icon + tooltip).

Do **not** reintroduce:

- A sixth status badge (parse errors stay in `Processing`).
- A second UI framework (Tailwind + headless primitives only).
- Client-side inference of lifecycle status.

## 3. Step-by-step build order

1. **Run the new migration** — `apps/api/src/infra/db/migrations/002_k1_ingestion.sql`:
   - Adds `parse_error_code`, `parse_error_message`, `parse_attempts`, `superseded_by_document_id`, `uploader_user_id` to `k1_documents`.
   - Creates `document_versions`, `entity_memberships`, and the `v_k1_active_documents` view.
2. **Add the shared types** at `packages/types/src/k1-ingestion.ts` (mirrors `contracts/k1-ingestion.openapi.yaml`) and re-export from `packages/types/src/index.ts`.
3. **API server module** under `apps/api/src/modules/k1/`:
   - `k1.schemas.ts` — Zod request/response schemas.
   - `k1.repository.ts` — entity-scoped queries using `v_k1_active_documents`.
   - `list.handler.ts`, `kpis.handler.ts`, `detail.handler.ts`.
   - `upload.handler.ts` — multipart; duplicate-detect → `409 DUPLICATE_K1`; on Replace, do the supersede transaction.
   - `reparse.handler.ts` — eligibility check; kicks the extractor.
   - `storage/localPdfStore.ts` — filesystem-backed.
   - `extraction/K1Extractor.ts` interface + `stubExtractor.ts` V1 impl. Extraction runs via `setImmediate` and updates status/issues/audit in its own transactions.
   - `k1.routes.ts` — mount all the above under `/v1/k1`.
   - Register the module from `apps/api/src/routes/index.ts`.
4. **Web feature module** under `apps/web/src/features/k1/`:
   - `api/k1Client.ts` — thin fetch wrapper over `/v1/k1/*`; throws `ApiError` for non-2xx.
   - Hooks:
     - `useK1List` — `useQuery(['k1-list', filters])`, `refetchOnWindowFocus: false`.
     - `useK1Kpis` — `useQuery(['k1-kpis', scope])` — scope = `{ taxYear, entityId }` only.
     - `useK1Upload` — `useMutation` that either returns `{ status: 'UPLOADED', k1DocumentId }` or `{ status: 'DUPLICATE', existing }`. On success invalidates `['k1-list']` + `['k1-kpis']`.
     - `useK1Export` — thin wrapper that triggers file download of `/v1/k1/export.csv?...`.
   - Components:
     - `K1KpiRow.tsx`, `K1DocumentsTable.tsx`, `K1FilterBar.tsx`, `K1UploadDialog.tsx`, `K1DuplicatePrompt.tsx` — each composes catalog components, no local re-implementations.
5. **Route wiring** in `apps/web/src/pages/K1Dashboard.tsx`:
   - Gate with the existing session check (Feature 001). An authenticated but entity-less user renders permission-restricted via `EmptyState`.
   - Mount `K1KpiRow` + `K1FilterBar` + `K1DocumentsTable` and connect via the hooks.
6. **Tests** alongside implementation:
   - API: one contract test per endpoint + one integration test for the supersede flow + one authz test that confirms cross-entity reads 403.
   - Web: states test (`loading/empty/filtered-empty/error/populated/permission-restricted`), filter behavior test, upload happy-path test, duplicate-prompt test.

## 4. Running locally

```powershell
# One-time
cd d:\Projects\atlas
npm install

# Terminal A — API (port 3000)
cd apps\api
npm run dev

# Terminal B — Web (port 5175 per Feature 001 defaults)
cd apps\web
npm run dev
```

Open http://localhost:5175, sign in (`admin@atlas.com` / `password123` + MFA), navigate to the K-1 Processing route in the sidebar.

## 5. Seed data for happy-path demo

After the API is up, POST a few uploads as an entitled user:

```powershell
# Curl is easiest for multipart in PowerShell 7+
curl.exe -X POST http://localhost:3000/v1/k1/upload `
  -b "atlas_session=<cookie>" `
  -F "file=@./fixtures/sample-k1.pdf" `
  -F "partnershipId=<uuid>" `
  -F "entityId=<uuid>" `
  -F "taxYear=2024"
```

Expected timeline (aligns with SC-010):

- `t+0s` — Upload succeeds; row visible as `Uploaded`, `Uploaded` KPI increments.
- `t+~1s` — Extractor starts; row flips to `Processing`.
- `t+~2–3s` — Extractor completes; row flips to `Needs Review` (if stub opened issues) or `Ready for Approval`.

## 6. Verifying the contract manually

- **Duplicate flow**: upload the same `(partnership, entity, tax_year)` a second time — expect `409 DUPLICATE_K1` with `existing.k1DocumentId`. Repeat with `replaceDocumentId` set — expect `201` and a `k1.superseded` audit row with `before_json.supersededByDocumentId = null`.
- **KPI scope**: change the Status filter — the KPI row MUST NOT change. Change the Tax Year filter — the KPI row MUST update.
- **Parse-error indicator**: force the stub to fail (set `?simulate=fail` query param on upload when running the stub in dev mode). The row MUST remain in `Processing` with a tooltip describing the error; no new badge appears.
- **Export**: apply a Status filter, click Export — the CSV must contain only the filtered rows.

## 7. Catalog components this screen MUST reuse

From `packages/ui/src/components/` (or equivalently `apps/web/src/components/shared/` during transition):

- `AppShell`
- `PageHeader`
- `KpiCard`
- `FilterToolbar`
- `DataTable`
- `StatusBadge`
- `RowActionMenu`
- `EmptyState`
- `ErrorState`
- `LoadingState`

If any of these don't yet have a variant you need (e.g., skeleton shape for `KpiCard`), extend the catalog component — do not fork locally. UI Constitution §3 + §10 + SC-009.

## 8. Out of scope (ship in later features)

- Review Workspace (Screen #7) — opened by clicking a row, owned by Feature 003.
- Issues Queue page (Screen #8) — owned by Feature 003.
- Admin-only re-parse policies, retention of superseded PDFs, S3 storage.
- Real extractor integration (only the `K1Extractor` interface ships here; the stub is V1's implementation).
- Real-time updates — deferred to the post-V1 "data-source APIs" work per user direction.

## 9. Definition of done

- All 10 Success Criteria in `spec.md` demonstrably pass.
- No Material UI import on this screen (SC-009 grep).
- No polling timer (grep for `setInterval`, `setTimeout` in refresh paths).
- All mutations emit `audit_events` rows in the same transaction as the state change (Constitution §13).
- `apps/web/src/pages/K1Dashboard.tsx` composes catalog components only; no local re-implementations of `PageHeader` / `KpiCard` / etc.
- `reference/k1-dashboard.magic-patterns.tsx` is not imported from anywhere under `apps/` or `packages/`.
