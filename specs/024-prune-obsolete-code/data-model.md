# Data Model: First-Pass Obsolete Code Pruning

This feature does not add runtime database entities. The following source-control records define how candidates are classified and how deletion evidence is reviewed.

## 1. PruningCandidate

Represents one file, directory, export, dependency, script, configuration entry, fixture, or documentation surface considered for removal.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable slug unique within the pruning manifest. |
| `pathOrName` | string | yes | Repository-relative path, glob, export, or package name. |
| `kind` | enum | yes | `FILE`, `DIRECTORY`, `EXPORT`, `DEPENDENCY`, `SCRIPT`, `CONFIG`, `FIXTURE`, `DOCUMENTATION`, or `WORKSPACE`. |
| `category` | enum | yes | `SUPERSEDED_PROVIDER`, `GENERATED_LOCAL`, `STALE_BUILD_OUTPUT`, `UNUSED_WORKSPACE`, `UNREACHABLE_CODE`, `UNUSED_DEPENDENCY`, `STALE_DOCUMENTATION`, or `PLACEHOLDER`. |
| `inboundReferences` | string[] | yes | Every discovered static import, export, link, script, config, or infrastructure reference; empty is explicit evidence, not an omitted field. |
| `entryPointChecks` | string[] | yes | Entry graphs and direct command conventions checked. |
| `flagReachability` | enum | yes | `TRUE_PATH`, `FALSE_PATH`, `BOTH`, `UNFLAGGED`, or `NOT_APPLICABLE`. |
| `dynamicChecks` | string[] | yes | Migration discovery, glob loading, Terraform, package scripts, test fixtures, ambient types, or naming conventions checked. |
| `replacement` | string or null | yes | Current authority/replacement, or null when none is needed. |
| `decision` | enum | yes | `REMOVE`, `RETAIN`, or `DEFER`. |
| `rationale` | string | yes | Evidence-backed reason for the decision. |
| `verificationIds` | string[] | yes for `REMOVE` | Verification records that cover the change. |

### Validation rules

- `REMOVE` requires no unresolved inbound or dynamic consumer.
- `REMOVE` for a candidate reachable through either Magic Patterns value is invalid unless the corresponding product behavior was separately removed with user authorization; this iteration provides no such authorization.
- `REMOVE` for a migration, authoritative fixture, current BDA asset, or operational entry point is invalid in this iteration.
- `DEFER` requires a concise uncertainty or follow-up decision.
- A dependency cannot be `REMOVE` until source imports, config/plugin use, package scripts, peer requirements, and optional workflows have all been checked.

## 2. ProtectedSurface

Represents a repository surface that cannot be inferred dead from static imports.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable protection identifier. |
| `paths` | string[] | yes | Protected paths or patterns. |
| `protectionReason` | enum | yes | `FEATURE_FLAG`, `DYNAMIC_DISCOVERY`, `OPERATIONAL_ENTRY`, `AUTHORITATIVE_FIXTURE`, `PROVIDER_AUTHORITY`, `PERSISTED_HISTORY`, or `PRODUCT_DECISION`. |
| `consumer` | string | yes | Runtime, build, infrastructure, test, or operator that uses the surface. |
| `verificationIds` | string[] | yes | Checks that prove the surface remains functional. |
| `notes` | string | no | Boundary details and known exceptions. |

### Required protected surfaces

1. `VITE_MAGIC_PATTERN_DESIGNS=true` route/component graph.
2. `VITE_MAGIC_PATTERN_DESIGNS=false` route/component graph.
3. `AppShell` and Magic primitives shared across flagged and unflagged pages.
4. `stub` and `aws_bda` extractor selection, BDA worker/mapping/infrastructure, and offline stub.
5. `apps/api/src/infra/db/migrations/**`.
6. Explicit regression fixtures under test fixture directories.
7. Terraform/package-script/operator-invoked scripts and documented seed entry points.
8. MFA pages/store pending a later product/security decision.

## 3. DeletionGroup

Represents an atomic review unit of related candidates removed together.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable group identifier. |
| `title` | string | yes | Human-readable group name. |
| `candidateIds` | string[] | yes | Candidates removed by this group. |
| `authorityOrReplacement` | string or null | yes | Retained replacement, or null when deletion needs none. |
| `trackedFilesBefore` | integer | yes | Baseline tracked-file count for the group. |
| `trackedFilesAfter` | integer | yes | Resulting tracked-file count. |
| `bytesRemoved` | integer | yes | Sum of removed working-tree bytes, excluding Git history. |
| `dependencyChanges` | string[] | yes | Removed packages/workspaces/lockfile entries. |
| `configChanges` | string[] | yes | Resolver, ignore, script, or documentation alignment. |
| `verificationIds` | string[] | yes | Gates run after this group. |
| `status` | enum | yes | `PLANNED`, `APPLIED`, `VERIFIED`, or `ROLLED_BACK`. |

### Planned deletion groups

1. `retired-azure-spec`: Spec 008 plus two generic prose updates; authority is Spec 022/Amazon BDA.
2. `local-generated-artifacts`: root/local PDFs, `tmp/pdfs`, QA/live-check notes/scripts, and standalone TIC prototype plus ignore rules.
3. `unused-workspaces`: `packages/ui`, `packages/utils`, unused aliases, active guard/doc alignment, and npm workspace lock updates.
4. `stale-package-output`: source-adjacent `.js`, redundant placeholders, second lockfile, and unused dependency entries.
5. `unreachable-web-roots`: reviewed scaffolds/pages/duplicate components and their sole-purpose exports/tests.
6. `isolated-api-type-leaves`: legacy local PDF store, unused barrel, and stale private auth types.

## 4. VerificationRecord

Represents evidence produced before or after a deletion group.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable check identifier. |
| `commandOrProcedure` | string | yes | Exact command or manual procedure. |
| `environment` | record | yes | Relevant flag values, Node version, and service assumptions. |
| `scope` | string[] | yes | Candidate/deletion/protected surface IDs covered. |
| `expected` | string | yes | Required outcome. |
| `actual` | string | no until run | Observed result or artifact location. |
| `status` | enum | yes | `PENDING`, `PASS`, `FAIL`, or `BLOCKED`. |

### Minimum verification records

- Repository reference scan for retired Azure/runtime provider names.
- Tracked local/generated artifact scan.
- npm clean install and lockfile consistency.
- API TypeScript build and full tests.
- Focused BDA extractor/mapper/worker tests.
- Web lint, typecheck, full tests, and color audit.
- Web production build with the Magic flag false.
- Web production build with the Magic flag true.
- Route matrix for both values, roles, redirects, and query preservation.
- Updated import guard scripts.
- `git diff --check` and final tracked file/byte delta.

## Relationships

```text
ProtectedSurface 1 --- * VerificationRecord
PruningCandidate * --- * VerificationRecord
DeletionGroup    1 --- * PruningCandidate
DeletionGroup    * --- * VerificationRecord
```

## State transitions

```text
Candidate: DISCOVERED -> CLASSIFIED -> REMOVE | RETAIN | DEFER
DeletionGroup: PLANNED -> APPLIED -> VERIFIED
                              \-> ROLLED_BACK
VerificationRecord: PENDING -> PASS | FAIL | BLOCKED
```

- A deletion group may become `VERIFIED` only when all linked verification records are `PASS`.
- Any failed protected-surface check requires restoring or correcting the group before continuing.
- Deferred candidates remain inputs to a later pruning iteration and are not silently reconsidered within this pass.
