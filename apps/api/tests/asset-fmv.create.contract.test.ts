import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

describe('POST /v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  async function createAsset() {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${f.partnerships[0].id}/assets`,
      headers: { cookie: f.cookie },
      payload: { name: 'Valuation Asset', assetType: 'Real Estate' },
    })
    return res.json().asset.id as string
  }

  it('returns 403 for non-admin callers', async () => {
    const assetId = await createAsset()
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${f.partnerships[0].id}/assets/${assetId}/fmv-snapshots`,
      headers: { cookie: f.userCookie },
      payload: { valuationDate: '2025-01-01', amountUsd: 10, source: 'manual' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('validates negative and future-dated snapshots and creates valid snapshots', async () => {
    const assetId = await createAsset()
    const baseUrl = `/v1/partnerships/${f.partnerships[0].id}/assets/${assetId}/fmv-snapshots`

    const negative = await f.app.inject({
      method: 'POST',
      url: baseUrl,
      headers: { cookie: f.cookie },
      payload: { valuationDate: '2025-01-01', amountUsd: -10, source: 'manual' },
    })
    expect(negative.statusCode).toBe(400)

    const futureDate = new Date(Date.now() + 172800000).toISOString().slice(0, 10)
    const future = await f.app.inject({
      method: 'POST',
      url: baseUrl,
      headers: { cookie: f.cookie },
      payload: { valuationDate: futureDate, amountUsd: 10, source: 'manual' },
    })
    expect(future.statusCode).toBe(400)
    expect(future.json().error).toBe('FUTURE_DATE_NOT_ALLOWED')

    const created = await f.app.inject({
      method: 'POST',
      url: baseUrl,
      headers: { cookie: f.cookie },
      payload: { valuationDate: '2025-01-01', amountUsd: 250000, source: 'manual' },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().amountUsd).toBe(250000)

    const auditEvent = auditRepository
      .getInMemoryEvents()
      .find((event) => event.eventName === 'partnership.asset.fmv_recorded' && event.objectId === assetId)

    expect(auditEvent?.after).toMatchObject({
      partnershipId: f.partnerships[0].id,
      assetId,
    })
  })
})