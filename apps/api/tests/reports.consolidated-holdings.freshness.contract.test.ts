import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedDatedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'
import { plaidHoldingsSync } from '../src/modules/plaid/plaid.holdings-sync.js'

describe('GET /v1/reports/consolidated-holdings freshness contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fixture.app.close()
  })

  it('returns saved snapshot metadata with consolidated holdings', async () => {
    const { snapshot } = seedDatedConsolidatedHoldingsFixture({
      dataAsOfDate: '2026-05-11',
      fetchedAt: '2026-05-11T12:00:00.000Z',
    })

    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    expect(response.json().sync).toMatchObject({
      status: 'success',
      freshnessStatus: expect.stringMatching(/fresh|stale/),
      dataAsOfDate: '2026-05-11',
      dataFetchedAt: '2026-05-11T12:00:00.000Z',
      lastSuccessfulSyncAt: snapshot.completedAt,
      nextRefreshAt: expect.any(String),
      refreshing: false,
      activeRefreshId: null,
      warnings: [],
      refreshPolicy: {
        cadence: 'daily',
        refreshTimeLocal: '05:00',
        timezone: 'America/Los_Angeles',
        automaticRefreshEnabled: true,
      },
    })
  })

  it('does not call Plaid refresh work during repeated ordinary reads', async () => {
    seedDatedConsolidatedHoldingsFixture()
    const syncSpy = vi.spyOn(plaidHoldingsSync, 'syncSelectedHoldings')

    const first = await getConsolidatedHoldingsViaApi(fixture)
    const second = await getConsolidatedHoldingsViaApi(fixture)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(syncSpy).not.toHaveBeenCalled()
  })
})
