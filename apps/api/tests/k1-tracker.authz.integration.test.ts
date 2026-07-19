import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { pool } from '../src/infra/db/client.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { createK1TrackerFixture, type K1TrackerFixture } from './helpers/k1TrackerFixture.js'

const durable = pool ? it : it.skip
describe('K1 Tracker authorization', () => {
  let fixture: K1TrackerFixture
  let app: ReturnType<typeof buildApp>
  let userCookie: string
  beforeEach(async () => {
    fixture = await createK1TrackerFixture()
    const user = authRepository.listUsers().find((candidate) => candidate.role === 'User')!
    await pool!.query('insert into entity_memberships (id, user_id, entity_id, created_by) values ($1,$2,$3,$2)', [randomUUID(), user.id, fixture.entityId])
    await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [{ fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    userCookie = `atlas_session=${authRepository.createSession(user.id).token}`
    app = buildApp(); await app.ready()
  })
  afterEach(async () => { await app.close(); await fixture.cleanup() })
  durable('allows scoped Users to read but not mutate tracker years', async () => {
    const list = await app.inject({ method: 'GET', url: '/v1/k1-tracker/partnerships', headers: { cookie: userCookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json().items.map((item: { partnershipId: string }) => item.partnershipId)).toContain(fixture.partnershipId)
    const mutation = await app.inject({ method: 'POST', url: `/v1/k1-tracker/partnerships/${fixture.partnershipId}/years`, headers: { cookie: userCookie }, payload: { taxYear: 2025, values: [] } })
    expect(mutation.statusCode).toBe(403)
    expect(mutation.json().error).toBe('FORBIDDEN_ROLE')
    const adminCookie = `atlas_session=${authRepository.createSession(fixture.adminUserId).token}`
    const overview = await app.inject({ method: 'GET', url: `/v1/k1-tracker/partnerships/${fixture.partnershipId}`, headers: { cookie: adminCookie } })
    expect(overview.statusCode).toBe(200)
    expect(overview.json().years).toEqual(expect.arrayContaining([expect.objectContaining({ taxYear: 2024 })]))
    const year = await app.inject({ method: 'GET', url: `/v1/k1-tracker/partnerships/${fixture.partnershipId}/years/2024`, headers: { cookie: adminCookie } })
    expect(year.statusCode).toBe(200)
    expect(year.json()).toEqual(expect.objectContaining({ partnershipId: fixture.partnershipId, taxYear: 2024, values: expect.any(Array), calculation: expect.any(Object) }))
  })
})
