# Phase 1 Data Model: Prune Unreachable Product Flows

This feature does not add or migrate runtime database entities. Its model is a maintenance/audit model stored in `pruning-manifest.md` and enforced by tests and static checks.

## RetainedFlow

Represents one supported user journey in the current product.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable identifier such as `FLOW-INVESTMENT` |
| `name` | string | yes | User-facing flow name |
| `entryRoutes` | route pattern[] | yes | Canonical browser routes that enter the flow |
| `sourceRoots` | path[] | yes | Page/feature roots that implement the flow |
| `navigationEdges` | `ConsumerEdge`[] | yes | Links and programmatic transitions within/to other retained flows |
| `apiConsumers` | API route pattern[] | yes | API contracts exercised by the flow |
| `roles` | (`User` or `Admin`)[] | yes | Roles that can access the flow |
| `behaviors` | string[] | yes | Reads, writes, exports, uploads, calculations, or provider actions that must remain |
| `verificationIds` | string[] | yes | Tests/checks proving the flow remains intact |

### Validation

- Every explicit retained browser route belongs to at least one `RetainedFlow`.
- Every navigation target resolves to another retained route.
- Every current web-client API call belongs to a retained flow or protected system root.
- Role-restricted behavior is recorded separately from route reachability.

## SystemRoot

Represents a non-dashboard entry point required to secure, operate, deploy, or maintain retained flows.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable identifier such as `ROOT-K1-WORKER` |
| `kind` | enum | yes | `server`, `worker`, `scheduler`, `health`, `migration`, `deployment`, `security`, `operator`, or `fixture` |
| `entry` | path/command/route | yes | Concrete entry point |
| `consumerEvidence` | `ConsumerEdge`[] | yes | Package, Terraform, runtime, or documentation edges proving use |
| `protectedClosure` | path[] | yes | Implementation roots protected by this entry |
| `verificationIds` | string[] | yes | Checks proving it remains operational |

### Validation

- A system root must have a current concrete consumer, not only a descriptive filename.
- Migrations are protected by convention and deployment documentation even without imports.
- A system root may be retired only as an explicit contract removal, never as an incidental source deletion.

## ConsumerEdge

Represents evidence that one artifact consumes another.

| Field | Type | Required | Description |
|---|---|---:|---|
| `from` | path/route/command | yes | Consumer |
| `to` | path/route/command | yes | Consumed artifact |
| `kind` | enum | yes | `route`, `link`, `import`, `type-import`, `api-call`, `test`, `fixture`, `script`, `terraform`, `documentation`, `convention`, or `replacement` |
| `state` | string/null | no | Role, query state, environment, or other condition |
| `evidence` | string | yes | File/line, command output, or contract explanation |
| `verifiedAtBaseline` | string | yes | Baseline commit or timestamp |

### Validation

- File/line evidence is refreshed when source moves.
- A test-only edge protects a public contract or fixture only when that contract is still retained.
- Historical spec references do not make runtime code live.

## PruningCandidate

Represents any route, file, export, dependency, script, test, asset, configuration entry, type, or documentation set considered for removal.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable manifest identifier |
| `category` | enum | yes | `browser-route`, `api-route`, `source`, `test`, `type`, `asset`, `dependency`, `script`, `config`, `infra`, or `docs` |
| `subject` | string/path[] | yes | Candidate artifact or closure |
| `inboundEdges` | `ConsumerEdge`[] | yes | Known consumers |
| `replacement` | string/null | no | Current authority replacing the subject |
| `decision` | enum | yes | `REMOVE`, `RETAIN`, or `DEFER` |
| `confidence` | enum | yes | `HIGH`, `MEDIUM`, or `LOW` |
| `rationale` | string | yes | Decision explanation |
| `deletionGroupId` | string/null | no | Owning deletion group for REMOVE decisions |
| `verificationIds` | string[] | yes | Evidence checks |

### State Transitions

```text
DISCOVERED -> RETAIN
DISCOVERED -> DEFER
DISCOVERED -> APPROVED_REMOVE -> REMOVED -> VERIFIED
APPROVED_REMOVE -> DEFER            (new consumer or ambiguity found)
REMOVED -> RESTORED                 (retained-flow regression found)
```

### Validation

- Only `HIGH` confidence candidates can enter `APPROVED_REMOVE`.
- `REMOVE` requires checks for imports, routes, clients, tests, scripts, infrastructure, dynamic conventions, and operator documentation as applicable.
- `DEFER` must state the missing decision/evidence.
- No diff path may remain without a candidate, protected-surface, test-retargeting, or planning classification.

## ApiRouteConsumerRecord

Maps each registered external API route to current consumers.

| Field | Type | Required | Description |
|---|---|---:|---|
| `method` | HTTP method | yes | Normalized method |
| `pattern` | string | yes | Canonical Fastify route pattern including `/v1` where applicable |
| `module` | string | yes | Registration module |
| `protectionPolicy` | string | yes | Spec 027 route-protection class |
| `webConsumers` | `RetainedFlow.id`[] | yes | Current browser consumers |
| `systemConsumers` | `SystemRoot.id`[] | yes | Worker/operator/security consumers |
| `decision` | enum | yes | `RETAIN`, `REMOVE`, or `DEFER` |
| `contractBreak` | boolean | yes | Whether removal intentionally breaks a formerly registered interface |
| `implementationClosure` | path[] | yes | Route, handler, schema, service, repository, and type paths |
| `verificationIds` | string[] | yes | Route-policy and behavior checks |

### Validation

- Every registered external route has at least one retained consumer or an explicit removal/defer decision.
- Retained routes have a route-protection policy.
- Removing a route requires checking that no other retained route shares its exclusive implementation before deleting the closure.
- `/health` and `/internal/readiness` are system roots with different exposure contracts and are not evaluated as dashboard endpoints.

## DeletionGroup

Represents an independently reviewable and verifiable deletion unit.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable identifier such as `DG-LEGACY-DESIGN` |
| `name` | string | yes | Cohesive boundary |
| `candidates` | `PruningCandidate.id`[] | yes | Approved members |
| `replacementAuthority` | string/null | no | Retained implementation, if any |
| `routesRemoved` | route pattern[] | yes | Browser/API contracts removed |
| `filesRemoved` | path[] | yes | Exact final inventory |
| `dependenciesRemoved` | package[] | yes | Exact manifest changes |
| `testsRemovedOrRetargeted` | path[] | yes | Sole-purpose deletion and retained-coverage moves |
| `verificationIds` | string[] | yes | Focused gates |
| `status` | enum | yes | `PLANNED`, `APPLIED`, `VERIFIED`, or `ROLLED_BACK` |
| `deltas` | object | no | Files, lines, bytes, dependencies, and bundle changes |

### Planned Groups

1. `DG-ROUTE-CANONICALIZATION`: migrate live partnership links/query state to Investment Tracker.
2. `DG-LEGACY-DESIGN`: remove the design flag, false branches, legacy AppShell/navigation, and sole-purpose tests/config.
3. `DG-RETIRED-BROWSER-ROUTES`: remove placeholder, redirects, standalone legacy pages, direct-only admin UI, forbidden route, and their exclusive closures.
4. `DG-WEB-DEAD-CLOSURE`: recompute from `main.tsx` and remove newly unreachable components/hooks/clients/types/assets/tests.
5. `DG-API-DEAD-CLOSURE`: remove API routes and exclusive implementation types/tests with no retained flow/system consumer.
6. `DG-DEPENDENCY-CONFIG`: remove newly unused packages, scripts, aliases, environment variables, and documentation; update lockfile.

## ProtectedSurface

Represents behavior or history that cannot be removed by ordinary reachability evidence.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable identifier |
| `subject` | route/path/behavior | yes | Protected boundary |
| `reason` | string | yes | Product, security, data, or operations justification |
| `authority` | string | yes | Retained flow, system root, migration policy, or explicit requirement |
| `verificationIds` | string[] | yes | Regression checks |

Protected surfaces include the 13-route product contract, role checks inside retained flows, authentication/MFA, Spec 027 controls, migrations, K-1 worker/provider paths, Plaid/market schedulers, and authoritative fixtures.

## VerificationRecord

Captures baseline and post-change evidence.

| Field | Type | Required | Description |
|---|---|---:|---|
| `id` | string | yes | Stable verification ID |
| `phase` | enum | yes | `BASELINE`, `GROUP`, or `FINAL` |
| `commandOrProcedure` | string | yes | Reproducible check |
| `scope` | string[] | yes | Flows/roots/groups covered |
| `expected` | string | yes | Passing condition |
| `actual` | string | yes after run | Result summary |
| `status` | enum | yes after run | `PASS`, `FAIL`, or `BLOCKED` |
| `baselineRelation` | enum | yes after run | `NOT_APPLICABLE`, `NEW_PASS`, `UNCHANGED_BASELINE`, `IMPROVED`, or `REGRESSION` |

### Validation

- A failed final record is acceptable only when it exactly matches a recorded baseline failure and is marked `UNCHANGED_BASELINE`.
- Any `REGRESSION` blocks completion.
- Blocked environment checks state the missing prerequisite and must not be reported as passing.

## Relationships

```text
RetainedFlow ------> ConsumerEdge ------> browser/API/source artifacts
SystemRoot --------> ConsumerEdge ------> operational/source artifacts
ApiRouteConsumerRecord --> RetainedFlow | SystemRoot
PruningCandidate --> ConsumerEdge
PruningCandidate --> DeletionGroup (REMOVE only)
DeletionGroup ----> VerificationRecord
ProtectedSurface -> VerificationRecord
```
