import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Entities directory design contract', () => {
  let f: TestFixture
  let createdEntityId: string | null = null

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    if (createdEntityId) {
      await f.app.inject({
        method: 'DELETE',
        url: `/v1/entities/${createdEntityId}`,
        headers: { cookie: f.cookie },
      })
    }
    await f.app.close()
  })

  it('persists and returns every field used by the Magic Patterns directory and detail UI', async () => {
    const name = `Directory Entity ${Date.now()}`
    const create = await f.app.inject({
      method: 'POST',
      url: '/v1/entities',
      headers: { cookie: f.cookie },
      payload: {
        name,
        kind: 'trust',
        jurisdiction: 'Nevada',
        taxId: '88-1140552',
        formedOn: '06/02/2008',
      },
    })

    expect(create.statusCode).toBe(201)
    const created = create.json() as { id: string }
    createdEntityId = created.id
    expect(create.json()).toMatchObject({
      name,
      entityType: 'TRUST',
      jurisdiction: 'Nevada',
      taxId: '88-1140552',
      formedOn: '06/02/2008',
      status: 'DRAFT',
    })

    const list = await f.app.inject({
      method: 'GET',
      url: '/v1/entities',
      headers: { cookie: f.cookie },
    })
    expect(list.statusCode).toBe(200)
    const item = (list.json() as { items: Array<Record<string, unknown>> }).items.find(
      (candidate) => candidate.id === created.id,
    )
    expect(item).toMatchObject({
      name,
      entityType: 'TRUST',
      jurisdiction: 'Nevada',
      taxId: '88-1140552',
      formedOn: '06/02/2008',
      status: 'DRAFT',
      ownerCount: 0,
      partnershipCount: 0,
      investmentCount: 0,
      holdingsValueUsd: 0,
    })

    const detail = await f.app.inject({
      method: 'GET',
      url: `/v1/entities/${created.id}`,
      headers: { cookie: f.cookie },
    })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().entity).toMatchObject({
      id: created.id,
      name,
      entityType: 'TRUST',
      jurisdiction: 'Nevada',
      taxId: '88-1140552',
      formedOn: '06/02/2008',
      status: 'DRAFT',
    })
  })

  it('rejects an impossible formation date with a field-specific validation issue', async () => {
    const response = await f.app.inject({
      method: 'POST',
      url: '/v1/entities',
      headers: { cookie: f.cookie },
      payload: {
        name: `Invalid Date Entity ${Date.now()}`,
        kind: 'llc',
        jurisdiction: 'Delaware',
        taxId: '',
        formedOn: '02/31/2026',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      issues: [{ path: ['formedOn'], message: 'Formation date is not valid' }],
    })
  })
})
