import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership Tracker HTTP contract', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })

  it('rejects malformed filters and controlled partnership types', async () => {
    const badCursor = await fixture.app.inject({ method: 'GET', url: '/v1/partnership-tracker/partnerships?cursor=opaque!', headers: { cookie: fixture.cookie } })
    expect(badCursor.statusCode).toBe(400)
    const badType = await fixture.app.inject({ method: 'POST', url: '/v1/partnership-tracker/partnerships', headers: { cookie: fixture.cookie }, payload: { entityId: fixture.entityIds[0], name: 'Bad type', partnershipType: 'Crypto' } })
    expect(badType.statusCode).toBe(400)
  })
})

const durable = pool ? describe : describe.skip
durable('Partnership Tracker list/detail contract with PostgreSQL', () => {
  let fixture: PartnershipTrackerFixture
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('returns deterministic summaries, exact money strings, and pagination metadata', async () => {
    await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '1000000.00', effectiveDate: '2024-01-01' }, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '900000.00', valuationDate: '2024-12-31' }, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const result = await partnershipTrackerRepository.listPartnerships({ isAdmin: true, entityIds: [] }, { entityId: fixture.entityId, limit: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.items[0]!.currentCommittedCapital?.amount).toBe('1000000.00')
    expect(result.items[0]!.latestNav?.amount).toBe('900000.00')
  })
})
