# Dependency verification

2026-09-21: Node v22.20.0 resolves `csv-parse@7.0.2` in the API workspace. Pinned the existing dependency to 7.0.2 and refreshed the lockfile with `npm install --package-lock-only --ignore-scripts`.

`npm run security:audit:runtime` passed: API runtime, web runtime and API build/test findings all zero. The broad install summary reported one high finding outside these audited runtime sets; no unrelated automatic dependency updates were made.

CSV ESM runtime is exercised by the adapter conformance suite. Synthetic baseline checks (equivalence, holdings export/history, portfolio summary) passed: 4 files, 8 tests. Final verification records subsequent results separately.
