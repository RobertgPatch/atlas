# US4 verification — compatibility, reprocess and correction history

Verified locally on 2026-09-28 with synthetic fixtures and dedicated loopback PostgreSQL databases. No deployment or production mutation was performed.

## Invariants verified

- Stored schema-2 drafts remain readable with their original adapter IDs, exact decimal strings and authoritative canonical hashes. Compatibility projection adds unknown conventions without recomputing money or rewriting stored evidence.
- Detail responses distinguish the active run from prior applied applications, expose the stored operation hash/source schema, and advertise compatible tested adapter versions without automatically reprocessing.
- Protected originals remain downloadable independently of parser ingestion flags. An already-approved XLSX was read while new XLSX ingestion remained default-disabled.
- Reprocess creates a new pinned run and clears only the active review pointer. Earlier runs, reviews, applications, snapshots and hashes remain immutable.
- Prior field edits are historical and are not copied into the new draft. The UI makes that behavior explicit.
- Abandoning a correction restores the latest applied run/review and retains accepted-source uniqueness. Uploading identical bytes reopens the retained source rather than creating another import.
- Idempotent replay returns the exact prior result. Reusing an idempotency key with an altered payload is rejected.
- Financial publication identity ignores row order but preserves repeated-position multiplicity. Metadata-only reprocessing returns the existing snapshot rather than publishing a duplicate.
- A genuine reviewed correction still requires a fresh preview and account authorization.

## Commands and results

```text
ATLAS_TEST_DATABASE_URL=<dedicated loopback database> ATLAS_REQUIRE_LIQUIDITY_DB_TESTS=true npm test --workspace apps/api -- --run tests/liquidity-statements/repository-compatibility.test.ts tests/liquidity-statements/draft-compat.test.ts tests/liquidity-statements/reprocess.integration.test.ts tests/liquidity-statements/apply.integration.test.ts tests/liquidity-statements/migration.integration.test.ts
5 files, 29 tests passed

npm test --workspace apps/web -- --run src/features/reports/components/LiquidityCsvJourney.test.tsx
1 file, 5 tests passed

ATLAS_E2E_DATABASE_URL=<dedicated loopback database> npm run test:e2e:liquidity --workspace apps/web -- liquidity-statement-history.spec.ts
1 actual-browser test passed

npm run build --workspace apps/api
passed

npm run build --workspace apps/web
passed (existing bundle-size advisory only)
```

The browser journey used the real UI, API, worker, object store and database. It applied a snapshot, displayed preserved approval provenance, created and abandoned a correction, reopened identical source bytes, then reprocessed/applied metadata-only changes and confirmed the two approvals referenced the same financial snapshot and unchanged portfolio total.
