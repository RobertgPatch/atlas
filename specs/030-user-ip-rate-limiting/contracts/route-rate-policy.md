# Route and rate policy contract

## Purpose

This contract defines the protection metadata and decision order every externally reachable route must satisfy. It extends, rather than replaces, the current route-policy registry.

## Canonical route classes

| Class | Examples | Required early controls | Required post-auth/cost controls |
|---|---|---|---|
| `liveness` | Public `/health` only | Edge cache/global envelope; bounded implementation | No user bucket; must not expose readiness/details |
| `auth` | Password login, MFA verify/enrollment completion, future recovery | WAF source + global; trusted source; local source; durable global + source + account | Hash/TOTP semaphore; bounded cooldown; no expensive work after rejection |
| `general_api` | Cheap authenticated reads | WAF source + API global; trusted source; local source | Validated user + optional session; authorization |
| `heavy_read` | Expensive aggregation/report reads | WAF source + API global; trusted source; local source | Validated user; durable user/global rate; local no-queue class semaphore |
| `download` | PDF/object reads through API | WAF source + API global; trusted source; local source | Validated user; byte/rate quota; bounded concurrency |
| `write` | Non-provider mutations | WAF source + API global; trusted source; local source | Validated user/session/tenant; CSRF; durable rate/idempotency when required |
| `paid_work` | Provider, queue, export, upload-slot issuance | WAF paid source + paid global plus API global; trusted source; local source | Validated user/session/tenant/resource; exact quota/idempotency/lease/kill switch |
| `internal` | Readiness, scheduler, worker, admin service routes | Not publicly forwarded | Dedicated service identity and route-specific authorization |

The inventory generator fails if an external route is missing, duplicated, or assigned a class inconsistent with its cost/authentication metadata.

## Policy schema

Conceptual TypeScript shape:

```ts
interface RouteProtectionPolicyV2 {
  policyKey: string
  routeClass:
    | 'liveness'
    | 'auth'
    | 'general_api'
    | 'heavy_read'
    | 'download'
    | 'write'
    | 'paid_work'
    | 'internal'
  owner: string
  authentication: 'public' | 'session' | 'admin' | 'service'
  localRates: readonly {
    limitKey: string
    scope: 'source_prefix' | 'user' | 'session'
    requests: number
    windowSeconds: number
    partition: 'source' | 'authenticated'
  }[]
  durableRates: readonly {
    policyLimitKey: string
    scope: 'source_prefix' | 'account' | 'user' | 'session' | 'tenant' | 'operation' | 'global'
    requests: number
    windowSeconds: number
    units?: number
  }[]
  concurrencyClass?: string
  failureMode: 'fail_closed' | 'low_cost_degraded_read'
  costUnits: readonly string[]
}
```

## Subject authority

| Scope | Permitted source | Prohibited source |
|---|---|---|
| `source_prefix` | Strict CloudFront-generated viewer address on trusted ALB path | Viewer `X-Forwarded-For`, arbitrary header, cookie |
| `account` | Normalized login identifier or account bound to valid MFA challenge | Boolean known/unknown branch in public response |
| `user` | Validated `users.id` from active session | Header, request body, raw cookie |
| `session` | Validated `auth_sessions.id` | Session cookie bytes/hash as identity |
| `tenant` | Deployment-owned production tenant or validated membership | `tenantId`/`entityId` request input by itself |
| resource/provider | Authorized resolved server resource | Caller-selected value before authorization |
| `global` | Fixed environment + protection-domain constant | Any request value |

## Mandatory decision order

1. WAF managed rules and route-class source/global rules.
2. Request/payload boundary checks that do not perform expensive work.
3. Trusted viewer-source resolution.
4. Local independent source rate.
5. For public auth, atomic durable auth global -> source -> account reservation.
6. Hash/MFA concurrency immediately around expensive cryptography.
7. For session routes, session validation then independent local user and optional session rates.
8. Authorization and authoritative tenant/resource resolution.
9. Durable heavy/paid rate, quota, idempotency, concurrency, backlog, and kill-switch admission.
10. Handler and downstream side effects.

Reordering a downstream cost driver before its admission is a contract failure.

## Authentication policy requirements

- Password, MFA verification, and MFA enrollment completion share the auth global ceiling.
- Resolvable MFA challenges consume the same account fingerprint as password login; invalid challenges still consume source/global capacity.
- Known and unknown accounts return the same public status/body class and comparable bounded work.
- Hash slots never queue. They are held only for the hash operation and released in `finally`.
- Global/auth-store failure denies new expensive auth work with a stable retry response.
- A local global-exhaustion circuit may only deny until the authoritative window retry time; it cannot bypass PostgreSQL.
- Lockout/cooldown is temporary, observable, and cannot escalate indefinitely from attacker input.

## Initial tuning workflow

Candidate values live in validated configuration, not this prose. For each changed WAF threshold:

1. Keep existing protection in Block.
2. Add the candidate lower/global rule in Count with a fixed label.
3. Observe normal retained flows and bounded synthetic cases for a time-boxed interval under 24 hours.
4. Require at least 5x the measured legitimate five-minute burst unless a stricter approved reason is documented.
5. Promote only that candidate to Block.
6. Roll back false positives to Count, not Allow and not ACL detach.

Application exact auth/paid ceilings are enabled with their tested release; count-only refers to new edge candidates, not disabling authoritative cost admission.

## Required tests

- Rotating arbitrary invalid cookies does not reset a source bucket.
- One user over 10 sessions and 10 addresses reaches one user ceiling.
- Multiple users behind one NAT retain their user ceilings and share an independent source ceiling.
- Route hopping stays within one class allowance.
- 100 rotating source/account pairs cannot exceed the auth global limit.
- Auth limits are shared across simulated process restart/deploy overlap.
- Parameter changes cannot manufacture tenant/entity limiter identities.
- HMAC rotation does not reset rate, daily quota, or monthly cost usage.
- Rejected requests perform zero prohibited downstream work.
- Any new route without all required class metadata fails startup/CI.

