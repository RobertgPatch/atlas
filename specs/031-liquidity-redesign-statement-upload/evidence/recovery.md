# Recovery evidence

2026-09-21, dedicated local databases only.

- New service instances resume queued originals and recover identical bytes. A local original-store copy is read through a fresh store/service instance with the recorded checksum and version.
- Expired parse leases advance the generation; the stale generation cannot publish. Cancellation prevents persistence. Successful parse/original identity mutations are rejected by migration 049 guards.
- Injected audit failure rolls back all application state; stale account previews cannot apply. Identical apply retries return the original application result.
- Migrations are additive and restartable. Legacy backfill preserves stable account UUIDs, original amounts/source dates, source parent/row lineage and existing valuation references. Synthetic legacy and neutral readers continue to work together.
- An actual PostgreSQL custom-format dump of `atlas_csv_031_test` was restored into the newly created isolated `atlas_csv_031_restore_20260921`. Row counts and order-independent row-content hashes match across **11 CSV/source tables and 799,724 rows**, including originals metadata, profiles, parse results, review revisions, snapshots/positions, valuations and applications. See `restore-verification.json`. No primary database was restored or modified.

The local dump and restored database are development artifacts; they contain synthetic data. The exercise does not establish AWS backup coverage, S3/KMS restore access, RPO/RTO, or a live container rollback. Retained object versions and keys must be restored alongside database references. Live original downloads, backup restore and the selected rollback image must be verified through the release runbook.

After any CSV publication, a compatible CSV-aware image is required. Rolling back to a pre-031 image would hide neutral CSV holdings, so the runbook prohibits that path. Operational kill switches pause upload/parse/apply without discarding approved current pointers or reactivating revoked Plaid credentials. No schema downgrade or live token restoration was attempted.
