import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'

describe('Consolidated holdings filters integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('filters by symbol search and sorts by quantity', async () => {
    const response = await getConsolidatedHoldingsViaApi(
      fixture,
      'search=googl&sort=quantity&direction=desc',
    )

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].symbol).toBe('GOOGL')
    expect(body.rows[0].quantity).toBe(70)
  })

  it('filters by custodian while preserving matching parent details', async () => {
    const response = await getConsolidatedHoldingsViaApi(
      fixture,
      'custodian=Brokerage%20A',
    )

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].quantity).toBe(20)
    expect(body.rows[0].details).toHaveLength(1)
  })
})
