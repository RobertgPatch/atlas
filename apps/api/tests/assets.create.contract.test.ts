import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

describe('POST /v1/partnerships/:partnershipId/assets', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without a session', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${f.partnerships[0].id}/assets`,
      payload: { name: 'Fund A', assetType: 'Real Estate' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for a non-admin caller', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${f.partnerships[0].id}/assets`,
      headers: { cookie: f.userCookie },
      payload: { name: 'Fund A', assetType: 'Real Estate' },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it('creates an asset and rejects duplicate name plus type', async () => {
    const url = `/v1/partnerships/${f.partnerships[0].id}/assets`

    const created = await f.app.inject({
      method: 'POST',
      url,
      headers: { cookie: f.cookie },
      payload: {
        name: 'North Campus',
        assetType: 'Real Estate',
        initialValuation: {
          valuationDate: '2025-02-01',
          amountUsd: 500000,
          source: 'manual',
        },
      },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().asset.name).toBe('North Campus')
    expect(created.json().latestFmv.amountUsd).toBe(500000)

    const auditEvents = auditRepository.getInMemoryEvents()
    expect(auditEvents.some((event) => event.eventName === 'partnership.asset.created')).toBe(true)
    expect(auditEvents.some((event) => event.eventName === 'partnership.asset.fmv_recorded')).toBe(true)

    const fmvEvent = auditEvents.find((event) => event.eventName === 'partnership.asset.fmv_recorded')
    expect(fmvEvent?.after).toMatchObject({
      partnershipId: f.partnerships[0].id,
      assetId: created.json().asset.id,
    })

    const duplicate = await f.app.inject({
      method: 'POST',
      url,
      headers: { cookie: f.cookie },
      payload: { name: ' North Campus ', assetType: 'Real Estate' },
    })

    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error).toBe('DUPLICATE_PARTNERSHIP_ASSET')
  })
})