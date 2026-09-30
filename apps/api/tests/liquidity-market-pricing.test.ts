import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createMarketDataService } from '../src/modules/market-data/market-data.service.js'
import type { SourceHoldingRecord } from '../src/modules/liquidity-sources/liquidity-source.types.js'
import type { MarketPriceObservation } from '../src/modules/market-data/market-data.types.js'
import { sourcePositionHolding } from '../src/modules/liquidity-sources/liquidity-source.read.js'
import { config } from '../src/config.js'
it('uses exact CSV quantities/basis, rejects stale quotes, and restores source values on disable', async () => {
  let enabled=false
  const source:SourceHoldingRecord={id:randomUUID(),syncSnapshotId:randomUUID(),accountId:randomUUID(),symbol:'TEST',description:'Synthetic',type:'Stock',sector:null,industry:null,cusip:null,isin:null,currencyCode:'USD',quantity:3,costBasis:0.2,institutionPrice:0.1,marketValue:0.3,unrealizedGainLoss:0.1,asOfDate:'2026-09-01',sourceKind:'CSV',sourceAsOfDate:'2026-09-01',sourceAsOfAt:'2026-09-01T20:00:00Z',quoteEligible:true,providerSymbol:'TEST',priceUnit:'PER_UNIT',quantityUnit:'SHARES',quoteMultiplier:'1',accruedInterestConvention:'EXCLUDED',exact:{quantity:'3',costBasis:'0.2',institutionPrice:'0.1',marketValue:'0.3',unrealizedGainLoss:'0.1'}}
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

const statementSource=(overrides:Partial<SourceHoldingRecord>={}):SourceHoldingRecord=>({
  id:randomUUID(),syncSnapshotId:randomUUID(),accountId:randomUUID(),symbol:'TEST',description:'Synthetic statement equity',type:'Stock',sector:null,industry:null,cusip:null,isin:null,currencyCode:'USD',
  quantity:3,costBasis:0.2,institutionPrice:0.1,marketValue:0.3,unrealizedGainLoss:0.1,asOfDate:'2026-09-21',sourceKind:'STATEMENT',fileKind:'XLSX',adapterId:'morgan_stanley_holdings_xlsx',adapterVersion:'1.0.0',
  sourceAsOfDate:'2026-09-21',sourceAsOfAt:'2026-09-21T20:00:00Z',quoteEligible:true,providerSymbol:'TEST',priceUnit:'PER_UNIT',quantityUnit:'SHARES',quoteMultiplier:'1',accruedInterestConvention:'EXCLUDED',
  exact:{quantity:'3',costBasis:'0.2',institutionPrice:'0.1',marketValue:'0.3',unrealizedGainLoss:'0.1'},...overrides,
})
const quoteObservation=(overrides:Partial<MarketPriceObservation>={}):MarketPriceObservation=>({
  id:randomUUID(),provider:'synthetic',symbol:'TEST',price:0.2,currencyCode:'USD',priceType:'midpoint',marketSession:'regular',providerTimestamp:'2026-09-22T20:00:00Z',receivedAt:'2026-09-22T20:00:00Z',tradingDate:'2026-09-22',isDelayed:false,feed:null,...overrides,
})
function pricingHarness(quote=quoteObservation(),enabled=true){
  const read=vi.fn(async()=>[quote]),fetch=vi.fn(async()=>[quote]),save=vi.fn(async()=>undefined)
  const service=createMarketDataService({enabled,provider:{id:'synthetic',feed:null,isDelayed:false,getLatestPrices:fetch,getClosingPrices:fetch},store:{getLatestPrices:read,savePrices:save},refreshOnRead:false,maxAgeSeconds:60,now:()=>new Date('2026-09-22T20:00:00Z')})
  return {service,read,fetch,save}
}

describe('statement-source pricing requires explicit safe financial conventions',()=>{
  it('leaves statement quote pricing disabled by default and makes no provider/cache calls while disabled',async()=>{
    expect(config.marketData.realTimeEquitiesEnabled).toBe(false)
    const source=statementSource(),harness=pricingHarness(undefined,false)
    expect((await harness.service.priceHoldingsForRead([source])).holdings[0]).toEqual(source)
    expect(harness.read).not.toHaveBeenCalled();expect(harness.fetch).not.toHaveBeenCalled();expect(harness.save).not.toHaveBeenCalled()
  })

  it('supports exact repricing for an explicitly eligible neutral statement equity',async()=>{
    const source=statementSource(),harness=pricingHarness()
    const result=await harness.service.priceHoldingsForRead([source])
    expect(result.holdings[0]!.exact).toMatchObject({quantity:'3',costBasis:'0.2',marketValue:'0.6',unrealizedGainLoss:'0.4'})
    expect(result.pricing.pricedHoldingCount).toBe(1)
    expect(source.exact!.marketValue).toBe('0.3')
  })

  it.each([
    ['not explicitly eligible',{quoteEligible:false}],['no provider identity',{providerSymbol:null}],
    ['unknown quote unit',{priceUnit:'UNKNOWN'}],['percent of par',{priceUnit:'PERCENT_OF_PAR',quantityUnit:'PRINCIPAL',quoteMultiplier:'0.01'}],
    ['contract quote',{priceUnit:'PER_CONTRACT',quantityUnit:'CONTRACTS',quoteMultiplier:'100'}],['unknown quantity unit',{quantityUnit:'UNKNOWN'}],
    ['unknown multiplier',{quoteMultiplier:null}],['nonunit multiplier',{quoteMultiplier:'100'}],
    ['unknown accrued interest',{accruedInterestConvention:'UNKNOWN'}],['included accrued interest',{accruedInterestConvention:'INCLUDED'}],
    ['cash',{type:'Cash'}],['bond',{type:'Bond'}],['option',{type:'Option'}],['private or other',{type:'Other'}],
    ['missing source currency',{currencyCode:null}],['non-USD source currency',{currencyCode:'EUR'}],['missing quantity',{quantity:null,exact:{quantity:null,costBasis:'0.2',institutionPrice:'0.1',marketValue:'0.3',unrealizedGainLoss:'0.1'}}],
  ] as Array<[string,Partial<SourceHoldingRecord>]>)('does not price %s even if the symbol resembles a public ticker',async(_label,overrides)=>{
    const source=statementSource(overrides),harness=pricingHarness()
    const result=await harness.service.priceHoldingsForRead([source])
    expect(result.holdings[0]).toEqual(source)
    expect(result.pricing.pricedHoldingCount).toBe(0)
    expect(harness.read).not.toHaveBeenCalled();expect(harness.fetch).not.toHaveBeenCalled();expect(harness.save).not.toHaveBeenCalled()
  })

  it.each([
    ['quote predating source',{providerTimestamp:'2026-09-20T20:00:00Z'},{}],
    ['same-day quote with date-only source',{providerTimestamp:'2026-09-21T23:59:59Z'},{sourceAsOfAt:null}],
    ['non-USD quote',{currencyCode:'EUR'},{}],
    ['invalid quote timestamp',{providerTimestamp:'not-a-timestamp'},{}],
  ] as Array<[string,Partial<MarketPriceObservation>,Partial<SourceHoldingRecord>]>)('retains exact original values for a %s',async(_label,quoteOverrides,sourceOverrides)=>{
    const source=statementSource(sourceOverrides),harness=pricingHarness(quoteObservation(quoteOverrides))
    const result=await harness.service.priceHoldingsForRead([source])
    expect(result.holdings[0]).toEqual(source)
    expect(result.pricing.pricedHoldingCount).toBe(0)
  })

  it.each(['CSV','STATEMENT'] as const)('bases source-position eligibility on conventions, not the %s label',sourceKind=>{
    const canonical={symbol:{value:'TEST'},description:{value:'Synthetic'},assetType:{value:'equity'},cusip:{value:null},isin:{value:null},
      valuationConvention:{priceUnit:'PER_UNIT',quantityUnit:'SHARES',multiplier:'1',accruedInterest:'EXCLUDED',providerIdentity:'TEST'}}
    const row={id:randomUUID(),snapshot_id:randomUUID(),source_account_id:randomUUID(),canonical,source_kind:sourceKind,file_kind:sourceKind==='CSV'?'CSV':'XLSX',adapter_id:'synthetic_test',adapter_version:'1.0.0',currency:'USD',quantity:'3',price:'0.1',market_value:'0.3',cost_basis:'0.2',unrealized_gain_loss:'0.1',as_of_date:'2026-09-21',as_of_at:'2026-09-21T20:00:00Z'}
    expect(sourcePositionHolding(row)).toMatchObject({sourceKind,quoteEligible:true,providerSymbol:'TEST',priceUnit:'PER_UNIT',quantityUnit:'SHARES',quoteMultiplier:'1',exact:{marketValue:'0.3'}})
    for(const convention of [undefined,{...canonical.valuationConvention,providerIdentity:null},{...canonical.valuationConvention,priceUnit:'PERCENT_OF_PAR'},{...canonical.valuationConvention,quantityUnit:'PRINCIPAL'},{...canonical.valuationConvention,multiplier:'100'},{...canonical.valuationConvention,accruedInterest:'UNKNOWN'}]){
      const unsafe=sourcePositionHolding({...row,canonical:{...canonical,valuationConvention:convention}})
      expect(unsafe).toMatchObject({quoteEligible:false,providerSymbol:null,marketValue:0.3,exact:{marketValue:'0.3'}})
    }
  })
})
