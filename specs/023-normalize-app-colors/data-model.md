# Phase 1 Data Model: Normalize Application Color System

This feature has no persisted business data. The model below defines the source-controlled design-system objects and validation relationships that implementation and tests must enforce.

## ColorSystem

Canonical root object exported by `apps/web/design-tokens.js`.

### Fields

| Field | Type | Purpose |
| --- | --- | --- |
| `interaction` | `InteractionTokens` | Primary, focus, selected, inverse, and disabled interaction roles |
| `neutral` | `NeutralTokens` | Canvas, surfaces, borders, control borders, and text hierarchy |
| `semantic` | `SemanticToneTokens` | Success, warning, danger, and informational feedback roles |
| `visualization` | `VisualizationTokens` | Approved chart/map/category series; never used to imply standard action hierarchy |
| `decorative` | `DecorativeTokens` | Narrow brand-only accents such as a non-interactive mark |

### Validation Rules

- Every value is a normalized six-digit uppercase hex color.
- Token keys are unique and role-based; no key may contain a feature name.
- Standard text pairs meet at least 4.5:1; large text and essential non-text indicators meet at least 3:1.
- Interaction foreground/background pairs have explicit default, hover, active, focus, and disabled treatment.
- A visualization or decorative token cannot be consumed by a shared action recipe.

## InteractionTokens

### Fields

| Field | Value | Role |
| --- | --- | --- |
| `primary` | `#14532D` | Standard primary action and strong interactive text |
| `primaryHover` | `#0F3D22` | Primary hover |
| `primaryActive` | `#0F2A1E` | Primary active/pressed |
| `primaryForeground` | `#FFFFFF` | Text/icon on primary |
| `focus` | `#166534` | Focus-visible and selected control boundary |
| `subtle` | `#F2F6F3` | Selected/hover surface |
| `subtleHover` | `#E6EDE8` | Stronger subtle interaction surface |
| `inverseBackground` | `#FFFFFF` | Primary-equivalent action on dark surfaces |
| `inverseForeground` | `#14532D` | Text/icon for inverse action |
| `disabledBackground` | neutral token | Disabled control fill |
| `disabledForeground` | neutral token | Disabled control text/icon |

## NeutralTokens

### Fields

| Field | Planned value | Role |
| --- | --- | --- |
| `canvas` | `#F4F7FA` | Application background |
| `surface` | `#FFFFFF` | Cards, dialogs, fields |
| `surfaceSubtle` | `#F8FAFC` | Secondary panels and table bands |
| `border` | `#DAE2EC` | Nonessential section/card separation |
| `controlBorder` | `#64748B` | Essential control boundary |
| `textPrimary` | `#17263A` | Headings and primary copy |
| `textSecondary` | `#3E5169` | Supporting copy |
| `textMuted` | `#5F7185` | Metadata, hints, placeholders where text contrast applies |

### Validation Rules

- `textPrimary`, `textSecondary`, and `textMuted` meet ordinary-text contrast on `surface` and `surfaceSubtle`.
- `controlBorder` meets essential non-text contrast on `surface`.
- `border` may be lower contrast only where the boundary is decorative and layout/spacing already identifies the region.

## SemanticToneTokens

Each tone owns `foreground`, `background`, `border`, and where applicable `strong`, `hover`, and `active` values.

| Tone | Foreground/strong | Background | Meaning |
| --- | --- | --- | --- |
| Success | `#047857` | `#ECFDF5` | Completed, settled, valid, positive result |
| Warning | `#92400E` | `#FFFBEB` | Review, caution, incomplete data |
| Danger | `#B91C1C` | `#FEF2F2` | Destructive action, error, negative condition |
| Info | `#1D4ED8` | `#EFF6FF` | Informational, calculated, processing context |

### Validation Rules

- A semantic tone requires text, icon, label, or pattern support; color alone cannot carry meaning.
- Danger is the only standard destructive action tone.
- Success green cannot substitute for the primary action recipe merely because an action is desirable.
- Warning amber/gold cannot be used as a general call to action.

## InteractiveVariant

Reusable recipe consumed by `Button` or `buttonClassName`.

### Fields

| Field | Type | Rules |
| --- | --- | --- |
| `name` | `primary \| secondary \| ghost \| danger \| inverse` | Exhaustive set for standard actions |
| `size` | `sm \| md \| lg \| icon` | Controls height/padding only |
| `default` | class recipe | Must use role tokens |
| `hover` | class recipe | Required except disabled |
| `active` | class recipe | Required for actionable variants |
| `focusVisible` | class recipe | Required and shared |
| `disabled` | class recipe | Required; removes interactive affordance |

### Relationships

- `InteractiveVariant` references `InteractionTokens`, `NeutralTokens`, or danger tokens.
- `Button` and button-like links consume one `InteractiveVariant`.
- Feature components may add layout classes but cannot replace the variant's color state classes.

## ColorUsageClassification

Classification assigned during migration.

| Value | Definition | Allowed source |
| --- | --- | --- |
| `interaction` | Control hierarchy, focus, selection, navigation, links | Shared interaction tokens/recipes only |
| `semantic` | Success, warning, danger, info, workflow, financial direction | Shared semantic tokens with non-color cue |
| `visualization` | Chart, map, category, custodian, data series | Visualization tokens or named exception |
| `decorative` | Brand mark or non-informational flourish | Decorative token or named exception |

## ColorException

Entry in `apps/web/color-exceptions.json` for a legitimate nonstandard production occurrence.

### Fields

| Field | Type | Validation |
| --- | --- | --- |
| `id` | stable kebab-case string | Unique and descriptive |
| `path` | repository-relative file path | Exact file; no directories or globs |
| `match` | exact literal/token | Must occur in the file exactly as declared |
| `category` | `semantic \| visualization \| decorative` | `interaction` is forbidden |
| `rationale` | nonempty string | Explains why a standard token cannot express the use |
| `review` | nonempty string | Identifies how the use is visually/semantically verified |

### State Transitions

```text
candidate -> approved -> active -> removed
     |          |          |
     +-> rejected          +-> stale (audit failure)
```

- A candidate becomes approved only after its role is classified and a standard token is shown inadequate.
- The audit treats missing, duplicated, mismatched, or stale active exceptions as failures.
- An exception is removed when the usage is tokenized or deleted.

## RouteCoverageEntry

Manual verification record described in quickstart.

### Fields

| Field | Type | Purpose |
| --- | --- | --- |
| `routeFamily` | string | Rendered route or nested workspace family |
| `variant` | `current \| legacy \| both` | Feature-flag state to test |
| `states` | string[] | Primary, secondary, focus, selected, disabled, status, inverse, error |
| `viewports` | string[] | Desktop and 390px minimum |
| `result` | `pending \| pass \| fail` | Verification state |
| `evidence` | string | Test name or screenshot/manual note |

### Validation Rules

- Every rendered route in `apps/web/src/App.tsx` appears at least once.
- Every feature-flagged route is checked in each supported variant.
- At least one keyboard-only pass and one 390px pass exist for every route family containing editable controls.

