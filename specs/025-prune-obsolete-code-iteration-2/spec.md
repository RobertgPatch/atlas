# Feature Specification: Obsolete Code Pruning, Iteration 2

**Feature Branch**: `025-prune-obsolete-code-iteration-2`
**Created**: 2026-08-25
**Status**: Draft
**Input**: User description: "Continue where the previous unused-code pruning branch left off, create a new branch for the next iteration, remove additional stale code, and verify whether Azure Document Intelligence remains in the codebase."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reclassify the Deferred Source Closures (Priority: P1)

As a maintainer, I want the source closures deferred by Spec 024 to be re-inventoried from the newly pruned application entry points, so the next set of unused modules can be separated from code that is still reachable through shared routes, tests, feature flags, scripts, or operational conventions.

**Why this priority**: The first pass removed obsolete roots but deliberately retained their ambiguous dependency closures. Recomputing reachability after those roots are gone is the safest way to expose the next high-confidence deletion set.

**Independent Test**: Starting from the production web/API entries, both values of `VITE_MAGIC_PATTERN_DESIGNS`, package scripts, Terraform references, migration discovery, and test entries, produce a candidate manifest in which every previously deferred source file is classified as remove, retain, or defer with concrete evidence.

**Acceptance Scenarios**:

1. **Given** the 59-file provisional web closure from Spec 024, **When** reachability is recomputed from the merged first-pass baseline, **Then** every member is assigned a documented decision and no file is deleted solely because it lacks a static importer.
2. **Given** the legacy partnership CRUD/query/detail closure, **When** its route, shared-client, hook, test, and feature-flag consumers are evaluated, **Then** only the unreachable subset is approved for removal.
3. **Given** the older K-1 client/import-workbook/input-panel closure, **When** its application, test, and operational consumers are evaluated, **Then** retained current ingestion and review workflows remain protected.

---

### User Story 2 - Remove the Next Proven Stale Set (Priority: P1)

As a maintainer, I want the newly proven dead modules, exports, tests, dependencies, and documentation removed as cohesive deletion groups, so the repository becomes smaller and easier to navigate without changing supported behavior.

**Why this priority**: The value of the iteration comes from converting evidence into reviewable removals while keeping rollback and regression analysis localized.

**Independent Test**: Review the deletion manifest, confirm every removed path belongs to an approved group with a retained authority or no-replacement rationale, and run the relevant focused and full verification matrix without restoring deleted content.

**Acceptance Scenarios**:

1. **Given** a module reachable only from a root deleted by Spec 024, **When** no production, test, script, configuration, infrastructure, or dynamic consumer remains, **Then** the module and any sole-purpose test or export are removed together.
2. **Given** a package dependency or alias with no remaining consumer, **When** source, tooling, peer, optional, and runtime checks agree it is unused, **Then** its manifest and lockfile entries are removed.
3. **Given** a candidate with conflicting or incomplete evidence, **When** the iteration is finalized, **Then** it remains in place and is recorded as deferred rather than being deleted speculatively.

---

### User Story 3 - Toggle MFA Login with One Feature Flag (Priority: P1)

As an operator, I want to turn MFA login on or off with one server-owned feature flag, so I can enable the existing enrollment and verification flow without rebuilding or redeploying a separately configured frontend.

**Why this priority**: The repository contains working MFA endpoints and screens, but current password login bypasses them. A single authoritative switch converts an ambiguous stale-code candidate into an intentional, testable security capability without allowing frontend and backend settings to drift.

**Independent Test**: Run the login contract and browser route flow with `MFA_LOGIN_ENABLED=false` and `true`. Off must issue the current password-only session; on must issue enrollment or challenge responses, withhold the session cookie until MFA completes, and navigate through the existing MFA screens.

**Acceptance Scenarios**:

1. **Given** `MFA_LOGIN_ENABLED=false` or unset, **When** valid credentials are submitted, **Then** the API creates the current authenticated session and the web app navigates to the flag-appropriate landing page without an MFA step.
2. **Given** `MFA_LOGIN_ENABLED=true` and a user who must enroll, **When** valid credentials are submitted, **Then** the API returns `MFA_ENROLL_REQUIRED`, the web app opens `/mfa/setup`, and no authenticated session exists until enrollment succeeds.
3. **Given** `MFA_LOGIN_ENABLED=true` and an enrolled user, **When** valid credentials are submitted, **Then** the API returns `MFA_REQUIRED`, the web app opens `/mfa`, and no authenticated session exists until TOTP verification succeeds.
4. **Given** the flag is toggled between process starts, **When** the API starts, **Then** it uses the new value without requiring a separate web build flag.

---

### User Story 4 - Preserve Supported and Operational Surfaces (Priority: P1)

As a user and operator, I want both UI variants, current K-1 extraction, database history, security flows, and direct operational commands to remain functional, so pruning cannot silently remove behavior that static imports do not reveal.

**Why this priority**: The remaining candidates include security and operator-invoked surfaces whose value cannot be inferred from the browser bundle alone.

**Independent Test**: Build and test the web app with `VITE_MAGIC_PATTERN_DESIGNS=false` and `true`; build and test the API with `stub` and `aws_bda`; audit migrations, fixtures, package scripts, Terraform, seed documentation, authentication flows, and active provider references.

**Acceptance Scenarios**:

1. **Given** either supported Magic Patterns flag value, **When** representative routes and navigation are exercised, **Then** all maintained behavior for that value remains available.
2. **Given** Amazon BDA and the offline stub, **When** extraction configuration, worker, mapping, retry, and focused tests are inspected and run, **Then** those are the only supported extraction backends.
3. **Given** an importless migration, seed, ambient declaration, or Terraform-invoked script, **When** it is classified, **Then** its discovery or operator entry mechanism is treated as a live consumer.
4. **Given** Azure Document Intelligence was retired in Spec 024, **When** active code, configuration, dependencies, scripts, tests, and operator documentation are scanned, **Then** zero Azure integration references are present.

### Edge Cases

- A shared client, hook, type, or component can remain live even after its original page root was removed.
- A module may be reachable only in one compile-time feature-flag graph or only through a compatibility redirect.
- Tests may be the only consumer because they protect a public contract rather than obsolete implementation; such tests are not automatically stale.
- The MFA login flag must have one source of truth; separate Vite and API flags could disagree and must not be introduced.
- Enabling MFA must not create a session cookie or increment successful session state before enrollment or TOTP verification completes.
- Disabling MFA must preserve current password-only behavior without deleting enrollment state or admin reset controls.
- Manual seed and maintenance scripts may be invoked directly by operators or documentation and must not be classified solely through imports.
- SQL migrations and authoritative fixtures are discovered by convention and remain protected even when newer files supersede their data shape.
- Historical specifications may contain obsolete descriptions but require a documented retention rule before bulk deletion.
- Generated output under ignored directories is not a tracked-code deletion candidate unless it has re-entered version control.
- An active provider scan may legitimately mention Azure only inside the completed Spec 024 retirement record and this iteration's audit evidence; active runtime and operator surfaces must remain at zero.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The iteration MUST use the merged completion of Spec 024 as its baseline and MUST preserve the Spec 024 manifest as historical evidence.
- **FR-002**: The iteration MUST re-inventory all six deferred candidate groups recorded by Spec 024 and classify their current members as `REMOVE`, `RETAIN`, or `DEFER`.
- **FR-003**: Every removal MUST have repository-wide static-reference evidence plus checks for configured entry points, dynamic conventions, tests, package scripts, infrastructure, and operator documentation as applicable.
- **FR-004**: The web reachability inventory MUST evaluate `VITE_MAGIC_PATTERN_DESIGNS=false` and `true` as separate live entry graphs.
- **FR-005**: The legacy partnership closure MUST be evaluated against shared entity, partnership, tracker, reporting, test, and compatibility-route consumers before deletion.
- **FR-006**: The older K-1 closure MUST be evaluated against current PDF ingestion, review, tracker, BDA/stub, test, and operator consumers before deletion.
- **FR-007**: The API MUST expose a boolean runtime feature flag named `MFA_LOGIN_ENABLED`, parsed from the environment and defaulting to `false` when absent or invalid.
- **FR-008**: `MFA_LOGIN_ENABLED` MUST be the only switch controlling whether password login completes directly or requires the existing MFA enrollment/verification flow; no second Vite MFA flag may be introduced.
- **FR-009**: When the MFA flag is disabled, valid password login MUST preserve the current session response, cookie, audit behavior, and Magic/legacy landing destinations.
- **FR-010**: When the MFA flag is enabled, a user requiring enrollment MUST receive `MFA_ENROLL_REQUIRED`; an enrolled user MUST receive `MFA_REQUIRED`; neither response may create an authenticated session cookie.
- **FR-011**: The web login client MUST model the password-login response as a union of session, MFA enrollment, and MFA challenge results and MUST route each result to the existing correct flow.
- **FR-012**: `App.tsx` MUST register `/mfa/setup` and `/mfa` as pre-authentication routes, and those pages MUST redirect safely to login when their in-memory flow token is absent.
- **FR-013**: Successful enrollment or TOTP verification MUST create the session and navigate to the landing destination appropriate to `VITE_MAGIC_PATTERN_DESIGNS`.
- **FR-014**: Existing admin MFA status/reset behavior, TOTP verification, lockout, audit events, and persisted enrollment state MUST remain supported in both flag states.
- **FR-015**: `apps/api/.env.example`, AWS Terraform variables/environment wiring and tfvars examples, and current operator/deployment guidance MUST document `MFA_LOGIN_ENABLED`, its false default, and restart-time evaluation.
- **FR-016**: Manual seed, migration, maintenance, worker, and infrastructure scripts MUST treat documented or convention-based invocation as a valid consumer.
- **FR-017**: Existing SQL migrations MUST NOT be modified or removed as part of pruning.
- **FR-018**: Authoritative fixtures and current Amazon BDA infrastructure, blueprints, mapping, workers, and tests MUST remain intact.
- **FR-019**: Active source, configuration, dependencies, scripts, tests, fixtures, and operator documentation MUST contain zero Azure Document Intelligence integration references and MUST expose only `stub` and `aws_bda` extraction providers.
- **FR-020**: A dependency MAY be removed only after direct imports, build/test configuration, CLI usage, peer requirements, optional workflows, and lockfile consumers have been checked.
- **FR-021**: Tests and documentation whose sole subject is validly removed code MUST be deleted or retargeted in the same deletion group; coverage of retained behavior MUST remain.
- **FR-022**: The iteration MUST maintain a pruning manifest containing candidate evidence, decisions, protected surfaces, deletion groups, actual file/byte deltas, and verification results.
- **FR-023**: Except for the explicitly requested MFA feature-flag behavior, the iteration MUST NOT intentionally change routes, API contracts, permissions, calculations, persistence semantics, visual design, or supported workflows.
- **FR-024**: API build/tests, both MFA flag-state contracts, focused BDA/stub coverage, web lint/typecheck/tests, color governance, import guards, npm dependency validation, and both Magic Patterns production builds MUST be run and compared with an iteration-start baseline.
- **FR-025**: Any baseline failure MUST be recorded before deletion and MUST NOT be hidden or made worse by pruning.
- **FR-026**: Newly exposed ambiguous or behavior-changing candidates MUST be deferred to another numbered iteration rather than expanding this branch without an evidence boundary.

### Key Entities *(include if feature involves data)*

- **Reachability Record**: A source path or export and the production, test, feature-flag, configuration, dynamic, infrastructure, and operator edges that can reach it.
- **MFA Login Flag State**: The server-owned `MFA_LOGIN_ENABLED` value evaluated at API startup; determines whether password authentication returns a session or begins enrollment/verification.
- **Pruning Candidate**: A file, export, dependency, script, fixture, configuration entry, or documentation set being classified; includes its inherited Spec 024 group, evidence, decision, and rationale.
- **Protected Surface**: A path or behavior that cannot be removed based on static-import absence, including both UI variants, current auth security behavior, BDA/stub extraction, migrations, fixtures, and operational entries.
- **Deletion Group**: A cohesive set of approved removals with a rollback boundary, retained authority, dependency changes, and required verification.
- **Verification Matrix**: Baseline and post-deletion builds, tests, scans, route checks, provider checks, dependency checks, and tracked-file deltas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One hundred percent of the six deferred Spec 024 groups have current iteration-2 classifications with evidence and an explicit decision.
- **SC-002**: One hundred percent of removed files, exports, and dependencies map to a verified deletion group in the iteration-2 manifest.
- **SC-003**: Active runtime and operator surfaces contain zero Azure Document Intelligence integration references, while provider checks expose exactly `stub` and `aws_bda`.
- **SC-004**: Production web builds and the representative route matrix pass for both Magic Patterns flag values without restoring removed modules.
- **SC-005**: Focused BDA/stub tests and the API build pass, and no migration or authoritative fixture is deleted or modified.
- **SC-006**: Dependency installation and workspace validation succeed with no removed package, alias, or lockfile entry required by a retained workflow.
- **SC-007**: The post-pruning repository contains fewer tracked source/configuration files or dependency entries than the iteration-start baseline, with no intentional user-visible behavior change.
- **SC-008**: Every unresolved candidate is documented as retained or deferred; the iteration ends with no unclassified deletion candidate in its approved inventory.
- **SC-009**: Automated API and web tests cover both MFA flag states, enrollment-required and challenge-required responses, absence of a pre-MFA session cookie, successful completion, missing-flow-token redirects, and both Magic/legacy post-authentication destinations.
- **SC-010**: Toggling MFA requires changing only `MFA_LOGIN_ENABLED` and restarting the API; no web rebuild or second flag change is required.

## Assumptions

- Spec 024 is merged into `main` and is the authoritative baseline for this iteration.
- Amazon Bedrock Data Automation remains the sole production K-1 extraction provider, with `stub` retained for offline development and CI.
- Both values of `VITE_MAGIC_PATTERN_DESIGNS` remain supported until a separate product decision retires one of them.
- Existing migrations and authoritative fixtures are immutable pruning boundaries.
- `MFA_LOGIN_ENABLED=false` is the compatibility default; operators opt in to MFA enforcement per deployed API environment.
- MFA enrollment/challenge tokens remain process-local as in the current implementation; durable/distributed challenge storage is outside this pruning iteration.
- Security and operator workflows require stronger evidence than ordinary source modules before removal.
- Git history provides archaeology for deleted implementation artifacts, while numbered specs remain subject to a separate documented retention policy.
