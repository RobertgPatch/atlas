import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'

describe('Consolidated holdings rollup integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('rolls duplicate GOOGL positions into one parent row with child details', async () => {
    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0]).toMatchObject({
      symbol: 'GOOGL',
      quantity: 70,
      costBasis: 8000,
      averageCostBasis: expect.closeTo(114.2857, 4),
      unrealizedGainLoss: 4250,
      marketValue: 12250,
    })
    expect(body.rows[0].details).toHaveLength(2)
    expect(body.rows[0].details.map((row: { quantity: number }) => row.quantity)).toEqual([
      20,
      50,
    ])
  })
})
