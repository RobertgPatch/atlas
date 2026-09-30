# API and Review Contract

Extend existing `/v1/liquidity-statements` routes. Keep current UUIDs, optimistic versions, CSRF/session protection, rate policies, entity checks, and idempotency behavior. Public neutral types are defined once in `packages/types` and mirrored by runtime Zod validation, not hand-copied API/web models.

## Capability and original upload

`POST /upload-capability` retains entityId, custodian, fileName, sizeBytes, sha256, and contentType. New validated `fileKind` is CSV or XLSX; omitted kind is compatible with legacy CSV clients. An optional adapter hint must be a registered family/version, not arbitrary code or an authoritative bypass.

Accepted CSV MIME aliases retain current compatibility. XLSX canonical MIME is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Empty/browser octet-stream metadata may be normalized using the filename at request time, but content validation decides the actual kind after immutable upload. A mismatch is rejected with a useful error, never silently parsed as another type.

Return existing capability fields and canonical required upload headers. Both local binary PUT routes and S3 capabilities preserve raw bytes and use correct content type. React file accept, client extension checks, client SHA calculation, API body parsers, and object-store validation must agree.

Keep the existing protected prefix where practical; permit `original.csv` and `original.xlsx` with strict ID-based paths. Existing objects retain exact keys/versions. Download uses safe fixed filenames with the correct extension and attachment disposition, never unsanitized source account names. Source download remains an audited Admin operation.

## Detail and detection

`GET /:statementId` returns compatible summary fields plus file kind, parse provenance, active run/review, current workflow state, prior applications, sheet/region inventory, adapter matches, account candidates, controls/coverage, and located findings. Old schema-2 drafts are decoded without rewriting evidence.

New state `NEEDS_ADAPTER` has a reason such as unsupported layout, custodian mismatch, or ambiguous interpretation. The message states that a sample is needed for adapter development. It does not pretend arbitrary XLSX files can be handled by the CSV mapper.

Known simple CSV files may still enter NEEDS_MAPPING for import-scoped declarative mappings. Do not automatically save/reuse a mapping across future uploads. Mapping input remains bounded and cannot run user scripts or arbitrary expressions.

Page bounded record/position evidence for large files. Keep a legacy bounded detail projection for old clients, and add `GET /:statementId/records?runId=&cursor=&limit=` for new review views. Validate that runId belongs to that import and scope; enforce maximum 100 records/page and 1 MiB encoded response bytes, ending the page earlier when necessary and returning a cursor. Cap summary/canonical detail payloads explicitly and use account/position paging for larger drafts; pagination must not hide missing positions from totals or completeness checks. No unbounded entire-workbook dump.

## Account and sheet decisions

User selects complete account snapshots after detection. Raw worksheet checkboxes are insufficient when an account spans several sections or a summary overlaps detail.

`PATCH /:statementId/review` retains expectedVersion, changes, and accountBindings. Add `excludedAccounts: [{ occurrenceId, reason }]`. Every detected account candidate must appear exactly once as selected or excluded. For legacy clients omitting exclusions, require all accounts to be selected as before.

Rules:

1. At least one selected account is required to apply.
2. Selected candidates must be complete, in scope, and uniquely bound; preserve empty-account confirmation rules.
3. Excluded accounts receive no writes. Account-level issues on them do not block independent valid selected accounts; global integrity or ambiguous overlapping ownership still blocks.
4. Unsupported/unclassified sheets are inventoried with a disposition. They may be excluded only when they cannot contain part of a selected account. Otherwise require an adapter update or clearer complete export.
5. Hidden sheets are never silently selected. Hidden/filtered rows in selected tables remain part of the account.
6. Save review persists the draft even with unresolved findings when the submitted structure is valid; return updated findings with field links. Do not hide the reason apply is unavailable behind a generic Save error.
7. Account matching suggestions from last-four/name require explicit confirmation. Only a unique reliable full-identifier fingerprint match may prebind automatically.

## Preview and apply

`POST /:statementId/application-preview` includes the reviewed selection/exclusions and checks the active review/run. Return selected accounts' prior/next totals, added/removed/changed counts, date/order/correction decisions, reconciliation and coverage; also return excluded account names/masks and reasons.

Hash the actual recipe/run, canonical content, review revision, bindings/exclusions, warning acknowledgments, ordering, and current account versions. `POST /:statementId/apply` keeps expectedVersion, previewId, summaryHash, and idempotencyKey. Revalidate all conditions transactionally; apply all selected accounts or none. Invalidate current holdings, portfolio totals, account freshness, upload state, and history caches after success.

An exclusion never means a selected account has zero holdings. Publishing an empty selected account still requires explicit confirmation and a reason. Same-symbol positions in different accounts roll up through existing report logic, not through apply-time deduplication.

## Explicit reprocessing

Add `POST /:statementId/reprocess` with expectedVersion, reason, and optional registered adapter/structural selection or existing mapping revision. The server resolves and records supported versions; the caller cannot inject parser code or falsely claim an arbitrary version.

- Eligible: unsupported/mapping/failed drafts, reviewed drafts, and applied sources when explicitly creating a new draft/correction. Do not reprocess a source with an active live parse lease.
- Preserve the immutable original, successful prior runs, historical reviews, and applications. Create a new run, advance the import version, clear only the active-review pointer, and leave the import-wide review counter monotonic.
- Existing draft edits are not silently copied onto a new parse whose row identities may differ. Preserve them in history, show that a new review is required, and allow explicit re-entry after inspecting changed output.
- Applied-source reprocessing never changes portfolio values by itself. Publication still requires selection, review, preview, and apply. Previously excluded accounts may be selected later through this flow.
- Unchanged prior publication is detected by source ID, target account, effective snapshot identity, and financial contents independent of parser row IDs. A version-only change does not create another financial snapshot.
- Cancelling an applied source's correction abandons only that draft and restores the prior applied view. Retain accepted source identity and all applications; an identical subsequent upload must reopen the same source.
- An exact duplicate upload reopens the existing source; it does not silently apply, change its custodian, or discard review. If a newer applicable adapter exists, show Reprocess as an explicit action.
- Retry remains limited to transient failures; Reprocess handles new adapter/recipe intent. Record separate audit events and failure reasons.

## UI acceptance contract

- Use “Upload statements” and “CSV or XLSX”; show the detected custodian/export label and source as-of date.
- Show account selection at account granularity, its source sheets, selected/excluded status, source controls, and completeness.
- Format value, basis, gain/loss and differences in USD. Keep unknown fields as unavailable, not `$0.00`.
- Preserve editable asset-category dropdowns, locations/evidence, and row-specific save behavior.
- Keep blocking findings visible with direct navigation and a specific action; unsupported format, account ambiguity, source mismatch, and transient network failure have different messages.
- Browser upload tests cover the full local PUT/complete/poll/detail/review/preview/apply flow for both formats. Direct service tests alone do not establish browser correctness.
- Compatible symbol rollups retain one parent across differing descriptions/custodians; conflicting currencies, instrument units, or reliable security identities cannot be silently combined.
- Applying survives navigation, reload, and a new authenticated read; tests compare portfolio totals and source account subrows, including the same ticker with different descriptions across custodians.
