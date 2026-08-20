# UI Contract: Application Color System

## Scope

This contract governs production UI under `apps/web/src`, including routed pages, shared chrome, dialogs, drawers, nested workspaces, feature-flag variants, MUI components, SVG/CSS colors authored by Jackson, and reusable class recipes. Generated output, third-party package code, test fixtures, and vendor assets are excluded.

## Canonical Interaction Contract

| Semantic utility | Value | Permitted use |
| --- | --- | --- |
| `primary` | `#14532D` | Primary buttons, strong interactive links, selected control boundary |
| `primary-hover` | `#0F3D22` | Hover for primary controls |
| `primary-active` | `#0F2A1E` | Active/pressed primary controls |
| `primary-foreground` | `#FFFFFF` | Text/icon on primary controls |
| `focus` | `#166534` | Focus-visible ring/border with offset where required |
| `primary-subtle` | `#F2F6F3` | Selected/hover background with primary foreground |
| `primary-subtle-hover` | `#E6EDE8` | Stronger subtle hover/active background |
| `inverse-background` | `#FFFFFF` | Primary-equivalent control on a dark surface |
| `inverse-foreground` | `#14532D` | Text/icon on inverse control |

Gold, amber, blue, emerald, or raw green values MUST NOT style a standard primary action, general focus ring, input focus state, selected navigation/tab/card, or generic interactive link.

## Neutral Contract

| Role | Value | Notes |
| --- | --- | --- |
| Canvas | `#F4F7FA` | Default application background |
| Surface | `#FFFFFF` | Cards, dialogs, inputs |
| Subtle surface | `#F8FAFC` | Secondary grouping |
| Decorative border | `#DAE2EC` | Only when layout does not depend on border visibility |
| Control border | `#64748B` | Essential form/control boundary |
| Primary text | `#17263A` | 15.28:1 on white |
| Secondary text | `#3E5169` | 8.12:1 on white |
| Muted text | `#5F7185` | 5.02:1 on white |

Existing gray/slate utilities may remain temporarily during migration, but final standard components MUST express these roles through semantic aliases so neutral choices do not vary by feature.

## Semantic Tone Contract

| Tone | Strong/text | Soft background | Usage |
| --- | --- | --- | --- |
| Success | `#047857` | `#ECFDF5` | Success, valid, settled, positive financial direction |
| Warning | `#92400E` | `#FFFBEB` | Warning, review, incomplete data |
| Danger | `#B91C1C` | `#FEF2F2` | Error, destructive action, negative condition |
| Info | `#1D4ED8` | `#EFF6FF` | Informational, calculated, processing |

Semantic tones MUST include a text, icon, label, sign, or pattern cue. They MUST NOT become alternative primary-action colors. Chart, map, asset-category, institution, and multi-series colors use the visualization palette or a named exception.

## Button API

```ts
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  pending?: boolean
}

function Button(props: ButtonProps): React.ReactElement

function buttonClassName(options?: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}): string
```

### Behavior

- Default variant is `primary`; default size is `md`.
- `pending` and native `disabled` use the same disabled color/cursor contract and preserve an accessible name.
- Every variant includes default, hover, active, focus-visible, and disabled classes.
- `danger` uses danger tokens; it is never simulated with `primary` plus a local red override.
- `inverse` is used for primary-equivalent actions on dark surfaces and replaces gold hero/sidebar CTAs.
- `buttonClassName` is the only supported way to give a `Link` or `<a>` the button visual contract.
- Consumer `className` may add layout, width, spacing, and responsive behavior but MUST NOT override colors or focus.

## Non-Button Recipes

`colorRecipes.ts` MUST export shared recipes for:

- focus-visible ring and inverse focus;
- text input/select/textarea control border and focus;
- checkbox/radio/accent state;
- interactive text link;
- icon-only neutral action;
- selected navigation/tab/card/row state;
- file-drop hover/active state.

Native semantics and existing event behavior remain unchanged.

## MUI Contract

- `main.tsx` provides one root `ThemeProvider`.
- MUI `palette.primary`, `error`, `background`, `text`, and divider values come from `design-tokens.js`.
- MUI Button, TextField, Checkbox/Radio, focus-visible, and disabled overrides align with the shared interaction contract.
- Component-local `sx` may define layout but MUST NOT establish a competing primary palette.

## Legacy Compatibility

- `.btn-primary`, `.btn-secondary`, `.input-field`, and `.label-text` may temporarily delegate to semantic recipes.
- `jackson-gold`, `jackson-hover`, and `jackson-light` MUST NOT remain as interactive aliases at completion.
- A decorative gold brand mark, if retained, uses a newly named decorative token and a named exception; its token cannot be referenced by action recipes.
- Page-local `DesignButton`, `MagicButton`, and other duplicate variant maps migrate to or wrap the shared API, then are removed when no consumers remain.

## Exception Contract

`color-exceptions.json` entries require `id`, exact `path`, exact `match`, `category`, `rationale`, and `review`. Only `semantic`, `visualization`, and `decorative` categories are valid. No exception may cover a directory, glob, standard action, focus indicator, or selected control.

The governance command fails when:

- a prohibited token/literal exists without an exact active exception;
- an exception no longer matches source;
- multiple exceptions cover the same occurrence;
- an exception uses an invalid category or omits rationale/review;
- a raw canonical token value appears outside the token source or documented bridge.

## Accessibility Contract

- Ordinary text meets at least 4.5:1 contrast; essential control boundaries and state/focus indicators meet at least 3:1.
- Focus is visible for every keyboard-operable element, normally as a two-pixel focus ring with a two-pixel offset.
- Dark surfaces use inverse focus where the standard focus color cannot maintain boundary contrast.
- Selected, validation, financial direction, status, and workflow states include a non-color cue.
- Forced-colors mode retains native/explicit outlines instead of suppressing them.

## Behavioral Compatibility

The migration MUST NOT change DOM roles, accessible names, event handlers, form submission, routing, permissions, data fetching, calculations, persistence, responsive breakpoints, or focus order.

