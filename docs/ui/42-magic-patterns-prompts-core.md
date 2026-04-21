# V2 Core Magic Patterns Prompts

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


## App Shell
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Generate React + TypeScript components
- Use Material UI
- Reuse Atlas patterns: AppShell, PageHeader, StatusBadge
- Presentational-first
- Role-aware navigation visibility

Design the authenticated application shell for Atlas.

SCREEN OBJECTIVE:
Provide a consistent navigation and layout system used across all screens.

LAYOUT:
- Left sidebar navigation (fixed)
- Top header bar
- Main content area

SIDEBAR:
- Main Dashboard
- K-1 Processing
- Upload Center
- Entities
- Partnerships
- Reports
- Issues

ADMIN SECTION (only visible for admins):
- Users
- Roles

HEADER:
- Global search input
- Notifications icon
- Current user profile dropdown

BEHAVIOR:
- Sidebar highlights active route
- Sidebar collapsible
- Header remains fixed

STATES:
- normal
- narrow/collapsed sidebar
- admin vs non-admin navigation

TONE:
- Clean, minimal, enterprise-grade internal tool
```

## K-1 Processing Dashboard
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, KpiCard, DataTable, StatusBadge, FilterToolbar
- Presentational-first
- Support loading, empty, error, populated states

Design a K-1 Processing Dashboard.

SCREEN OBJECTIVE:
Allow CPAs and reviewers to monitor document processing pipeline.

INFORMATION HIERARCHY:
1. Header
2. KPI summary row
3. Queue table

HEADER:
- Title: K-1 Processing
- Subtitle: Monitor ingestion, review, and finalization workflow

KPIs:
- Uploaded
- Processing
- Needs Review
- Ready for Approval
- Finalized

QUEUE TABLE:
Columns:
- Document Name
- Partnership
- Entity
- Tax Year
- Status
- Issues Count
- Uploaded Date
- Actions

TABLE BEHAVIOR:
- Sortable columns
- Status badges
- Row click opens review workspace
- Sticky header
- Dense but readable rows

ROLE:
- CPA + Reviewer focused
```

## K-1 Review Workspace
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use SplitReviewLayout, ParsedFieldRow, ActionBar, StatusBadge
- Presentational-first
- Support loading, field validation, locked/finalized state

Design a K-1 Review Workspace.

SCREEN OBJECTIVE:
Allow users to validate parsed data and finalize K-1 documents.

LAYOUT:
- Two-column split view

LEFT PANEL:
- Entity Mapping
- Partnership Mapping
- Core Fields:
  - Tax Year
  - Partnership Name
  - Reported Distribution (Box 19A)

RIGHT PANEL:
- Scrollable PDF preview
- Highlight extracted fields

INTERACTIONS:
- Inline editing
- Confidence indicator per field
- Highlight field origin in PDF

ACTIONS:
- Save corrections
- Approve parsed values
- Finalize (disabled until valid)
- Send to issue queue

STATES:
- field errors
- missing required fields
- finalized lock state
- permission-restricted actions

CRITICAL:
- Must feel precise and audit-friendly
```

## Partnership Directory
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, FilterToolbar, SummaryStrip, DataTable, StatusBadge
- Support table-first layout with optional card view later
- Role-aware action visibility

Design a Partnership Directory.

SCREEN OBJECTIVE:
Allow users to browse, filter, and compare all partnerships.

LAYOUT:
1. Header
2. Filter toolbar
3. KPI summary strip
4. Table view

HEADER:
- Title: Partnerships
- Action: Add Partnership
- Action: Export

FILTERS:
- Search by name
- Entity filter
- Asset class filter
- Status filter

KPIs:
- Total partnerships
- Total distributions
- Total FMV

TABLE:
Columns:
- Partnership Name
- Entity
- Asset Class
- Latest K-1 Year
- Distribution
- FMV
- Status

BEHAVIOR:
- Row click opens detail page
- Consistent currency formatting
- Sticky header

STATES:
- Empty
- Loading
- Error
- Permission-limited actions
```

## Partnership Detail
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, KpiCard, DetailSection, DataTable, TimelineList
- Presentational-first
- Reuse shared summary card pattern

Design a Partnership Detail page for Atlas.

SCREEN OBJECTIVE:
Show the full client-facing view of a single partnership.

LAYOUT:
1. Page header
2. Summary KPI strip
3. Detail sections

SUMMARY KPIS:
- Latest FMV
- Latest Reported Distribution
- Latest K-1 Year
- Asset Class

DETAIL SECTIONS:
- K-1 history table
- Expected distribution history
- FMV snapshots
- Notes
- Activity detail preview

STATES:
- loading
- empty history sections
- no FMV yet
```

## Entity Detail
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, SummaryStrip, DataTable, DetailSection
- Reuse patterns from Partnership Detail

Design an Entity Detail page for Atlas.

SCREEN OBJECTIVE:
Show a client-owned entity and the partnerships underneath it.

INCLUDE:
- entity header
- summary cards
- partnerships under entity
- expected distributions summary
- reports preview

TABLES:
- partnership list with latest K-1 and FMV

STATES:
- no partnerships
- loading
- error
```
