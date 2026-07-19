import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
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
  it('projects legacy contributions once, favors canonical values, and surfaces conflicting provenance', async () => {
    const legacyOnly = await k1TrackerRepository.createYear(fixture.partnershipId, 2021, [
      { fieldKey: 'section_l_capital_contributed', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    const equal = await k1TrackerRepository.createYear(fixture.partnershipId, 2022, [
      { fieldKey: 'capital_contributions', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'section_l_capital_contributed', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    const conflicting = await k1TrackerRepository.createYear(fixture.partnershipId, 2023, [
      { fieldKey: 'capital_contributions', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'section_l_capital_contributed', amount: '125.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)

    expect(legacyOnly.values.filter((value) => value.fieldKey === 'capital_contributions')).toHaveLength(1)
    expect(legacyOnly.values.find((value) => value.fieldKey === 'capital_contributions')?.amount).toBe('100.00')
    expect(legacyOnly.calculation.basis.contributions).toBe('100.00')
    expect(equal.values.filter((value) => value.fieldKey === 'capital_contributions')).toHaveLength(1)
    expect(equal.sourceConflicts).toEqual([])
    expect(conflicting.calculation.basis.contributions).toBe('100.00')
    expect(conflicting.sourceConflicts).toContainEqual(expect.objectContaining({ fieldKey: 'capital_contributions' }))
  })
})
