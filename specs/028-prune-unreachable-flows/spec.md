# Feature Specification: Prune Unreachable Product Flows

**Feature Branch**: `028-prune-unreachable-flows`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Clean up and remove stale, unused, or unreachable code. Keep the working homepage, dashboard, liquidity, investment tracker, TIC registry, entities, and every other flow currently reachable from the dashboard."

## Scope Decision

The current product surface is the Magic Patterns dashboard experience. The repository's `VITE_MAGIC_PATTERN_DESIGNS=false` branch, placeholder pages, direct-only legacy pages, and compatibility routes are intentionally retired by this feature. The retained browser surface is the transitive navigation closure of the authenticated dashboard, plus the login/MFA routes required to reach it.

Authentication internals, authorization, health/readiness, background workers, migrations, deployment/infrastructure, and provider integrations used by retained flows are protected system roots even though they are not dashboard pages. An API, script, or module outside the browser graph may be removed only after repository, infrastructure, scheduler, worker, and operator consumers are also ruled out.

## User Scenarios & Testing

### User Story 1 - Keep the Current Dashboard Product (Priority: P1)

As a user, I want every working destination exposed by the current dashboard and its navigation to remain available, so repository cleanup does not break the product I use.

**Why this priority**: The dashboard is the authoritative product entry point and defines the supported user-facing surface.

**Independent Test**: Sign in, open `/dashboard`, and exercise the retained route matrix for Dashboard, Investment Tracker, Liquidity, Entities and entity detail, Estate Maps, TIC Registry, Reports, K-1 workspace, and K-1 review. Follow contextual links between those screens and verify there are no legacy-route hops or missing destinations.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the user navigates through every dashboard card, sidebar item, quick action, contextual record link, and review handoff, **Then** each destination resolves through a retained canonical route.
2. **Given** an Admin or User session, **When** a retained screen loads, **Then** its existing role restrictions, reads, writes, calculations, uploads, review actions, exports, and provider-backed behavior remain unchanged.
3. **Given** a K-1 review, entity, estate-map, or investment record that links to a partnership workspace, **When** the link is followed, **Then** it opens the canonical `/investment-tracker` query-state flow rather than a legacy redirect route.

---

### User Story 2 - Retire Legacy and Direct-Only Browser Surfaces (Priority: P1)

As a maintainer, I want one production UI and one canonical route per supported workflow, so the project no longer carries old designs, placeholders, duplicate workspaces, or inaccessible admin pages.

**Why this priority**: The dual-design flag and compatibility routes keep large implementation closures alive and make reachability ambiguous.

**Independent Test**: Inspect the browser route inventory and active source tree. Exactly the retained route contract plus the wildcard fallback remains; there are zero active references to `VITE_MAGIC_PATTERN_DESIGNS`, `magicPatternDesigns`, the legacy navigation, or retired route paths.

**Acceptance Scenarios**:

1. **Given** the application starts without a design environment flag, **When** a user signs in or completes MFA, **Then** the user lands on `/dashboard` and receives the current dashboard design.
2. **Given** the retired browser routes `/upload`, `/partnerships`, `/partnerships/:id`, `/partnership-aggregation`, `/partnership-tracker`, `/k1-tracker`, `/admin/users`, `/admin/users/:id`, and `/forbidden`, **When** cleanup is complete, **Then** they are no longer registered or preserved as compatibility redirects.
3. **Given** a component, test, style, asset, hook, or client used only by a retired page/design branch, **When** no retained or system-root consumer remains, **Then** it is removed with its sole-purpose coverage.
4. **Given** a shared component used by a retained flow despite living in a legacy-named directory, **When** candidates are classified, **Then** it remains or is moved/renamed before the obsolete closure is deleted.

---

### User Story 3 - Remove Unused Backend and Operational Closures Safely (Priority: P2)

As a maintainer, I want API routes, services, types, tests, dependencies, scripts, and infrastructure retained only when a current product or protected system root consumes them, so cleanup reduces the whole repository rather than only the router.

**Why this priority**: Removing a page without removing its exclusive backend and dependency closure leaves most of the maintenance burden behind.

**Independent Test**: Build a consumer matrix from retained web clients and protected API/worker/operator roots to registered API routes and implementation modules. Every removed backend artifact has no remaining consumer, and every registered external API route maps to a retained flow or documented system root.

**Acceptance Scenarios**:

1. **Given** an API endpoint used only by a retired browser surface, **When** no worker, scheduler, infrastructure probe, deployment script, operator command, or external contract remains, **Then** the endpoint and its exclusive handler/schema/repository/type/test closure are removed.
2. **Given** a direct `/k1-tracker` API surface, **When** shared calculations needed by Investment Tracker are separated from the unconsumed route/import contract, **Then** the shared calculation code remains and only the direct unused contract is removed.
3. **Given** admin API code, **When** it supports Plaid scheduling, runtime protection controls, authentication, or another protected system root, **Then** that operational code remains even if the direct-only user-management UI is removed.
4. **Given** an uncertain dynamic or external consumer, **When** the consumer cannot be disproved, **Then** the candidate is marked `DEFER`, not deleted.

---

### User Story 4 - Leave a Smaller, Enforced Product Boundary (Priority: P2)

As a maintainer, I want automated guards and a deletion manifest to prevent retired flows from reappearing and to make the size reduction reviewable.

**Why this priority**: A one-time deletion without route and import guards allows duplicate product surfaces to accumulate again.

**Independent Test**: Run the route-contract test, current-entry reachability scan, API consumer coverage, dependency validation, builds, tests, and repository hygiene checks. Review the manifest and confirm every deletion and every deferred item is classified.

**Acceptance Scenarios**:

1. **Given** a future change registers a browser route outside the retained contract, **When** tests run, **Then** the route inventory test fails until the product contract is intentionally updated.
2. **Given** a future change reintroduces the retired design flag or a retired route, **When** static guards run, **Then** the change fails verification.
3. **Given** the final cleanup diff, **When** tracked files, source lines, direct dependencies, and production bundle size are compared with the implementation-start baseline, **Then** the manifest reports the actual reduction and no unexplained additions.

### Edge Cases

- Query-string states under `/investment-tracker` are part of one retained route and include partnership, workspace area, and tax-year selection.
- `/k1/:id/review` can hand off to Investment Tracker after apply/finalize; this link must be migrated before the legacy route is removed.
- Estate Map deep links currently use `/partnership-tracker`; they must preserve the selected partnership and translate legacy area aliases to current Investment Tracker query values.
- The dashboard is reachable only in the Magic Patterns branch today, while `.env.example` defaults the flag to false. This feature resolves the contradiction by making the current dashboard UI unconditional and deleting the flag.
- Admin role checks inside retained flows are live even if the direct-only user-management pages are removed.
- API route strings such as `/partnerships` are not browser routes; naming overlap alone is not deletion evidence.
- SQL migrations are immutable deployment history and must remain even when all runtime consumers of an old table are gone.
- Test fixtures, ambient declarations, worker entries, Terraform-referenced scripts, and package commands may be live without production imports.
- Existing baseline failures must be recorded before deletion and may not be hidden or worsened.
- The in-progress Spec 027 security work must be completed or cleanly integrated before implementation so cleanup does not discard its route policies, admission controls, or infrastructure changes.

## Requirements

### Functional Requirements

- **FR-001**: Implementation MUST begin from a named clean baseline that contains the completed Spec 027 security work; planning artifacts MAY be prepared while that work is still uncommitted.
- **FR-002**: The browser application MUST retain exactly these explicit route patterns: `/`, `/mfa/setup`, `/mfa`, `/dashboard`, `/investment-tracker`, `/liquidity`, `/entities`, `/entities/:id`, `/estate-maps`, `/tic-registry`, `/reports`, `/k1`, and `/k1/:id/review`, plus the wildcard fallback.
- **FR-003**: `/dashboard` MUST render the current dashboard directly without a design-variant condition.
- **FR-004**: Successful password or MFA completion MUST navigate to `/dashboard` without consulting a browser design flag.
- **FR-005**: The web application MUST remove `VITE_MAGIC_PATTERN_DESIGNS`, `magicPatternDesigns`, the legacy AppShell/navigation branch, and tests/configuration whose only purpose is to support that toggle.
- **FR-006**: The browser router MUST remove `/upload`, `/partnerships`, `/partnerships/:id`, `/partnership-aggregation`, `/partnership-tracker`, `/k1-tracker`, `/admin/users`, `/admin/users/:id`, and `/forbidden`; it MUST NOT retain redirects for those paths.
- **FR-007**: All live links from retained routes MUST be migrated to retained canonical routes before a retired route is removed.
- **FR-008**: Partnership deep links MUST use `/investment-tracker` with preserved `partnership`, `area`, and `year` query state as applicable.
- **FR-009**: The current Dashboard, Investment Tracker, Liquidity, Entities, Estate Maps, TIC Registry, Reports, K-1 upload/queue, and K-1 review behavior MUST remain supported.
- **FR-010**: Role-based edit restrictions and Admin capabilities embedded in retained flows MUST remain supported.
- **FR-011**: Authentication, session bootstrap/expiry, MFA enrollment/verification, CSRF/CORS/security controls, liveness/readiness, and route-protection coverage MUST remain supported.
- **FR-012**: K-1 BDA/stub extraction, uploads, workers, queues, retries, storage, review/finalization, and the portions of K-1 tracking used inside Investment Tracker MUST remain supported.
- **FR-013**: Plaid and market-data behavior used by Liquidity/Dashboard, reporting/export behavior used by Reports, and persistence used by retained flows MUST remain supported.
- **FR-014**: Every tracked source/configuration/test/type/script/dependency candidate MUST be classified from current entry points as `REMOVE`, `RETAIN`, or `DEFER` with evidence.
- **FR-015**: Browser reachability MUST include route registration, dashboard/sidebar links, contextual links, programmatic navigation, query-state transitions, and both Admin/User behavior.
- **FR-016**: Backend reachability MUST include retained web-client calls, intra-API imports, workers, schedulers, package scripts, Terraform, deployment scripts, health probes, and documented operator entry points.
- **FR-017**: An API route MAY be removed only when all in-repository and documented consumers are absent and the removal is listed as an intentional contract break.
- **FR-018**: Existing SQL migrations MUST NOT be edited or deleted.
- **FR-019**: Authoritative fixtures and persisted-data definitions MUST be retained unless their full consumer contract is explicitly retired and no migration history is changed.
- **FR-020**: A direct dependency MAY be removed only after imports, build/test configuration, package scripts, peer/optional requirements, deployment packaging, and lockfile consumers are checked; `package-lock.json` MUST be regenerated consistently.
- **FR-021**: Tests tied exclusively to removed behavior MUST be deleted or replaced; tests that cover retained shared behavior MUST be retargeted before deleting their old subject.
- **FR-022**: The implementation MUST maintain `pruning-manifest.md` with the baseline, candidate evidence, deletion groups, intentional contract removals, protected surfaces, deferred items, verification records, and final file/line/dependency/bundle deltas.
- **FR-023**: Automated guards MUST enforce the retained browser route inventory and zero active references to the retired design flag and browser paths.
- **FR-024**: Implementation MUST run focused route-flow tests, API build/tests, web lint/typecheck/tests/build/color checks, dependency validation, security route-policy checks, Terraform validation when infrastructure-facing registrations change, and repository hygiene checks.
- **FR-025**: Any baseline failure MUST be recorded before cleanup and MUST remain unchanged or improve; new failures are regressions.
- **FR-026**: Newly exposed candidates outside the approved deletion groups MUST default to `DEFER` until their full consumer closure is proven.

### Key Entities

- **Retained Flow**: A supported user journey beginning at login/dashboard and including its routes, navigation transitions, API calls, roles, and expected behavior.
- **System Root**: A non-dashboard entry point that is necessary to operate or secure retained flows, such as a worker, health probe, migration loader, scheduler, or deployment command.
- **Consumer Edge**: Evidence that one route, module, script, test, configuration file, infrastructure resource, or documented command consumes another artifact.
- **Pruning Candidate**: A route, source file, export, type, test, asset, dependency, script, configuration entry, or documentation set classified for removal, retention, or deferral.
- **Deletion Group**: A cohesive implementation closure removed together with its sole-purpose tests, types, dependencies, documentation, and verification.
- **Verification Record**: A baseline or post-change command/result tied to a retained flow, protected system root, or deletion group.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 13 retained explicit browser route patterns pass authenticated/unauthenticated and role-appropriate route tests; no retained UI interaction targets another browser path.
- **SC-002**: All nine retired route patterns are absent from router registration, active navigation, and programmatic navigation, with zero compatibility redirects.
- **SC-003**: Active source, tests, environment examples, build configuration, deployment configuration, and documentation contain zero references to `VITE_MAGIC_PATTERN_DESIGNS` or `magicPatternDesigns` except historical Specs 024-028.
- **SC-004**: One hundred percent of removed files, exports, dependencies, routes, and scripts map to an approved deletion group with evidence and verification.
- **SC-005**: One hundred percent of remaining registered external API routes map to a retained flow or a documented protected system root.
- **SC-006**: The implementation-start-to-final comparison shows a net decrease in tracked production source files, production source lines, and browser JavaScript bundle size; all actual deltas are recorded rather than estimated.
- **SC-007**: API and web builds complete, retained focused suites pass, and full-suite failures are either passes or explicitly unchanged baseline failures.
- **SC-008**: No SQL migration is modified/deleted, and Spec 027 route-protection/security coverage still passes for the reduced API inventory.
- **SC-009**: Every unresolved candidate is explicitly retained or deferred; the final manifest contains no unclassified diff path.

## Assumptions

- The dashboard experience rendered when Magic Patterns is enabled is the current product the user wants to keep.
- Dashboard reachability includes the Magic AppShell sidebar and contextual links on every retained destination, not only the four dashboard cards.
- Direct-only browser pages not linked from the current dashboard product are obsolete unless they are required pre-authentication routes.
- Git history and prior numbered pruning specs provide archaeology for deleted implementations; duplicate live implementations are not retained for reference.
- Internal database history is preserved even when runtime code is removed.
