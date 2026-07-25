# Quickstart and Verification: K-1 Form-Inspired Data Entry

## Prerequisites

- Node.js 22+
- Repository dependencies installed
- A local Jackson environment with at least one partnership and K-1 tax year for manual verification

The supplied K-1 PDF is a local visual reference only. Do not copy it or rendered pages into the repository.

## Focused Automated Checks

From the repository root:

```powershell
npm run --workspace=web test -- src/features/k1-tracker/__tests__/K1FormLayout.test.tsx src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx src/features/partnership-tracker/__tests__/ManualK1Workflow.test.tsx src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx
npm run --workspace=api test -- tests/partnership-tracker.manual-year.contract.test.ts
npm run build:web
npm run build:api
```

Run `tests/k1-tracker.persistence.integration.test.ts` with `ATLAS_TEST_DATABASE_URL` pointed at an isolated PostgreSQL database to verify migration 025, atomic revision/sign-off behavior, and reload durability.

Then run the complete web suite:

```powershell
npm run test:web
```

## Required Automated Assertions

### Field inventory

- The supported placement key set exactly equals `K1_EDITABLE_FIELDS`.
- There are 42 unique writable placements.
- Deprecated `box_13_other_deductions` and `section_l_capital_contributed` are not writable placements.
- The header, identity, and Part III official placement union contains all 48 official keys exactly once.
- Formerly static lines accept typed values and enter `officialFormData`, while the 42 calculation placements remain unchanged.

### Behavior preservation

- Editing line 1 and saving emits `box_1_ordinary_income_loss` with the same normalized amount and source type as before.
- Negative-capable fields accept negative values; nonnegative fields retain current validation.
- Preview uses the existing change set and displays the existing draft ending basis, status, and attention count.
- Revert restores all amounts, override state, reason, notices, and draft state.
- Manual override requires a reason and emits `MANUAL_OVERRIDE` with the trimmed reason.
- A carried opening balance displays its prior-year placeholder and provenance.
- Legacy combined line 13 data retains the existing notice until a split line 13 field is saved.

### Dated cash activity

- Net Cash Activity appears in its own workspace tab with the same tax-year selection model.
- Capital calls and distributions do not replace or disable `capital_contributions` or `box_19_distributions` in K1 Entry.
- K-1 preview, save, outside-basis calculation, revision, and signoff state use only stored K-1 values.
- Cash events continue to drive partnership performance, exact-date XIRR inputs, and recallable-commitment behavior.

### Accessibility and structure

- The form has one form landmark and semantic Part I, Part II, and Part III headings.
- All calculation and official-form controls have stable accessible names.
- Repeatable coded sections expose keyboard-operable add and remove controls.
- Notice/error text uses live status/alert semantics and remains associated with the relevant context.
- Read-only users can inspect values and provenance but do not receive editing actions.

## Manual Visual Verification

Start the local application using the repository's normal development workflow, then open a URL shaped like:

```text
/partnership-tracker?partnership=<id>&area=k1&year=<tax-year>
```

### Wide desktop (approximately 1440 CSS pixels)

Compare hierarchy with the supplied reference and verify:

1. Schedule K-1 identity and selected tax year are immediately visible.
2. Part I/Part II context reads down the left side.
3. Item K has clear beginning/ending liability columns.
4. Section L follows the familiar capital-account row order.
5. Part III is the dominant numbered-entry area and uses two visual runs where space permits.
6. Black/white/gray rules carry the form structure; Jackson gold is reserved for focus and primary action emphasis.
7. Values, provenance, code/subrow labels, and validation text do not overlap at 100% and 200% zoom.

### Mobile (390 CSS pixels)

Verify:

1. The page has no horizontal scrollbar.
2. Sections stack in logical order and Part III lines remain numerically understandable.
3. Item K and Section L values remain associated with their row and beginning/ending labels.
4. Inputs, override reason, draft results, and action buttons are not clipped.
5. Sticky actions wrap or stack without covering the active input.

### Keyboard-only pass

1. Navigate from the year controls into the annual form using Tab/Shift+Tab.
2. Confirm visible focus on every editable currency field and all actions.
3. Confirm official money, checkbox, choice, and code/detail controls are reachable in form order.
4. Enable override, enter a reason, preview, revert, edit again, and save without a pointer.
5. Attempt to change the year with unsaved edits and confirm the existing discard guard.

## Financial Equivalence Spot Check

Use the same fixture or partnership year before and after the refactor:

1. Record the outgoing preview change set for a representative signed income, deduction, liability, Section L, and workpaper field.
2. Record draft ending basis, suspended loss, distributions, Section L difference, and warning count.
3. Repeat after the visual refactor.
4. Confirm field keys, amounts, source types, override reasons, and calculation results are identical.

## Completion Criteria

- Focused and full web/API tests pass.
- Production web and API builds pass.
- The 42-field calculation inventory and 48-field official inventory assertions pass.
- Desktop structure is recognizably K-1-like when compared with the reference.
- The 390-pixel and keyboard checks pass.
- No source PDF, rendered page, or private reference value appears in the Git diff.

## Verification Results (2026-07-19 complete-form amendment)

### Automated

- Focused complete-form UI regression suite: **18 passed** across 5 files.
- Complete web suite: **165 passed** across 56 files.
- Web TypeScript project-reference check and scoped ESLint over every changed web source/test file: **passed with zero errors**.
- Official-form API contract suite: **4 passed**.
- Isolated PostgreSQL durable-ledger suite after applying every migration: **4 passed**, including complete official-form reload, revision, sign-off invalidation, and calculation-neutrality coverage.
- Complete API run without a database URL: **309 passed**, **53 skipped**, and the repository's known `partnerships.accounting-values.integration.test.ts` environment failure because that test requires `ATLAS_TEST_DATABASE_URL` but does not self-skip.
- Production API TypeScript build and production Vite build: **passed**. Vite retains its existing non-blocking large-chunk advisory.

### Reference and live rendering

- The supplied one-page 2025 K-1 was extracted with `pypdf` and rendered locally with PyMuPDF because Poppler was unavailable. The rendered form was visually inspected; no PDF text, private values, render, or temporary browser profile remains in the repository.
- A live authenticated 1440-by-1000 render initially confirmed all then-defined official placements; final inventory tests contain **48 exact 2025-form keys** after removing the nonstandard Item L method control, with no **Not tracked** text and two Part III columns.
- A live 390-by-844 render measured 390 pixels for the viewport, document, and body and 358 pixels for the form. Part III collapsed to one 354-pixel column with no page-level horizontal overflow.
- Visual inspection confirmed labeled final/amended and tax-period controls, editable Part I/II identity cells, readable official money rows, and keyboard-sized coded-row actions.
- The visual test created a temporary 2025 tracker year and deleted it through the API afterward; the database was checked to confirm no temporary year remained.

## Historical Verification Results (2026-07-18, superseded by the amendment above)

### Automated

- Focused spec-019 regression suite: **17 passed** across 5 files.
- Complete web suite: **163 passed** across 56 files.
- Scoped ESLint for every changed K-1, cash-activity, fixture, and test file: **passed**.
- Production Vite build: **passed**. The existing large-chunk advisory remains unchanged and is non-blocking.
- Web typecheck: the repository remains baseline-red with **488 existing errors**, primarily unused legacy React imports, application-wide test matcher typing, and unrelated auth/report modules. A production-file filter found **0 errors** in the spec-019 implementation (including the responsive cash-activity containment fix).

### Live browser layout and keyboard checks

- At a 1440-by-1000 viewport, the authenticated workspace rendered the recognizable black-rule K-1 hierarchy with the identity/Item K/Section L region beside the dominant two-run Part III region. The page measured 1425 CSS pixels wide inside the 1440-pixel viewport.
- A 720-pixel viewport was used as the 200%-zoom equivalent. The page measured 705 CSS pixels wide, the form reflowed to a 657-pixel single-column presentation, and no content overlap was observed.
- At a 390-by-844 viewport, the final document and body width both measured 375 CSS pixels and the form measured 343 CSS pixels. The form stacked in Part I, Part II, Item K, Section L, Part III, and supplemental-workpaper order without a page-level horizontal scrollbar.
- A live keyboard smoke check moved focus from **Nonrecourse liabilities - beginning** to **Nonrecourse liabilities - ending** with Tab. The automated accessibility workflow additionally covers every supported control, static-cell skipping, errors, override reason, preview/revert/save behavior, unsaved state, and read-only-user actions.

### Financial and artifact audit

- Representative signed income, deduction, liability, Section L, and supplemental edits emitted the same canonical keys, normalized amounts, source types, and override reason behavior in the before/after workflow tests.
- Dated capital calls/distributions continued to own their derived annual fields; those fields were omitted from annual preview and save changes.
- The final changed-file audit found no API, storage, calculation, migration, or shared-type changes and no PDF, PNG, JPEG, or WebP artifacts.
- Direct reopening of the supplied local PDF was unavailable: Poppler and Python renderers were not installed, and the browser security policy blocked `file://` navigation. The live UI comparison therefore used the spec, plan, and UI contract previously derived from that supplied reference; the PDF and attempted renders never entered the repository.
