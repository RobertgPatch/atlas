# Retained Product Surface and Pruning Safety Contract

This contract is the review and test authority for Spec 028. Implementation may simplify file placement, but it may not add a browser route or remove a retained behavior without updating the feature specification and this contract intentionally.

## 1. Browser Route Contract

### Retained explicit routes

| Pattern | Access | Canonical responsibility | Required transitions |
|---|---|---|---|
| `/` | public/pre-auth | Current login/home entry | Direct session, MFA setup, MFA challenge, Dashboard |
| `/mfa/setup` | public flow token | MFA enrollment | Login on missing token; Dashboard on success |
| `/mfa` | public flow token | MFA verification | Login on missing token; Dashboard on success |
| `/dashboard` | authenticated | Current portfolio/dashboard home | Investment Tracker, Liquidity, Entities, Reports, K-1, Estate Maps, TIC Registry through cards/sidebar |
| `/investment-tracker` | authenticated | Portfolio aggregation and partnership record workspace | Query-state navigation, K-1 queue/review, Estate Maps as exposed by current controls |
| `/liquidity` | authenticated | Consolidated holdings, connected accounts, valuation and Plaid actions | Dashboard/sidebar destinations only |
| `/entities` | authenticated | Entity directory and Admin-authorized entity management | Entity detail |
| `/entities/:id` | authenticated | Current entity detail and related partnership/report data | Entity directory; selected partnership in Investment Tracker |
| `/estate-maps` | authenticated | Estate/ownership maps | Selected partnership in Investment Tracker |
| `/tic-registry` | authenticated | TIC properties, interests, and owners | Dashboard/sidebar destinations only |
| `/reports` | authenticated | Portfolio, asset-class, activity, and supported export/report actions | Dashboard/sidebar destinations only |
| `/k1` | authenticated | K-1 upload, ingestion queue, KPIs, and processing actions | K-1 review |
| `/k1/:id/review` | authenticated | K-1 review, mapping, issue resolution, approval/finalization | K-1 queue; selected partnership in Investment Tracker |

The router also retains one wildcard fallback. It is not an application flow and must not make a retired route behave as a compatibility alias.

### Retired routes

| Pattern | Current reason for existence | Required final state |
|---|---|---|
| `/upload` | Coming Soon placeholder | Unregistered; no redirect |
| `/partnerships` | Legacy compatibility redirect | Unregistered; no redirect |
| `/partnerships/:id` | Legacy compatibility redirect | Unregistered; no redirect |
| `/partnership-aggregation` | Standalone legacy aggregation page | Unregistered; current behavior remains under Investment Tracker |
| `/partnership-tracker` | Current-design redirect plus legacy-design page | Unregistered; all live links migrated |
| `/k1-tracker` | Legacy query-parameter redirect | Unregistered; no redirect |
| `/admin/users` | Direct-only user-management UI | Unregistered; API classified separately |
| `/admin/users/:id` | Direct-only user detail UI | Unregistered; API classified separately |
| `/forbidden` | Unused direct route | Unregistered; inline permission denial remains where required |

### Route inventory invariant

The normalized set of `<Route path>` values in `App.tsx` must equal:

```json
[
  "/",
  "/mfa/setup",
  "/mfa",
  "/dashboard",
  "/investment-tracker",
  "/liquidity",
  "/entities",
  "/entities/:id",
  "/estate-maps",
  "/tic-registry",
  "/reports",
  "/k1",
  "/k1/:id/review",
  "*"
]
```

Order is not contractual. The route test compares normalized membership and fails on additions or omissions.

## 2. Canonical Investment Tracker Query Contract

All current partnership deep links use `/investment-tracker`.

| Parameter | Type | Meaning | Rules |
|---|---|---|---|
| `partnership` | string | Selected partnership ID | Omit for portfolio view |
| `area` | enum | Selected workspace area | `overview`, `capital-activity`, `valuations`, `k1-history`, or `underlying-assets` |
| `year` | integer | Selected K-1 tax year | 1900-2100; meaningful for `k1-history` |

Legacy area aliases are accepted only as input normalization within the current page if retained links/data can still produce them:

| Legacy value | Canonical value |
|---|---|
| `cash-activity` | `capital-activity` |
| `k1` | `k1-history` |
| `capital` | `valuations` |
| `assets` | `underlying-assets` |

No browser redirect route is retained for normalization.

## 3. Retained Flow Contract

### Authentication and session

- Password login continues to return either a session, `MFA_ENROLL_REQUIRED`, or `MFA_REQUIRED` according to the server-owned MFA setting.
- No pre-MFA authenticated cookie is created.
- Successful direct login, enrollment, or verification navigates to `/dashboard`.
- Session bootstrap, expiry handling, logout, Admin/User role data, and unsafe-request protections remain.

### Dashboard

- Renders the current dashboard without `VITE_MAGIC_PATTERN_DESIGNS`.
- Keeps portfolio KPIs, liquidity summary, K-1 status/review actions, entity counts/issues, recent activity, refresh, Reports action, module cards, quick actions, and current empty/error/loading states.

### Investment Tracker

- Keeps portfolio grouping/sorting/filtering, partnership create/edit/delete subject to roles, record workspace, overview, capital activity, valuations, K-1 history, underlying assets, query-state deep links, and current calculations.
- Shared source may remain under `features/partnership-tracker` until a later rename; directory naming is not evidence of obsolescence.

### Liquidity

- Keeps consolidated holdings, Plaid account selection/link/refresh behavior, current market values and cache/freshness behavior, allocation and holdings display, and permissions.

### Entities and Estate Maps

- Keep entity directory/detail, Admin-authorized mutations, current partnership/report previews, map persistence, relationship editing, and canonical Investment Tracker handoffs.

### TIC Registry

- Keeps properties, interests, owners, allocation behavior, Admin-authorized mutations, and existing validation.

### Reports

- Keeps the current portfolio summary, asset-class summary, activity detail, filters, Admin-authorized edits/undo, and supported export formats.
- Client functions/components for reports not exposed by the current Reports or Liquidity pages are candidates, not automatically retained.

### K-1

- Keeps upload, presign/completion, batch/queue, status/KPIs, PDF preview, reparse/retry/cancel/delete where exposed, entity/partnership mapping, corrections, issue resolution, match, approval/finalization, BDA/stub extraction, and canonical Investment Tracker handoff.

## 4. Protected System Root Contract

| Root | Concrete authority | Protected behavior |
|---|---|---|
| API server | `apps/api/src/server.ts`, package start commands | Fastify application for retained interfaces |
| Liveness/readiness | `/health`, `/internal/readiness`, Terraform/load-balancer/deploy probes | Cheap liveness and database readiness split |
| Authentication/security | auth routes, session middleware, Spec 027 abuse-protection registration/tests | Login/MFA/session/CSRF/CORS/rate/quota/route policy behavior |
| Database migrations | startup migration discovery and deployment docs | Every existing SQL migration remains unchanged |
| K-1 worker | API package commands and Terraform `k1_ingestion` task definitions | Queue consumption, BDA/stub extraction, retry/reconciliation |
| Plaid refresh | Terraform scheduler and documented `run-plaid-refresh` command | Current Liquidity refresh/freshness behavior |
| Market refresh | Terraform scheduler and documented `run-market-price-refresh` command | Current Dashboard/Liquidity valuation behavior |
| Deployment/security scripts | root package commands, Terraform modules, deployment docs | Deploy, audit, route-policy, cost-envelope, bounded-abuse checks |
| Authoritative fixtures | retained tests and explicit fixture directories | Stable regression data |

An operational file not covered by one of these concrete authorities remains a pruning candidate.

## 5. API Consumer Contract

Every registered route must have one row in the implementation manifest's API consumer matrix with:

```text
METHOD + canonical route pattern
registration module
Spec 027 protection policy
retained web flow consumer(s)
protected system-root consumer(s)
decision: RETAIN | REMOVE | DEFER
implementation closure
verification
```

Decision rules:

1. `RETAIN` when one or more retained flow/system consumers exist.
2. `REMOVE` only when all consumer columns are empty, repository/documentation scans are complete, and the contract break is approved in a deletion group.
3. `DEFER` when an external or dynamic consumer cannot be ruled out.
4. Shared implementation remains when any retained route depends on it.
5. Every retained external route must continue to satisfy Spec 027 route-protection coverage.

Special cases:

- Browser `/partnerships` retirement says nothing by itself about API `/v1/partnerships`.
- The direct `/v1/k1-tracker` route family is evaluated independently from K-1 tracker calculations/types used inside retained partnership workflows.
- Admin user-management endpoints are candidates; Plaid scheduler and abuse-protection control endpoints are protected operational surfaces.
- Development-only routes require a current documented/test bootstrap consumer or are candidates.

## 6. Deletion Evidence Contract

A deletion group is eligible only when all applicable checks are recorded:

- no retained browser route or navigation edge;
- no retained static/type import or barrel export;
- no retained web API client call;
- no retained test protecting a current public contract;
- no package script, worker, scheduler, Terraform, deploy, or operator entry;
- no convention-based discovery requirement;
- no protected migration or authoritative fixture;
- replacement authority identified when behavior moved;
- focused tests pass after removal;
- reachability recomputed before the next group.

Tests may be removed only when their subject is removed. Tests that protect shared retained behavior must be retargeted first.

## 7. Static Guard Contract

Outside historical `specs/024-*`, `specs/025-*`, and `specs/028-*` documentation:

- zero `VITE_MAGIC_PATTERN_DESIGNS` references;
- zero `magicPatternDesigns` identifiers;
- no active web-router registration for a retired route;
- no active Link/navigate/href destination using a retired browser route;
- no reintroduced legacy navigation array/branch;
- no removed path imported by source or tests.

The `/partnerships` and `/k1-tracker` text guards must distinguish browser destinations from `/v1` API route/client strings and shared type/module directory names.

## 8. Completion Contract

Completion requires:

- all route inventory checks pass;
- all retained flows have focused coverage;
- every API route is mapped to a consumer or intentional removal/defer decision;
- API/web builds pass;
- no new full-suite, lint, typecheck, color, dependency, security, or Terraform regression;
- no migration diff;
- exact final deletion inventory and actual size/bundle deltas in `pruning-manifest.md`;
- no unclassified changed path or candidate.
