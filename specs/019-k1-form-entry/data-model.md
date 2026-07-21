# Phase 1 Data Model: K-1 Form-Inspired Data Entry

## Complete-Form Amendment (2026-07-19)

The implementation now persists every standard Schedule K-1 input. This amendment supersedes the presentation-only and reference-cell portions of the original model below.

### Persisted official-form extension

Migration `025_k1_complete_form_data.sql` adds:

```sql
alter table k1_tracker_years
  add column if not exists official_form_data jsonb not null default '{}'::jsonb;
```

`K1TrackerYearDetail` exposes `officialFormData`, a partial record over the 48 official-form field keys. Values are one of:

- strings for text, dates, choices, percentages, and official-only money;
- booleans for official checkboxes;
- repeatable `{ code, value }[]` rows for coded Part III lines;
- `null` for explicit API compatibility, although the web editor omits empty values.

`UpdatePartnershipTrackerYearRequest` retains `expectedRevision` and `changes`, and adds optional `officialFormData`. When present, the object is a full replacement saved in the same transaction as calculation changes. It increments the selected year's revision and invalidates its sign-off, but it does not alter calculation inputs or later-year projections.

### Presentation extension

`K1FormOfficialPlacement` replaces `K1FormReferenceCell`. Header and identity key inventories plus Part III placements cover every official key exactly once. `K1OfficialFormFieldDefinition` supplies the control kind, label, choices, sign allowance, and placeholder. Existing partnership identity is a display fallback that a user may replace with tax-year-specific official data.

## Scope

This feature retains all existing calculation entities and adds a JSONB official-form extension to the existing tracker-year entity.

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
| `values` | Current calculation amounts and provenance by field key |
| `officialFormData` | Complete calculation-neutral standard-form values |
| `cashFlowEvents` | Determines contribution/distribution derived read-only state |
| `sourceConflicts` | Existing conflict explanations |
| `calculation` | Carryforward placeholders and preview/result context |
| `signoff` | Existing result/sign-off workflow outside this form |

### `K1TrackerFieldChange`

The preview/save change contract remains unchanged:

```ts
interface K1TrackerFieldChange {
  fieldKey: K1TrackerFieldKey
  amount: string | null
  sourceType: 'MANUAL_ENTRY' | 'MANUAL_OVERRIDE'
  overrideReason?: string | null
}
```

Official-form-only cells are saved separately and never create this entity.

## New Presentation Models

### `K1FormRegion`

```ts
type K1FormRegion =
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
- Does not duplicate `allowNegative`, carryforward, parsing, or persistence behavior.
- Each canonical editable field has exactly one placement.
- Deprecated write fields `box_13_other_deductions` and `section_l_capital_contributed` are never placements.

### `K1FormReferenceCell` (superseded)

```ts
interface K1FormReferenceCell {
  region: 'part-iii-left' | 'part-iii-right' | 'part-ii-reference'
  itemOrLine: string
  label: string
  order: number
  status: 'NOT_TRACKED'
}
```

Historical rules, superseded by `K1FormOfficialPlacement`:

- Has no field key, input value, or change callback.
- Renders as static content and is not focusable.
- Always exposes the text **Not tracked in Jackson**.
- Is excluded from amount initialization, validation, preview, and save.

### `K1FormIdentityContext`

```ts
interface K1FormIdentityContext {
  partnershipName: string
  partnershipEin: string | null
  partnershipAddress: string | null
  partnerName: string
}
```

Derived from `PartnershipTrackerDetail.summary`; used as editable defaults and persisted only when the user saves official-form data.

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

K1FormReferenceCell ----------------------> static form landmarks only
```

## Field Inventory Invariants

The canonical editable inventory contains 42 fields:

- Item K liabilities: 6
- Section L, including canonical capital contributions: 6
- Part III supported values: 19
- Supplemental opening and book-tax workpaper: 11

Automated tests must assert:

1. The placement list has 42 unique field keys.
2. Its key set equals `K1_EDITABLE_FIELDS.map(field => field.key)`.
3. No deprecated write key appears.
4. The 48 official-form keys are each represented exactly once across header, identity, and Part III placements.
5. Visual order values are unique within a region or explicitly grouped as subrows.

## Validation Rules

- Numeric normalization and negative-value allowance continue to come from `K1FieldDefinition`.
- A cash-activity-derived field is disabled and skipped by `buildChanges`.
- An unavailable identity fact renders an empty labeled control.
- Official-form-only money and percentage strings are normalized before save; code/detail rows are trimmed and empty rows removed.
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

- Database migration: `025_k1_complete_form_data.sql`.
- API contract change: optional full-replacement `officialFormData` on update and `officialFormData` on year detail.
- Shared type-package change: official keys, values, code rows, and form-data record.
- Calculation version change: none.
- Existing historical values and deprecated provenance remain readable through current behavior.
