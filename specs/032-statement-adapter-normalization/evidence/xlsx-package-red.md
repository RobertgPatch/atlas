# T017 hostile XLSX package tests: initial red evidence

Recorded 2026-09-28. T017 is the test-writing task, not reader acceptance. T019 was absent during this run. XLSX remains default-disabled pending implementation and the complete hostile-input, worker, compatibility, and measured resource gates.

## Contract and synthetic coverage

`apps/api/tests/liquidity-statements/xlsx-package.test.ts` uses only the independent synthetic ZIP/OOXML fixture builders. It introduces no private workbook, saved binary, production reader, network fetch, database access, or original-statement upload.

The agreed package seam is `readXlsxPackage(bytes, config, { signal }?)`, returning bounded `parts: Map<string, Buffer>` and `resources`. The tests import the implementation before asserting input rejection. A missing module therefore fails the case instead of falsely satisfying an expected hostile-input rejection.

The 71 cases cover:

- Valid stored/deflated OOXML; exact original XML bytes and actual all-part resource totals.
- Arbitrary/empty/truncated ZIP, legacy/encrypted OLE bytes, missing essential parts, ZIP encryption flags, macro-enabled content types, and unreferenced VBA/ActiveX/OLE/executable parts.
- Duplicate/aliased/traversing/absolute/NUL paths, forged under/overreported inflated sizes, and invalid compressed data.
- Independent uploaded-byte, entry-count, per-XML-entry and aggregate inflated-byte limits, including highly compressed and unreferenced parts.
- Required content types and relationship namespaces, missing/duplicate/wrong IDs and targets, wrong target types, encoded/backslash traversal and global relationship counts.
- Malformed XML, duplicate attributes, illegal characters, undeclared entities, internal/external DTDs and entities, and malformed unreferenced XML. HTTP/HTTPS/fetch spies assert no attempted resolution, not merely eventual rejection.
- Independent XML depth, attribute count, UTF-8 element/attribute name lengths, decoded plain/CDATA/character-reference text, and aggregate decoded text limits.
- External required relationships and local-file targets reject; an ordinary hyperlink stays inert without HTTP/HTTPS/fetch calls. Already-aborted and in-flight-aborted reads reject, followed by a clean independent read.

Resource tests use small synthetic inputs and lower limits, not real resource-exhaustion payloads. Abort assertions are package-boundary checks, not proof of parent worker termination or complete resource cleanup under load; T008/T091/T092 retain those gates. Network spies cover the ordinary HTTP/HTTPS/fetch APIs; broader no-outbound/worker isolation verification remains a release requirement.

## Commands and observed results

- `npm exec --workspace=api -- tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck tests/liquidity-statements/xlsx-package.test.ts`: **passed**.
- `npm run --workspace=api test -- tests/liquidity-statements/xlsx-package.test.ts tests/liquidity-statements/adapter-conformance/fixture-builders.test.ts --reporter=dot`: **71 failed, 6 passed, 0 skipped**. Every package test failed at the intentionally absent `readers/xlsx-package.js` import. All six independent fixture-builder tests passed. Shared-types pretest build passed.

These failures demonstrate the missing implementation prerequisite, not exercised protection failures or acceptance. T019 must implement the agreed package contract and make these assertions execute and pass; T020 owns cell interpretation. No production file or feature flag was changed by T017.
