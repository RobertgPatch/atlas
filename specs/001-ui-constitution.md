# Atlas UI Constitution

## 1. UI Stack
All generated UI must use:
- React
- TypeScript
- Tailwind CSS
- Headless primitives (e.g., Radix UI / Headless UI) for accessibility-critical behavior
- `framer-motion` for motion
- `lucide-react` for iconography

No screen should introduce a second UI framework. Material UI is not used in V1. (Amended 2026-04-20 per specs/001-auth-and-access clarifications; see `Clarifications` section of that spec for rationale.)

## 2. UI Architecture Rules
- Presentational components must not contain data-fetching logic by default.
- Route-level screens may compose data hooks and presentational components.
- Shared patterns must be extracted instead of duplicated once repeated twice.

## 3. Shared Patterns
All page screens must reuse the same:
- PageHeader
- FilterToolbar
- DataTable wrapper
- KpiCard
- SectionCard
- StatusBadge
- EmptyState
- ErrorState
- LoadingState / skeleton pattern
- ActionBar / row action menu pattern

## 4. Screen States
Every major screen must explicitly support:
- loading
- empty
- error
- populated
- permission-restricted state if relevant
- finalized / locked state where relevant

## 5. Tables
All financial tables must:
- support sticky headers when useful
- support consistent currency formatting
- support consistent percentage formatting
- support dense but readable rows
- preserve totals row patterns
- use one shared approach to inline editing
- use one shared approach to undo

## 6. Forms and Editing
- Inline editable cells must use shared editable-cell behavior.
- Validation messages must be subtle and readable.
- Save state and undo state must be visible.

## 7. Role Visibility
The UI must gate actions by role.
Do not create separate UI systems for admins and non-admins.
Use conditional navigation, actions, and visibility instead.

## 8. Financial Data Integrity
- Finalized values must render as locked or clearly controlled.
- User-corrected values must not be visually indistinguishable from raw parsed values when that distinction matters.
- Source traceability must be accessible in the K-1 review workflow.

## 9. Visual Consistency
- Use one spacing system
- Use one heading hierarchy
- Use one badge system
- Use one table toolbar pattern
- Use one card style

## 10. Magic Patterns Normalization Rule
Magic Patterns output is a starting point, not production truth.
Generated components must be normalized to the Atlas component catalog before merge.
