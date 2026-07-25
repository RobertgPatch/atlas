import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composePrivateInvestmentTracker } from '../src/modules/partnership-tracker/private-investment-tracker.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const filters = {
  assetClasses: [] as const,
  entityIds: [] as string[],
  partnershipIds: [] as string[],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
}
const body = {
  filters,
  summaryColumns: ['entity', 'fund', 'totalInvested'],
  detailColumns: ['date', 'fund', 'amount'],
}

describe('Private Investment Tracker PDF HTTP contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    vi.spyOn(partnershipTrackerRepository, 'getPrivateInvestmentReport').mockResolvedValue(
      composePrivateInvestmentTracker([], [], {
        ...filters,
        assetClasses: [],
        page: 1,
        pageSize: 100,
      }, '2026-07-23'),
    )
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fixture.app.close()
  })

  it('requires authentication and streams valid PDF bytes with a dated filename', async () => {
    const unauthenticated = await fixture.app.inject({
      method: 'POST',
      url: '/v1/partnership-tracker/private-investments/pdf',
      payload: body,
    })
    expect(unauthenticated.statusCode).toBe(401)

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/partnership-tracker/private-investments/pdf',
      headers: { cookie: fixture.cookie },
      payload: body,
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/pdf/)
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="investment-tracker-2026-07-23.pdf"',
    )
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it.each([
    { ...body, summaryColumns: [] },
    { ...body, detailColumns: ['date', 'date'] },
    { ...body, summaryColumns: ['unknown'] },
    { ...body, filters: { ...filters, dateFrom: '2026-02-01', dateTo: '2026-01-01' } },
    { ...body, filters: { ...filters, amountMin: '2.00', amountMax: '1.00' } },
  ])('rejects malformed report selections and reversed ranges', async (payload) => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/partnership-tracker/private-investments/pdf',
      headers: { cookie: fixture.cookie },
      payload,
    })
    expect(response.statusCode).toBe(400)
  })

  it('passes the authenticated member scope and removes out-of-scope selections in the report composer', async () => {
    const outOfScope = '00000000-0000-4000-8000-999999999999'
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/partnership-tracker/private-investments/pdf',
      headers: { cookie: fixture.userCookie },
      payload: {
        ...body,
        filters: { ...filters, entityIds: [outOfScope], partnershipIds: [outOfScope] },
      },
    })
    expect(response.statusCode).toBe(200)
    const reportSpy = vi.mocked(partnershipTrackerRepository.getPrivateInvestmentReport)
    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: false, entityIds: expect.any(Array) }),
      expect.objectContaining({ entityIds: [outOfScope], partnershipIds: [outOfScope] }),
    )
  })
})
