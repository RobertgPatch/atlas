# Phase 0 Research: K-1 Form-Inspired Data Entry

> **2026-07-19 amendment:** The user explicitly replaced the static-landmark decision with a requirement to enter every standard Schedule K-1 field. The implementation therefore uses typed editable controls and JSONB official-form persistence; calculation-neutral fields remain excluded only from Jackson's financial formulas.

## Research Inputs

- User goal: make annual K-1 data entry substantially easier to recognize by matching a real Schedule K-1 while preserving every existing behavior.
- Visual reference: the supplied one-page 2025 Schedule K-1 (Form 1065), inspected locally and not copied into the repository.
- Existing implementation: `K1YearEntryForm.tsx`, `k1FieldGroups.ts`, `K1BasisWorkspace.tsx`, shared K-1 types, API field map, calculation behavior, and focused tests.
- Existing product context: the tab is already named **K1 & Cash Activity**, dated cash activity is managed above the annual editor, and Jackson is the current product brand.

## Reference Form Observations

The supplied form uses a dense but predictable paper hierarchy:

1. A strong header identifies Schedule K-1, the form family, tax year, and final/amended state.
2. Part I (partnership information) and Part II (partner information) occupy the left side.
3. Item K liabilities and Item L capital account analysis are compact beginning/ending tables inside Part II.
4. Part III occupies the right side and uses two vertical runs of numbered boxes 1 through 23.
5. Black section tags, gray header bands, thin dark rules, and bottom/right-aligned values make the form scannable without decorative cards.

The product should reproduce that information hierarchy, not the source document's private populated values or exact print artifact.

## Decision 1: Semantic form, not PDF facsimile

**Decision**: Build the visual structure with semantic React markup and responsive Tailwind/CSS Grid. Do not use the reference PDF as a background, image, canvas, or positioned overlay.

**Rationale**: Semantic markup supports real inputs, validation, keyboard navigation, screen readers, responsive stacking, text resizing, and Jackson's existing state. It also avoids committing a private source asset.

**Alternatives considered**:

- Background image with inputs overlaid: rejected because it is brittle across zoom and viewports, inaccessible, and difficult to maintain when forms change.
- Canvas or generated PDF editor: rejected because the request concerns in-app entry, not tax-form generation, and it would replace established React controls and behavior.
- Keep the current card groups and only rename headings: rejected because it would not solve the user's source-to-screen translation problem.

## Decision 2: Familiar hierarchy with truthful Jackson boundaries

**Decision**: Render a recognizable header, Part I, Part II, Item K, Section L, and Part III. Include unsupported official lines only as subdued, static landmarks labeled **Not tracked in Jackson**. Place app-only fields in a distinct **Jackson supplemental workpaper** beneath the form.

**Rationale**: Hiding every unsupported line would distort the spatial map users rely on, while editable-looking placeholders would falsely imply storage and calculation support. A separate workpaper retains opening-basis and book-tax functionality without pretending those values are literal K-1 cells.

**Alternatives considered**:

- Omit unsupported official lines: rejected because supported lines would no longer appear where users expect them on the source form.
- Add new writable fields for every official cell: rejected because that expands scope into new persistence, imports, calculations, and tax semantics.
- Insert supplemental fields into visually convenient official boxes: rejected because it creates misleading tax-form semantics.

## Decision 3: One canonical editable inventory

**Decision**: Keep `K1_EDITABLE_FIELDS` as the sole inventory used for initialization, dirty comparison, normalization, and change-set construction. Add a typed presentation map that references those definitions and assigns each one a form location exactly once.

**Rationale**: The most important preservation guarantee is that a visual refactor cannot silently omit a field or change a field key. A set-equality test between editable definitions and supported placements makes that guarantee executable.

**Alternatives considered**:

- Define field rules again in each visual component: rejected because duplicated labels, sign flags, and keys will drift.
- Replace `k1FieldGroups.ts` with a new layout-only array immediately: rejected because it increases regression risk in the same change that reorganizes the UI.

## Decision 4: Preserve historical field semantics exactly

**Decision**: Preserve the existing field key, label semantics, sign behavior, and calculation role for every line, including Jackson's split line 13 fields and historical line 18 naming. The UI may use form line/code badges, but it must not silently translate a value into a different official tax meaning.

**Rationale**: Some existing internal field names are more specific or historically shaped compared with the supplied 2025 form. Correcting tax semantics would require a separate data-contract and migration review. This feature is a presentation refactor.

**Alternatives considered**:

- Rename or remap historical keys to match the current form: rejected because imports, revisions, calculations, journal sourcing, and existing records depend on them.
- Display only official generic line headings: rejected because users still need to understand the specific Jackson value being edited.

## Decision 5: Reuse loaded identity data

**Decision**: Pass existing `PartnershipTrackerDetail.summary` context from `K1BasisWorkspace` to the annual editor. Populate Part I with available partnership name, EIN, and address; populate Part II with the owning entity name; show **Not available** for facts Jackson does not hold in the current response.

**Rationale**: The partnership detail query already contains the safe context needed for useful orientation. A presentation refactor does not justify another request or new API fields.

**Alternatives considered**:

- Add a tax-profile endpoint: rejected because no new data entry or persistence was requested.
- Invent placeholder tax IDs or percentages: rejected because it would make the form look complete at the cost of correctness.
- Leave Part I and Part II blank: rejected because the form would be visually familiar but insufficiently tied to the selected partnership.

## Decision 6: Derived cash activity remains canonical

**Decision**: Continue detecting `capital_contributions` and `box_19_distributions` as dated fields from cash-flow events. Render their values at the corresponding Section L/Part III locations as disabled fields with the existing **Calculated from dated cash activity** explanation.

**Rationale**: Dated events drive annual totals, XIRR, recallable distribution behavior, and commitment changes. Allowing duplicate annual edits would reintroduce conflicting sources of truth.

**Alternatives considered**:

- Make the form cells editable and reconcile later: rejected because it permits inconsistent financial records.
- Hide derived cells: rejected because users need to reconcile the source K-1 and understand where the annual total came from.

## Decision 7: Responsive structure follows logical DOM order

**Decision**: Use a single semantic order: header, Part I, Part II, Part III, supplemental workpaper, override, draft, and actions. Wide screens use CSS placement to resemble the paper's left/right composition; smaller screens stack sections and Part III lines in numeric order.

**Rationale**: DOM order must remain understandable without CSS for keyboard and screen-reader users. A narrow viewport cannot preserve a literal letter-size aspect ratio and remain usable.

**Alternatives considered**:

- Force a minimum-width paper canvas with horizontal scrolling: rejected because it makes mobile entry and zoom difficult.
- Reorder DOM nodes to produce desktop columns: rejected because assistive reading order would become confusing.

## Decision 8: Preserve the current interaction state machine

**Decision**: `K1YearEntryForm` remains the state and change-set owner. It continues to provide preview, save, revert, manual override and reason, draft summary, notices, provenance, carried values, legacy line 13 handling, pending states, sticky actions, and dirty callbacks.

**Rationale**: Those behaviors are already integrated with revision checks, dependent-year recalculation, and navigation guards. New visual components should receive values and callbacks, not create competing form state.

**Alternatives considered**:

- Give each K-1 part its own form/store: rejected because cross-section dirty state, override context, and one-save behavior would fragment.
- Introduce a form library during the redesign: rejected because it adds dependency and migration risk without solving the information-architecture problem.

## Decision 9: Structural and behavioral tests, plus targeted visual QA

**Decision**: Add automated inventory/mapping tests and update existing editor, workflow, and accessibility tests. Use targeted desktop and 390-pixel manual browser checks against the reference rather than introduce a new screenshot framework in this feature.

**Rationale**: DOM tests can guarantee field coverage and unchanged change sets. Human comparison is still needed to judge recognizable K-1 resemblance. A visual-regression dependency is not required for this bounded refactor.

## Resolved Unknowns

- **Does this require backend work?** No. Existing detail data and field contracts cover the requested presentation.
- **Should every official K-1 line become editable?** No. Unsupported cells are landmarks only.
- **Should the layout exactly reproduce letter-size paper on mobile?** No. Desktop emphasizes resemblance; smaller screens emphasize readability and access.
- **Should the source PDF be committed for tests or styling?** No. It is a local design reference only.
- **Does Part I/Part II require invented or newly persisted tax profile data?** No. Existing facts render; missing facts are explicit.

