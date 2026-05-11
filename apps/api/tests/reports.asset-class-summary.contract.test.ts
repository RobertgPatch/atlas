import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  createCommitmentViaApi,
  findSinglePartnershipEntity,
  getAssetClassSummaryViaApi,
  getPortfolioSummaryViaApi,
} from './helpers/reportsTestHelpers.js'

describe('GET /v1/reports/asset-class-summary contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('returns 401 when session cookie is missing', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/asset-class-summary',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns grouped rows and totals for authenticated callers', async () => {
    const { partnershipId } = findSinglePartnershipEntity(fixture)
    const createRes = await createCommitmentViaApi(fixture, partnershipId, 2_000_000)
    expect(createRes.statusCode).toBe(201)

    const response = await getAssetClassSummaryViaApi(
      fixture,
      'sort=assetClass&direction=asc',
    )

    expect(response.statusCode).toBe(200)

    const body = response.json()
    expect(Array.isArray(body.rows)).toBe(true)
    expect(body).toHaveProperty('totals')

    if (body.rows.length > 0) {
      expect(body.rows[0]).toHaveProperty('id')
      expect(body.rows[0]).toHaveProperty('assetClass')
      expect(body.rows[0]).toHaveProperty('partnershipCount')
      expect(body.rows[0]).toHaveProperty('tvpi')
    }
  })

  it('applies shared filters with totals parity to portfolio summary', async () => {
    const { entityId, partnershipId } = findSinglePartnershipEntity(fixture)
    const createRes = await createCommitmentViaApi(fixture, partnershipId, 1_250_000)
    expect(createRes.statusCode).toBe(201)

    const portfolioBaseline = await getPortfolioSummaryViaApi(fixture)
    expect(portfolioBaseline.statusCode).toBe(200)

    const entityRow = portfolioBaseline
      .json()
      .rows.find((row: { entityId: string }) => row.entityId === entityId)

    expect(entityRow).toBeTruthy()

    const sharedFilters = new URLSearchParams({
      search: String(entityRow.entityName).split(' ')[0] ?? '',
      dateRange: 'all',
      entityType: entityRow.entityType,
      entityId,
      partnershipId,
      direction: 'asc',
    })

    const assetQuery = new URLSearchParams(sharedFilters)
    assetQuery.set('sort', 'assetClass')

    const portfolioQuery = new URLSearchParams(sharedFilters)
    portfolioQuery.set('sort', 'entityName')

    const [assetResponse, portfolioResponse] = await Promise.all([
      getAssetClassSummaryViaApi(fixture, assetQuery.toString()),
      getPortfolioSummaryViaApi(fixture, portfolioQuery.toString()),
    ])

    expect(assetResponse.statusCode).toBe(200)
    expect(portfolioResponse.statusCode).toBe(200)

    const assetBody = assetResponse.json()
    const portfolioBody = portfolioResponse.json()

    expect(assetBody.totals.originalCommitmentUsd).toBe(portfolioBody.totals.originalCommitmentUsd)
    expect(assetBody.totals.paidInUsd).toBe(portfolioBody.totals.paidInUsd)
    expect(assetBody.totals.unfundedUsd).toBe(portfolioBody.totals.unfundedUsd)
    expect(assetBody.totals.distributionsUsd).toBe(portfolioBody.totals.distributionsUsd)
    expect(assetBody.totals.residualValueUsd).toBe(portfolioBody.totals.residualValueUsd)
  })
})
