# CSV Operations and Cost Contract

## Limits

Implemented defaults, tuned using the local measurements in [performance evidence](../evidence/performance.md):
- 10 MiB/file; 5,000 data records/file by default (configurable ceiling 25,000 after capacity verification); 128 columns; 64 KiB/record; 16 KiB/field.
- At most 100 metadata records before a recognized header.
- One active parse per API instance, 30-second bounded work timeout, lease heartbeats and at most two retries for transient failure.
- 200 files/tenant/rolling 30 days and 10 upload capabilities/user/hour; configurable upward after measurement. Maximum queued jobs and maximum outstanding capabilities must be explicit bounded config (initially 20 and 10 respectively).
- Unknown/malformed layouts do not automatically retry or invoke AI.
- `REAL_TIME_EQUITIES_ENABLED=false` is the valuation mode default. Flag-off emits skipped quote-refresh counts and makes zero Liquidity provider calls; flag-on pricing uses existing price-service quotas. Upload, parse and apply have separate kill switches. Exports retain existing bounds and scoped authorization.

Reserve durable byte/file/queue quota before issuing capabilities. Server verifies object/version/hash/size and reconciles reservations on failed/expired capabilities; replays never reset usage or multiply accepted work. Stream parse with byte/record counters, bounded buffers and no raw body logging.

## Metrics

Finite dimensions: stage (upload/validate/parse/map/review/apply/cutover), outcome, finite reason, adapter family/version, source kind and environment. No filenames, account numbers, symbols, monetary values, arbitrary headers or user-provided error text in metric labels.

| Signal | Purpose |
|---|---|
| Upload/rejection counts and bytes | Capacity, abuse, type/encoding drift |
| Parse duration/rows/resource-limit failures | Validate p95 target and safe bounds |
| Queue/lease age and retries | Restart/stall diagnosis |
| Unsupported-header/malformed-record counts | Profile changes |
| Reconciliation blocks, missing/estimated basis counts | Data-quality trend without values |
| Review age/apply outcomes/stale conflicts | Workflow reliability |
| Accounts overdue per configured cadence | Freshness; on-demand accounts show age only |
| Effective pricing mode, skipped refreshes, CSV versus quote-priced counts | Flag behavior and pricing coverage |
| S3 versions/storage growth and DB evidence size | Retention/cost growth |
| Plaid or AI invocation attempts from CSV path | Expected zero; any attempt is a regression |
| Authorization/KMS/S3/DB failures | Access/configuration drift |

Detailed row/field diagnostics live only in scoped review evidence. Logs may include opaque correlation IDs where necessary but not private tokens/rows. Audit events preserve actor/import/application identifiers and safe change metadata; protected review revisions retain financial before/after values.

## Cost

No BDA/Textract/model request charges for the CSV workflow. API CPU, PostgreSQL storage, encrypted original/result storage, KMS/object requests, backup copies and telemetry still cost money. Reuse the existing runtime/bucket controls; no dedicated queue/worker/service solely for CSV.

At the hard input envelope, 200 * 10 MiB is roughly 2 GiB of new raw input per rolling 30 days before parsed evidence/version/recovery overhead. This is a bound, not a cost estimate or default retention policy. Measure parse memory/time and evidence growth locally; no staging environment is added. Existing platform budget alarms remain; application admission limits prevent unbounded resource work.

## Redaction and resilience tests

Canary account names/IDs, filenames, security labels and amounts must remain absent from routine logs, metric labels, error responses and job payloads. Job records reference authorized import/run IDs. Verify malformed input, lease loss, restart, replay and apply/audit failure preserve last approved state.

## Implemented telemetry surface

The finite in-process counters are upload/duplicate/parse/review/apply/download/reservation_expired with success/blocked/failed/disabled/quota outcomes; parse and handler stages record bounded elapsed milliseconds. Quotes-enabled and overdue-account gauges reflect the latest report evaluation. Process counters reset on restart; structured safe logs use the existing sink. Protected database records provide queue/lease/retry/reconciliation detail. No new external collector, dashboards or automatic storage-expiry policy are provisioned. Review/preview JSON allows up to the configured 10 MiB body and 3*maxRows+1,000 properties, while ordinary API payload defaults are preserved.
