# Tasks: K-1 Form-Inspired Data Entry

**Input**: Design documents from `/specs/019-k1-form-entry/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/k1-form-entry-ui.md, quickstart.md

**Tests**: Required by FR-018 and SC-001 through SC-007. Add the specified tests before each implementation slice and confirm they fail for the intended missing behavior.

**Organization**: Tasks are grouped by user story so the recognizable form, trustworthy field states, and responsive/accessibility improvements can each be implemented and verified as a coherent increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its listed prerequisites because it changes different files.
- **[Story]**: Maps the task to US1, US2, or US3 from spec.md.
- Every task includes the exact repository file or verification document it affects.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Prepare representative data shared by the structural, behavioral, and accessibility tests.

- [X] T001 Extend `apps/web/src/features/partnership-tracker/__tests__/fixtures.ts` with reusable spec-019 details covering complete and missing partnership identity, long and negative amounts, imported/manual/carryforward provenance, legacy combined line 13, capital-call activity, distribution activity, and recallable-distribution activity.

---

## Phase 2: Foundational (Blocking Presentation Contract)

**Purpose**: Establish the canonical placement map and reusable field-cell boundary that every user story consumes.

**CRITICAL**: Complete this phase before implementing any story-specific form region.

- [X] T002 Add failing inventory contract tests in `apps/web/src/features/k1-tracker/__tests__/K1FormLayout.test.tsx` for exactly 42 unique supported placements, set equality with `K1_EDITABLE_FIELDS`, exclusion of `box_13_other_deductions` and `section_l_capital_contributed`, valid per-region ordering, and field-key-free reference cells.
- [X] T003 Implement `K1FormRegion`, `K1FormPlacement`, `K1FormReferenceCell`, `K1FormIdentityContext`, the exact 42-field placement inventory, and the 2025 reference-only landmarks in `apps/web/src/features/k1-tracker/k1FormLayout.ts` until T002 passes without duplicating validation or persistence rules from `apps/web/src/features/k1-tracker/k1FieldGroups.ts`.
- [X] T004 [P] Create the controlled supported-field foundation in `apps/web/src/features/k1-tracker/components/K1FormFieldCell.tsx`, accepting the canonical `K1FieldDefinition`, value/change callback, editable/derived state, source, carryforward, and conflict annotations while continuing to use the shared currency input and existing accessible field label.

**Checkpoint**: The presentation contract covers every current editable field exactly once, and visual components can consume one shared field-cell API.

---

## Phase 3: User Story 1 - Enter K-1 Values Where They Appear (Priority: P1) MVP

**Goal**: Replace the unfamiliar grouped editor with one recognizable Schedule K-1 hierarchy containing Part I, Part II, Item K, Section L, Part III, and the supplemental Jackson workpaper while preserving the current change set and actions.

**Independent Test**: Open one partnership year, find line 1 in Part III, enter an amount, preview it, and save it; confirm the outgoing field key/value and calculated result match the current workflow and no wizard, tab, or required expansion is introduced.

### Tests for User Story 1

- [X] T005 [P] [US1] Add failing render-structure tests in `apps/web/src/features/k1-tracker/__tests__/K1FormLayout.test.tsx` for the dynamic Schedule K-1 header, one form landmark, Part I/II/III headings, available and unavailable identity facts, Item K beginning/ending columns, Section L row order, and all supported form/workpaper regions.
- [X] T006 [P] [US1] Expand `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx` with failing compatibility tests that edit representative signed, nonnegative, Part III, Item K, Section L, and supplemental fields and assert unchanged normalized `K1TrackerFieldChange` payloads for preview and save.

### Implementation for User Story 1

- [X] T007 [P] [US1] Implement the selected-year Schedule K-1 identity, Jackson disclosure, and restrained black/white/gray form header in `apps/web/src/features/k1-tracker/components/K1FormHeader.tsx`.
- [X] T008 [P] [US1] Implement read-only Part I/Part II identity context, explicit `Not available` fallbacks, the three-row Item K beginning/ending liability table, and the six-row Section L capital analysis in `apps/web/src/features/k1-tracker/components/K1FormIdentityPanel.tsx` using placements from `apps/web/src/features/k1-tracker/k1FormLayout.ts`.
- [X] T009 [P] [US1] Implement supported Part III lines in official numeric order with split line 13 subrows and wide-screen left/right form columns in `apps/web/src/features/k1-tracker/components/K1PartThreeGrid.tsx`.
- [X] T010 [P] [US1] Implement the clearly separated opening-basis, suspended-loss, book-income, and reconciliation panels inside the same annual form in `apps/web/src/features/k1-tracker/components/K1SupplementalWorkpaper.tsx`.
- [X] T011 [US1] Refactor `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx` to compose T007-T010 as one continuous form while retaining canonical amount initialization, `buildChanges`, sign validation, dirty tracking, Preview Calculation, Revert, Save revisions, manual override/reason, draft summary, notices, pending states, and sticky actions.
- [X] T012 [US1] Derive and pass the optional `K1FormIdentityContext` from the already-loaded partnership name, EIN, address, and owning entity in `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx`, with no new query, shared type, or API change.
- [X] T013 [US1] Run and fix the US1 suites in `apps/web/src/features/k1-tracker/__tests__/K1FormLayout.test.tsx` and `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx` until the recognizable-form and unchanged-change-set independent test passes.

**Checkpoint**: User Story 1 is a functional MVP: a user can locate, preview, and save every current field through a recognizable K-1 layout.

---

## Phase 4: User Story 2 - Understand Tracked, Derived, and Unsupported Values (Priority: P2)

**Goal**: Make the K-1-like surface truthful by clearly distinguishing editable fields, cash-activity-derived totals, unsupported reference cells, provenance/carryforward states, historical line 13 data, and supplemental workpaper values.

**Independent Test**: Load a year with dated capital calls and distributions, confirm Section L contributions and Part III line 19 are read-only with a cash-activity explanation, then confirm an unsupported official line is visible but noninteractive and absent from preview/save changes.

### Tests for User Story 2

- [X] T014 [P] [US2] Add failing derived-state and change-set exclusion tests for capital calls, distributions, and recallable distributions plus source/carryforward annotations in `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx`.
- [X] T015 [P] [US2] Add failing tests in `apps/web/src/features/k1-tracker/__tests__/K1FormLayout.test.tsx` that reference-only lines 4a, 4b, 6b, 6c, 9b, 9c, 14, 15, 16, 17, 20, 22, and 23 display `Not tracked in Jackson`, have no input role or field key, and cannot enter preview/save state.
- [X] T016 [P] [US2] Extend `apps/web/src/features/partnership-tracker/__tests__/ManualK1Workflow.test.tsx` with failing regression cases for legacy combined line 13, split line 13 fields, provenance, manual override reason enforcement, draft calculation, revert, saved revision behavior, and the unsaved-change callback.

### Implementation for User Story 2

- [X] T017 [US2] Complete supported, cash-derived, carried, sourced, conflicted, and static-reference visual variants in `apps/web/src/features/k1-tracker/components/K1FormFieldCell.tsx`, keeping derived controls disabled and reference cells nonfocusable with visible non-color status text.
- [X] T018 [P] [US2] Merge the reference-only landmarks from `apps/web/src/features/k1-tracker/k1FormLayout.ts` into the correct numeric positions and preserve Jackson's existing line 13/18 labels and semantics in `apps/web/src/features/k1-tracker/components/K1PartThreeGrid.tsx`.
- [X] T019 [P] [US2] Apply cash-activity-derived contribution state, liability provenance/carryforwards, unavailable identity states, and static Item K/Part II reference treatment in `apps/web/src/features/k1-tracker/components/K1FormIdentityPanel.tsx`.
- [X] T020 [US2] Build per-field presentation state from values, cash-flow events, calculations, and source conflicts; retain the historical combined line 13 notice, override audit controls, draft feedback, and distinct workpaper framing in `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx` and `apps/web/src/features/k1-tracker/components/K1SupplementalWorkpaper.tsx`.
- [X] T021 [US2] Run and fix the US2 suites in `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx`, `apps/web/src/features/partnership-tracker/__tests__/ManualK1Workflow.test.tsx`, and `apps/web/src/features/k1-tracker/__tests__/K1FormLayout.test.tsx` until the tracked/derived/unsupported independent test passes.

**Checkpoint**: Users can reconcile the K-1-like layout without mistaking unsupported landmarks or dated cash totals for manually editable data.

---

## Phase 5: User Story 3 - Complete the Form Accessibly at Any Viewport (Priority: P3)

**Goal**: Preserve the form resemblance on wide screens while providing logical keyboard/screen-reader order, visible focus, usable touch targets, and a no-overflow one-column experience at 390 CSS pixels.

**Independent Test**: Complete the annual form using only a keyboard, then inspect it at 390 CSS pixels and verify every section/action remains reachable in logical order without page-level horizontal overflow or clipped sticky actions.

### Tests for User Story 3

- [X] T022 [P] [US3] Expand `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx` with failing assertions for one form landmark, semantic Part I/II/III headings, stable labels for all 42 supported controls, static cells outside the tab order, status/error semantics, logical action order, and read-only-user behavior.
- [X] T023 [P] [US3] Add failing DOM-order and responsive-structure tests for the desktop two-region layout, mobile single-column flow, contained Item K/Section L tables, long/negative amount containment, and wrapping sticky actions in `apps/web/src/features/k1-tracker/__tests__/K1FormResponsive.test.tsx`.

### Implementation for User Story 3

- [X] T024 [P] [US3] Harden headings, fieldsets, accessible descriptions, label associations, noninteractive landmark semantics, focus-visible states, and logical DOM order in `apps/web/src/features/k1-tracker/components/K1FormHeader.tsx`, `apps/web/src/features/k1-tracker/components/K1FormIdentityPanel.tsx`, and `apps/web/src/features/k1-tracker/components/K1PartThreeGrid.tsx`.
- [X] T025 [P] [US3] Add 390-pixel-safe stacking, min-width containment, long-currency wrapping, 44-pixel practical targets, and non-covering sticky action behavior in `apps/web/src/features/k1-tracker/components/K1SupplementalWorkpaper.tsx` and `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`.
- [X] T026 [US3] Run and fix `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx` and `apps/web/src/features/k1-tracker/__tests__/K1FormResponsive.test.tsx` until the keyboard and responsive independent test passes.

**Checkpoint**: All three stories are functional, accessible, and independently verifiable.

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Prove the complete refactor preserves financial behavior and repository quality.

- [X] T027 Run every focused command, the complete web test suite, web typecheck, and production build documented in `specs/019-k1-form-entry/quickstart.md`, fixing regressions only in the spec-019 web components and tests named above.
- [X] T028 Execute the wide-desktop, 200%-zoom, 390-pixel, keyboard-only, read-only-user, and before/after financial-equivalence checks in `specs/019-k1-form-entry/quickstart.md` against the supplied local reference PDF without adding the PDF or renders to the repository.
- [X] T029 Audit the final Git diff for unchanged API/storage/calculation contracts and absence of private PDF artifacts, then update as-built deviations or verification notes in `specs/019-k1-form-entry/contracts/k1-form-entry-ui.md` and `specs/019-k1-form-entry/quickstart.md` before handoff.

---

## Phase 7: Complete Standard Schedule K-1 Entry Amendment

**Purpose**: Replace every static official landmark with typed, durable entry while preserving existing calculation semantics.

- [X] T030 Inventory the supplied 2025 Schedule K-1 header, Part I, Part II Items E-N, and Part III lines 1-23 without copying private reference values.
- [X] T031 Add shared and API official-form key/value contracts plus migration `apps/api/src/infra/db/migrations/025_k1_complete_form_data.sql`.
- [X] T032 Add strict API validation and transactional full-replacement persistence with optimistic revision and sign-off invalidation.
- [X] T033 Implement the 48-field official-form metadata inventory and reusable text, date, choice, percentage, money, checkbox, and repeatable code/detail controls.
- [X] T034 Replace the Part I/II and Part III static cells with editable controls while retaining the 42 canonical calculation placements and supplemental workpaper.
- [X] T035 Add field-inventory, formerly-static interaction, API contract, and isolated PostgreSQL persistence regression tests.
- [X] T036 Run complete web/API regression suites, production builds, and responsive/keyboard visual verification.
- [X] T037 Amend spec-019 design artifacts to make the user-requested complete-form behavior authoritative.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: Starts immediately.
- **Phase 2 - Foundational**: Depends on T001 and blocks all story implementation. T003 and T004 may proceed in parallel after the failing T002 contract test exists.
- **Phase 3 - US1**: Depends on Phase 2. T005 and T006 are written first; T007-T010 can then run in parallel; T011 depends on T007-T010; T012 depends on the identity prop defined by T011; T013 closes the story.
- **Phase 4 - US2**: Uses the form surfaces delivered by US1. T014-T016 can run in parallel; T017 follows those tests; T018 and T019 can run in parallel after T017; T020 integrates their states; T021 closes the story.
- **Phase 5 - US3**: Uses the semantic form delivered by US1 and the states delivered by US2. T022 and T023 can run in parallel; T024 and T025 can run in parallel after the failing tests; T026 closes the story.
- **Phase 6 - Polish**: Depends on every story selected for release; execute T027-T029 in order.

### User Story Completion Order

```text
Setup T001
   |
Foundation T002-T004
   |
US1 T005-T013 (recognizable, functional K-1 MVP)
   |
US2 T014-T021 (truthful field states and provenance)
   |
US3 T022-T026 (responsive and accessible completion)
   |
Polish T027-T029
```

- **US1 (P1)** is the MVP and has no story dependency after the foundation.
- **US2 (P2)** is independently testable but intentionally decorates the US1 form surfaces rather than duplicating them.
- **US3 (P3)** is independently testable after the semantic form exists and should validate both supported and unsupported states.

### Within Each User Story

- Write the listed tests first and verify they fail for the intended missing behavior.
- Implement leaf components before editing `K1YearEntryForm.tsx`.
- Preserve `K1_EDITABLE_FIELDS` as the state/change-set iteration source throughout.
- Complete the story's focused test task before moving to the next priority.

## Parallel Opportunities

### User Story 1

After Phase 2:

```text
T005 K1 form structure tests          || T006 change-set compatibility tests
T007 form header                      || T008 identity/Item K/Section L
T009 Part III grid                    || T010 supplemental workpaper
```

Then complete T011 -> T012 -> T013.

### User Story 2

After US1:

```text
T014 dated/provenance editor tests    || T015 reference-cell contract tests
                                      || T016 override/legacy workflow tests

After T017:
T018 Part III reference states        || T019 Part II/Item K/Section L states
```

Then complete T020 -> T021.

### User Story 3

After US2:

```text
T022 accessibility tests              || T023 responsive-structure tests
T024 header/identity/Part III a11y     || T025 workpaper/form responsive actions
```

Then complete T026.

## Implementation Strategy

### MVP First

1. Complete T001-T004.
2. Complete T005-T013 for User Story 1.
3. Stop and validate that a user can locate line 1, preview, and save an unchanged change set in the K-1-like form.
4. Demo the recognizable form before adding the lower-priority state and viewport refinements.

### Incremental Delivery

1. **US1**: Deliver the recognizable K-1 hierarchy and preserve all current inputs/actions.
2. **US2**: Add explicit derived, provenance, historical, supplemental, and unsupported distinctions.
3. **US3**: Complete keyboard, screen-reader, zoom, and mobile behavior.
4. **Polish**: Prove full-suite and financial equivalence and audit the final diff.

## Notes

- `[P]` tasks operate on different files after the stated prerequisite and can be assigned concurrently.
- No task adds a database migration, API endpoint, calculation version, form library, PDF asset, or new persisted field.
- Preserve existing line 13 and line 18 field semantics even when the 2025 visual reference uses different generic wording.
- Keep dated cash activity as the authoritative source for annual contributions and distributions.
- Commit after each task or cohesive task group if using the optional Git workflow.
