import { createHash, randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../src/config.js'
import { pool, withTransaction } from '../src/infra/db/client.js'
import {
  k1ExtractionAttemptRepository,
  createK1ExtractionClientToken,
} from '../src/modules/k1/extraction/k1ExtractionAttempt.repository.js'
import type { K1AsyncExtractor } from '../src/modules/k1/extraction/K1Extractor.js'
import { durableK1BatchRepository, durableK1Repository } from '../src/modules/k1/k1.repository.js'
import type { K1CompletionMessage, K1StartWorkMessage } from '../src/modules/k1/queue/K1WorkQueue.js'
import { LocalK1ObjectStore } from '../src/modules/k1/storage/localK1ObjectStore.js'
import type { K1ObjectStore } from '../src/modules/k1/storage/K1ObjectStore.js'
import { LocalK1WorkQueue } from '../src/modules/k1/queue/localK1WorkQueue.js'
import { stubExtractor } from '../src/modules/k1/extraction/stubExtractor.js'
import { createK1CompletionHandler } from '../src/modules/k1/worker/k1Completion.handler.js'
import { K1ExtractionReconciler } from '../src/modules/k1/worker/k1ExtractionReconciler.js'
import { createK1StartWorkHandler } from '../src/modules/k1/worker/k1StartWork.handler.js'
import { processK1ReceivedMessages } from '../src/workers/k1-extraction-worker.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { admitCostWorkload, createBackgroundCostSubjects } from '../src/modules/abuse-protection/costWorkloadAdmission.js'
import { retryK1Extraction } from '../src/modules/k1/extraction/k1Retry.service.js'
import { admissionService } from '../src/modules/abuse-protection/admission.service.js'

const durable = pool ? describe : describe.skip

const rawResult = {
  revisionYear: 2025,
  outputSegments: [{
    customOutputStatus: 'MATCH',
    standardOutput: { document: { elements: [] } },
    customOutput: {
      inference_result: {
        extracted_fields: [
          { canonical_path: 'match.partner_tin', value_kind: 'STRING', value: '987-65-4321', confidence: 0.99 },
          { canonical_path: 'match.partnership_ein', value_kind: 'STRING', value: '12-3456789', confidence: 0.98 },
          { canonical_path: 'match.partnership_name', value_kind: 'STRING', value: 'Northstar Fund IV, L.P.', confidence: 0.99 },
          { canonical_path: 'match.tax_year', value_kind: 'NUMBER', value: 2025, confidence: 0.99 },
          { canonical_path: 'calculation.box_1_ordinary_income_loss', value_kind: 'MONEY', value: '1200', confidence: 0.95 },
        ],
      },
    },
  }],
}

durable('durable K-1 extraction worker', () => {
  let fixture: TestFixture
  let entityId: string
  let batchId: string
  let itemId: string
  let documentId: string
  let k1DocumentId: string
  let rawKey: string
  const objectStore = new LocalK1ObjectStore()
  const originalBucket = config.k1Ingestion.s3.bucket
  const originalOutputPrefix = config.k1Ingestion.s3.outputPrefix
  const originalHmacActiveKey = config.abuseProtection.hmac.activeKey
  const originalKeyringActiveKey = config.abuseProtection.hmac.keyring.active.key

  beforeEach(async () => {
    fixture = await createTestFixture()
    entityId = randomUUID()
    batchId = randomUUID()
    itemId = randomUUID()
    documentId = randomUUID()
    k1DocumentId = randomUUID()
    rawKey = `test-k1-results/${k1DocumentId}/result.json`
    // Paid-work counters are intentionally durable. Give every test its own
    // synthetic fingerprint namespace so a prior test (or a developer's local
    // data) cannot consume this test's one-call default BDA budget.
    const testHmacKey = `k1-worker-test-${randomUUID()}-0123456789abcdef`
    config.abuseProtection.hmac.activeKey = testHmacKey
    config.abuseProtection.hmac.keyring.active.key = testHmacKey
    config.k1Ingestion.s3.bucket = 'atlas-test-private'
    config.k1Ingestion.s3.outputPrefix = 'test-k1-results'
    await pool!.query(
      `insert into entities (id, name, entity_type, status) values ($1, $2, 'TRUST', 'ACTIVE')`,
      [entityId, `Extraction Entity ${entityId}`],
    )
    await durableK1BatchRepository.create({
      id: batchId,
      createdByUserId: fixture.admin.id,
      entityScopeId: entityId,
      items: [{
        id: itemId,
        fileName: 'synthetic-k1.pdf',
        sizeBytes: 100,
        sha256: 'a'.repeat(64),
        objectKey: `originals/${k1DocumentId}.pdf`,
      }],
    })
    await durableK1Repository.createAccepted({
      documentId,
      k1DocumentId,
      ingestionItemId: itemId,
      storagePath: `originals/${k1DocumentId}.pdf`,
      storageBucket: 'atlas-test-private',
      storageVersionId: 'version-1',
      fileName: 'synthetic-k1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      pageCount: 2,
      uploadedBy: fixture.admin.id,
      partnershipId: null,
      taxYear: null,
      partnershipNameRaw: null,
    })
    await withTransaction(async (client) => {
      await durableK1BatchRepository.transitionItem(client, itemId, {
        from: ['PENDING_UPLOAD'],
        to: 'QUEUED',
        queuedAt: new Date(),
      })
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    config.k1Ingestion.s3.bucket = originalBucket
    config.k1Ingestion.s3.outputPrefix = originalOutputPrefix
    config.abuseProtection.hmac.activeKey = originalHmacActiveKey
    config.abuseProtection.hmac.keyring.active.key = originalKeyringActiveKey
    const attempts = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    await Promise.all(attempts.flatMap((attempt) => attempt.rawResultKey
      ? [objectStore.delete({ key: attempt.rawResultKey }).catch(() => undefined)]
      : []))
    await objectStore.delete({ key: rawKey }).catch(() => undefined)
    await objectStore.delete({ key: `originals/${k1DocumentId}.pdf` }).catch(() => undefined)
    await pool!.query(`delete from k1_local_queue_messages where payload->>'k1DocumentId' = $1`, [k1DocumentId])
    await pool!.query('delete from k1_match_candidates where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_issues where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_field_values where k1_document_id = $1', [k1DocumentId])
    await pool!.query('update k1_documents set active_extraction_attempt_id = null where id = $1', [k1DocumentId])
    await pool!.query('delete from k1_extraction_attempts where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_ingestion_items where batch_id = $1', [batchId])
    await pool!.query('delete from k1_documents where id = $1', [k1DocumentId])
    await pool!.query('delete from documents where id = $1', [documentId])
    await pool!.query('delete from k1_ingestion_batches where id = $1', [batchId])
    await pool!.query('delete from audit_events where object_type = $1 and object_id in (select id from partnerships where entity_id = $2)', ['partnership', entityId])
    await pool!.query('delete from partnerships where entity_id = $1', [entityId])
    await pool!.query('delete from entity_memberships where entity_id = $1', [entityId])
    await pool!.query('delete from entities where id = $1', [entityId])
    await fixture.app.close()
  })

  const startMessage = (): K1StartWorkMessage => ({
    version: 1,
    type: 'K1_EXTRACTION_START',
    messageId: randomUUID(),
    dedupeKey: `${k1DocumentId}:1`,
    ingestionItemId: itemId,
    k1DocumentId,
    requestedAttemptNumber: 1,
    clientToken: createK1ExtractionClientToken(k1DocumentId, 1, config.k1Ingestion.bda.mappingSchemaVersion),
    object: { key: `originals/${k1DocumentId}.pdf`, bucket: 'atlas-test-private', versionId: 'version-1' },
    enqueuedAt: new Date().toISOString(),
  })

  it('deduplicates start/completion delivery and promotes one integrity-linked attempt atomically', async () => {
    const submit = vi.fn().mockResolvedValue({ providerJobId: `arn:aws:bedrock:job/${k1DocumentId}` })
    const extractor: K1AsyncExtractor = {
      backend: 'aws_bda', submit,
      async getStatus() { return { status: 'IN_PROGRESS', providerStatus: 'InProgress', outputS3Uri: null, errorCode: null, errorMessage: null, submittedAt: null, completedAt: null } },
      async extract() { return { outcome: 'FAILURE', errorCode: 'ASYNC', errorMessage: 'async' } },
    }
    const start = createK1StartWorkHandler({ extractor })
    const message = startMessage()
    const received = { receipt: 'test:start', message, deliveryCount: 1 }
    await start(received, new AbortController().signal)
    await start({ ...received, deliveryCount: 2 }, new AbortController().signal)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0].clientToken).toBe(message.clientToken)

    const attempts = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, status: 'SUBMITTED', clientToken: message.clientToken })

    const bytes = Buffer.from(JSON.stringify(rawResult))
    await objectStore.putRawResult({ key: rawKey, body: bytes, contentType: 'application/json', sizeBytes: bytes.length })
    const completionMessage: K1CompletionMessage = {
      version: 1,
      type: 'K1_EXTRACTION_COMPLETION',
      messageId: randomUUID(),
      dedupeKey: `complete:${attempts[0].id}`,
      k1DocumentId,
      extractionAttemptId: attempts[0].id,
      providerJobId: attempts[0].providerJobId!,
      providerStatus: 'Success',
      output: { key: rawKey, bucket: null, versionId: null },
      occurredAt: new Date().toISOString(),
    }
    const complete = createK1CompletionHandler({ objectStore })
    await complete({ receipt: 'test:complete', message: completionMessage, deliveryCount: 1 }, new AbortController().signal)
    await complete({ receipt: 'test:complete2', message: completionMessage, deliveryCount: 2 }, new AbortController().signal)

    const completed = await k1ExtractionAttemptRepository.getById(attempts[0].id)
    expect(completed).toMatchObject({
      status: 'SUCCEEDED',
      rawResultKey: rawKey,
      rawResultSha256: createHash('sha256').update(bytes).digest('hex'),
      customOutputStatus: 'MATCH',
    })
    const fieldCount = await pool!.query<{ count: string }>(
      'select count(*)::text as count from k1_field_values where extraction_attempt_id = $1',
      [attempts[0].id],
    )
    expect(Number(fieldCount.rows[0].count)).toBe(5)
    const active = await durableK1Repository.getById(k1DocumentId)
    expect(active?.activeExtractionAttemptId).toBe(attempts[0].id)
    expect(active?.version).toBeGreaterThan(0)
  })

  it.each(['RATE_LIMITED', 'QUOTA_EXCEEDED', 'CredentialsProviderError', 'AccessDeniedException', 'ExpiredTokenException'])(
    'retries an unsubmitted %s failure without charging another document, retaining retry limits', async (errorCode) => {
    const attempt = await k1ExtractionAttemptRepository.createOrGet({
      k1DocumentId, requestedAttemptNumber: 1, provider: 'AWS_BDA',
      mappingSchemaVersion: config.k1Ingestion.bda.mappingSchemaVersion,
    })
    await k1ExtractionAttemptRepository.markFailed({
      attemptId: attempt.id, errorCode, errorSummary: 'Submission rejected before paid work',
    })
    await withTransaction(client => durableK1BatchRepository.transitionItem(client, itemId, {
      from: ['QUEUED'], to: 'FAILED', errorCode: 'EXTRACTION_FAILED',
    }))
    const admit = vi.spyOn(admissionService, 'admit')
    const document = (await durableK1Repository.getById(k1DocumentId))!
    const result = await retryK1Extraction({
      k1DocumentId, actorUserId: fixture.admin.id, expectedDocumentVersion: document.version,
    })
    expect(result).toMatchObject({ status: 'QUEUED', attemptNumber: 2 })
    const request = admit.mock.calls[0]![0]
    expect(request.policy.durableRates).toEqual([])
    expect(request.workload!.quotas).toEqual([
      expect.objectContaining({ scopeKind: 'entity', periodKind: 'utc_day', units: 1 }),
      expect.objectContaining({ scopeKind: 'entity', periodKind: 'billing_month', units: 1 }),
    ])
    expect((await k1ExtractionAttemptRepository.getById(attempt.id))?.status).toBe('FAILED')
  })

  it('runs the last admitted document without charging document admission again, while enforcing the provider limit', async () => {
    const subjects = createBackgroundCostSubjects(fixture.admin.id, itemId, {
      document: k1DocumentId, provider: 'AWS_BDA',
    })
    const dailyLimit = config.abuseProtection.quotas.paidExtraction.globalDocumentsPerDay
    await pool!.query(
      `insert into abuse_rate_windows
        (policy_key, scope_kind, scope_hash, window_started_at, window_seconds, consumed_units, expires_at)
       values ('k1.extraction.global', 'global', $1, date_trunc('day', now() at time zone 'UTC') at time zone 'UTC',
         86400, $2, (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + interval '2 days')`,
      [subjects.activeHashes.global, dailyLimit],
    )
    const submit = vi.fn().mockResolvedValue({ providerJobId: `arn:aws:bedrock:job/${k1DocumentId}` })
    const extractor: K1AsyncExtractor = {
      backend: 'aws_bda', submit,
      async getStatus() { throw new Error('not used') },
      async extract() { throw new Error('not used') },
    }
    await createK1StartWorkHandler({ extractor })({
      receipt: 'test:last-admitted', message: startMessage(), deliveryCount: 1,
    }, new AbortController().signal)
    expect(submit).toHaveBeenCalledTimes(1)
    const rates = await pool!.query(
      `select policy_key, consumed_units from abuse_rate_windows where scope_hash = $1`,
      [subjects.activeHashes.global],
    )
    expect(rates.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ policy_key: 'k1.extraction.global', consumed_units: String(dailyLimit) }),
      expect.objectContaining({ policy_key: 'k1.bda-provider.global', consumed_units: '1' }),
    ]))
    await pool!.query(
      `update abuse_rate_windows set consumed_units = $2 where scope_hash = $1 and policy_key = 'k1.bda-provider.global'`,
      [subjects.activeHashes.global, dailyLimit],
    )
    await expect(admitCostWorkload({
      workloadKey: 'k1_bda_provider_call', method: 'POST',
      routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
      subjectContext: subjects, canonicalInputs: { attempt: 'over-limit' },
      globalDailyLimit: dailyLimit, bdaPageCount: 2,
    })).rejects.toMatchObject({ code: 'RATE_LIMITED', reasonCode: 'RATE_WINDOW_LIMIT' })
  })

  it('creates and links a missing partnership for an explicit K-1 partnership import', async () => {
    await pool!.query(
      `update entities set name = 'Synthetic Partner Trust', tax_id = '987-65-4321' where id = $1`,
      [entityId],
    )
    await pool!.query(
      'update k1_ingestion_batches set create_partnership_if_missing = true where id = $1',
      [batchId],
    )
    const attempt = await k1ExtractionAttemptRepository.createOrGet({
      k1DocumentId,
      requestedAttemptNumber: 1,
      provider: 'AWS_BDA',
      mappingSchemaVersion: config.k1Ingestion.bda.mappingSchemaVersion,
      clientToken: createK1ExtractionClientToken(k1DocumentId, 1, config.k1Ingestion.bda.mappingSchemaVersion),
    })
    const providerJobId = `arn:aws:bedrock:job/import-${k1DocumentId}`
    await k1ExtractionAttemptRepository.markSubmitted({
      attemptId: attempt.id,
      providerJobId,
      inputS3Uri: `s3://atlas-test-private/originals/${k1DocumentId}.pdf`,
      outputS3Prefix: `s3://atlas-test-private/test-k1-results/${k1DocumentId}`,
    })
    const bytes = Buffer.from(JSON.stringify(rawResult))
    await objectStore.putRawResult({ key: rawKey, body: bytes, contentType: 'application/json', sizeBytes: bytes.length })
    const complete = createK1CompletionHandler({ objectStore })
    await complete({
      receipt: 'test:partnership-import',
      deliveryCount: 1,
      message: {
        version: 1,
        type: 'K1_EXTRACTION_COMPLETION',
        messageId: randomUUID(),
        dedupeKey: `complete:${attempt.id}`,
        k1DocumentId,
        extractionAttemptId: attempt.id,
        providerJobId,
        providerStatus: 'Success',
        output: { key: rawKey, bucket: null, versionId: null },
        occurredAt: new Date().toISOString(),
      },
    }, new AbortController().signal)

    const partnerships = await pool!.query<{ id: string; name: string; ein: string }>(
      'select id, name, ein from partnerships where entity_id = $1',
      [entityId],
    )
    expect(partnerships.rows).toEqual([expect.objectContaining({
      name: 'Northstar Fund IV, L.P.',
      ein: '12-3456789',
    })])
    expect(await durableK1Repository.getById(k1DocumentId)).toBeNull()
    expect(await k1ExtractionAttemptRepository.getById(attempt.id)).toBeNull()
    expect(await durableK1BatchRepository.getItemById(itemId)).toMatchObject({
      documentId: null,
      k1DocumentId: null,
      partnershipIntakePartnershipId: partnerships.rows[0]!.id,
      partnershipIntakeSourceK1DocumentId: k1DocumentId,
      status: 'APPLIED',
      errorCode: null,
    })
    expect((await durableK1BatchRepository.getById(batchId))?.status).toBe('COMPLETED')
    expect(await objectStore.head({ key: rawKey })).toBeNull()

    await complete({
      receipt: 'test:partnership-import-redelivery',
      deliveryCount: 2,
      message: {
        version: 1,
        type: 'K1_EXTRACTION_COMPLETION',
        messageId: randomUUID(),
        dedupeKey: `complete:${attempt.id}`,
        k1DocumentId,
        extractionAttemptId: attempt.id,
        providerJobId,
        providerStatus: 'Success',
        output: { key: rawKey, bucket: null, versionId: null },
        occurredAt: new Date().toISOString(),
      },
    }, new AbortController().signal)
    expect((await pool!.query('select count(*)::int as count from partnerships where entity_id = $1', [entityId])).rows[0].count).toBe(1)
  })

  it('copies legacy queued local evidence to encrypted S3 before invoking BDA', async () => {
    const sourceBytes = Buffer.from('%PDF-1.4\nlegacy-local-bda-evidence\n%%EOF')
    const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')
    const sourceKey = `originals/${k1DocumentId}.pdf`
    await objectStore.put({
      key: sourceKey,
      body: sourceBytes,
      contentType: 'application/pdf',
      sizeBytes: sourceBytes.length,
      checksumSha256: sourceHash,
    })
    await pool!.query(
      `update documents
          set storage_bucket = null,
              storage_version_id = null,
              storage_path = $2,
              size_bytes = $3,
              sha256 = $4,
              mime_type = 'application/pdf'
        where id = $1`,
      [documentId, sourceKey, sourceBytes.length, sourceHash],
    )

    const put = vi.fn(async (input: Parameters<K1ObjectStore['put']>[0]) => {
      const chunks: Buffer[] = []
      for await (const chunk of input.body) chunks.push(Buffer.from(chunk as Uint8Array))
      expect(Buffer.concat(chunks)).toEqual(sourceBytes)
      expect(input.checksumSha256).toBe(sourceHash)
      return {
        key: input.key,
        bucket: 'atlas-approved-k1',
        versionId: 'promoted-version-1',
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        checksumSha256: sourceHash,
        etag: 'promoted-etag',
        lastModified: new Date(),
        serverSideEncryption: 'aws:kms',
        kmsKeyId: 'arn:aws:kms:us-west-2:111122223333:key/test',
      }
    })
    const unavailable = async (): Promise<never> => { throw new Error('not used') }
    const s3Store: K1ObjectStore = {
      kind: 's3',
      put,
      head: unavailable,
      read: unavailable,
      delete: unavailable,
      putRawResult: unavailable,
      readRawResult: unavailable,
    }
    const submit = vi.fn().mockResolvedValue({ providerJobId: `arn:aws:bedrock:job/${k1DocumentId}` })
    const extractor: K1AsyncExtractor = {
      backend: 'aws_bda', submit,
      async getStatus() { return { status: 'IN_PROGRESS', providerStatus: 'InProgress', outputS3Uri: null, errorCode: null, errorMessage: null, submittedAt: null, completedAt: null } },
      async extract() { return { outcome: 'FAILURE', errorCode: 'ASYNC', errorMessage: 'async' } },
    }
    const message = startMessage()
    message.object = { key: sourceKey, bucket: null, versionId: null }
    await createK1StartWorkHandler({
      extractor,
      objectStore: s3Store,
      legacyLocalObjectStore: objectStore,
    })(
      { receipt: 'test:legacy-local', message, deliveryCount: 1 },
      new AbortController().signal,
    )

    expect(put).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      inputS3Uri: `s3://atlas-approved-k1/${sourceKey}`,
    }))
    expect(await durableK1Repository.getById(k1DocumentId)).toMatchObject({
      storagePath: sourceKey,
      storageBucket: 'atlas-approved-k1',
      storageVersionId: 'promoted-version-1',
    })
  })

  it('leaves a throttled submission retryable without falsely failing the attempt', async () => {
    const throttled = Object.assign(new Error('slow down'), { name: 'ThrottlingException', $retryable: {} })
    const extractor: K1AsyncExtractor = {
      backend: 'aws_bda',
      submit: vi.fn().mockRejectedValue(throttled),
      async getStatus() { return { status: 'IN_PROGRESS', providerStatus: 'InProgress', outputS3Uri: null, errorCode: null, errorMessage: null, submittedAt: null, completedAt: null } },
      async extract() { return { outcome: 'FAILURE', errorCode: 'ASYNC', errorMessage: 'async' } },
    }
    await expect(createK1StartWorkHandler({ extractor })(
      { receipt: 'test:start', message: startMessage(), deliveryCount: 1 },
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'EXTRACTION_THROTTLED' })
    const attempts = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0].status).toBe('CREATED')
    expect((await durableK1BatchRepository.getItemById(itemId))?.status).toBe('QUEUED')
  })

  it('applies bounded exponential backoff to a retryable queue delivery', async () => {
    const retry = vi.fn().mockResolvedValue(undefined)
    const acknowledge = vi.fn().mockResolvedValue(undefined)
    const queue = {
      kind: 'local' as const,
      sendStart: vi.fn(), sendCompletion: vi.fn(), receiveStart: vi.fn(), receiveCompletion: vi.fn(),
      acknowledge,
      retry,
    }
    const received = { receipt: 'local:retry', message: startMessage(), deliveryCount: 3 }
    await processK1ReceivedMessages(
      [received],
      async () => { throw Object.assign(new Error('throttled'), { code: 'EXTRACTION_THROTTLED' }) },
      queue,
      new AbortController().signal,
    )
    expect(acknowledge).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith('local:retry', 8)
  })

  it('reconciles a successful job when the provider completion event was missed', async () => {
    const providerJobId = `arn:aws:bedrock:job/${k1DocumentId}`
    const extractor: K1AsyncExtractor = {
      backend: 'aws_bda',
      submit: vi.fn().mockResolvedValue({ providerJobId }),
      getStatus: vi.fn().mockResolvedValue({
        status: 'SUCCEEDED', providerStatus: 'Success',
        outputS3Uri: `s3://atlas-test-private/${rawKey}`,
        errorCode: null, errorMessage: null, submittedAt: null, completedAt: new Date(),
      }),
      async extract() { return { outcome: 'FAILURE', errorCode: 'ASYNC', errorMessage: 'async' } },
    }
    await createK1StartWorkHandler({ extractor })(
      { receipt: 'test:start', message: startMessage(), deliveryCount: 1 },
      new AbortController().signal,
    )
    const [attempt] = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    await pool!.query(
      `update k1_extraction_attempts set started_at = now() - interval '20 minutes' where id = $1`,
      [attempt.id],
    )
    const sendCompletion = vi.fn().mockResolvedValue(undefined)
    const queue = {
      kind: 'local' as const,
      sendStart: vi.fn(), sendCompletion, receiveStart: vi.fn(), receiveCompletion: vi.fn(),
      acknowledge: vi.fn(), retry: vi.fn(),
    }
    const reconciled = await new K1ExtractionReconciler({ extractor, queue }).runOnce()
    expect(reconciled).toEqual({ checked: 1, completionsQueued: 1, failed: 0 })
    expect(sendCompletion).toHaveBeenCalledTimes(1)
    expect(sendCompletion.mock.calls[0][0]).toMatchObject({
      extractionAttemptId: attempt.id,
      providerJobId,
      output: { bucket: 'atlas-test-private', key: rawKey },
    })
  })

  it('runs the deterministic local stub through the same queue, attempt, draft, and persistence path', async () => {
    const queue = new LocalK1WorkQueue()
    await createK1StartWorkHandler({ extractor: stubExtractor, provider: 'STUB', queue })(
      { receipt: 'test:stub-start', message: startMessage(), deliveryCount: 1 },
      new AbortController().signal,
    )
    const completions = await queue.receiveCompletion({ maxMessages: 10, visibilityTimeoutSeconds: 30 })
    const received = completions.find((candidate) => candidate.message.k1DocumentId === k1DocumentId)
    expect(received).toBeTruthy()
    await createK1CompletionHandler({ objectStore })(received!, new AbortController().signal)
    await queue.acknowledge(received!.receipt)

    const [attempt] = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    expect(attempt).toMatchObject({ provider: 'STUB', status: 'SUCCEEDED', customOutputStatus: 'MATCH' })
    const fields = await pool!.query<{ count: string }>(
      `select count(*)::text as count from k1_field_values where extraction_attempt_id = $1`,
      [attempt.id],
    )
    expect(Number(fields.rows[0].count)).toBeGreaterThan(5)
  })
})
