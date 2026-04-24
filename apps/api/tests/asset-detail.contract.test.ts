import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('GET /v1/partnerships/:partnershipId/assets/:assetId', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns asset detail and history under the correct partnership', async () => {
    const partnershipId = f.partnerships[0].id
    const createRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: {
        name: 'Growth Equity SPV',
        assetType: 'Private Equity',
        initialValuation: {
          valuationDate: '2025-02-01',
          amountUsd: 750000,
          source: 'manual',
        },
      },
    })
    const assetId = createRes.json().asset.id as string

    const detailRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/assets/${assetId}`,
      headers: { cookie: f.cookie },
    })
    const historyRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/assets/${assetId}/fmv-snapshots`,
      headers: { cookie: f.cookie },
    })

    expect(detailRes.statusCode).toBe(200)
    expect(detailRes.json().asset.name).toBe('Growth Equity SPV')
    expect(detailRes.json().latestFmv.amountUsd).toBe(750000)

    expect(historyRes.statusCode).toBe(200)
    expect(historyRes.json()).toHaveLength(1)
  })

  it('returns 404 when the asset does not exist under the specified partnership', async () => {
    const partnershipId = f.partnerships[0].id
    const otherPartnershipId = f.partnerships[1].id
    const createRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: { name: 'Mismatch Asset', assetType: 'Credit' },
    })
    const assetId = createRes.json().asset.id as string

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${otherPartnershipId}/assets/${assetId}`,
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('PARTNERSHIP_ASSET_NOT_FOUND')
  })
})