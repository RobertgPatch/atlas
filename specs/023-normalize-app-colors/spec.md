# Feature Specification: Normalize Application Color System

**Feature Branch**: `023-normalize-app-colors`  
**Created**: 2026-08-19  
**Status**: Draft  
**Input**: User description: "Normalize the coloring scheme across the entire application. I still see some gold buttons and some green buttons. Normalize the entire app."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognize one consistent action hierarchy (Priority: P1)

As a user moving between Jackson modules, I want equivalent actions to use the same color treatment so that I can immediately distinguish primary, secondary, destructive, and disabled actions without relearning each screen.

**Why this priority**: Conflicting gold, green, blue, and locally defined button treatments make the application feel inconsistent and weaken the meaning of color.

**Independent Test**: Visit every routed application surface and both supported design variants, identify the primary action on each screen or dialog, and verify that every primary action uses the same semantic primary palette and interaction states.

**Acceptance Scenarios**:

1. **Given** two screens expose equivalent primary actions, **When** they render, **Then** their default, hover, active, focus, and disabled treatments come from the same primary-action tokens.
2. **Given** a screen contains primary and secondary actions, **When** it renders, **Then** the visual hierarchy is consistent with other screens and does not use gold, blue, or ad hoc green merely because the component belongs to a different feature.
3. **Given** an action is destructive, **When** it renders, **Then** it retains a distinct destructive treatment and is not recolored as a standard primary action.
4. **Given** an action communicates a semantic status such as success, warning, error, processing, or review, **When** it renders, **Then** the status color remains meaningful and is not mistaken for the interactive primary palette.

---

### User Story 2 - See a coherent Jackson visual system everywhere (Priority: P1)

As a user navigating the legacy and current application surfaces, I want selection, focus, links, progress, navigation, and branded accents to follow one documented palette so the entire product feels like one application.

**Why this priority**: Normalizing buttons alone would leave conflicting gold, green, and blue interaction cues in fields, navigation, tabs, selected cards, and loading states.

**Independent Test**: Traverse authentication, dashboard, K-1, review, entity, liquidity, partnership, estate-map, investment-tracker, TIC registry, reports, and administration routes; verify interactive emphasis uses the documented semantic tokens while informational data colors retain their meaning.

**Acceptance Scenarios**:

1. **Given** a keyboard user tabs through controls on any route, **When** focus becomes visible, **Then** the focus indicator uses one accessible focus treatment and is not split between gold, blue, and green.
2. **Given** a navigation item, tab, card, checkbox, radio, or selectable row is active, **When** its state changes, **Then** its selected treatment uses the shared interaction tokens and remains distinguishable without color alone where required.
3. **Given** the application is rendered with either supported design variant, **When** equivalent UI roles appear, **Then** they use the same semantic color roles even if spacing or typography differs.
4. **Given** a chart, category marker, financial gain/loss, or workflow status needs multiple colors, **When** it renders, **Then** those colors remain governed by an explicit data/semantic palette and are not flattened into the primary brand color.

---

### User Story 3 - Prevent color drift in future changes (Priority: P2)

As a maintainer, I want colors to be expressed through semantic design tokens and reusable primitives so new components do not reintroduce arbitrary gold, green, blue, or hexadecimal action colors.

**Why this priority**: The current inconsistency is distributed across global CSS, Tailwind classes, local button variants, raw hexadecimal values, MUI defaults, and tests. A one-time search-and-replace would regress quickly.

**Independent Test**: Add a representative primary action using the documented shared primitive and run the color-governance checks; verify the action receives the complete interaction palette without feature-local color declarations.

**Acceptance Scenarios**:

1. **Given** a maintainer needs a standard button, **When** they use the shared button API, **Then** primary, secondary, ghost, and destructive variants have complete accessible interaction states without local palette classes.
2. **Given** source code introduces a disallowed legacy interactive token or raw primary-action color, **When** automated checks run, **Then** the check fails with the file and offending token while allowing documented semantic and data-visualization exceptions.
3. **Given** tests reference former implementation colors, **When** the migration completes, **Then** assertions verify semantic roles or shared primitives instead of perpetuating obsolete gold/green class names.

### Edge Cases

- A green value represents success, a positive financial result, a settled transaction, or a data-series category rather than a primary action.
- Gold or amber represents warning, review-required state, incomplete cost-basis data, or an intentional chart series rather than general interaction emphasis.
- A third-party component such as MUI applies its own default blue palette unless the application theme is supplied explicitly.
- A control is rendered inside a dark hero, sidebar, PDF-like K-1 surface, chart, map, or overlay and needs an inverse treatment while preserving the same semantic role.
- A component combines native Tailwind utilities, a global CSS class, inline styles, SVG fills, or a local variant map.
- Legacy and current design variants remain available behind the existing feature flag during the migration.
- Disabled, loading, read-only, selected, and destructive states must remain visually and programmatically distinguishable.
- Brand marks and decorative accents may intentionally use a non-interactive accent color, but must not make equivalent actions appear to have different hierarchy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The web application MUST define one canonical semantic color system for primary interaction, primary hover, primary active, focus, subtle selected surfaces, borders, neutral surfaces/text, destructive actions, and semantic statuses.
- **FR-002**: The canonical primary interaction palette MUST use Jackson's current forest-green direction, replacing gold, blue, and ad hoc green treatments for equivalent primary actions.
- **FR-003**: Gold MUST NOT be used as the fill, border, text, focus, or selection color for standard interactive controls after migration; any remaining gold/amber use MUST be a documented warning, review, data-visualization, or decorative-brand exception.
- **FR-004**: Primary, secondary, ghost, destructive, and inverse action variants MUST have consistent default, hover, active, focus-visible, loading, and disabled states.
- **FR-005**: Text inputs, selects, textareas, checkboxes, radios, file-drop areas, tabs, navigation items, pagination, selected cards/rows, and links MUST consume semantic interaction tokens instead of feature-local primary colors.
- **FR-006**: The application MUST provide reusable shared UI primitives or shared class recipes for standard interactive roles, and feature-local button implementations MUST be migrated or delegated to those shared definitions.
- **FR-007**: Existing `jackson-gold`, `jackson-hover`, raw forest-green hexadecimal values, and blue focus/primary utilities MUST be removed from general interactive use or retained only through an explicitly documented compatibility/exception path.
- **FR-008**: Semantic success, warning, danger, informational, workflow-status, financial gain/loss, chart-series, map/category, and provenance colors MUST remain distinct from the primary interaction palette and retain their existing meaning.
- **FR-009**: Both supported feature-flag variants and every reachable route in `apps/web/src/App.tsx` MUST follow the same semantic color roles.
- **FR-010**: MUI-rendered surfaces MUST use an application theme whose primary, focus, disabled, and error colors align with the canonical semantic system.
- **FR-011**: Brand marks, tax-form presentation, and dark/inverse surfaces MAY use documented decorative or inverse colors, but equivalent actions on those surfaces MUST preserve the shared hierarchy.
- **FR-012**: Color MUST NOT be the sole means of communicating validation, status, selection, financial direction, or workflow state.
- **FR-013**: Text, icons, controls, and focus indicators MUST meet WCAG 2.2 AA contrast expectations in every supported state, including disabled and inverse surfaces where applicable.
- **FR-014**: Automated tests MUST cover the shared variants and representative primary/secondary/destructive/focus/disabled states across authentication, shell/navigation, forms/dialogs, and at least one surface from each major module.
- **FR-015**: The repository MUST include an automated color-governance check that detects prohibited legacy interactive tokens and raw primary-action colors while allowing a small, named exception list for semantic and visualization use.
- **FR-016**: Existing behavior, permissions, routing, calculations, persistence, status semantics, and responsive layouts MUST remain unchanged by the color-system migration.

### Key Entities

- **Semantic Color Token**: A named visual role such as primary, primary-hover, focus, selected-surface, border, text, danger, success, warning, or info, mapped to one canonical color value.
- **Interactive Variant**: A reusable primary, secondary, ghost, destructive, or inverse control recipe with all interaction and disabled states.
- **Color Usage Classification**: The documented assignment of a color occurrence to interaction, semantic status, financial/data visualization, or decorative branding.
- **Color Exception**: A narrowly scoped, named allowance for a raw or non-primary color that cannot be represented by a standard token, with its semantic purpose and source location.
- **Route Coverage Inventory**: The set of reachable application routes and feature-flag variants that must be visually checked after migration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of standard primary actions across all reachable routes and both supported design variants use the same semantic primary variant and no longer render as a mixture of gold, blue, and green.
- **SC-002**: Repository scanning finds zero undocumented uses of legacy gold interactive tokens, raw forest-green primary-action values, or blue primary/focus utilities in application UI source.
- **SC-003**: Every shared interactive variant passes automated assertions for default, hover/active recipe, focus-visible, loading/disabled, and destructive-state separation.
- **SC-004**: Manual route-matrix review confirms every reachable route has a consistent action hierarchy and no accidental recoloring of success, warning, error, workflow, chart, map, or financial-direction semantics.
- **SC-005**: Automated contrast verification and manual keyboard inspection find no WCAG 2.2 AA contrast failure in primary, secondary, destructive, selected, focus, disabled, or inverse control states.
- **SC-006**: The complete web test suite, typecheck, lint, and production build pass without changes to application behavior.
- **SC-007**: A newly added standard action can be styled exclusively through the shared semantic primitive or recipe, without embedding a palette color in the feature component.

## Assumptions

- The forest-green treatment already used by the current Magic Patterns surfaces is the desired Jackson primary direction; exact values will be consolidated into tokens during planning.
- Gold may remain in narrowly defined decorative, warning/review, or data-visualization roles, but not as a competing standard action color.
- Red remains reserved for destructive/error semantics, amber for warning/review semantics, and multicolor palettes remain available for data visualization and category differentiation.
- This feature is a presentation-system refactor and does not require API, database, or shared domain-contract changes.
- Legacy and current UI variants remain in scope as long as the feature flag can render them.
