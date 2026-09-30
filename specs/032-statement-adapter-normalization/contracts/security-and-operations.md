# Security and Operations Contract

## Data flow and ownership

Admin selects entity/custodian -> obtains short-lived upload capability -> sends bounded original bytes to the existing protected object store -> completes immutable version/hash verification -> durable parent job reads source -> bounded parser worker returns typed/normalized draft -> parent validates and minimizes identifier projections -> protected draft/review -> version-bound approval -> existing snapshots/reports.

Originals, financial values, and review evidence remain Restricted. File processing stays local to the authorized application runtime. No external formula, hyperlink, parser, AI, pricing, or network call is initiated by an adapter. Existing optional pricing enrichment is a separate, already gated report concern.

The worker is a resource-isolation mechanism, not a sandbox against hostile application code. Only reviewed registered adapter code ships. The parent retains database and secret-bearing account-fingerprint access; pass only necessary bytes/configuration and no credentials into the worker.

## Authorization matrix

| Action | Allowed actor and checks | Denied cases |
|---|---|---|
| Upload/complete/content PUT | Existing Admin/session/CSRF/entity policy; persisted import ownership; short-lived capability/hash/size | Non-Admin, expired capability, wrong import/entity/version/hash, cross-origin write |
| Detail/records/download | Existing Admin and import entity scope; run belongs to requested import; download audited | Cross-import run IDs, unscoped originals, user-supplied storage path |
| Map/reprocess/select/review | Existing Admin; import entity/custodian and workflow/version; registered parser choices only | Dynamic code, stale revisions, active conflicting jobs, out-of-scope account bindings |
| Preview/apply | Existing Admin; all selected accounts authorized and complete; unique bindings; active recipe/review/hash/account versions | Partial selected account, scope mismatch, changed exclusion, stale preview, replay with altered payload |
| Portfolio/history read | Existing scoped report permissions | Cross-entity records, raw source identifiers in routine reports |
| Parser job | Service code using persisted import entity and fenced lease | Worker-chosen entity, stale lease write, output for another source hash |

Keep existing admission/rate protection on new records/reprocess endpoints and extend route coverage tests. No additional AWS action or wildcard scope is needed if originals remain under the protected existing prefix. Any actual infrastructure change receives the repository's usual validation.

## Threat controls

| Threat | Required control and negative evidence |
|---|---|
| Renamed binary or arbitrary ZIP | Verify kind, package content types, and required relationships before parsing; reject incompatible extension/content combinations |
| ZIP bomb / forged sizes | Lazy entries, observed inflated-byte counts, per-entry/aggregate limits, path/name validation, count caps, deadline and termination |
| XML expansion or deep parser work | Reject DTD/entity declarations, malformed XML, excessive depth/attributes/names/text, and oversized styles/strings |
| Huge worksheet dimensions | Sparse iteration over actual cells; never allocate from declared dimensions |
| Formula/code injection | No evaluation, macros, external data resolution, dynamic imports, eval, or user code; literal cells remain inert; keep safe spreadsheet exports |
| External links / data exfiltration | Do not resolve relationships outside the package; no adapter outbound network path; test network-call suppression |
| Silent omission/double count | Complete sheet/row disposition, declared section grain, scoped controls, overlap detection, selected-account completeness |
| Account collision | Entity/custodian scoped reliable full-ID fingerprints; no last-four-only automatic binding |
| Identifier disclosure | Mask identified account cells/titles and source filename projections; safe occurrence IDs; no identifiers in telemetry/errors |
| Stale job or changed draft | Fenced run generation/lease, immutable successful results, version/hash checks, monotonic review revisions |
| Partial publication | Atomic selected-account apply; excluded accounts untouched; retry replays exact prior application |
| Resource exhaustion | Existing quota/queue/concurrency limits, parent timeout, bounded evidence/result size and DB persistence batches |

## Parsed evidence minimization

Preserve exact originals under current protected access/retention. For new parsed results, extract reliable full IDs transiently, fingerprint in the parent, mask known account fields and title metadata, and assign non-identifying occurrence IDs. Do not persist unclassified preamble/note/extra-column values in routine canonical projections merely to fill a raw preview; record their source location/disposition and retain the original for authorized inspection.

Known mapped financial and supporting fields may be stored as protected evidence. Unknown-layout UI exposes bounded structural information, not arbitrary raw metadata containing account identifiers. One-off mapping previews must apply the same identifier-aware projection; original inspection uses the existing audited source-download path.

Legacy raw tokens and title fields may already contain account identifiers. Add a sanitizing compatibility response layer without changing immutable stored evidence or its hashes. Do not claim this erases historical identifiers; any historical data cleanup requires a separate reviewed preservation/retention operation.

## Operations and failure behavior

- Add low-cardinality outcomes by reader/adapter family/version, failure code, matched/unsupported/ambiguous result, and duration. Count bytes/records/sheets and resource rejections; do not use account numbers, filenames, cell values, descriptions, or raw source responses as labels/logs.
- Record reprocess, selection/exclusion, field correction, control correction, approval, download, cancellation, and apply events using existing durable audit patterns. Financial evidence stays in authorized records, not log messages.
- Parent timers actually terminate workers. Keep leases alive while work runs, reject late output by source/run/generation, and recover after process exit under bounded retry policy.
- Schema-validate and size-check output before a bounded persistence transaction. Use database statement/transaction timeouts and rollback on deadline/fencing failure; no partial successful draft or snapshot.
- Malformed/unsupported/resource-exceeding input is a stable user-facing result, not an infinite transient retry. Failure always retains the prior approved portfolio.
- Preserve current kill switches; add an XLSX enablement flag default false until compatibility, dependency, resource, and conformance gates pass. Format disabling stops new parsing; previously approved XLSX remains readable.
- Expose safe actionable error text and a correlation ID. Operators can distinguish parsing failure, missing adapter, review inconsistency, and storage/network failure.

## Capacity and cost

No new always-on service, external extraction fee, or provider request per upload. Expect bounded extra CPU/memory for ZIP/XML and a modest amount of new source/control metadata. Measure representative and worst-case combined API/worker RSS, request latency, storage growth, and concurrent-read responsiveness before activating XLSX.

The worker's 256 MiB proposed V8 budget is not an RSS cap. ZIP buffers and worker message copies can dominate memory. If the current deployment cannot satisfy the limits, lower admission/parser bounds or prepare an explicit sizing change with cost evidence before release.

## Retention, recovery, and incident impact

Preserve existing record-class policies and recovery targets. This feature creates no retention period and performs no data purge. Verify the organizational retention schedule and existing recovery evidence during release preparation rather than inventing policies in parser code.

Update inventory/data flow, dependency review, operator troubleshooting, incident containment for hostile files, safe reprocess procedure, and the rollback/restore runbook. Restore tests include a CSV original, an XLSX original, their typed evidence, account selection, approved snapshots, and reporting behavior. No statement data is copied into Git, CI, or external research queries.
