# Magic Patterns Generation Contract

Prepend these constraints to every Magic Patterns prompt:

## Implementation Constraints
- Generate React + TypeScript components
- Use Tailwind CSS utilities + headless primitives (Radix/Headless UI) for accessibility-critical behavior
- Use `framer-motion` for motion and `lucide-react` for iconography
- Prefer reusable composition over one-off layout code
- Reuse the same page header, toolbar, KPI card, and table patterns used across the app
- Keep business logic out of the UI; this component should be presentational-first
- Use typed props for dynamic data
- Avoid hardcoded mock text that conflicts with production usage
- Design for loading, empty, error, populated, and permission-restricted states
- Respect role-based visibility for actions
- Optimize for dense financial data readability

## Output Expectations
- Use reusable subcomponents where natural
- Separate screen shell from low-level presentational elements
- Favor explicit props over hidden internal assumptions
- Use consistent naming that maps to the Atlas component catalog
