# V2 Admin Magic Patterns Prompts

## Shared Style Block

Design a modern, high-trust financial operations UI for a private system used by family offices, CPAs, CFOs, and finance teams.

STYLE:
- Minimal, professional, institutional
- Inspired by Stripe, Mercury, Ramp internal dashboards
- White / off-white background
- Dark gray / near-black text
- Accent color: deep blue or muted green
- No playful colors

TYPOGRAPHY:
- Inter or similar sans-serif
- Precise hierarchy
- Calm spacing

LAYOUT:
- Grid-based
- Generous whitespace
- Dense enough for finance, but never cluttered

COMPONENTS:
- subtle borders
- soft shadows
- small-radius rounded corners
- clean data tables
- precise KPIs

UX:
- Built for accountants and finance operators
- Prioritize clarity, trust, and scanability
- No marketing-page feel

CONSISTENCY REQUIREMENTS:
- Reuse the same header layout across all pages
- Reuse the same table structure across all list/report screens
- Reuse summary KPI cards across dashboards and detail pages
- Reuse filter toolbar pattern across all data-heavy screens

OUTPUT:
- High fidelity
- Ready for React + Material UI implementation


## User Management
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, DataTable, StatusBadge, RolePill, RowActionMenu
- Same app visual system as all other screens
- Presentational-first
- Admin-only actions visible only to admins

Design an Admin User Management screen for Atlas.

SCREEN OBJECTIVE:
Allow admins to manage users and roles.

LAYOUT:
1. Header
2. Actions
3. Table

HEADER:
- Title: Users
- Action: Invite User

TABLE:
Columns:
- Email
- Role
- Status
- MFA Enabled
- Last Active
- Actions

ACTIONS:
- Assign role
- Deactivate user
- Reactivate user

STATES:
- no users
- loading
- error
```

## User Detail / Role Assignment
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, SectionCard, RolePill, ActionBar
- Presentational-first

Design a User Detail screen for Atlas admin.

SCREEN OBJECTIVE:
Allow an admin to inspect one user and modify their access.

INCLUDE:
- Email
- Active/inactive status
- Role assignment controls
- MFA status
- Recent audit actions

STATES:
- editable
- loading
- deactivated user
```
