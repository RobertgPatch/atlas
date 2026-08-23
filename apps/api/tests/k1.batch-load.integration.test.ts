import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { getK1ObjectStore } from '../src/modules/k1/storage/index.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const durable = pool ? describe : describe.skip
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')

durable('K-1 25-document load and isolation', () => {
  let fixture: TestFixture
  let entityId: string
  let batchId: string | null = null
  const objectKeys: string[] = []

  beforeEach(async () => {
    fixture = await createTestFixture()
    entityId = randomUUID()
    await pool!.query(`insert into entities (id, name, entity_type, status) values ($1, $2, 'TRUST', 'ACTIVE')`, [entityId, `Load ${entityId}`])
  })

  afterEach(async () => {
    await fixture.app.close()
    await Promise.allSettled(objectKeys.map((key) => getK1ObjectStore().delete({ key })))
    if (batchId) {
      const linked = await pool!.query<{ document_id: string | null; k1_document_id: string | null }>('select document_id, k1_document_id from k1_ingestion_items where batch_id = $1', [batchId])
      const k1Ids = linked.rows.flatMap((row) => row.k1_document_id ? [row.k1_document_id] : [])
      const documentIds = linked.rows.flatMap((row) => row.document_id ? [row.document_id] : [])
      if (k1Ids.length) await pool!.query(`delete from k1_local_queue_messages where payload->>'k1DocumentId' = any($1::text[])`, [k1Ids])
      await pool!.query('delete from k1_ingestion_items where batch_id = $1', [batchId])
      if (k1Ids.length) await pool!.query('delete from k1_documents where id = any($1::uuid[])', [k1Ids])
      if (documentIds.length) await pool!.query('delete from documents where id = any($1::uuid[])', [documentIds])
      await pool!.query('delete from k1_ingestion_batches where id = $1', [batchId])
    }
    await pool!.query('delete from entities where id = $1', [entityId])
  }, 30_000)

  it('queues 24 valid PDFs, isolates one corrupt file, and remains idempotent within bounded memory', async () => {
    const files: Buffer[] = []
    for (let index = 0; index < 24; index += 1) {
      const pdf = await PDFDocument.create()
      pdf.addPage([612, 792])
      pdf.setTitle(`Synthetic load fixture ${index}`)
      files.push(Buffer.from(await pdf.save()))
    }
    files.push(Buffer.from('%PDF-1.7\ncorrupt synthetic fixture'))
    const heapBefore = process.memoryUsage().heapUsed
    const startedAt = Date.now()
    const created = await fixture.app.inject({
      method: 'POST', url: '/v1/k1-ingestion-batches', headers: { cookie: fixture.cookie },
      payload: { entityScopeId: entityId, files: files.map((file, index) => ({ fileName: `synthetic-${index}.pdf`, sizeBytes: file.length, sha256: hash(file) })) },
    })
    expect(created.statusCode).toBe(201)
    expect(Date.now() - startedAt).toBeLessThan(2_000)
    const batch = created.json()
    batchId = batch.id

    await Promise.all(batch.items.map(async (item: { id: string }, index: number) => {
      const file = files[index]!
      objectKeys.push(`quarantine/${batch.id}/${item.id}.pdf`)
      const response = await fixture.app.inject({
        method: 'PUT', url: `/v1/k1-ingestion-items/${item.id}/local-upload`,
        headers: { cookie: fixture.cookie, 'content-type': 'application/pdf', 'content-length': String(file.length), 'x-amz-checksum-sha256': hash(file) },
        payload: file,
      })
      expect(response.statusCode).toBe(204)
    }))
    const completionPayload = { items: batch.items.map((item: { id: string }, index: number) => ({ itemId: item.id, sha256: hash(files[index]!) })) }
    const completed = await fixture.app.inject({
      method: 'POST', url: `/v1/k1-ingestion-batches/${batch.id}/complete-uploads`, headers: { cookie: fixture.cookie }, payload: completionPayload,
    })
    expect(completed.statusCode).toBe(202)
    const snapshot = completed.json()
    expect(snapshot.items.filter((item: { status: string }) => item.status === 'QUEUED')).toHaveLength(24)
    expect(snapshot.items.filter((item: { status: string; error: { code: string } | null }) => item.status === 'FAILED' && item.error?.code === 'PDF_INVALID')).toHaveLength(1)
    const queued = await pool!.query<{ count: string }>(`select count(*) from k1_local_queue_messages where queue_name = 'START_WORK' and payload->>'ingestionItemId' in (select id::text from k1_ingestion_items where batch_id = $1)`, [batch.id])
    expect(queued.rows[0]?.count).toBe('24')

    const replay = await fixture.app.inject({
      method: 'POST', url: `/v1/k1-ingestion-batches/${batch.id}/complete-uploads`, headers: { cookie: fixture.cookie }, payload: completionPayload,
    })
    expect(replay.statusCode).toBe(202)
    expect((await pool!.query<{ count: string }>(`select count(*) from k1_local_queue_messages where queue_name = 'START_WORK' and payload->>'ingestionItemId' in (select id::text from k1_ingestion_items where batch_id = $1)`, [batch.id])).rows[0]?.count).toBe('24')
    expect(Date.now() - startedAt).toBeLessThan(30_000)
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(128 * 1024 * 1024)
  }, 40_000)
})
