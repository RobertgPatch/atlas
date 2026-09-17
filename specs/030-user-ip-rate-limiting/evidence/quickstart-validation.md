# Feature 030 quickstart validation

**Executed**: 2026-08-29 (America/Los_Angeles)  
**Branch**: `030-user-ip-rate-limiting`  
**AWS/paid-provider traffic**: None

## Branch and install preparation

- `git fetch origin` completed. `HEAD` and `origin/main` both resolve to `75be8a42961d8a14c0c210155957873c007b76bd`; no rebase commit or conflict resolution is required.
- The two pre-existing user stashes remain present and were not applied, modified, dropped, or inspected for contents.
- `npm ci` was attempted but Windows returned `EPERM` while replacing the Rolldown native binary. Existing user-started API, K-1 worker, and Vite watch processes have the project dependency tree loaded. Those processes were deliberately left running.
- `npm install` restored the partially refreshed dependency tree using the committed lockfile. `package-lock.json` remained unchanged, `npm audit --audit-level=high` reported zero vulnerabilities, and focused API/web tests passed afterward. A truly clean `npm ci` can be rerun after the operator stops the watch processes; this is an installation-environment deviation, not a source or test failure.

## Contract-first and focused implementation checks

The route inventory, source/user/session fairness, durable authentication admission, zero-expensive-work rejection, trusted-proxy failure, HMAC rotation, origin-boundary, response-preservation, and S3 capability/replay contracts are implemented and included in the passing abuse-protection, Terraform, production-policy, and migration suites.

The controlled benchmark passes the one specified rule: p95 overhead is within the larger of 1 ms or 5% of the representative baseline. Samples include warmup and alternating baseline/protected order to reduce CI noise.

## Retained flows below final application limits

| Flow | Evidence | Result |
|---|---|---|
| Login/home and authenticated route entry | `App.test.tsx`, `auth.login.test.ts` | PASS |
| MFA verification and enrollment | `auth.mfa-verify.test.ts`, `auth.mfa-enroll.test.ts` | PASS |
| Dashboard | `App.test.tsx`, `MagicPatternDashboardPage.test.tsx`, `AppShell.test.tsx` | PASS |
| Liquidity | `App.test.tsx`, `MagicPatternDashboardPage.test.tsx`, `LiquidityPerformanceTracker.test.tsx` | PASS |
| Investment tracker | `App.test.tsx`, `InvestmentTrackerPage.test.tsx` | PASS |
| TIC registry | `App.test.tsx`, `TicRegistryPageContent.test.tsx`, `TicRegistryNavigation.test.tsx` | PASS |
| Entities | `App.test.tsx`, `EntitiesPage.test.tsx` | PASS |
| Representative protected API work | `protected-workflows.regression.test.ts` | PASS |

The retained browser subset passed 8 files / 54 tests. The below-limit authentication and protected-workflow subset passed 4 files / 26 tests. These fixtures stay under configured thresholds and observed no user-visible limiter delay or unexpected `429`.

## Full local gates

- Application builds/tests, current-surface/pruning, route-policy, bounded-abuse, dependency, topology, runtime-audit, benchmark, and retained-flow results are recorded in [application-gates.md](./application-gates.md).
- Terraform formatting, clean backend-free initialization/validation, 23 native tests, production policy, origin/observability/state-safety fixtures, and the derived cost profile are recorded in [terraform-gates.md](./terraform-gates.md).
- PostgreSQL expand/compatibility/cutover/rollback and recovery results are recorded in [migration-and-recovery.md](./migration-and-recovery.md).
- `npm run test:production:deployment` passed all release, secret-preflight, smoke, and exact-artifact deployment-flow fixtures without calling AWS.

## Deliberately deferred production steps

Quickstart section 8 is a later production rollout, not a local implementation step. No real backend initialization, production plan, Apply, WAF mode change, production load test, presigned production upload, paid provider call, or production smoke was attempted. The production blockers are recorded in [production-activation-gates.md](./production-activation-gates.md).
