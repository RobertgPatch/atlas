import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('manual K-1 year persistence under the Partnership Tracker prefix', () => {
  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('supports nonconsecutive arbitrary years, append-only revisions, and stale locking', async () => {
    await partnershipTrackerRepository.createYear(fixture.partnershipId, 2017, fixture.adminUserId, scope)
    const newer = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2024, fixture.adminUserId, scope)
    const updated = await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2024, newer.revision, [{ fieldKey: 'opening_outside_basis', amount: '500000.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope)
    expect(updated.year.status).toBe('IN_PROGRESS')
    expect(updated.year.revision).toBe(newer.revision + 1)
    await expect(partnershipTrackerRepository.updateYear(fixture.partnershipId, 2024, newer.revision, [{ fieldKey: 'opening_outside_basis', amount: '510000.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'STALE_TRACKER_REVISION' })
    expect((await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).years.map((year) => year.taxYear)).toEqual([2017, 2024])
  })
})
