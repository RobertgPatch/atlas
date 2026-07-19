import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
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
  it('keeps liability-only edits out of revision invalidation while canonical changes invalidate later years and legacy conflicts block review', async () => {
    const first = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2021, fixture.adminUserId, scope)
    const second = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2022, fixture.adminUserId, scope)
    await pool!.query(`update k1_tracker_years set workflow_status = 'RECONCILED' where partnership_id = $1`, [fixture.partnershipId])

    const liabilityOnly = await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2021, first.revision, [
      { fieldKey: 'liability_nonrecourse_ending', amount: '999.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    expect(liabilityOnly.invalidatedTaxYears).toEqual([])
    expect(liabilityOnly.year.revision).toBe(first.revision)
    expect(liabilityOnly.year.status).toBe('RECONCILED')
    expect((await partnershipTrackerRepository.getYear(fixture.partnershipId, 2022, scope)).revision).toBe(second.revision)

    const canonical = await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2021, liabilityOnly.year.revision, [
      { fieldKey: 'capital_contributions', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    expect(canonical.invalidatedTaxYears).toEqual([2022])
    expect((await partnershipTrackerRepository.getYear(fixture.partnershipId, 2022, scope)).status).toBe('NEEDS_REVIEW')

    const conflicting = await k1TrackerRepository.createYear(fixture.partnershipId, 2023, [
      { fieldKey: 'capital_contributions', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'section_l_capital_contributed', amount: '125.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    expect(conflicting.calculation.checks).toContainEqual(expect.objectContaining({ key: 'unresolved-source-conflicts', status: 'FAIL' }))
  })
})
