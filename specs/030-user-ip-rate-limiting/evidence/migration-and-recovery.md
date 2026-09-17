# Feature 030 migration and recovery evidence

**Executed**: 2026-08-29  
**Environment**: Disposable databases inside the existing local `atlas-postgres` PostgreSQL 16 container  
**Production data/AWS used**: None

## Expand and compatibility

1. A fresh disposable database was migrated through the pre-feature migration set (`000` through both `039` files), with each migration executed transactionally.
2. A synthetic legacy `auth_attempts` row was inserted with the old identifier/source columns.
3. `040_auth_rate_limit_hardening.sql` and `041_workload_document_scope.sql` were applied.
4. Verification returned true for:
   - legacy identifier/source copied into compatibility columns;
   - an old-style auth-attempt insert remaining valid;
   - a fingerprint-only auth-attempt insert becoming valid;
   - a `source_prefix` rate counter insert;
   - a `document` quota counter insert;
   - rejection of a 31-byte subject fingerprint by the new consistency constraint.

## Cutover, redaction, and counter continuity

The fingerprint row's raw/legacy columns were nulled and a boolean query confirmed no raw identifier remained on fingerprinted rows. The migration itself is expand-only: it does not drop the original columns or table, so an immediately previous application artifact can still read/write legacy-format rows during a controlled rollback.

After recording the manually applied migrations in `schema_migrations`, the database-backed suites were run with one worker:

- `hmac-rotation.integration.test.ts`
- `auth-admission.integration.test.ts`
- `k1.batch-upload.integration.test.ts`
- `auth-protection-fingerprint.migration.integration.test.ts`

Final result: 4 files / 20 tests passed. The run proved active/retained HMAC usage consolidation, durable auth behavior, K-1 admission/capability behavior, and migration contract behavior with PostgreSQL enabled.

The first database-enabled run exposed that durable global counters were not reset between tests that normally skip without PostgreSQL. Explicit test-only truncation of the five abuse-protection tables was added before affected suites, and the concurrency test now waits up to a bounded five seconds for real database admission before releasing mocked hashes. The in-memory/full default suite remains green.

## Rollback checkpoint exercise

A second disposable database was migrated through `039`, populated with one synthetic legacy auth row, and captured with `pg_dump -Fc` immediately before feature migration. After applying `040`/`041` to the source, the checkpoint was restored into a separate empty database with `pg_restore`.

- Restore elapsed time: 1.02 seconds.
- Fixture RPO: 0 seconds (checkpoint immediately preceded cutover), compatible with the production maximum 15-minute RPO when the required pre-migration snapshot/checkpoint is current.
- Required production RTO: 8 hours; the bounded local restore completed well inside it. This is compatibility evidence, not a substitute for the required production-scale isolated restore exercise.
- The restored row count was exactly one and the feature `subject_hash` column was absent, proving the artifact represented the pre-040 schema/data.

## Constraints

- There is no destructive down migration. Application rollback uses the prior immutable artifact only while compatibility columns remain; database rollback uses the reviewed pre-migration snapshot/dump.
- Once fingerprint-only writes begin, rolling the binary back without restoring/forward-fixing can hide those rows from old identifier-based logic. Stop new auth/paid writes before selecting a database checkpoint.
- HMAC keys cannot be retired until the retained-alias window and consolidation evidence are complete.
- Production snapshot creation, restore, and Apply remain blocked by feature 029/constitutional activation gates.

All three disposable databases and the temporary dump were explicitly removed after verification; they are not recoverable and contained synthetic data only.
