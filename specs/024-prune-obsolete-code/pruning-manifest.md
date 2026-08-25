# Pruning Manifest: First-Pass Obsolete Code Removal

## Baseline

| Field | Value |
|---|---|
| Branch | `024-prune-obsolete-code` |
| Base/HEAD commit | `48a69a31e9470a65e7d2ab1afe77e5c56f338137` |
| Baseline tracked files | 1,110 |
| Local/generated candidates | 10 files under `tmp/pdfs/**` plus four root/API artifacts; 4,006,352 bytes |
| Stale secondary lockfile | `pnpm-lock.yaml`; 11,645 bytes |
| Retired Azure spec | 7 files; 77,664 bytes |
| Unused UI workspace | 31 files; 51,576 bytes |
| Empty utils workspace | 3 files; 98 bytes |
| Package manager | npm workspaces with `package-lock.json` |
| Baseline workspace anomaly | `@jackson/ui` and `@jackson/utils` are installed as extraneous workspaces; old Azure SDK packages are extraneous in `node_modules` but absent from manifests/lockfile |
| Initial working tree | Planning changes in `.specify/feature.json`, `AGENTS.md`, and untracked `specs/024-prune-obsolete-code/**`; no production implementation changes |

### Baseline gate results

- API build: PASS.
- API full suite: FAIL before pruning in `k1.reparse.contract.test.ts` (`AWS_BDA_ASYNC_WORKER_REQUIRED` remained populated).
- Web lint: FAIL before pruning with 21 errors and 3 warnings in live code, primarily `react-hooks/set-state-in-effect` and unused declarations.
- Web typecheck: FAIL before pruning in existing report tests/fixtures, Plaid typing, entity detail, and user pages.
- Web full suite: FAIL before pruning in existing UI tests, including `AddAssetDialog.test.tsx`.
- Color audit and both import guards: PASS.
- Flag-false build: PASS; CSS 102.30 kB (gzip 16.55 kB), JS 1,467.55 kB (gzip 395.22 kB).
- Flag-true build: PASS; CSS 102.30 kB (gzip 16.55 kB), JS 1,467.55 kB (gzip 395.22 kB).

## Pruning Candidates

| ID | Path or package | Kind/category | Inbound and entry-point evidence | Flag/dynamic checks | Replacement | Decision | Verification |
|---|---|---|---|---|---|---|---|
| AZ-001 | `specs/008-azure-document-intelligence/**` | Documentation / superseded provider | No backlinks outside the directory; runtime removed in `f0e6428` | Not runtime-discovered | `specs/022-aws-k1-pdf-ingestion/**` | REMOVE | V-AZURE, V-BDA |
| AZ-002 | Azure examples in `specs/002-k1-ingestion/research.md` and `specs/016-k1-tracker/quickstart.md` | Stale documentation | Incidental prose only | Non-Azure historical specs otherwise protected | Provider-neutral wording | REMOVE/REPLACE | V-AZURE |
| ART-001 | `new_k1.pdf`, `tmp/pdfs/**`, `apps/api/tmp-live-k1-check.mjs`, `design-qa.md`, `tic-registry.html` | Files / generated local | No package, source, test, Terraform, or script consumer; live-check contains a machine-local absolute path | Authoritative fixtures are under `apps/**/tests/fixtures/**` and excluded | Current React TIC implementation; no replacement for local captures | REMOVE | V-ARTIFACT, V-FIXTURES |
| WS-001 | `packages/ui/**` | Workspace / unused | No application or test imports; only unused resolver aliases and stale guidance | Not loaded by package scripts; live UI is `apps/web/src/components/**` | `apps/web/src/components/**` | REMOVE | V-NPM, V-WEB |
| WS-002 | `packages/utils/**` | Workspace / placeholder | Manifest plus placeholders only; no imports, scripts, or config consumers | Not dynamically loaded | None required | REMOVE | V-NPM |
| OUT-001 | `packages/types/src/k1-ingestion.js`, `packages/types/src/partnership-management.js` | Files / stale build output | Source-adjacent compiled subsets; `.ts` sources are authoritative | NodeNext `.js` specifiers intentionally resolve to `.ts` during compilation | Matching `.ts` sources | REMOVE | V-API, V-WEB |
| KEEP-001 | Explicit `.gitkeep` files listed in T030 | Files / redundant placeholder | Each retained directory contains at least one other tracked file | Package/workspace directories being deleted are covered by WS-001/WS-002 | Existing real files preserve directories | REMOVE | V-HYGIENE |
| DEP-001 | `pnpm-lock.yaml` | Lockfile / stale package manager | npm is used by every root/workspace script; `package-lock.json` is current | No pnpm workflow or CI entry point | `package-lock.json` | REMOVE | V-NPM |
| DEP-002 | Root `jsdom` and web `@types/react-router-dom` | Dependencies / unused | Web owns `jsdom`; React Router 7 ships types; no source/config consumers for v5 types | Emotion retained as MUI peer; coverage tooling retained | Web `jsdom`; React Router bundled types | REMOVE | V-NPM, V-WEB |
| WEB-001 | `apps/web/src/features/features/**`, `apps/web/src/auth/mockAuthService.ts`, top-level `components/StatusBadge.tsx`, `EstateMapSetupGuide.tsx` | Files / unreachable scaffold | No inbound path from `main.tsx`/`App.tsx`; duplicate/fake/TODO or superseded implementations | Checked against both Magic graphs and Estate Map imports | Live auth, shared StatusBadge, and Estate Map content | REMOVE | V-WEB, V-MAGIC |
| WEB-002 | `DashboardPage.tsx`, `K1TrackerPage.tsx`, `PartnershipDirectory.tsx`, `PartnershipDetail.tsx` | Files / obsolete route roots | No route/import consumer; `App.tsx` uses Magic dashboard and compatibility redirects | Both flag values use other routes/components | Current routed pages and redirects | REMOVE | V-WEB, V-MAGIC |
| WEB-003 | Old investment controls/table and retired Magic partnership content root/export | Files/export / unreachable duplicate | No inbound consumer except stale barrel for retired root | Transitive Magic workspace remains protected and live | Current Magic investment/partnership workspace | REMOVE | V-WEB, V-MAGIC |
| API-001 | `apps/api/src/modules/k1/storage/localPdfStore.ts` | File / legacy leaf | No imports; self-identifies legacy contract | Current selector uses `localK1ObjectStore` or S3 | `localK1ObjectStore.ts` | REMOVE | V-API, V-BDA |
| API-002 | `apps/api/src/modules/partnership-tracker/index.ts` | File / unused barrel | No imports or package export consumer | Routes import concrete modules | Concrete partnership-tracker modules | REMOVE | V-API |
| TYPE-001 | `packages/types/src/auth-access.ts` and index export | Export/file / stale private API | No application consumer; response shape omits current MFA union | MFA runtime pages/store remain protected | Live application auth types | REMOVE | V-API, V-WEB |
| DOC-001 | Active `packages/ui` references in two guards and `docs/ui/40-screen-map.md`, `docs/ui/46-component-catalog.md` | Config/docs / stale guidance | Guards are direct operator commands; active UI docs guide contributors | Historical numbered specs remain unchanged | `apps/web/src/components/shared/**` and current `PdfPanel` ownership | REPLACE | V-GUARDS |

## Protected Surfaces

| ID | Paths | Reason/consumer | Required verification |
|---|---|---|---|
| PROTECT-MAGIC-TRUE | `apps/web/src/config/featureFlags.ts`, `App.tsx`, Magic pages/workspaces, shared appearances | `VITE_MAGIC_PATTERN_DESIGNS=true` build and routes | V-MAGIC, V-WEB |
| PROTECT-MAGIC-FALSE | Legacy login/entities/detail/partnership paths and shared shell | `VITE_MAGIC_PATTERN_DESIGNS=false` build and routes | V-MAGIC, V-WEB |
| PROTECT-BDA | `apps/api/src/modules/k1/**`, worker, AWS SDK config, `infra/aws/**`, BDA fixtures/tests | Production extraction authority | V-BDA, V-API |
| PROTECT-STUB | `stubExtractor.ts` and provider-neutral extractor contract | Offline development and CI | V-BDA, V-API |
| PROTECT-MIGRATIONS | `apps/api/src/infra/db/migrations/**` | Filename-discovered immutable deployment history | V-MIGRATIONS |
| PROTECT-FIXTURES | `apps/**/tests/fixtures/**`, explicit web fixture modules | Authoritative regression inputs | V-FIXTURES |
| PROTECT-OPS | Terraform-invoked and package/operator scripts, documented seed commands | Direct/dynamic entry points | V-API, V-HYGIENE |
| PROTECT-MFA | `MFAPage.tsx`, `MFASetupPage.tsx`, `authFlowStore.ts` | Product/security decision deferred | V-WEB |
| PROTECT-HISTORY | Non-Azure numbered specs/contracts | Historical/contract evidence | V-HYGIENE |

## Deferred Candidates

| ID | Scope | Reason | Next step |
|---|---|---|---|
| DEFER-001 | Provisional 59-file web dependency closure exposed by dead-root analysis | Static reachability alone is insufficient; several entity, partnership, test, and feature-flag dependencies are shared | Re-inventory in a new numbered pruning spec/branch |
| DEFER-002 | MFA pages and `authFlowStore` | Real security flow despite incomplete route integration | Dedicated auth/security decision |
| DEFER-003 | Manual seed scripts | Direct operator entry points documented outside import graph | Separate operational inventory |
| DEFER-004 | Remaining non-Azure historical specs | No approved retention/archive policy | Separate documentation-retention spec |
| DEFER-005 | Legacy partnership CRUD/query/detail closure exposed by removing the obsolete directory/detail route roots | Static reachability is insufficient because entity and partnership modules share clients, hooks, and tests | Reclassify in iteration two |
| DEFER-006 | Older K-1 client/import-workbook/input-panel closure exposed by removing `K1TrackerPage.tsx` | Direct test and operational ownership requires a dedicated inventory | Reclassify in iteration two |

Newly exposed candidates found during implementation are appended here as `RETAIN` or `DEFER`; this branch does not expand its deletion set.

## Deletion Groups

| ID | Candidates | Authority/replacement | Baseline files/bytes | Status | Verification |
|---|---|---|---|---|---|
| retired-azure-spec | AZ-001, AZ-002 | Amazon BDA / Spec 022 | 7 deleted files / 77,664 bytes plus two prose edits | VERIFIED | V-AZURE, V-BDA |
| local-generated-artifacts | ART-001 | Current app or none required | 10 `tmp` files plus four other artifacts / 4,006,352 bytes | VERIFIED | V-ARTIFACT, V-FIXTURES |
| unused-workspaces | WS-001, WS-002, DOC-001 | Live app-local shared components | 34 files / 51,674 bytes | VERIFIED WITH ENVIRONMENT EXCEPTION | V-NPM, V-WEB, V-GUARDS |
| stale-package-output | OUT-001, KEEP-001, DEP-001, DEP-002 | TypeScript sources and npm lock | Included in final delta | VERIFIED WITH ENVIRONMENT EXCEPTION | V-NPM, V-API, V-WEB, V-HYGIENE |
| unreachable-web-roots | WEB-001, WEB-002, WEB-003 | Current routes/shared components | Included in final delta | VERIFIED AGAINST BASELINE | V-WEB, V-MAGIC |
| isolated-api-type-leaves | API-001, API-002, TYPE-001 | Current object store/concrete modules/live auth types | Included in final delta | VERIFIED AGAINST BASELINE | V-API, V-WEB, V-BDA |

## Verification Records

| ID | Command/procedure | Environment | Expected | Actual | Status |
|---|---|---|---|---|---|
| V-BASELINE | Full commands in quickstart section 2 | Node/npm; pre-deletion | Record existing status | API/web failures and passing builds/audits recorded above | FAIL (PRE-EXISTING) |
| V-AZURE | Active-tree provider scan | Repository excluding Git/build output | No Azure integration references | Zero matches | PASS |
| V-BDA | Focused BDA/stub tests and API build | Offline test environment | Pass | 38 focused tests pass; provider list is exactly `stub`, `aws_bda`; API build passes | PASS |
| V-MAGIC | Focused route tests, both Vite builds, route matrix | Flag false and true | Pass with current semantics | 68 focused tests pass; route/role/mobile/query matrix covered; both builds pass | PASS |
| V-NPM | `npm ci`; `npm ls --workspaces --depth=0` | Clean npm install | Pass; active workspaces only | Lockfile regeneration and `npm install` pass; workspace list contains only API, web, and types. `npm ci` is blocked by the already-running Vite process locking Rolldown's native binary | BLOCKED (ENVIRONMENT) |
| V-ARTIFACT | Tracked artifact scan | Working tree | No planned local/generated artifacts | All approved paths absent; exact recurrence ignores added. Deleted files remain index-listed until the user commits | PASS |
| V-GUARDS | Both import guard scripts | Current source | Zero violations and no removed-path guidance | K-1: 22 files, 0 violations; partnerships: PASS | PASS |
| V-API | API build and full tests | Offline test environment | Pass | Build and focused tests pass. Full suite: 94 files pass, 22 skip, 2 fail from the existing reparse expectation and unavailable `ATLAS_TEST_DATABASE_URL` | FAIL (BASELINE/ENVIRONMENT) |
| V-WEB | Lint, typecheck, full tests, color audit, production builds | Flag false and true | Pass | Focused suite, color audit, and both builds pass. Full lint/typecheck/test remain non-green in pre-existing live report/UI code | FAIL (PRE-EXISTING) |
| V-MIGRATIONS | Migration diff scan | Against branch base | No changes | No diff | PASS |
| V-FIXTURES | Fixture diff scan and tracked fixture presence | Against branch base | No fixture deletions | No fixture diff; authoritative fixture paths preserved | PASS |
| V-HYGIENE | `git diff --check`, final counts/deltas | Working tree | Pass and match manifest | `git diff --check` passes; 94 deletions and 10 additions project 1,026 tracked files | PASS |

## Final Delta

| Metric | Actual |
|---|---|
| Deleted tracked files | 94 |
| Added files (tests + feature artifacts) | 10 |
| Projected tracked-file count after commit | 1,026 (from 1,110) |
| Deleted bytes from base objects | 4,223,180 bytes |
| Added bytes | Approximately 95.7 kB |
| Tracked text diff before adding new files | 123 insertions, 6,003 deletions, plus binary removals |
| Active workspaces | `api`, `web`, `@jackson/types` |
| Final flag-false build | PASS; CSS 96.83 kB (gzip 15.78 kB), JS 1,467.58 kB (gzip 395.88 kB) |
| Final flag-true build | PASS; CSS 96.83 kB (gzip 15.78 kB), JS 1,467.58 kB (gzip 395.88 kB) |
| Aggregate emitted CSS + JS | 1,564.41 kB versus 1,569.85 kB baseline; 5.44 kB smaller |

No migration or fixture files changed. The provisional dependency closures remain deferred to a separately numbered pruning branch.
