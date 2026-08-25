# Implementation Plan: First-Pass Obsolete Code Pruning

**Branch**: `024-prune-obsolete-code` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-prune-obsolete-code/spec.md`

## Summary

Perform a conservative first repository-pruning pass that removes the already-retired Azure Document Intelligence design package, committed local/generated artifacts, empty or unused workspaces, stale source-adjacent output, redundant package metadata, and a reviewed set of unreachable web/API roots. Preserve Amazon BDA and its offline stub as the K-1 extraction architecture, preserve every behavior reachable with `VITE_MAGIC_PATTERN_DESIGNS` enabled or disabled, protect migrations and operational entry points, and require a deletion manifest plus two-variant regression matrix before accepting removals.

## Technical Context

**Language/Version**: Node.js 22+, API TypeScript 5.7, web TypeScript `~6.0.2`, JavaScript ESM, PowerShell for local/deployment tooling
**Primary Dependencies**: npm workspaces, Fastify 5, React 19.2, React Router 7, Vite 8, Tailwind CSS 3.4, MUI 9/Emotion, AWS SDK clients for BDA/Bedrock/S3/SQS; no new runtime dependency
**Storage**: PostgreSQL migration history (protected and unchanged), S3/BDA extraction assets (protected), source-controlled files and npm lockfile; tracked local `tmp/` artifacts are removed
**Testing**: Vitest, React Testing Library, ESLint, TypeScript builds/typecheck, Vite production builds for both flag values, color-governance audit, import/reference scans, guard scripts, clean npm install, and a representative route matrix
**Target Platform**: Jackson API/worker services plus the browser application on supported desktop and mobile viewports, with `VITE_MAGIC_PATTERN_DESIGNS=true` and `false`
**Project Type**: TypeScript npm-workspace web application and API monorepo with AWS infrastructure and numbered feature specifications
**Performance Goals**: No runtime behavior or latency regression; production bundle sizes must not increase as a result of pruning; installation/build input and tracked repository size should decrease
**Constraints**: Preserve both UI variants, all routes/API contracts/permissions/calculations/persistence behavior, `stub | aws_bda`, immutable migrations, authoritative fixtures, and direct operational entry points; delete only high-confidence candidates; no Git history rewrite
**Scale/Scope**: Baseline 1,110 tracked files, roughly 650 API/web source files, 17 rendered route families, 10 tracked `tmp/pdfs` files (3.33 MB), one root local PDF plus one-off QA/prototype scripts, seven Azure spec files, two unused workspaces, and a reviewed first tranche of unreachable roots/leaves

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific principles. The following repository-local gates apply:

1. **Behavior preservation**: PASS. The spec prohibits intentional route, endpoint, permission, calculation, persistence, and workflow changes.
2. **Dual-variant preservation**: PASS. Both Magic Patterns values are protected as separate entry graphs and receive build/test/route verification.
3. **Provider authority**: PASS. Amazon BDA and the offline stub remain; only already-retired Azure design material is removed.
4. **Evidence before deletion**: PASS. Every removal requires static, entry-point, dynamic-convention, infrastructure, dependency, and flag analysis plus a manifest record.
5. **Immutable deployment history**: PASS. SQL migrations and other dynamically discovered deployment artifacts are explicitly protected.
6. **Dependency integrity**: PASS. Package removal includes import/config/peer/script checks, npm lock regeneration, and clean-install verification.
7. **Regression protection**: PASS. API/web test and build gates, focused provider coverage, guard scripts, color governance, and two-flag route checks are required.
8. **Scope restraint**: PASS. Ambiguous closures, MFA product decisions, non-Azure spec retention, seeds, and broader architecture changes are deferred to later iterations.

### Post-Phase 1 Re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/pruning-safety.md](./contracts/pruning-safety.md), and [quickstart.md](./quickstart.md). Result: **PASS**.

- The candidate model requires explicit evidence, decision, replacement, protection checks, and verification before deletion.
- The pruning-safety contract makes dual-flag behavior, BDA/stub support, migration history, authoritative fixtures, and operational entries non-negotiable.
- The quickstart orders coverage before deletion and runs the complete validation matrix after each deletion group.
- No new runtime abstraction or dependency is introduced to remove code.

## Project Structure

### Documentation (this feature)

```text
specs/024-prune-obsolete-code/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
`-- contracts/
    `-- pruning-safety.md
```

### Source Code (repository root)

```text
.gitignore                              # targeted recurrence prevention
.specify/feature.json                   # current feature routing
package.json                            # canonical npm workspace/dependency root
package-lock.json                       # sole retained lockfile

apps/api/
|-- package.json
|-- src/
|   |-- config.ts                       # retains stub | aws_bda
|   |-- server.ts                       # protected API entry
|   |-- workers/                        # protected extraction worker entry
|   |-- infra/db/migrations/            # protected immutable history
|   `-- modules/k1/
|       |-- extraction/                 # BDA/stub authority; isolated dead leaf review
|       `-- worker/                     # protected durable BDA lifecycle
`-- tests/                              # BDA/stub and API regression suites

apps/web/
|-- .env.example                       # VITE_MAGIC_PATTERN_DESIGNS contract
|-- package.json
|-- vite.config.ts                     # remove unused @ui alias
|-- tsconfig.app.json                  # remove unused @ui alias
`-- src/
    |-- main.tsx                        # protected web entry
    |-- App.tsx                         # protected routes/redirects
    |-- config/featureFlags.ts          # protected flag parser
    |-- components/shared/AppShell.tsx  # protected global dual-variant shell
    |-- pages/                          # reviewed routed vs unreachable roots
    `-- features/
        |-- investment-tracker/         # enabled Magic route and reviewed dead leaves
        |-- partnership-tracker/        # both variants plus stale duplicate root
        |-- k1/                         # live ingestion surfaces
        |-- k1-tracker/                 # live shared Magic/default appearances
        `-- estate-map/                 # imports some Magic primitives

packages/
|-- types/                              # retained shared contracts; remove stale output/export
|-- ui/                                 # remove: unused workspace
`-- utils/                              # remove: empty workspace

infra/aws/                              # protected BDA/deployment authority
scripts/                                # protected/updated direct operational and guard entries
specs/
|-- 008-azure-document-intelligence/    # remove: explicitly superseded design package
`-- 022-aws-k1-pdf-ingestion/           # retained extraction authority

tmp/pdfs/                               # remove and ignore: local generated workspace
```

**Structure Decision**: Keep the monorepo architecture unchanged while reducing it in place. Production entry points remain `apps/api` and `apps/web`; `packages/types` remains the only live shared workspace after evidence-based removal of unused `packages/ui` and empty `packages/utils`. Do not relocate live components or combine the dual UI paths during this iteration.

## Phase 0: Research Outcomes

1. The runtime Azure migration is already complete; only a seven-file obsolete spec package and two incidental prose mentions remain.
2. `stub | aws_bda` is the complete supported extractor set; BDA config, workers, mapping, fixtures, Terraform, and evaluation scripts are protected.
3. Magic Patterns is a build/module-load-time Vite flag. False and true have distinct route, redirect, shell, and navigation behavior that must be verified separately.
4. Magic-named directories are not safe deletion units because their modules are shared by the investment tracker, legacy partnership surface, K-1 appearances, and Estate Map.
5. Three Magic roots are unreachable: the old investment controls, old capital-activity table, and retired partnership-tracker content root plus its stale barrel export.
6. Approximately 4 MB of tracked PDFs, render output, a live-check script, absolute-path QA notes, and a standalone TIC prototype are local/generated rather than authoritative fixtures.
7. `packages/utils` is empty and unreferenced; `packages/ui` has no application/test consumers and only unused aliases plus stale guidance refer to it.
8. Two physical JavaScript files beside current TypeScript shared types are stale compiled output and may shadow the TypeScript sources.
9. npm is the active package manager; `pnpm-lock.yaml`, duplicate root `jsdom`, and React Router v5 types are stale, while Emotion and Vitest coverage tooling remain legitimate.
10. A reviewed set of web scaffolds/pages and isolated API/type leaves is unreachable; MFA, migrations, seeds, ambient declarations, operational scripts, and ambiguous transitive closures are deferred or protected.

## Phase 1: Design Outcomes

- A `PruningCandidate` record captures category, evidence, inbound references, special reachability checks, decision, and rationale.
- `ProtectedSurface` entries prevent deletion based on mere absence of static imports.
- `DeletionGroup` records cohesive removal, replacement/authority, file and byte deltas, dependency changes, and required gates.
- A pruning-safety contract defines the baseline, evidence threshold, protected invariants, deletion ordering, and acceptance matrix.
- Coverage additions precede deletion for top-level flag routing, the false entity-detail branch, environment integration, query-preserving redirects, and the Estate Map flag exception.
- Package/workspace cleanup is coupled to resolver/config/lockfile/current-doc updates so no stale `@ui`, pnpm, or removed-path guidance remains active.
- Generated artifact removal is coupled to targeted ignore rules that do not hide test fixtures or real product assets.
- The deletion manifest records deferred candidates instead of converting uncertainty into removal.

## Implementation Sequence

1. Capture the baseline: branch/commit, tracked-file and byte counts, package workspaces, API/web builds, full test results, both-flag route behavior, and current Azure/temp/path scans.
2. Add or strengthen tests for `App.tsx` dashboard gating, false entity detail, compile-time flag parsing/integration, query-preserving partnership redirect, and the current Estate Map exception.
3. Create the pruning manifest and protected-surface list; classify every proposed item before deleting it.
4. Remove the obsolete Azure spec package, generalize the two remaining legacy prose mentions, and verify only this feature's retirement rationale mentions Azure.
5. Remove committed local/generated artifacts and add targeted root ignore rules; prove that authoritative test fixtures remain tracked.
6. Remove `packages/ui`, `packages/utils`, stale shared-type JavaScript, redundant `.gitkeep` files, resolver aliases, active-doc/guard references, stale lockfile, and unused dependency entries; regenerate and validate `package-lock.json`.
7. Remove the reviewed unreachable web roots/scaffolds and isolated API/type leaves, including the three Magic-named dead roots; update barrels/tests/docs only when their sole subject was removed.
8. Re-run reference and entry-point classification on newly exposed dependency closures and record all newly exposed candidates as retained or deferred for the next numbered branch; do not expand this branch beyond its pre-approved deletion groups.
9. Run focused BDA/stub tests, both-flag route tests, full API/web verification, guard scripts, clean install, hygiene scans, tracked-file delta checks, and production builds for both flag values.
10. Finalize the manifest with actual deletion counts, bytes, verification evidence, and the deferred candidate list for the next pruning iteration.

## Complexity Tracking

No constitution violations or exceptional architecture are introduced. The explicit manifest and two-variant verification matrix are necessary safeguards for deletion across dynamic entry points and a build-time feature flag; they remain documentation/test artifacts rather than runtime complexity.
