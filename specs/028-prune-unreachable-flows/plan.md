# Implementation Plan: Prune Unreachable Product Flows

**Branch**: `028-prune-unreachable-flows` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-prune-unreachable-flows/spec.md`

## Summary

Reduce Atlas to one current browser product: the Magic Patterns login/dashboard experience and the complete route closure reachable from its dashboard, sidebar, and contextual links. Make Dashboard unconditional, canonicalize partnership work under `/investment-tracker`, remove nine legacy/direct-only browser route patterns and their exclusive source/test/configuration closures, then recompute web and API reachability to remove unused endpoints, handlers, types, scripts, and dependencies. Preserve authentication/MFA, role behavior inside retained screens, Spec 027 security controls, health/readiness, migrations, K-1 workers/providers, Plaid/market schedulers, and other operational roots with concrete consumers. Record every decision and actual size delta in a pruning manifest and enforce the smaller route boundary with automated guards.

Implementation must begin from a clean commit containing the completed Spec 027 work. This planning run does not switch away from or modify the current uncommitted Spec 027 implementation.

## Technical Context

**Language/Version**: Node.js 22+; API TypeScript 5.7; web TypeScript 6.x; JavaScript ESM; PowerShell/Terraform tooling
**Primary Dependencies**: npm workspaces, Fastify 5, React 19, React Router 7, Vite 8, Tailwind CSS 3.4, TanStack Query, Framer Motion, PostgreSQL `pg`, AWS SDK v3, Plaid, ExcelJS/PDF tooling
**Storage**: Existing PostgreSQL and immutable SQL migrations; S3/SQS/BDA for K-1 ingestion; current browser local storage for estate-map/navigation state; no new storage
**Testing**: Vitest, React Testing Library, ESLint, TypeScript builds/typecheck, Vite production build, color governance, Spec 027 API route-policy/security checks, npm dependency checks, Terraform fmt/validate, static reachability/route guards, Admin/User route matrix
**Target Platform**: React browser application; Fastify API and worker processes on Linux ECS Fargate; PostgreSQL RDS; AWS CloudFront/ALB/S3/SQS/Bedrock/Plaid/market schedulers; Windows local development
**Project Type**: TypeScript npm-workspace web application and API monorepo with shared contract types and Terraform-managed AWS infrastructure
**Performance Goals**: Preserve current retained-flow latency and behavior; reduce emitted browser JavaScript and tracked production source surface from the implementation baseline; introduce no runtime reachability framework
**Constraints**: One current UI only; no compatibility redirects for retired browser paths; keep Admin/User permissions within retained flows; no migration edits/deletions; no loss of Spec 027 route policies/admission controls; dynamic/operator entries require explicit checks; existing baseline failures may not worsen
**Scale/Scope**: 22 current explicit browser route patterns plus wildcard become 13 retained patterns plus wildcard; nine browser patterns retire. Planning snapshot has 988 tracked files, 284 tracked files under `apps/web/src`, 202 under `apps/api/src`, and about 86,777 lines across 623 tracked source-like files. Final deletion count is evidence-driven and recorded at implementation time.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template and defines no enforceable project-specific principles. The specification, prior pruning safety rules, and current repository conventions therefore define these gates:

1. **PASS - Explicit product boundary**: The retained 13-route contract is derived from the dashboard/sidebar/contextual navigation graph and includes required pre-auth routes.
2. **PASS - Evidence before deletion**: Every candidate requires applicable route, import, client, test, script, infrastructure, convention, and operator evidence.
3. **PASS - Canonical replacement first**: Live partnership links move to Investment Tracker before redirect/legacy routes are removed.
4. **PASS - Security preservation**: Authentication/MFA, role controls, CSRF/CORS, audit, and Spec 027 abuse/cost protections are protected system roots.
5. **PASS - Data-history preservation**: Existing SQL migrations are immutable; persisted schemas are not rewritten to make cleanup appear larger.
6. **PASS - Operational-entry preservation**: Workers, schedulers, health probes, provider integrations, deploy scripts, and fixtures remain when a concrete consumer exists.
7. **PASS - Contract accountability**: Browser and API route removals are explicit breaking decisions in the manifest, not incidental import cleanup.
8. **PASS - Regression accounting**: Baseline failures are captured; only passes, improvements, or exactly unchanged baseline failures are acceptable.
9. **PASS - Measurable reduction**: Final tracked production files/lines, dependencies, and bundle output are compared with a named implementation baseline.

### Post-Phase 1 re-check

**PASS** after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/retained-surface.md](./contracts/retained-surface.md), and [quickstart.md](./quickstart.md).

- The route contract is exact and testable.
- Query-state migration preserves current K-1/entity/estate-map handoffs without legacy routes.
- API deletion requires a route-to-consumer matrix and preserves shared implementations.
- The model distinguishes dashboard flows from operational system roots and makes `DEFER` the default for uncertainty.
- No new runtime subsystem or dependency is introduced.

## Product Boundary

```text
Login / MFA
  -> Dashboard
      |-- Investment Tracker
      |    `-- partnership workspace (query state)
      |         `-- K-1 queue/review
      |-- Liquidity
      |-- Entities -> Entity Detail -> Investment Tracker
      |-- Estate Maps -> Investment Tracker
      |-- TIC Registry
      |-- Reports
      `-- K-1 Workspace -> K-1 Review -> Investment Tracker

Protected non-browser roots
  |-- auth/session/security + health/readiness
  |-- PostgreSQL migration discovery
  |-- K-1 worker/reconciler/BDA/stub/S3/SQS
  |-- Plaid and market-data schedulers
  `-- deployment, Terraform, audit, and security commands
```

### Retained browser patterns

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

### Retired browser patterns

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

The wildcard fallback remains but does not preserve retired-route behavior.

## Project Structure

### Documentation (this feature)

```text
specs/028-prune-unreachable-flows/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- retained-surface.md
|-- tasks.md                         # created later by /speckit.tasks
`-- pruning-manifest.md              # created/filled during tasks + implementation
```

### Source Code (repository root)

```text
apps/web/
|-- .env.example                     # remove retired design flag
|-- package.json                     # remove dependencies proven unused after pruning
`-- src/
    |-- main.tsx                     # production reachability root
    |-- App.tsx                      # exact retained route inventory; remove redirect/admin/placeholder routes
    |-- auth/                        # retain session/MFA; remove design-dependent landing logic
    |-- config/featureFlags.ts       # remove
    |-- components/shared/AppShell.tsx
    |                                  # collapse to current navigation/layout
    |-- pages/
    |   |-- LoginPage.tsx            # current login only
    |   |-- MFAPage.tsx              # always land on Dashboard
    |   |-- MFASetupPage.tsx         # always land on Dashboard
    |   |-- magic-patterns/          # current dashboard/entity/login implementations; retain or simplify names
    |   |-- InvestmentTrackerPage.tsx
    |   |-- LiquidityPage.tsx
    |   |-- EntitiesPage.tsx
    |   |-- EntityDetail.tsx
    |   |-- EstateMapPage.tsx
    |   |-- TicRegistryPage.tsx
    |   |-- ReportsPage.tsx
    |   |-- K1Dashboard.tsx
    |   `-- K1ReviewWorkspace.tsx
    `-- features/
        |-- investment-tracker/      # canonical partnership browser flow
        |-- partnership-tracker/     # retain shared current workspace/API code; prune legacy-only presentation
        |-- partnerships/            # retain current clients/entity/assets consumers; prune dead closures
        |-- dashboard/
        |-- reports/
        |-- k1/
        |-- k1-tracker/              # retain shared current form/calculation UI; classify direct-only closure
        |-- review/
        |-- estate-map/
        `-- tic-registry/

apps/api/
|-- package.json                     # protected server/worker/scheduler commands
|-- src/
|   |-- app.ts                       # retain security + health; reduced route registry
|   |-- routes/index.ts              # remove only approved unconsumed registrations
|   |-- infra/db/migrations/         # protected, immutable
|   |-- workers/                     # protected with Terraform/package consumers
|   |-- scripts/                     # scheduler/operator consumer audit
|   `-- modules/
|       |-- abuse-protection/        # protected Spec 027 controls
|       |-- auth/                    # protected login/session/MFA
|       |-- dashboard/
|       |-- k1/ and review/
|       |-- partnership-tracker/     # current Investment Tracker backend
|       |-- k1-tracker/              # split shared calculations from direct unused route contract
|       |-- partnerships/
|       |-- reports/
|       |-- plaid/ and market-data/
|       |-- tic-registry/
|       `-- admin/                   # retain operational roots; classify direct user-management closure
`-- tests/                            # remove sole-purpose tests; retain/retarget current contracts

packages/types/src/                  # remove only types exclusive to approved retired interfaces
infra/aws/                           # protected workers/schedulers/security; update only removed config/routes
scripts/                             # protected deploy/security entries; remove only no-consumer commands
package-lock.json                    # regenerate after dependency removal
```

**Structure Decision**: Keep the existing monorepo, deployment topology, database, and runtime modules. Consolidate the browser product at its current route/page roots, then remove dead closures in place. Do not perform broad directory renames or architecture moves in the same deletion groups; shared code may retain historical directory names when it remains live.

## Phase 0: Research Outcomes

1. The current dashboard product is the Magic Patterns branch. The false flag branch redirects `/dashboard` to Liquidity and keeps a duplicate shell/navigation/page graph alive.
2. Dashboard cards and quick actions expose Investment Tracker, K-1, Entities, Liquidity, and Reports; the current AppShell adds Estate Maps and TIC Registry.
3. Partnership Tracker is already a redirect to Investment Tracker in the current design. K-1 review and Estate Map still target the redirect and must be migrated first.
4. Nine direct-only, placeholder, standalone legacy, or redirect browser patterns can be retired under the requested boundary.
5. Direct Admin user-management pages are outside dashboard reachability, but Admin role permissions in retained screens remain current behavior.
6. Browser route names cannot drive API deletion: current flows still call many `/v1/partnerships` interfaces, and current Investment Tracker composes code under the `partnership-tracker` and `k1-tracker` module names.
7. Terraform and operator documentation directly consume Plaid refresh, market refresh, K-1 worker, and reconciliation scripts; migrations are convention-loaded. They are protected roots despite no web import.
8. Spec 025's remaining deferred direct `/k1-tracker` API surface is a priority candidate, but shared calculation/repository code must be separated by consumer evidence.
9. The current planning snapshot is not the implementation baseline because Spec 027 has extensive uncommitted source, test, dependency, and Terraform work.
10. A dependency-free import walk plus route/client/script/infrastructure scans is sufficient; no new reachability package is required.

## Phase 1: Design Outcomes

- [Retained surface contract](./contracts/retained-surface.md) fixes the exact browser routes, route removals, query-state mapping, current behaviors, system roots, API decision rules, and completion gates.
- `RetainedFlow` and `SystemRoot` prevent browser-only reachability from deleting required operational code.
- `ApiRouteConsumerRecord` requires every registered route to map to a current web/system consumer or explicit remove/defer decision.
- `PruningCandidate` and `DeletionGroup` provide evidence, rollback, and verification boundaries.
- Planned group order migrates live links first, retires the design branch/routes second, then recomputes and prunes web/API/dependency closures.
- Route inventory and stale-surface guards prevent silent reintroduction.
- The quickstart separates baseline capture, characterization, each deletion stage, operational validation, and final diff reconciliation.

## Implementation Sequence

1. **Establish baseline**: finish/capture Spec 027, start Spec 028 from a clean commit, create `pruning-manifest.md`, record route/API/source/dependency/bundle inventory and all existing failures.
2. **Characterize retained flows**: add the exact route inventory test; cover Dashboard/AppShell links, Admin/User access, login/MFA landings, Investment Tracker query state, and K-1/estate/entity handoffs.
3. **Canonicalize partnership navigation**: replace live `/partnership-tracker` destinations with `/investment-tracker`, preserve query state, and verify before removing redirects.
4. **Collapse the design branch**: make current login/dashboard/shell/entities/detail/investment pages unconditional; remove the feature flag, false-only branches, environment/config entries, and sole-purpose tests.
5. **Remove retired browser routes**: delete nine registrations and their exclusive page/helper/test closures without compatibility redirects.
6. **Recompute/prune web closure**: walk from `main.tsx`, check test/config/asset/dynamic consumers, remove high-confidence groups, and rerun focused reachability/tests after each group.
7. **Build API consumer matrix**: map every registered HTTP method/pattern to retained web clients or system roots and its Spec 027 protection policy.
8. **Prune unused API closures**: start with direct K-1 tracker and user-management candidates; separate shared services/types; remove only approved endpoint/handler/schema/repository/test closures.
9. **Prune dependencies/config/docs**: remove newly unused packages, aliases, scripts, flags, and stale guidance; regenerate lockfile and validate all workspace/platform requirements.
10. **Verify system roots**: prove migrations unchanged and verify auth/security, health/readiness, K-1 worker/reconciler, Plaid/market schedulers, Terraform, deploy, and security commands.
11. **Full verification**: run API/web builds and suites, lint/typecheck/color checks, route guards, security checks, npm validation, Terraform validation where applicable, Admin/User route matrix, and diff hygiene.
12. **Finalize evidence**: recompute reachability, classify all newly exposed candidates, record actual file/line/byte/dependency/bundle deltas, and reconcile every diff path in the manifest.

## Rollback and Review Boundaries

- Keep each deletion group independently reviewable. If a retained flow fails, restore the affected group or reclassify its candidate rather than adding a compatibility shim.
- Canonical link migration is committed/verified before redirect removal so query-state regressions are attributable.
- API route removal and exclusive implementation deletion remain in the same group; shared code is never removed merely to satisfy a route count.
- Dependency removal occurs after source pruning so a failed clean install/build identifies the actual package boundary.
- Migrations are not a rollback mechanism for source cleanup and remain untouched.

## Complexity Tracking

No constitution violation or new runtime complexity is introduced. The route/API consumer matrix, manifest, and guards are maintenance evidence. Keeping non-browser system roots is necessary to operate the retained product; requiring concrete consumer edges prevents that protection from becoming a blanket excuse to keep stale code.
