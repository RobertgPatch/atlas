# V2 Reports Magic Patterns Prompts

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


## Portfolio Summary
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, FilterToolbar, DataTable, EditableCell, TotalsRow
- Support inline editing, immediate save, and undo
- Optimize for dense financial tables

Design a Portfolio Summary report.

SCREEN OBJECTIVE:
Show entity-level portfolio metrics in a high-trust financial table.

ROWS:
- Each row is an entity

COLUMNS:
- Original Commitment
- % Called
- Unfunded
- Paid-in
- Distributions
- Residual Value
- DPI
- RVPI
- TVPI
- IRR

BEHAVIOR:
- Totals row
- Inline editable cells where appropriate
- Export controls
- Sticky header
- Consistent currency and percentage formatting

STATES:
- loading
- empty
- saving edit
- undo available
```

## Asset Class Summary
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use same table pattern as Portfolio Summary
- Reuse FilterToolbar and TotalsRow

Design an Asset Class Summary report.

SCREEN OBJECTIVE:
Group portfolio metrics by asset class.

ROWS:
- Each row is an asset class

Use the same metric columns as Portfolio Summary.

BEHAVIOR:
- Inline edits where appropriate
- Export controls
- Totals row
- Sticky header
```

## Activity Detail
```text
[STYLE BLOCK]

IMPLEMENTATION CONSTRAINTS:
- Use PageHeader, FilterToolbar, DataTable, EditableCell, TotalsRow
- Dense but readable
- Support inline editing, immediate save, and undo
- Presentational-first

Design an Activity Detail report for Atlas.

SCREEN OBJECTIVE:
Display yearly financial activity per entity + partnership.

LAYOUT:
1. Header
2. Filter bar
3. Table
4. Totals row if applicable

FILTERS:
- Year
- Entity
- Partnership

TABLE COLUMNS:
- Year
- Entity
- Partnership
- Beginning Basis
- Contributions
- Interest
- Dividends
- Cap Gains
- Remaining K-1
- Total Income
- Distributions
- Other Adjustments
- Ending Tax Basis
- Ending GL Balance
- Book-To-Book Adjustment
- K-1 Capital Account
- K-1 vs Tax Difference
- Excess Distribution
- Negative Basis?
- Ending Basis
- Notes

BEHAVIOR:
- Inline editable cells
- Immediate save
- Undo last edit
- Highlight edited cells
- Sticky header
- Horizontal scroll

STATES:
- editing
- saved
- undo available
- loading
- empty
```

## Refinement Prompt
```text
Refine this design to improve:
- consistency across shared components
- spacing and hierarchy
- readability of dense financial data
- alignment with a professional internal financial platform

Ensure:
- tables are highly scannable
- typography is clean and structured
- UI feels premium and operational, not marketing-focused
```
