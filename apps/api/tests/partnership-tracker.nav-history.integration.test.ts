import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('manual NAV history', () => {
  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('keeps multiple observations in a year, sorts chronologically, and rejects an exact-date duplicate', async () => {
    await partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '900.00', valuationDate: '2024-09-30' }, fixture.adminUserId, scope)
    await partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '800.00', valuationDate: '2024-03-31' }, fixture.adminUserId, scope)
    const history = await partnershipTrackerRepository.listNav(fixture.partnershipId, scope)
    expect(history.items.map((item) => item.valuationDate)).toEqual(['2024-03-31', '2024-09-30'])
    expect(history.latest?.amount).toBe('900.00')
    await expect(partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '901.00', valuationDate: '2024-09-30' }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'DUPLICATE_NAV_DATE' })
  })
})
