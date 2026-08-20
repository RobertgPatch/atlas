# Design QA

## Evidence

- Reference: user-provided Capital Activity screenshot, 1873 × 1018.
- Investment Tracker implementation: `C:\Users\robert\AppData\Local\Temp\investment-tracker-capital-activity.jpg`, captured at 1850 × 1270.
- Partnership Capital Activity implementation: `C:\Users\robert\AppData\Local\Temp\partnership-capital-activity.jpg`, captured at 1850 × 1270.
- Existing fund/new owner dialog: `C:\Users\robert\AppData\Local\Temp\add-existing-fund-owner-dialog.png`, captured at 1850 × 1270.

## Interaction checks

- Investment Tracker loads the portfolio-wide position summary.
- Asset Class, Entity, and Fund filters can each be selected and cleared.
- A partnership's Capital Activity tab remains scoped to that owner-specific partnership record.
- Add Partnership exposes New fund and Existing fund, new owner modes.
- Selecting an existing fund disables the owner field until a fund is chosen, then excludes owners already attached to that fund.
- Existing-fund mode inherits the fund identity and requests only the new owner, commitment amount, effective date, and commitment source.

## Visual comparison

| Surface | Result | Notes |
| --- | --- | --- |
| Filter hierarchy | Pass | Three equal-width filters appear above the portfolio position table, matching the reference hierarchy. |
| Position summary density | Pass | The table preserves the reference's compact financial-data layout while using the application's established typography and controls. |
| Scope distinction | Pass | Partnership activity is owner-record-specific; Investment Tracker is portfolio-wide. |
| Add-owner dialog | Pass | The two creation paths are visible before data entry, inherited details are explained inline, and the shorter existing-fund flow fits without clipping. |
| Responsive/modal containment | Pass | Header, scrollable body, and actions remain visible at the verification viewport. |

No P0, P1, or P2 visual issues remain. No raster or generated assets were required for these data-entry and reporting surfaces.

## Diagnostics

- Production Vite build passed.
- Focused ESLint passed.
- Focused interaction tests passed.
- No application-originated browser console errors were observed; remaining messages came from installed browser extensions.
