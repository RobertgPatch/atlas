import { createHash, randomUUID } from 'node:crypto'

import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pool, withTransaction } from '../src/infra/db/client.js'
import { durableK1BatchRepository } from '../src/modules/k1/k1.repository.js'
import { getK1ObjectStore } from '../src/modules/k1/storage/index.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

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

  const createBatch = async (fileName: string, pdf: Buffer) => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: {
        entityScopeId: entityId,
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
