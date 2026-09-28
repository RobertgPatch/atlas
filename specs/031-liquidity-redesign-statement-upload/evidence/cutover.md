# Cutover qualification

Synthetic HTTP journeys cover both known broker formats from upload through parse, review, preview, atomic apply, Liquidity read and signed-loss CSV export. Database scenarios cover distinct-date replacement, old uploads, corrections, missing basis, account isolation, explicit empty snapshots, stale/audit failures and preserved history. Neutral/current selection excludes adopted legacy duplicates and prevents future snapshots from appearing in earlier observations.

The retirement test uses a synthetic provider adapter: check blocks missing prerequisites, provider failure preserves ciphertext, successful removal clears ciphertext after a success audit, repeated removal is harmless, and financial history survives. The operator script defaults to `--check` and requires explicit `--revoke` plus approved evidence.

**Live retirement has not occurred. T072 stays unchecked.** Each real connection needs two observed successful distinct-date replacement rounds for all its accounts, correction/older/failed/empty cases, and an actual live observation reference. Neither elapsed time nor synthetic fixtures satisfy this gate. Use the deployment runbook before removing routes, SDK, jobs, secrets or the temporary legacy web reachability exceptions. Preserve K-1 resources.
