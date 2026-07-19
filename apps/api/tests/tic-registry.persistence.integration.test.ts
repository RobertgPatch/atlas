import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { config } from '../src/config.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe.skipIf(!config.databaseUrl)('TIC Registry persistence', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('persists property, TIC interest, and owner records through normal CRUD', async () => {
    const propertyRes = await f.app.inject({
      method: 'POST',
      url: '/v1/tic-registry/properties',
      headers: { cookie: f.cookie },
      payload: {
        name: 'Harbor View TIC',
        city: 'Oakland',
        state: 'CA',
        propertyCode: 'HV-101',
        numberOfUnits: 24,
        propertyType: 'multifamily',
        status: 'held',
        acquisitionPriceUsd: 1_250_000,
      },
    })
    expect(propertyRes.statusCode).toBe(201)
    const property = propertyRes.json()

    const interestRes = await f.app.inject({
      method: 'POST',
      url: `/v1/tic-registry/properties/${property.id}/interests`,
      headers: { cookie: f.cookie },
      payload: {
        name: 'Harbor View TIC A',
        propertyPercentage: 40,
        status: 'active',
        acquisitionOrigin: 'cash',
        acquisitionValueUsd: 500_000,
      },
    })
    expect(interestRes.statusCode).toBe(201)
    const interest = interestRes.json()

    const ownerRes = await f.app.inject({
      method: 'POST',
      url: `/v1/tic-registry/interests/${interest.id}/owners`,
      headers: { cookie: f.cookie },
      payload: {
        name: 'Jackson Family Trust',
        ownerType: 'trust',
        ticPercentage: 50,
      },
    })
    expect(ownerRes.statusCode).toBe(201)

    const listRes = await f.app.inject({
      method: 'GET',
      url: '/v1/tic-registry/properties',
      headers: { cookie: f.cookie },
    })
    expect(listRes.statusCode).toBe(200)
    const listPayload = listRes.json()
    expect(listPayload.properties).toHaveLength(1)
    expect(listPayload.properties[0]).toMatchObject({
      name: 'Harbor View TIC',
      city: 'Oakland',
      state: 'CA',
      propertyCode: 'HV-101',
      numberOfUnits: 24,
      acquisitionPriceUsd: 1_250_000,
    })
    expect(listPayload.properties[0].interests[0].owners[0]).toMatchObject({
      name: 'Jackson Family Trust',
      effectivePropertyPercentage: 20,
    })
    expect(listPayload.summary).toMatchObject({
      propertyCount: 1,
      totalUnits: 24,
      ticInterestCount: 1,
      ownerCount: 1,
      heldAcquisitionPriceUsd: 1_250_000,
      underAllocatedPropertyCount: 1,
      overAllocatedPropertyCount: 0,
      underAllocatedInterestCount: 1,
      overAllocatedInterestCount: 0,
    })

    const deleteRes = await f.app.inject({
      method: 'DELETE',
      url: `/v1/tic-registry/properties/${property.id}?expectedUpdatedAt=${encodeURIComponent(
        property.updatedAt,
      )}`,
      headers: { cookie: f.cookie },
    })
    expect(deleteRes.statusCode).toBe(204)

    const emptyRes = await f.app.inject({
      method: 'GET',
      url: '/v1/tic-registry/properties',
      headers: { cookie: f.cookie },
    })
    expect(emptyRes.statusCode).toBe(200)
    expect(emptyRes.json().properties).toEqual([])
  })
})
