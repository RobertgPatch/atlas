import { randomUUID } from 'node:crypto'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import type { ReportSourceAccount,SourceHoldingRecord } from '../src/modules/liquidity-sources/liquidity-source.types.js'
import { buildConsolidatedHoldingsResponse,holdingIdentityKeyFor } from '../src/modules/reports/consolidatedHoldings.service.js'
import { readLiquiditySources } from '../src/modules/liquidity-sources/liquidity-source.read.js'
import { marketDataService } from '../src/modules/market-data/market-data.service.js'
import { liquiditySectorRepository } from '../src/modules/liquidity-sectors/liquidity-sector.repository.js'

vi.mock('../src/modules/liquidity-sources/liquidity-source.read.js',()=>({readLiquiditySources:vi.fn()}))
vi.mock('../src/modules/market-data/market-data.service.js',()=>({marketDataService:{priceHoldingsForRead:vi.fn()}}))
vi.mock('../src/modules/liquidity-sectors/liquidity-sector.repository.js',()=>({liquiditySectorRepository:{forSymbols:vi.fn(async()=>new Map())}}))

beforeEach(()=>{
  vi.clearAllMocks()
  vi.mocked(liquiditySectorRepository.forSymbols).mockResolvedValue(new Map())
  vi.mocked(marketDataService.priceHoldingsForRead).mockImplementation(async holdings=>({holdings,pricing:{status:'fallback',provider:null,feed:null,priceAsOf:null,refreshedAt:null,pricedHoldingCount:0,fallbackHoldingCount:holdings.length,warnings:[]}}))
})

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

const statementHolding = (overrides: Partial<SourceHoldingRecord> = {}): SourceHoldingRecord => holding({
  sourceKind:'STATEMENT',fileKind:'CSV',adapterId:'merrill_holdings_csv',adapterVersion:'1.0.0',
  priceUnit:'PER_UNIT',quantityUnit:'SHARES',quoteMultiplier:'1',accruedInterestConvention:'EXCLUDED',
  quantity:100,costBasis:1000,institutionPrice:11,marketValue:1100,unrealizedGainLoss:100,
  exact:{quantity:'100',costBasis:'1000',institutionPrice:'11',marketValue:'1100',unrealizedGainLoss:'100'},
  ...overrides,
})

async function reportFor(holdings:SourceHoldingRecord[],custodianNames=['Merrill Lynch','Charles Schwab']) {
  const entityId=randomUUID()
  const accounts:ReportSourceAccount[]=holdings.map((source,index)=>({
    id:source.accountId,name:`Synthetic account ${index+1}`,custodianName:custodianNames[index]??`Custodian ${index+1}`,
    mask:index===0?'3432':'4514',type:'investment',subtype:null,officialName:null,selectedForHoldingsReport:true,
    syncStatus:'success',lastSyncedAt:'2026-09-21T20:00:00Z',entityId,sourceKind:'STATEMENT',version:2,
  }))
  vi.mocked(readLiquiditySources).mockResolvedValue({accounts,holdings,neutralAccounts:accounts.map((account,index)=>({
    id:account.id,entityId,custodian:account.custodianName,name:account.name,accountMask:account.mask,currency:holdings[index]!.currencyCode??'USD',
    included:true,cadence:'ON_DEMAND',version:2,holdingsAsOfDate:'2026-09-21',nextExpectedDate:null,
    latestSnapshotId:holdings[index]!.syncSnapshotId,uploadedAt:'2026-09-21T20:00:00Z',activeSource:'STATEMENT',
  }))})
  return buildConsolidatedHoldingsResponse({pricingMode:'saved',page:1,pageSize:50,sort:'marketValue',direction:'desc'},{actorUserId:randomUUID(),scope:{isAdmin:false,entityIds:[entityId]}})
}

describe('statement rollup compatibility and safe unit arithmetic',()=>{
  it('overlays a global assignment on new cross-custodian snapshots without changing source evidence', async () => {
    vi.mocked(liquiditySectorRepository.forSymbols).mockResolvedValue(new Map([['SPCX', { symbol: 'SPCX', sector: 'Industrials', version: 2, updatedAt: '2026-09-30T10:00:00Z' }]]))
    const sources = [statementHolding(), statementHolding()]
    const report = await reportFor(sources)
    expect(report.rows[0]).toMatchObject({ symbol: 'SPCX', sectorOverride: 'Industrials', marketValue: 2200 })
    expect(report.rows[0]!.details).toHaveLength(2)
    expect(sources.every((source) => source.sector === null)).toBe(true)
    expect(liquiditySectorRepository.forSymbols).toHaveBeenCalledWith(['SPCX'])
    const nextMonth = await reportFor([statementHolding({ asOfDate: '2026-10-31' })])
    expect(nextMonth.rows[0]?.sectorOverride).toBe('Industrials')
  })
  it('rolls compatible symbols across descriptions, formats and custodians into one parent with two subrows',async()=>{
    const first=statementHolding()
    const second=statementHolding({description:'SPACE EX TECH SPACEX CLASS A',type:'Equity',cusip:null,fileKind:'CSV',adapterId:'charles_schwab_positions_csv',costBasis:1500,institutionPrice:16,marketValue:1600,
      exact:{quantity:'100',costBasis:'1500',institutionPrice:'16',marketValue:'1600',unrealizedGainLoss:'100'}})
    const report=await reportFor([first,second])
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({symbol:'SPCX',quantity:200,marketValue:2700,costBasis:2500,unrealizedGainLoss:200,
      averageCostBasis:12.5,exact:{quantity:'200',marketValue:'2700',costBasis:'2500',unrealizedGainLoss:'200'}})
    expect(report.rows[0]!.details.map(detail=>detail.averageCostBasis)).toEqual([10,15])
    expect(report.rows[0]!.details.map(detail=>[detail.custodian,detail.accountMask,detail.quantity])).toEqual([
      ['Merrill Lynch','3432',100],['Charles Schwab','4514',100],
    ])
    expect(report.kpis).toMatchObject({uniqueAssetCount:1,selectedAccountCount:2,totalMarketValue:2700})
  })

  it('uses an equity ticker as the decisive rollup key across Schwab and Morgan Stanley metadata differences',async()=>{
    const schwab=statementHolding({symbol:'AMZN',description:'AMAZON.COM INC',type:'Equity',cusip:'023135106',adapterId:'charles_schwab_positions_csv',quantity:5000,costBasis:1029250,unrealizedGainLoss:239300,marketValue:1268550,institutionPrice:253.71,asOfDate:'2026-09-21',exact:{quantity:'5000',costBasis:'1029250',unrealizedGainLoss:'239300',marketValue:'1268550',institutionPrice:'253.71'}})
    const morgan=statementHolding({symbol:'amzn',description:'AMAZON COM INC',type:'Stock',cusip:'DIFFERENT-CUSTODIAN-ID',fileKind:'XLSX',adapterId:'morgan_stanley_holdings_xlsx',quantity:2500,costBasis:247356,unrealizedGainLoss:387506.5,marketValue:634862.5,institutionPrice:253.95,asOfDate:'2026-09-22',priceUnit:'UNKNOWN',quantityUnit:'UNKNOWN',quoteMultiplier:null,accruedInterestConvention:'UNKNOWN',exact:{quantity:'2500',costBasis:'247356',unrealizedGainLoss:'387506.5',marketValue:'634862.5',institutionPrice:'253.95'}})
    const report=await reportFor([schwab,morgan],['Charles Schwab','Morgan Stanley'])
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({symbol:'AMZN',quantity:7500,costBasis:1276606,unrealizedGainLoss:626806.5,marketValue:1903412.5})
    expect(report.rows[0]!.averageCostBasis).toBeCloseTo(1276606/7500)
    expect(report.rows[0]!.details[1]!.averageCostBasis).toBeCloseTo(247356/2500)
    expect(report.rows[0]!.details.map(detail=>[detail.custodian,detail.quantity,detail.marketValue])).toEqual([
      ['Charles Schwab',5000,1268550],['Morgan Stanley',2500,634862.5],
    ])
  })

  it.each([
    ['currency',{currencyCode:'EUR'}],
    ['quantity units',{quantityUnit:'PRINCIPAL'}],
    ['price units',{priceUnit:'PERCENT_OF_PAR',quoteMultiplier:'0.01'}],
    ['contract multiplier',{priceUnit:'PER_CONTRACT',quantityUnit:'CONTRACTS',quoteMultiplier:'100'}],
    ['accrual convention',{accruedInterestConvention:'INCLUDED'}],
    ['contradictory CUSIP',{cusip:'000000202'}],
    ['contradictory ISIN',{isin:'US0000002029'}],
  ] as Array<[string,Partial<SourceHoldingRecord>]>)('separates non-equity same-symbol observations with incompatible %s',async(_label,overrides)=>{
    const first=statementHolding({type:'Bond',cusip:'000000101',isin:'US0000001013'})
    const second=statementHolding({type:'Bond',...overrides,adapterId:'charles_schwab_positions_csv',description:'Different custodian description'})
    // Keep matching reliable identifiers except for the intended conflict.
    if(!('cusip' in overrides))second.cusip=first.cusip
    if(!('isin' in overrides))second.isin=first.isin
    const report=await reportFor([first,second])
    expect(report.rows).toHaveLength(2)
    expect(report.rows.every(row=>row.details.length===1)).toBe(true)
    expect(report.rows.map(row=>row.quantity)).toEqual([100,100])
    expect(new Set(report.rows.map(row=>row.id)).size).toBe(2)
    if(overrides.currencyCode){
      expect(new Set(report.rows.map(row=>row.currencyCode))).toEqual(new Set(['USD','EUR']))
      expect(report.kpis.totalMarketValue).toBeNull()
      expect(report.kpis.totalCostBasis).toBeNull()
      expect(report.coverage.currencies.sort()).toEqual(['EUR','USD'])
    }else expect(report.kpis.totalMarketValue).toBe(2200)
  })

  it.each([
    ['bond',{type:'Bond',quantity:1000,institutionPrice:98,marketValue:980,costBasis:900,unrealizedGainLoss:80,priceUnit:'PERCENT_OF_PAR',quantityUnit:'PRINCIPAL',quoteMultiplier:'0.01',exact:{quantity:'1000',institutionPrice:'98',marketValue:'980',costBasis:'900',unrealizedGainLoss:'80'}}],
    ['option',{type:'Option',quantity:2,institutionPrice:5,marketValue:1000,costBasis:800,unrealizedGainLoss:200,priceUnit:'PER_CONTRACT',quantityUnit:'CONTRACTS',quoteMultiplier:'100',exact:{quantity:'2',institutionPrice:'5',marketValue:'1000',costBasis:'800',unrealizedGainLoss:'200'}}],
  ] as Array<[string,Partial<SourceHoldingRecord>]>)('does not fabricate per-share price or basis for statement %s',async(_label,overrides)=>{
    const source=statementHolding(overrides),report=await reportFor([source]),row=report.rows[0]!
    expect(row.marketValue).toBe(source.marketValue)
    expect(row.institutionPrice).toBe(source.institutionPrice)
    expect(row.exact?.institutionPrice).toBe(source.exact!.institutionPrice)
    expect(row.averageCostBasis).toBeNull()
    expect(row.details[0]!.averageCostBasis).toBeNull()
  })

  it('calculates equity average basis from total basis and quantity even when valuation metadata is unknown',async()=>{
    const source=statementHolding({quantity:22223,costBasis:3000105,priceUnit:'UNKNOWN',quantityUnit:'UNKNOWN',quoteMultiplier:null,accruedInterestConvention:'UNKNOWN',exact:{quantity:'22223',institutionPrice:'152.71',marketValue:'3393674.33',costBasis:'3000105',unrealizedGainLoss:'393569.33'}})
    const row=(await reportFor([source])).rows[0]!
    expect(row.averageCostBasis).toBe(135)
    expect(row.details[0]!.averageCostBasis).toBe(135)
  })

  it('keeps value-only cash quantity unavailable and retains its reported value and basis',async()=>{
    const report=await reportFor([statementHolding({symbol:null,cusip:null,type:'Cash',quantity:null,institutionPrice:null,marketValue:125,costBasis:125,unrealizedGainLoss:0,
      priceUnit:'UNKNOWN',quantityUnit:'CURRENCY',quoteMultiplier:null,exact:{quantity:null,institutionPrice:null,marketValue:'125',costBasis:'125',unrealizedGainLoss:'0'}})])
    expect(report.rows[0]).toMatchObject({cashDisplayMode:'BALANCE_AT_PAR',quantity:null,institutionPrice:null,averageCostBasis:null,marketValue:125,costBasis:125,unrealizedGainLoss:0})
  })

  it('carries confirmed bank deposits at par when an older snapshot omitted basis and gain',async()=>{
    const report=await reportFor([statementHolding({symbol:'MSPBNA',description:'BANK DEPOSIT PROGRAM | MORGAN STANLEY PRIVATE BANK NA',type:'Cash',quantity:null,institutionPrice:null,marketValue:160835.8,costBasis:null,unrealizedGainLoss:null,
      priceUnit:'UNKNOWN',quantityUnit:'CURRENCY',quoteMultiplier:null,exact:{quantity:null,institutionPrice:null,marketValue:'160835.8',costBasis:null,unrealizedGainLoss:null}})])
    expect(report.rows[0]).toMatchObject({cashDisplayMode:'BALANCE_AT_PAR',quantity:null,marketValue:160835.8,costBasis:160835.8,unrealizedGainLoss:0})
    expect(report.rows[0]!.details[0]).toMatchObject({cashDisplayMode:'BALANCE_AT_PAR',costBasis:160835.8,unrealizedGainLoss:0})
    expect(report.kpis).toMatchObject({totalCostBasis:160835.8,totalUnrealizedGainLoss:0})
    expect(report.coverage.basis.status).toBe('COMPLETE')
  })

  it('distinguishes stable-NAV units from bank balances that happen to report a one-dollar price',async()=>{
    const moneyFund=statementHolding({symbol:'TFDXX',description:'BLF FEDFUND',type:'Cash',quantity:250,institutionPrice:1,marketValue:250,costBasis:250,unrealizedGainLoss:0,
      priceUnit:'UNKNOWN',quantityUnit:'UNKNOWN',quoteMultiplier:null,exact:{quantity:'250',institutionPrice:'1',marketValue:'250',costBasis:'250',unrealizedGainLoss:'0'}})
    const deposit=statementHolding({symbol:'990286916',description:'ML BANK DEPOSIT PROGRAM',type:'Cash',quantity:100,institutionPrice:1,marketValue:100,costBasis:100,unrealizedGainLoss:0,
      priceUnit:'UNKNOWN',quantityUnit:'UNKNOWN',quoteMultiplier:null,exact:{quantity:'100',institutionPrice:'1',marketValue:'100',costBasis:'100',unrealizedGainLoss:'0'}})
    const report=await reportFor([moneyFund,deposit])
    const fundRow=report.rows.find(row=>row.symbol==='TFDXX')!
    const depositRow=report.rows.find(row=>row.symbol==='990286916')!
    expect(fundRow).toMatchObject({cashDisplayMode:'STABLE_NAV_UNITS',averageCostBasis:1,institutionPrice:1})
    expect(depositRow).toMatchObject({cashDisplayMode:'BALANCE_AT_PAR',averageCostBasis:null})
  })
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

  it('limits holdings and totals to the requested entity',async()=>{
    const entityA=randomUUID(),entityB=randomUUID(),accountA=randomUUID(),accountB=randomUUID()
    const holdings=[statementHolding({accountId:accountA,marketValue:1100}),statementHolding({accountId:accountB,marketValue:2200})]
    const accounts:ReportSourceAccount[]=[
      {id:accountA,name:'Trust account',custodianName:'Merrill Lynch',mask:'3432',type:'investment',subtype:null,officialName:null,selectedForHoldingsReport:true,syncStatus:'success',lastSyncedAt:'2026-09-21T20:00:00Z',entityId:entityA,sourceKind:'STATEMENT',version:2},
      {id:accountB,name:'Personal account',custodianName:'Charles Schwab',mask:'4514',type:'investment',subtype:null,officialName:null,selectedForHoldingsReport:true,syncStatus:'success',lastSyncedAt:'2026-09-21T20:00:00Z',entityId:entityB,sourceKind:'STATEMENT',version:2},
    ]
    vi.mocked(readLiquiditySources).mockResolvedValue({accounts,holdings,neutralAccounts:[]})
    const report=await buildConsolidatedHoldingsResponse({entityId:entityA,pricingMode:'saved',page:1,pageSize:50},{actorUserId:randomUUID(),scope:{isAdmin:false,entityIds:[entityA,entityB]}})
    expect(report.kpis).toMatchObject({selectedAccountCount:1,totalMarketValue:1100})
    expect(report.selectedAccounts.map(account=>account.entityId)).toEqual([entityA])
    expect(report.rows[0]?.details.map(detail=>[detail.accountName,detail.custodian])).toEqual([['Trust account','Merrill Lynch']])
  })
})
