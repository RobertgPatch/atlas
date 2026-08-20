# Phase 0 Research: Normalize Application Color System

## Baseline Inventory

- The web application contains 334 native `<button>` elements across 95 TSX files.
- `jackson-gold` appears 320 times across 60 production/test files; `jackson-hover` appears 39 times across 30 files.
- Raw forest-green primary values appear 92 times across 20 files.
- Blue focus utilities appear 39 times across 17 files; blue primary fills and green/emerald primary fills add further competing action treatments.
- Primary button recipes are duplicated in global CSS, `MagicPatternPrimitives`, two page-local `DesignButton` implementations, and many inline class strings.
- The MUI `MfaScreen` has no application theme and therefore inherits MUI's default primary palette.
- Neutral colors are split across custom `text`/`border` tokens, Tailwind gray, Tailwind slate, and repeated raw blue-gray hexadecimal values.

## Decision 1: Use forest green as the single primary interaction palette

**Decision**: Standard primary interaction uses `#14532D`; hover uses `#0F3D22`; active uses `#0F2A1E`; focus and selected borders use `#166534`; subtle selected surfaces use `#F2F6F3`; foreground uses white.

**Rationale**: The current Magic Patterns workspace already establishes forest green as Jackson's current interaction direction, while the legacy gold palette causes the visible inconsistency reported by the user. The chosen default has a 9.11:1 contrast ratio with white, and the darker hover/active values remain higher contrast.

**Alternatives considered**:

- Keep gold as primary: rejected because it conflicts with the newer product direction and cannot resolve the reported gold-versus-green hierarchy.
- Use neutral black as primary everywhere: rejected because it removes the established Jackson green identity and would make interaction indistinguishable from neutral navigation/chrome in several surfaces.
- Retain multiple primary palettes per feature: rejected because feature ownership is the source of the inconsistency.

## Decision 2: Model colors by semantic role, not hue family

**Decision**: Define interaction, neutral, semantic-status, visualization, and decorative roles. Feature code selects a role (`primary`, `danger`, `warning`, `focus`, `surface`, `text-muted`) rather than a hue (`gold`, `emerald`, `blue`).

**Rationale**: Tailwind supports extending the project's palette, so semantic aliases can remain utility-friendly while raw values stay centralized. This avoids replacing one scattered color family with another. [Tailwind CSS v3 color customization](https://v3.tailwindcss.com/docs/customizing-colors)

**Alternatives considered**:

- Mechanical gold-to-green replacement: rejected because it would incorrectly recolor warning/review, success, chart, map, and decorative uses.
- Use only Tailwind's default named hues: rejected because names expose implementation color instead of product meaning and encourage future drift.

## Decision 3: Share raw values through one ESM token module

**Decision**: Create `apps/web/design-tokens.js` plus a declaration file. Tailwind, browser code, MUI theme construction, tests, and Node audit tooling import this module.

**Rationale**: These consumers execute in different toolchains. An ESM JavaScript module is directly importable by the existing ESM Tailwind config, Vite, and Node without code generation or a new package, while the declaration preserves TypeScript awareness.

**Alternatives considered**:

- Duplicate values between Tailwind and MUI: rejected because drift would remain possible.
- CSS custom properties as the only source: rejected because MUI theme construction and static contrast tests need concrete values before browser CSS resolution.
- Rename Tailwind config to TypeScript: rejected because it creates tooling risk unrelated to the color migration.

## Decision 4: Standardize actions with a primitive and native-control recipes

**Decision**: Add a shared `Button` plus `buttonClassName` for button-like links. Provide class recipes for fields, focus, links, choices, selections, tabs, and icon buttons that should remain native elements.

**Rationale**: A button primitive eliminates duplicated variant maps and ensures complete interaction states. Recipes avoid wrapping every input or navigation element in a new abstraction and preserve existing behavior.

**Alternatives considered**:

- Convert every control into a new component: rejected because it would expand behavioral risk and make an app-wide visual refactor unnecessarily invasive.
- Keep global `.btn-*` classes as the final API: rejected because they cannot provide typed variants or compose cleanly for React links and icon buttons; they remain temporary compatibility adapters only.

## Decision 5: Preserve semantic and visualization colors

**Decision**: Red remains destructive/error, amber remains warning/review, semantic green remains success/positive/settled only when it is not acting as the standard primary hierarchy, blue remains info/calculated where applicable, and charts/maps/categories retain differentiated palettes.

**Rationale**: Flattening all color into forest green would destroy information. Color classifications and non-color labels/icons must travel together so semantics survive the refactor.

**Alternatives considered**:

- One monochrome palette for the entire application: rejected because financial direction, validation, workflow, and data-series differentiation are functional information.
- Allow any feature-specific color if visually appealing: rejected because it recreates ungoverned drift.

## Decision 6: Use one MUI theme at the React root

**Decision**: Build a MUI `createTheme` adapter from the shared tokens and install `ThemeProvider` in `main.tsx`.

**Rationale**: MUI components otherwise use their default theme. MUI documents root `ThemeProvider` injection as the mechanism for applying a consistent application theme. [MUI theming](https://mui.com/material-ui/customization/theming/)

**Alternatives considered**:

- Style every MUI component with local `sx`: rejected because local overrides repeat the problem and omit future components.
- Remove MUI in this feature: rejected because library migration is materially broader than color normalization.

## Decision 7: Enforce contrast and focus at the token/recipe layer

**Decision**: Test documented text/control pairs, require a visible two-pixel focus treatment with offset where needed, provide an inverse focus recipe for dark surfaces, and keep labels/icons/non-color cues for semantic states.

**Rationale**: WCAG 2.2 calls for 4.5:1 contrast for ordinary text, 3:1 non-text contrast for essential UI component/state indicators, and a visible focus indicator. Centralized tests make these properties durable. [WCAG 2.2 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), and [focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

**Alternatives considered**:

- Visual inspection only: rejected because it cannot reliably catch token regressions.
- Add a new accessibility package solely for color math: rejected because the contrast formula is small, stable, and testable with existing Vitest.

## Decision 8: Add an AST-backed governance check and named exceptions

**Decision**: Use the installed TypeScript parser in a Node script to inspect production TS/TSX/CSS literals. Fail on legacy gold interaction tokens, raw canonical-primary values outside the token source, unsanctioned blue/green primary or focus utilities, malformed exceptions, and stale exceptions.

**Rationale**: Simple repository grep produces false positives for chart and status colors and cannot distinguish interactive JSX. AST context improves precision; named data exceptions keep intentional uses visible in review.

**Alternatives considered**:

- A broad grep command only: rejected because legitimate semantic/visualization colors would require broad file exemptions.
- A custom published ESLint plugin: rejected because a local audit command meets the need without package or plugin maintenance.
- Inline disable comments: rejected because they are hard to inventory and easy to copy without rationale.

## Resolved Unknowns

All technical-context questions are resolved. The work requires no API/storage change, no new dependency, no redesign of status meaning, and no clarification before task generation.

