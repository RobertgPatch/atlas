# Implementation Plan: Obsolete Code Pruning, Iteration 2

**Branch**: `025-prune-obsolete-code-iteration-2` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-prune-obsolete-code-iteration-2/spec.md`

## Summary

Continue the evidence-based pruning process from merged Spec 024 by recomputing source reachability against the smaller application graph, classifying all six deferred groups, and removing a bounded second tranche of high-confidence stale code. The planned deletion boundary is 56 files (233,356 bytes, including 4,386 TypeScript lines), one broken npm script entry, and the orphaned MUI/Emotion dependency closure. Before pruning, reconnect the existing MFA enrollment/verification UI to password login behind one API runtime flag, `MFA_LOGIN_ENABLED`, defaulting off to preserve current behavior. Preserve both Magic Patterns variants, current partnership and K-1 workflows, backend K-1 import contracts, migrations, fixtures, operational entries, Amazon BDA, and the offline stub. Azure Document Intelligence is already absent from every active surface and is enforced as a zero-reference invariant.

## Technical Context

**Language/Version**: Node.js 22+; API TypeScript `^5.7.2` (currently resolved 5.9.x); web TypeScript `~6.0.2` (currently resolved 6.0.x); JavaScript ESM; PowerShell for local/deployment tooling
**Primary Dependencies**: npm workspaces, Fastify 5, React 19.2, React Router 7, Vite 8, Tailwind CSS 3.4, TanStack Query, otplib/qrcode for retained MFA, AWS SDK clients for BDA/Bedrock/S3/SQS; remove the unused MUI 9/Emotion closure
**Storage**: PostgreSQL schema and immutable migration history (protected); S3/BDA assets and test fixtures (protected); repository files, package manifests, and `package-lock.json`
**Testing**: Vitest, React Testing Library, ESLint, TypeScript build/typecheck, Vite production builds for both flag values, color governance, import guards, npm clean-install/workspace checks, Terraform validation, static reachability scans, and representative route matrices
**Target Platform**: Jackson Fastify API/worker and browser application on supported desktop/mobile viewports; AWS staging/production infrastructure; Windows local development and Linux build/runtime bindings
**Project Type**: TypeScript npm-workspace web application and API monorepo with shared types and AWS infrastructure
**Performance Goals**: No runtime or route regression; neither flag bundle grows from pruning; tracked file count, source surface, lockfile input, and web dependency count decrease
**Constraints**: Use one server-owned `MFA_LOGIN_ENABLED` flag with a false compatibility default and no Vite counterpart; preserve both `VITE_MAGIC_PATTERN_DESIGNS` graphs, exact `stub | aws_bda` provider support, admin MFA controls, backend K-1 import APIs, migrations, authoritative fixtures, and dynamic/operator entries; outside the requested MFA branch, make no intentional API, persistence, permission, calculation, workflow, or visual change
**Scale/Scope**: Baseline 1,028 tracked files, 339 web-source files, 206 API-source files, 45 production-unreachable web modules discovered from `main.tsx`, 56 approved file removals totaling 233,356 bytes, four web dependency removals, three obsolete process-local seeds, and one broken root package script

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` remains an unfilled template and defines no enforceable project-specific principles. Repository-local safety gates therefore govern this maintenance feature:

1. **Evidence before deletion**: PASS. Every candidate requires current static, entry-point, feature-flag, test, dynamic, infrastructure, and operator evidence as applicable.
2. **Behavior preservation**: PASS. The specification prohibits intentional route, API, permission, calculation, persistence, workflow, and visual changes.
3. **Dual-variant preservation**: PASS. False and true Magic Patterns graphs are independently protected and built.
4. **Provider authority**: PASS. Amazon BDA and the offline stub remain the exact provider set; active Azure references remain at zero.
5. **Security/API clarity**: PASS. The existing MFA frontend/backend contract is retained and intentionally gated by one server flag; pre-MFA results cannot create sessions. Backend K-1 import contracts remain deferred instead of being silently retired.
6. **Dynamic-entry protection**: PASS. Migrations, fixtures, package scripts, Terraform, Docker/build inputs, seeds, and direct operator commands are checked outside the import graph.
7. **Dependency integrity**: PASS. Dependency removal includes peer/config/CLI/optional/deployment checks, lock regeneration, clean install, and both production builds.
8. **Regression accounting**: PASS. Baseline failures are recorded before deletion and may not be hidden or worsened.
9. **Scope boundary**: PASS. The approved 56-file inventory is explicit; newly exposed ambiguous candidates are retained or deferred.

### Post-Phase 1 re-check

Re-evaluated after completing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/pruning-safety.md](./contracts/pruning-safety.md), and [quickstart.md](./quickstart.md). Result: **PASS**.

- The model requires high-confidence reachability evidence and blocks removal of protected surfaces.
- The contract names the exact approved groups, the single-source MFA flag contract, and retained product/API boundaries.
- The quickstart orders baseline capture, test retargeting, group deletion, focused verification, reachability recomputation, and final validation.
- No new runtime abstraction or dependency is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/025-prune-obsolete-code-iteration-2/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
`-- contracts/
    `-- pruning-safety.md
```

`tasks.md` and `pruning-manifest.md` are Phase 2/implementation artifacts and are not created by this planning command.

### Source Code (repository root)

```text
package.json                         # remove broken transfer:prepare
package-lock.json                    # regenerate after web dependency removal

apps/api/
|-- package.json                    # protected worker/reconciler/evaluation entries
|-- src/
|   |-- server.ts                   # protected API entry
|   |-- workers/                    # protected Terraform/package entries
|   |-- scripts/                    # protected scheduled/operator entries
|   |-- infra/db/
|   |   |-- migrations/             # protected immutable discovery set
|   |   `-- seed/
|   |       |-- 002_k1_fixtures.ts # remove: obsolete process-local seed
|   |       |-- 003_review_fixtures.ts
|   |       |-- 006_reports_fixtures.ts
|   |       `-- 004_partnership_fixtures.ts # retain: PostgreSQL operator seed
|   `-- modules/
|       |-- auth/                   # add flag branch; retain MFA/public API
|       |-- k1/                     # protected dashboard/review/BDA/stub
|       `-- k1-tracker/             # backend contract deferred
`-- tests/                           # retained API/provider/contract coverage

apps/web/
|-- package.json                    # remove MUI/Emotion closure
`-- src/
    |-- main.tsx                    # remove orphaned ThemeProvider only
    |-- App.tsx                     # protected route authority
    |-- assets/                     # remove three unreferenced starter assets
    |-- auth/
    |   `-- authFlowStore.ts        # retain: MFA flow-token handoff
    |-- pages/
    |   |-- MFAPage.tsx             # retain/reconnect: flagged TOTP challenge
    |   |-- MFASetupPage.tsx        # retain/reconnect: flagged enrollment
    |   |-- K1Dashboard.tsx         # protected current upload/dashboard
    |   |-- K1ReviewWorkspace.tsx   # protected current review/apply
    |   |-- PartnershipTrackerPage.tsx
    |   `-- InvestmentTrackerPage.tsx
    |-- theme/
    |   |-- muiTheme.ts             # remove: orphaned root theme
    |   `-- muiTheme.test.ts        # remove: sole-purpose test
    `-- features/
        |-- partnerships/           # prune dead CRUD/detail closure; retain shared clients/table
        |-- partnership-tracker/    # retain live workspace; prune nine stale proxies
        |-- k1/                     # protected live upload/dashboard/review
        |-- k1-tracker/             # retain canonical forms; prune old client/dialog closure
        |-- reports/                # prune two isolated leaves; retain live reports/fixture
        `-- review/                 # prune two isolated leaves; retain current review code

packages/types/                      # retained shared contract workspace
infra/aws/                           # protected operational/BDA/Terraform authority
scripts/                             # protected direct operator/guard entries
specs/024-prune-obsolete-code/       # protected completed pruning evidence
```

**Structure Decision**: Keep the monorepo boundaries unchanged. This iteration reduces dead leaves inside the existing API/web structure, removes an unused root provider/dependency closure, and updates exact stale commands. It does not consolidate maintained legacy/Magic implementations, move shared modules, or redesign package boundaries.

## Phase 0: Research Outcomes

1. Azure Document Intelligence has no active code, dependency, configuration, test, fixture, script, environment, or operator-document surface. Only retirement/audit history mentions it.
2. The supported extractor registry remains exactly `stub` and `aws_bda`.
3. A fresh web graph reports 45 production-unreachable modules; manual/test/dynamic classification yields an approved 51-file web boundary rather than the provisional 59-file closure.
4. Twenty-three legacy partnership source modules and six sole-purpose tests form a closed, unreachable CRUD/detail/query presentation graph. Shared entity/assets clients and the current partnership tracker remain live.
5. Five older K-1 web modules plus one test form a closed workbook/input client graph. Current K-1 dashboard/upload/review and canonical tracker components remain live; backend import APIs are deferred.
6. Nine partnership-tracker proxies/placeholders are stale; sign-off coverage must be retargeted to the canonical live component before deletion.
7. Two report components, two review components, and three starter assets have no production consumer. The consolidated-holdings fixture remains protected by four live tests.
8. Three process-local seed scripts no longer work with the durable repository model. The PostgreSQL partnership seed remains a documented operator tool.
9. Root `transfer:prepare` points to a nonexistent file and has no other consumer.
10. The MUI root theme/provider/test and MUI/Emotion packages form an isolated closure; no live component imports MUI or Emotion.
11. The unmounted MFA frontend exposes a security-flow mismatch with active server APIs. The user chose to retain it behind `MFA_LOGIN_ENABLED`; the API is the single source of truth, false preserves password-only login, and true restores enrollment/challenge routing before session creation.
12. Git history contains the prior enrollment/challenge branch, and all required repository, TOTP, completion-handler, store, and page primitives remain present; no new auth protocol is required.
13. Migrations, Terraform, worker/scheduler commands, BDA scripts, Linux optional native packages, coverage tooling, and shared types have valid non-obvious consumers and remain protected.

## Phase 1: Design Outcomes

- `ReachabilityRecord` captures production, flag, test, configuration, dynamic, infrastructure, and operator edges against a named baseline.
- `PruningCandidate` carries its inherited Spec 024 group, evidence, high-confidence requirement, decision, and verification.
- `ProtectedSurface` makes security, public API, migration, fixture, provider, feature-flag, and operational boundaries explicit.
- `MfaLoginFlagState` defines the false direct-session state and true enrollment/challenge states, including cookie timing and landing-route rules.
- Seven `DeletionGroup` units keep review, verification, and rollback localized.
- `VerificationRecord` distinguishes a new pass, unchanged baseline failure, regression, and blocked environment check.
- The pruning safety contract fixes exact retained routes/providers/security/APIs and the approved group boundary.
- The quickstart includes a reproducible TypeScript reachability report plus baseline, focused, dependency, infrastructure, and final validation commands.

## Implementation Sequence

1. Capture the implementation-start commit, tracked file/byte counts, workspace/dependency state, reachability report, active Azure/provider scans, full API/web gates, both Magic flag builds, current password-only auth behavior, and known baseline failures.
2. Add API and web characterization tests for `MFA_LOGIN_ENABLED=false` and `true`, including enrollment/challenge results, no pre-MFA cookie, completion, missing-token redirects, and both Magic/legacy landing destinations.
3. Add `config.mfaLoginEnabled`, `.env.example` guidance, and a false-default Terraform `mfa_login_enabled` input wired into the shared API environment map/tfvars examples; guard the known login enrollment/challenge branch; type the web login union; reconnect `LoginPage`, `authFlowStore`, `/mfa/setup`, and `/mfa`; verify both MFA states before deletion.
4. Create `pruning-manifest.md`; import all six Spec 024 deferred groups and classify every iteration-2 candidate and protected surface, treating the MFA closure as retained/reconnected.
5. Retarget canonical sign-off coverage and isolate the stale summary-card assertions before deleting their implementation subjects.
6. Remove the legacy partnership web closure and its sole-purpose tests; run entity, partnership, flag, and guard checks.
7. Remove the obsolete K-1 web client/workbook/input closure; run current upload, dashboard, review, form, and tracker checks while preserving backend contracts.
8. Remove stale partnership proxies, isolated report/review leaves, and unreferenced starter assets; run focused mixed-suite verification.
9. Remove obsolete process-local seeds, update exact stale guidance, and remove `transfer:prepare`; verify operational entries, migrations, and retained seed references.
10. Remove the MUI theme/provider/test and four web dependencies; regenerate the lockfile, run a clean install, zero-reference scan, root route tests, color audit, and both Magic builds.
11. Recompute reachability and classify every newly exposed path as retained or deferred unless already covered by an approved group.
12. Run both MFA states, focused BDA/stub/API checks, full API/web checks, both Magic builds/route matrix, Terraform validation, npm checks, guards, Azure/provider scans, migration/fixture diffs, and repository hygiene.
13. Finalize actual file/byte/dependency deltas and all verification/deferred records in the manifest.

## Complexity Tracking

No constitution violations or new architectural subsystem are introduced. The one API runtime flag reuses the existing environment parser and existing MFA protocol; it makes session issuance explicit without adding a second browser-side switch. The reachability inventory, manifest, and multi-variant validation are maintenance evidence, not production architecture. Backend K-1 public API ambiguity remains outside this deletion branch rather than being resolved implicitly.
