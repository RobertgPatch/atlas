import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { pool } from '../src/infra/db/client.js'
import { createDurableK1ReviewFixture, type DurableK1ReviewFixture } from './helpers/durableK1ReviewFixture.js'

// T017 — Integration: entity-scope authorization
// - User with no entity_memberships → empty list + zeroed KPIs
// - User scoped to entity A cannot see entity B's K-1s on either endpoint
const legacy = pool ? describe.skip : describe
legacy('entity-scope authorization (FR-031, FR-032)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('user with no memberships gets empty list and zeroed KPI counts', async () => {
    k1Repository._debugSetMemberships(f.admin.id, [])
    const list = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().items).toEqual([])

    const kpis = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/kpis',
      headers: { cookie: f.cookie },
    })
    expect(kpis.statusCode).toBe(200)
    const body = kpis.json()
    for (const count of Object.values(body.counts as Record<string, number>)) {
      expect(count).toBe(0)
    }
    expect(body.processingWithErrors).toBe(0)
  })

  it('user scoped to entity A cannot see entity B on list', async () => {
    const entityA = f.entityIds[0]!
    const entityB = f.entityIds[1]!
    k1Repository._debugSetMemberships(f.admin.id, [entityA])

    const all = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    const ids = (all.json().items as Array<{ entity: { id: string } }>).map(
      (i) => i.entity.id,
    )
    expect(ids.every((id) => id === entityA)).toBe(true)
    expect(ids).not.toContain(entityB)
  })

  it('user scoped to entity A receives 403 when querying entity B explicitly', async () => {
    const entityA = f.entityIds[0]!
    const entityB = f.entityIds[1]!
    k1Repository._debugSetMemberships(f.admin.id, [entityA])

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents?entity_id=${entityB}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ENTITY')
  })

  it('two users with disjoint memberships see disjoint datasets on same API', async () => {
    const entityA = f.entityIds[0]!
    const entityB = f.entityIds[1]!
    k1Repository._debugSetMemberships(f.admin.id, [entityA])
    k1Repository._debugSetMemberships(f.user.id, [entityB])
    const userCookie = sessionCookieFor(f.user.id)

    const adminList = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    const userList = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: userCookie },
    })
    const adminEntities = new Set(
      (adminList.json().items as Array<{ entity: { id: string } }>).map(
        (i) => i.entity.id,
      ),
    )
    const userEntities = new Set(
      (userList.json().items as Array<{ entity: { id: string } }>).map(
        (i) => i.entity.id,
      ),
    )
    for (const id of adminEntities) expect(userEntities.has(id)).toBe(false)
  })
})

const durable = pool ? describe : describe.skip
durable('K-1 end-to-end permission loss', () => {
  let f: DurableK1ReviewFixture
  beforeEach(async () => { f = await createDurableK1ReviewFixture() })
  afterEach(async () => { await f.cleanup() })

  it('rechecks entity authorization for every document and queue operation', async () => {
    const before = await f.app.inject({ method: 'GET', url: `/v1/k1-ingestion-batches/${f.batchId}`, headers: { cookie: f.userCookie } })
    expect(before.statusCode).toBe(200)
    await pool!.query('delete from entity_memberships where user_id = $1 and entity_id = $2', [f.user.id, f.entityId])

    const requests = [
      { name: 'upload', method: 'POST', url: '/v1/k1-ingestion-batches', payload: { entityScopeId: f.entityId, files: [{ fileName: 'blocked.pdf', sizeBytes: 10, sha256: 'a'.repeat(64) }] }, expected: 403 },
      { name: 'status', method: 'GET', url: `/v1/k1-ingestion-batches/${f.batchId}`, expected: 404 },
      { name: 'pdf read', method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/pdf`, expected: 404 },
      { name: 'retry', method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/retry-extraction`, payload: { expectedDocumentVersion: 3 }, expected: 403 },
      { name: 'match', method: 'PUT', url: `/v1/k1-documents/${f.k1DocumentId}/match`, payload: { expectedDocumentVersion: 3, entityId: f.entityId, partnershipId: f.partnershipId, taxYear: 2025, reviewedEvidence: true }, expected: 403 },
      { name: 'correction', method: 'PUT', url: `/v1/k1-documents/${f.k1DocumentId}/corrections`, headers: { 'if-match': '3' }, payload: { corrections: [{ fieldValueId: f.moneyFieldId, value: '1200.00' }] }, expected: 403 },
      { name: 'issue resolution', method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/issues/${f.issueId}/resolve`, headers: { 'if-match': '3' }, payload: { acceptExtractedValue: true }, expected: 403 },
      { name: 'preview', method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/apply-preview`, payload: { expectedDocumentVersion: 3 }, expected: 403 },
      { name: 'apply', method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/apply`, payload: { applicationId: '11111111-1111-4111-8111-111111111111', expectedDocumentVersion: 3, expectedTrackerRevision: 1, decisions: [] }, expected: 403 },
      { name: 'cancel', method: 'POST', url: `/v1/k1-ingestion-items/${f.itemId}/cancel`, expected: 404 },
      { name: 'delete', method: 'DELETE', url: `/v1/k1-ingestion-items/${f.itemId}`, expected: 404 },
    ] as const
    for (const request of requests) {
      const response = await f.app.inject({
        method: request.method, url: request.url,
        headers: { cookie: f.userCookie, ...('headers' in request ? request.headers : {}) },
        ...('payload' in request ? { payload: request.payload } : {}),
      })
      expect(response.statusCode, request.name).toBe(request.expected)
    }
  })
})
