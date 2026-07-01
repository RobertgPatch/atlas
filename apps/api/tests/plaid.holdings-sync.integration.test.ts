import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'

describe('POST /v1/reports/consolidated-holdings/refresh integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('creates a sync snapshot for selected accounts', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      status: 'success',
      startedAt: expect.any(String),
      completedAt: expect.any(String),
    })
  })

  it('does not let an empty refresh snapshot hide the last dashboard holdings', async () => {
    const refreshResponse = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.cookie },
    })
    const holdingsResponse = await getConsolidatedHoldingsViaApi(fixture)

    expect(refreshResponse.statusCode).toBe(202)
    expect(holdingsResponse.statusCode).toBe(200)
    expect(holdingsResponse.json().rows).toHaveLength(1)
    expect(holdingsResponse.json().rows[0]).toMatchObject({
      symbol: 'GOOGL',
      marketValue: 12_250,
    })
  })
})
