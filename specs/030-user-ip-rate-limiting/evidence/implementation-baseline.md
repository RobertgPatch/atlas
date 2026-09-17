# Feature 030 implementation baseline

**Captured**: 2026-08-29  
**Branch**: `030-user-ip-rate-limiting`  
**Runtime behavior changed before capture**: No

## Rebase evidence

| Item | Value |
|---|---|
| Old branch/base SHA | `a1d8eb773c097bbdd515e628d46e4a9bbc6db520` |
| Fetched `origin/main` SHA | `75be8a42961d8a14c0c210155957873c007b76bd` |
| New branch/base SHA | `75be8a42961d8a14c0c210155957873c007b76bd` |
| Command | `git rebase --autostash origin/main` |
| Result | Successful; temporary autostash reapplied |

The branch had no feature commit beyond its old feature 029 base, so the rebase moved it directly to the merged PR 37 baseline. The two pre-existing user stashes were not applied or changed:

- `stash@{0}: On 027-implement-vulnerability-fix: infra: preserve Project Jackson AWS changes before 028`
- `stash@{1}: On 027-implement-vulnerability-fix: codex: preserve local work before syncing 027`

## Pre-change gate results

| Gate | Result | Evidence/notes |
|---|---|---|
| `npm run test:api` | Baseline failure | 119 files passed, 21 skipped; 551 tests passed, 103 skipped. One `beforeEach` hook in `protection-controls.contract.test.ts` exceeded 10 seconds. Focused rerun passed 7/7 in 7.21 seconds, so this is recorded as load-sensitive baseline behavior rather than a feature 030 regression. |
| `npm run security:route-policy` | Pass | 1 file, 3 tests passed; generated registration contains no unclassified route. |
| `npm run security:abuse:bounded` | Baseline command defect | Package script exits before running because it omits mandatory `--fake-providers=true`. Direct bounded invocation exited successfully with exactly 100 attempts and zero paid-provider authorization; no local API was running, so all 100 attempts were bounded transport errors. |
| `terraform fmt -check -recursive` | Pass | No formatting differences. |
| `terraform init -backend=false` | Pass | Provider/module initialization completed without backend access. |
| `terraform validate` | Baseline failure | Validation reports missing `aws.us_east_1` provider configurations for edge/security resources even though the root passes the alias. The local tree also contains ignored legacy state. A clean tracked-file checkout reproduced the alias diagnostic; this predates feature 030 runtime changes. |
| `terraform test` | Pass | 19 native Terraform runs passed, 0 failed. |
| `npm run test:production:policy` | Pass | Production plan policy, adapter binding, compatibility wrapper, and Terraform guardrail fixtures passed. Expected negative-fixture diagnostics were emitted. |
| `npm run test:production:cost` | Pass | 4 tests passed, 0 failed. |

## Baseline follow-up

- Keep the API hook timeout visible and rerun it with the full suite after implementation.
- Fix the bounded-abuse package script to supply its required fake-provider flag before final gates.
- Reconcile the Terraform aliased-provider validation defect without reading, moving, deleting, or applying ignored production/local state.
- None of these findings authorizes weakening a test or running production abuse traffic.
