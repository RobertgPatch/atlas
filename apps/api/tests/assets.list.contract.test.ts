import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('GET /v1/partnerships/:partnershipId/assets', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without a session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${f.partnerships[0].id}/assets`,
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns a summary with created assets and mixed FMV coverage', async () => {
    const partnershipId = f.partnerships[0].id

    await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: {
        name: 'Warehouse Fund',
        assetType: 'Real Estate',
        initialValuation: {
          valuationDate: '2025-01-10',
          amountUsd: 1200000,
          source: 'manual',
        },
      },
    })

    await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
      payload: {
        name: 'Bridge Loan',
        assetType: 'Credit',
      },
    })

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/assets`,
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.summary).toMatchObject({
      assetCount: 2,
      valuedAssetCount: 1,
      totalLatestAssetFmvUsd: 1200000,
    })
    expect(body.rows).toHaveLength(2)
    expect(body.rows.some((row: { latestFmv: unknown }) => row.latestFmv === null)).toBe(true)
  })
})