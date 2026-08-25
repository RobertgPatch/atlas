# Phase 0 Research: Obsolete Code Pruning, Iteration 2

## Decision 1: Treat Spec 024's merged result as the only baseline

**Decision**: Base iteration 2 on merged `main` commit `8baaadda1eb483414f4f5e62c54d672e7dfba8a8`. Preserve every Spec 024 artifact as completed pruning evidence and recompute reachability rather than carrying the old 59-file provisional count forward.

**Rationale**:

- Spec 024 removed the roots that originally exposed several ambiguous dependency closures.
- The merged repository now has 1,028 tracked files, 339 files under `apps/web/src`, and 206 files under `apps/api/src`.
- A current TypeScript import-graph walk from `apps/web/src/main.tsx` finds 45 production-unreachable non-test modules, not an independently meaningful 59-file deletion set.
- Current entry points, tests, scripts, and infrastructure have changed since the provisional first-pass analysis.

**Alternatives considered**:

- Delete the provisional 59 files as a batch: rejected because several members are live through current K-1 upload, entity, partnership-tracker, test, and feature-flag paths.
- Continue on Spec 024's branch: rejected because Spec 024 explicitly required a new numbered iteration for higher-risk closures.

## Decision 2: Azure Document Intelligence is absent; keep a zero-reference invariant

**Decision**: Do not create an Azure deletion group. Record and re-run an active-tree scan proving that Azure Document Intelligence remains absent. Retain only the historical retirement/audit mentions in Specs 024 and 025.

**Rationale**:

- Case-insensitive scans of `apps`, `packages`, `infra`, `scripts`, `docs`, root manifests, lockfile, tests, fixtures, environment examples, and configuration return zero active matches for Azure provider names, packages, client classes, or environment variables.
- `package-lock.json` contains no `@azure` dependency.
- Provider selection is exactly `stub | aws_bda` in API config, the extractor contract, the factory map, environment guidance, Terraform, and provider tests.
- Amazon BDA plus the deterministic offline stub remain the complete supported extraction architecture.

**Alternatives considered**:

- Remove all textual uses of the word Azure, including Spec 024: rejected because those references are the audit record proving why and how the provider was retired.
- Rewrite Git history: rejected as destructive and outside working-tree pruning.

## Decision 3: Approve a 51-file web deletion boundary

**Decision**: Remove 51 web files that have no production path from `main.tsx` under either Magic Patterns state and whose remaining inbound edges are internal to the dead closure or sole-purpose tests. Retarget the one live-behavior test that imports a stale proxy.

### Group A: legacy partnership presentation and CRUD/query closure

Remove 23 source modules under `apps/web/src/features/partnerships/`:

- `api/fmvClient.ts`
- components `ActivityDetailPreview`, `AddAssetDialog`, `AddCapitalActivityDrawer`, `AddCommitmentDrawer`, `AddPartnershipDialog`, `AssetDetailDrawer`, `AssetsSection`, `AssetValuationHistory`, `CapitalActivitySection`, `CapitalOverviewSection`, `EditPartnershipDialog`, `ExpectedDistributionSection`, `FmvSnapshotsSection`, `K1HistorySection`, `PartnershipFilters`, `PartnershipKpiStrip`, `RecordAssetFmvDialog`, and `RecordFmvDialog`
- hooks `useFmvMutations`, `usePartnershipExport`, `usePartnershipMutations`, and `usePartnershipQueries`

Remove the six sole-purpose component tests for `AddAssetDialog`, `AssetDetailDrawer`, `AssetsSection` (three files), and `RecordAssetFmvDialog`.

The retained partnership authority is the current `features/partnership-tracker` workspace plus the shared `features/partnerships` entity/assets clients and `PartnershipDirectoryTable` used by live entity and Magic surfaces.

### Group B: older K-1 client/workbook/input closure

Remove:

- `features/k1-tracker/api/k1TrackerClient.ts`
- `features/k1-tracker/hooks/useK1Tracker.ts`
- `features/k1-tracker/components/ImportWorkbookDialog.tsx`
- `features/k1-tracker/components/K1InputsPanel.tsx`
- `features/k1-tracker/components/PartnershipPicker.tsx`
- the sole-purpose `ImportWorkbookDialog.test.tsx`

The retained authority is the live `features/partnership-tracker/api/partnershipTrackerClient.ts`, `usePartnershipTracker.ts`, current K-1 form/results components, `/k1` dashboard/upload workflow, and `/k1/:id/review` workflow. Backend `/k1-tracker` routes and workbook-import contracts remain outside this web deletion group.

### Group C: stale partnership-tracker proxies and placeholders

Remove nine unconsumed components: `JournalEntryPanel`, `K1InputsPanel`, `LiabilitiesPanel`, `OutsideBasisPanel`, `ReconciliationPanel`, `SignOffPanel`, `UnderlyingAssetsPlaceholder`, `YearStatusPanel`, and `YearSummaryCards` under `features/partnership-tracker/components`.

Retarget `PartnershipTrackerSignoff.test.tsx` from the stale proxy to the canonical live `features/k1-tracker/components/SignOffPanel.tsx`. Retain live proxies `AddYearDialog`, `CompareYearsDrawer`, and `YearRail`, which are imported by `K1BasisWorkspace`.

### Group D: isolated report/review leaves and starter assets

Remove:

- `features/reports/components/ConsolidatedHoldingsFilters.tsx`
- `features/reports/components/ConsolidatedHoldingsSummaryCards.tsx`
- `features/review/components/IssueQueueDialog.tsx`
- `features/review/components/K1ApplyPanel.tsx`
- `assets/hero.png`, `assets/react.svg`, and `assets/vite.svg`

Remove only the stale summary-card block/import from the mixed live `ConsolidatedHoldingsReport.test.tsx`. Retain `features/reports/fixtures/consolidatedHoldingsFixture.ts`, which supports four tests of live report/dashboard behavior.

**Rationale**:

- The static graph follows imports, exports, index files, and dynamic imports from the Vite production entry.
- Repository-wide inbound searches confirm the remaining edges are within these closures or their sole-purpose tests.
- Both feature-flag variants are statically present in `App.tsx`; targeted route tests provide the runtime complement to the graph.

**Alternatives considered**:

- Remove the entire `features/partnerships` directory: rejected because entity, asset, Estate Map, and shared client paths remain live.
- Remove the whole `features/k1-tracker` directory: rejected because canonical annual K-1 forms, results, reconciliation, and sign-off are live.
- Delete every production-unreachable fixture: rejected because test-only fixtures may protect current product contracts.

## Decision 4: Remove three obsolete process-local seed scripts and one broken npm entry

**Decision**: Remove `002_k1_fixtures.ts`, `003_review_fixtures.ts`, and `006_reports_fixtures.ts` from `apps/api/src/infra/db/seed/`; replace their stale invocation guidance in the corresponding historical specs with current test-fixture or setup guidance. Remove root `transfer:prepare`, whose target script does not exist.

**Rationale**:

- The three seeds have no source or test importer and only historical documentation references.
- They mutate process-local repositories and exit; the durable PostgreSQL application no longer bootstraps the in-memory users/partnerships they require.
- `004_partnership_fixtures.ts` is different: it is a real PostgreSQL operator seed and remains documented and usable.
- `package.json` invokes missing `scripts/prepare-laptop-transfer.ps1`; the script entry is already nonfunctional and is its only reference.

**Alternatives considered**:

- Retain all importless seeds as operational entries: rejected for the three process-local scripts after inspecting their execution model and references.
- Delete every seed: rejected because the partnership fixture is a documented direct PostgreSQL tool.
- Rebuild the missing laptop-transfer script: rejected because pruning should remove a broken entry, not invent a new operational workflow.

## Decision 5: Remove the orphaned MUI theme/dependency closure

**Decision**: Remove `apps/web/src/theme/muiTheme.ts`, its sole-purpose test, and the `ThemeProvider` wrapper/import in `main.tsx`. Remove `@mui/material`, `@mui/icons-material`, `@emotion/react`, and `@emotion/styled` from the web manifest and regenerate `package-lock.json`.

**Rationale**:

- No live source imports an MUI component, icon, `useTheme`, or Emotion API.
- The only MUI runtime edges are the root `ThemeProvider` and `createTheme`; its component overrides target absent MUI components.
- Emotion is retained only as an MUI peer, so it can be removed only with the whole MUI closure.
- Both flag builds and root route smoke tests will detect accidental theme-provider coupling.

**Alternatives considered**:

- Remove only `@mui/icons-material`: rejected as an incomplete cleanup when the entire unused MUI provider closure is proven isolated.
- Keep the provider for possible future MUI use: rejected under YAGNI; dependencies can be restored with a future intentional MUI feature.
- Remove Emotion while retaining MUI: rejected because Emotion is an MUI runtime peer.

## Decision 6: Restore MFA login behind one server-owned runtime flag

**Decision**: Retain and reconnect `MFAPage.tsx`, `MFASetupPage.tsx`, `authFlowStore.ts`, the MFA auth-client methods/types, and the existing server MFA handlers. Add `MFA_LOGIN_ENABLED` to API configuration with a compatibility default of `false`. When false, login keeps the current direct-session behavior. When true, login follows the repository's established enrollment/challenge flow and withholds the session until completion. Backend `/k1-tracker` routes, repository code, and workbook-import contracts remain deferred from deletion.

**Rationale**:

- The repository still contains the original MFA screens, store, TOTP service, enrollment/challenge repositories, completion handlers, admin reset/status behavior, and audit events.
- Git history contains the prior password-to-enrollment/challenge branching logic, so the feature can be restored by guarding a known implementation rather than inventing a new protocol.
- A server runtime flag is authoritative at the point where a session is created. A second Vite flag could disagree with the API and either strand a challenge or bypass an intended security control.
- Keeping `/mfa/setup` and `/mfa` compiled as pre-auth routes lets the web client follow the API response without rebuilding for a flag change.
- Defaulting to false preserves the current deployed password-only behavior; operators enable MFA per API environment and restart the process.
- Backend K-1 tracker/import endpoints have independent API and integration coverage even though the older web dialog is unreachable.

### Flag behavior

| `MFA_LOGIN_ENABLED` | Valid password result | Session cookie timing | Web transition |
|---|---|---|---|
| unset/false/invalid | `SessionResponse` | Created during password login | Current Magic or legacy landing page |
| true, enrollment required | `MFA_ENROLL_REQUIRED` | Only after successful enrollment completion | `/mfa/setup`, then flag-appropriate landing page |
| true, already enrolled | `MFA_REQUIRED` | Only after successful TOTP verification | `/mfa`, then flag-appropriate landing page |

The API config uses its existing boolean parser. `authClient.login` becomes a union response, `LoginPage` stores the enrollment/challenge and routes accordingly, and `App.tsx` restores the two pre-auth routes. MFA completion pages use the current Magic Patterns flag only to select the post-authentication destination; it does not control whether MFA is enforced. AWS Terraform exposes `mfa_login_enabled` with a false default and passes it into the shared API/worker/scheduled-task environment map so deployed environments can toggle the same server value through tfvars.

**Alternatives considered**:

- Delete unmounted MFA UI: rejected by the user's request to make MFA intentionally toggleable.
- Introduce both `MFA_LOGIN_ENABLED` and `VITE_MFA_LOGIN_ENABLED`: rejected because two independent flags can drift and create unsafe or unusable states.
- Make MFA enabled by default: rejected because this pruning iteration must preserve the currently deployed password-only behavior until an operator opts in.
- Toggle MFA per browser at build time: rejected because the API, not the browser, must control session issuance.
- Delete backend K-1 APIs with their old web consumer: rejected because a web importer is not the only possible API consumer.

## Decision 7: Preserve dynamically and operationally discovered surfaces

**Decision**: Retain all SQL migrations, current Terraform modules, workers, scheduled commands, BDA evaluation/promotion scripts, Bitwarden/deployment/local-development scripts, import guards, Linux optional native packages, coverage tooling, shared types workspace, and the PostgreSQL partnership seed. Retain non-Azure historical spec directories pending a separate retention policy.

**Rationale**:

- Migrations are filename-discovered, sorted, copied into the API image, and recorded by exact name.
- Terraform and package scripts directly invoke the Plaid refresh, market refresh, K-1 worker, and extraction reconciler entries.
- Optional Rolldown/Lightning CSS Linux bindings are intentionally absent on Windows and pinned for Linux deployment.
- Coverage, compiler, lint, test, and ambient type packages are tooling consumers even without runtime imports.
- `packages/types` is used by application source and copied into the API build image.

**Alternatives considered**:

- Delete importless scripts: rejected because direct commands and infrastructure are valid entry points.
- Delete non-Azure specs by age: rejected because several remain linked from active code, shared types, CI guards, migrations, and repository instructions.

## Decision 8: Use staged verification and baseline comparison

**Decision**: Capture all API/web/dependency/build results before deletion, add explicit false/true MFA flag-state coverage before reconnecting the flow, apply one cohesive pruning group at a time, run focused checks after each group, and run the complete matrix at the end. Record baseline failures rather than requiring pruning to repair unrelated defects.

**Rationale**:

- Spec 024 recorded pre-existing API/web failures and a Windows native-binary lock that blocked `npm ci`.
- Root/provider changes and dependency removal require both flag builds even when TypeScript reference checks are clean.
- MFA verification requires separate API module-load environments for `MFA_LOGIN_ENABLED=false` and `true`, plus web response-routing tests for both design landing pages.
- Migration, fixture, operational, Azure, and provider scans cover valid consumers that unit tests may miss.

**Alternatives considered**:

- Run only typecheck after deletion: rejected because typecheck does not cover routes, runtime providers, scripts, dependency installation, or feature-flag builds.
- Require unrelated baseline failures to be fixed in this branch: rejected because that expands behavior-preserving pruning into product repair.
