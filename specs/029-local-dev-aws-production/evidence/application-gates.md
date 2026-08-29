# Application gate evidence

**Run**: 2026-08-29, Windows host, Node.js 22

Because the developer's active Vite process held the workspace Rolldown binary,
the clean install and dependency-consuming gates ran in a disposable copy made
only from Git-tracked and non-ignored files. Ignored tfvars, state, credentials,
and release artifacts were not copied. The disposable directory was removed
afterward. The reachability scan ran against the real workspace.

| Gate | Sanitized result |
|---|---|
| `npm ci` | PASS; 675 packages installed, 679 audited, 0 vulnerabilities |
| `npm run security:audit:runtime` | PASS; 0 API runtime, web runtime, or build/test-only findings |
| `npm run security:route-policy` | PASS; 1 file, 3 tests |
| `npm run build:api` | PASS; TypeScript build |
| `npm run build:web` | PASS; production build; existing bundle-size warning only |
| `npm run test:api` | PASS; 120 files/552 tests passed; 21 files/103 environment-gated tests skipped |
| `npm run test:web` | PASS; 82 files/317 tests |
| `npm run test:current-surface` | PASS; 1 file/1 test |
| `npm run test:pruning` | PASS; 2 tests |
| `npm run check:web-reachability` | PASS; 157 candidates, 156 reachable, 1 allowlisted fixture, 0 unexpected unreachable |

The original dependency tree was repaired with `npm install --prefer-offline`
without stopping the user's development processes; the route-policy gate then
passed again in the real workspace. No application or AWS mutation occurred.
