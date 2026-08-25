# Repository Pruning Safety Contract: Iteration 2

This is a repository-maintenance contract. It defines the observable guarantees that must hold while removing the second evidence-backed stale-code set.

## 1. Baseline and evidence contract

- The baseline is merged `main` commit `8baaadda1eb483414f4f5e62c54d672e7dfba8a8` unless implementation begins from a newer explicitly recorded commit.
- Spec 024 remains unchanged as the completed first-pass audit record.
- Every Spec 024 deferred group receives a current `REMOVE`, `RETAIN`, or `DEFER` classification.
- Static import absence alone never authorizes deletion.
- Every removal belongs to one manifest deletion group with an authority/replacement and verification IDs.

## 2. Supported extraction contract

- Supported extractor values remain exactly `stub` and `aws_bda`.
- `stub` remains available for offline development and deterministic CI.
- `aws_bda` remains the production implementation, including Bedrock Data Automation, S3, SQS/EventBridge, worker, mapping, evidence, retry, reconciliation, evaluation, and Terraform paths.
- Active code, configuration, manifests, lockfile, scripts, tests, fixtures, environment examples, and operator documentation contain no Azure Document Intelligence integration.
- Intentional retirement/audit references in Specs 024 and 025 are permitted.

## 3. Web route and feature-flag contract

`VITE_MAGIC_PATTERN_DESIGNS=false` and `true` remain separate supported graphs.

| Route/surface | Flag false | Flag true |
|---|---|---|
| `/` | Legacy login; success targets `/liquidity` | Magic login; success targets `/dashboard` |
| `/dashboard` | Redirects to `/liquidity` | Magic dashboard renders |
| `/entities` | Legacy entity list | Magic entity list |
| `/entities/:id` | Legacy entity detail | Magic entity detail |
| `/partnership-tracker` | Current partnership tracker workspace | Query-preserving redirect to investment tracker |
| `/investment-tracker` | Current unavailable/coming-soon state | Magic investment tracker workspace |
| `/k1` | Current K-1 dashboard/upload flow | Same supported K-1 route |
| `/k1/:id/review` | Current review/apply flow | Same supported K-1 route |
| `/mfa/setup` | Pre-auth enrollment route when required by API | Same pre-auth enrollment route |
| `/mfa` | Pre-auth TOTP challenge route when required by API | Same pre-auth challenge route |
| Estate Map/shared shell | Existing explicit appearance behavior | Existing explicit appearance behavior |

Additional guarantees:

- Partnership query keys and area aliases remain unchanged.
- `PartnershipTrackerPageContent`, `K1BasisWorkspace`, aggregation surfaces, Magic workspace components, and their current clients/hooks remain live.
- Shared entity/assets clients used by Entity Detail, Estate Map, and Magic workspaces remain live.
- Canonical K-1 tracker form, result, reconciliation, and sign-off components remain live.
- Removing the unused MUI provider must not change route output, interaction, color governance, or either production build.

## 4. Security and API contract

- `MFA_LOGIN_ENABLED` is a server runtime boolean and defaults to `false`.
- The web app has no independent MFA enforcement flag.
- With the flag false or unset, valid password login preserves the current session response, cookie, audit event, and flag-appropriate landing route.
- With the flag true, valid password login returns `MFA_ENROLL_REQUIRED` for a user without completed enrollment or `MFA_REQUIRED` for an enrolled user.
- Enrollment/challenge responses do not set the session cookie, authenticate the client session store, or increment completed-session state.
- `MFAPage`, `MFASetupPage`, and `authFlowStore` remain compiled and are reached only from the typed login response. Missing or expired in-memory flow tokens redirect to `/`.
- Successful MFA enrollment or verification creates the session and navigates to `/dashboard` for the Magic design or `/liquidity` for the legacy design.
- Server MFA routes, repository state, TOTP behavior, lockout behavior, admin status/reset behavior, persisted enrollment state, and audit events remain supported in both flag states.
- `apps/api/.env.example` and AWS Terraform expose the same server flag; Terraform defaults it to false and passes it through the shared API environment map.
- Operator environment guidance documents that changing the flag requires an API restart/redeployment but not a web rebuild.
- Backend `/k1-tracker` routes, repository behavior, and workbook-import contracts remain unchanged even when their obsolete web dialog/client is removed.
- Except for the requested feature-flagged MFA branch, no route, public API, permission, calculation, persistence behavior, or supported workflow is intentionally changed.

## 5. Dynamic and operational entry contract

- Every SQL migration remains byte-for-byte present from the iteration baseline.
- Migration files remain protected even with duplicate numeric prefixes because discovery and recording use exact filenames.
- Authoritative fixtures remain protected when production import reachability is absent.
- Terraform and package commands are valid consumers of worker, scheduler, reconciler, refresh, and deployment scripts.
- `004_partnership_fixtures.ts` remains as the documented PostgreSQL seed.
- Linux-specific optional Rolldown and Lightning CSS dependencies remain protected; `UNMET OPTIONAL` on Windows is not evidence of staleness.
- Bitwarden, deployment, BDA promotion/evaluation, local-development, and import-guard scripts remain available.

## 6. Approved deletion boundary

Iteration 2 may remove only manifest-approved members of these groups:

1. The unreachable legacy partnership presentation/CRUD/query closure and sole-purpose tests.
2. The obsolete K-1 web client/workbook/input closure and sole-purpose test.
3. Stale partnership-tracker proxies/placeholders, with sign-off coverage retargeted to the canonical component.
4. Isolated report/review leaves and unreferenced starter assets, without deleting shared report fixtures.
5. Three obsolete process-local seed scripts and their exact stale guidance.
6. The orphaned MUI theme/provider/test/dependency closure.
7. The broken `transfer:prepare` npm entry whose target does not exist.

Any newly exposed candidate must be recorded as retained or deferred unless it fits one of these groups and receives the same evidence review.

## 7. Deletion ordering contract

1. Record branch, commit, file/byte counts, dependency state, provider scan, and all baseline gates.
2. Create the iteration-2 manifest and classify all inherited deferred groups.
3. Add failing characterization tests for both MFA flag states, enrollment/challenge routing, cookie timing, missing-token redirects, and both landing destinations.
4. Reconnect MFA behind the server flag and verify the auth contract before any deletion group.
5. Add or retarget pruning protection tests before deleting the implementation they distinguish.
6. Apply one deletion group at a time.
7. Update mixed tests, exact documentation, manifests, and lockfile in the same group.
8. Run focused verification and record actual results before starting the next group.
9. Recompute reachability after source groups and classify newly exposed candidates.
10. Run the complete final matrix and record actual deltas.

## 8. Acceptance matrix

| Gate | Required result |
|---|---|
| Azure/provider | Zero active Azure references; exact providers `stub`, `aws_bda` |
| MFA flag off | Password login creates the current session/cookie and lands correctly in both designs |
| MFA flag on | Enrollment/challenge responses create no session; completion creates the session and lands correctly |
| MFA routing | `/mfa/setup` and `/mfa` handle valid state and redirect missing/expired state to login |
| Reachability | All Spec 024 deferred groups and all planned files classified |
| API | TypeScript build and focused BDA/stub tests pass; full suite does not regress baseline |
| Web static | Lint, typecheck, and color audit do not regress baseline |
| Web tests | Focused route/component tests pass; full suite does not regress baseline |
| Flag false | Production build and route matrix pass |
| Flag true | Production build and route matrix pass |
| MUI cleanup | Zero active MUI/Emotion/theme references and no route/build regression |
| npm | Lockfile regenerates; clean install and workspace listing succeed |
| Operations | Removed seed/script names have no active references; retained entries remain referenced |
| Migrations/fixtures | No baseline migration or authoritative fixture is deleted or modified |
| Guards | K-1 and partnership import guards pass |
| Hygiene | `git diff --check` passes and manifest deltas match Git |

## 9. Non-goals

- Adding a separate frontend MFA feature flag.
- Enabling MFA by default in existing environments.
- Making MFA challenges/enrollment tokens durable across API processes.
- Removing server MFA or admin MFA controls.
- Removing backend K-1 tracker/import API contracts.
- Consolidating the Magic and legacy product designs.
- Deleting migrations, rewriting Git history, or deleting cloud resources/secrets.
- Bulk-deleting historical specifications.
- Normalizing direct shared-types imports or changing build/deployment dependency categories.
- Fixing unrelated baseline product, lint, typecheck, or integration-test failures.
