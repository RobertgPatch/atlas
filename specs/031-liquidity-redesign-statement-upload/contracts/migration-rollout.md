# Migration and Rollout: CSV Liquidity Sources

> Superseded on 2026-09-25: the approved product decision is an immediate CSV-only cutover with deletion of the former provider history through migration `050_remove_plaid.sql`. The staged preservation and retirement sequence below is retained only as superseded design history and must not drive implementation or deployment.

## Invariants

Preserve all legacy financial history, source dates, row lineage and audit. No CSV data masquerades as Plaid. No PDF/BDA migration is necessary because that feature was only planned. Capital-activity changes already in the working tree are independent of this plan.

CSV current state is per account and source effective date; a whole-portfolio Plaid snapshot is not interchangeable with one uploaded account. A confirmed empty snapshot is eligible. Ordinary reads and parse failures never call Plaid or AI.

## 1. Characterize

Record synthetic contracts for consolidated holdings, inclusion/selection, all KPIs, coverage, grouping, filters, dashboard, export, performance history and quote behavior. Identify consumers of PlaidInvestmentAccount, SourceHoldingRecord and daily refreshPolicy.

## 2. Expand and backfill

- Add source accounts, per-account snapshots/positions and import/review tables.
- Reuse stable legacy account UUIDs and map every record to its authorized owning entity before CSV activation.
- Split each successful legacy portfolio-wide snapshot into per-account children with its original legacy_snapshot_id and source effective date. Use deterministic child IDs/unique legacy parent+account identity for restartability.
- Preserve every original position and its exact values; lineage identifies its legacy parent/row. Do not confuse a missing legacy account segment with an explicitly empty account unless the source proves that state.
- Add/backfill source_account_id and source snapshot/position references on valuation history; keep legacy FKs during compatibility.
- Keep source origins PLAID_LEGACY and CSV explicit; account adoption changes active ingestion ownership, not historical origin.
- Do not copy connection tokens/ciphertext to neutral tables. Do not drop tables/columns or retrofit nulls into incompatible old constraints.

Old app ignores additive tables. New app can compare neutral and legacy reads without mixing both sources for one account.

## 3. Verify and shadow

Use synthetic layouts and equivalence fixtures to prove:
- Header/record accounting, exact formulas and missing-value behavior.
- Account/date snapshot selection, empty snapshots and multiple uploads/month.
- Same-ticker holdings at different custodians/accounts stay independent: updating/removing a position in the uploaded account changes no other account's rows or current snapshot.
- Older historical uploads and same-effective-point revisions.
- Mixed-date portfolio composition and no-look-ahead history.
- Scoped review, complete-export confirmation, stale/replayed apply and rollback under injected faults.
- Existing report/table/chart/export behavior except explicit new source/freshness/coverage labels.

CSV-vs-Plaid comparisons require equal effective dates, currencies, selected accounts and pricing mode. Timing differences must be recorded, not forced into exact equality.

## 4. Switch

Enable neutral reads and CSV applies with account-level active-source ownership to avoid double counting. Require all included accounts to have resolved scope and either retained legacy history/current data during transition or an approved CSV snapshot.

Set feature switches independently for upload, parse and apply. Deploy `REAL_TIME_EQUITIES_ENABLED=false` initially. Verify flag-off provider suppression and cached-quote bypass; flag-on uses existing ticker API after instrument eligibility/history checks. Test false/true/false mode transitions. Unknown/cash/bond/option instruments retain source value unless supported convention exists.

## 5. Observe and retire Plaid

Observe two successful complete replacement rounds across included accounts plus an old import, a correction, a failed import and an empty account case in acceptance evidence. These rounds may be biweekly, monthly or on demand; no monthly snapshot key or fixed calendar wait.

Then:
1. Remove connection/account-selection/manual-refresh controls in favor of neutral account management and Upload CSV.
2. Disable manual/scheduled Plaid runtime calls; any attempted call alerts.
3. Revoke Plaid items/tokens using the existing operator path without printing credentials.
4. Record redacted status/opaque IDs/time; null credential ciphertext only after revocation evidence and schema compatibility.
5. Remove Plaid SDK/config/secrets/jobs/permissions after inventory confirms no active consumers.
6. Retain historical non-secret metadata and financial records. Do not remove Bedrock/BDA resources used by K-1 ingestion.

## Rollback

Before neutral-read switch: disable CSV admission/parse/apply and retain legacy reads/evidence.

After any CSV publication: serve the last approved compatible neutral snapshots. Only use an older image if it understands the applied schema/data; an image that would discard newer CSV positions is not an acceptable fallback. Disable further apply and forward-fix.

After token retirement: no automatic Plaid reactivation. Keep source history, show as-of/age and repair CSV processing. Database rollback is forward-only; no evidence deletion.

## Required evidence

Clean/upgrade/repeated migration passes; zero orphan neutral valuation FKs; all legacy rows/values/date lineages accounted for; no secret copy; report compatibility plus explicit coverage changes; CSV source recovery; lease restart; apply/audit atomicity; flags and compatible rollback image tied to immutable commit.

Production eligibility remains [EX-030-003](../../030-user-ip-rate-limiting/evidence/EX-030-003.md). This plan does not initiate production work.
