# Phase 0 Research: Prune Unreachable Product Flows

## Decision 1: Use the dashboard navigation closure as the product boundary

**Decision**: Define the supported browser product as the transitive closure of routes reachable from the current authenticated dashboard, including the Magic AppShell sidebar, dashboard cards/quick actions, and contextual links from every retained page. Add `/`, `/mfa/setup`, and `/mfa` as required pre-authentication roots.

The resulting explicit route contract is:

```text
/
/mfa/setup
/mfa
/dashboard
/investment-tracker
/liquidity
/entities
/entities/:id
/estate-maps
/tic-registry
/reports
/k1
/k1/:id/review
```

The wildcard fallback remains router infrastructure rather than a product destination.

**Rationale**:

- `MagicPatternDashboardPage` links directly to Investment Tracker, K-1, Entities, Liquidity, and Reports.
- `AppShell` adds Estate Maps and TIC Registry to the same authenticated navigation surface.
- Entity, K-1, estate-map, and investment screens add record-level transitions that must be included recursively.
- This definition matches the user's request and replaces the ambiguous prior rule that both design-flag graphs were products.

**Alternatives considered**:

- Keep every registered route: rejected because registration includes placeholders, direct-only pages, and compatibility redirects that the user explicitly wants pruned.
- Keep only the four dashboard cards: rejected because sidebar destinations and contextual record workflows are visibly reachable from the dashboard product.
- Use static imports alone: rejected because navigation strings, query state, scripts, workers, migrations, and Terraform entries create non-import edges.

## Decision 2: Make the current dashboard design unconditional

**Decision**: Retire `VITE_MAGIC_PATTERN_DESIGNS` and the `magicPatternDesigns` branch throughout the web application. The current Magic Patterns dashboard, login, shell, entities, entity detail, Investment Tracker, and related page variants become the only implementation. Login and MFA completion always land on `/dashboard`.

**Rationale**:

- `/dashboard` renders the actual dashboard only when the flag is true; the false branch redirects to `/liquidity`.
- The repository environment example currently defaults the flag to false, which conflicts with treating Dashboard as the current product.
- `AppShell` carries two navigation systems, two responsive behaviors, and two visual structures solely to support this toggle.
- Page-level branches keep legacy entity, detail, login, partnership, and placeholder implementations reachable at compile time even when they are not part of the current product.

**Alternatives considered**:

- Keep the flag but set its default to true: rejected because the unused false branch would continue to keep the duplicate implementation closure alive.
- Delete only obviously unused leaf files: rejected because the major size/complexity source is the deliberate dual-root graph.
- Rename Magic components before pruning: deferred unless a rename materially improves clarity; large rename-only diffs would obscure deletion evidence.

## Decision 3: Canonicalize all partnership UI state under Investment Tracker

**Decision**: Use `/investment-tracker` as the sole partnership browser route. Preserve the current `partnership`, `area`, and `year` query parameters and translate current legacy area aliases where needed. Update retained K-1 review and Estate Map links before deleting `/partnership-tracker` and other legacy partnership routes.

**Rationale**:

- `PartnershipTrackerPage` already redirects the current design from `/partnership-tracker` to `/investment-tracker` while preserving `location.search`.
- `MagicPatternInvestmentTrackerPageContent` already owns portfolio aggregation, partnership selection, workspace navigation, record creation, area selection, and tax-year state.
- K-1 review currently navigates to `/partnership-tracker?...`; Estate Map links do the same. These are live transitions, but their destination is a redundant redirect rather than a distinct current screen.
- The legacy `/partnership-aggregation` page duplicates portfolio behavior that is embedded in Investment Tracker.

**Alternatives considered**:

- Retain `/partnership-tracker` as a permanent alias: rejected because the user asked to remove stale/duplicate flow code and only one canonical route is needed.
- Make `/partnership-tracker` canonical and remove `/investment-tracker`: rejected because Dashboard and current sidebar expose Investment Tracker, and the current page already contains the complete workflow.
- Preserve old routes as redirects: rejected because compatibility aliases would remain registered surface and weaken the route-boundary guard.

## Decision 4: Remove nine direct-only or legacy browser routes

**Decision**: Remove these registered browser route patterns with no compatibility redirects:

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

**Rationale**:

- `/upload` is a Coming Soon placeholder; live uploads occur in `/k1`.
- `/partnerships`, `/partnerships/:id`, and `/k1-tracker` only redirect to the legacy partnership route.
- `/partnership-aggregation` is a standalone legacy presentation of behavior already available in the current Investment Tracker.
- `/partnership-tracker` is a redirect in the current design and a legacy page only in the retired design.
- `/admin/users` and `/admin/users/:id` have no link in the current dashboard/AppShell product and are a direct-only UI closure.
- `/forbidden` has no live navigation consumer; access denial is already rendered inline by route guards where needed.

**Alternatives considered**:

- Keep admin pages because the session contains an Admin role: rejected as a route criterion; Admin permissions inside retained product flows stay live, while the unlinked user-management UI is outside the requested surface.
- Remove all backend admin code with the pages: rejected; Plaid scheduler, protection controls, authentication administration, and other non-UI operational consumers must be classified independently.

## Decision 5: Treat non-browser operational entries as protected roots

**Decision**: Protect these classes until their consumers are explicitly retired:

- API server, authentication/session/MFA, authorization, CSRF/CORS, abuse protection, audit, liveness, and readiness.
- PostgreSQL migration discovery and all existing migrations.
- K-1 extraction worker, reconciliation task, S3/SQS/BDA/Bedrock integrations, and the offline stub used by retained K-1 flows.
- Plaid and market-price scheduled tasks used by current Liquidity/Dashboard behavior.
- Terraform ECS/worker/scheduler commands, deployment scripts, security checks, and documented operator commands.
- Authoritative test fixtures and shared types used by retained flows.

**Rationale**:

- Static scanning found Terraform commands for `run-plaid-refresh`, `run-market-price-refresh`, `k1-extraction-worker`, and `run-k1-extraction-reconciler`; these files are live without browser imports.
- API migrations are loaded by convention and documented as the deployment schema authority.
- Current Spec 027 work adds route policy, quota, kill-switch, and infrastructure controls across the API; cleanup must preserve those controls for every route that remains.

**Alternatives considered**:

- Delete everything not called by web clients: rejected because it would remove scheduled work, workers, health probes, deployment code, and security controls.
- Keep every operational-looking file without proof: rejected; each must have a concrete package, Terraform, documentation, or runtime consumer edge.

## Decision 6: Prune backend interfaces by consumer closure, not by name

**Decision**: Build a route-to-consumer matrix for all registered API routes. A route is retained only when it serves a retained browser flow or protected system root. An unused route may be removed with its exclusive handler/schema/repository/type/test closure; shared domain services remain.

The direct `/k1-tracker` API is a priority candidate from Spec 025's deferred list, but its shared calculations and types are protected where Investment Tracker, K-1 review, or partnership tracking uses them. Admin user-management APIs are candidates after external/operator consumers are checked; scheduler and protection-control endpoints are protected.

**Rationale**:

- Browser and API route names overlap: browser `/partnerships` is legacy, but API `/partnerships/...` calls remain in current Reports, entity, assets, and investment workflows.
- The current API registers auth, admin, dashboard, K-1, review, partnership, Plaid, reports, TIC, K-1 tracker, and partnership-tracker modules under `/v1`.
- Module-level deletion would be unsafe because current features compose repositories and calculation services across those boundaries.

**Alternatives considered**:

- Remove whole API modules corresponding to removed browser routes: rejected because module names are not consumer evidence.
- Keep all APIs as possible external contracts: rejected because the user explicitly authorized reducing the product to current flows; uncertain external consumers are handled as `DEFER`, not assumed forever.

## Decision 7: Use layered reachability evidence and deletion groups

**Decision**: Classify candidates using these edge types:

1. browser route and navigation edges;
2. static and type-only imports/exports;
3. web-client-to-API route edges;
4. test/fixture contract edges;
5. package-script, worker, scheduler, Terraform, deployment, and documentation edges;
6. convention/dynamic discovery edges;
7. retained replacement edges.

Delete in cohesive groups, recomputing reachability after each group. A missing static importer is necessary but not sufficient evidence.

**Rationale**:

- Current dynamic imports are test isolation/helpers rather than a production plugin loader, but migration and infrastructure convention edges remain important.
- Spec 025 demonstrated that deleting roots exposes a much smaller, more accurate second-order unreachable set.
- Grouped deletion keeps route changes, source removal, dependency updates, and tests reviewable and reversible.

**Alternatives considered**:

- Add a new unused-code dependency such as Knip solely for this pass: rejected initially because the existing TypeScript compiler plus a small repository-local import walk and manual non-import edge checks are sufficient; adding tooling while reducing dependencies needs separate justification.
- One large deletion: rejected because failures would not identify which product closure was broken.

## Decision 8: Establish route and stale-surface guards

**Decision**: Add a browser route inventory contract test and narrow static guards for the retired design flag and browser routes. Keep Spec 027's API route-policy coverage authoritative for the reduced API route set.

**Rationale**:

- The retained boundary is now a product decision, so route additions/removals should be deliberate and reviewable.
- A route test catches router registration drift; static checks catch dormant compatibility helpers and navigation strings that router tests alone miss.
- Existing security route coverage should fail if a retained/new API route lacks protection metadata.

**Alternatives considered**:

- Rely on bundle success: rejected because a bundle can compile with hidden direct routes or stale navigation.
- Snapshot the whole router implementation: rejected because it is brittle; compare normalized path patterns instead.

## Decision 9: Record size and regressions from the implementation baseline

**Decision**: Capture file counts, source lines, direct dependencies, production build output, and existing test/lint/typecheck failures immediately before implementation. Require a net reduction in production files, source lines, and browser bundle size, while treating unchanged baseline failures separately from regressions.

**Rationale**:

- The planning worktree contains substantial uncommitted Spec 027 changes, so today's counts are context, not a valid implementation baseline.
- Planning snapshot: 988 tracked files, including 323 under `apps/web`, 351 under `apps/api`, and 10 under `packages/types`; 623 tracked source-like files contain approximately 86,777 lines. More narrowly, `apps/web/src` has 284 tracked files and `apps/api/src` has 202.
- Spec 025 already removed 56 files and four web dependencies; this iteration targets the remaining architectural duplication and direct-only interfaces.

**Alternatives considered**:

- Commit to a fixed percentage reduction before candidate proof: rejected because safety and consumer evidence determine the valid boundary.
- Require every full suite to be green despite known baseline failures: rejected because that can mix unrelated repair work into pruning; no new failure is the gate.

## Resolved Unknowns

- **Current design**: the dashboard/Magic Patterns experience named by the user.
- **Homepage meaning**: `/` login plus the authenticated `/dashboard` home.
- **Dashboard reachability**: dashboard links, current sidebar, and recursive contextual navigation.
- **Legacy redirects**: removed, not preserved.
- **Operational code**: retained only with a concrete protected-root consumer.
- **Database migrations**: immutable and excluded from deletion.
- **Execution ordering**: implement only after Spec 027 is captured on a clean baseline; planning does not switch branches or alter its in-progress code.
