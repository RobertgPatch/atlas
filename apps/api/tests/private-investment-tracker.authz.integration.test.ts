import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import type { PrivateInvestmentQuery } from '../src/modules/partnership-tracker/partnership-tracker.contracts.js'
import { createPrivateInvestmentTrackerFixture } from './helpers/privateInvestmentTrackerFixture.js'

const durable = pool ? describe : describe.skip
const query: PrivateInvestmentQuery = {
  assetClasses: [],
  entityIds: [],
  partnershipIds: [],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
  page: 1,
  pageSize: 50,
}

durable('Private Investment Tracker authorization', () => {
  let fixture: Awaited<ReturnType<typeof createPrivateInvestmentTrackerFixture>>
  beforeEach(async () => { fixture = await createPrivateInvestmentTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })

  it('keeps member positions, activities, and facets inside permitted entities', async () => {
    const hiddenPartnershipId = await fixture.createPartnership({
      entityId: fixture.targetEntityId,
      name: 'Outside Scope Fund',
    })
    await fixture.createActivity(fixture.partnershipId, 'funded_contribution', '100.00', '2024-01-01')
    await fixture.createActivity(hiddenPartnershipId, 'distribution', '300.00', '2024-03-01', fixture.targetEntityId)

    const member = await partnershipTrackerRepository.getPrivateInvestments(
      { isAdmin: false, entityIds: [fixture.entityId] },
      { ...query, entityIds: [fixture.targetEntityId], partnershipIds: [hiddenPartnershipId] },
    )
    expect(member.query.entityIds).toEqual([])
    expect(member.query.partnershipIds).toEqual([])
    expect(member.positions.every((row) => row.entity.id === fixture.entityId)).toBe(true)
    expect(member.activities.every((row) => row.entity.id === fixture.entityId)).toBe(true)
    expect(member.facets.entities.map((option) => option.value)).toEqual([fixture.entityId])

    const admin = await partnershipTrackerRepository.getPrivateInvestments(
      { isAdmin: true, entityIds: [] },
      { ...query, entityIds: [fixture.entityId, fixture.targetEntityId] },
    )
    expect(new Set(admin.activities.map((row) => row.entity.id))).toEqual(
      new Set([fixture.entityId, fixture.targetEntityId]),
    )
  })
})
