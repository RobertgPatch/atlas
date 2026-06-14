import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { seedConsolidatedHoldingsFixture } from './helpers/consolidatedHoldingsTestHelpers.js'

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
})
