import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { createMarketDataService } from '../src/modules/market-data/market-data.service.js'
import type { SourceHoldingRecord } from '../src/modules/liquidity-sources/liquidity-source.types.js'
import type { MarketPriceObservation } from '../src/modules/market-data/market-data.types.js'
it('uses exact CSV quantities/basis, rejects stale quotes, and restores source values on disable', async () => {
  let enabled=false
  const source:SourceHoldingRecord={id:randomUUID(),syncSnapshotId:randomUUID(),accountId:randomUUID(),symbol:'TEST',description:'Synthetic',type:'Stock',sector:null,industry:null,cusip:null,isin:null,currencyCode:'USD',quantity:3,costBasis:0.2,institutionPrice:0.1,marketValue:0.3,unrealizedGainLoss:0.1,asOfDate:'2026-09-01',sourceKind:'CSV',sourceAsOfDate:'2026-09-01',sourceAsOfAt:'2026-09-01T20:00:00Z',quoteEligible:true,providerSymbol:'TEST',exact:{quantity:'3',costBasis:'0.2',institutionPrice:'0.1',marketValue:'0.3',unrealizedGainLoss:'0.1'}}
  let quote:MarketPriceObservation={id:randomUUID(),provider:'synthetic',symbol:'TEST',price:0.2,currencyCode:'USD',priceType:'midpoint',marketSession:'regular',providerTimestamp:'2026-09-02T20:00:00Z',receivedAt:'2026-09-02T20:00:00Z',tradingDate:'2026-09-02',isDelayed:false,feed:null}
  const read=vi.fn(async()=>[quote]),save=vi.fn(async()=>undefined)
  const service=createMarketDataService({enabled:()=>enabled,provider:{id:'synthetic',feed:null,isDelayed:false,getLatestPrices:read,getClosingPrices:read},store:{getLatestPrices:read,savePrices:save},refreshOnRead:false,maxAgeSeconds:60})
  expect((await service.priceHoldingsForRead([source])).holdings[0]!.exact).toEqual(source.exact)
  expect(read).not.toHaveBeenCalled()
  enabled=true
  expect((await service.priceHoldingsForRead([source])).holdings[0]!.exact).toMatchObject({quantity:'3',costBasis:'0.2',marketValue:'0.6',unrealizedGainLoss:'0.4'})
  quote={...quote,providerTimestamp:'2026-08-31T20:00:00Z'}
  expect((await service.priceHoldingsForRead([source])).holdings[0]!.exact).toEqual(source.exact)
  enabled=false;read.mockClear()
  expect((await service.priceHoldingsForRead([source])).holdings[0]!.exact).toEqual(source.exact)
  expect(read).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled()
})
