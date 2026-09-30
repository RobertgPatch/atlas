# T007 migration tests: initial red evidence

Recorded 2026-09-28. The test-writing task is complete; this is not a migration acceptance result. T011 was absent during this run.

`apps/api/tests/liquidity-statements/migration.integration.test.ts` creates two disposable databases on the validated loopback test PostgreSQL server. It runs the real migrations through 050 in each, leaves one empty, and independently seeds synthetic legacy evidence in the other. Separate databases prevent unqualified `pg_constraint` lookups in old migrations from accidentally reusing another schema's constraint names. Cleanup drops only the exact generated databases created by this test; the configured parent database remains intact.

The legacy case includes exact eight-place money, immutable schema-2 drafts and hashes, approved positions/valuations/current pointers, an applied source whose workflow is cancelled, an old review belonging to a different active run, and a preview that must not count as prior publication. No original statement is used.

## Commands and observed results

- `npm exec --workspace=api -- tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck tests/liquidity-statements/migration.integration.test.ts`: passed.
- With `ATLAS_REQUIRE_LIQUIDITY_DB_TESTS=true` and the documented local test database configured, `npm run --workspace=api test -- tests/liquidity-statements/migration.integration.test.ts --reporter=verbose`: **1 passed, 13 failed, 0 skipped**. The actual 000-050 baseline/seed assertion passed. Every remaining failure was the expected missing `051_statement_adapter_normalization.sql` prerequisite (`ENOENT`), not a claimed passing implementation assertion.
- Both generated databases were removed by the test cleanup after the run. No production database or real holdings were touched.

## Assertions that T011 must make pass

1. A concrete 051 migration exists and runs on an empty migrated 031 database; omitted-kind uploads remain CSV, XLSX and NEEDS_ADAPTER are admitted, and unsupported file kinds fail.
2. New source-record roles and typed XLSX locations work without fabricated CSV lines; missing/contradictory location data and invalid coordinates fail, while old CSV inserts remain valid.
3. Completed recipe/hash evidence is immutable and record foreign keys remain enforced.
4. Active review pointers belong to the same import and active run; new runs clear the pointer without losing the import revision counter, and review revision uniqueness survives.
5. Exclusions persist independently of selected bindings; saved reviews remain immutable.
6. STATEMENT accounts/snapshots are admitted, old CSV labels remain unchanged, and Plaid tables do not reappear.
7. Validated original file kind and content type cannot be relabeled after storage identity is established.
8. Upgrade preserves every existing column value, original key, canonical/application payload and hash, exact amounts, identifiers, reviews, and history pointers. Re-running the migration runner is a no-op.
9. Active-review backfill uses the matching current run/revision only. Retained-source backfill considers completed applications even for cancelled workflow state, but does not promote mere previews.
10. Retained identity cannot revert to false or release accepted-hash uniqueness after cancellation. Never-applied cancelled sources and independent entities retain their permitted behavior.
11. Existing approved-evidence mutation guards still reject changes.
12. Two real transaction writers cannot bypass accepted-hash uniqueness, including a retained cancelled row.

Later lifecycle/compatibility tasks extend these tests. This initial suite does not claim T011 implementation, production migration, recovery acceptance, or end-to-end browser acceptance.

## First T011 implementation run

The same real-DB command was rerun after the parent implementation added 051: **9 passed, 5 failed, 0 skipped**. Four upgrade cases could not proceed because the migration itself raised `LIQUIDITY_IMMUTABLE_EVIDENCE` against seeded legacy evidence. This is an implementation blocker reported to T011's owner. The remaining failure was an overly specific test expectation: missing XLSX location was correctly rejected by a NOT NULL constraint (`23502`) rather than a CHECK (`23514`). The test now accepts either integrity constraint rejection for that case; invalid non-null locations still require the CHECK rejection. The initial missing-file red evidence remains recorded above, and T011 completion awaits a subsequent passing run.
