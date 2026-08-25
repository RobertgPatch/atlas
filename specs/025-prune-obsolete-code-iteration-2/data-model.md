# Data Model: Obsolete Code Pruning, Iteration 2

This maintenance feature adds no runtime database entity. Its data model consists of source-control evidence records used to authorize, verify, and audit deletion.

## 1. ReachabilityRecord

Represents how a source file, export, dependency, asset, script, or document can be reached.

| Field | Type | Required | Description |
|---|---|---:|---|
| `target` | string | yes | Repository-relative path, export name, package, or script key. |
| `entryGraph` | enum | yes | `WEB_MAIN`, `WEB_FLAG_FALSE`, `WEB_FLAG_TRUE`, `API_SERVER`, `API_WORKER`, `PACKAGE_SCRIPT`, `TERRAFORM`, `MIGRATION_DISCOVERY`, `TEST`, `OPERATOR_DOC`, or `NONE`. |
| `edges` | record[] | yes | Inbound imports, exports, routes, commands, globs, links, or conventions. Empty is explicit evidence. |
| `dynamicImportsChecked` | boolean | yes | Whether non-static module loading was checked. |
| `flagReachability` | enum | yes | `FALSE_ONLY`, `TRUE_ONLY`, `BOTH`, `UNFLAGGED`, or `NOT_APPLICABLE`. |
| `testOnly` | boolean | yes | True when all remaining inbound edges come from tests. |
| `replacementAuthority` | string or null | yes | Current module or workflow replacing the target. |
| `baselineCommit` | string | yes | Commit against which the graph was computed. |

### Validation rules

- A missing static importer is not equivalent to `entryGraph=NONE` until script, infrastructure, convention, and test edges are checked.
- A test-only source requires a contract decision: remove it with a sole-purpose test, retarget the test to a live authority, or retain it as a protected fixture/helper.
- Any target reachable from either flag graph is live unless that product behavior is separately authorized for retirement.

## 2. PruningCandidate

Represents one item considered during iteration 2.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable identifier unique in the iteration-2 manifest. |
| `inheritedGroup` | enum or null | yes | Spec 024 deferred group `DEFER-001` through `DEFER-006`, or null for a newly found candidate. |
| `pathOrName` | string | yes | File, directory, export, dependency, script, asset, or documentation reference. |
| `kind` | enum | yes | `SOURCE`, `TEST`, `ASSET`, `EXPORT`, `DEPENDENCY`, `SCRIPT`, `DOCUMENTATION`, `FIXTURE`, or `DIRECTORY`. |
| `reachability` | ReachabilityRecord[] | yes | All applicable entry-graph evidence. |
| `dynamicChecks` | string[] | yes | Package, Terraform, migration, Docker, fixture, peer, optional, and operator checks. |
| `decision` | enum | yes | `REMOVE`, `RETAIN`, or `DEFER`. |
| `confidence` | enum | yes | `HIGH`, `MEDIUM`, or `LOW`. `REMOVE` requires `HIGH`. |
| `rationale` | string | yes | Concise evidence-backed reason. |
| `verificationIds` | string[] | yes for `REMOVE` | Checks required after applying the candidate's group. |

### Validation rules

- `REMOVE` requires `confidence=HIGH`, no unresolved consumer, and a deletion group.
- `DEFER` requires the missing product, API, deployment, or retention decision.
- SQL migrations cannot be `REMOVE` in this iteration.
- Current BDA/stub, authoritative fixtures, and operational entries cannot be removed based on source-import absence.
- A dependency can be removed only after direct, configuration, CLI, peer, optional, and deployment uses are evaluated.

## 3. ProtectedSurface

Represents behavior or files that must survive pruning.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable protection identifier. |
| `pathsOrBehavior` | string[] | yes | Protected paths, route families, API contracts, or conventions. |
| `reason` | enum | yes | `FEATURE_FLAG`, `PROVIDER`, `SECURITY`, `PUBLIC_API`, `DYNAMIC_DISCOVERY`, `OPERATIONAL_ENTRY`, `FIXTURE`, `PERSISTED_HISTORY`, or `RETENTION_POLICY`. |
| `consumer` | string | yes | Runtime, operator, infrastructure, test, or product decision that owns it. |
| `verificationIds` | string[] | yes | Checks that prove continued availability. |

### Required protected surfaces

1. Both `VITE_MAGIC_PATTERN_DESIGNS` route/component graphs.
2. Current `features/partnership-tracker` behavior and shared entity/assets clients.
3. Current K-1 dashboard, upload, review, canonical form/results, and tracker flows.
4. Exactly `stub | aws_bda`, including workers, mapping, retry, BDA assets, and Terraform.
5. All SQL migrations and explicit regression fixtures.
6. Both `MFA_LOGIN_ENABLED` states, MFA enrollment/verification pages, server/admin MFA behavior, and session-cookie timing.
7. Terraform/package/operator-invoked scripts and the PostgreSQL partnership seed.
8. Non-Azure historical specs until a retention policy authorizes directory-level deletion.

## 4. MfaLoginFlagState

Represents the server-owned runtime decision applied during password authentication.

| Field | Type | Required | Description |
|---|---|---:|---|
| `environmentKey` | literal | yes | `MFA_LOGIN_ENABLED`. |
| `terraformInput` | literal | yes | `mfa_login_enabled`, passed to the shared API environment map. |
| `enabled` | boolean | yes | Parsed once through the API's standard environment boolean parser. |
| `default` | boolean | yes | `false`, preserving the current password-only login behavior. |
| `passwordResult` | enum | yes | `SESSION`, `MFA_ENROLL_REQUIRED`, or `MFA_REQUIRED`. |
| `sessionCreated` | boolean | yes | False for both pre-MFA results; true only for direct login or successful MFA completion. |
| `webDestination` | string | yes | Current landing route for `SESSION`, `/mfa/setup`, or `/mfa`. |

### State rules

```text
flag=false + valid password -> AUTHENTICATED_SESSION

flag=true + enrollment required -> MFA_ENROLL_REQUIRED
MFA_ENROLL_REQUIRED + valid TOTP enrollment -> AUTHENTICATED_SESSION

flag=true + enrolled -> MFA_REQUIRED
MFA_REQUIRED + valid TOTP -> AUTHENTICATED_SESSION
```

- Password, account-status, and lockout failures occur before flag branching.
- No pre-MFA response sets the session cookie or authenticates `sessionStore`.
- The API flag is the only enforcement switch. `VITE_MAGIC_PATTERN_DESIGNS` selects presentation and the final landing route only.
- Changing the environment value takes effect at API process restart and does not require a web rebuild.

## 5. DeletionGroup

Represents an atomic implementation and rollback unit.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable group slug. |
| `candidateIds` | string[] | yes | Candidates removed or retargeted together. |
| `authorityOrReplacement` | string or null | yes | Retained implementation, or null when none is required. |
| `filesBefore` | integer | yes | Tracked file count immediately before the group. |
| `filesAfter` | integer | yes after apply | Tracked file count after the group. |
| `bytesRemoved` | integer | yes after apply | Working-tree bytes removed. |
| `dependencyChanges` | string[] | yes | Manifest and lockfile changes. |
| `retargetedTestsDocs` | string[] | yes | Mixed live files edited rather than deleted. |
| `verificationIds` | string[] | yes | Focused and full gates. |
| `status` | enum | yes | `PLANNED`, `APPLIED`, `VERIFIED`, or `ROLLED_BACK`. |

### Planned groups

1. `legacy-partnership-web`: 23 source modules plus six sole-purpose tests.
2. `obsolete-k1-web-client`: five source modules plus one sole-purpose test.
3. `stale-partnership-proxies`: nine proxies/placeholders plus one test retarget.
4. `isolated-web-leaves-assets`: four report/review components, three starter assets, and a mixed-test cleanup.
5. `obsolete-process-local-seeds`: three API seed scripts plus exact historical-guidance updates.
6. `orphaned-mui-theme`: theme source/test, root provider removal, four web dependencies, and lockfile regeneration.
7. `broken-package-entry`: root `transfer:prepare` script entry.

The current planned deletion inventory is 56 files totaling 233,356 bytes, including 4,386 TypeScript lines. Counts must be recalculated immediately before implementation.

## 6. VerificationRecord

Represents evidence from a command or manual route check.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable check identifier. |
| `phase` | enum | yes | `BASELINE`, `GROUP`, or `FINAL`. |
| `commandOrProcedure` | string | yes | Exact command or route matrix procedure. |
| `environment` | record | yes | Node version, flag, database, AWS/offline, and OS assumptions. |
| `scopeIds` | string[] | yes | Candidate, protected-surface, or deletion-group IDs covered. |
| `expected` | string | yes | Required outcome. |
| `actual` | string or null | yes after run | Observed output summary. |
| `status` | enum | yes | `PENDING`, `PASS`, `FAIL`, or `BLOCKED`. |
| `baselineRelation` | enum | yes | `NEW_PASS`, `UNCHANGED_BASELINE_FAILURE`, `REGRESSION`, or `NOT_APPLICABLE`. |

### Minimum records

- Active Azure/provider scan and exact extractor registry assertion.
- TypeScript reachability inventory with all deferred Spec 024 groups accounted for.
- API build, full tests, and focused BDA/stub tests.
- Web lint, typecheck, full tests, color audit, and focused route/component tests.
- API and web login contracts for `MFA_LOGIN_ENABLED=false` and `true`, including enrollment/challenge/session-cookie behavior and both post-authentication destinations.
- False and true Magic Patterns production builds and route smoke matrix.
- npm lock regeneration, clean install, and workspace listing.
- MUI/Emotion zero-reference scan after the provider group.
- Seed/script zero-reference scan after operational cleanup.
- Import guards, migration/fixture diffs, `git diff --check`, and final tracked-file/byte delta.

## Relationships

```text
PruningCandidate 1 --- * ReachabilityRecord
DeletionGroup    1 --- * PruningCandidate
ProtectedSurface * --- * VerificationRecord
DeletionGroup    * --- * VerificationRecord
PruningCandidate * --- * VerificationRecord
MfaLoginFlagState * -- * VerificationRecord
```

## State transitions

```text
Candidate:      DISCOVERED -> EVIDENCED -> REMOVE | RETAIN | DEFER
DeletionGroup:  PLANNED -> APPLIED -> VERIFIED
                                  \-> ROLLED_BACK
Verification:   PENDING -> PASS | FAIL | BLOCKED
```

- A group becomes `VERIFIED` only when every required group check passes and no protected-surface regression appears.
- A failed protected-surface check requires correction or rollback before another deletion group begins.
- A candidate cannot move from `DEFER` to `REMOVE` without new evidence and an in-scope decision recorded in the manifest.
