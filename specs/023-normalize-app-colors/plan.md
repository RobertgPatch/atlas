# Implementation Plan: Normalize Application Color System

**Branch**: `codex/023-normalize-app-colors` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-normalize-app-colors/spec.md`

## Summary

Replace the application's competing gold, raw green, and blue interaction treatments with one semantic color system centered on an accessible Jackson forest-green primary palette. A single design-token module will feed Tailwind and the MUI bridge; shared action and form-control recipes will replace duplicated feature-local variants; an explicit semantic/data-visualization exception model will protect status meaning; and an automated source audit plus route matrix will prevent drift. This is a web-only presentation refactor with no API, database, routing, calculation, or permission changes.

## Technical Context

**Language/Version**: TypeScript `~6.0.2`, JavaScript ESM design-token bridge, React 19.2, Node.js 22+  
**Primary Dependencies**: Tailwind CSS 3.4, MUI 9, Emotion, React Testing Library, Vitest 2; no new runtime dependency  
**Storage**: N/A; design tokens and the named exception registry are source-controlled files  
**Testing**: Vitest and React Testing Library for token/primitive/component coverage; a TypeScript-AST-backed Node color-governance script; web lint, typecheck, full test suite, production build; manual keyboard and route-matrix visual verification  
**Target Platform**: Jackson browser application across supported desktop, tablet, and mobile viewports, including both `VITE_MAGIC_PATTERN_DESIGNS` variants  
**Project Type**: npm-workspace React web application within the existing TypeScript monorepo  
**Performance Goals**: No added request or React state; token/primitive migration must not introduce perceptible interaction latency and should keep the production CSS bundle within 5 KB gzip of baseline  
**Constraints**: Preserve all behavior and semantic status meaning; keep red/amber/info/data-series colors distinct; eliminate undocumented legacy interactive colors; maintain WCAG 2.2 AA contrast and visible focus; do not add a styling framework or runtime package  
**Scale/Scope**: 17 rendered route families, both supported design variants, nested dialogs/drawers/workspaces, 334 native buttons across 95 TSX files, plus links, form controls, navigation, selections, progress, MUI controls, charts, maps, and status surfaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still an unfilled template and defines no enforceable project-specific principles. The following repository-local gates apply:

1. **Behavior preservation**: PASS. The feature changes presentation and shared recipes only; event handlers, routing, permissions, calculations, API contracts, and persistence remain unchanged.
2. **One source of visual truth**: PASS. Canonical values live in one importable ESM token module consumed by Tailwind, MUI, tests, and the audit tool.
3. **Semantic integrity**: PASS. Primary interaction is separated from success, warning, danger, info, workflow, financial direction, chart, map, and category color roles.
4. **Accessible interaction**: PASS. Token pairs have documented contrast ratios, focus-visible treatment is explicit, inverse surfaces are covered, and no state may rely on color alone.
5. **Application-wide coverage**: PASS. The route matrix includes every rendered route family and both supported design variants, while the source audit covers nested dialogs and feature components.
6. **Incremental compatibility**: PASS. Existing global classes can be remapped temporarily while consumers migrate, but misleading gold aliases are removed before completion.
7. **Dependency restraint**: PASS. Tailwind, MUI, TypeScript, and Vitest already exist; the governance script uses the installed TypeScript parser.
8. **Regression protection**: PASS. Shared recipes, semantic tokens, source governance, representative modules, keyboard focus, contrast, and the complete web build/test path are verified.

### Post-Phase 1 Re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/color-system-ui.md](./contracts/color-system-ui.md), and [quickstart.md](./quickstart.md). Result: **PASS**.

- The UI contract defines one forest-green action hierarchy without flattening warning, error, status, financial, chart, or map semantics.
- The token and exception models make every nonstandard color classifiable and auditable.
- The shared recipes cover primary, secondary, ghost, danger, inverse, icon, form-control, focus, selected, and disabled states.
- Verification includes token contrast assertions, source scanning, all route families, both feature-flag variants, keyboard focus, tests, lint, typecheck, and production build.

## Project Structure

### Documentation (this feature)

```text
specs/023-normalize-app-colors/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- color-system-ui.md
`-- tasks.md                         # created separately by speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
|-- design-tokens.js                 # canonical ESM token values
|-- design-tokens.d.ts               # typed token contract for TS consumers
|-- color-exceptions.json            # named semantic/visualization exceptions
|-- tailwind.config.js               # semantic utility aliases sourced from tokens
|-- package.json                     # check:colors command
|-- scripts/
|   `-- check-color-system.mjs        # AST/string audit for prohibited UI colors
`-- src/
    |-- main.tsx                     # root MUI ThemeProvider
    |-- index.css                    # semantic component recipes and temporary aliases
    |-- theme/
    |   |-- muiTheme.ts              # MUI adapter sourced from canonical tokens
    |   `-- colorSystem.test.ts       # token shape and contrast assertions
    |-- components/shared/
    |   |-- Button.tsx               # primary/secondary/ghost/danger/inverse primitive
    |   |-- Button.test.tsx
    |   |-- colorRecipes.ts           # link, focus, field, selection, icon recipes
    |   `-- AppShell.tsx              # navigation and global chrome migration
    |-- pages/                        # authentication, dashboard, admin, route surfaces
    `-- features/                     # module-by-module consumer migration

apps/web/src/features/
|-- estate-map/
|-- investment-tracker/
|-- k1/
|-- k1-tracker/
|-- partnership-tracker/
|-- partnerships/
|-- reports/
|-- review/
`-- tic-registry/
```

**Structure Decision**: Keep color ownership inside the web workspace. Put raw palette values in one small ESM module at the workspace root so Tailwind configuration, browser code, MUI, tests, and Node scripts can consume the same values. Provide shared React/action recipes under the existing shared-component area, then migrate feature consumers without moving their business logic. Store exceptions as reviewable data instead of hiding them in scattered comments.

## Phase 0: Research Outcomes

1. **Canonical action direction**: Use forest green for standard interaction: `#14532D` default, `#0F3D22` hover, `#0F2A1E` active, `#166534` focus/border, `#F2F6F3` subtle selected surface, and white foreground. Gold is not a standard control color.
2. **Semantic tokens over palette names**: Expose roles such as `primary`, `focus`, `surface`, `text`, `control-border`, `success`, `warning`, `danger`, and `info`. Feature code must not choose a hue family to approximate a role.
3. **One shared token module**: Use `apps/web/design-tokens.js` as the raw-value source. Tailwind configuration and the MUI theme adapt the same object rather than maintaining independent palettes.
4. **Shared interaction recipes**: Standard text/icon buttons use one `Button`/`buttonClassName` API. Inputs, links, selections, tabs, icon buttons, and native choices consume shared recipes where a component abstraction would be excessive.
5. **Semantic colors remain semantic**: Success/positive/settled, warning/review, danger/error/destructive, info/calculated, workflow status, provenance, chart series, custodian, asset category, and map colors are not recolored as primary actions.
6. **Contextual inverse treatment**: Dark heroes, sidebars, and form headers use the shared inverse action/focus recipe instead of introducing gold or a second green button hierarchy.
7. **MUI is bridged at the root**: A `createTheme` result sourced from the canonical tokens is provided above the React tree so any MUI screen cannot fall back to its default blue primary palette.
8. **Automated governance uses classification plus exceptions**: The audit flags legacy Jackson gold classes, raw primary-green values outside the token source, and unsanctioned primary/focus color utilities. Named exceptions identify path, token/pattern, category, and rationale; blanket directory exemptions are prohibited.
9. **Migration is role-first**: Add tokens and recipes, migrate shared chrome/authentication, then current feature surfaces, then legacy variants, and finally remove compatibility aliases. This keeps each intermediate state buildable.
10. **Verification is layered**: Token contrast tests catch inaccessible pairs; primitive tests catch missing states; the audit catches source drift; route-matrix review catches contextual misuse that static scans cannot understand.

## Phase 1: Design Outcomes

- `ColorSystem` separates interaction, neutral surface/text, semantic status, and visualization/decorative roles.
- `Button` supports `primary`, `secondary`, `ghost`, `danger`, and `inverse` variants plus `sm`, `md`, `lg`, and `icon` sizes; `buttonClassName` styles button-like links without adding an `asChild` dependency.
- `colorRecipes.ts` supplies shared focus, control, choice, interactive-link, selected-surface, and icon-action strings for native elements that should remain native.
- Tailwind semantic classes are generated from the shared token values. Legacy `.btn-primary`, `.btn-secondary`, `.input-field`, and `.label-text` become compatibility wrappers over semantic recipes during migration.
- The MUI theme sets primary, error, background, text, divider, focus, disabled, and component overrides from the same token source and is installed in `main.tsx`.
- `color-exceptions.json` contains only non-interactive semantic, visualization, and decorative uses. Every entry requires a stable ID, path, match, category, rationale, and review note.
- The governance script scans production `.ts`, `.tsx`, and `.css`, excludes tests/generated assets, parses JSX/template literals with the installed TypeScript package, reports file/line/token, and fails on missing, stale, duplicate, or overbroad exceptions.
- Tests assert token values and contrast, button/recipe state composition, MUI alignment, shell navigation states, representative dialogs/forms, and modules formerly using gold/raw green/blue focus.
- The manual route matrix covers both feature-flag variants, dark/inverse surfaces, keyboard focus, selected controls, validation/status states, loading/disabled states, and 390-pixel layouts.

## Implementation Sequence

1. Add `design-tokens.js` and its declaration with the canonical interaction, neutral, semantic, and inverse roles; add contrast and schema tests before consumer migration.
2. Wire semantic token aliases into Tailwind, add the token-driven MUI theme, and wrap the root React tree so CSS utility and MUI consumers share the same values.
3. Add `Button`, `buttonClassName`, and non-button recipes with tests for every variant, size, focus-visible, loading/disabled, and inverse state.
4. Remap global compatibility classes to semantic recipes, then migrate `AppShell`, loading, shared headers/toolbars/dialogs, authentication, permission, and administration surfaces.
5. Migrate current dashboard, entity, partnership workspace, K-1 review/intake, and investment-tracker surfaces from raw green, gold, and blue interaction values to shared roles.
6. Migrate remaining K-1 tracker, partnership, liquidity, TIC registry, estate-map, reports, aggregation, upload, and legacy feature-flag surfaces while preserving semantic and visualization colors.
7. Classify every remaining non-neutral color use. Convert semantic uses to shared status tokens and record only legitimate chart/map/category/decorative exceptions.
8. Add the AST-backed governance command and exception validation; remove `jackson-gold`, `jackson-hover`, raw primary-green action values, unsanctioned blue focus/primary styles, duplicated local button variants, and temporary aliases.
9. Update brittle color assertions to verify semantic variants/tokens, run focused and full automated checks, and complete the route/feature-flag/keyboard/mobile visual matrix in quickstart.

## Complexity Tracking

No constitution violations or exceptional architecture are introduced. The shared token bridge is necessary because Tailwind configuration, React TypeScript, MUI, and Node audit code run in different contexts; the ESM module keeps those consumers on one palette without adding a package.
