# Quickstart and Verification: AWS K-1 PDF Ingestion

**Feature**: [spec.md](./spec.md)  
**Plan**: [plan.md](./plan.md)

## Prerequisites

- Node.js 22+
- npm workspace dependencies installed
- Docker for local PostgreSQL
- No production K-1s or real TINs in source-controlled fixtures
- For the AWS staging smoke test only: an approved `us-west-2` staging account with the feature's S3, KMS, SQS, EventBridge, ECS worker, BDA project/profile, and LIVE blueprint version deployed

## Local Setup

```powershell
npm ci
npm run dev:db
npm run dev:local
```

Local development uses the provider-neutral stub and local object-store adapter. The API and review UI must exercise the same batch, attempt, matching, issue, and apply contracts used by AWS; only the provider submission/result retrieval differs.

`npm run dev:local` also starts the durable local worker. It sets
`K1_EXTRACTOR=stub`, `K1_OBJECT_STORE=local`, and `K1_QUEUE=local`; local K-1
processing therefore makes no AWS calls. For an explicitly approved hybrid
test, set all three adapters to their AWS variants, provide only staging
resources and credentials, and run the API and worker separately. See
`docs/deployment/environment-strategy.md` for the mode matrix.

Do not use `new_k1.pdf` or any private user document as a committed fixture. Generate synthetic PDFs or use fully sanitized tax-form samples with expected JSON stored under test fixtures.

## Fixture Set

Create a versioned, sanitized evaluation manifest with at least:

- current and legacy supported Schedule K-1 revisions, including at least one tax year before 2024;
- digital and scanned PDFs;
- final and amended forms;
- general/limited and domestic/foreign partner choices;
- positive, negative, parenthesized, and trailing-minus amounts;
- all 48 official-form keys represented across the set;
- all 31 literal calculation-backed K-1 destinations represented across the set;
- all nine coded/repeated sections with multiple occurrences;
- continuation statements spanning more than one page;
- an unknown tax form, an encrypted PDF, a corrupt PDF, a duplicate, and an intentionally ambiguous entity/partnership match;
- a target year with existing manual values and a target year with dated capital activity.

Each fixture has:

- a PDF asset stored only in the approved non-production fixture location;
- expected canonical extraction JSON;
- expected issues and match outcome;
- expected calculation and official-form apply decisions;
- allowed tolerance policy, if any, documented per normalized value kind.

## Fast Verification Loop

Run focused unit and contract tests while building:

```powershell
npm run --workspace=api test -- k1.bda-mapper.test.ts k1.batch.contract.test.ts k1.apply.integration.test.ts
npm run --workspace=web test -- K1UploadDialog.test.tsx K1BatchQueue.test.tsx K1ReviewWorkspace.test.tsx
```

Required mapper assertions:

1. Every supported official key maps exactly once.
2. Every writable calculation key is classified as direct, reviewed derivation, dated-activity authoritative, or workpaper excluded.
3. No deprecated key is emitted.
4. Repeated rows retain occurrence ID, order, value, description, and evidence.
5. Unknown provider fields are retained as evidence/review issues.
6. BDA `MATCH`, `NO_MATCH`, `FALLBACK`, and unknown future statuses parse safely.

## Local End-to-End Scenarios

### Batch isolation

1. Open the K-1 dashboard and choose **Upload K-1s**.
2. Select three valid synthetic PDFs plus one unsupported file and one exact duplicate.
3. Verify each file has independent upload/progress/error state.
4. Verify the valid files reach review even though invalid files fail.
5. Leave the page, restart the API, return, and verify status and review data remain intact in PostgreSQL.

### Matching and review

1. Process one exact TIN/EIN match and one ambiguous match.
2. Verify only the exact match is preselected.
3. Verify the ambiguous item is `NEEDS_MATCH` and no entity/partnership is auto-created.
4. Open review and select fields with page evidence; the PDF viewer must jump to the correct page.
5. Correct a low-confidence value and verify both raw and corrected values remain visible in attempt history.

### Atomic apply

1. Preview application into an empty year and apply all extracted values.
2. Verify calculation revisions use `FINALIZED_K1`, source document/field IDs are populated, official revisions exist, and the 48-key snapshot is updated.
3. Confirm the calculation result matches manual entry of the same values.
4. Preview a document against a populated year and choose a mix of keep-existing/use-extracted decisions.
5. Change the tracker year in a second session, then submit the stale preview. Expect `409` and no writes.
6. Inject a failure after calculation revisions but before official snapshot update. Verify the document, tracker, sign-offs, provenance, and audit record all roll back.
7. With dated capital activity present, verify extracted contribution/distribution totals are retained as evidence/conflicts and never replace the activity-derived value silently.

### Retry and idempotency

1. Deliver the same start-work SQS message twice. Verify one attempt/client token/provider job.
2. Deliver the same BDA completion event twice. Verify one result import and one active attempt.
3. Simulate a missing completion event, advance the reconciliation threshold, and verify the status reconciler imports the completed result.
4. Retry a failed document and verify attempt 1 remains immutable while attempt 2 becomes active only after success.

## Full Repository Gates

```powershell
npm run test:api
npm run test:web
npm run build:api
npm run build:web
```

Run migration integration tests against a clean database and an upgrade copy containing existing K-1 uploads, reviews, tracker years, official JSON, sign-offs, and source revisions.

The migration gate must prove:

- existing documents remain readable;
- existing review fields remain compatible;
- backfill creates no fake extraction attempt or provenance value;
- current tracker calculations do not change;
- rollback or forward-fix steps are documented before staging deployment.

## Terraform Verification

From `infra/aws/terraform`:

```powershell
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform plan -var-file staging.tfvars
```

Review the plan for:

- a dedicated private document/evidence bucket, never the web-assets bucket;
- Block Public Access, SSE-KMS, lifecycle rules, and no public CloudFront origin;
- SQS work/completion queues and dead-letter queues with appropriate visibility timeout and redrive;
- EventBridge rule scoped to BDA completion events;
- API role limited to presign/head/enqueue/status operations;
- worker role limited to document prefixes, BDA invoke/status, queue, and KMS actions;
- no TIN, partner name, partnership name, or document filename in resource tags;
- CloudWatch alarms for queue age/depth, DLQ messages, worker errors, extraction failures, reconciliation lag, and apply failures;
- budget thresholds and BDA page-count metrics.

## AWS Staging Smoke Test

1. Confirm the configured region is `us-west-2`, the account's BDA document concurrency quota is known, and the cross-Region inference/data-residency decision is approved.
2. Deploy the blueprint in DEVELOPMENT, run the sanitized evaluation set, and compare normalized output with expected JSON.
3. Record exact match, issue recall, false-safe, matcher, and grounding metrics.
4. Promote the passing immutable blueprint version to LIVE and record its ARN/version in the staging worker configuration.
5. Upload a batch of 25 sanitized PDFs through the browser.
6. Verify direct S3 upload, per-item status, worker submission, EventBridge completion, SQS consumption, result persistence, and review links.
7. Disable the EventBridge rule temporarily for one job and verify reconciliation completes it.
8. Force throttling and verify exponential backoff without duplicate attempts.
9. Send one message to each DLQ and verify an alarm is delivered.
10. Apply reviewed documents and compare every stored field and calculation with the expected fixture output.

## Production Readiness Gates

Production stays behind `K1_AWS_INGESTION_ENABLED=false` until all gates pass:

- 100% source-field accounting on the agreed fixture set;
- at least 95% normalized exact match;
- zero false-safe mismatches (an incorrect value accepted without an issue);
- 100% unknown forms/revisions routed to review;
- zero silent overwrites and zero partial apply writes in fault tests;
- entity/partnership matcher precision approved on ambiguous cases;
- queue retry, DLQ, reconciliation, worker restart, and event-duplication tests pass;
- authorization tests cover upload, status, PDF read, correction, match, retry, preview, and apply;
- CloudTrail/CloudWatch logs contain IDs and metrics but no raw tax field values;
- KMS, S3, IAM, retention, cross-Region inference, backup, and incident-response review is complete;
- measured cost per page/document is within the approved budget.

## Rollout

1. Deploy schema and dormant infrastructure.
2. Enable internal staging users with the AWS feature flag; keep the offline stub for deterministic local and CI tests.
3. Shadow-process a sanitized evaluation set and compare provider outputs without applying values.
4. Enable AWS upload for a small internal production cohort, requiring review for every field.
5. Expand the cohort only after accuracy, queue, failure, and cost dashboards remain within thresholds.
6. Remove any obsolete non-AWS extraction credentials from the deployment environment.

Rollback is configuration-only during the observation window: set
`K1_AWS_INGESTION_ENABLED=false`, stop admitting new AWS batches, allow or
quarantine already-submitted staging jobs according to the incident runbook,
and use the offline stub only for local diagnosis without reverting the additive
schema. Never delete applied document evidence during rollback.

## Verification Record — 2026-08-18

### Contracts and local scenarios

- OpenAPI 3.1 YAML parsed successfully: 11 paths and 18 schemas.
- The revision classifier now accepts recognized Schedule K-1 (Form 1065) tax years 2000 through 2025, including a committed synthetic pre-2024 manifest case, while missing, pre-2000, and future revisions remain blocking issues.
- The combined API feature run passed 9 files / 32 tests: batch contracts,
  batch upload, durable queue/restart, 25-document load isolation, worker
  delivery/reconciliation/throttling, immutable retry attempts, matching, BDA
  completion events, and revision-bound atomic application.
- The combined web feature run passed 4 files / 14 tests: multi-file upload,
  durable processing queue, complete review/apply workspace, and tracker source
  provenance.
- The sanitized BDA evaluator reported field accounting `1.0`, normalized exact
  match `1.0`, issue recall `1.0`, false-safe count `0`, matcher accuracy `1.0`,
  grounding accuracy `1.0`, and apply equivalence `true` for the committed
  synthetic fixture. These fixture results do not replace the staging corpus
  acceptance gate.
- The 25-document test completed under 30 seconds and the configured 128 MiB
  heap-growth bound, queued 24 valid PDFs, isolated one corrupt PDF, and proved
  exact queue-message idempotency.

### Migration verification

The clean/upgrade suite passed 4 tests against PostgreSQL. It applies the
additive migration twice in an isolated legacy schema and proves that existing
documents, approved review fields, resolved issues, official-form JSON, tracker
revision/calculation values, and reviewed sign-offs are unchanged. It also
proves no extraction attempt is invented and checks the applied-document delete
guard.

The migration is forward-only. If deployment fails before application traffic
is enabled, fix the additive migration in a new numbered migration and redeploy.
If traffic has begun, disable `K1_AWS_INGESTION_ENABLED`, stop the K-1 worker,
leave the new tables/columns and retained evidence in place, restore the prior
application image, then apply a reviewed forward-fix migration. Do not drop
ingestion tables, rewrite tracker revisions, or delete applied K-1 documents.

### Terraform and staging

- `terraform fmt -check -recursive`, `terraform init -backend=false`, and
  `terraform validate` passed.
- The staging plan command using `staging.tfvars.example` reached provider
  authentication, then stopped because no valid AWS/AWSCC credentials were
  available (the cached authorization grant was expired/invalid). No resources
  were changed.
- The live `us-west-2` BDA, S3/KMS, SQS/DLQ, EventBridge reconciliation,
  throttling, IAM, alarms, and cross-Region-inference smoke remains a release
  gate and must be executed with the approved staging account. T098 must remain
  incomplete until that evidence is recorded here.

### Repository-wide gates

- `npm run build:api` passed.
- `npm run build:web` passed, with only the existing large-chunk advisory.
- `npm run test:api` without a database passed 353 tests and skipped 96 durable
  tests, but failed one unrelated `partnerships.accounting-values` test because
  that test unconditionally requires `ATLAS_TEST_DATABASE_URL`. The dedicated
  database-backed K-1 and migration suites above passed.
- `npm run test:web` passed 263 tests and failed five unrelated tests in the
  partnership tracker/add-asset worktree. The complete K-1 upload, queue,
  review, apply, layout, and provenance suites passed.

T099 remains incomplete until those repository-wide unrelated failures are
resolved and the commands are rerun cleanly. The default remains
`K1_AWS_INGESTION_ENABLED=false`; no cohort rollout is authorized by this
verification record.

### Older-revision amendment verification — 2026-08-19

- The classifier, BDA mapper/parser, fixture, and manifest regression group passed 32 tests; five database-backed worker cases were skipped because this run did not provide `ATLAS_TEST_DATABASE_URL`.
- `npm run build:api` passed after the revision range and BDA metadata changes.
- The synthetic manifest now includes a 2023 legacy K-1 case in addition to the 2024 and 2025 cases.

## Exit Criteria

The feature is complete when a user can upload 25 PDFs, safely leave and return, review every extracted or unresolved value with source evidence, resolve target matches and conflicts, and apply each K-1 atomically into the existing tracker with complete provenance and unchanged calculation semantics.
