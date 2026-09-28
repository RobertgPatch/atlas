import { randomUUID } from 'node:crypto'
import { describe,expect,it } from 'vitest'
import type { SourceHoldingRecord } from '../src/modules/liquidity-sources/liquidity-source.types.js'
import { holdingIdentityKeyFor } from '../src/modules/reports/consolidatedHoldings.service.js'

const holding = (overrides: Partial<SourceHoldingRecord> = {}): SourceHoldingRecord => ({
  id: randomUUID(),
  syncSnapshotId: randomUUID(),
  accountId: randomUUID(),
  symbol: 'SPCX',
  description: 'SPACE EXPL TECHNOLOGIES',
  type: 'Stock',
  sector: null,
  industry: null,
  cusip: '84615Q103',
  isin: null,
  currencyCode: 'USD',
  quantity: 1,
  costBasis: 100,
  institutionPrice: 120,
  marketValue: 120,
  unrealizedGainLoss: 20,
  asOfDate: '2026-09-18',
  ...overrides,
})

describe('consolidated holding identity',()=>{
  it('uses symbol ahead of description, asset type, and optional security identifiers',()=>{
    const merrill=holding()
    const schwab=holding({
      description:'SPACE EX TECH SPACEX CLASS A',
      type:'Equity',
      cusip:null,
      quantity:2,
    })
    expect(holdingIdentityKeyFor(merrill)).toEqual({key:'SYMBOL:SPCX',confidence:'medium'})
    expect(holdingIdentityKeyFor(schwab)).toEqual({key:'SYMBOL:SPCX',confidence:'medium'})
  })

  it('falls back to CUSIP when the source has no symbol',()=>{
    expect(holdingIdentityKeyFor(holding({symbol:null}))).toEqual({key:'CUSIP:84615Q103',confidence:'high'})
  })
})
