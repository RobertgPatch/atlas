# Color System Implementation Baseline

Captured on 2026-08-19 from branch `codex/023-normalize-app-colors` before production color-system changes.

## Source inventory

Counts cover production files under `apps/web/src` and exclude tests/specs.

| Signal | Occurrences | Production files |
| --- | ---: | ---: |
| Legacy gold aliases/literals (`jackson-gold`, `jackson-hover`, `#C9A96E`, `#B39359`) | 271 | 56 |
| Raw primary-green literals/utilities | 38 | 22 |
| Blue/indigo focus utilities | 33 | 18 |
| Native `<button>` elements | 298 | 90 |

The inventory is a migration baseline, not an assertion that every match has the same role. Remaining non-neutral colors will be classified before governance is enabled.

## Production CSS baseline

`npm run --workspace=web build` completed successfully with Vite 8.0.9.

- Minified CSS: 106.11 kB
- Gzipped CSS: **16.93 kB**
- JavaScript bundle warning: the existing main chunk remains above Vite's 500 kB advisory threshold; this color-only feature does not alter code splitting.

## Implementation checkpoints

### Foundation (T002-T007)

- Token schema/contrast tests: 12 passed.
- MUI palette/component bridge tests: 2 passed.
- Tailwind production build: passed; semantic aliases resolve from the canonical ESM token source.
- Root MUI provider: installed around the existing query/application providers.
- Interim CSS size: 16.99 kB gzip (+0.06 kB from baseline).

The repository-wide TypeScript check was also sampled here and is currently red from pre-existing application errors (including unresolved `packages/types` imports, `erasableSyntaxOnly` enum usage, stale fixtures, and MUI v9 call-site types). The new token test's recursive type declaration was corrected; full validation will distinguish color-system regressions from that existing debt.

User-story, governance, and final validation evidence will be appended as their task groups complete.

### User Story 1: action hierarchy (T008-T019)

- Shared Button contract: 11 tests passed across primary, secondary, ghost, danger, inverse, four sizes, link recipes, focus, disabled, and pending states.
- Representative action suite: 37 tests passed across shell, both login variants, both entity variants, K-1 review, and partnership route behavior.
- Production build: passed after the app-wide action migration.
- Legacy gold action names in `apps/web/src`: 0.
- Solid blue, indigo, amber, emerald, gray, and black primary-action fills were replaced with the canonical primary recipe; remaining colored controls are selection/status/context candidates handled in US2.
- Dark dashboard CTA uses the shared inverse button-link recipe.
- Interim CSS size: 16.37 kB gzip (0.56 kB below baseline).

### User Story 2: shared interaction and semantic roles (T020-T029)

- Shared non-button recipe suite: 8 tests passed for standard/inverse focus, fields, choices, links, icon actions, selected surfaces, navigation, file drops, and forced-colors outlines.
- Representative non-action suite: 35 tests passed across the shell, currency inputs, both login/entity variants, and their field/selection behavior.
- Semantic-preservation suite: 22 tests passed across the K-1 form, partnership accessibility, estate-map selection, allocation chart choices, and TIC status/allocation cues.
- Standard selections, tabs, typeahead options, sort indicators, generic links, checkbox accents, and icon-action hovers now use primary/focus roles. Warning, danger, success, informational, provenance, financial-direction, map, chart, and category colors retain text, icon, sign, label, or ARIA cues.
- K-1 PDF and workbook drop zones consume the shared file-drop recipe.
- No raw gold literals remain in production source under `apps/web/src`; the retained gold value is confined to the named decorative token source.

### User Story 3: drift prevention (T030-T036)

- Governance CLI and exception contract: 7 tests passed.
- `npm run --workspace=web check:colors`: passed with 0 findings.
- The scanner reports deterministic path/line/column/rule/token diagnostics, excludes tests/generated/declarations/bundles, validates exact active exceptions, and rejects interaction exceptions.
- `apps/web/color-exceptions.json` is empty because every production interaction finding was migrated and remaining semantic/visualization colors use named roles rather than raw exceptions.
- Temporary `jackson-gold`, `jackson-hover`, `jackson-light`, and `accent` Tailwind adapters were removed after consumer searches reached zero.

### Final command matrix (T037-T039)

- Color-system/representative suite: 75 tests passed across 12 files.
- Production build: passed with Vite 8.0.9.
- Final CSS: 101.05 kB minified / **16.32 kB gzip**, which is 0.61 kB below the 16.93 kB baseline and 5.61 kB inside the allowed growth ceiling.
- Full Vitest: 84 files passed and 10 files failed; 305 tests passed and 18 failed. Failures are pre-existing non-color fixture/application debt: missing K-1 calculation arrays, stale review-workspace mocks, outdated partnership asset payload assertions, missing QueryClient wrappers, and incomplete capital-activity fixtures. All color-focused and representative route tests pass.
- Lint: still reports 23 errors and 3 warnings in pre-existing React effect and unused-variable debt. The new shared Button refresh-rule diagnostic was resolved; no color-system/governance file remains in the lint output.
- Typecheck: still reports the pre-existing unresolved `packages/types` paths, `erasableSyntaxOnly` enums, stale fixtures, MUI v9 call-site types, unused React imports, and related inference errors. The token/theme/governance files and the Vite/Tailwind configuration bridge add no remaining typecheck diagnostic.

### Live development verification

- The dashboard blank-screen regression was traced to a Vite process that had cached the pre-token Tailwind context and rejected `@apply bg-canvas` with `Canvas class does not exist`.
- `vite.config.ts` now imports and passes the Tailwind config explicitly, making token/config changes part of Vite's CSS dependency graph. After restarting only the verified Atlas Vite process, `/src/index.css` and `/dashboard` both returned HTTP 200 and the browser rendered the sign-in screen.
- An authenticated manual route sweep could not be completed because the running API rejects the repository's retired mock credentials. Automated route, keyboard, selection, semantic-cue, responsive class, and build checks provide the available coverage; the final authenticated desktop/390 px matrix remains T040.
