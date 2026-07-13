import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership Tracker validation security', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })
  it('sanitizes malformed money and identifiers into contract errors', async () => {
    const response = await fixture.app.inject({ method: 'POST', url: '/v1/partnership-tracker/partnerships/not-a-uuid/nav', headers: { cookie: fixture.cookie }, payload: { amount: 'NaN', valuationDate: 'not-a-date' } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' })
    expect(response.body).not.toContain('node_modules')
  })
})

const durable = pool ? describe : describe.skip
durable('Partnership Tracker child-resource scope security', () => {
  let fixture: PartnershipTrackerFixture
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('rejects a partnership outside a non-Admin entity scope before reading children', async () => {
    await expect(partnershipTrackerRepository.listNav(fixture.partnershipId, { isAdmin: false, entityIds: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('serializes duplicate NAV races and rejects stale deletes without exposing data', async () => {
    const scope = { isAdmin: true, entityIds: [] as string[] }
    const attempts = await Promise.allSettled([
      partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '100.00', valuationDate: '2024-06-30' }, fixture.adminUserId, scope),
      partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '101.00', valuationDate: '2024-06-30' }, fixture.adminUserId, scope),
    ])
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const nav = (await partnershipTrackerRepository.listNav(fixture.partnershipId, scope)).items[0]!
    await expect(partnershipTrackerRepository.deleteNav(fixture.partnershipId, nav.id, '2000-01-01T00:00:00.000Z', fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'STALE_NAV_REVISION' })
    expect((await partnershipTrackerRepository.listNav(fixture.partnershipId, scope)).items).toHaveLength(1)
  })
})
