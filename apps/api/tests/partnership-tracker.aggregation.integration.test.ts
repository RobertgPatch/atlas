import { performance } from 'node:perf_hooks'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { DEFAULT_PARTNERSHIP_AGGREGATION_QUERY } from '../src/modules/partnership-tracker/partnership-aggregation.js'
import { createPartnershipAggregationFixture, type PartnershipAggregationFixture } from './helpers/partnershipAggregationFixture.js'

const durable = pool ? describe : describe.skip

durable('Partnership aggregation PostgreSQL integration', () => {
  let fixture: PartnershipAggregationFixture
  let app: FastifyInstance

  beforeEach(async () => {
    fixture = await createPartnershipAggregationFixture()
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await app.close()
    await fixture.cleanup()
  })

  it('returns canonical tracker rows and computes the complete filtered rollup before pagination', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/partnership-tracker/aggregation?ownerIds=${fixture.ownerIds.alder},${fixture.ownerIds.beacon}&pageSize=25`,
      headers: { cookie: fixture.adminCookie },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.items.map((group: { name: string }) => group.name)).toEqual([
      'Alpha Growth I',
      'Beacon Credit',
      'Cedar Legacy',
      'Delta Warning',
    ])
    expect(body.pageInfo).toMatchObject({ page: 1, pageSize: 25, totalItems: 4, totalPages: 1 })
    expect(body.rollup).toMatchObject({
      partnershipCount: 4,
      committedCapital: { amount: '350000.00', knownCount: 3, totalCount: 4 },
      paidInCapital: { amount: '235000.00', knownCount: 4, totalCount: 4 },
      distributions: { amount: '50000.00', knownCount: 4, totalCount: 4 },
      latestNav: { amount: '270000.00', knownCount: 3, totalCount: 4 },
      unfundedCommitment: { amount: '115000.00', knownCount: 3, totalCount: 4 },
      dpi: { value: '0.21276596', status: 'AVAILABLE' },
      tvpi: { value: '1.36170213', status: 'PARTIAL_COVERAGE' },
      navValuationRange: { earliest: '2024-12-31', latest: '2026-03-31' },
    })
    expect(body.rollup).not.toHaveProperty('irr')
  })

  it('uses one set-based candidate projection in the repository', async () => {
    const query = vi.spyOn(pool!, 'query')
    await partnershipTrackerRepository.getAggregation(
      { isAdmin: true, entityIds: [] },
      DEFAULT_PARTNERSHIP_AGGREGATION_QUERY,
    )
    const candidateQueries = query.mock.calls.filter(([statement]) => {
      const sql = typeof statement === 'string' ? statement : statement && typeof statement === 'object' && 'text' in statement ? String(statement.text) : ''
      return sql.includes('from partnerships p')
    })
    expect(candidateQueries).toHaveLength(1)
  })

  it('keeps base facets stable, removes unavailable owners, and clamps final pages', async () => {
    const first = await app.inject({
      method: 'GET',
      url: `/v1/partnership-tracker/aggregation?ownerIds=${fixture.ownerIds.alder},00000000-0000-4000-8000-000000000000&statuses=ACTIVE,CLOSED&sort=nav&direction=desc&page=99&pageSize=25`,
      headers: { cookie: fixture.adminCookie },
    })
    expect(first.statusCode).toBe(200)
    const body = first.json()
    expect(body.query.ownerIds).toEqual([fixture.ownerIds.alder])
    expect(body.query.page).toBe(1)
    expect(body.items.map((group: { name: string }) => group.name)).toEqual(['Alpha Growth I', 'Cedar Legacy'])
    expect(body.rollup.partnershipCount).toBe(2)
    expect(body.facets.owners).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: fixture.ownerIds.alder, count: 2 }),
      expect.objectContaining({ value: fixture.ownerIds.beacon, count: 2 }),
      expect.objectContaining({ value: fixture.ownerIds.outside, count: 1 }),
    ]))
  })

  it('returns a 500-partnership aggregation within two seconds', async () => {
    await fixture.createBulkPartnerships(495)
    const started = performance.now()
    const response = await app.inject({
      method: 'GET',
      url: '/v1/partnership-tracker/aggregation?pageSize=100',
      headers: { cookie: fixture.adminCookie },
    })
    const elapsed = performance.now() - started
    expect(response.statusCode).toBe(200)
    expect(response.json().pageInfo.totalItems).toBeGreaterThanOrEqual(500)
    expect(elapsed).toBeLessThan(2_000)
  }, 30_000)

  it('paginates a 130-row expansion without duplicates while keeping rollup and base facets stable', async () => {
    await fixture.createBulkPartnerships(130)
    const baseQuery = `ownerIds=${fixture.ownerIds.alder},${fixture.ownerIds.beacon}&partnershipTypes=Private%20Equity,Credit&statuses=ACTIVE&sort=partnership&pageSize=25`
    const first = await app.inject({ method: 'GET', url: `/v1/partnership-tracker/aggregation?${baseQuery}`, headers: { cookie: fixture.adminCookie } })
    expect(first.statusCode).toBe(200)
    const firstBody = first.json()
    const ids = firstBody.items.map((group: { groupKey: string }) => group.groupKey)
    for (let page = 2; page <= firstBody.pageInfo.totalPages; page += 1) {
      const response = await app.inject({ method: 'GET', url: `/v1/partnership-tracker/aggregation?${baseQuery}&page=${page}`, headers: { cookie: fixture.adminCookie } })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.rollup).toEqual(firstBody.rollup)
      expect(body.facets).toEqual(firstBody.facets)
      ids.push(...body.items.map((group: { groupKey: string }) => group.groupKey))
    }
    expect(ids).toHaveLength(firstBody.pageInfo.totalItems)
    expect(new Set(ids).size).toBe(ids.length)

    const noMatch = await app.inject({ method: 'GET', url: '/v1/partnership-tracker/aggregation?search=definitely-no-such-partnership&page=99', headers: { cookie: fixture.adminCookie } })
    expect(noMatch.json().pageInfo).toMatchObject({ page: 1, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false })
  }, 30_000)
})
