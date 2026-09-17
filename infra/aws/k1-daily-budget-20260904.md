# K-1 processing activation and daily budget

Operator authorization: Robert approved replacing the disabled K-1 workload with a $20/day processing ceiling, then approved creating the missing processor in the nearest suitable region to San Francisco (2026-09-03 Pacific / 2026-09-04 UTC).

## Runtime behavior

- PostgreSQL admission atomically reserves a global daily paid-work budget of 2,000 cents before provider work. All modeled paid workloads, including the existing two-cent-per-file upload allowance, share the same counter. Concurrent requests cannot overdraw it. The day boundary is midnight UTC.
- K-1 reservations use the PDF page count saved by upload validation. Unknown counts reserve the configured maximum (100 pages). The 78-field blueprint costs $0.064/page; reservations round up and include all three allowed SDK attempts. Failed or uncertain attempts retain their reservations. The conservative reservation can stop processing before actual billed spend reaches $20.
- The monthly backstop is 62,000 cents, with 3,100 BDA submissions and 15,500 upload files. This prevents the former $25/month and one-BDA-call/month defaults from blocking the daily allowance. Existing user, payload, concurrency, retry, and backlog protections remain in force.
- The budget covers modeled application processing, including BDA. It is not a hard cap on the entire AWS bill: fixed hosting, storage, networking, and monitoring are separate.
- Optional checkbox model calls remain disabled. Extraction produces a review draft; this activation does not apply any financial values automatically.

## Live deployment inventory

Account: `403454291976`, operator profile: `atlas-production`.

The current public site is `https://projectjackson.family`. Its ECS services, database, and queues remain in `us-west-1`. This differs from the newer repository-wide Terraform topology, which targets `us-west-2`; do not apply that entire unrelated topology as a routine K-1 update.

The isolated image extends the previously running image, without publishing the other uncommitted application changes:

API: `403454291976.dkr.ecr.us-west-1.amazonaws.com/project-jackson-production-api@sha256:c023f7730dd1dca3df5a59f0ae2e337425240b4af42d6d801274d2a36dcef8da`.

Worker: the preceding image `sha256:db181e56ab89a35bdc544aa0a9c078fc20b505a85cd0678a5fb5a1f6b2fb5e4b`. The final API image adds only the daily upload-overhead reservation; worker processing code is identical.

- API task definition: `project-jackson-production-api:7` (previous `:4`).
- Worker task definition: `project-jackson-production-k1-worker:3`, desired count 1 (previous service disabled).
- New K-1 storage region and processor endpoint: `us-west-2`.
- Bucket: `project-jackson-production-k1-oregon-403454291976`.
- Customer-managed encryption key: `arn:aws:kms:us-west-2:403454291976:key/9c02d076-6b95-4e88-8323-9ba12e33c3b1`; rotation enabled.
- Project: `arn:aws:bedrock:us-west-2:403454291976:data-automation-project/6d4e0b3cf753`, LIVE stage.
- Blueprint: `arn:aws:bedrock:us-west-2:403454291976:blueprint/f86e7f7b81bd`, immutable version `1`.
- Profile: `arn:aws:bedrock:us-west-2:403454291976:data-automation-profile/us.data-automation-v1`.
- Oregon completion rule: `project-jackson-production-k1-oregon-completion`, forwarding to the California default event bus through role `project-jackson-production-k1-event-forwarder`.
- California completion rule now accepts the Oregon source region and delivers to the existing completion queue. The worker also reconciles stale jobs at bounded intervals.

New uploads use the Oregon bucket; prior California object identities are retained and readable through regional redirects. The new bucket blocks public access, enforces TLS and the designated KMS key, enables versioning and the existing retention rules, and allows browser CORS only from the production site. Signed upload capabilities expire in five minutes and require conditional creation to prevent replay.

`K1_S3_REGION` and `K1_BDA_REGION` select these services independently of `AWS_REGION`. Narrow inline `project-jackson-production-k1-oregon` policies were added to the existing API and worker roles. Worker secrets are limited to database, persistence encryption, session configuration, and admission HMAC; it receives no Plaid or human password secrets.

The operational scripts, exact compiled patch, synthetic-only validation artifacts, and resource checkpoint are retained locally under `.artifacts/k1-daily-budget-20260904/`. No credential values are stored in these artifacts. The new Oregon resources require import/reconciliation before Terraform manages this live split-region deployment.

## Verification

- 21 focused source tests passed: conservative BDA cost, daily budget admission/configuration including upload overhead, and BDA adapter behavior. The final compiled upload handler separately passed a rejection check proving the daily upload cost is reserved before creating a batch or issuing an upload capability.
- The exact deployment image passed a real isolated PostgreSQL test: 24 concurrent requests reserving $1.25 each admitted 16 and rejected 8, leaving exactly $20 reserved. A new UTC day obtained an independent allowance.
- The exact deployment image passed offline region/signing checks: S3 and BDA use Oregon, application AWS services keep California, and signed uploads include `If-None-Match`.
- An ECS task using the actual worker role passed encrypted S3 write/read, production budget admission, BDA submission, and successful result retrieval for a one-page synthetic document. It extracted the synthetic names, identifiers, year, and amounts as expected. This is a connectivity/contract check, not a claim of comprehensive tax-document accuracy.
- The live production login/upload flow passed: a synthetic PDF received a signed Oregon upload capability, passed server-side validation, entered the queue, completed extraction, and reached `NEEDS_MATCH` for review. The item was then cancelled and deleted through the application; no financial values were applied. A missing permission for deleting the verified quarantine object version was corrected on the narrowly scoped original-object path. The earlier failed test and its verified orphan copy were removed.
- Both ECS services reached `COMPLETED` deployment state with one running task each. The completion queue was empty after the successful test. Runtime task configuration confirms uploads and extraction enabled, Oregon endpoints, and the 2,000-cent daily ceiling.
- Final API revision 7 reached stable state after the upload-overhead correction. Login, session, and K-1 queue access returned HTTP 200; the verification session was logged out. Oregon EventBridge invocation metrics confirmed completion forwarding. Synthetic processor objects, the failed-test orphan copy, and the disposable local test database/network were cleaned up.

## Containment and rollback

If extraction must be contained, set worker desired count to 0 and disable K-1 uploads/extraction in a clone of the current API task definition while retaining the daily budget patch. Preserve objects and quota counters. Returning to API revision 4 would also remove the new daily budget and restore the old disabled workload; it is an emergency rollback only. Do not re-enable paid work on that older image.

## AWS references checked 2026-09-04

- [BDA regions and cross-region processing](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-cris.html): Oregon is the closest supported endpoint to San Francisco. AWS may process requests in other US regions within the US profile; this is not an Oregon-only execution guarantee.
- [BDA pricing](https://aws.amazon.com/bedrock/pricing/): $0.040/page up to 30 fields plus $0.0005 for each additional field.
- [Blueprint limits](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-limits.html): the line-20 extraction instruction was shortened to fit the 600-character field limit, preserving the code/amount and line-19 separation requirements.
