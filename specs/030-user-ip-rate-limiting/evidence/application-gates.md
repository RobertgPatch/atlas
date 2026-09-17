# Feature 030 application gate evidence

**Executed**: 2026-08-29 (America/Los_Angeles)  
**AWS/paid-provider traffic**: None

| Gate | Result |
|---|---|
| `npm run build:api` | PASS; TypeScript compilation completed. |
| `npm run build:web` | PASS; 2,620 modules transformed. Vite retained the existing >500 kB chunk warning; no build failure. |
| `npm run test:api` | PASS; 129 files / 605 tests passed, 20 files / 103 tests skipped by their existing environment/optional-integration guards. |
| `npm run test:web` | PASS; 82 files / 317 tests passed. |
| `npm run test:current-surface` | PASS; 1/1 retained-surface governance test. |
| `npm run test:pruning` | PASS; 2/2 reachability/pruning tests. |
| `npm run security:route-policy` | PASS; 6/6 route-policy coverage tests. |
| `node scripts/security/run-bounded-abuse-tests.mjs --fake-providers=true` | PASS against a local test-runtime API; exactly 100 requests, 100 bounded `401` responses, zero transport errors, zero paid-provider calls. |
| `npm run security:audit:runtime` | PASS; API runtime 0 findings, web runtime 0 findings, API build/test-only 0 findings. |
| `npm run security:environment-topology` | PASS; 1 local, 1 production, 0 staging, 0 AWS development. |
| `npm audit --audit-level=high` | PASS; 0 vulnerabilities after restoring the dependency tree from the committed lockfile. |
| `npm run test:api -- --run tests/abuse-protection/protection-overhead.benchmark.test.ts` | PASS; one p95 rule using the larger of 1 ms or 5%, with warmup/alternating samples. |
| `npm run test:api -- --run tests/abuse-protection` | PASS; 28 files / 168 tests. |
| Retained below-limit auth/workflow tests | PASS; 4 files / 26 tests covering valid password, MFA verify/enrollment, and representative retained protected workflows. |
| Retained browser-surface tests | PASS; 8 files / 54 tests covering login/home routing, dashboard, liquidity visualization, investment tracker, TIC registry, entities, and current navigation. |
| `npm run test:production:deployment` | PASS; release, secret-preflight, smoke, and deployment-flow fixtures completed without AWS mutation. |

The first bounded-runner invocation was intentionally attempted without a listener and failed closed with 100 transport errors. It was rerun against `127.0.0.1:3000` using the built API in `NODE_ENV=test`; the process was terminated immediately after the bounded run. No `.env` secrets, AWS resources, or provider adapters were used.

The API skip count is not treated as success evidence for PostgreSQL-dependent migration behavior; that path is recorded separately in `migration-and-recovery.md`. No gate in this file authorizes production load testing or deployment.
