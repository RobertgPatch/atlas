# Phase 1 Data Model: K-1 Form-Inspired Data Entry

## Scope

This feature adds no database entity or calculation field. It extends the canonical field inventory and change/value contracts so non-monetary Schedule K-1 inputs can use the existing revision text column, and it introduces presentation models for a familiar form layout.

## Existing Canonical Entities

### `PartnershipTrackerDetail`

Already loaded by the partnership workspace.

| Attribute used | Purpose in the new layout | Mutability here |
|---|---|---|
| `summary.partnership.name` | Part I partnership name | Read-only |
| `summary.partnership.ein` | Part I employer identification number | Read-only |
| `summary.partnership.address*` | Part I partnership address | Read-only |
| `summary.partnership.entity.name` | Part II partner/owner name | Read-only |
| `years` | Year rail and selected-year context | Existing behavior |
| `permissions.canEditK1` | Enables or disables editor actions | Existing behavior |

Missing identity facts render as **Not available**. No placeholder value is persisted.

### `K1TrackerYearDetail`

Remains the selected year's source of truth.

| Attribute used | Purpose |
|---|---|
| `taxYear` | Dynamic form year/header |
| `revision` | Optimistic concurrency and editor remount key |
| `values` | Current amounts, text values, and provenance by field key |
| `cashFlowEvents` | Determines contribution/distribution derived read-only state |
| `sourceConflicts` | Existing conflict explanations |
| `calculation` | Carryforward placeholders and preview/result context |
| `signoff` | Existing result/sign-off workflow outside this form |

### `K1TrackerFieldChange`

The preview/save change contract adds an optional text value:

```ts
interface K1TrackerFieldChange {
  fieldKey: K1TrackerFieldKey
  amount: string | null
  textValue?: string | null
  sourceType: 'MANUAL_ENTRY' | 'MANUAL_OVERRIDE'
  overrideReason?: string | null
}
```

Money changes use `amount`. Text/code, percentage, select, and checkbox changes use `textValue` with `amount: null`.

## New Presentation Models

### `K1FormRegion`

```ts
type K1FormRegion =
  | 'part-ii'
  | 'item-k'
  | 'section-l'
  | 'part-iii-left'
  | 'part-iii-right'
  | 'supplemental-opening'
  | 'supplemental-book-tax'
```

Defines a visual location only.

### `K1FormPlacement`

```ts
interface K1FormPlacement {
  fieldKey: K1TrackerWritableFieldKey
  region: K1FormRegion
  itemOrLine: string
  order: number
  code?: string
  sublabel?: string
}
```

Relationships and rules:

- References exactly one canonical definition from `K1_EDITABLE_FIELDS`.
- Does not duplicate input kind, `allowNegative`, carryforward, parsing, or persistence behavior.
- Each canonical editable field has exactly one placement.
- Deprecated write fields `box_13_other_deductions` and `section_l_capital_contributed` are never placements.

### `K1FormIdentityContext`

```ts
interface K1FormIdentityContext {
  partnershipName: string
  partnershipEin: string | null
  partnershipAddress: string | null
  partnerName: string
}
```

Derived from `PartnershipTrackerDetail.summary`; never persisted by this feature.

### `K1FieldPresentationState`

```ts
interface K1FieldPresentationState {
  field: K1FieldDefinition
  value: string
  source?: K1TrackerValue
  carryforward?: string
  derivedFromCashActivity: boolean
  editable: boolean
  conflictMessage?: string
}
```

This view model gathers existing state for a visual cell. It does not own state or calculate money.

## Relationships

```text
PartnershipTrackerDetail.summary
        |
        `--> K1FormIdentityContext --> Part I / Part II (read-only)

K1TrackerYearDetail.values -----------+
K1TrackerYearDetail.cashFlowEvents ---+--> K1FieldPresentationState
K1TrackerYearDetail.calculation ------+             |
K1_EDITABLE_FIELDS -------------------+             v
                                            K1FormPlacement
                                                   |
                                                   v
                                      Item K / Section L /
                                      Part III / Workpaper

```

## Field Inventory Invariants

The canonical editable inventory contains 74 fields:

- Part II classifications, percentages, checkboxes, and section 704(c): 15
- Item K liabilities: 6
- Section L, including canonical capital contributions: 6
- Part III values, codes, and checkboxes: 36
- Supplemental opening and book-tax workpaper: 11

Automated tests must assert:

1. The placement list has 74 unique field keys.
2. Its key set equals `K1_EDITABLE_FIELDS.map(field => field.key)`.
3. No deprecated write key appears.
4. Every formerly untracked official line has a typed control and stable field key.
5. Visual order values are unique within a region or explicitly grouped as subrows.

## Validation Rules

- Input-kind validation, numeric normalization, and negative-value allowance come from `K1FieldDefinition`.
- A cash-activity-derived field is disabled and skipped by `buildChanges`.
- An unavailable identity fact renders a textual unavailable state, never an empty editable control.
- Manual override still requires a nonblank reason before preview or save.
- Source and carryforward annotations remain associated with the corresponding input.
- Long values must remain contained in their cells; presentation formatting must not mutate submitted numeric strings.

## Editor State Transitions

```text
PRISTINE
  | edit supported non-derived field
  v
DIRTY ---- revert ----> PRISTINE
  | preview valid changes
  v
PREVIEWING --> PREVIEWED --> edit --> DIRTY
  | error          |
  `--> DIRTY       | save valid changes
                   v
                 SAVING --> SAVED/PRISTINE
                    |
                    `--> DIRTY + error notice
```

Enabling override or entering an override reason makes the form dirty. Leaving or selecting another tax year continues to use the existing unsaved-change guard.

## Persistence and Migration

- Database migrations: none.
- API contract changes: none.
- Shared type-package changes: none expected.
- Calculation version change: none.
- Existing historical values and deprecated provenance remain readable through current behavior.
