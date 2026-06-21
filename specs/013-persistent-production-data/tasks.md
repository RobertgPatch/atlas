# Tasks: Persistent Production Data

**Input**: Design documents from `/specs/013-persistent-production-data/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/persistent-production-data.openapi.yaml, quickstart.md

**Tests**: Included because the specification defines deployment-survival acceptance scenarios and the plan requires API contract/integration validation for auth, Plaid, Liquidity, and persistence guardrails.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add configuration and shared test helpers needed by durable auth, Plaid, and diagnostics work.

- [X] T001 Add durable persistence configuration fields in apps/api/src/config.ts and apps/api/.env.example
- [X] T002 [P] Add secret codec helper skeleton in apps/api/src/infra/crypto/secretCodec.ts
- [X] T003 [P] Add persistence status helper skeleton in apps/api/src/infra/persistence/persistenceStatus.ts
- [ ] T004 [P] Add PostgreSQL persistence test helpers in apps/api/tests/helpers/persistenceTestHelpers.ts
- [ ] T005 [P] Add durable auth/Plaid fixture helpers in apps/api/tests/helpers/persistentProductionDataFixtures.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create schema and low-level persistence primitives required before any user story can safely move off temporary in-memory state.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Add persistence alignment migration in apps/api/src/infra/db/migrations/013_persistent_production_data.sql
- [X] T007 Implement encryption/decryption for persisted MFA and Plaid secrets in apps/api/src/infra/crypto/secretCodec.ts
- [X] T008 Implement durable/temporary storage mode detection in apps/api/src/infra/persistence/persistenceStatus.ts
- [X] T009 Extend database helpers for persistence tests in apps/api/src/infra/db/client.ts
- [X] T010 Harden demo/admin data reset boundaries to preserve production auth and Plaid state in apps/api/src/modules/admin/admin.dev.routes.ts

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Keep Authentication Enrollment After Deploy (Priority: P1) MVP

**Goal**: Users, roles/status, MFA enrollment, and sessions persist across API restarts and deployments.

**Independent Test**: Enroll MFA, create a session, simulate process/repository restart against the same database, then verify login uses the existing authenticator and does not require QR setup again.

### Tests for User Story 1

- [ ] T011 [P] [US1] Add MFA enrollment persistence integration tests in apps/api/tests/auth.persistence.integration.test.ts
- [ ] T012 [P] [US1] Add durable session persistence integration tests in apps/api/tests/auth.session.persistence.integration.test.ts
- [ ] T013 [P] [US1] Add admin user state persistence integration tests in apps/api/tests/admin.user-persistence.integration.test.ts
- [ ] T014 [P] [US1] Add auth endpoint contract tests for post-enrollment login behavior in apps/api/tests/auth.persistence.contract.test.ts

### Implementation for User Story 1

- [X] T015 [US1] Implement PostgreSQL-backed user lookup, password verification, and user listing in apps/api/src/modules/auth/auth.repository.ts
- [X] T016 [US1] Implement durable MFA enrollment, completion, reset, and lookup in apps/api/src/modules/auth/auth.repository.ts
- [X] T017 [US1] Implement durable session creation, lookup, touch, revocation, and validity checks in apps/api/src/modules/auth/auth.repository.ts
- [X] T018 [US1] Add durable default admin/user bootstrap from configured credentials in apps/api/src/modules/auth/auth.bootstrap.ts
- [X] T019 [US1] Wire auth bootstrap during API startup in apps/api/src/server.ts
- [ ] T020 [US1] Update login persistence failure handling in apps/api/src/modules/auth/login.handler.ts
- [ ] T021 [US1] Update MFA enrollment completion persistence failure handling in apps/api/src/modules/auth/mfa-enroll-complete.handler.ts
- [ ] T022 [US1] Update MFA verification persistence failure handling in apps/api/src/modules/auth/mfa-verify.handler.ts
- [X] T023 [US1] Ensure session middleware reads and touches durable sessions in apps/api/src/modules/auth/session.middleware.ts
- [X] T024 [US1] Ensure logout and session reads use durable session state in apps/api/src/modules/auth/session.handler.ts
- [X] T025 [US1] Update admin role/status/MFA reset operations to use durable auth state in apps/api/src/modules/admin/user-admin.repository.ts
- [ ] T026 [US1] Update admin handlers to surface durable persistence errors in apps/api/src/modules/admin/admin.handlers.ts

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Keep Plaid Connections and Account Selections (Priority: P1)

**Goal**: Plaid institutions, display-safe accounts, selected Liquidity accounts, sync snapshots, and source holdings persist across API restarts and deployments.

**Independent Test**: Connect Plaid, select investment accounts, refresh holdings, simulate process/repository restart against the same database, then verify Liquidity reloads the same accounts and latest holdings without reconnecting Plaid.

### Tests for User Story 2

- [ ] T027 [P] [US2] Add Plaid connection persistence integration tests in apps/api/tests/plaid.persistence.integration.test.ts
- [ ] T028 [P] [US2] Add Plaid account selection persistence tests in apps/api/tests/plaid.account-selection.persistence.integration.test.ts
- [ ] T029 [P] [US2] Add holdings snapshot/source persistence tests in apps/api/tests/reports.consolidated-holdings.persistence.integration.test.ts
- [ ] T030 [P] [US2] Add secret redaction tests for Plaid responses/log surfaces in apps/api/tests/plaid.secret-safety.contract.test.ts

### Implementation for User Story 2

- [X] T031 [US2] Implement PostgreSQL-backed Plaid connection create/update/list methods in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T032 [US2] Persist protected Plaid access tokens using the secret codec in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T033 [US2] Implement PostgreSQL-backed investment account upsert/list/selection methods in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T034 [US2] Implement PostgreSQL-backed holdings sync snapshot methods in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T035 [US2] Implement PostgreSQL-backed source holdings replacement/listing methods in apps/api/src/modules/plaid/plaid.repository.ts
- [X] T036 [US2] Update Plaid public-token exchange to persist durable connection/account state in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T037 [US2] Update Plaid account listing and selection handlers to use durable data in apps/api/src/modules/plaid/plaid.handler.ts
- [X] T038 [US2] Update selected-account holdings sync to read persisted connections and write persisted snapshots in apps/api/src/modules/plaid/plaid.holdings-sync.ts
- [X] T039 [US2] Update consolidated holdings aggregation to consume durable Plaid repository data in apps/api/src/modules/reports/consolidatedHoldings.service.ts
- [X] T040 [US2] Update report repository refresh path for persisted holdings in apps/api/src/modules/reports/reports.repository.ts
- [ ] T041 [US2] Add Plaid persistence audit events for connect, selection, sync, and reconnect state in apps/api/src/modules/audit/audit.events.ts

**Checkpoint**: User Story 2 is fully functional and testable independently.

---

## Phase 5: User Story 3 - Make Persistence Failures Visible (Priority: P2)

**Goal**: Operators can tell whether auth and Plaid persistence are durable, and production cannot silently run critical workflows on temporary state.

**Independent Test**: Start production-mode API with missing or unavailable durable storage and verify startup/diagnostics clearly report unsafe persistence; start with durable storage and verify diagnostics report auth and Plaid persistence as durable without exposing secrets.

### Tests for User Story 3

- [ ] T042 [P] [US3] Add production persistence guard contract tests in apps/api/tests/production-persistence.guard.contract.test.ts
- [ ] T043 [P] [US3] Add admin persistence status contract tests in apps/api/tests/admin.persistence-status.contract.test.ts
- [ ] T044 [P] [US3] Add persistence diagnostic secret-redaction tests in apps/api/tests/persistence-status.secret-safety.contract.test.ts

### Implementation for User Story 3

- [ ] T045 [US3] Implement persistence status handler in apps/api/src/modules/health/persistence.handler.ts
- [ ] T046 [US3] Implement persistence status routes in apps/api/src/modules/health/persistence.routes.ts
- [ ] T047 [US3] Register admin persistence status route in apps/api/src/routes/index.ts
- [X] T048 [US3] Add production startup durable-storage guard in apps/api/src/server.ts
- [X] T049 [US3] Add persistence diagnostics to health response without secrets in apps/api/src/app.ts
- [ ] T050 [US3] Document persistence status API behavior in specs/013-persistent-production-data/contracts/persistent-production-data.openapi.yaml

**Checkpoint**: User Story 3 is fully functional and testable independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, security review, and Railway verification across all stories.

- [ ] T051 [P] Update API README persistence notes in apps/api/README.md
- [ ] T052 [P] Update production validation steps in specs/013-persistent-production-data/quickstart.md
- [X] T053 Review auth/Plaid logging for secret leakage in apps/api/src/modules/auth/auth.repository.ts
- [X] T054 Review Plaid token and MFA secret handling for browser payload leakage in apps/api/src/modules/plaid/plaid.repository.ts
- [ ] T055 Run persistence quickstart validation from specs/013-persistent-production-data/quickstart.md
- [ ] T056 Run focused API persistence tests documented in specs/013-persistent-production-data/quickstart.md
- [X] T057 Run full API and web builds documented in specs/013-persistent-production-data/quickstart.md
- [ ] T058 Verify Railway production diagnostics with specs/013-persistent-production-data/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion.
- **Polish (Phase 6)**: Depends on desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational; no dependency on other stories. This is the MVP because it fixes repeated MFA setup and session loss.
- **User Story 2 (P1)**: Starts after Foundational; depends on authenticated test helpers but can be developed in parallel with US1 after foundation if helpers provide users/sessions.
- **User Story 3 (P2)**: Starts after Foundational; can be implemented after either US1 or US2, but final diagnostic truth depends on both durable repositories being implemented.

### Within Each User Story

- Tests come before implementation.
- Schema/crypto/persistence helpers come before repositories.
- Repositories come before handlers/middleware.
- Handlers and routes come before full quickstart validation.
- Each checkpoint should pass before moving to the next priority.

### Parallel Opportunities

- T002, T003, T004, and T005 can run in parallel after T001 starts.
- US1 tests T011, T012, T013, and T014 can run in parallel.
- US2 tests T027, T028, T029, and T030 can run in parallel.
- US3 tests T042, T043, and T044 can run in parallel.
- US1 repository work and US2 repository work can proceed in parallel after T006-T009 if write conflicts in shared helpers are coordinated.
- Documentation tasks T051 and T052 can run in parallel with final security review.

---

## Parallel Example: User Story 1

```text
Task: "Add MFA enrollment persistence integration tests in apps/api/tests/auth.persistence.integration.test.ts"
Task: "Add durable session persistence integration tests in apps/api/tests/auth.session.persistence.integration.test.ts"
Task: "Add admin user state persistence integration tests in apps/api/tests/admin.user-persistence.integration.test.ts"
Task: "Add auth endpoint contract tests for post-enrollment login behavior in apps/api/tests/auth.persistence.contract.test.ts"
```

```text
Task: "Implement durable default admin/user bootstrap from configured credentials in apps/api/src/modules/auth/auth.bootstrap.ts"
Task: "Update login persistence failure handling in apps/api/src/modules/auth/login.handler.ts"
```

---

## Parallel Example: User Story 2

```text
Task: "Add Plaid connection persistence integration tests in apps/api/tests/plaid.persistence.integration.test.ts"
Task: "Add Plaid account selection persistence tests in apps/api/tests/plaid.account-selection.persistence.integration.test.ts"
Task: "Add holdings snapshot/source persistence tests in apps/api/tests/reports.consolidated-holdings.persistence.integration.test.ts"
Task: "Add secret redaction tests for Plaid responses/log surfaces in apps/api/tests/plaid.secret-safety.contract.test.ts"
```

```text
Task: "Implement PostgreSQL-backed investment account upsert/list/selection methods in apps/api/src/modules/plaid/plaid.repository.ts"
Task: "Implement PostgreSQL-backed holdings sync snapshot methods in apps/api/src/modules/plaid/plaid.repository.ts"
```

---

## Parallel Example: User Story 3

```text
Task: "Add production persistence guard contract tests in apps/api/tests/production-persistence.guard.contract.test.ts"
Task: "Add admin persistence status contract tests in apps/api/tests/admin.persistence-status.contract.test.ts"
Task: "Add persistence diagnostic secret-redaction tests in apps/api/tests/persistence-status.secret-safety.contract.test.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate: MFA enrollment and sessions survive restart/deploy, and admin role/status changes persist.

### Incremental Delivery

1. Setup and foundation create encryption, storage detection, migrations, and test helpers.
2. US1 makes auth, MFA, sessions, and admin user state durable.
3. US2 makes Plaid connections, account selection, sync snapshots, and Liquidity holdings durable.
4. US3 makes unsafe persistence visible and guards production startup.
5. Polish validates quickstart, Railway diagnostics, and secret safety.

### Parallel Team Strategy

1. Complete Setup and Foundational tasks together.
2. Assign one developer to US1 auth persistence and another to US2 Plaid/Liquidity persistence after foundations are ready.
3. Assign US3 diagnostics once repository storage-mode signals are available.
4. Integrate by shared persistence helpers and the quickstart validation scenarios.

---

## Notes

- [P] tasks use different files or can proceed without depending on incomplete tasks.
- [US1], [US2], and [US3] labels map directly to the feature specification user stories.
- Do not log or return Plaid access tokens, MFA secrets, raw session tokens, password hashes, database URLs, or encryption keys.
- Preserve local/test fallback only where explicitly useful; production must report unsafe temporary storage instead of silently resetting data.
