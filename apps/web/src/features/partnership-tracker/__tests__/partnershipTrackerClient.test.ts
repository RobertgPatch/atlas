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
})
