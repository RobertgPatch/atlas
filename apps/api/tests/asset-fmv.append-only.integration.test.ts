import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('asset FMV append-only behavior', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('keeps same-day corrections and treats the newest record as latest', async () => {
    const partnershipId = f.partnerships[0].id
    const createAsset = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: { name: 'Correction Asset', assetType: 'Venture Capital' },
    })
    const assetId = createAsset.json().asset.id as string
    const baseUrl = `/v1/partnerships/${partnershipId}/assets/${assetId}/fmv-snapshots`

    await f.app.inject({
      method: 'POST',
      url: baseUrl,
      headers: { cookie: f.cookie },
      payload: { valuationDate: '2025-03-15', amountUsd: 900000, source: 'manual' },
    })

    await f.app.inject({
      method: 'POST',
      url: baseUrl,
      headers: { cookie: f.cookie },
      payload: { valuationDate: '2025-03-15', amountUsd: 950000, source: 'manual' },
    })

    const historyRes = await f.app.inject({
      method: 'GET',
      url: baseUrl,
      headers: { cookie: f.cookie },
    })
    const detailRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/assets/${assetId}`,
      headers: { cookie: f.cookie },
    })

    expect(historyRes.statusCode).toBe(200)
    expect(historyRes.json()).toHaveLength(2)
    expect(historyRes.json()[0].amountUsd).toBe(950000)
    expect(historyRes.json()[1].amountUsd).toBe(900000)
    expect(detailRes.json().latestFmv.amountUsd).toBe(950000)
  })
})