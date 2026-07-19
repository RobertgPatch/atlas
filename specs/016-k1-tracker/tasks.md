# Tasks: Partnership Tracker Single-Page K-1 Entry and Overview Revision

**Input**: Revised design documents from `/specs/016-k1-tracker/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/k1-tracker.openapi.yaml`, `quickstart.md`
**Baseline**: The original Partnership Tracker rollout is implemented. These tasks cover only the 2026-07-13 revision and preserve existing partnership, commitment, NAV, audit, authorization, and manual-year behavior unless explicitly changed below.
**Tests**: Required because the specification defines independent tests and measurable financial outcomes.

## Phase 1: Revision Setup

**Purpose**: Extend existing fixtures with the changed-spec scenarios before shared contracts and components move.

- [X] T001 Add two-year performance, liability-change, canonical-only, legacy-only, equal-duplicate, and conflicting-contribution fixture builders in `apps/api/tests/helpers/partnershipTrackerFixture.ts`
- [X] T002 [P] Add nullable aggregate, performance-status, single-page field, and accepted currency-input fixtures in `apps/web/src/features/partnership-tracker/__tests__/fixtures.ts`

---

## Phase 2: Foundational Components and Contracts

**Purpose**: Establish shared currency behavior and wire shapes that block all changed user stories.

**Critical**: Complete this phase before story implementation.

- [X] T003 [P] Write parser, formatter, blur behavior, signed/nonnegative, null, malformed grouping, and precision tests in `apps/web/src/components/shared/CurrencyInput.test.tsx`
- [X] T004 Implement reusable `en-US` currency parsing, exact two-decimal normalization, and accessible blur-format/error behavior in `apps/web/src/components/shared/currencyInput.ts` and `apps/web/src/components/shared/CurrencyInput.tsx`
- [X] T005 [P] Extend shared and API-local Partnership Tracker summary contracts with nullable contribution/distribution totals, latest Section L capital, DPI, TVPI, IRR, and per-metric availability in `packages/types/src/partnership-tracker.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.contracts.ts`
- [X] T006 [P] Define the canonical writable contribution key while retaining the legacy key for read provenance in `packages/types/src/k1-tracker.ts`, `apps/api/src/modules/k1-tracker/k1-tracker.contracts.ts`, and `apps/api/src/modules/k1-tracker/k1-tracker.zod.ts`
- [X] T007 Add client-boundary tests proving formatted UI values normalize before requests while exact two-decimal API payloads remain unchanged in `apps/web/src/features/partnership-tracker/__tests__/partnershipTrackerClient.test.ts`

**Checkpoint**: Shared UI money controls and revised contracts are stable for parallel story work.

---

## Phase 3: User Story 1 - Find and Manage a Partnership (Priority: P1)

**Goal**: Expand the selected-partnership Overview with cumulative K-1 performance and deterministic unavailable states.

**Independent Test**: Select a partnership with the 2021/2022 fixture and verify paid-in capital, distributions, capital account, outside basis, NAV, DPI, TVPI, and IRR match the active annual revisions while liabilities have no effect.

### Tests for User Story 1

- [X] T008 [P] [US1] Add list/detail contract coverage for every revised summary field, fixed-decimal ratios, per-metric statuses, and missing-versus-explicit-zero behavior in `apps/api/tests/partnership-tracker.contract.test.ts`
- [X] T009 [P] [US1] Add dated IRR tests for the 6.4-percent reference fixture, nonconsecutive years, combined same-date flows, missing NAV, stale NAV, insufficient signs, negative returns, and ambiguous roots in `apps/api/tests/partnership-tracker.performance.test.ts`
- [X] T010 [P] [US1] Add durable aggregation tests for active revisions, absolute Box 19 sums, canonical contribution precedence, legacy fallback, latest Section L capital, latest NAV, and liability exclusion in `apps/api/tests/partnership-tracker.performance.integration.test.ts`
- [X] T011 [P] [US1] Add Overview rendering tests for the reference metric order, money/ratio formatting, null states, status labels, and read-only behavior in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPageContent.test.tsx`

### Implementation for User Story 1

- [X] T012 [US1] Implement pure dated cash-flow composition, DPI/TVPI division, IRR solving, fixed-decimal output, and explicit unavailable statuses in `apps/api/src/modules/partnership-tracker/partnership-performance.ts`
- [X] T013 [US1] Extend the scoped set-based summary query to aggregate active annual contribution/distribution revisions and latest Section L capital without N+1 year reads in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T014 [US1] Compose latest NAV with performance calculations and map nullable totals/statuses into list and detail responses in `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T015 [P] [US1] Implement the compact Paid-in, Distributions, Capital account, Outside basis, NAV, DPI, TVPI, and IRR strip in `apps/web/src/features/partnership-tracker/components/PerformanceMetricStrip.tsx`
- [X] T016 [US1] Integrate the performance strip and unavailable-state details into the selected-partnership Overview in `apps/web/src/features/partnership-tracker/components/PartnershipOverview.tsx`
- [X] T017 [US1] Invalidate and refresh Overview summaries after annual K-1 or NAV mutations without adding per-year browser requests in `apps/web/src/features/partnership-tracker/hooks/usePartnershipTracker.ts`
- [X] T018 [US1] Run the US1 contract, performance, and Overview tests and reconcile the expected figures in `apps/api/tests/partnership-tracker.performance.test.ts` and `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerPageContent.test.tsx`

**Checkpoint**: Overview independently reports trusted cumulative performance for an existing partnership.

---

## Phase 4: User Story 2 - Add a Partnership and Start Its First K-1 Year (Priority: P1)

**Goal**: Preserve the existing create-to-first-year flow while making the destination an inline annual-entry surface.

**Independent Test**: Create a partnership, add any unused tax year, and verify the selected year opens in the page workspace without an editor drawer, category step, or Next button.

### Tests for User Story 2

- [X] T019 [P] [US2] Extend first-year tests for immediate selection, arbitrary-year creation, inline editor destination, and absence of drawer/Next controls in `apps/web/src/features/partnership-tracker/__tests__/FirstK1YearFlow.test.tsx`

### Implementation for User Story 2

- [X] T020 [US2] Route newly created and newly added years into an inline `K1YearEntryForm` boundary while preserving selection and empty-year states in `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx` and `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`
- [X] T021 [US2] Run the create-to-first-year regression and resolve focus/status regressions in `apps/web/src/features/partnership-tracker/__tests__/FirstK1YearFlow.test.tsx`

**Checkpoint**: Partnership creation still reaches a usable selected-year entry surface without navigation steps.

---

## Phase 5: User Story 3 - Enter and Review Manual K-1 Years (Priority: P1)

**Goal**: Put every editable annual field on one page, canonicalize contributions, exclude liabilities from calculations, and accept forgiving US currency input.

**Independent Test**: Enter every supported field in one selected year using values such as `1000`, `$1,000`, `1000.5`, and `(1,000)`, preview and save once, and verify there are no category tabs or Back/Next controls, only one contribution input exists, and liability changes affect no sum or status.

### Tests for User Story 3

- [X] T022 [P] [US3] Add calculation regression cases proving liabilities do not change basis, distributions, taxable excess, warnings, workflow status, or sign-off blockers and canonical contributions feed both basis and Section L in `apps/api/tests/partnership-tracker.calculation-regression.test.ts`
- [X] T023 [P] [US3] Add durable projection cases for legacy-only, canonical-only, equal duplicate, and conflicting contribution revisions with no double counting or provenance loss in `apps/api/tests/partnership-tracker.manual-year.integration.test.ts`
- [X] T024 [P] [US3] Add contract tests rejecting new `section_l_capital_contributed` writes while preserving legacy reads and exact normalized money payloads in `apps/api/tests/partnership-tracker.manual-year.contract.test.ts`
- [X] T025 [P] [US3] Replace wizard-oriented tests with all-field single-page, grouped ordering, one-contribution, no-tabs/no-Next, blur formatting, signed input, inline error, preview, and save coverage in `apps/web/src/features/partnership-tracker/__tests__/ManualK1Editor.test.tsx`
- [X] T026 [P] [US3] Add workflow tests for one change set, stale revision recovery, earlier-year invalidation, carryforward labels, and unsaved partnership/year/area/route navigation in `apps/web/src/features/partnership-tracker/__tests__/ManualK1Workflow.test.tsx`
- [X] T027 [P] [US3] Add keyboard order, field-label, error announcement, sticky-action, read-only, and focus-preservation coverage for the continuous form in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx`

### Implementation for User Story 3

- [X] T028 [US3] Add a new calculation version that removes liability increases/relief from every arithmetic and status gate while retaining reference-only liability analysis in `apps/api/src/modules/k1-tracker/k1-tracker.calculation.ts` and `apps/api/src/modules/k1-tracker/k1-tracker.field-map.ts`
- [X] T029 [US3] Project the legacy Section L contribution key into canonical `capital_contributions`, preserve conflicts, and make canonical values authoritative for calculations and carryforwards in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts`
- [X] T030 [P] [US3] Define document-oriented field groups, labels, sign rules, deprecated-key filtering, and carryforward display metadata in `apps/web/src/features/k1-tracker/k1FieldGroups.ts`
- [X] T031 [US3] Implement the complete inline annual form with all field groups, shared currency controls, provenance, override reasons, preview, save, revert, and sticky actions in `apps/web/src/features/k1-tracker/components/K1YearEntryForm.tsx`
- [X] T032 [P] [US3] Compose summary, outside basis, reference liabilities, reconciliation, journal, and sign-off results below the form without category tabs in `apps/web/src/features/k1-tracker/components/K1YearResults.tsx`
- [X] T033 [US3] Replace drawer and selected-year tab state with inline form/result composition and a single expected-revision change set in `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx`
- [X] T034 [P] [US3] Change liability copy and derived rows to state reference-only treatment and remove liability basis/distribution movements in `apps/web/src/features/k1-tracker/components/LiabilitiesPanel.tsx` and `apps/web/src/features/k1-tracker/components/OutsideBasisPanel.tsx`
- [X] T035 [P] [US3] Render canonical Capital contributions once in Section L and surface legacy conflicts without a duplicate editable input in `apps/web/src/features/k1-tracker/components/ReconciliationPanel.tsx` and `apps/web/src/features/k1-tracker/components/K1InputsPanel.tsx`
- [X] T036 [US3] Implement unsaved-change interception for partnership, year, top-level area, route, and browser-exit navigation in `apps/web/src/features/partnership-tracker/components/K1BasisWorkspace.tsx` and `apps/web/src/features/partnership-tracker/components/PartnershipTrackerPageContent.tsx`
- [X] T037 [US3] Run the US3 API/web suites and reconcile the complete annual-entry section in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: The primary revised workflow is complete: all annual inputs are editable on one page with trusted calculations and forgiving currency entry.

---

## Phase 6: User Story 4 - Preserve Committed-Capital History (Priority: P2)

**Goal**: Apply the shared currency behavior to nonnegative committed-capital entries without changing effective-date history semantics.

**Independent Test**: Enter `1250000`, `1,250,000`, and `$1,250,000.5`, verify blur formatting and exact payloads, reject negative forms inline, and preserve backdated/stale-write behavior.

### Tests for User Story 4

- [X] T038 [P] [US4] Add integer, grouped, dollar-sign, one-decimal, negative rejection, malformed, normalized payload, correction, and focus tests in `apps/web/src/features/partnership-tracker/__tests__/CommitmentHistoryPanel.test.tsx`

### Implementation for User Story 4

- [X] T039 [US4] Replace the raw amount input with the shared nonnegative currency control while preserving create/update tokens and effective dates in `apps/web/src/features/partnership-tracker/components/CommitmentEntryDialog.tsx`
- [X] T040 [US4] Run commitment UI and API regressions and verify normalized amounts retain effective-date/audit behavior in `apps/web/src/features/partnership-tracker/__tests__/CommitmentHistoryPanel.test.tsx` and `apps/api/tests/partnership-tracker.commitment-history.integration.test.ts`

**Checkpoint**: Commitment history accepts natural US currency entry without weakening nonnegative or concurrency rules.

---

## Phase 7: User Story 5 - Record and Plot NAV History (Priority: P2)

**Goal**: Apply the shared currency behavior to nonnegative NAV entries and keep Overview return metrics synchronized.

**Independent Test**: Enter `3000000`, `3,000,000`, and `$3,000,000.5`, verify blur formatting/exact payloads and negative rejection, then confirm latest NAV, TVPI, and IRR refresh after save.

### Tests for User Story 5

- [X] T041 [P] [US5] Add integer, grouped, dollar-sign, one-decimal, negative rejection, malformed, normalized payload, duplicate-date, and focus tests in `apps/web/src/features/partnership-tracker/__tests__/NavHistoryPanel.test.tsx`

### Implementation for User Story 5

- [X] T042 [US5] Replace the raw NAV amount input with the shared nonnegative currency control and preserve duplicate/stale handling in `apps/web/src/features/partnership-tracker/components/NavEntryDialog.tsx`
- [X] T043 [US5] Run NAV UI/API regressions and verify NAV mutations refresh chart, Overview TVPI, and IRR in `apps/web/src/features/partnership-tracker/__tests__/NavHistoryPanel.test.tsx` and `apps/api/tests/partnership-tracker.nav-history.integration.test.ts`

**Checkpoint**: NAV entry uses the same forgiving currency behavior and immediately updates dependent performance metrics.

---

## Phase 8: User Story 6 - Reconcile and Sign Off a Year (Priority: P3)

**Goal**: Preserve reconciliation and sign-off rigor after canonical contribution and liability-rule changes.

**Independent Test**: Complete a year, change only liabilities, and verify calculated warnings/status/sign-off remain unchanged; then change canonical contributions and verify Section L, dependent years, and sign-off invalidation update once.

### Tests for User Story 6

- [X] T044 [P] [US6] Add sign-off contract/integration cases for liability non-blocking behavior, canonical contribution invalidation, legacy conflict blocking, and reviewed revision retention in `apps/api/tests/partnership-tracker.signoff.contract.test.ts` and `apps/api/tests/partnership-tracker.reconciliation.integration.test.ts`
- [X] T045 [P] [US6] Update reconciliation UI tests for below-form results, reference-only liability edits, canonical contribution changes, blocker announcements, and sign-off history in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerSignoff.test.tsx`

### Implementation for User Story 6

- [X] T046 [US6] Align workflow/check aggregation and sign-off invalidation with the new calculation version while retaining conflict and journal gates in `apps/api/src/modules/k1-tracker/k1-tracker.repository.ts` and `apps/api/src/modules/partnership-tracker/partnership-tracker.repository.ts`
- [X] T047 [US6] Run the US6 reconciliation/sign-off suites and reconcile the sign-off section in `specs/016-k1-tracker/quickstart.md`

**Checkpoint**: Reconciliation remains auditable while liabilities are manual-reference data and contributions have one authoritative value.

---

## Phase 9: Polish and Cross-Cutting Validation

**Purpose**: Remove obsolete interaction code and validate accessibility, performance, security, persistence, and documentation across the revision.

- [X] T048 [P] Add 50-year aggregate query-count and two-second response coverage for contribution/distribution/NAV metrics and IRR in `apps/api/tests/partnership-tracker.performance.integration.test.ts`
- [X] T049 [P] Add malformed raw API money, deprecated write-key, cross-entity, stale mutation, and error-sanitization coverage in `apps/api/tests/partnership-tracker.security.integration.test.ts`
- [X] T050 [P] Add cross-workflow keyboard, focus, visible-error, screen-reader label, and formatted-value coverage for K-1, commitment, and NAV money controls in `apps/web/src/features/partnership-tracker/__tests__/PartnershipTrackerAccessibility.test.tsx`
- [X] T051 Remove obsolete drawer/tab components and tests after inline coverage passes in `apps/web/src/features/partnership-tracker/components/EditYearDrawer.tsx`, `apps/web/src/features/partnership-tracker/components/SelectedYearTabs.tsx`, `apps/web/src/features/k1-tracker/components/EditYearDrawer.tsx`, `apps/web/src/features/k1-tracker/components/SelectedYearTabs.tsx`, and `apps/web/src/features/k1-tracker/__tests__/EditYearDrawer.test.tsx`
- [X] T052 Synchronize currency examples, exact API boundary wording, new component paths, and revised validation steps in `specs/016-k1-tracker/plan.md`, `specs/016-k1-tracker/data-model.md`, `specs/016-k1-tracker/contracts/k1-tracker.openapi.yaml`, and `specs/016-k1-tracker/quickstart.md`
- [X] T053 Run focused durable API tests with `npm run test:api -- partnership-tracker k1-tracker` and fix failures in `apps/api/src/modules/partnership-tracker/` and `apps/api/src/modules/k1-tracker/`
- [X] T054 Run focused web tests and builds with `npm run test:web -- PartnershipTracker`, `npm run build:api`, `npm run build:web`, and `npm run --workspace=web lint`, fixing failures in `apps/web/src/components/shared/`, `apps/web/src/features/partnership-tracker/`, `apps/web/src/features/k1-tracker/`, and `packages/types/src/`
- [X] T055 Execute the revised single-page, Overview aggregate, currency-entry, commitment, NAV, and sign-off validations and record results in `specs/016-k1-tracker/quickstart.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 - Revision Setup**: Starts immediately.
- **Phase 2 - Foundation**: Depends on fixture setup and blocks every changed story.
- **Phase 3 - US1**: Depends on revised contracts; backend metric work can proceed in parallel with the US2/US3 web shell after Foundation.
- **Phase 4 - US2**: Depends on the shared currency/form boundary and establishes the inline destination used by US3.
- **Phase 5 - US3**: Depends on US2's inline boundary and is the core annual-entry revision.
- **Phase 6 - US4**: Depends only on the shared currency component; it can run in parallel with US1-US3.
- **Phase 7 - US5**: Depends on the shared currency component; Overview refresh verification also depends on US1.
- **Phase 8 - US6**: Depends on US3 calculation/projection behavior; it does not require US4.
- **Phase 9 - Polish**: Depends on all stories selected for release.

### User Story Dependency Graph

```text
Revision Setup -> Foundation
                    |-> US1 Overview Performance --------------------|
                    |-> US2 First-Year Inline Boundary -> US3 Entry -> US6 Sign-off
                    |-> US4 Commitment Currency ---------------------|
                    `-> US5 NAV Currency (refresh depends on US1) ----|
                                                                    `-> Polish
```

### Within Each User Story

1. Write the listed story tests and confirm they fail for the changed behavior.
2. Implement pure utilities and repository behavior before UI composition.
3. Keep exact API strings as the boundary; parse/format user-friendly values in shared web controls.
4. Run the story checkpoint before moving dependent stories forward.

## Parallel Opportunities

- T001 and T002 target separate API/web fixtures.
- T003, T005, and T006 target separate shared component/type/schema files.
- US1 test tasks T008-T011 can be authored concurrently.
- US1 backend tasks T012-T014 can proceed alongside UI task T015 after contracts stabilize.
- US3 test tasks T022-T027 target separate API and web files.
- US3 metadata/results tasks T030, T032, T034, and T035 can proceed concurrently after the form contract stabilizes.
- US4 and US5 currency integrations can proceed in parallel after T004.
- Polish performance, security, and accessibility tasks T048-T050 are independent.

## Parallel Examples

### User Story 1

```text
T008: Summary contract tests
T009: Dated performance utility tests
T010: Durable aggregate query tests
T011: Overview rendering tests
```

### User Story 2

```text
T019: First-year inline destination tests
T020: Inline form boundary integration after T019
```

### User Story 3

```text
T022: Liability-free calculation tests
T023: Canonical contribution persistence tests
T024: Manual-year contract tests
T025-T027: Editor, workflow, and accessibility tests
```

### User Story 4

```text
T038: Commitment currency tests
T039: Commitment control integration after T038
```

### User Story 5

```text
T041: NAV currency tests
T042: NAV control integration after T041
```

### User Story 6

```text
T044: Sign-off API tests
T045: Reconciliation UI tests
```

## Implementation Strategy

### Suggested Revision MVP

1. Complete Revision Setup and Foundation.
2. Complete US2 and US3 to deliver the single-page annual form, canonical contributions, liability exclusion, and K-1 currency handling.
3. Validate the manual K-1 independent test before adding Overview and history-dialog refinements.

### Incremental Delivery

1. **US3 via US2 boundary**: Single-page annual entry and corrected calculations.
2. **US1**: Overview aggregate and performance metrics.
3. **US4**: Committed-capital currency formatting.
4. **US5**: NAV currency formatting and metric refresh.
5. **US6**: Reconciliation and sign-off regression completion.
6. **Polish**: Remove obsolete interaction code and run complete quality gates.

## Notes

- Existing partnership creation, effective-dated commitment history, NAV persistence/charting, authorization, auditing, and legacy route redirects are baseline behavior and are not reimplemented.
- `capital_contributions` is the sole new-write contribution key; `section_l_capital_contributed` remains readable provenance only.
- Liability values remain editable and carryforward-aware but never affect arithmetic, performance, warnings, workflow state, or sign-off blockers.
- Browser controls accept flexible US currency input; APIs continue receiving exact two-decimal strings.
- Committed capital and NAV remain nonnegative; only signed K-1 fields accept minus signs or accounting parentheses.
- Do not add Excel import, PDF upload, OCR, automatic finalized-document sync, a duplicate performance table, or a second contribution store.
- `[P]` is valid only while the shared contracts and prerequisite files are stable.
