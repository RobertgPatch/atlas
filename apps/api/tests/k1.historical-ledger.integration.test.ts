import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { createK1TrackerFixture, type K1TrackerFixture } from './helpers/k1TrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Historical foreign-tax ledger', () => {
  let fixture: K1TrackerFixture
  const scope = { isAdmin: true, entityIds: [] }
  beforeEach(async () => { fixture = await createK1TrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('uses stored 16P/Q and invalidates subsequent basis years when they change', async () => {
    const first = await k1TrackerRepository.createYear(fixture.partnershipId, 2019, [
      { fieldKey: 'opening_outside_basis', amount: '1000.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    const second = await k1TrackerRepository.createYear(fixture.partnershipId, 2020, [], fixture.adminUserId, scope)
    const result = await k1TrackerRepository.updateYear(fixture.partnershipId, 2019, first.revision, [], fixture.adminUserId, scope, {
      ...first.officialFormData, box_16_entries: [
        { code: 'F', value: '18764.00' }, { code: 'P', value: '127.00' }, { code: 'Q', value: '179.00' },
      ],
    })
    expect(result.invalidatedTaxYears).toEqual([2020])
    const current = await k1TrackerRepository.getYear(fixture.partnershipId, 2019, scope)
    const following = await k1TrackerRepository.getYear(fixture.partnershipId, 2020, scope)
    expect(current.calculation.sectionL.calculatedNetIncome).toBe('-306.00')
    expect(current.calculation.basis.endingOutsideBasis).toBe('694.00')
    expect(following.calculation.basis.beginningOutsideBasis).toBe('694.00')
    expect(following.revision).toBeGreaterThan(second.revision)
  })
})
