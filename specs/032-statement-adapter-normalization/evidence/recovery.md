# Recovery evidence

The guarded loopback-database recovery suite passed two tests in 1.93 seconds (1.12 seconds of test execution). It used only synthetic data.

The suite verified:

- byte-identical recovery of retained CSV and XLSX originals from a copied object-store checkpoint;
- unchanged canonical hash and typed record locations;
- preserved account bindings/selections, review revision, approval/application history, and snapshot IDs;
- unchanged current-account snapshot pointer and authorized source reads;
- database triggers reject mutation of successful canonical evidence and immutable source identity;
- retained XLSX originals remain readable independently of new-XLSX admission.

Command:

```powershell
$env:ATLAS_TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:15432/atlas_statement_test'
$env:ATLAS_REQUIRE_LIQUIDITY_DB_TESTS='true'
npm test --workspace apps/api -- --run tests/liquidity-statements/recovery.integration.test.ts
```

This is an isolated local integrity exercise, not a production restore. Production RPO/RTO, PostgreSQL PITR, final-snapshot recovery, S3 object-version restoration, KMS authorization, retention/legal requirements, and an encrypted isolated-network restore remain release obligations. No destructive down migration or production operation was performed.
