import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership asset class propagation', () => {
  let f: TestFixture
  let entityId: string | null = null
  let partnershipId: string | null = null

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
    if (pool) {
      if (partnershipId) await pool.query('delete from partnerships where id = $1', [partnershipId])
      if (entityId) await pool.query('delete from entities where id = $1', [entityId])
    }
  })

  it('persists asset class updates into reports and entity detail responses', async () => {
    const entityRes = await f.app.inject({
      method: 'POST',
      url: '/v1/entities',
      headers: { cookie: f.cookie },
      payload: { name: `Asset Class Entity ${Date.now()}` },
    })
    expect(entityRes.statusCode).toBe(201)
    entityId = (entityRes.json() as { id: string }).id

    const createRes = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
      payload: {
        entityId,
        name: `Manual Asset Class LP ${Date.now()}`,
        assetClass: 'Infrastructure',
        status: 'ACTIVE',
      },
    })

    expect(createRes.statusCode).toBe(201)
    const created = createRes.json() as { id: string }
    partnershipId = created.id

    const patchRes = await f.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${created.id}`,
      headers: { cookie: f.cookie },
      payload: {
        assetClass: 'Credit',
      },
    })

    expect(patchRes.statusCode).toBe(200)
    expect((patchRes.json() as { assetClass: string | null }).assetClass).toBe('Credit')

    const reportRes = await f.app.inject({
      method: 'GET',
      url: '/v1/reports/asset-class-summary',
      headers: { cookie: f.cookie },
    })

    expect(reportRes.statusCode).toBe(200)
    const reportBody = reportRes.json() as {
      rows: Array<{ assetClass: string; partnershipCount: number }>
    }

    expect(
      reportBody.rows.some(
        (row) => row.assetClass === 'Credit' && row.partnershipCount >= 1,
      ),
    ).toBe(true)

    const entityDetailRes = await f.app.inject({
      method: 'GET',
      url: `/v1/entities/${entityId}`,
      headers: { cookie: f.cookie },
    })

    expect(entityDetailRes.statusCode).toBe(200)
    const entityBody = entityDetailRes.json() as {
      partnerships: Array<{ id: string; assetClass: string | null }>
    }

    const createdPartnership = entityBody.partnerships.find((row) => row.id === created.id)
    expect(createdPartnership).toBeDefined()
    expect(createdPartnership?.assetClass).toBe('Credit')
  })
})
