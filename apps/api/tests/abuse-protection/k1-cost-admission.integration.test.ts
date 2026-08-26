import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'

import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({
  queue: {
    kind: 'local' as const,
    sendStart: vi.fn().mockResolvedValue(undefined),
    sendCompletion: vi.fn().mockResolvedValue(undefined),
    receiveStart: vi.fn().mockResolvedValue([]),
    receiveCompletion: vi.fn().mockResolvedValue([]),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
  },
  toPublicBatch: vi.fn(),
}))

vi.mock('../../src/modules/k1/queue/index.js', () => ({
  getK1WorkQueue: () => fakes.queue,
}))

vi.mock('../../src/modules/k1/ingestion/k1Batch.service.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/modules/k1/ingestion/k1Batch.service.js')
  >()
  return { ...actual, toPublicBatch: fakes.toPublicBatch }
})

import { config } from '../../src/config.js'
import * as database from '../../src/infra/db/client.js'
import { admissionService } from '../../src/modules/abuse-protection/admission.service.js'
import type { AdmissionDecision } from '../../src/modules/abuse-protection/protection.types.js'
import { BdaExtractor, type BdaExtractorOptions } from '../../src/modules/k1/extraction/bdaExtractor.js'
import {
  BedrockK1StatusCheckboxVerifier,
} from '../../src/modules/k1/extraction/bedrockCheckboxVerifier.js'
import { retryK1Extraction } from '../../src/modules/k1/extraction/k1Retry.service.js'
import {
  completeK1BatchUploads,
} from '../../src/modules/k1/ingestion/k1UploadCompletion.service.js'
import {
  createK1IngestionBatch,
} from '../../src/modules/k1/ingestion/k1Batch.service.js'
import { durableK1BatchRepository } from '../../src/modules/k1/k1.repository.js'
import * as storage from '../../src/modules/k1/storage/index.js'
import type { K1ObjectStore } from '../../src/modules/k1/storage/K1ObjectStore.js'

const actorUserId = '10000000-0000-4000-8000-000000000001'
const entityId = '20000000-0000-4000-8000-000000000002'
const batchId = '30000000-0000-4000-8000-000000000003'
const itemId = '40000000-0000-4000-8000-000000000004'
const k1DocumentId = '50000000-0000-4000-8000-000000000005'

const file = (overrides: Partial<{
  fileName: string
  sizeBytes: number
  sha256: string
}> = {}) => ({
  fileName: 'schedule-k1.pdf',
  sizeBytes: 1_024,
  sha256: 'a'.repeat(64),
  ...overrides,
})

const quotaRejected = (reasonCode: string): AdmissionDecision => ({
  decision: 'quota_rejected',
  error: 'QUOTA_EXCEEDED',
  reasonCode,
  retryAfterSeconds: 3_600,
  policyKey: 'k1.cost-test',
  requestId: `req_${reasonCode.toLowerCase()}`,
  workloadKey: 'k1_bda_document',
})

const captureError = async (operation: () => Promise<unknown>): Promise<unknown> => {
  try {
    await operation()
    return null
  } catch (error) {
    return error
  }
}

const makePdf = async (pages: number): Promise<Buffer> => {
  const pdf = await PDFDocument.create()
  for (let page = 0; page < pages; page += 1) pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

describe('K-1 cost admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fakes.queue.sendStart.mockClear()
    fakes.queue.sendCompletion.mockClear()
    fakes.toPublicBatch.mockReset()
  })

  it('rejects the file-count ceiling before admission, upload-slot, or persistence work', async () => {
    const admit = vi.spyOn(admissionService, 'admit')
    const persist = vi.spyOn(durableK1BatchRepository, 'create')
    const files = Array.from({ length: config.k1Ingestion.batchMaxFiles + 1 }, (_, index) =>
      file({ fileName: `schedule-${index}.pdf`, sha256: index.toString(16).padStart(64, '0') }))

    const error = await captureError(() => createK1IngestionBatch({
      actorUserId,
      entityScopeId: entityId,
      files,
    }))

    expect(error).toMatchObject({ code: 'INVALID_FILE_COUNT' })
    expect(admit).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('rejects an over-limit declared byte count before admission, upload-slot, or persistence work', async () => {
    const admit = vi.spyOn(admissionService, 'admit')
    const persist = vi.spyOn(durableK1BatchRepository, 'create')
      .mockRejectedValue(new Error('PERSISTENCE_MUST_NOT_RUN'))

    const error = await captureError(() => createK1IngestionBatch({
      actorUserId,
      entityScopeId: entityId,
      files: [file({ sizeBytes: config.k1Ingestion.uploadMaxBytes + 1 })],
    }))

    expect.soft(error).toMatchObject({ code: 'INVALID_FILE_SIZE' })
    expect.soft(admit).not.toHaveBeenCalled()
    expect.soft(persist).not.toHaveBeenCalled()
  })

  it('uses distinct quota counters and preserves the browser upload-attempt identity', async () => {
    const uploadAttemptId = '60000000-0000-4000-8000-000000000006'
    const admit = vi.spyOn(admissionService, 'admit').mockResolvedValue({
      decision: 'allowed',
      policyKey: 'route.post.k1-ingestion-batches',
      requestId: 'req_upload_test',
      reservations: [],
    })
    vi.spyOn(durableK1BatchRepository, 'create').mockResolvedValue({
      id: batchId,
      createdByUserId: actorUserId,
      entityScopeId: entityId,
      status: 'OPEN',
      items: [],
      counts: { total: 0, active: 0, completed: 0, failed: 0 },
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
      closedAt: null,
    } as never)

    await createK1IngestionBatch({
      actorUserId,
      entityScopeId: entityId,
      uploadAttemptId,
      files: [file()],
    })

    const admission = admit.mock.calls[0]?.[0]
    expect(admission?.workload?.idempotency.canonicalRequest.inputs).toMatchObject({
      uploadAttemptId,
    })
    const quotaKeys = admission?.workload?.quotas.map((quota) => [
      quota.workloadKey ?? admission.workload!.workloadKey,
      quota.scopeKind,
      quota.periodKind,
    ].join(':')) ?? []
    expect(new Set(quotaKeys).size).toBe(quotaKeys.length)
  })

  it('rejects an over-limit PDF page count without enqueueing extraction or calling a provider', async () => {
    const pdf = await makePdf(config.k1Ingestion.uploadMaxPages + 1)
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const item = {
      id: itemId,
      batchId,
      fileName: 'too-many-pages.pdf',
      sizeBytes: pdf.byteLength,
      sha256,
      objectKey: `quarantine/${batchId}/${itemId}.pdf`,
      objectVersionId: null,
      status: 'PENDING_UPLOAD',
      k1DocumentId: null,
      documentId: null,
      errorCode: null,
      errorSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      queuedAt: null,
    }
    const batch = {
      id: batchId,
      createdByUserId: actorUserId,
      entityScopeId: entityId,
      status: 'OPEN',
      items: [item],
      counts: { total: 1, active: 1, completed: 0, failed: 0 },
      createdAt: new Date(),
      closedAt: null,
    }
    const transitions: Array<Record<string, unknown>> = []
    vi.spyOn(database, 'withTransaction').mockImplementation(async (callback) =>
      callback({ query: vi.fn() } as never))
    vi.spyOn(durableK1BatchRepository, 'getItemById').mockResolvedValue(item as never)
    vi.spyOn(durableK1BatchRepository, 'getById').mockResolvedValue(batch as never)
    vi.spyOn(durableK1BatchRepository, 'transitionItem').mockImplementation(async (
      _client,
      _id,
      transition,
    ) => {
      transitions.push(transition as unknown as Record<string, unknown>)
      return item as never
    })
    const objectStore: K1ObjectStore = {
      kind: 'local',
      put: vi.fn(),
      head: vi.fn().mockResolvedValue({
        key: item.objectKey,
        bucket: null,
        versionId: null,
        contentType: 'application/pdf',
        sizeBytes: pdf.byteLength,
        checksumSha256: sha256,
        etag: null,
        lastModified: new Date(),
        serverSideEncryption: null,
        kmsKeyId: null,
      }),
      read: vi.fn().mockResolvedValue({
        body: Readable.from(pdf),
        metadata: {
          key: item.objectKey,
          bucket: null,
          versionId: null,
          contentType: 'application/pdf',
          sizeBytes: pdf.byteLength,
          checksumSha256: sha256,
          etag: null,
          lastModified: new Date(),
          serverSideEncryption: null,
          kmsKeyId: null,
        },
        contentRange: null,
      }),
      delete: vi.fn(),
      putRawResult: vi.fn(),
      readRawResult: vi.fn(),
    }
    vi.spyOn(storage, 'getK1ObjectStore').mockReturnValue(objectStore)
    fakes.toPublicBatch.mockResolvedValue({
      id: batchId,
      items: [{ id: itemId, status: 'FAILED', error: { code: 'PDF_PAGE_LIMIT_EXCEEDED' } }],
    })

    const result = await completeK1BatchUploads({
      batchId,
      items: [{ itemId, sha256 }],
    })

    expect(result.items[0]).toMatchObject({
      status: 'FAILED',
      error: { code: 'PDF_PAGE_LIMIT_EXCEEDED' },
    })
    expect(transitions).toContainEqual(expect.objectContaining({
      to: 'FAILED',
      errorCode: 'PDF_PAGE_LIMIT_EXCEEDED',
    }))
    expect(fakes.queue.sendStart).not.toHaveBeenCalled()
    expect(fakes.queue.sendCompletion).not.toHaveBeenCalled()
  })

  it.each([
    'K1_USER_FILES_DAILY_LIMIT',
    'K1_GLOBAL_FILES_DAILY_LIMIT',
    'K1_GLOBAL_UNACCEPTED_BYTES_LIMIT',
    'K1_ACTIVE_BATCH_LIMIT',
  ])('rejects %s before creating a batch or upload slot', async (reasonCode) => {
    const admit = vi.spyOn(admissionService, 'admit')
      .mockResolvedValue(quotaRejected(reasonCode))
    const persist = vi.spyOn(durableK1BatchRepository, 'create')
      .mockRejectedValue(new Error('PERSISTENCE_MUST_NOT_RUN'))

    const error = await captureError(() => createK1IngestionBatch({
      actorUserId,
      entityScopeId: entityId,
      files: [file()],
    }))

    expect.soft(error).toMatchObject({ code: 'QUOTA_EXCEEDED', reasonCode })
    expect.soft(admit).toHaveBeenCalledTimes(1)
    expect.soft(persist).not.toHaveBeenCalled()
  })

  it.each([
    'K1_EXTRACTION_BACKLOG_LIMIT',
    'K1_EXTRACTION_CONCURRENCY_LIMIT',
    'K1_DOCUMENT_RETRY_DAILY_LIMIT',
    'K1_DOCUMENT_RETRY_LIFETIME_LIMIT',
  ])('rejects %s before a retry transaction or queue message', async (reasonCode) => {
    const admit = vi.spyOn(admissionService, 'admit')
      .mockResolvedValue(quotaRejected(reasonCode))
    const transaction = vi.spyOn(database, 'withTransaction')
      .mockRejectedValue(new Error('TRANSACTION_MUST_NOT_RUN'))

    const error = await captureError(() => retryK1Extraction({
      k1DocumentId,
      expectedDocumentVersion: 1,
      actorUserId,
    }))

    expect.soft(error).toMatchObject({ code: 'QUOTA_EXCEEDED', reasonCode })
    expect.soft(admit).toHaveBeenCalledTimes(1)
    expect.soft(transaction).not.toHaveBeenCalled()
    expect.soft(fakes.queue.sendStart).not.toHaveBeenCalled()
  })

  it('rechecks the BDA in-flight ceiling immediately before the AWS provider call', async () => {
    const rejection = Object.assign(new Error('K1_EXTRACTION_CONCURRENCY_LIMIT'), {
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'K1_EXTRACTION_CONCURRENCY_LIMIT',
    })
    const beforeProviderCall = vi.fn().mockRejectedValue(rejection)
    const send = vi.fn().mockResolvedValue({ invocationArn: 'arn:aws:bedrock:job/test' })
    const options: BdaExtractorOptions & {
      beforeProviderCall: () => Promise<void>
    } = {
      client: { send },
      profileArn: 'arn:aws:bedrock:us-west-2:111111111111:data-automation-profile/test',
      projectArn: 'arn:aws:bedrock:us-west-2:111111111111:data-automation-project/test',
      kmsKeyArn: 'arn:aws:kms:us-west-2:111111111111:key/test',
      beforeProviderCall,
    }
    const extractor = new BdaExtractor(options)

    const error = await captureError(() => extractor.submit({
      clientToken: randomUUID(),
      inputS3Uri: 's3://private/input.pdf',
      outputS3Uri: 's3://private/output/',
      k1DocumentId,
      extractionAttemptId: randomUUID(),
    }))

    expect.soft(error).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'K1_EXTRACTION_CONCURRENCY_LIMIT',
    })
    expect.soft(beforeProviderCall).toHaveBeenCalledTimes(1)
    expect.soft(send).not.toHaveBeenCalled()
  })

  it('rechecks the checkbox daily ceiling immediately before the Bedrock provider call', async () => {
    const rejection = Object.assign(new Error('K1_CHECKBOX_DAILY_LIMIT'), {
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'K1_CHECKBOX_DAILY_LIMIT',
    })
    const beforeProviderCall = vi.fn().mockRejectedValue(rejection)
    const send = vi.fn().mockResolvedValue({
      output: { message: { content: [{ text: '{"finalK1":true,"amendedK1":false}' }] } },
    })
    const verifier = new BedrockK1StatusCheckboxVerifier({
      client: { send },
      modelId: 'test-model',
      beforeProviderCall,
    } as ConstructorParameters<typeof BedrockK1StatusCheckboxVerifier>[0] & {
      beforeProviderCall: () => Promise<void>
    })

    const error = await captureError(() => verifier.verify(Buffer.from('%PDF-test')))

    expect.soft(error).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'K1_CHECKBOX_DAILY_LIMIT',
    })
    expect.soft(beforeProviderCall).toHaveBeenCalledTimes(1)
    expect.soft(send).not.toHaveBeenCalled()
  })
})
