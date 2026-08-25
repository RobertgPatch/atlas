# Phase 0 Research: First-Pass Obsolete Code Pruning

## Decision 1: Use a conservative, evidence-based pruning standard

**Decision**: Remove a candidate in this iteration only when repository-wide reference checks, configured entry points, package scripts, dynamic registration conventions, infrastructure consumers, and feature-flag reachability agree that it is dead or explicitly superseded. Record each cohesive removal in a pruning manifest. Defer ambiguous candidates.

**Rationale**:

- TypeScript's `noUnusedLocals` detects unused declarations inside compiled modules but does not prove that a file, barrel export, script entry point, fixture, or workspace is unreachable.
- Dynamic API scripts, Terraform commands, migration discovery, test fixtures, and Vite compile-time flags create valid consumers that ordinary import searches can miss.
- A first iteration should establish a repeatable safety standard without turning cleanup into a behavior-changing redesign.
- Git preserves removed material for archaeology, so proven obsolete files do not need to remain in the active tree.

**Alternatives considered**:

- Delete every file with no static importer: rejected because migrations, ambient declarations, scripts, fixtures, and feature-flag-only files can be importless but live.
- Add a large automatic dead-code tool and trust its output immediately: rejected for this iteration because entry-point configuration and false-positive classification would itself be a material new subsystem. A pinned import-graph check can be introduced in report-only/reviewed mode after the initial manifest is established.
- Keep all historical material indefinitely: rejected because the user explicitly wants repository size and obsolete guidance reduced, and Git already retains history.

## Decision 2: Treat Amazon BDA as authoritative and remove the remaining Azure design package

**Decision**: Delete `specs/008-azure-document-intelligence/` and generalize two incidental Azure prose references in older K-1 documentation. Do not create any runtime migration because the live Azure implementation, dependency, fixtures, environment variables, and provider option were already removed in commit `f0e6428`.

**Rationale**:

- Current active code supports only `stub | aws_bda` in `apps/api/src/modules/k1/extraction/index.ts` and `apps/api/src/config.ts`.
- `@azure` is absent from all package manifests and `package-lock.json`.
- The seven-file Azure spec package contains 1,086 lines / 77,664 bytes and has no backlinks outside itself.
- `specs/022-aws-k1-pdf-ingestion/`, `infra/aws/bda/`, and the BDA worker/mapping/test surfaces supersede its design and operating guidance.

**Alternatives considered**:

- Retain Spec 008 with a deprecated banner: rejected because it still expands the active planning corpus and Git already provides historical access.
- Rewrite Git history to remove Azure completely: rejected as destructive and unrelated to working-tree pruning.
- Remove the provider-neutral extractor contract or stub: rejected because they are active foundations for BDA orchestration and offline/CI behavior.

## Decision 3: Protect both Magic Patterns states as independent live entry graphs

**Decision**: Preserve `VITE_MAGIC_PATTERN_DESIGNS`, all behavior reachable from either value, and shared Magic-named modules used by unflagged or flag-disabled paths. Add missing route-level coverage, then delete only three Magic-named roots proven unreachable: `MagicPatternInvestmentControls.tsx`, `MagicPatternCapitalActivityTable.tsx`, and `MagicPatternPartnershipTrackerPageContent.tsx` with its stale barrel export.

**Rationale**:

- Vite reads the flag at build/module-load time; one build cannot prove the other branch is dead.
- False and true intentionally differ for login destination, dashboard availability, entities/detail rendering, investment tracker availability, partnership tracker redirect behavior, and global `AppShell` navigation/layout.
- Magic partnership components are shared transitively by the live investment tracker, the legacy partnership page, K-1 appearance variants, and Estate Map. Directory-level removal would break both flag states.
- The enabled partnership redirect must preserve the `partnership`, `area`, and `year` query contract and legacy area aliases.

**Alternatives considered**:

- Keep only the currently preferred flag value: rejected because the user explicitly requires both values.
- Preserve every file with `MagicPattern` in its name: rejected because three roots have no active inbound path and are safe first-pass removals.
- Rely only on prop-injected unit tests: rejected because they do not verify `import.meta.env` integration or top-level route wiring.

## Decision 4: Remove committed local artifacts and prevent recurrence

**Decision**: Delete `new_k1.pdf`, all tracked `tmp/pdfs/**`, `apps/api/tmp-live-k1-check.mjs`, `design-qa.md`, and the superseded standalone `tic-registry.html`. Add targeted root ignore rules for `/tmp/`, `/new_k1.pdf`, and equivalent one-off local QA/live-check artifacts without ignoring authoritative test fixture directories.

**Rationale**:

- These files total roughly 4 MB and are local captures, absolute-path QA notes, one-off live scripts, or a completed standalone prototype.
- The current React/RDS TIC implementation supersedes the standalone HTML prototype.
- Spec 022 already instructs developers not to commit private K-1 documents.
- Authoritative fixtures live under explicit `apps/**/tests/fixtures/` paths and remain protected.

**Alternatives considered**:

- Move all artifacts into test fixtures: rejected because they are not all curated, sanitized, or consumed as regression inputs.
- Ignore every PDF/PNG globally: rejected because legitimate application assets and explicit regression fixtures may use those formats.

## Decision 5: Remove unused workspaces and stale source-adjacent output

**Decision**: Remove `packages/utils` and `packages/ui`; remove the unused `@ui` aliases from the web Vite and TypeScript configuration; update active guard/docs language to point to `apps/web/src/components/shared`; remove redundant `.gitkeep` files in non-empty directories. Delete the physical `packages/types/src/k1-ingestion.js` and `partnership-management.js` files while retaining their TypeScript sources and NodeNext `.js` import specifiers.

**Rationale**:

- `packages/utils` contains only a manifest and placeholders and has no consumers.
- `packages/ui` contains 31 files but has no application or test imports. The live component system is under `apps/web/src/components` and `apps/web/src/components/shared`.
- The only current `@ui` references are unused resolver aliases.
- Source-adjacent JavaScript can shadow the larger/current TypeScript modules; NodeNext TypeScript intentionally uses `.js` specifiers that resolve to `.ts` during compilation.

**Alternatives considered**:

- Keep empty workspaces for future use: rejected under YAGNI; they can be recreated if a future architecture needs them.
- Migrate live components into `packages/ui` during cleanup: rejected because it expands scope from deletion into architecture and risks both UI variants.
- Rewrite NodeNext imports to `.ts`: rejected because emitted ESM expects `.js` specifiers.

## Decision 6: Normalize on npm and remove only proven unused dependency entries

**Decision**: Keep `package-lock.json` as the single lockfile, remove stale `pnpm-lock.yaml`, remove duplicate root `jsdom`, and remove unused web `@types/react-router-dom`. Regenerate the npm lockfile and validate with a clean install. Retain Emotion and optional Vitest coverage tooling.

**Rationale**:

- All repository scripts and workspaces use npm, while the pnpm lock reflects only an old root dependency view.
- The web workspace already owns the `jsdom` version used for browser-like tests.
- React Router 7 ships its own types, and no source imports the v5 `@types/react-router-dom` package.
- Emotion is an MUI peer requirement even without direct imports; removing it would be an invalid dependency inference.

**Alternatives considered**:

- Remove all packages without direct source imports: rejected because peer dependencies, CLI tools, config plugins, and optional test workflows are legitimate consumers.
- Change the repository to pnpm: rejected because this is a pruning pass, not a package-manager migration.

## Decision 7: Limit production-code deletion to reviewed unreachable roots and leaves

**Decision**: In addition to the three Magic roots, remove the clearly unreachable nested `apps/web/src/features/features/**` scaffold, `auth/mockAuthService.ts`, duplicate top-level `components/StatusBadge.tsx`, unused `EstateMapSetupGuide.tsx`, `DashboardPage.tsx`, `K1TrackerPage.tsx`, `PartnershipDirectory.tsx`, and `PartnershipDetail.tsx`; remove the unreferenced legacy API leaf `localPdfStore.ts`, unused partnership-tracker barrel, and stale `packages/types/src/auth-access.ts` export. Classify any dependency closure exposed by these deletions before removing it; do not bulk-delete the 59-file provisional graph.

**Rationale**:

- These roots have no inbound path from the active web `main.tsx`/`App.tsx` graph or active API entry points.
- Live compatibility redirects in `App.tsx` replace the old K-1 and partnership page roots.
- The nested feature scaffold contains fake/TODO flows rather than production behavior.
- The current object-store implementation supersedes `localPdfStore.ts`.
- The old auth type export is private, unconsumed, and does not model the current MFA response union.

**Alternatives considered**:

- Remove every transitive file referenced only by these roots in the same pass: rejected until each closure member is checked for shared entity, test, or flag use.
- Remove currently unmounted MFA pages and `authFlowStore`: deferred because those files call real MFA APIs and their removal is a product/security decision, not merely dead-code cleanup.

## Decision 8: Preserve historical and operationally discovered surfaces unless explicitly retired

**Decision**: Retain every SQL migration, current BDA/AWS asset, manual seed script, ambient Fastify declaration, Terraform-invoked operational script, maintained Magic/legacy route surface, and all non-Azure historical specs during this iteration.

**Rationale**:

- Migrations are discovered and applied by filename rather than imports and form immutable deployment history.
- Seeds and operational scripts may be direct CLI entry points.
- Non-Azure specs remain contract/history evidence until a separate retention policy is approved.
- The user framed this as the first of multiple passes, so uncertain categories can be handled deliberately later.

**Alternatives considered**:

- Delete all old numbered specs or migrations: rejected because age is not evidence of irrelevance.
- Delete all importless scripts: rejected because infrastructure and operators invoke scripts directly.
