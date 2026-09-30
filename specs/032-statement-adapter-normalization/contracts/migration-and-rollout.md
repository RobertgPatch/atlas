# Migration, Compatibility, and Rollout

## Invariants

- Keep old original bytes/storage keys/object versions and canonical/application hashes unchanged.
- Keep successful runs, historical reviews, and approved snapshots immutable.
- Preserve existing account/snapshot IDs, latest-pointer ordering, exact values, and same-symbol rollups.
- Do not restore any Plaid table, runtime, secret, or source history.
- Do not automatically publish a reprocessed source or recalculate historical values under new rules.

## Additive migration work

Choose next available migration numbers during implementation. Do not reuse numbers occupied by concurrent work.

1. Add file-kind/content metadata with legacy CSV compatibility; extend import statuses for NEEDS_ADAPTER and record its safe reason.
2. Add parse recipe/hash and evidence-location metadata. Make CSV line columns nullable for XLSX only; add format-aware checks and preserve existing record foreign keys/global ordinals. Extend row-role checks for notes/subtotals/exclusions.
3. Add active-review pointer constrained to the import/run, monotonic review allocation, and persisted account exclusions. Existing historical revisions remain unchanged; backfill active pointers only from matching current run/revision. Add monotonic retained-source identity for sources with applications; include it in accepted-hash uniqueness and duplicate queries so cancelling a correction cannot release the source identity.
4. Extend source-account/snapshot/valuation source-kind constraints to admit STATEMENT alongside CSV. Retain old values and CSV_FALLBACK history labels; new values explicitly identify the neutral source and actual file kind.
5. Add any query indexes/metadata needed for bounded record paging and provenance lookup. Use JSONB for source controls/interpretations where consistent with current storage; do not introduce a second financial data owner.
6. Extend immutability guards to protect new metadata after successful parsing/publication. Do not bypass evidence triggers to rewrite old payloads.

## Consumer compatibility checklist

Update API/shared types/Zod, object-key validation, upload MIME/header generation, local binary content handlers, downloads, review/record locations, source account reads, report aggregation, valuation history/exports, quote eligibility, deployment capability checks, and UI/source labels.

Pay special attention to `sourceKind === 'CSV'` financial shortcuts in current reporting. Any unknown source/convention must fail closed for unit-based calculations; adding STATEMENT cannot implicitly make it eligible for price multiplication.

Existing schema-2 drafts remain readable through compatibility projection. If reprocessing is needed to use new financial semantics, create a new run and review. Existing schema-2 approvals remain source evidence, even where the improved cash rule would produce a different new draft.

## Reprocessing and review revision integrity

Current queueing resets review_revision to zero, while reviews are unique by import/revision. Replace that with an active-review pointer and monotonic sequence before adding the public reprocess action.

Allocate each new review revision under the import lock. Clear active review on a new run; detail cannot use a historical review from another run. Preserve earlier applications even while a source is in QUEUED/PARSING for a correction. Expose application history independently from current workflow state.

Account selections, exclusions, and parser versions invalidate previews. Successful reprocessing of an applied file requires a new explicit approval; no replay can apply new contents under an old idempotency key. Previously excluded accounts may later be applied from the same original through a new review, without duplicating already approved accounts by default.

Prior-publication checks use source + target account + effective snapshot identity and an order-independent financial-content digest that preserves duplicate row multiplicity, excluding recipe/evidence identifiers. Cancelling a correction restores the prior applied view and does not cancel/reject the already accepted source. Test this against the retained-source unique index, including concurrent duplicate upload.

## Activation sequence

1. Capture baseline synthetic golden outputs and migration/restore evidence.
2. Ship schema additions and a compatible application that can read schema 2/3 and CSV/STATEMENT. Keep new XLSX parsing disabled.
3. Introduce registry-backed CSV parsing, compare legacy behavior and intended versioned rule fixes, and verify the new review/version/reprocess invariants.
4. Add bounded XLSX reader and Morgan adapter. Run synthetic conformance, hostile-file tests, deployment-shaped memory/deadline measurements, and browser journey tests locally/CI.
5. Operator checks supplied examples locally through review without logging or committing their values; record only synthetic/generalized evidence in Git. Confirm selected complete account totals, category/basis conventions, and no data loss after navigation.
6. Enable XLSX only when required checks pass and normal release authorization exists. Monitor format-specific errors/resource rejection and compare approved versus reported control coverage.

This planning request does not enable the flag, run migrations against production, commit/push the plan, or deploy. User requires `main` plus an explicit deployment request before production deployment.

## Rollback

- Before any new schema-3/STATEMENT publication, disable new parsing and roll back application code only if the old binary is demonstrated compatible with additive schema state and import statuses.
- After new approvals exist, disable new parsing/apply as needed but retain a compatibility-capable reader/report version. An old 031 binary is not automatically a safe rollback target for STATEMENT rows or new draft schemas.
- Prefer a forward fix to restore parser correctness. Correct financial data through a new reviewed snapshot; do not delete or edit approved history.
- Roll back infrastructure only under the existing reviewed saved-plan workflow if infrastructure was changed. Restore source/DB checkpoints only under the existing recovery procedure, with measured integrity and RPO/RTO validation.
- No down migration drops new evidence or removes source-kind values in use. Recovery checkpoints protect all format generations.

## Required evidence before release

Fresh-database and upgrade migrations; replay/idempotency; immutable evidence; legacy detail/download; active-review/run correctness; source-kind read compatibility; applied-source reprocess; formerly excluded account application; precise decimals; scoped controls; three-custodian monthly sequence; actual browser uploads for CSV/XLSX; cross-entity denial; safe archive/worker failure; cost/resource measurements; dependency/security gates; and recovery test covering both file kinds.

Skipped database-dependent tests are not evidence of those boundaries. Provision the repository's local test database and run them when implementing this feature. Production readiness must also satisfy existing organizational and release obligations.
