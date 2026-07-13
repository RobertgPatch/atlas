import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Partnership Tracker reconciliation isolation', () => {
  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('does not revise or invalidate a tax year when commitment and NAV history changes', async () => {
    const year = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2021, fixture.adminUserId, scope)
    await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '1000000.00', effectiveDate: '2021-01-01' }, fixture.adminUserId, scope)
    await partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '800000.00', valuationDate: '2021-12-31' }, fixture.adminUserId, scope)
    const after = await partnershipTrackerRepository.getYear(fixture.partnershipId, 2021, scope)
    expect(after.revision).toBe(year.revision)
    expect(after.signoff.history).toEqual(year.signoff.history)
  })
})
