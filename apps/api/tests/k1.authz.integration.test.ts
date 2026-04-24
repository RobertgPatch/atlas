import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'

// T017 — Integration: entity-scope authorization
// - User with no entity_memberships → empty list + zeroed KPIs
// - User scoped to entity A cannot see entity B's K-1s on either endpoint
describe('entity-scope authorization (FR-031, FR-032)', () => {
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
