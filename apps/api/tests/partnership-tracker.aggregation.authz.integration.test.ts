import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { pool } from '../src/infra/db/client.js'
import { createPartnershipAggregationFixture, type PartnershipAggregationFixture } from './helpers/partnershipAggregationFixture.js'

const durable = pool ? describe : describe.skip

durable('Partnership aggregation authorization', () => {
  let fixture: PartnershipAggregationFixture
  let app: FastifyInstance

  beforeEach(async () => {
    fixture = await createPartnershipAggregationFixture()
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    await fixture.cleanup()
  })

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/partnership-tracker/aggregation' })
    expect(response.statusCode).toBe(401)
  })

  it('applies member scope before rows, totals, facets, and NAV ranges', async () => {
    expect(fixture.userCookie).not.toBeNull()
    if (!fixture.userCookie) return

    const response = await app.inject({
      method: 'GET',
      url: `/v1/partnership-tracker/aggregation?ownerIds=${fixture.ownerIds.outside}`,
      headers: { cookie: fixture.userCookie },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.query.ownerIds).toEqual([])
    expect(body.items).toHaveLength(4)
    expect(body.items.map((group: { name: string }) => group.name)).not.toContain('External Fund')
    expect(body.rollup).toMatchObject({
      partnershipCount: 4,
      committedCapital: { amount: '350000.00' },
      latestNav: { amount: '270000.00' },
      navValuationRange: { earliest: '2024-12-31', latest: '2026-03-31' },
    })
    expect(body.facets.owners.map((owner: { label: string }) => owner.label)).toEqual(['Alder Family', 'Beacon Holdings'])
    expect(JSON.stringify(body)).not.toContain('Outside Owner')
    expect(JSON.stringify(body)).not.toContain('External Fund')
  })

  it('preserves the existing Admin all-owner scope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/partnership-tracker/aggregation',
      headers: { cookie: fixture.adminCookie },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.pageInfo.totalItems).toBe(5)
    expect(body.items.map((group: { name: string }) => group.name)).toContain('External Fund')
    expect(body.facets.owners).toContainEqual(expect.objectContaining({ value: fixture.ownerIds.outside, label: 'Outside Owner', count: 1 }))
  })
})
