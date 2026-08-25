# Quickstart: Obsolete Code Pruning, Iteration 2

Run commands from the repository root in PowerShell on branch `025-prune-obsolete-code-iteration-2`.

## 1. Confirm the baseline

```powershell
git branch --show-current
git status --short
git rev-parse HEAD
(git ls-files | Measure-Object).Count
git diff --check
npm ls --workspaces --depth=0
```

Planning baseline:

- merged base commit: `8baaadda1eb483414f4f5e62c54d672e7dfba8a8`;
- 1,028 tracked files;
- 339 files under `apps/web/src`;
- 206 files under `apps/api/src`;
- active workspaces: API, web, and `@jackson/types`.

Record a newer implementation-start commit and recalculate counts if `main` advances before implementation.

## 2. Capture all pre-deletion gates

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

Build both compile-time variants separately:

```powershell
$env:VITE_MAGIC_PATTERN_DESIGNS = 'false'
npm run build:web

$env:VITE_MAGIC_PATTERN_DESIGNS = 'true'
npm run build:web

Remove-Item Env:VITE_MAGIC_PATTERN_DESIGNS
```

Record every failure in `pruning-manifest.md` before deletion. A pre-existing failure may remain unchanged, but pruning must not introduce a new failure or hide the baseline.

Characterize the current password-only login before changing authentication:

```powershell
$env:MFA_LOGIN_ENABLED = 'false'
npm run --workspace=api test -- auth.login.test.ts
Remove-Item Env:MFA_LOGIN_ENABLED

npm run --workspace=web test -- `
  src/App.test.tsx `
  src/pages/LoginPage.test.tsx
```

## 3. Prove Azure remains absent

Scan active surfaces, including hidden environment examples:

```powershell
rg -n -i --hidden `
  "azure|document[ _-]?intelligence|documentintelligence|form[ _-]?recognizer|formrecognizer|AZURE_|@azure|cognitiveservices|DocumentAnalysisClient|AzureKeyCredential" `
  apps packages infra scripts docs package.json package-lock.json `
  --glob "!**/node_modules/**" `
  --glob "!**/dist/**" `
  --glob "!**/build/**"
```

Expected: no output.

Confirm the exact supported provider set:

```powershell
npm run --workspace=api test -- k1.bda-extractor.test.ts
rg -n "stub|aws_bda" `
  apps/api/src/config.ts `
  apps/api/src/modules/k1/extraction/K1Extractor.ts `
  apps/api/src/modules/k1/extraction/index.ts
```

Intentional retirement/audit mentions may remain only under Specs 024 and 025.

## 4. Create the iteration-2 pruning manifest

Create `specs/025-prune-obsolete-code-iteration-2/pruning-manifest.md` with these sections:

```text
baseline
reachability records
candidates (including inherited Spec 024 group)
protected surfaces
deletion groups
verification records
deferred decisions
final deltas
```

Every planned path from `research.md` must have an explicit `REMOVE`, `RETAIN`, or `DEFER` decision before deletion.

## 5. Recompute web reachability

Use the TypeScript parser already installed by the workspace to walk relative imports from `apps/web/src/main.tsx`. Treat the output as candidate discovery, not deletion authority.

```powershell
$reachabilityScript = @'
import ts from 'typescript'
import path from 'node:path'

const root = path.resolve('apps/web/src')
const files = ts.sys.readDirectory(root, ['.ts', '.tsx'], undefined, undefined).map(path.normalize)
const fileMap = new Map(files.map((file) => [file.toLowerCase(), file]))

const resolveRelative = (from, specifier) => {
  if (!specifier.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), specifier)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  return candidates.map(path.normalize).map((candidate) => fileMap.get(candidate.toLowerCase())).find(Boolean) ?? null
}

const edges = new Map()
for (const file of files) {
  const info = ts.preProcessFile(ts.sys.readFile(file) ?? '', true, true)
  edges.set(file, [...info.importedFiles, ...info.referencedFiles]
    .map((entry) => resolveRelative(file, entry.fileName))
    .filter(Boolean))
}

const entry = path.normalize(path.join(root, 'main.tsx'))
const reachable = new Set()
const pending = [entry]
while (pending.length) {
  const file = pending.pop()
  if (!file || reachable.has(file)) continue
  reachable.add(file)
  pending.push(...(edges.get(file) ?? []))
}

const production = files.filter((file) =>
  !/(\.test|\.spec)\.(ts|tsx)$/.test(file) &&
  !file.includes(`${path.sep}__tests__${path.sep}`))

for (const file of production.filter((file) => !reachable.has(file))) {
  console.log(path.relative(process.cwd(), file))
}
'@

$reachabilityScript | node --input-type=module
```

For every result, separately inspect:

- test imports;
- barrels and package exports;
- `App.tsx`, route redirects, and both flag states;
- dynamic `import()` calls;
- scripts, Terraform, Dockerfiles, environment/config loading, and documentation;
- filename/glob discovery;
- current replacement/authority.

## 6. Reconnect MFA behind the server flag

Implement and verify the requested feature flag before pruning the surrounding source graph:

1. Add `config.mfaLoginEnabled` from `MFA_LOGIN_ENABLED`, using the existing API boolean parser and defaulting to false.
2. Document the variable in `apps/api/.env.example`, add a false-default `mfa_login_enabled` Terraform variable, wire it into `local.api_environment_variables`, update staging/production tfvars examples, and update current deployment/operator guidance.
3. Keep current direct-session logic when the flag is false.
4. When true, branch after successful password validation into the existing enrollment or challenge creation logic; do not create a session or cookie yet.
5. Change `authClient.login` to return `SessionResponse | MfaEnrollmentResponse | MfaChallengeResponse`.
6. Update `LoginPage` to authenticate direct session results or store and route MFA results.
7. Restore `/mfa/setup` and `/mfa` as public pre-auth routes in `App.tsx`.
8. Make successful MFA completion choose `/dashboard` for the Magic design and `/liquidity` for the legacy design.

Run separate API processes/tests for both values so module-load configuration is isolated:

```powershell
$env:MFA_LOGIN_ENABLED = 'false'
npm run --workspace=api test -- auth.login.test.ts

$env:MFA_LOGIN_ENABLED = 'true'
npm run --workspace=api test -- `
  auth.login.test.ts `
  auth.mfa-enroll.test.ts `
  auth.mfa-verify.test.ts

Remove-Item Env:MFA_LOGIN_ENABLED

npm run --workspace=web test -- `
  src/App.test.tsx `
  src/pages/LoginPage.test.tsx `
  src/pages/MFAPage.test.tsx `
  src/pages/MFASetupPage.test.tsx
```

Required assertions:

- false/unset produces the existing session response and cookie;
- true plus unenrolled produces `MFA_ENROLL_REQUIRED` without a session cookie;
- true plus enrolled produces `MFA_REQUIRED` without a session cookie;
- successful enrollment or verification produces the session cookie;
- invalid password and lockout behavior is identical in both states;
- the browser stores the correct flow token and opens the matching route;
- direct MFA-route navigation without a token returns to login;
- final navigation matches both Magic and legacy landing behavior;
- toggling MFA needs only an API environment change and restart, not a web rebuild.
- Terraform plans pass `MFA_LOGIN_ENABLED` consistently to API-derived ECS tasks from one `mfa_login_enabled` input.

Do not add `VITE_MFA_LOGIN_ENABLED` or any second MFA enforcement flag.

## 7. Apply deletion groups in order

### Group A: legacy partnership web closure

Remove only the 23 sources and six sole-purpose tests listed in `research.md`. Preserve:

- `entitiesClient.ts`, `assetsClient.ts`, and `partnershipsClient.ts`;
- entity/asset hooks used by live routes;
- `PartnershipDirectoryTable`, `EntityReportsPreviewSection`, and `SectionCard`;
- all current `features/partnership-tracker` API, hook, aggregation, Magic, and workspace paths.

Run focused entity/partnership tests and both import guards before continuing.

### Group B: obsolete K-1 web client closure

Remove the old `k1TrackerClient`, hook, workbook dialog, input panel, picker, and sole-purpose test. Do not remove server `/k1-tracker` routes, repositories, import services, or API tests.

Run current K-1 dashboard, upload, review, partnership basis, form, and tracker tests.

### Group C: stale partnership-tracker proxies/placeholders

Retarget `PartnershipTrackerSignoff.test.tsx` to the canonical live K-1 tracker `SignOffPanel`, then remove the nine stale files. Preserve `AddYearDialog`, `CompareYearsDrawer`, and `YearRail` proxies used by `K1BasisWorkspace`.

### Group D: isolated web leaves and starter assets

Remove the two report components, two review components, and three starter assets listed in research. Edit only the stale summary-card portion of the mixed consolidated-holdings test. Preserve `consolidatedHoldingsFixture.ts` and all tests that use it.

### Group E: obsolete process-local seeds and broken package entry

Remove:

- `apps/api/src/infra/db/seed/002_k1_fixtures.ts`;
- `apps/api/src/infra/db/seed/003_review_fixtures.ts`;
- `apps/api/src/infra/db/seed/006_reports_fixtures.ts`;
- root `transfer:prepare`.

Retarget exact stale seed guidance in Specs 002, 003, and 006. Preserve `004_partnership_fixtures.ts` and all migrations.

```powershell
rg -n -S "002_k1_fixtures|003_review_fixtures|006_reports_fixtures|transfer:prepare|prepare-laptop-transfer" `
  apps packages infra scripts docs specs package.json
```

Expected after updates: no active command points to a removed file; historical statements must not instruct execution.

### Group F: orphaned MUI theme/dependencies

Remove the theme source/test and root `ThemeProvider`, then remove MUI/Emotion dependencies and regenerate the lockfile.

```powershell
npm install --package-lock-only
rg -n "@mui|@emotion|muiTheme|ThemeProvider|Mui[A-Z]" `
  apps/web package.json package-lock.json
```

Expected: no active MUI/Emotion/theme references. Run root route tests, color governance, and both production builds immediately after this group.

## 8. Focused retained-surface verification

```powershell
npm run --workspace=api test -- `
  auth.login.test.ts `
  auth.mfa-enroll.test.ts `
  auth.mfa-verify.test.ts `
  k1.bda-extractor.test.ts `
  k1.bda-mapper.test.ts `
  k1.bda-output-parser.test.ts `
  k1.bda-eventbridge.test.ts `
  k1.extraction-worker.unit.test.ts `
  k1.bedrock-checkbox-verifier.test.ts
npm run build:api

npm run --workspace=web test -- `
  src/App.test.tsx `
  src/pages/LoginPage.test.tsx `
  src/pages/MFAPage.test.tsx `
  src/pages/MFASetupPage.test.tsx `
  src/pages/EntitiesPage.test.tsx `
  src/pages/EntityDetail.test.tsx `
  src/pages/PartnershipTrackerPage.test.tsx `
  src/pages/InvestmentTrackerPage.test.tsx `
  src/pages/EstateMapPage.test.tsx `
  src/pages/K1ReviewWorkspace.test.tsx `
  src/features/partnership-tracker `
  src/features/k1-tracker
```

Verify manually or through existing route tests that the flag-false and flag-true expectations in `contracts/pruning-safety.md` still hold.

## 9. Dependency and infrastructure verification

Stop active Vite processes that lock native binaries before the clean install, then run:

```powershell
npm ci
npm ls --workspaces --depth=0

Push-Location infra/aws/terraform
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
Pop-Location
```

If Terraform is unavailable or environment access blocks a command, record `BLOCKED` with the exact reason; do not treat it as a pass.

Windows `UNMET OPTIONAL` output for explicitly Linux-only Rolldown/Lightning CSS packages is expected.

## 10. Complete final verification

```powershell
npm run build:api
npm run test:api
npm run --workspace=web lint
npm run --workspace=web typecheck
npm run test:web
npm run --workspace=web check:colors
node scripts/ci/guard-k1-imports.mjs
node scripts/ci/guard-partnerships-imports.mjs

$env:VITE_MAGIC_PATTERN_DESIGNS = 'false'
npm run build:web
$env:VITE_MAGIC_PATTERN_DESIGNS = 'true'
npm run build:web
Remove-Item Env:VITE_MAGIC_PATTERN_DESIGNS

git diff --check
git diff --name-status 8baaadda1eb483414f4f5e62c54d672e7dfba8a8 -- apps/api/src/infra/db/migrations
git diff --name-status 8baaadda1eb483414f4f5e62c54d672e7dfba8a8 -- ':(glob)apps/**/fixtures/**'
```

Expected migration result: no output. Fixture changes must match only explicitly approved sole-purpose test artifacts; authoritative fixtures remain.

Finalize the manifest with:

```powershell
(git ls-files | Measure-Object).Count
git diff --stat 8baaadda1eb483414f4f5e62c54d672e7dfba8a8
git status --short
```

Iteration 2 is complete only when all approved candidates are classified, all deletion groups are verified or rolled back, protected surfaces have no regression, and every unresolved candidate is recorded as retained or deferred.
