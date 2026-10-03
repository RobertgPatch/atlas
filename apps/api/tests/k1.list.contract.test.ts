import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'

// T015 — Contract: GET /v1/k1-documents
// Asserts list shape, default sort, pagination, entity-scope.
describe('GET /v1/k1-documents — list contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns { items, nextCursor } with K1DocumentSummary items', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.items)).toBe(true)
    expect(body).toHaveProperty('nextCursor')
    expect(body.items.length).toBeGreaterThan(0)
    const first = body.items[0]
    for (const key of [
      'id',
      'documentId',
      'documentName',
      'partnership',
      'entity',
      'taxYear',
      'status',
      'issuesOpenCount',
      'uploadedAt',
      'uploaderUserId',
      'parseError',
      'supersededByDocumentId',
    ]) {
      expect(first).toHaveProperty(key)
    }
    expect(first.partnership).toHaveProperty('id')
    expect(first.partnership).toHaveProperty('name')
    expect(first.entity).toHaveProperty('id')
    expect(first.entity).toHaveProperty('name')
  })

  it('defaults to uploaded_at desc sort (newest first) — FR-029', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    const items: Array<{ uploadedAt: string }> = res.json().items
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1]!.uploadedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(items[i]!.uploadedAt).getTime(),
      )
    }
  })

  it('paginates via cursor and limit', async () => {
    const page1 = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents?limit=2',
      headers: { cookie: f.cookie },
    })
    expect(page1.statusCode).toBe(200)
    const body1 = page1.json()
    expect(body1.items.length).toBe(2)
    expect(body1.nextCursor).toBeTruthy()

    const page2 = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`,
      headers: { cookie: f.cookie },
    })
    expect(page2.statusCode).toBe(200)
    const body2 = page2.json()
    expect(body2.items[0]!.id).not.toBe(body1.items[0]!.id)
  })

  it('returns empty list for user with no entity_memberships', async () => {
    k1Repository._debugSetMemberships(f.admin.id, [])
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toEqual([])
  })

  it('returns 403 FORBIDDEN_ENTITY on an out-of-scope entity_id', async () => {
    k1Repository._debugSetMemberships(f.admin.id, [f.entityIds[0]!])
    const outOfScope = f.entityIds[1]!
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents?entity_id=${outOfScope}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ENTITY')
  })

  it('filters multiple partnerships before pagination and applies the same selection to KPIs and export', async () => {
    const all = (await f.app.inject({ method: 'GET', url: '/v1/k1-documents?limit=200', headers: { cookie: f.cookie } })).json().items
    const ids = [...new Set(all.map((item: { partnership: { id: string } }) => item.partnership.id))].slice(0, 2)
    expect(ids).toHaveLength(2)
    const expected = all.filter((item: { partnership: { id: string } }) => ids.includes(item.partnership.id))
    const query = `partnership_ids=${ids.join(',')}`
    const items = []
    let cursor: string | null = null
    do {
      const response = await f.app.inject({ method: 'GET', url: `/v1/k1-documents?${query}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, headers: { cookie: f.cookie } })
      expect(response.statusCode).toBe(200)
      items.push(...response.json().items)
      cursor = response.json().nextCursor
    } while (cursor)
    expect(items.map((item) => item.id)).toEqual(expected.map((item: { id: string }) => item.id))
    const kpis = await f.app.inject({ method: 'GET', url: `/v1/k1-documents/kpis?${query}`, headers: { cookie: f.cookie } })
    expect(kpis.statusCode).toBe(200)
    expect(Object.values(kpis.json().counts).reduce((sum: number, value) => sum + Number(value), 0)).toBe(expected.length)
    const exported = await f.app.inject({ method: 'GET', url: `/v1/k1-documents/export.csv?${query}`, headers: { cookie: f.cookie } })
    expect(exported.statusCode).toBe(200)
    for (const item of all) expect(exported.body.includes(item.id)).toBe(ids.includes(item.partnership.id))
  })

  it('keeps partnership selections inside the authorized entity scope', async () => {
    const all = (await f.app.inject({ method: 'GET', url: '/v1/k1-documents?limit=200', headers: { cookie: f.cookie } })).json().items
    const hidden = all.find((item: { entity: { id: string } }) => item.entity.id === f.entityIds[1])
    k1Repository._debugSetMemberships(f.admin.id, [f.entityIds[0]!])
    const response = await f.app.inject({ method: 'GET', url: `/v1/k1-documents?partnership_ids=${hidden.partnership.id}`, headers: { cookie: f.cookie } })
    expect(response.json().items).toEqual([])
    const invalid = await f.app.inject({ method: 'GET', url: '/v1/k1-documents?partnership_ids=invalid', headers: { cookie: f.cookie } })
    expect(invalid.statusCode).toBe(400)
  })

  it('returns 401 without a session cookie', async () => {
    const res = await f.app.inject({ method: 'GET', url: '/v1/k1-documents' })
    expect(res.statusCode).toBe(401)
  })
})
