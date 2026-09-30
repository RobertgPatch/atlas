# T035 Schwab adapter fixture/tests: initial red evidence

Recorded 2026-09-28. This completes the test-writing task only. T041 was absent during the focused run; no production adapter was added or changed.

## Synthetic fixture and independent expectations

- `apps/api/tests/liquidity-statements/fixtures/schwab/positions.csv` contains a synthetic masked account title and six positions: two separate same-symbol observations, an explicitly incomplete basis despite reported gain/percentage, an explicit zero basis, a money-market holding, and value-only cash. It includes reported asset types, positive/negative/zero day change, and a complete $1,525 market-value footer with incomplete basis/gain markers.
- `apps/api/tests/liquidity-statements/fixtures/schwab/expected.json` was authored independently of parser output. It specifies exact values, source ordinals, record roles, title date/time/zone, masked identity, and the complete market-value control membership. No golden output is generated from the implementation.
- `apps/api/tests/liquidity-statements/schwab-adapter.test.ts` calls the existing typed CSV reader and the proposed `charlesSchwabPositionsCsvAdapter` export through the current `StatementAdapter` interface. The module import is outside rejection assertions, so a missing adapter cannot falsely pass a rejection test.

The tests require named-column extraction, zero-based CSV field evidence, source classifications/percentage interpretations, repeated-symbol multiplicity, explicit null/incomplete/zero distinctions, unchanged imported negative gain, and exactly-once record disposition. Variants cover complete value/basis/gain controls, missing total, omitted optional day-change columns, reordered/extra columns, shifted preamble, Eastern standard/daylight offsets, transaction-export nonmatch, unknown numeric footer blocking, and deterministic parsing without source mutation.

Cash recognition belongs to the adapter; cash-basis and other financial derivations remain shared-normalizer work. Consequently the adapter fixture expects unavailable source cash basis and quantity to remain unavailable at this boundary. Incomplete basis must not become complete even though a gain and ratio could algebraically produce a number. An incomplete footer is never represented as a complete numeric control.

## Commands and results

- `npm exec --workspace=api -- tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck tests/liquidity-statements/schwab-adapter.test.ts`: **passed**.
- `npm run --workspace=api test -- tests/liquidity-statements/schwab-adapter.test.ts tests/liquidity-statements/csv-reader.test.ts --reporter=dot`: **6 passed, 18 failed, 0 skipped**. The new fixture structure/location case and five existing typed-CSV reader cases pass. All 18 adapter cases fail at the absent `adapters/charles-schwab/positions-csv.js` prerequisite. Shared-types pretest build passed.

This is expected test-first red evidence, not a claim that adapter assertions have passed or that the upload/application flow is complete. T041 must make the production adapter cases pass. No customer data, network request, database write, deployment, or feature-flag change was involved.
