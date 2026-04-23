import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { buildMultipart, fakePdfBytes } from './helpers/multipart.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

// T035 — Contract: POST /v1/k1-documents (upload)
describe('POST /v1/k1-documents — upload contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  const uploadTarget = () => {
    const entity = f.entities.find((e) => e.name === 'Whitfield Holdings LLC')!
    return { entity }
  }

  it('201 happy-path: creates k1_documents row, emits k1.uploaded audit, initial status UPLOADED', async () => {
    const { entity } = uploadTarget()

    const { body, contentType } = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [
        {
          name: 'file',
          filename: 'k1.pdf',
          contentType: 'application/pdf',
          data: fakePdfBytes(2048),
        },
      ],
    )

    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json).toHaveProperty('k1DocumentId')
    expect(json).toHaveProperty('documentId')
    expect(json.status).toBe('UPLOADED')

    const events = auditRepository
      .getInMemoryEvents()
      .filter((e) => e.eventName === 'k1.uploaded' && e.objectId === json.k1DocumentId)
    expect(events.length).toBe(1)
  })

  it('accepts repeat uploads and defers duplicate detection to the parse step', async () => {
    const { entity } = uploadTarget()
    const first = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const ok = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': first.contentType },
      payload: first.body,
    })
    expect(ok.statusCode).toBe(201)

    const second = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [{ name: 'file', filename: 'b.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const dup = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': second.contentType },
      payload: second.body,
    })
    expect(dup.statusCode).toBe(201)
  })

  it('400 on missing entityId field', async () => {
    const { body, contentType } = buildMultipart(
      [],
      [{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(400)
  })

  it('400 on invalid entityId', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'entityId', value: 'not-a-uuid' },
      ],
      [{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(400)
  })

  it('403 FORBIDDEN_ENTITY when target entity is outside the caller scope', async () => {
    const { entity } = uploadTarget()
    k1Repository._debugSetMemberships(
      f.admin.id,
      f.entityIds.filter((id) => id !== entity.id),
    )
    const { body, contentType } = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ENTITY')
  })

  it('415 when uploaded file is not application/pdf', async () => {
    const { entity } = uploadTarget()
    const { body, contentType } = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [{ name: 'file', filename: 'note.txt', contentType: 'text/plain', data: Buffer.from('not a pdf') }],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(415)
  })

  it('400 on missing file part', async () => {
    const { entity } = uploadTarget()
    const { body, contentType } = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(400)
  })

  it('400 EXPECTED_MULTIPART when request is not multipart', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': 'application/json' },
      payload: { partnershipId: randomUUID() },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('EXPECTED_MULTIPART')
  })
})
