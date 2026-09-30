# US5 verification — explicit account selection

Verified locally on 2026-09-28. Synthetic fixtures and isolated loopback PostgreSQL databases were used; no private statement values were committed and no deployment was performed.

## Invariants verified

- Every detected account candidate is decided exactly once as selected or excluded; at least one account must be selected and one destination account cannot receive two candidates.
- Hidden holdings sheets are not auto-selected. Hidden account-like sections and visible unclaimed numeric sections create global blocking findings; notes and blank records remain explicitly disposed evidence.
- Disjoint Morgan Stanley account sections, differing account dates, hidden position rows, overview/detail overlap rejection, and stable unique account/position occurrence IDs are covered.
- Masked identities require manual binding. Reliable full identifiers can prebind, and distinct CSV account-number cells now produce distinct protected fingerprints (CSV evidence columns are resolved with their zero-based indexing contract).
- Selection/exclusion decisions and reasons are persisted in review history and included in preview hashes. Changing a reviewed decision produces `STALE_VERSION`.
- Account-specific findings for an excluded candidate do not block selected candidates; global findings still block the application.
- Preview contains only selected account deltas plus explicit excluded-account summaries.
- Apply re-locks selected accounts and validates the fresh preview. Excluded accounts receive no snapshot, pointer, valuation row, version update, or outbox publication.
- A second reviewed run over the retained original can apply a formerly excluded account while preserving the first application and first account snapshot.
- A stale account update rejects apply; a refreshed review/preview succeeds.

## Commands and results

```text
npm test --workspace apps/api -- --run tests/liquidity-statements/account-sections.test.ts tests/liquidity-statements/morgan-stanley-adapter.test.ts tests/liquidity-statements/detection.contract.test.ts
3 files, 14 tests passed

npm test --workspace apps/web -- --run src/features/reports/components/LiquidityStatementAccountSelection.test.tsx src/features/reports/components/LiquidityCsvReview.test.tsx src/features/reports/components/LiquidityStatementEvidence.test.tsx
3 files, 8 tests passed

ATLAS_TEST_DATABASE_URL=<dedicated loopback database> ATLAS_REQUIRE_LIQUIDITY_DB_TESTS=true npm test --workspace apps/api -- --run tests/liquidity-statements/account-selection.integration.test.ts tests/liquidity-statements/apply.integration.test.ts tests/liquidity-statements/review.contract.test.ts tests/liquidity-statements/auth.contract.test.ts tests/liquidity-csv-history.integration.test.ts
5 files, 12 tests passed

ATLAS_E2E_DATABASE_URL=<dedicated loopback database> npm run test:e2e:liquidity --workspace apps/web -- liquidity-statement-accounts.spec.ts
1 browser test passed

npm run build --workspace apps/api
passed

npm run build --workspace apps/web
passed (existing bundle-size advisory only)
```

The browser journey used actual API, object-store, worker, PostgreSQL and UI paths. It selected account A and excluded B, applied A, reprocessed the retained original, selected B and excluded A, rejected an altered selection and a concurrent account-version change, refreshed the review, applied B, and confirmed both prior applications and account snapshots remained present.
