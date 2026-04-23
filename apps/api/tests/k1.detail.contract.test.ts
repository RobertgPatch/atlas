import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'

// T028 — Contract: GET /v1/k1-documents/:k1DocumentId
describe('GET /v1/k1-documents/:k1DocumentId — detail contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns a K1DocumentSummary for an in-scope id', async () => {
    const list = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    const first = list.json().items[0]
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${first.id}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(first.id)
  })

  it('returns 404 for an id outside the caller entity scope', async () => {
    const list = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    const victimId = list.json().items[0].id
    const victimEntityId = list.json().items[0].entity.id

    k1Repository._debugSetMemberships(
      f.admin.id,
      f.entityIds.filter((id) => id !== victimEntityId),
    )

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${victimId}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('NOT_FOUND')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${randomUUID()}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for a malformed (non-uuid) id', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/not-a-uuid',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })
})
