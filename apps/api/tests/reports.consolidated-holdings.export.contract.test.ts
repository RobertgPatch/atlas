import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { seedConsolidatedHoldingsFixture } from './helpers/consolidatedHoldingsTestHelpers.js'

describe('Consolidated holdings export contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('exports parent and detail rows as CSV', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/consolidated-holdings/export?format=csv',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.body).toContain('Aggregate,GOOGL')
    expect(response.body).toContain('Detail,GOOGL')
  })
})
