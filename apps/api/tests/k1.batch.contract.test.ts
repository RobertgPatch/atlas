import { createHash, randomUUID } from 'node:crypto'

import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pool } from '../src/infra/db/client.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const durable = pool ? describe : describe.skip

const makePdf = async (pages = 1): Promise<Buffer> => {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1) pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

durable('K-1 ingestion batch API contract', () => {
  let fixture: TestFixture
  let entityId: string

  beforeEach(async () => {
    fixture = await createTestFixture()
    entityId = randomUUID()
    await pool!.query(
      `insert into entities (id, name, entity_type, status)
       values ($1, $2, 'TRUST', 'ACTIVE')`,
      [entityId, `Batch Contract ${entityId}`],
    )
  })

  afterEach(async () => {
    await fixture.app.close()
    await pool!.query(
      `delete from k1_ingestion_items
        where batch_id in (select id from k1_ingestion_batches where entity_scope_id = $1)`,
      [entityId],
    )
    await pool!.query('delete from k1_ingestion_batches where entity_scope_id = $1', [entityId])
    await pool!.query('delete from entity_memberships where entity_id = $1', [entityId])
    await pool!.query('delete from entities where id = $1', [entityId])
  })

  it('creates 1-25 independent upload slots and returns a durable snapshot', async () => {
    const one = await makePdf()
    const two = await makePdf(2)
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: {
        entityScopeId: entityId,
        files: [
          { fileName: 'alpha.pdf', sizeBytes: one.length, sha256: digest(one), mimeType: 'application/pdf' },
          { fileName: 'beta.pdf', sizeBytes: two.length, sha256: digest(two), mimeType: 'application/pdf' },
        ],
      },
    })

    expect(response.statusCode).toBe(201)
    const batch = response.json()
    expect(batch).toMatchObject({
      status: 'OPEN',
      entityScopeId: entityId,
      counts: { total: 2, active: 2, actionRequired: 0, applied: 0, failed: 0 },
    })
    expect(batch.items).toHaveLength(2)
    expect(batch.items[0]).toMatchObject({
      fileName: 'alpha.pdf',
      status: 'PENDING_UPLOAD',
      upload: { method: 'PUT' },
    })
    expect(batch.items[0].upload.url).toContain(`/k1-ingestion-items/${batch.items[0].id}/local-upload`)

    const read = await fixture.app.inject({
      method: 'GET',
      url: `/v1/k1-ingestion-batches/${batch.id}`,
      headers: { cookie: fixture.cookie },
    })
    expect(read.statusCode).toBe(200)
    expect(read.headers.etag).toBeTruthy()
    expect(read.json()).toMatchObject({ id: batch.id, counts: { total: 2 } })
  })

  it('returns stable validation and duplicate-declaration errors', async () => {
    const pdf = await makePdf()
    const sha256 = digest(pdf)
    const empty = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: { entityScopeId: entityId, files: [] },
    })
    expect(empty.statusCode).toBe(400)
    expect(empty.json().error).toBe('VALIDATION_ERROR')

    const duplicate = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: {
        entityScopeId: entityId,
        files: [
          { fileName: 'same-a.pdf', sizeBytes: pdf.length, sha256 },
          { fileName: 'same-b.pdf', sizeBytes: pdf.length, sha256 },
        ],
      },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toMatchObject({ error: 'DUPLICATE_K1_CONTENT', retryable: false })
  })

  it('enforces authentication and current entity scope', async () => {
    const pdf = await makePdf()
    const payload = {
      entityScopeId: entityId,
      files: [{ fileName: 'scope.pdf', sizeBytes: pdf.length, sha256: digest(pdf) }],
    }
    const anonymous = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      payload,
    })
    expect(anonymous.statusCode).toBe(401)

    const forbidden = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.userCookie },
      payload,
    })
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json().error).toBe('FORBIDDEN_ENTITY')
  })

  it('returns a per-item failure when completion cannot verify an upload', async () => {
    const pdf = await makePdf()
    const sha256 = digest(pdf)
    const created = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: {
        entityScopeId: entityId,
        files: [{ fileName: 'missing.pdf', sizeBytes: pdf.length, sha256 }],
      },
    })
    const batch = created.json()
    const completed = await fixture.app.inject({
      method: 'POST',
      url: `/v1/k1-ingestion-batches/${batch.id}/complete-uploads`,
      headers: { cookie: fixture.cookie },
      payload: { items: [{ itemId: batch.items[0].id, sha256 }] },
    })
    expect(completed.statusCode).toBe(202)
    expect(completed.json().items[0]).toMatchObject({
      status: 'FAILED',
      error: { code: 'UPLOAD_NOT_FOUND', retryable: true },
    })
  })
})
