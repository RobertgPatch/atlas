# User Story 3 Evidence — Review, Coverage, and Reconciliation

Date: 2026-09-28

All scenarios use synthetic statement contents and local-only services.

## Behavior verified

- Review findings remain visible in a severity-sorted table with account/field
  context, source location, reported value, effective observed value,
  difference, and a keyboard-accessible source action.
- CSV evidence uses physical line spans; XLSX evidence uses sheet/A1 locations.
  Evidence pages load on demand, preserve source numeric text, mask/hide unknown
  metadata and notes, and never calculate account totals from loaded pages.
- Original control comparisons use immutable source values. Reasoned reviewed
  overlays produce a distinct effective comparison; an original mismatch can
  remain recorded while its effective comparison becomes matched.
- Missing optional fields stay unavailable unless a named normalization rule
  applies. Preview separates known, unknown, and estimated/cash-at-par coverage,
  and exposes both original and reviewed control states.
- Control tolerances and schema-3 control values are not editable review paths.
  Corrections require a reason, rerun normalization/reconciliation, invalidate
  incompatible acknowledgments through issue identity, and may save while
  genuine blockers remain visible.

## Actual-browser review scenario

```powershell
$env:ATLAS_E2E_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:15432/atlas_statement_e2e_review'
npx playwright test e2e/liquidity-statement-review.spec.ts
```

Result: 1 passed, 0 failed, 0 skipped (12.5 seconds; test body 4.4 seconds).

The scenario uploads a real synthetic Schwab CSV with value-only cash, partial
basis/gain controls, and a genuine -$265.44 source gain. It verifies USD/unknown
display, saves reasoned basis/gain/ratio corrections, acknowledges only the
remaining warnings, obtains a fresh applicable preview, and confirms the
preview still shows the immutable source mismatches beside matched reviewed
controls and identifies the cash-at-par estimate.

## Supporting gates

```text
Schema-3/legacy reconciliation and Morgan control tests: 16 passed
Real-DB review/reprocess/evidence paging tests:          6 passed
Review and evidence component tests:                    5 passed
API build:                                               passed
Web build:                                               passed
```

No production data was applied and no deployment occurred.
