# K-1 Document Retention and Recovery

K-1 originals, extraction results, reviewed values, and application decisions are accounting evidence. Production uses a dedicated private S3 bucket with Block Public Access, TLS-only access, versioning, SSE-KMS, bucket keys, and annual KMS rotation. The default current-object retention is 2,555 days (seven years); noncurrent versions are retained for 365 days. Incomplete multipart uploads expire after seven days. Environment owners must approve any change to these values against the tax-record policy.

## Deletion rules

- `force_destroy` remains `false` outside disposable environments.
- A pending quarantine object may be removed after the corresponding item is cancelled.
- Once a durable document exists, cancellation retains its PDF and evidence for recovery and audit.
- An applied document cannot be cancelled. Migration `031_k1_applied_document_retention.sql` also blocks direct deletion while `applied_at` or `applied_tracker_year_id` is set.
- Removing an applied link is a break-glass accounting operation: obtain tax/legal approval, export the audit and provenance chain, record a change ticket, perform a reviewed forward migration, and never edit historical migrations.

## Database backup and restore

RDS storage is encrypted and production enables deletion protection, automated backups, and a final snapshot. Backup retention is configured independently per environment. Restore into a new isolated RDS instance, run the same application migration version, compare counts for batches, items, attempts, fields, issues, applications, official revisions, calculation revisions, and audit events, then repoint services only after a read-only validation.

The database and S3 bucket are restored as one evidence set. After restore, reconcile every nonterminal attempt by provider job ID and object version; never create a replacement attempt merely because a completion event was lost.

## Incident recovery

1. Disable `K1_AWS_INGESTION_ENABLED` and stop the worker while preserving queues.
2. Snapshot RDS and retain affected S3 object versions, CloudTrail records, worker/API logs, and DLQ messages.
3. Classify exposure without copying raw taxpayer values into tickets or chat.
4. Restore into an isolated environment and validate SHA-256, object version, attempt lineage, active field occurrences, application decisions, and tracker revisions.
5. Resume with the original idempotency tokens. Redrive DLQs in small cohorts and monitor duplicate/no-op outcomes.
6. Document recovery time, affected opaque IDs, and control improvements. Rotate credentials or the KMS key when the incident classification requires it.

Quarterly recovery exercises must prove an RDS point-in-time restore, a versioned S3 object restore, queue redrive, and applied-value provenance traversal without exposing TINs, EINs, names, addresses, or field values in logs.
