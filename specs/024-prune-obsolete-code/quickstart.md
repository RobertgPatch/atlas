# Quickstart: First-Pass Obsolete Code Pruning

Run commands from the repository root in PowerShell on branch `024-prune-obsolete-code`.

## 1. Confirm scope and capture baseline

```powershell
git branch --show-current
git status --short
(git ls-files | Measure-Object).Count
git diff --check
```

Expected starting branch: `024-prune-obsolete-code`. The baseline captured during planning was 1,110 tracked files. Record the implementation-start commit because counts may change before pruning begins.

Capture current artifact sizes:

```powershell
$localArtifactPaths = @(
  'new_k1.pdf',
  'apps/api/tmp-live-k1-check.mjs',
  'design-qa.md',
  'tic-registry.html',
  'pnpm-lock.yaml'
)
$localBytes = (Get-Item $localArtifactPaths -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum).Sum
$tmpBytes = (Get-ChildItem tmp -Recurse -File -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum).Sum
"local_bytes=$localBytes tmp_bytes=$tmpBytes"
```

Planning baseline: `tmp/pdfs/**` is 3,329,050 bytes; all local/generated candidates together are roughly 4 MB.

## 2. Establish the baseline gates

```powershell
npm run build:api
npm run test:api
npm run --workspace=web lint
npm run --workspace=web typecheck
npm run test:web
npm run --workspace=web check:colors
node scripts/ci/guard-k1-imports.mjs
node scripts/ci/guard-partnerships-imports.mjs
```

Build the browser application once for each compile-time flag value:

```powershell
$env:VITE_MAGIC_PATTERN_DESIGNS = 'false'
npm run build:web

$env:VITE_MAGIC_PATTERN_DESIGNS = 'true'
npm run build:web

Remove-Item Env:VITE_MAGIC_PATTERN_DESIGNS
```

Record all pre-existing failures before deletion. Do not classify a candidate by hiding a baseline failure.

## 3. Add missing protection tests first

Before removing source, add focused coverage for:

- top-level `/dashboard` false redirect versus true Magic dashboard;
- `EntityDetail` with `magicPatternDesigns=false` as well as true;
- feature-flag parsing and environment integration;
- false partnership tracker rendering versus true query-preserving investment redirect;
- the current Estate Map appearance exception;
- compatibility redirects for `/partnerships`, `/partnerships/:id`, and `/k1-tracker`.

Run the focused web tests after each addition and confirm they fail if the protected wiring is intentionally broken.

## 4. Create and maintain the pruning manifest

Add a manifest section or table to this feature's implementation evidence containing:

```text
candidate id | path/package | evidence | flag reachability |
dynamic checks | replacement | remove/retain/defer | verification
```

Every deletion in the diff must map to a manifest record. Do not delete deferred candidates.

## 5. Apply deletion groups in order

### Group A: retired Azure design

- Remove `specs/008-azure-document-intelligence/`.
- Generalize the incidental provider examples in `specs/002-k1-ingestion/research.md` and `specs/016-k1-tracker/quickstart.md`.
- Retain Spec 022 and all BDA/stub implementation and documentation.

Scan active code/config/dependencies/operator docs:

```powershell
rg -n -i "azure|document[ -]?intelligence|documentintelligence|formrecognizer|cognitiveservices" `
  apps packages infra scripts docs package.json package-lock.json `
  --glob "!**/node_modules/**" --glob "!**/dist/**" --glob "!**/build/**"
```

Expected: no output.

### Group B: local/generated artifacts

- Remove `new_k1.pdf`, `tmp/pdfs/**`, `apps/api/tmp-live-k1-check.mjs`, `design-qa.md`, and `tic-registry.html`.
- Add targeted `.gitignore` rules for root/local workspace artifacts.
- Do not ignore PDFs/PNGs globally or remove files under explicit test fixture directories.

### Group C: unused workspaces and package hygiene

- Remove `packages/ui` and `packages/utils`.
- Remove `@ui` aliases from `apps/web/vite.config.ts` and `apps/web/tsconfig.app.json`.
- Update active guard/docs text that directs developers to removed paths.
- Remove physical `packages/types/src/k1-ingestion.js` and `partnership-management.js`, retaining `.ts` sources and `.js` import specifiers.
- Remove redundant `.gitkeep` files only from directories kept by real tracked content.
- Remove `pnpm-lock.yaml`, duplicate root `jsdom`, and unused web `@types/react-router-dom`.
- Regenerate `package-lock.json` with npm.

Validate package state:

```powershell
npm install --package-lock-only
npm ci
npm ls --workspaces --depth=0
```

### Group D: reviewed unreachable roots and leaves

Remove only manifest-approved files, initially including:

- nested `apps/web/src/features/features/**` prototype screens;
- `apps/web/src/auth/mockAuthService.ts`;
- duplicate top-level `apps/web/src/components/StatusBadge.tsx`;
- unused `EstateMapSetupGuide.tsx`;
- obsolete `DashboardPage.tsx`, `K1TrackerPage.tsx`, `PartnershipDirectory.tsx`, and `PartnershipDetail.tsx` roots;
- `MagicPatternCapitalActivityTable.tsx` and `MagicPatternInvestmentControls.tsx`;
- retired `MagicPatternPartnershipTrackerPageContent.tsx` and its stale barrel export;
- unreferenced legacy `localPdfStore.ts` and unused partnership-tracker barrel;
- stale, unconsumed `packages/types/src/auth-access.ts` and its index export.

After roots are removed, re-run import/reference classification. Do not bulk-delete the provisional 59-file closure; record uncertain leaves for iteration two.

## 6. Focused provider verification

```powershell
npm run --workspace=api test -- `
  k1.bda-extractor.test.ts `
  k1.bda-mapper.test.ts `
  k1.bda-output-parser.test.ts `
  k1.bda-eventbridge.test.ts `
  k1.extraction-worker.unit.test.ts
npm run build:api
```

Confirm `apps/api/src/modules/k1/extraction/index.ts` still exposes only `stub` and `aws_bda`.

## 7. Dual-variant route matrix

Verify each variant through automated route tests and a browser smoke pass:

| Surface | False expectation | True expectation |
|---|---|---|
| Login | Legacy UI; success -> `/liquidity` | Magic UI; success -> `/dashboard` |
| Dashboard | Redirect -> `/liquidity` | Dashboard renders |
| Entities | Legacy list | Magic list |
| Entity detail | Legacy detail | Magic detail |
| Investment tracker | Current unavailable/coming-soon state | Magic workspace |
| Partnership tracker | Legacy tracker | Query-preserving investment redirect |
| Shared pages | Legacy shell/nav | Magic shell/grouped nav |
| Estate Map | Current explicit Magic appearance remains | Same current appearance |

Also verify Admin/User navigation, desktop collapse, mobile navigation, sign-out, loading/error/empty states, partnership area aliases, and a valid year query.

Build separately after the smoke tests:

```powershell
$env:VITE_MAGIC_PATTERN_DESIGNS = 'false'
npm run build:web

$env:VITE_MAGIC_PATTERN_DESIGNS = 'true'
npm run build:web

Remove-Item Env:VITE_MAGIC_PATTERN_DESIGNS
```

## 8. Complete validation

```powershell
npm run build:api
npm run test:api
npm run --workspace=web lint
npm run --workspace=web typecheck
npm run test:web
npm run --workspace=web check:colors
node scripts/ci/guard-k1-imports.mjs
node scripts/ci/guard-partnerships-imports.mjs
git diff --check
```

Assert removed artifact classes do not remain tracked:

```powershell
git ls-files | rg '(^|/)tmp/|^new_k1\.pdf$|^pnpm-lock\.yaml$|packages/types/src/(k1-ingestion|partnership-management)\.js$'
```

Expected: no output.

Capture the final file count and compare it with the manifest:

```powershell
(git ls-files | Measure-Object).Count
git diff --stat main...HEAD
git status --short
```

The iteration is complete only when all deletion groups are `VERIFIED`, both flag values pass, and every unresolved candidate is listed as deferred rather than silently removed.
