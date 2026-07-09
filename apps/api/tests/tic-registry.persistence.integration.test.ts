import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { config } from '../src/config.js'
import { pool } from '../src/infra/db/client.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe.skipIf(!config.databaseUrl)('TIC Registry persistence', () => {
  let f: TestFixture
  let entityId: string

  beforeEach(async () => {
    f = await createTestFixture()
    entityId = randomUUID()
    await pool!.query(
      `insert into entities (id, name, entity_type, status) values ($1, $2, $3, $4)`,
      [entityId, 'Registry Persistence Entity', 'LLC', 'ACTIVE'],
    )
  })

  afterEach(async () => {
    await pool!.query(`delete from entities where id = $1`, [entityId])
    await f.app.close()
  })

  it('persists property, TIC interest, and owner records through normal CRUD', async () => {
    const propertyRes = await f.app.inject({
      method: 'POST',
      url: '/v1/tic-registry/properties',
      headers: { cookie: f.cookie },
      payload: {
        entityId,
        name: 'Harbor View TIC',
        propertyType: 'multifamily',
        status: 'held',
        estimatedValueUsd: 1_250_000,
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
        name: 'Atlas Family Trust',
        ownerType: 'trust',
        ticPercentage: 50,
      },
    })
    expect(ownerRes.statusCode).toBe(201)

    const listRes = await f.app.inject({
      method: 'GET',
      url: `/v1/tic-registry/properties?entityId=${entityId}`,
      headers: { cookie: f.cookie },
    })
    expect(listRes.statusCode).toBe(200)
    const listPayload = listRes.json()
    expect(listPayload.properties).toHaveLength(1)
    expect(listPayload.properties[0].name).toBe('Harbor View TIC')
    expect(listPayload.properties[0].interests[0].owners[0]).toMatchObject({
      name: 'Atlas Family Trust',
      effectivePropertyPercentage: 20,
    })
    expect(listPayload.summary).toMatchObject({
      propertyCount: 1,
      ticInterestCount: 1,
      ownerCount: 1,
      estimatedHeldValueUsd: 1_250_000,
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
      url: `/v1/tic-registry/properties?entityId=${entityId}`,
      headers: { cookie: f.cookie },
    })
    expect(emptyRes.statusCode).toBe(200)
    expect(emptyRes.json().properties).toEqual([])
  })
})
