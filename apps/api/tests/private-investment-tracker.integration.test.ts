import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import type { PrivateInvestmentQuery } from '../src/modules/partnership-tracker/partnership-tracker.contracts.js'
import { createPrivateInvestmentTrackerFixture } from './helpers/privateInvestmentTrackerFixture.js'

const durable = pool ? describe : describe.skip
const query = (overrides: Partial<PrivateInvestmentQuery> = {}): PrivateInvestmentQuery => ({
  assetClasses: [],
  entityIds: [],
  partnershipIds: [],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
  page: 1,
  pageSize: 50,
  ...overrides,
})

durable('Private Investment Tracker operational read model', () => {
  let fixture: Awaited<ReturnType<typeof createPrivateInvestmentTrackerFixture>>
  beforeEach(async () => { fixture = await createPrivateInvestmentTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })

  it('keeps same-name funds owner-specific and returns lifetime metrics for filtered membership', async () => {
    const second = await fixture.createPartnership({ entityId: fixture.targetEntityId, name: 'Shared Growth Fund' })
    await pool!.query('update partnerships set asset_class = $2 where id = $1', [second, 'Credit'])
    await pool!.query('update partnerships set name = $2 where id = $1', [fixture.partnershipId, 'Shared Growth Fund'])
    await fixture.createCommitment(fixture.partnershipId, { amount: '200.00' })
    await fixture.createNav(fixture.partnershipId, { amount: '150.00' })
    await fixture.createActivity(fixture.partnershipId, 'funded_contribution', '100.00', '2024-01-01')
    await fixture.createActivity(fixture.partnershipId, 'distribution', '20.00', '2025-01-01')
    await fixture.createActivity(fixture.partnershipId, 'recallable_distribution', '5.00', '2025-02-01')
    await fixture.createActivity(second, 'funded_contribution', '300.00', '2024-03-01', fixture.targetEntityId)

    const fixtureScope = { isAdmin: false, entityIds: [fixture.entityId, fixture.targetEntityId] }
    const all = await partnershipTrackerRepository.getPrivateInvestments(fixtureScope, query())
    expect(all.positions).toHaveLength(2)
    expect(all).not.toHaveProperty('allMatchingActivities')
    expect(new Set(all.positions.map((row) => row.positionKey)).size).toBe(2)
    const filtered = await partnershipTrackerRepository.getPrivateInvestments(fixtureScope, query({ assetClasses: ['Private Equity'] }))
    expect(filtered.positions).toHaveLength(1)
    expect(filtered.positions[0]).toMatchObject({
      totalInvested: '100.00',
      nonRecallableDistributions: '20.00',
      recallableDistributions: '5.00',
    })
  })

  it('does not expose activities, positions, or facets outside entity scope', async () => {
    const second = await fixture.createPartnership({ entityId: fixture.targetEntityId, name: 'Hidden Fund' })
    await fixture.createActivity(fixture.partnershipId, 'funded_contribution', '100.00', '2024-01-01')
    await fixture.createActivity(second, 'funded_contribution', '300.00', '2024-03-01', fixture.targetEntityId)
    const response = await partnershipTrackerRepository.getPrivateInvestments(
      { isAdmin: false, entityIds: [fixture.entityId] },
      query({ entityIds: [fixture.targetEntityId] }),
    )
    expect(response.query.entityIds).toEqual([])
    expect(response.facets.entities.map((option) => option.value)).toEqual([fixture.entityId])
    expect(response.activities.every((row) => row.entity.id === fixture.entityId)).toBe(true)
    expect(response.positions.every((row) => row.entity.id === fixture.entityId)).toBe(true)
  })

  it('serves ten thousand scoped activity rows without an N+1 read', async () => {
    await pool!.query(`insert into capital_activity_events
      (id, entity_id, partnership_id, activity_date, event_type, amount, source_type)
      select gen_random_uuid(), $1, $2, date '2020-01-01' + (value % 2000), 'funded_contribution', 100.00, 'manual'
      from generate_series(1, 10000) value`, [fixture.entityId, fixture.partnershipId])
    const started = performance.now()
    const response = await partnershipTrackerRepository.getPrivateInvestments(
      { isAdmin: false, entityIds: [fixture.entityId] },
      query(),
    )
    expect(response.pageInfo.totalItems).toBe(10000)
    expect(response.activities).toHaveLength(50)
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
