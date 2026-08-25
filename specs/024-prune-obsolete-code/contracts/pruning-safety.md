# Repository Pruning Safety Contract

This contract defines the observable guarantees for the first obsolete-code pruning iteration. It is a repository-maintenance contract, not a runtime API.

## 1. Supported K-1 extraction contract

- The supported extractor backend values remain exactly `stub` and `aws_bda`.
- `stub` remains the offline/default path for deterministic development and CI.
- `aws_bda` remains the production provider and retains BDA/Bedrock, S3, SQS/EventBridge, worker, mapping, evidence, retry, classification, and Terraform support.
- Azure Document Intelligence is not selectable, configured, documented for operation, or present as a dependency.
- Provider-neutral concepts such as confidence, source location, evidence, parse errors, retries, matching, review, and application remain intact.

## 2. Magic Patterns compatibility contract

`VITE_MAGIC_PATTERN_DESIGNS` is evaluated by `apps/web/src/config/featureFlags.ts` from the Vite environment. Enabled string values remain trimmed/case-insensitive `1`, `true`, `yes`, and `on`; missing or other values remain false.

| Route/surface | Flag false | Flag true |
|---|---|---|
| `/` login | Legacy login; successful login targets `/liquidity` | Magic Patterns login; successful login targets `/dashboard` |
| `/dashboard` | Redirect to `/liquidity` | Magic Patterns dashboard |
| `/entities` | Legacy entities page | Magic Patterns entities page |
| `/entities/:id` | Legacy entity detail | Magic Patterns entity detail |
| `/investment-tracker` | Current coming-soon/disabled experience | Magic Patterns investment tracker |
| `/partnership-tracker?...` | Legacy partnership tracker content | Redirect to `/investment-tracker` with query string preserved |
| Shared `AppShell` pages | Legacy shell/navigation semantics | Magic Patterns shell/grouped navigation semantics |

Additional invariants:

- Partnership redirect query keys `partnership`, `area`, and `year` remain intact.
- Area aliases remain: `cash-activity -> capital-activity`, `k1 -> k1-history`, `capital -> valuations`, and `assets -> underlying-assets`.
- Valid investment years remain integers from 1900 through 2100.
- Existing page-specific overrides remain unchanged, including Estate Map's current Magic appearance behavior and explicit false/true injection in entity surfaces.
- A Magic-named shared module is not deletable merely because one flag graph does not reach it.

## 3. Protected repository surfaces

The following are outside deletion scope for iteration one:

- Every SQL migration under `apps/api/src/infra/db/migrations/`.
- Current Amazon BDA/AWS source, config, infrastructure, fixtures, scripts, and tests.
- The offline K-1 stub and provider-neutral extraction contracts.
- Authoritative fixtures under explicit test fixture directories.
- Operational scripts invoked by Terraform, npm scripts, or documented direct commands.
- Manual database seeds pending separate inventory.
- Non-Azure historical feature specifications and contracts.
- MFA pages and `authFlowStore` pending a security/product decision.
- All code reachable from either Magic Patterns value, including shared cross-branch dependencies.

## 4. Evidence threshold for removal

A candidate is removable only after all applicable checks are recorded:

1. No unresolved static import/export or documentation link requires it.
2. It is absent from application, worker, package, build, test, and infrastructure entry graphs.
3. It is not discovered by filename/glob convention, including migrations and fixtures.
4. It is not a direct operator, Terraform, package-script, or seed command.
5. It is not required by either Magic Patterns value or a page-specific appearance override.
6. Dependencies are not required as peers, plugins, optional tools, or config-loaded packages.
7. A current authority/replacement is identified when the candidate represents product behavior or architecture.
8. Relevant focused and full verification gates pass after removal.

Unresolved evidence produces `DEFER`, never speculative deletion.

## 5. Deletion ordering contract

1. Capture baseline behavior and counts.
2. Add missing protected-surface tests.
3. Record the candidate and its evidence in the pruning manifest.
4. Apply one cohesive deletion group.
5. Update sole-purpose exports, config, active docs, guards, and lockfile in the same group.
6. Run focused verification for the group.
7. Run the complete matrix before declaring the branch complete.

## 6. Acceptance matrix

| Gate | Required result |
|---|---|
| Azure active-tree scan | No runtime/config/dependency/operator references; retirement plan references are allowed |
| Extractor selection | Only `stub | aws_bda`; focused BDA/stub tests pass |
| API | TypeScript build and full Vitest suite pass |
| Web static checks | ESLint, typecheck, and color audit pass |
| Web tests | Full Vitest/RTL suite plus new dual-variant route tests pass |
| Flag false build | Vite production build succeeds and false route matrix passes |
| Flag true build | Vite production build succeeds and true route matrix passes |
| Redirects | Compatibility routes and partnership query preservation pass |
| npm | Clean install succeeds from `package-lock.json`; no second lockfile |
| Artifacts | No tracked `/tmp/`, root local K-1 PDF, or source-adjacent generated JS remains |
| Guards | Updated import guard scripts pass and do not refer to removed active paths |
| Repository hygiene | `git diff --check` passes; tracked file/byte deltas match the manifest |

## 7. Non-goals

- Rewriting Git history.
- Deleting the external Azure resource or secrets from a cloud secret store.
- Redesigning or consolidating Magic Patterns and legacy UI implementations.
- Removing MFA capability or changing authentication behavior.
- Squashing or deleting migration history.
- Establishing a repository-wide historical spec retention policy.
- Bulk-deleting every provisional unreachable file found by a new analyzer.
- Changing runtime APIs, routes, permissions, calculations, persistence, or visuals.
