import { afterEach, describe, expect, it, vi } from 'vitest'
import { partnershipTrackerClient, serializePartnershipAggregationParams, serializePrivateInvestmentParams } from '../api/partnershipTrackerClient'
import { aggregationResponseFixture, privateInvestmentResponseFixture } from './fixtures'

describe('partnership aggregation client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serializes comma-separated canonical values and omits defaults or invalid enums', () => {
    expect(serializePartnershipAggregationParams({
      search: '  beacon  ',
      ownerIds: ['b', 'a', 'a'],
      partnershipTypes: ['Credit', 'Private Equity', 'Unknown' as 'Credit'],
      statuses: ['CLOSED', 'ACTIVE'],
      workflowStatuses: ['NO_K1_YEAR', 'RECONCILED'],
      dataQuality: ['WARNINGS', 'COMPLETE'],
      sort: 'partnership',
      direction: 'asc',
      page: 1,
      pageSize: 50,
    })).toBe('search=beacon&ownerIds=a%2Cb&partnershipTypes=Private+Equity%2CCredit&statuses=ACTIVE%2CCLOSED&workflowStatuses=RECONCILED%2CNO_K1_YEAR&dataQuality=COMPLETE%2CWARNINGS')
    expect(serializePartnershipAggregationParams()).toBe('')
  })

  it('requests the aggregate endpoint and returns the server-normalized response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => aggregationResponseFixture })
    vi.stubGlobal('fetch', fetchMock)
    const response = await partnershipTrackerClient.aggregation({ partnershipTypes: ['Credit'], sort: 'nav', direction: 'desc', pageSize: 25 })
    expect(fetchMock).toHaveBeenCalledWith('/v1/partnership-tracker/aggregation?partnershipTypes=Credit&sort=nav&direction=desc&pageSize=25', expect.objectContaining({ credentials: 'include' }))
    expect(response.query).toEqual(aggregationResponseFixture.query)
    expect(response.rollup.committedCapital.amount).toBe('350000.00')
  })

  it('serializes private investment filters without converting exact amounts', async () => {
    expect(serializePrivateInvestmentParams({
      assetClasses: ['Credit', 'Real Estate'],
      entityIds: ['b', 'a', 'a'],
      partnershipIds: ['p-2', 'p-1'],
      dateFrom: '2024-01-01',
      amountMin: '1000000000000.01',
      page: 2,
      pageSize: 25,
    })).toBe('assetClasses=Real+Estate%2CCredit&entityIds=a%2Cb&partnershipIds=p-1%2Cp-2&dateFrom=2024-01-01&amountMin=1000000000000.01&page=2&pageSize=25')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => privateInvestmentResponseFixture })
    vi.stubGlobal('fetch', fetchMock)
    await partnershipTrackerClient.privateInvestments({ assetClasses: ['Credit'] })
    expect(fetchMock).toHaveBeenCalledWith('/v1/partnership-tracker/private-investments?assetClasses=Credit', expect.objectContaining({ credentials: 'include' }))
  })

  it('downloads binary private investment reports using the server filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-disposition': 'attachment; filename="investment-tracker-2026-07-23.pdf"' }),
      blob: async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await partnershipTrackerClient.exportPrivateInvestmentsPdf({
      filters: { assetClasses: [], entityIds: [], partnershipIds: [], dateFrom: null, dateTo: null, amountMin: null, amountMax: null },
      summaryColumns: ['entity'],
      detailColumns: ['date'],
    })
    expect(result.filename).toBe('investment-tracker-2026-07-23.pdf')
    expect(result.blob.type).toBe('application/pdf')
  })

  it('serializes initial valuation and batched exact-dated cash activity writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'flow-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    await partnershipTrackerClient.create({ entityId: 'e-1', name: 'Fund', partnershipType: 'Private Equity', capitalCommitment: '$1,000,000', initialValuationAmount: '$850,000', initialValuationDate: '2024-01-15' })
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ capitalCommitment: '1000000.00', initialValuationAmount: '850000.00', initialValuationDate: '2024-01-15' })
    await partnershipTrackerClient.createCashFlows('p-1', { entries: [
      { kind: 'DISTRIBUTION', activityDate: '2021-09-30', amount: '$25,000', note: null },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2026-10-15', amount: '$5,000', note: null },
    ] })
    expect(fetchMock.mock.calls[1]![0]).toBe('/v1/partnership-tracker/partnerships/p-1/cash-flows/batch')
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ entries: [
      { kind: 'DISTRIBUTION', activityDate: '2021-09-30', amount: '25000.00', note: null },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2026-10-15', amount: '5000.00', note: null },
    ] })
  })

  it('deletes a partnership through the tracker endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    await partnershipTrackerClient.delete('p-1')
    expect(fetchMock).toHaveBeenCalledWith('/v1/partnership-tracker/partnerships/p-1', expect.objectContaining({ credentials: 'include', method: 'DELETE' }))
  })
})
