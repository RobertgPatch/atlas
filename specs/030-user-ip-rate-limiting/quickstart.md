# Quickstart: Implement and verify feature 030

This guide is for implementing the plan locally. It does not authorize an AWS plan or apply, production load test, WAF enforcement change, or presigned upload against production.

## 1. Prepare the branch

Feature 030 is currently stacked on feature 029. After PR 37 merges, rebase before implementation review:

```powershell
git fetch origin
git checkout 030-user-ip-rate-limiting
git rebase origin/main
git status --short --branch
```

Preserve the existing user stashes. Do not apply them unless the user explicitly requests it and the branch scope is re-checked.

Install from the committed lockfile:

```powershell
npm ci
```

## 2. Start with contract failures

Add tests before changing runtime behavior:

1. Route inventory requires one canonical class and all class-required scopes.
2. Invalid cookie rotation still shares one source bucket.
3. One user over 10 sessions/addresses hits one user bucket.
4. Shared NAT users keep independent user buckets plus one source bucket.
5. Auth global/source/account admission is atomic and survives restart/deploy overlap.
6. Rejected auth causes no Argon2, TOTP/QR, session, or amplified audit work.
7. Forwarded/generated viewer-source spoof and malformed inputs fail closed.
8. HMAC rotation preserves active rate, daily quota, and monthly cost usage.
9. Terraform negative fixtures reject every origin bypass and response-rewrite case.
10. A presigned PUT replay creates no additional S3 object version.

Keep all generated attack inputs bounded and providers fake/local.

## 3. Implement application admission in safe order

Recommended sequence:

1. Extend policy types/defaults with shared route class and multiple independent local rates.
2. Refactor `localRateLimiter.plugin.ts` into source-before-auth and validated principal-after-auth decisions. Partition/pin bounded state.
3. Add trusted viewer-source resolution with production fail-closed configuration and spoof tests.
4. Extend `abuse_rate_windows.scope_kind` with `source_prefix` and add key-version alias consolidation.
5. Adapt auth admission to atomically reserve global -> source -> account, then hold the hash semaphore only around Argon2.
6. Reconcile bounded cooldown/operator recovery and migrate raw auth identifiers with the expand/contract sequence.
7. Replace request-derived tenant/cost subject inputs with explicit validated subjects.
8. Add no-queue heavy-read concurrency and preserve durable paid-work leases.
9. Harden upload-slot issuance and S3 conditional/age policies before enabling K-1 ingestion.
10. Add bounded aggregate telemetry and sampled logs.

At each step, prove rejection occurs before the named cost driver.

## 4. Implement edge and origin changes

In Terraform:

- Add auth-global and general-API-global WAF rules with explicit five-minute evaluation windows.
- Introduce changed candidate rules in Count while retaining current blocking protection.
- Use WAF `IP`, never `FORWARDED_IP`, for source aggregation.
- Replace the broad managed origin request policy with the reviewed application allowlist plus generated `CloudFront-Viewer-Address`.
- Narrow trusted proxy inputs to the actual proxy path.
- Preserve VPC origin, internal ALB, private ECS/RDS, and fixed one-task capacity.
- Remove distribution-wide SPA 403/404 substitution and scope SPA fallback to static navigation.
- Add S3 signature-age and conditional-write policies plus PUT/object-version alarms.
- Refresh the production cost profile from actual resource counts.

The CloudFront service-managed VPC-origin security group is optional staged hardening. Do not remove the working prefix-list ingress in the same apply that first discovers/adds the managed group.

## 5. Run focused tests during implementation

Examples; exact test filenames may be added by `speckit.tasks`:

```powershell
npm run --workspace=api test -- abuse-protection
npm run --workspace=api test -- auth.security.test.ts proxy-trust.security.test.ts
npm run security:route-policy
npm run security:abuse:bounded
npm run test:production:policy
npm run test:production:cost
```

Run the benchmark in a controlled local/CI environment and assert one tolerant contract:

```text
absolute p95 overhead < 1 ms OR relative p95 overhead < 5%
```

Equivalently, accepted overhead is within the larger of 1 ms or 5% of baseline. Do not require both thresholds at once; that previously caused noisy CI failure.

## 6. Run the full local gates

```powershell
npm run build:api
npm run build:web
npm run test:api
npm run test:web
npm run test:current-surface
npm run test:pruning
npm run security:environment-topology
npm run security:audit:runtime
npm run test:production:deployment
npm run test:production:policy
npm run test:production:cost
```

Terraform formatting, validation, and native tests:

```powershell
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false
terraform -chdir=infra/aws/terraform validate
terraform -chdir=infra/aws/terraform test
```

No test may send an abuse burst to production or call a paid provider.

## 7. Validate evidence before any production proposal

Record evidence that:

- Every retained flow stays below final thresholds.
- Every rejection scope has a stable redacted response and zero prohibited side effect.
- Metric series/log samples remain bounded during a high-cardinality fixture.
- CloudFront preserves API 401/403/404/429 instead of returning the SPA shell.
- The rendered Terraform plan has one public CloudFront/WAF boundary and no alternate API origin.
- The S3 replay fixture creates at most one object version.
- The refreshed all-in upper cost remains inside the approved feature 029 envelope.
- The operator has acknowledged residual pay-as-you-go CloudFront/WAF attack-request exposure.

## 8. Production rollout and rollback (later, separately authorized)

After all feature 029 activation prerequisites are satisfied:

1. Deploy exact application admission and telemetry first.
2. Keep existing blocking WAF rules; add lower/global candidate rules in Count.
3. Observe for a documented interval under 24 hours and run only bounded retained-flow checks.
4. Promote the approved candidates to Block.
5. Verify WAF blocks increase while ALB/API/hash/provider/S3/queue work remains bounded.
6. Remove redundant old high-ceiling rules only in a later release.

False-positive rollback moves the candidate rule to Count and restores the prior versioned application thresholds. It never detaches WAF, makes the origin public, enables autoscaling, logs raw subjects, or disables hard paid/global ceilings.

## Definition of done

- Spec, plan, research, data model, ADR, route/response/origin/observability/threat contracts are implemented.
- All bounded application/Terraform/security/cost tests pass.
- Protection-state migration and rollback compatibility are proven.
- Count-to-block and incident/cost runbooks are updated.
- No new paid bot/security service is enabled.
- Real Apply blockers from feature 029 remain visibly enforced until completed.
