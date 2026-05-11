import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'

describe('GET /v1/reports/consolidated-holdings contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('returns 401 without a session', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/consolidated-holdings',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns kpis, rows, selected accounts, sync state, and page metadata', async () => {
    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveProperty('kpis')
    expect(body).toHaveProperty('rows')
    expect(body).toHaveProperty('selectedAccounts')
    expect(body).toHaveProperty('sync')
    expect(body).toHaveProperty('page')
    expect(body.rows[0]).toHaveProperty('details')
  })
})
