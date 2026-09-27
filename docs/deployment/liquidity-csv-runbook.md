# Liquidity CSV operations

Feature 031 makes reviewed complete-account CSV snapshots the only Liquidity ingestion path. Plaid routes, jobs, credentials, dependencies, UI, and stored history are removed by migration `050_remove_plaid.sql`.

## Client workflow

1. An Admin opens **Liquidity > Upload CSV / Manage accounts**, selects an entity, then chooses an existing custodian or uses **Add new custodian**. Saved display names are reused for case, repeated-space and punctuation variants. Create the appropriate account under that custodian. After the first approved upload, later files with the same full account number and custodian are matched automatically using a keyed fingerprint; the account number is not stored.
2. Upload the complete brokerage export. The original is immutable; upload completion checks its version, SHA-256 and length. Identical accepted bytes in the same entity return the existing draft.
3. The two recognized layouts parse automatically. Other layouts require reviewed column mappings. Separator, encoding, source date, percentage units and currency are explicit. UTF-16 requires a BOM. Windows-1252 may be selected after an encoding rejection; enter the exact header names if the initial parse could not read them.
4. Bind each previously unseen source account occurrence to its correct entity/custodian account. Missing currency defaults to USD, missing asset type defaults to unknown, missing day change and source totals are non-blocking, and known cash programs are classified as cash. Imported values and raw cells remain available. Corrections require a reason and retain protected before/after evidence.
5. Inspect the preview and apply. Only bound accounts change, atomically. Missing positions leave those accounts' current composition; unrelated accounts, including identical tickers, are untouched. An empty account requires explicit confirmation. No sale proceeds or realized returns are inferred.

Merrill basis uses **market value minus signed unrealized dollar gain/loss**. For example, 800 minus -200 is 1,000. If only gain/loss percentage is available, basis is estimated from that percentage and marked derived. A $1-per-share cash-like position uses market value as basis. `ML Bank Deposit Program` and `BLF FEDFUND` are treated as cash. Other missing/incomplete basis remains permitted, but full gain/basis totals stay unavailable and known subtotals are labeled. No FX rate, bond multiplier, or option multiplier is invented.

Accounts can expect a CSV every 14 days, each calendar month, or on demand. Cadence describes freshness; it does not schedule imports. On-demand accounts are never marked late merely because a month passed. Source holdings dates and upload dates are shown separately. Sparse observations show changes in recorded portfolio value, not daily investment returns.

Older uploads remain historical. A same-observation correction adds a revision; it does not edit the original. Where date-only and timed observations conflict, choose correction of the current snapshot or historical-only explicitly. Historical-only evidence does not supersede the approved historical composition.

## Live deployment configuration

The routine release is `npm run deploy:aws:production`, using `infra/aws/live-production-target.json` and `scripts/deployment/live-production.mjs` in **us-west-1**. Follow the existing main-commit eligibility and release process in [live-aws-production.md](./live-aws-production.md). Do not deploy a dirty checkout. The separately planned Terraform topology is not the source of live ECS variables.

The release provisions a retained CSV bucket/KMS stack, private versioned storage, TLS and conditional-create policy, browser PUT CORS for the live origin, and prefix-limited API task-role access. It injects bucket/key/region values into the API task; no CSV extraction service or queue is created. Existing K-1 regional overrides and access are retained. The K-1 worker gets all three CSV processing switches set false.

| Variable | Default / use |
|---|---|
| `REAL_TIME_EQUITIES_ENABLED` | `false`; strict `true`/`false` only |
| `LIQUIDITY_CSV_UPLOADS_ENABLED` | Enabled by the release after storage provisioning; admission kill switch |
| `LIQUIDITY_CSV_PARSING_ENABLED` | Independent parser kill switch |
| `LIQUIDITY_CSV_APPLY_ENABLED` | Independent publication kill switch |
| `LIQUIDITY_CSV_OBJECT_STORE` | `s3` in production; local disk only outside production |
| `LIQUIDITY_CSV_S3_BUCKET`, `LIQUIDITY_CSV_KMS_KEY_ARN`, `LIQUIDITY_CSV_S3_REGION` | CSV stack outputs and live region |
| `LIQUIDITY_CSV_MAX_BYTES` | 10,485,760 (10 MiB) |
| `LIQUIDITY_CSV_MAX_ROWS` | **5,000**; configurable ceiling 25,000 requires a larger, separately measured API allocation |
| `LIQUIDITY_CSV_PARSE_CONCURRENCY` | 1 per API process |
| `LIQUIDITY_CSV_PARSE_TIMEOUT_MS` | 30,000 |
| `LIQUIDITY_CSV_MAX_RETRIES` | 2 transient retries |
| `LIQUIDITY_CSV_FILES_PER_30_DAYS` | 200 across this single-tenant installation |
| `LIQUIDITY_CSV_CAPABILITIES_PER_HOUR` | 10 per user |
| `LIQUIDITY_CSV_MAX_QUEUED_JOBS` | 20 |
| `LIQUIDITY_CSV_MAX_OUTSTANDING_CAPABILITIES` | 10 |

Column/record/field/preamble bounds are 128 / 64 KiB / 16 KiB / 100 records. Upload capabilities and previews expire after 15 minutes; evidence-download URLs after 2 minutes. Reviews/previews have route-specific bounded payload allowances for warnings and corrections; ordinary API limits remain unchanged.

Current explicit ECS environment values take precedence over descriptor defaults, including intentional kill switches. Changing a local `.env` or the descriptor does not update a running process or override an existing explicit setting. Change the desired API task environment through the existing release workflow and redeploy. Verify the effective task definition without printing secret values. Any separately scheduled pricing task must run the same flag setting; the server guards every pricing entry point even if an external schedule fires.

When the price flag is false, mount/manual refresh only reload saved values; current reads and exports bypass newer quote caches and provider work. When true, eligible USD equity/fund tickers use the existing admitted quote service. Quantity and basis remain uploaded; displayed gain is recalculated against the same quoted value. Unsupported instruments, unverified aliases and quotes older than the source retain CSV values. Existing provider/cost switches must also permit pricing. Setting the flag false suppresses the live scheduler; enabling it later requires intentionally enabling the scheduler too if scheduled refresh is wanted. Existing quote evidence is retained when disabled.

## Admission, failure and recovery

- Reservation admission is serialized in PostgreSQL. Upload expiry is reconciled on admission and once per minute by the API loop, including while parsing is disabled. Cancellation/rejection/completion release outstanding capacity; accepted attempts remain in the rolling file/byte ledger.
- Repeating an interrupted upload resumes its immutable key. If bytes arrived before the client lost the completion response, their verified version is queued once. Capabilities cannot overwrite originals.
- One database-leased parser per process runs outside the request. A restarted process reclaims expired leases; generation checks prevent stale publication. Deterministic malformed input requires correction or explicit mapping, not automatic retries. Retry is available for transient failures only.
- Apply locks account revisions, recomputes the preview, and commits snapshots, pointers, audit, status and outbox together. A stale draft/account returns 409; reload and review again. Retry an uncertain successful apply using the original idempotency key.
- Reports read durable current pointers. UI cache partitions include pricing mode/source revisions; outstanding reads are cancelled after publication. Outbox delivery can retry without undoing approved snapshots.
- Disable apply first during an incident; disable upload/parse independently if needed. Keep reads and evidence available. Do not clear accounts, delete snapshots, drop the additive migrations, or restore revoked tokens.
- After any CSV publication, rollback must use a CSV-aware compatible image. A pre-031 image cannot represent approved neutral CSV snapshots. Artifact rollback does not roll back database evidence. Retain the last approved compatible image, database backup, originals and their object versions, profiles and review records together.
- Before activating a new bucket, verify versioning, SSE-KMS, CORS and conditional writes with a synthetic upload and versioned download in the deployed environment. Local mocks do not prove live IAM, KMS, browser CORS or S3 propagation.

Routine telemetry accepts only finite stage/outcome labels and bounded elapsed time. Financial values, raw rows, filenames and identifiers stay in protected evidence. In-process counters and mode/overdue gauges reset on restart; structured stage logs are available to the existing log sink. Database queue/lease state and retained storage remain the durable operational evidence. No new external metrics collector was added.

## Removed provider data

Migration `050_remove_plaid.sql` permanently deletes the former provider connection, account, refresh, holdings, and valuation-history tables and strips provider identifiers from neutral accounts and partnership assets. Take the normal production database backup before applying it. The migration is intentionally forward-only; recovery restores a pre-migration database backup, not deleted provider rows. K-1 BDA resources are unrelated and remain in place.

## Verification evidence

See [verification](../../specs/031-liquidity-redesign-statement-upload/evidence/verification.md), [performance](../../specs/031-liquidity-redesign-statement-upload/evidence/performance.md), [security](../../specs/031-liquidity-redesign-statement-upload/evidence/security.md), and [recovery](../../specs/031-liquidity-redesign-statement-upload/evidence/recovery.md). No production RPO/RTO, retention expiry, or release success is asserted by local results.
