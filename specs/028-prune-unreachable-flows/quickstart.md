# Quickstart: Implementing Spec 028 Safely

Run from the repository root in PowerShell. This is an execution guide for the later implementation phase; the planning command does not delete product code.

## 1. Start from the correct baseline

Do not implement this cleanup in the current uncommitted Spec 027 worktree. First finish or otherwise capture Spec 027, then create/switch to the Spec 028 feature branch with a clean worktree.

```powershell
git status --short
git branch --show-current
git log -1 --oneline
```

Record the implementation-start commit in `specs/028-prune-unreachable-flows/pruning-manifest.md`:

```powershell
$cleanupBase = git rev-parse HEAD
$cleanupBase
```

## 2. Capture the baseline before deleting anything

Record tracked counts, source lines, direct dependencies, route inventories, build output, and existing failures. A baseline failure is evidence, not permission to introduce another failure.

```powershell
git ls-files | Measure-Object
git ls-files 'apps/web/src/**/*' | Measure-Object
git ls-files 'apps/api/src/**/*' | Measure-Object
npm ls --workspaces --depth=0
npm run build:api
npm run test:api
npm run --workspace=web lint
npm run --workspace=web typecheck
npm run --workspace=web test
npm run --workspace=web check:colors
npm run build:web
npm run security:route-policy
```

If database-backed tests require `ATLAS_TEST_DATABASE_URL`, record them as blocked or run them against the documented disposable test database. Do not label an unrun integration suite as passing.

Capture the current router and flag references:

```powershell
rg -n '<Route|path=' apps/web/src/App.tsx
rg -n 'VITE_MAGIC_PATTERN_DESIGNS|magicPatternDesigns' apps/web apps/api infra scripts docs
```

Record Vite's emitted JS/CSS sizes from `apps/web/dist/assets` after the baseline build.

## 3. Create characterization and boundary guards first

Before route edits, add/retarget focused tests that prove:

- login, MFA setup, and MFA verification land on `/dashboard`;
- all 13 retained route patterns render behind the correct guards;
- current Dashboard/AppShell links match the route contract;
- K-1 review and Estate Map partnership handoffs preserve query state;
- Admin/User capabilities inside retained flows remain unchanged;
- the normalized route inventory matches `contracts/retained-surface.md`.

Add narrow static guards for the retired design flag and browser paths. The path guard must not confuse browser `/partnerships` with API `/v1/partnerships` or module directory names.

Run the focused route set before proceeding:

```powershell
npm run --workspace=web test -- App.test.tsx LoginPage.test.tsx MFAPage.test.tsx MFASetupPage.test.tsx MagicPatternDashboardPage.test.tsx InvestmentTrackerPage.test.tsx EntityDetail.test.tsx EstateMapPage.test.tsx
```

Update filenames if the implementation consolidates or retargets these tests.

## 4. Canonicalize live partnership links

Change retained transitions before removing redirects:

- `K1ReviewWorkspace` -> `/investment-tracker?...`
- Estate Map partnership/asset links -> `/investment-tracker?...`
- any current entity or K-1 link that still targets a legacy partnership route -> `/investment-tracker?...`
- map legacy `area` values to the canonical query contract.

Verify the selected partnership, workspace area, and tax year survive each handoff. Then scan active web source:

```powershell
rg -n -F '/partnership-tracker' apps/web/src --glob '!**/*.test.*'
rg -n -F '/partnership-aggregation' apps/web/src --glob '!**/*.test.*'
rg -n -F '/k1-tracker' apps/web/src --glob '!**/*.test.*'
```

Only implementation/module-name references still needed by the canonical Investment Tracker may remain; browser destinations may not.

## 5. Collapse to the current design

In one deletion group:

1. Render the current Dashboard unconditionally.
2. Make login and MFA completion use `/dashboard`.
3. Collapse `AppShell` to the current navigation/layout.
4. Collapse Login, Entities, Entity Detail, Investment Tracker, and any other conditional page to its current implementation.
5. Remove `featureFlags.ts`, its tests, `VITE_MAGIC_PATTERN_DESIGNS` environment/configuration, false-only components/branches/styles/assets, and sole-purpose tests.
6. Retarget shared-behavior tests before deleting legacy subjects.

Focused verification:

```powershell
rg -n 'VITE_MAGIC_PATTERN_DESIGNS|magicPatternDesigns' apps/web apps/api infra scripts docs
npm run --workspace=web typecheck
npm run --workspace=web test -- AppShell.test.tsx App.test.tsx LoginPage.test.tsx EntitiesPage.test.tsx EntityDetail.test.tsx InvestmentTrackerPage.test.tsx
npm run build:web
```

The active-tree scan must reach zero except historical numbered spec evidence.

## 6. Remove retired browser routes and exclusive closures

Remove the nine retired route registrations from `App.tsx`, then remove their exclusive pages, helpers, clients, tests, and imports as classified in the manifest:

```text
/upload
/partnerships
/partnerships/:id
/partnership-aggregation
/partnership-tracker
/k1-tracker
/admin/users
/admin/users/:id
/forbidden
```

Do not preserve redirect components. Do not delete shared partnership tracker source used by `/investment-tracker` merely because its directory retains an older name.

Run the route inventory and focused flow suites immediately after this group.

## 7. Recompute web reachability

Walk imports/exports from `apps/web/src/main.tsx` after the route/design roots are gone. Include `.ts`, `.tsx`, `.js`, and `.mjs`; resolve index/barrel files and type-only imports. Classify every unreachable item against:

- retained tests/fixtures;
- config/build inputs;
- CSS/assets referenced outside TypeScript;
- dynamic import/convention edges;
- current scripts and documentation.

Populate the exact candidate inventory in `pruning-manifest.md`. Remove only `HIGH` confidence closures, one group at a time, and rerun focused tests/reachability after each group.

Useful scans:

```powershell
rg -n 'from |import\(|export .* from' apps/web/src
rg -n 'src/|apps/web|VITE_|tailwind|postcss|vite' apps/web scripts infra package.json
git ls-files apps/web/src
```

## 8. Map and prune API consumers

Enumerate registered routes from `apps/api/src/app.ts` and `apps/api/src/routes/index.ts` through every route module. For each method/pattern, record:

- retained web-client callers;
- intra-API/shared-service callers;
- worker/scheduler/Terraform/package/documentation callers;
- route-protection policy;
- `RETAIN`, `REMOVE`, or `DEFER` decision.

Priority candidates include the deferred direct `/v1/k1-tracker` contract and user-management APIs whose UI has been removed. Preserve shared calculations/types and protected admin operations used by Plaid scheduling, authentication, or Spec 027 controls.

Useful scans:

```powershell
rg -n '\.(get|post|put|patch|delete)\(' apps/api/src/app.ts apps/api/src/modules
rg -n 'authenticatedFetch\(|request<|fetch\(' apps/web/src
rg -n 'dist/scripts|dist/workers|/health|readiness' package.json apps infra scripts docs
npm run security:route-policy
```

For each approved API deletion group:

1. Remove route registration.
2. Remove its exclusive handler/schema/service/repository/type closure.
3. Remove or retarget sole-purpose tests.
4. Build and run focused module tests.
5. Rerun route-policy coverage and recompute the consumer matrix.

## 9. Remove unused dependencies and configuration

After source closures are final, identify direct packages, aliases, scripts, environment entries, and documentation with no consumer. Verify imports, plugins/config, scripts, peer requirements, optional platform packages, image packaging, and Terraform/deploy references.

Update manifests and regenerate the lockfile with npm rather than editing lock entries by hand:

```powershell
npm install --package-lock-only
npm ci
npm ls --workspaces --all
npm run build:api
npm run build:web
```

Do not remove Linux optional bindings solely because they are absent on Windows.

## 10. Verify protected system roots

Confirm all existing migrations remain byte-for-byte unchanged from the cleanup baseline:

```powershell
git diff --name-only $cleanupBase -- apps/api/src/infra/db/migrations
```

The command must produce no paths.

Verify concrete operational entries:

```powershell
rg -n 'run-plaid-refresh|run-market-price-refresh|k1-extraction-worker|run-k1-extraction-reconciler' apps package.json infra scripts docs
npm run security:audit:runtime
npm run security:route-policy
npm run security:cost-envelope
```

When Terraform-facing route/task/configuration code changes:

```powershell
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false
terraform -chdir=infra/aws/terraform validate
```

## 11. Run final verification

```powershell
npm run build:api
npm run test:api
npm run --workspace=web lint
npm run --workspace=web typecheck
npm run --workspace=web test
npm run --workspace=web check:colors
npm run build:web
npm run security:audit:runtime
npm run security:route-policy
npm run security:cost-envelope
npm ls --workspaces --all
git diff --check
git status --short
```

Also run the retained browser route matrix for both Admin and User roles and the appropriate database/provider-backed focused suites.

## 12. Reconcile the manifest and final deltas

Before completion, `pruning-manifest.md` must contain:

- exact baseline commit and known failures;
- every candidate decision and evidence;
- API consumer matrix;
- exact files/routes/dependencies/scripts removed per group;
- protected and deferred surfaces;
- verification command and actual result;
- tracked production file/line/byte deltas;
- direct dependency delta;
- baseline/final emitted JS/CSS sizes;
- every changed/new path classified.

Review the final diff from the recorded baseline:

```powershell
git diff --stat $cleanupBase
git diff --name-status $cleanupBase
git diff --check $cleanupBase
```

Do not mark the feature complete while a retained flow regresses, a route/API consumer is unclassified, a migration changed, or a final failure is not tied to an unchanged recorded baseline.
