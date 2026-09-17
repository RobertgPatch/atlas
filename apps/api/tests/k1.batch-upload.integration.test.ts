import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pool, withTransaction } from '../src/infra/db/client.js'
import { durableK1BatchRepository } from '../src/modules/k1/k1.repository.js'
import { getK1ObjectStore } from '../src/modules/k1/storage/index.js'
import { S3K1ObjectStore } from '../src/modules/k1/storage/s3K1ObjectStore.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { config } from '../src/config.js'
import { shouldProxyK1UploadThroughApi } from '../src/modules/k1/ingestion/k1Batch.service.js'
import { S3K1UploadSlotService } from '../src/modules/k1/ingestion/k1UploadSlots.service.js'

describe('K-1 exact upload capabilities', () => {
  it('uses the authenticated API upload proxy for local S3-backed BDA', () => {
    expect(shouldProxyK1UploadThroughApi('local', 's3')).toBe(true)
    expect(shouldProxyK1UploadThroughApi('local', 'local')).toBe(true)
    expect(shouldProxyK1UploadThroughApi('production', 's3')).toBe(false)
  })

  it('signs one exact conditional PUT with bounded bytes, type, and expiry', async () => {
    const previousEnabled = config.abuseProtection.killSwitches.k1UploadsEnabled
    Object.assign(config.abuseProtection.killSwitches, { k1UploadsEnabled: true })
    const sign = vi.fn(async (_client, command, options) => {
      expect(command.input).toMatchObject({
        Bucket: 'test-k1-bucket',
        Key: 'originals/quarantine/batch/item.pdf',
        ContentType: 'application/pdf',
        ContentLength: 1234,
        IfNoneMatch: '*',
        ServerSideEncryption: 'aws:kms',
      })
      expect(options).toEqual({
        expiresIn: config.abuseProtection.capabilities.uploadTtlSeconds,
      })
      return 'https://example.invalid/restricted-presigned-value'
    })
    const previousBucket = config.k1Ingestion.s3.bucket
    const previousKms = config.k1Ingestion.s3.kmsKeyArn
    Object.assign(config.k1Ingestion.s3, {
      bucket: 'test-k1-bucket',
      kmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/test',
    })
    try {
      const service = new S3K1UploadSlotService({} as never, sign as never)
      const slot = await service.createSlot({
        id: randomUUID(),
        batchId: randomUUID(),
        documentId: null,
        k1DocumentId: null,
        partnershipIntakePartnershipId: null,
        partnershipIntakeSourceK1DocumentId: null,
        fileName: 'test.pdf',
        sizeBytes: 1234,
        sha256: 'a'.repeat(64),
        objectKey: 'originals/quarantine/batch/item.pdf',
        objectVersionId: null,
        status: 'PENDING_UPLOAD',
        errorCode: null,
        errorSummary: null,
        queuedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      expect(slot.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-length': '1234',
        'if-none-match': '*',
      })
      expect(sign).toHaveBeenCalledOnce()
    } finally {
      Object.assign(config.abuseProtection.killSwitches, { k1UploadsEnabled: previousEnabled })
      Object.assign(config.k1Ingestion.s3, { bucket: previousBucket, kmsKeyArn: previousKms })
    }
  })

  it('preserves the conditional write when the local API proxy stores the PDF in S3', async () => {
    const send = vi.fn(async () => ({
      VersionId: 'version-1',
      ETag: 'etag-1',
    }))
    const store = new S3K1ObjectStore({
      client: { send } as never,
      bucket: 'test-k1-bucket',
      kmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/test',
    })

    await store.put({
      key: 'originals/quarantine/batch/item.pdf',
      body: Buffer.from('%PDF-test'),
      contentType: 'application/pdf',
      sizeBytes: 9,
      checksumSha256: 'a'.repeat(64),
      ifNoneMatch: '*',
    })

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: 'test-k1-bucket',
      Key: 'originals/quarantine/batch/item.pdf',
      IfNoneMatch: '*',
      ServerSideEncryption: 'aws:kms',
    })
  })

  it('issues no URL while uploads are disabled and requires replay-safe bucket controls', async () => {
    const previousEnabled = config.abuseProtection.killSwitches.k1UploadsEnabled
    Object.assign(config.abuseProtection.killSwitches, { k1UploadsEnabled: false })
    const sign = vi.fn()
    try {
      const service = new S3K1UploadSlotService({} as never, sign as never)
      await expect(service.createSlot({ id: 'item' } as never)).rejects.toThrow('K1_UPLOADS_DISABLED')
      expect(sign).not.toHaveBeenCalled()
    } finally {
      Object.assign(config.abuseProtection.killSwitches, { k1UploadsEnabled: previousEnabled })
    }

    const storage = readFileSync(new URL(
      '../../../infra/aws/terraform/modules/k1_ingestion/storage.tf',
      import.meta.url,
    ), 'utf8')
    expect(storage).toContain('s3:signatureAge')
    expect(storage).toContain('s3:if-none-match')
    expect(storage).toContain('/quarantine/*')
    expect(storage).toContain('versioning_configuration { status = "Enabled" }')
    expect(storage).toContain('DenyInsecureTransport')
    expect(storage).toContain('DenyUnencryptedObjectUploads')
  })
})

const durable = pool ? describe : describe.skip
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex')

const makePdf = async (pages = 1): Promise<Buffer> => {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1) pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

durable('K-1 local batch upload integration', () => {
  let fixture: TestFixture
  let entityId: string
  const objectKeys: string[] = []

  beforeEach(async () => {
    fixture = await createTestFixture()
    await pool!.query(`truncate table
      abuse_rate_windows,
      workload_quota_counters,
      workload_leases,
      idempotent_operations,
      protection_overrides
      restart identity cascade`)
    entityId = randomUUID()
    await pool!.query(
      `insert into entities (id, name, entity_type, status)
       values ($1, $2, 'TRUST', 'ACTIVE')`,
      [entityId, `Batch Upload ${entityId}`],
    )
  })

  afterEach(async () => {
    await fixture.app.close()
    await Promise.allSettled(objectKeys.splice(0).map((key) => getK1ObjectStore().delete({ key })))
    const documents = await pool!.query<{ document_id: string | null; k1_document_id: string | null }>(
      `select document_id, k1_document_id from k1_ingestion_items
        where batch_id in (select id from k1_ingestion_batches where entity_scope_id = $1)`,
      [entityId],
    )
    const k1DocumentIds = documents.rows.flatMap((row) => row.k1_document_id ? [row.k1_document_id] : [])
    const documentIds = documents.rows.flatMap((row) => row.document_id ? [row.document_id] : [])
    if (k1DocumentIds.length > 0) {
      await pool!.query(`delete from k1_local_queue_messages where payload->>'k1DocumentId' = any($1::text[])`, [k1DocumentIds])
    }
    await pool!.query(
      `delete from k1_ingestion_items
        where batch_id in (select id from k1_ingestion_batches where entity_scope_id = $1)`,
      [entityId],
    )
    if (k1DocumentIds.length > 0) {
      await pool!.query('delete from k1_documents where id = any($1::uuid[])', [k1DocumentIds])
    }
    if (documentIds.length > 0) {
      await pool!.query('delete from documents where id = any($1::uuid[])', [documentIds])
    }
    await pool!.query('delete from k1_ingestion_batches where entity_scope_id = $1', [entityId])
    await pool!.query('delete from entity_memberships where entity_id = $1', [entityId])
    await pool!.query('delete from entities where id = $1', [entityId])
  })

  const createBatch = async (fileName: string, pdf: Buffer, partnershipIntake = false) => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: {
        entityScopeId: entityId,
        createPartnershipIfMissing: partnershipIntake,
        files: [{ fileName, sizeBytes: pdf.length, sha256: sha256(pdf), mimeType: 'application/pdf' }],
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json()
  }

  const putAndComplete = async (batch: any, pdf: Buffer, declaredHash = sha256(pdf)) => {
    const item = batch.items[0]
    objectKeys.push(`quarantine/${batch.id}/${item.id}.pdf`)
    const uploaded = await fixture.app.inject({
      method: 'PUT',
      url: `/v1/k1-ingestion-items/${item.id}/local-upload`,
      headers: {
        cookie: fixture.cookie,
        'content-type': 'application/pdf',
        'if-none-match': '*',
        'x-amz-checksum-sha256': declaredHash,
        'content-length': String(pdf.length),
      },
      payload: pdf,
    })
    expect(uploaded.statusCode).toBe(204)
    return fixture.app.inject({
      method: 'POST',
      url: `/v1/k1-ingestion-batches/${batch.id}/complete-uploads`,
      headers: { cookie: fixture.cookie },
      payload: { items: [{ itemId: item.id, sha256: declaredHash }] },
    })
  }

  it('verifies checksum and PDF structure, persists a document, and queues exactly once', async () => {
    const pdf = await makePdf(2)
    const batch = await createBatch('valid.pdf', pdf)
    const completed = await putAndComplete(batch, pdf)
    expect(completed.statusCode).toBe(202)
    const snapshot = completed.json()
    expect(snapshot.items[0]).toMatchObject({ status: 'QUEUED' })
    expect(snapshot.items[0].k1DocumentId).toMatch(/[0-9a-f-]{36}/)

    const repeated = await fixture.app.inject({
      method: 'POST',
      url: `/v1/k1-ingestion-batches/${batch.id}/complete-uploads`,
      headers: { cookie: fixture.cookie },
      payload: { items: [{ itemId: batch.items[0].id, sha256: sha256(pdf) }] },
    })
    expect(repeated.statusCode).toBe(202)
    expect(repeated.json().items[0].k1DocumentId).toBe(snapshot.items[0].k1DocumentId)
    const queued = await pool!.query<{ count: string }>(
      `select count(*) from k1_local_queue_messages
        where queue_name = 'START_WORK' and payload->>'k1DocumentId' = $1`,
      [snapshot.items[0].k1DocumentId],
    )
    expect(queued.rows[0]?.count).toBe('1')
  })

  it('sends only page 1 for partnership intake and leaves the full PDF available for a later annual upload', async () => {
    const pdf = await makePdf(3)
    const batch = await createBatch('partnership-intake.pdf', pdf, true)
    const completed = await putAndComplete(batch, pdf)
    expect(completed.statusCode).toBe(202)
    const item = completed.json().items[0]

    const stored = await pool!.query<{ storage_path: string; page_count: number; size_bytes: string }>(
      `select d.storage_path, d.page_count, d.size_bytes
         from documents d
         join k1_documents kd on kd.document_id = d.id
        where kd.id = $1`,
      [item.k1DocumentId],
    )
    expect(stored.rows[0]?.page_count).toBe(1)
    expect(Number(stored.rows[0]?.size_bytes)).toBeLessThan(pdf.byteLength)
    const acceptedKey = stored.rows[0]!.storage_path
    objectKeys.push(acceptedKey)
    const accepted = await getK1ObjectStore().read({ key: acceptedKey })
    const chunks: Buffer[] = []
    for await (const chunk of accepted.body) chunks.push(Buffer.from(chunk as Uint8Array))
    expect((await PDFDocument.load(Buffer.concat(chunks))).getPageCount()).toBe(1)
    expect(await getK1ObjectStore().head({ key: `quarantine/${batch.id}/${batch.items[0].id}.pdf` })).toBeNull()
    const annualQueue = await fixture.app.inject({
      method: 'GET',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
    })
    expect(annualQueue.statusCode).toBe(200)
    expect(annualQueue.json().items.map((candidate: { id: string }) => candidate.id)).not.toContain(batch.id)

    const annual = await createBatch('annual-k1.pdf', pdf)
    const annualCompleted = await putAndComplete(annual, pdf)
    expect(annualCompleted.json().items[0]).toMatchObject({ status: 'QUEUED', error: null })
  })

  it('isolates invalid, corrupt, encrypted, and checksum-mismatched PDFs', async () => {
    const cases: Array<{ name: string; pdf: Buffer; code: string }> = [
      { name: 'corrupt.pdf', pdf: Buffer.from('%PDF-1.7\nnot a real pdf'), code: 'PDF_INVALID' },
      { name: 'encrypted.pdf', pdf: Buffer.concat([await makePdf(), Buffer.from('\n/Encrypt true')]), code: 'PDF_ENCRYPTED' },
    ]
    for (const testCase of cases) {
      const batch = await createBatch(testCase.name, testCase.pdf)
      const response = await putAndComplete(batch, testCase.pdf)
      expect(response.statusCode).toBe(202)
      expect(response.json().items[0]).toMatchObject({ status: 'FAILED', error: { code: testCase.code } })
    }

    const valid = await makePdf()
    const batch = await createBatch('checksum.pdf', valid)
    const wrong = '0'.repeat(64)
    const uploaded = await fixture.app.inject({
      method: 'PUT',
      url: `/v1/k1-ingestion-items/${batch.items[0].id}/local-upload`,
      headers: {
        cookie: fixture.cookie,
        'content-type': 'application/pdf',
        'if-none-match': '*',
        'x-amz-checksum-sha256': wrong,
        'content-length': String(valid.length),
      },
      payload: valid,
    })
    expect(uploaded.statusCode).toBe(409)
    expect(uploaded.json().error).toBe('OBJECT_CHECKSUM_MISMATCH')
  })

  it('rejects a duplicate safely without changing the already queued item', async () => {
    const pdf = await makePdf()
    const first = await createBatch('first.pdf', pdf)
    const firstComplete = await putAndComplete(first, pdf)
    expect(firstComplete.json().items[0].status).toBe('QUEUED')

    const second = await createBatch('second.pdf', pdf)
    const secondComplete = await putAndComplete(second, pdf)
    expect(secondComplete.json().items[0]).toMatchObject({
      status: 'FAILED',
      error: { code: 'DUPLICATE_K1_CONTENT', retryable: false },
    })

    const firstRead = await fixture.app.inject({
      method: 'GET',
      url: `/v1/k1-ingestion-batches/${first.id}`,
      headers: { cookie: fixture.cookie },
    })
    expect(firstRead.json().items[0].status).toBe('QUEUED')
  })

  it('deletes a failed upload and accepts the same PDF again', async () => {
    const pdf = await makePdf()
    const first = await createBatch('failed-first.pdf', pdf)
    const firstComplete = await putAndComplete(first, pdf)
    expect(firstComplete.json().items[0].status).toBe('QUEUED')

    await withTransaction(async (client) => {
      await durableK1BatchRepository.transitionItem(client, first.items[0].id, {
        from: ['QUEUED'],
        to: 'FAILED',
        errorCode: 'EXTRACTION_FAILED',
        errorSummary: 'The extraction attempt did not complete.',
      })
    })

    const deleted = await fixture.app.inject({
      method: 'DELETE',
      url: `/v1/k1-ingestion-items/${first.items[0].id}`,
      headers: { cookie: fixture.cookie },
    })
    expect(deleted.statusCode).toBe(204)
    expect(await durableK1BatchRepository.getById(first.id)).toBeNull()
    expect(await getK1ObjectStore().head({
      key: `quarantine/${first.id}/${first.items[0].id}.pdf`,
    })).toBeNull()

    const second = await createBatch('failed-retry.pdf', pdf)
    const secondComplete = await putAndComplete(second, pdf)
    expect(secondComplete.statusCode).toBe(202)
    expect(secondComplete.json().items[0]).toMatchObject({ status: 'QUEUED', error: null })
  })

  it('survives an API restart with the same batch and item state', async () => {
    const pdf = await makePdf()
    const batch = await createBatch('restart.pdf', pdf)
    const completed = await putAndComplete(batch, pdf)
    expect(completed.json().items[0].status).toBe('QUEUED')

    await fixture.app.close()
    fixture = await createTestFixture()
    const reloaded = await fixture.app.inject({
      method: 'GET',
      url: `/v1/k1-ingestion-batches/${batch.id}`,
      headers: { cookie: fixture.cookie },
    })
    expect(reloaded.statusCode).toBe(200)
    expect(reloaded.json().items[0]).toMatchObject({ status: 'QUEUED' })
  })
})
