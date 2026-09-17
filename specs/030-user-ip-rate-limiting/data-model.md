# Data Model: User and IP Rate-Limit Hardening

**Feature**: 030-user-ip-rate-limiting  
**Date**: 2026-08-29

This feature extends the protection model delivered by feature 027. It adds one supported scope to an existing durable table and migrates existing authentication-protection identifiers away from raw email/IP values. No business or financial entity changes.

## Entity relationship overview

```text
ProtectionPolicy 1 --- * ProtectionLimit
ProtectionLimit  1 --- * LocalRateBucket        (bounded process memory)
ProtectionLimit  1 --- * DurableRateWindow      (PostgreSQL)
SubjectIdentity  1 --- * SubjectFingerprint     (active + retained key versions)
AuthAttempt      * --- 1 SubjectFingerprint
AuthAdmission    1 --- * DurableRateWindow      (global + source + account, atomic)
HeavyReadClass   1 --- * LocalConcurrencyLease  (bounded process memory)
CostOperation    1 --- * WorkloadQuota/Lease    (existing PostgreSQL)
UploadSlot       1 --- 1 IdempotentOperation    (existing workload admission)
ProtectionPolicy 1 --- * ProtectionOverride     (existing, expiring/audited)
AdmissionDecision * --- * AbuseSignal            (aggregated, finite vocabulary)
OriginBoundary   1 --- * IngressRelationship     (Terraform/configuration)
```

## 1. ProtectionPolicy

A versioned code/config definition for one canonical route or shared risk class.

| Field | Type | Rules |
|---|---|---|
| `policyKey` | string | Stable, 1-128 characters; route-specific ownership/audit key |
| `routeClass` | enum | `liveness`, `auth`, `general_api`, `heavy_read`, `download`, `write`, `paid_work`, `internal` |
| `authentication` | enum | Existing public/session/admin/service requirement; never grants access |
| `sourceLimitKey` | string/null | Required for every external non-liveness class |
| `principalLimits` | list | Zero before auth; validated `user`, optional `session`, `tenant`, or authorized resource limits after auth |
| `durableRates` | list | Exact cross-process windows; global must precede attacker-controlled scopes for auth |
| `concurrencyClass` | string/null | Bounded, non-queued class semaphore for hash/heavy-read work |
| `failureMode` | enum | `fail_closed` or explicitly approved `low_cost_degraded_read` |
| `costDrivers` | set | Finite values such as hash, DB-heavy, provider, queue, S3, export |
| `responseContract` | string | `rate-limit-v1` for throttling |
| `owner` | string | Stable code-owned owner, not an attacker input |

### Invariants

- Every external route has exactly one `routeClass` and owner.
- Every external non-liveness route has a source decision.
- An authenticated route's source decision remains active after authentication.
- No limit key combines source with user/session.
- Shared class keys prevent route hopping; a narrower route key must be documented.
- Internal routes have no CloudFront behavior and require their dedicated service identity.

## 2. SubjectIdentity and SubjectFingerprint

`SubjectIdentity` is transient request context. `SubjectFingerprint` is its stored equality token.

| Subject scope | Authoritative raw source | Normalization | Persistence |
|---|---|---|---|
| `source_prefix` | CloudFront-generated viewer address accepted only over the trusted origin path | Strict IPv4; mapped IPv4 to IPv4; IPv6 network prefix `/64` | 32-byte keyed fingerprint only |
| `account` | Submitted login identifier or account resolved from a valid MFA challenge | Trim + case-fold according to auth contract | 32-byte keyed fingerprint only |
| `user` | Validated session's database user ID | Canonical UUID string | 32-byte keyed fingerprint only |
| `session` | Validated server-side auth session ID | Canonical UUID string | 32-byte keyed fingerprint only; never raw cookie |
| `tenant` | Deployment-owned family-office tenant ID | Versioned constant/canonical ID | 32-byte keyed fingerprint only |
| `entity/account/provider` | Authorized resource/provider ID | Canonical stable ID | 32-byte keyed fingerprint only |
| `global` | Environment + protection-domain constant | Versioned constant | Stable 32-byte fingerprint; no attacker input |

Fingerprint fields:

| Field | Type | Rules |
|---|---|---|
| `scope` | enum | Must match the semantic source |
| `digest` | bytea/Uint8Array | Exactly 32 bytes, HMAC-derived |
| `keyVersion` | bounded string | Versioned identifier, never HMAC key material |
| `validUntil` | timestamp/null | Retained version cannot be removed before the longest active protected window expires |

### Rotation rule

For an admission request, derive the active and configured retained digests. In one transaction, find existing current-window rows for those aliases, sum usage without exceeding the limit, write/continue the active digest, and remove or mark superseded aliases. Never count one request more than once. A failed consolidation denies cost-producing work.

## 3. LocalRateBucket

Bounded process-memory state for early shedding. It is not durable authority.

| Field | Type | Rules |
|---|---|---|
| `partition` | enum | `pinned_global`, `authenticated`, `source` |
| `limitKey` | string | Shared protection class key |
| `subjectDigest` | base64url | 32-byte fingerprint encoding |
| `count` | positive integer | Saturating/bounded |
| `expiresAt` | monotonic-compatible time | At most configured maximum TTL |
| `lastTouchedAt` | time | Used only for bounded eviction |

### Invariants

- A fixed total memory ceiling always applies.
- Pinned global/class entries cannot be evicted by source churn.
- Authenticated entries are evicted only after source entries under the documented partition budget.
- Eviction can deny less precisely but cannot authorize paid work beyond durable admission.
- Raw addresses, cookies, emails, paths, and request IDs are absent.

## 4. DurableRateWindow (existing table, extended)

Backed by `abuse_rate_windows`.

| Field | Existing type | Change/rule |
|---|---|---|
| `policy_key` | text | Shared class/limit key, 1-128 characters |
| `scope_kind` | text | Extend allowed set with `source_prefix`; retain account/user/session/tenant/operation/global |
| `scope_hash` | bytea | Exactly 32 bytes; active/retained alias logic applies |
| `window_started_at` | timestamptz | UTC fixed-window boundary |
| `window_seconds` | integer | Positive, versioned configuration |
| `consumed_units` | bigint | Non-negative; atomic update only if next value is within limit |
| `expires_at` | timestamptz | Window end plus only the documented cleanup margin |
| `updated_at` | timestamptz | Operational cleanup/concurrency field |

Primary key remains `(policy_key, scope_kind, scope_hash, window_started_at, window_seconds)`.

### Auth atomic ordering

Within one transaction:

1. Reserve `auth.global`.
2. Reserve `auth.source`.
3. Reserve `auth.account`.
4. Commit only when all permit the request.

Any rejected dimension rolls back all increments. Global-first evaluation bounds new attacker-selected subject rows; the local exhausted-global circuit avoids repeated database transactions after a global rejection.

## 5. AuthProtectionAttempt (migration of `auth_attempts`)

The current table contains raw `user_identifier` and optional raw `source_ip`. Feature 030 evolves it to fingerprinted protection evidence.

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Existing primary key |
| `subject_hash` | bytea/null during migration | Exactly 32 bytes for all new protected writes |
| `subject_key_version` | bounded text/null during migration | Required when `subject_hash` is present |
| `user_id` | UUID/null | Set only when the account has been resolved; foreign key to users |
| `attempt_type` | enum | Existing `PASSWORD` or `MFA` |
| `attempted_at` | timestamptz | Existing event time |
| `outcome_class` | enum | `success`, `credential_failure`, `throttled`, `temporary_lockout`, `recovered`; public response remains uniform |
| `cooldown_until` | timestamptz/null | Bounded temporary recovery state only |
| `legacy_user_identifier` | text/null | Existing `user_identifier`; transitional, never used by final writes |
| `legacy_source_ip` | text/null | Existing `source_ip`; transitional and cleared/expired under migration policy |

### Retention and cardinality

- Rate authority lives in `abuse_rate_windows`; `AuthProtectionAttempt` is bounded recovery/audit evidence, not one row per rejected edge/local request.
- Store at most the finite evidence needed by the cooldown/recovery policy; aggregate/suppress repeated throttles.
- Cleanup follows the existing short auth-attempt cleanup schedule and 30-day operational evidence ceiling unless the approved record schedule requires a shorter period.

### Expand/contract sequence

1. **Expand**: add fingerprint/version/user/outcome fields and indexes; keep legacy columns readable.
2. **Compatibility release**: read legacy and fingerprint forms, write fingerprint fields and only the minimum legacy form required for the documented rollback interval; do not add source IP.
3. **Cutover**: write fingerprint form only, stop raw identifier audit payloads, verify equivalent lockout/recovery behavior.
4. **Redact/expire**: clear legacy raw protection values after the approved rollback/evidence window without rewriting business records.
5. **Contract later**: remove legacy query dependence in a subsequent reviewed migration. Do not destructively drop data in the same release that first changes writes.

Rollback after cutover uses the compatibility artifact, not a pre-migration binary that understands only raw email.

## 6. AuthAdmissionDecision and HashLease

Transient request values; no new table.

### AuthAdmissionDecision

| Field | Type | Values/rules |
|---|---|---|
| `decision` | enum | `allowed`, `throttled`, `protection_unavailable` |
| `reasonCode` | enum | Fixed vocabulary: source/account/global/store |
| `retryAfterSeconds` | positive integer | Bounded and consistent with window/cooldown |
| `policyKey` | string | Fixed config key |
| `requestId` | string | Existing bounded correlation only; not a metric dimension |

### HashLease

| Field | Type | Rules |
|---|---|---|
| `class` | constant | `argon2_password` |
| `acquiredAt` | process time | Immediately before hash |
| `released` | boolean | Idempotent release in `finally` |

No queue is allowed. If the fixed per-task capacity is full, reject before allocating hash memory.

## 7. LocalConcurrencyClass

Bounded, process-local no-queue semaphore for non-idempotent heavy reads/downloads.

| Field | Type | Rules |
|---|---|---|
| `classKey` | finite enum/string | Declared in policy; never a request path |
| `maximumActive` | positive integer | Validated configuration |
| `active` | integer | `0..maximumActive` |
| `retryAfterSeconds` | positive integer | Stable bounded response |

Durable cost workloads do not replace their workload leases with this entity.

## 8. CostAdmissionSubjects

Transient structured input replacing the current reuse of one principal across semantic scopes.

| Field | Source | Required |
|---|---|---|
| `userId` | Validated session | Yes for user workloads |
| `sessionId` | Validated session row | When session rate applies |
| `tenantId` | Deployment configuration | Yes in production |
| `entityId` | Authorized resolved resource | Only for entity-scoped work |
| `accountId` | Authorized resolved resource | Only for account-scoped work |
| `providerKey` | Server-owned provider definition | Only for provider quotas |
| `environment` | Validated production config | Always for global scope |

Request body/query/path values cannot directly select any limiter identity.

## 9. UploadCapability

An issued presigned S3 PUT URL is a transient Restricted bearer capability. Existing durable workload/idempotency records remain its issuance source of truth.

| Field | Rule |
|---|---|
| `operationId` | Existing idempotent operation; one admitted upload slot |
| `bucket/key` | Server-generated exact quarantine key; no caller-selected prefix |
| `contentLength` | Exact or bounded signed/admitted bytes |
| `contentType` | Approved finite type set |
| `expiresAt` | Shorter of configured URL TTL and `s3:signatureAge` ceiling |
| `requiredHeaders` | Includes signed `If-None-Match: *` |
| `state` | `issued -> uploaded` or `issued -> expired`; no second successful PUT |

### State transitions

```text
requested
  -> admission_rejected                    (no URL)
  -> issued
       -> uploaded                         (one object version)
       -> replay_rejected                  (412; no new version)
       -> expired                          (signature rejected)
       -> disabled                         (new issuance stopped by kill switch)
```

## 10. ProtectionOverride (existing)

Existing `protection_overrides` remains authoritative. For feature 030:

- Overrides may lower a limit, disable new paid/capability work, or move a candidate WAF rule from Block back to Count through versioned infrastructure.
- No runtime override may raise an approved hard global paid/auth ceiling or bypass source validation.
- Every override has owner, reason, workload scope, audit identity, and expiry. New `temporary_allow` rows are rejected; the legacy enum remains readable only for migration compatibility and resolves fail closed. Runtime controls may disable work or lower the reviewed global daily limit, never raise/disable hard auth or paid global ceilings.

## 11. AbuseSignal

Aggregated metric/log state, not a relational business entity.

| Dimension | Allowed finite values |
|---|---|
| `environment` | `local`, `test`, `production` |
| `routeClass` | ProtectionPolicy enum |
| `scope` | `edge_source`, `edge_global`, `source`, `account`, `user`, `session`, `tenant`, `global`, `workload` |
| `reason` | Fixed contract vocabulary |
| `outcome` | `counted`, `blocked`, `throttled`, `unavailable`, `disabled`, `allowed` |

`requestId`, IP, account/user/session fingerprint, email, path parameters, raw path, cookie, and arbitrary provider error are prohibited as metric dimensions. Aggregation buffers have a fixed key count and flush interval.

## 12. OriginBoundary

Versioned infrastructure facts validated from Terraform plan/state.

| Hop | Addressability | Allowed immediate upstream |
|---|---|---|
| CloudFront + WAF | Public | Internet viewer |
| CloudFront VPC origin -> ALB | Private | Associated CloudFront origin-facing boundary/service SG |
| ECS API task | Private, no public IP | ALB security group only |
| RDS | Private | API task security group only |
| S3 web origin | Private OAC | CloudFront distribution only |
| S3 K-1 quarantine | Private capability operation | Signed, admitted conditional PUT only |
| Internal routes | Not forwarded publicly | Dedicated scheduler/deployment/service identity only |

Any public alternate API endpoint, direct ALB DNS alias, broad backend CIDR ingress, missing WAF association, or `/internal/*` API cache behavior is invalid production state.

## Decision-order state machine

```text
viewer request
  -> WAF class/global decision
     -> blocked at edge
     -> counted/allowed
  -> trusted source resolution
     -> malformed/untrusted: fail closed
  -> local independent source decision
     -> throttled
  -> route authentication
     -> public auth: durable global + source + account reservation
        -> hash lease -> credential/MFA result -> session
     -> session route: validate session -> local user + optional session decision
  -> authorization and authoritative tenant/resource resolution
  -> durable heavy/paid admission and optional local heavy semaphore
     -> rejected with zero downstream side effect
     -> handler/provider/queue/S3/export work
```

Every rejection uses the response contract in `contracts/rate-limit-response.openapi.yaml`; WAF may use its fixed compatible subset.
