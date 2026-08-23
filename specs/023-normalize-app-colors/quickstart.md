# Quickstart: Verify the Normalized Color System

## Prerequisites

- Node.js 22+
- Repository dependencies installed
- Local API/data needed for authenticated route review
- Two web runs or rebuilds: `VITE_MAGIC_PATTERN_DESIGNS=true` and `false`

## 1. Run token, primitive, and governance checks

```powershell
npm run --workspace=web test -- src/theme/colorSystem.test.ts src/components/shared/Button.test.tsx
npm run --workspace=web check:colors
```

`check:colors` scans production UI source, reports deterministic file/line/token diagnostics, validates every exact entry in `apps/web/color-exceptions.json`, and exits nonzero on drift. Test files, generated output, declarations, dependencies, and production bundles are excluded.

Expected:

- Canonical token shape and documented contrast pairs pass.
- Every button variant includes focus and disabled states.
- No legacy gold interactive token, raw canonical-primary value, or unsanctioned blue/green primary/focus utility appears in production UI.
- Every declared color exception is exact, active, and justified.

## 2. Run focused representative tests

```powershell
npm run --workspace=web test -- src/components/shared/AppShell.test.tsx src/pages/LoginPage.test.tsx src/pages/EntitiesPage.test.tsx src/pages/K1ReviewWorkspace.test.tsx src/pages/PartnershipTrackerPage.test.tsx
```

Verify semantic variants/tokens rather than raw obsolete class names.

## 3. Run complete web verification

```powershell
npm run --workspace=web lint
npm run --workspace=web typecheck
npm run --workspace=web test
npm run --workspace=web build
```

Compare production CSS output with baseline; gzip growth attributable to the color migration must remain below 5 KB.

## 4. Search for known drift patterns

```powershell
rg -n --glob '*.{ts,tsx,css}' 'jackson-(gold|hover|light)|#(?:1B4332|166534|14532D|0F3D22|0F2A1E)|(?:focus|focus-visible):(ring|border)-blue-(400|500|600)' apps/web/src
```

Expected: canonical raw values appear only in the token/bridge source allowed by the governance command; legacy interactive names produce no production consumer hits.

## 5. Manual route matrix

Check each rendered route family at desktop width and 390 CSS pixels. For feature-flagged surfaces, repeat with both supported values.

| Route family | Variant(s) | Required states |
| --- | --- | --- |
| `/` | Current, legacy | Sign-in primary/secondary, field focus, error, disabled/loading, brand mark |
| `/dashboard` | Current | Hero inverse action, cards, links, alerts, navigation, focus |
| `/k1` | Both shell variants | Upload primary, drop zone, progress, queue status, dialogs |
| `/k1/:id/review` | Current | Review/apply actions, selected fields, warnings, conflicts, completion |
| `/upload` | Both shell variants | Placeholder/shared shell states |
| `/entities` | Current, legacy | Primary action, filters, selected rows/cards, dialogs, validation |
| `/entities/:id` | Current, legacy | Header actions, tabs, cards, forms, danger actions |
| `/reports` | Both shell variants | Header actions, filters, editable cells, charts, status/data colors |
| `/liquidity` | Both shell variants | Actions, forms, tables, positive/negative values, focus |
| `/tic-registry` | Both shell variants | Actions, selections, dialogs, map/category colors |
| `/partnership-aggregation` | Both shell variants | Filters, export dialog, table interaction, status colors |
| `/partnership-tracker` | Current, legacy | Index/workspace actions, K-1 form, cash activity, dialogs, status colors |
| `/estate-maps` | Both shell variants | Canvas controls, selection, category colors, dialogs |
| `/investment-tracker` | Current, legacy | Filters, table actions, drawers, chart/category colors |
| `/admin/users` | Both shell variants | Primary action, filters, row actions, status/permission indicators |
| `/admin/users/:id` | Both shell variants | Save actions, permissions, disabled/loading, informational states |
| `/forbidden` | Both shell variants | Shared shell and recovery navigation |

Redirect-only routes (`/partnerships`, `/partnerships/:id`, `/k1-tracker`, fallback) need routing regression tests but no separate color review.

## 6. Interaction checklist for every route

- The standard primary action is forest green; no equivalent action is gold or blue.
- Secondary, ghost, destructive, and inverse actions retain a consistent hierarchy.
- Keyboard focus is visible on buttons, links, fields, tabs, cards, rows, and icon controls.
- Disabled/loading controls remain readable and cannot be confused with active controls.
- Selected controls use the shared subtle/outline treatment and expose selected state programmatically or textually.
- Warning/review amber, danger red, success/positive green, info blue, charts, maps, and categories retain their meaning and a non-color cue.
- Dark surfaces use the inverse action/focus recipe rather than a competing gold CTA.
- No horizontal overflow or clipped focus ring appears at 390 CSS pixels.

## 7. Contrast spot checks

| Pair | Expected ratio |
| --- | --- |
| Primary `#14532D` / white | 9.11:1 |
| Primary hover `#0F3D22` / white | 12.27:1 |
| Primary active `#0F2A1E` / white | 15.33:1 |
| Focus `#166534` / white | 7.13:1 |
| Primary text / subtle `#F2F6F3` | 8.35:1 |
| Primary neutral text `#17263A` / white | 15.28:1 |
| Secondary neutral text `#3E5169` / white | 8.12:1 |
| Muted neutral text `#5F7185` / white | 5.02:1 |
| Danger `#B91C1C` / white | 6.47:1 |

Token tests are authoritative; manual spot checks confirm contextual surfaces, transparency, gradients, and overlays do not reduce effective contrast.

## Implementation verification status (2026-08-19)

- Token, MUI, Button, non-button recipe, semantic-cue, representative route, governance, and production-build checks pass.
- The live development stylesheet and unauthenticated route render successfully after the Vite/Tailwind dependency fix; `/dashboard` correctly redirects to the sign-in screen without a CSS error overlay.
- Final CSS is 16.32 kB gzip, 0.61 kB below baseline.
- Full-suite lint, typecheck, and Vitest were executed; remaining failures are recorded in `color-baseline.md` and do not involve migrated color assertions or governance.
- The authenticated desktop/390 px two-flag route matrix remains pending because the running API does not accept the retired repository mock credentials. Complete that final visual pass with a valid local account before closing T040.
