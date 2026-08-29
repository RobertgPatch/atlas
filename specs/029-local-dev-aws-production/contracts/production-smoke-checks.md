# Production Smoke Checks Contract

## Scope

Apply and Rollback run this exact read-only suite after ECS stability and CloudFront deployment. The suite proves the current dashboard-accessible flows remain usable without refreshing providers, mutating data, resetting fixtures, or applying load.

`apps/web/src/routeContract.ts` is the canonical browser-surface inventory. Governance fails when a retained route is added or removed without an explicit smoke-contract decision.

## Credential handling

- Obtain the production smoke user's username/password and, when required, TOTP through an interactive secure prompt or approved in-memory credential provider.
- Never accept a credential as a command-line argument.
- Never print or persist a password, TOTP, session cookie, challenge, full response body, or header collection.
- Use one in-memory cookie jar and destroy it at completion.
- Do not bypass MFA. If unattended MFA cannot be performed safely, Apply pauses for operator-assisted secure input.

## Ordered checks

| Result name | Request | Expected result |
|---|---|---|
| `edge-home` | `GET /` through CloudFront | 200, HTML content type, application shell marker |
| `edge-assets` | `GET` every hashed JS/CSS asset referenced by the shell | 200, expected content type, nonempty body |
| `auth-anonymous` | Anonymous `GET /v1/auth/session` | 401 with recognized error shape |
| `auth-login` | Secure `POST /v1/auth/login` and MFA completion when configured | Successful authenticated session; no response body persisted |
| `auth-session` | `GET /v1/auth/session` | 200 with expected production smoke role and user identifier shape |
| `dashboard-read` | `GET /v1/dashboard` | 200 with required dashboard KPI/summary shape |
| `liquidity-holdings-read` | `GET /v1/reports/consolidated-holdings?pricingMode=saved&page=1&pageSize=1` | 200 with KPI and paged-items shape |
| `liquidity-performance-read` | `GET /v1/reports/consolidated-holdings/performance` | 200 with performance-series shape; empty series is valid |
| `investment-aggregation-read` | `GET /v1/partnership-tracker/aggregation?page=1&pageSize=25` | 200 with aggregation/page shape |
| `tic-properties-read` | `GET /v1/tic-registry/properties` | 200 with property-items shape; empty is valid |
| `entities-list-read` | `GET /v1/entities` | 200 with entity-items shape; empty is valid |
| `entity-detail-read` | If list is nonempty, `GET /v1/entities/{first-id}` | 200 with matching entity identifier |
| `auth-logout` | `POST /v1/auth/logout` | 200 or 204 according to API contract |
| `auth-post-logout` | `GET /v1/auth/session` with the prior cookie jar | 401 |

## Retained browser routes

The current route contract contains:

- `/dashboard`
- `/investment-tracker`
- `/liquidity`
- `/entities` and `/entities/:id`
- `/estate-maps`
- `/tic-registry`
- `/reports`
- `/k1` and `/k1/:id/review`
- login and MFA routes

The required deployment smoke suite above directly covers the user-requested core flows. Estate maps, reports, and K-1 remain protected by current-surface/API contract tests and the shared entity/report/dashboard reads. If their production-specific dependencies are enabled or changed by a release, the release adds a non-mutating representative check before activation.

## Prohibited checks

Production smoke must never call:

- `pricingMode=refresh`;
- `POST /v1/reports/consolidated-holdings/refresh`;
- provider token exchange, Plaid refresh, market refresh, or K-1 ingestion;
- POST, PATCH, or DELETE business-data routes;
- fixture reset, migration rollback, bounded-abuse, load, or destructive test entry points;
- direct RDS queries from an operator workstation.

The authentication login/logout requests are the only stateful session-bound operations permitted by this contract.

## Failure and evidence

Each check records only result name, start/end timestamps, status, response status, latency, and a redacted diagnostic code. It does not persist response bodies or session material.

Any required failure:

1. stops further activation;
2. preserves Terraform state and durable database data;
3. invokes or identifies the last known-good compatible application checkpoint;
4. reruns this complete suite after rollback;
5. leaves the release outcome failed or rolled back.

An empty liquidity, TIC, or entity collection is a valid application state when the response shape is correct. A missing route, unauthorized authenticated request, provider call, schema mismatch, or edge asset failure is not.

