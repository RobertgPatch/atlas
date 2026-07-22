import { afterEach, describe, expect, it, vi } from 'vitest'
import { partnershipTrackerClient, serializePartnershipAggregationParams } from '../api/partnershipTrackerClient'
import { aggregationResponseFixture } from './fixtures'

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

  it('serializes initial valuation and batched exact-dated cash activity writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'flow-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    await partnershipTrackerClient.create({ entityId: 'e-1', name: 'Fund', partnershipType: 'Private Equity', initialValuationAmount: '$850,000', initialValuationDate: '2024-01-15' })
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ initialValuationAmount: '850000.00', initialValuationDate: '2024-01-15' })
    await partnershipTrackerClient.createCashFlows('p-1', 2024, { entries: [
      { kind: 'DISTRIBUTION', activityDate: '2024-09-30', amount: '$25,000', note: null },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-10-15', amount: '$5,000', note: null },
    ] })
    expect(fetchMock.mock.calls[1]![0]).toBe('/v1/partnership-tracker/partnerships/p-1/years/2024/cash-flows/batch')
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ entries: [
      { kind: 'DISTRIBUTION', activityDate: '2024-09-30', amount: '25000.00', note: null },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-10-15', amount: '5000.00', note: null },
    ] })
  })

  it('deletes a partnership through the tracker endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    await partnershipTrackerClient.delete('p-1')
    expect(fetchMock).toHaveBeenCalledWith('/v1/partnership-tracker/partnerships/p-1', expect.objectContaining({ credentials: 'include', method: 'DELETE' }))
  })
})
