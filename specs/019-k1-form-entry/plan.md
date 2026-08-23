# Implementation Plan: K-1 Form-Inspired Data Entry

**Branch**: `019-k1-form-entry` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-k1-form-entry/spec.md`

## Complete-Form Amendment (2026-07-19)

The user expanded this feature from a presentation-only redesign to complete standard-form entry. This section supersedes every statement below that says official cells remain static, identity is read-only, or no API/storage/type/migration change is required.

- Keep the 42 canonical calculation placements and their existing calculation semantics.
- Add 48 official-form field definitions covering the K-1 header, Part I, Part II Items E-N, the missing Part III money lines, code/detail rows, and form checkboxes.
- Persist official-form-only data in `k1_tracker_years.official_form_data jsonb` through a backward-compatible optional `officialFormData` update property.
- Treat the official object as a full replacement, validate types and official choices at the API boundary, increment the year revision, and invalidate current-year sign-off atomically.
- Keep official-only data out of basis and related financial calculations.

## Summary

Refactor the existing Jackson K-1 annual editor into a semantic, responsive interface modeled on the supplied 2025 Schedule K-1 (Form 1065). The page uses a recognizable form header; editable Part I and Part II; Item J through N details; and a numbered, two-column Part III grid on wide screens. Every standard official cell is editable, while non-K-1 opening-basis and book-tax inputs remain in an explicitly labeled Jackson workpaper below the form.

Implementation spans the web, shared contracts, Fastify validation/repositories, and one PostgreSQL migration. Typed maps place all 42 calculation fields and all 48 official-form fields exactly once. `K1YearEntryForm` owns amount and official-form state while preserving preview, save, revert, override, provenance, carryforward, legacy line 13, and cash-activity-derived behavior. `K1BasisWorkspace` passes existing partnership/entity context as editable defaults for Part I and Part II.

## Technical Context

**Language/Version**: TypeScript `~6.0.2` in the web workspace; React 19.2; Node.js 22+  
**Primary Dependencies**: React, Tailwind CSS 3.4, Lucide, existing Jackson shared currency field and partnership-tracker hooks; no new runtime dependency  
**Storage**: Existing PostgreSQL K-1 tracker years plus `official_form_data jsonb`; existing value revisions and calculation projections remain unchanged
**Testing**: Vitest 2, React Testing Library, API contract and PostgreSQL persistence integration tests; web/API builds; manual responsive and keyboard verification
**Target Platform**: Jackson browser application on supported desktop, tablet, and mobile viewports  
**Project Type**: npm-workspace React/Fastify/PostgreSQL monorepo
**Performance Goals**: Render and edit 42 calculation fields plus 48 official-form fields with no additional data request; local keystroke feedback remains immediate; save continues to use the existing update request
**Constraints**: Preserve all existing field keys, signs, validation, calculation results, provenance, cash-activity derivation, override audit behavior, and unsaved-change guard; one continuous form; no page-level horizontal overflow at 390 CSS pixels; no private PDF content committed
**Scale/Scope**: One partnership workspace tab, one selected tax year, 42 calculation placements, 48 official-form fields, and focused UI/API/persistence/accessibility tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still an unfilled template and defines no enforceable project-specific principles. The following repository-local and financial-workflow gates apply:

1. **Existing stack and ownership**: PASS. Work stays in the current K-1 and Partnership Tracker web features and introduces no framework or service.
2. **Financial source of truth**: PASS. Existing year detail, field keys, cash-flow-derived values, and calculation responses remain canonical.
3. **Backward-compatible contract and storage extension**: PASS. The existing route gains one optional property and the tracker-year row gains one defaulted JSONB column; old clients and calculation values remain compatible.
4. **Calculation compatibility**: PASS. The existing `K1_EDITABLE_FIELDS`, numeric normalization, sign rules, change-set builder, preview, save, and recalculation paths remain intact.
5. **Auditability**: PASS. Provenance, carryforward, legacy line 13, manual override, required reason, and revision semantics remain visible and unchanged.
6. **Responsive access**: PASS. The desktop form hierarchy collapses to logical DOM order on narrow viewports without page-level horizontal scrolling.
7. **Accessibility**: PASS. Semantic headings, labels, fieldsets, focus visibility, keyboard operation, error association, and non-color-only states are explicit design requirements.
8. **Truthful representation**: PASS. Every standard K-1 field is editable, while the UI remains identified as Jackson data entry rather than an official filed form.
9. **Private-reference handling**: PASS. The supplied PDF is used only for local visual analysis and will not be copied into the repository.
10. **Regression coverage**: PASS. The plan verifies the full field inventory, change-set compatibility, derived read-only state, override behavior, responsive structure, and existing workflow tests.

### Post-Phase 1 Re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/k1-form-entry-ui.md](./contracts/k1-form-entry-ui.md), and [quickstart.md](./quickstart.md). Result: **PASS**.

- Research selects semantic HTML/CSS rather than a PDF image or canvas, preserving accessibility and responsive behavior.
- The data model contains presentation-only layout entities and leaves every persisted and calculated entity unchanged.
- The UI contract maps all 42 editable fields and explicitly excludes unsupported cells from state and change sets.
- The quickstart verifies financial equivalence, derived cash-activity behavior, provenance, overrides, keyboard access, and 390-pixel layout behavior.

## Project Structure

### Documentation (this feature)

```text
specs/019-k1-form-entry/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- k1-form-entry-ui.md
`-- tasks.md                         # created separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/web/src/features/k1-tracker/
|-- k1FieldGroups.ts                  # canonical editable field definitions remain authoritative
|-- k1FormLayout.ts                   # new form placement and unsupported-landmark metadata
|-- components/
|   |-- K1YearEntryForm.tsx           # state/change-set owner and form composition
|   |-- K1FormHeader.tsx              # form identity, year, and Jackson disclosure
|   |-- K1FormIdentityPanel.tsx       # read-only Part I and Part II context
|   |-- K1FormFieldCell.tsx           # reusable supported/derived/unsupported cell
|   |-- K1PartThreeGrid.tsx           # numbered Part III layout
|   `-- K1SupplementalWorkpaper.tsx  # opening basis and book-tax fields
`-- __tests__/
    `-- K1FormLayout.test.tsx         # inventory, mapping, and unsupported-cell tests

apps/web/src/features/partnership-tracker/
|-- components/
|   `-- K1BasisWorkspace.tsx          # supplies partnership/entity context to the editor
`-- __tests__/
    |-- ManualK1Editor.test.tsx        # change-set and derived-value regression coverage
    |-- ManualK1Workflow.test.tsx      # carryforward, save, revert, and override coverage
    `-- PartnershipTrackerAccessibility.test.tsx
```

**Structure Decision**: Keep state and persistence behavior in the existing K-1 editor. Add small form-specific presentation components and one typed placement map under the same feature. Pass the already-loaded partnership summary from `K1BasisWorkspace` rather than add a request. Keep `k1FieldGroups.ts` as the canonical editable inventory so the new layout cannot create or omit a writable field unnoticed.

## Phase 0: Research Outcomes

1. Build the K-1 resemblance with semantic HTML and responsive CSS Grid; do not use the PDF as a background image, canvas, or committed asset.
2. Mirror the reference hierarchy: header and tax year; Part I/Part II on the left; Item K and Section L within Part II; Part III on the right; supplemental Jackson workpaper below.
3. Keep `K1_EDITABLE_FIELDS` as the source for initialization, normalization, dirty detection, and change-set construction; the layout map supplies placement only.
4. Render unsupported official lines as static, subdued landmarks marked "Not tracked in Jackson"; they own no input state and never enter preview or save.
5. Place dated capital contributions and distributions in their familiar form locations but retain the existing disabled state and "Calculated from dated cash activity" explanation.
6. Reuse already-loaded `PartnershipTrackerDetail.summary.partnership` and entity data for Part I and Part II; show "Not available" for absent official facts.
7. Preserve Jackson's existing line 13 and line 18 field semantics exactly, even where internal historical naming is more specific than the reference form; no visual redesign will silently remap a financial field.
8. Move opening basis, opening suspended loss, and book-tax/reconciliation fields into a visually separate supplemental workpaper while keeping them inside the same `<form>` and change set.
9. Use logical DOM order and responsive stacking: K-1 header, Part I, Part II, Part III, supplemental workpaper, override, draft, actions. Wide-screen grid placement must not alter screen-reader or keyboard order.
10. Preserve the sticky action bar, but contain it within the editor and account for narrow screens and safe wrapping.

## Phase 1: Design Outcomes

- `K1FormPlacement` maps a canonical editable field to a form region, item or line label, desktop column, order, and optional code/subrow; it does not duplicate validation or persistence metadata.
- `K1FormOfficialPlacement` maps every standard official-form-only field to its header, identity, or Part III position.
- `K1FormIdentityContext` is derived in `K1BasisWorkspace` from existing partnership and entity data and supplies editable defaults.
- `K1YearEntryForm` continues to initialize all editable amounts from `K1_EDITABLE_FIELDS`, build changes from that same list, skip dated fields, require override reasons, and own preview/revert/save state.
- Form cells consume existing source, carryforward, derived, conflict, and validation annotations so no provenance is lost in the denser layout.
- Part III uses two visual columns only at large widths; smaller widths use one column and the official line-number order.
- Item K renders a three-row by beginning/ending liability table. Section L renders the existing canonical contribution value in the contributions row and never writes deprecated `section_l_capital_contributed`.
- Supplemental workpaper panels remain within the annual form and carry all existing opening-balance and book-tax inputs.
- Shared/API contracts add typed official form data, and migration 025 adds its JSONB persistence column without changing calculations.
- Tests assert set equality for both the 42 canonical calculation placements and the 48 official-form placements, preventing omissions.

## Implementation Sequence

1. Add a typed `k1FormLayout.ts` map for Part III, Item K, Section L, supplemental fields, and unsupported reference landmarks; add an inventory test that every canonical editable field is placed exactly once.
2. Extract a reusable form cell that preserves current currency parsing, accessible name, disabled state, provenance, carryforward, and derived-source messages.
3. Build semantic form header and read-only Part I/Part II identity panels using existing partnership detail and explicit unavailable states.
4. Build the Item K liability table and Section L capital account analysis, including the canonical cash-activity-derived contribution/distribution behavior.
5. Build the responsive Part III numbered grid with supported inputs, split line 13 subrows, unsupported landmarks, and existing historical-data notice.
6. Build the Jackson supplemental workpaper for opening basis, suspended loss, book values, and reconciliation values.
7. Refactor `K1YearEntryForm` composition while retaining its state initialization, `buildChanges`, preview, save, revert, override, draft, notice, dirty callback, and sticky actions.
8. Pass existing partnership/entity identity context from `K1BasisWorkspace`; do not add a network request or shared API field.
9. Update focused editor, workflow, and accessibility tests for the new structure and add responsive structural assertions.
10. Run focused tests, complete web tests, typecheck/build, and the manual desktop/mobile/keyboard/financial-equivalence checks in quickstart.

## Complexity Tracking

No constitution violations or exceptional complexity are introduced. The component split is limited to reusable visual regions of one form, while the single existing state/change-set owner prevents behavior drift.
