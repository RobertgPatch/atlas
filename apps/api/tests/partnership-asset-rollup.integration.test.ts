import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('partnership asset rollup', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('sums the latest valued snapshot per asset and ignores unvalued assets', async () => {
    const partnershipId = f.partnerships[0].id

    const first = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: {
        name: 'Asset One',
        assetType: 'Real Estate',
        initialValuation: {
          valuationDate: '2025-02-01',
          amountUsd: 300000,
          source: 'manual',
        },
      },
    })
    const firstAssetId = first.json().asset.id as string

    await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: { name: 'Asset Two', assetType: 'Credit' },
    })

    await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets/${firstAssetId}/fmv-snapshots`,
      headers: { cookie: f.cookie },
      payload: { valuationDate: '2025-03-01', amountUsd: 450000, source: 'manual' },
    })

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().summary).toMatchObject({
      assetCount: 2,
      valuedAssetCount: 1,
      totalLatestAssetFmvUsd: 450000,
    })
  })
})