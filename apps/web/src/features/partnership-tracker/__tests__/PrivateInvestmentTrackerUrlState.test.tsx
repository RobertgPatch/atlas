import { describe, expect, it } from 'vitest'
import { serializePrivateInvestmentParams } from '../api/partnershipTrackerClient'
import {
  DEFAULT_PRIVATE_INVESTMENT_QUERY,
  isPrivateInvestmentMoneyRangeReversed,
  parsePrivateInvestmentSearchParams,
} from '../components/private-investment/privateInvestmentQueryState'

describe('Private Investment Tracker URL state', () => {
  it('normalizes the three visible filters and drops legacy range filters', () => {
    const parsed = parsePrivateInvestmentSearchParams(new URLSearchParams(
      'assetClasses=Real%20Estate,Credit,Real%20Estate&entityIds=z,a,a&partnershipIds=p2,p1'
      + '&dateFrom=2024-01-01&dateTo=2026-01-01&amountMin=1000000000000.01'
      + '&amountMax=2000000000000.01&page=4&pageSize=25',
    ))
    expect(parsed).toEqual({
      assetClasses: ['Real Estate', 'Credit'],
      entityIds: ['a', 'z'],
      partnershipIds: ['p1', 'p2'],
      dateFrom: null,
      dateTo: null,
      amountMin: null,
      amountMax: null,
      page: 4,
      pageSize: 25,
    })
    expect(parsePrivateInvestmentSearchParams(new URLSearchParams(serializePrivateInvestmentParams(parsed)))).toEqual(parsed)
  })

  it('cleans invalid values to reproducible defaults and ignores hidden ranges', () => {
    const parsed = parsePrivateInvestmentSearchParams(new URLSearchParams(
      'assetClasses=UNKNOWN&dateFrom=not-a-date&amountMin=0.1&page=-2&pageSize=73',
    ))
    expect(parsed).toEqual(DEFAULT_PRIVATE_INVESTMENT_QUERY)
    expect(isPrivateInvestmentMoneyRangeReversed(
      '9007199254740993.02',
      '9007199254740993.01',
    )).toBe(true)
  })

  it('serializes page one implicitly so filter changes have a canonical reset URL', () => {
    expect(serializePrivateInvestmentParams({
      ...DEFAULT_PRIVATE_INVESTMENT_QUERY,
      entityIds: ['e-2', 'e-1'],
      page: 1,
      pageSize: 50,
    })).toBe('entityIds=e-1%2Ce-2')
  })
})
