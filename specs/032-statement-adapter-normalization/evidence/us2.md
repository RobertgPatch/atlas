# User Story 2 Evidence — Adapter Extension and Drift

Date: 2026-09-28

All fixtures and results are synthetic. No production registration or
deployment occurred.

## Fourth-adapter boundary

`synthetic_fourth_positions_csv@1.0.0` is a test-only adapter with its own CSV
fixture and independent expected output: one account, two positions (`FOUR`
and `NEXT`) and $525.50 total source value. The test registry adds this adapter
without altering the production registry. The shared conformance runner proves
deterministic parsing, immutable reader evidence, exact projected output,
complete source-record disposition, non-unknown completeness, and expected
position count for Merrill, Schwab, Morgan Stanley, and the fourth family.

The production registry source is asserted not to contain the fictional
adapter ID. Its addition required no changes to normalization, reconciliation,
application, Liquidity reads, or reporting.

## Drift and versioning

- Unknown, overlapping, and custodian-mismatched detection have distinct
  outcomes; no first-match winner is selected for overlapping regions.
- Extra and reordered columns are supported through named access. Duplicate
  normalized headers and invalid pinned hints are rejected.
- Unknown CSV may enter an import-bound declarative mapping run. Ambiguous CSV
  and every unknown/ambiguous XLSX remain `NEEDS_ADAPTER`.
- Adapter versions are independently addressable; an unavailable family/version
  is rejected. Source checks prohibit database, network, report, or publication
  imports from adapter modules.
- UI guidance distinguishes reusable adapter development, import-only CSV
  mapping, and transient retry without promising arbitrary workbook support.

## Verification

```text
API adapter/detection/versioning/registry: 4 files, 13 tests passed
API focused drift outcome:                1 file, 4 tests passed
Web mapping/upload guidance:              2 files, 5 tests passed
API TypeScript build:                     passed
Web production build:                     passed
```

The exact onboarding request, sample-handling rules, version policy, commands,
and layout limits are documented in `adapter-onboarding.md`.
