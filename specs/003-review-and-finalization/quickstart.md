# Quickstart: K-1 Review Workspace and Finalization

Manual walkthrough used to validate FR coverage end-to-end. Every step maps to a functional requirement or success criterion and should produce the documented side-effect. Run this against a freshly migrated dev DB with the 002 fixture seeded.

## 0. Prerequisites

- Postgres migrations through `002_k1_ingestion.sql` applied.
- Apply `apps/api/src/infra/db/migrations/003_review_finalization.sql` (adds `k1_documents.version`, `approved_by_user_id`, `finalized_by_user_id`; `k1_issues.k1_field_value_id`, `resolved_at`, `resolved_by_user_id`).
- Run 002's seed (`npx tsx apps/api/src/infra/db/seed/002_k1_fixtures.ts`) to produce K-1s across all statuses.
- Run the API (`cd apps/api; npm run dev`) and the web (`cd apps/web; npm run dev`).
- You need two Admin users (call them **Admin A** and **Admin B**) and one non-Admin **User C**, all with `entity_memberships` including the K-1's owning entity.

## 1. Open the Review Workspace from the K-1 Processing Dashboard (FR-001..006, SC-002)

1. Sign in as Admin A. Navigate to `/k1`.
2. Locate a K-1 row whose status is `Needs Review`. Click it.
3. You land on `/k1/:k1DocumentId/review`.

**Expected**:
- The `AppShell` chrome is unchanged (FR-001).
- `PageHeader` shows the partnership name, a `StatusBadge` reading "Needs Review", and breadcrumb chips (Tax Year, Uploaded date) (FR-002).
- Two-column body: left panel lists parsed fields grouped into **Entity Mapping**, **Partnership Mapping**, **Core Fields** as three `SectionCard`s (FR-003, FR-004).
- Each row shows label, current value, a Required marker where applicable, a confidence indicator, and — where `sourceLocation` is present — a source-locator control (FR-005).
- Right panel renders the first page of the PDF with page nav and zoom (FR-006). Initial render completes in under 2 seconds (SC-002).
- `ActionBar` is visible at the bottom with Save Corrections, Approve Values, Finalize, Send to Issue Queue, respecting role + state gating (FR-016..022).

## 2. Inspect a field's source location on the PDF (FR-005, FR-006)

1. Click the source-locator control on any field with a bounding box.

**Expected**:
- The PDF panel scrolls/flips to the named page.
- A visible highlight overlay appears at the bounding box.
- The selection state is reflected on the field row (focus ring).

## 3. Correct a field and observe raw value preservation (FR-007..011, FR-038, SC-003)

1. Click any editable field row. Edit the value inline via `EditableCell`.
2. The row shows a **Modified** marker while unsaved (FR-038).
3. Click **Save Corrections** in the ActionBar.

**Expected**:
- A single `POST /v1/k1/:id/corrections` request fires with `If-Match: <version>` (FR-010a).
- Response 200 with a new `version`, updated status (unchanged if no regression), and `resolvedIssueIds: []`.
- The Modified marker clears; the field's `reviewerCorrectedValue` is populated and visibly distinguishable from `rawValue` per UI Constitution §8 (FR-038).
- In the DB, `k1_field_values.raw_value` is unchanged; `reviewer_corrected_value` and `normalized_value` are updated; `review_status = 'REVIEWED'` (FR-009, SC-003).
- A `k1.field_corrected` audit event exists with `before`/`after` JSON containing the raw, normalized, and corrected values (FR-032, FR-033).

## 4. Auto-resolve a linked issue (FR-012, SC-012)

1. Seed an open `k1_issues` row with `k1_field_value_id = <id of an empty required field>`.
2. Fill in the required field and Save.

**Expected**:
- Response body includes that issue's id in `resolvedIssueIds`.
- In the DB, `k1_issues.status = 'RESOLVED'`, `resolved_at` set, `resolved_by_user_id` NULL (auto-resolve).
- A `k1.issue_resolved` audit event exists with `after.resolution_cause = 'auto'` (FR-032).

## 5. Map entity (FR-013, FR-015)

1. On the Entity Mapping row, start typing an entity name. The typeahead suggests existing entities within your memberships.
2. Select one. Click **Save** (or the row's auto-save fires).

**Expected**:
- `POST /v1/k1/:id/map/entity` with `If-Match`.
- DB: `k1_documents.entity_id` updated; `k1_documents.version` incremented.
- `k1.entity_mapped` audit event with `before/after` entity IDs.
- Typing a name that does not match any existing entity yields no suggestions and the row cannot be saved (FR-015).

## 6. Map partnership (FR-014)

1. Use the Partnership Mapping row typeahead; select a partnership whose `entity_id` matches the K-1's mapped entity.

**Expected**:
- `POST /v1/k1/:id/map/partnership` succeeds.
- A partnership whose `entity_id` does NOT match the K-1's entity returns 400 `PARTNERSHIP_ENTITY_MISMATCH`.
- `k1.partnership_mapped` audit event written.

## 7. Approve Values as Admin A (FR-017, FR-018)

1. Ensure no validation errors, no empty Required fields, and no open issues.
2. Click **Approve Values**.

**Expected**:
- `POST /v1/k1/:id/approve` succeeds; response status `READY_FOR_APPROVAL`.
- DB: `k1_documents.processing_status = 'READY_FOR_APPROVAL'`, `approved_by_user_id = <Admin A id>`, `version += 1`.
- `StatusBadge` on the page updates to "Ready for Approval".
- `k1.approved` audit event with `before_json.processing_status = 'NEEDS_REVIEW'`.

## 8. Finalize as Admin A — should fail (two-person rule, FR-019a, SC-006)

1. While still signed in as Admin A, click **Finalize**.

**Expected**:
- If the client correctly disables Finalize for the approver, no request fires and a tooltip explains "Awaiting a second Admin to finalize".
- If the client fires anyway, `POST /v1/k1/:id/finalize` returns `403 SAME_ACTOR_FINALIZE_FORBIDDEN` with no mutation.
- DB: K-1 still `READY_FOR_APPROVAL`; no `k1.finalized` audit event written.

## 9. Finalize as Admin B (FR-019, FR-020, SC-004, SC-006, SC-010)

1. Sign out. Sign in as Admin B.
2. Navigate to `/k1/:k1DocumentId/review`. Click **Finalize**.

**Expected**:
- `POST /v1/k1/:id/finalize` returns 200 with `status: 'FINALIZED'`, `finalizedByUserId = <Admin B id>`, `partnershipAnnualActivityId` set.
- DB, in a single transaction:
  - `k1_documents.processing_status = 'FINALIZED'`; `finalized_at` set; `finalized_by_user_id = <Admin B id>`; `version += 1`.
  - A new or updated row in `partnership_annual_activity` keyed by `(entity_id, partnership_id, tax_year)` with `reported_distribution_amount` populated from `k1_reported_distributions` and `finalized_from_k1_document_id` set.
  - A `k1.finalized` audit event written.
- The workspace re-renders in the finalized-locked state (FR-027, see step 11).
- Navigate back to `/k1`: the upstream dashboard reflects `Finalized` on next fetch within 3 s (SC-010, FR-008 of 002).

## 10. Concurrent edit surface — stale version (FR-010a, SC-011)

1. Reload the workspace as Admin A on a different `NEEDS_REVIEW` K-1. Note its `version`.
2. Using a second session (e.g., curl), POST a correction with the current version. Observe version increments.
3. In the UI, edit a field and click Save (your client still holds the old version).

**Expected**:
- Response `409 STALE_K1_VERSION` with `currentVersion: <new>` in the body.
- UI shows a stale-state banner ("This K-1 was updated elsewhere") with a **Refresh** action and preserves your in-flight edits (FR-010a, edge case).
- DB unchanged until you Refresh and re-save.

## 11. Finalized-locked state (FR-022, FR-027)

1. Open any `FINALIZED` K-1's review page.

**Expected**:
- All field rows are read-only; no `EditableCell` in edit mode; no save/approve/finalize/issue-queue buttons.
- A visible "Document finalized" indicator (UI Constitution §8).
- Any attempted write via direct API returns `409 K1_FINALIZED` (FR-022).

## 12. Permission-restricted state (FR-026, FR-028..031, SC-005)

1. Sign in as User C. Attempt to open a K-1 for an entity NOT in User C's memberships.

**Expected**:
- The workspace does not fetch parsed values; client redirects or renders `ErrorState` "You don't have access to this document".
- `GET /v1/k1/:id/review-session` returns `404` (out-of-scope 404 pattern) or `403` per scope-plugin config; either way, no parsed data leaves the server.

## 13. Regression on save clears approval (research R6, FR-019a, FR-017)

1. Approve a K-1 as Admin A so status is `READY_FOR_APPROVAL`.
2. As any reviewer, open it and clear a Required field via a correction; Save.

**Expected**:
- `POST /v1/k1/:id/corrections` returns 200 with `approvalRevoked: true` and `status: 'NEEDS_REVIEW'`.
- DB: `approved_by_user_id = NULL`; `processing_status = 'NEEDS_REVIEW'`.
- `k1.approval_revoked` audit event written with `cause: 'cleared_required_field'`.
- Admin A may now re-approve (two-person rule is reset).

## 14. Send to Issue Queue (FR-021, FR-032)

1. On any non-finalized K-1, click **Send to Issue Queue**. Enter an optional note. Confirm.

**Expected**:
- `POST /v1/k1/:id/issues` returns 200 with a new issue id.
- DB: `k1_issues` row with `status='OPEN'`, optional `message`, optional `k1_field_value_id`.
- `k1.issue_opened` audit event written.
- The K-1's status is unchanged (FR-021).

## 15. UI normalization check (FR-036, FR-037, FR-039, SC-008)

Run `node scripts/ci/guard-k1-imports.mjs` (the same guard 002 installed, with its scan surface extended in this feature to include `apps/web/src/pages/K1ReviewWorkspace.tsx` and `apps/web/src/features/review/**`).

**Expected**:
- 0 violations. No `@mui/*` imports. No direct `pdfjs-dist` imports outside `packages/ui/src/components/PdfPreview/*`. No `specs/003-review-and-finalization/reference/**` imports from production code.

## 16. Accessibility (SC-009)

1. Open the workspace. Tab through: field sections → ActionBar → PDF panel controls.
2. Run `npx vitest run review-workspace.states.spec.tsx` (the spec runs axe against each screen state).

**Expected**:
- Every interactive element reachable by keyboard.
- All catalog components expose ARIA labels the spec asserts on.
- axe reports zero serious/critical violations across the five screen states.
