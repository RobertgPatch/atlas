# Feature Specification: First-Pass Obsolete Code Pruning

**Feature Branch**: `024-prune-obsolete-code`
**Created**: 2026-08-23
**Status**: Draft
**Input**: User description: "Create a new branch focused on pruning unused or outdated code. Preserve both enabled and disabled `MAGIC_PATTERNS` feature-flag behavior. Remove obsolete integrations such as Azure Document Intelligence because Amazon BDA is now authoritative. This is the first of multiple pruning iterations."

## Clarifications

### Session 2026-08-23

- Q: Should pruning stages share this branch or use different branches? → A: This branch contains the conservative first pass as staged deletion groups; later higher-risk iterations use new numbered specs and branches.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retire Superseded Extraction Artifacts (Priority: P1)

As a maintainer, I want the repository to describe and support the current Amazon BDA K-1 extraction architecture without obsolete Azure Document Intelligence implementation or setup artifacts, so future work is not misdirected toward a retired provider.

**Why this priority**: Provider ambiguity can cause incorrect configuration, dependency, testing, and operational decisions. Amazon BDA is now the authoritative production extraction path, while the deterministic stub remains necessary for local development and CI.

**Independent Test**: Search all active source, configuration, dependency manifests, scripts, tests, fixtures, and operator documentation and confirm that no Azure Document Intelligence integration surface remains; then run the K-1 extraction build and tests for the supported `stub` and `aws_bda` paths.

**Acceptance Scenarios**:

1. **Given** the current repository, **When** the first pruning pass is complete, **Then** active code and documentation present only `stub` and `aws_bda` as K-1 extractor backends.
2. **Given** an obsolete Azure-specific specification, fixture, script, configuration entry, or dependency with no live consumer, **When** the cleanup is applied, **Then** the obsolete artifact is removed rather than retained as an alternative implementation path.
3. **Given** Amazon BDA extraction and its local stub, **When** API builds and extraction tests run, **Then** both supported backends continue to compile and their existing behavior remains unchanged.

---

### User Story 2 - Preserve Both Design Variants (Priority: P1)

As a user or developer, I want the application to keep working with `VITE_MAGIC_PATTERN_DESIGNS` both enabled and disabled, so repository pruning does not mistake either maintained design path for dead code.

**Why this priority**: The feature flag deliberately makes portions of each design path unreachable in a single build. Static reachability from only one flag value is therefore insufficient evidence for deletion.

**Independent Test**: Build and exercise the route matrix twice, once with `VITE_MAGIC_PATTERN_DESIGNS=true` and once with `false`, and verify the expected login, shell, dashboard, entities, entity detail, partnership tracker, investment tracker, estate map, and other conditional surfaces render and navigate.

**Acceptance Scenarios**:

1. **Given** `VITE_MAGIC_PATTERN_DESIGNS=true`, **When** the web application is built and representative flagged routes are tested, **Then** Magic Patterns screens, shared appearances, navigation, and supporting components remain available.
2. **Given** `VITE_MAGIC_PATTERN_DESIGNS=false`, **When** the same verification is performed, **Then** the non-Magic/legacy screens and shared appearances remain available.
3. **Given** a file referenced only by one feature-flag branch, **When** pruning candidates are classified, **Then** that file is treated as live unless the entire corresponding behavior has separately been proven obsolete and the user has authorized its removal.

---

### User Story 3 - Remove High-Confidence Dead Weight (Priority: P2)

As a maintainer, I want the first pruning iteration to remove generated workspace artifacts, stale references, unused source files, unused exports, and unused dependencies that can be proven unnecessary, so the repository becomes smaller without combining cleanup with behavioral redesign.

**Why this priority**: A conservative, evidence-based first pass delivers immediate simplification while establishing a repeatable standard for later, broader pruning iterations.

**Independent Test**: Review the deletion manifest and confirm every removed item has repository-wide reference evidence, then run dependency installation consistency checks, lint, typecheck, builds, and test suites without restoring any deleted artifact.

**Acceptance Scenarios**:

1. **Given** a temporary/generated artifact committed outside an authoritative fixture or production asset location, **When** no supported workflow consumes it, **Then** it is removed and ignored where appropriate to prevent recurrence.
2. **Given** a source module, export, script, or package dependency, **When** repository-wide static references and runtime entry points show no consumer, **Then** it may be removed together with tests or documentation that exist only for that dead surface.
3. **Given** a candidate whose use cannot be disproven, **When** the first-pass review is performed, **Then** it is recorded for a later iteration and remains in place.

### Edge Cases

- A module may be loaded dynamically, registered by naming convention, referenced by Terraform or package scripts, or imported only from tests; filename searches alone are not sufficient deletion evidence.
- A component reachable only when `VITE_MAGIC_PATTERN_DESIGNS` has one particular value is live and must remain.
- Database migrations form an immutable deployment history and must not be deleted merely because later migrations supersede their schema changes.
- Recorded fixtures that are authoritative regression inputs must remain even if production code does not import them directly.
- Historical specs may describe retired systems; Azure-specific design artifacts are in scope because the provider is explicitly retired, while unrelated historical specifications are not blanket deletion candidates in this iteration.
- Source maps, build output, local captures, and temporary render files may be untracked or ignored in some environments and committed in others; cleanup must include recurrence prevention where appropriate.
- An apparently unused package may be required by a CLI, build configuration, optional native binding, or transitive runtime convention and must be checked against manifests and scripts before removal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The cleanup MUST start from an inventory that classifies candidates as active, removable in this iteration, or deferred with a reason.
- **FR-002**: The repository MUST retain `stub` and `aws_bda` as the supported K-1 extraction backends and MUST retain the Amazon BDA infrastructure, configuration, mapping, worker, fixtures, and tests required by those paths.
- **FR-003**: Active application code, configuration, dependencies, scripts, tests, fixtures, and operator documentation MUST remove Azure Document Intelligence integration surfaces and MUST NOT advertise Azure as a selectable backend.
- **FR-004**: The obsolete `specs/008-azure-document-intelligence/` design package and references whose only purpose is to implement or operate that retired provider MUST be removed or replaced by current Amazon BDA guidance.
- **FR-005**: The cleanup MUST preserve the `VITE_MAGIC_PATTERN_DESIGNS` flag parser, its enabled and disabled branches, and the modules, styling, tests, and navigation required by both values.
- **FR-006**: The cleanup MUST verify both Magic Patterns flag values through automated builds/tests plus a representative route matrix; a single default-value build is insufficient.
- **FR-007**: A production source file or export MAY be removed only when repository-wide static references, configured entry points, dynamic registration conventions, and infrastructure/script consumers provide high-confidence evidence that it is unused.
- **FR-008**: A dependency MAY be removed only when source imports, configuration loading, package scripts, build tooling, and optional runtime requirements show no remaining consumer; corresponding lockfile changes MUST be committed.
- **FR-009**: Generated or temporary files MAY be removed when they are not authoritative product assets or regression fixtures; appropriate ignore rules MUST be added or confirmed to prevent accidental recommit.
- **FR-010**: Existing database migration files MUST remain intact in this iteration.
- **FR-011**: The cleanup MUST NOT intentionally change routes, API contracts, persisted data behavior, permissions, calculations, visual design, or user workflows.
- **FR-012**: Tests tied exclusively to code that is validly removed MUST be removed or replaced; tests that protect retained behavior MUST remain.
- **FR-013**: Every deletion group MUST be recorded in a reviewable pruning manifest with its evidence, retained replacement if applicable, and verification coverage.
- **FR-014**: Uncertain or behavior-changing cleanup candidates MUST be deferred to a later iteration rather than deleted speculatively.
- **FR-015**: The completed iteration MUST pass repository formatting/hygiene checks, dependency consistency, API build and tests, and web lint, typecheck, tests, production builds, and color governance.
- **FR-016**: This branch MUST contain only the conservative first-pass deletion groups defined by this specification; each later higher-risk pruning iteration MUST use a new numbered specification and branch rather than expanding this branch indefinitely.

### Key Entities *(include if feature involves data)*

- **Pruning Candidate**: A file, export, dependency, script, fixture, configuration entry, or documentation set considered for removal; includes category, evidence, feature-flag reachability, decision, and rationale.
- **Deletion Group**: A cohesive retired surface removed together, such as Azure provider documentation or temporary PDF renders; includes replacement/authority and verification steps.
- **Protected Surface**: A code or artifact set that must survive pruning, notably both Magic Patterns variants, Amazon BDA, the local extraction stub, immutable migrations, and authoritative regression fixtures.
- **Verification Matrix**: The set of builds, tests, scans, and representative routes/environments that demonstrate retained behavior after cleanup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Active runtime code, dependency manifests, environment examples, scripts, tests, and operator documentation contain zero Azure Document Intelligence backend/configuration references after the cleanup.
- **SC-002**: One hundred percent of removed files and dependencies are represented by a deletion group with documented evidence and a replacement or explicit statement that no replacement is required.
- **SC-003**: Web production builds and the conditional-route verification matrix pass with `VITE_MAGIC_PATTERN_DESIGNS=true` and `VITE_MAGIC_PATTERN_DESIGNS=false`.
- **SC-004**: API build/tests and K-1 extraction coverage pass for the retained `stub` and Amazon BDA architecture.
- **SC-005**: Web lint, typecheck, full tests, production build, color governance, dependency lockfile validation, and repository hygiene checks pass without reintroducing deleted artifacts.
- **SC-006**: No route, API endpoint, permission, calculation, database migration history, or supported user workflow is removed or intentionally changed in the first iteration.
- **SC-007**: The repository has fewer tracked files and no tracked temporary PDF/render workspace after the iteration, while all retained regression fixtures stay available.

## Assumptions

- Amazon Bedrock Data Automation is the sole supported production K-1 document extraction provider; the stub backend remains supported for offline development and CI.
- Both states of `VITE_MAGIC_PATTERN_DESIGNS` are active product requirements even if one state is used less frequently.
- This is a conservative first pass organized into staged deletion groups on one branch; broader architectural consolidation, maintained legacy UI removal, and other higher-risk pruning are deferred to new numbered specifications and branches.
- Git history preserves deleted Azure design material if it is ever needed for archaeology, so keeping a live historical spec directory is unnecessary.
- Existing test fixtures under explicit test fixture directories are presumed authoritative until proven otherwise.
- The current merged `main` branch is the baseline for pruning.
