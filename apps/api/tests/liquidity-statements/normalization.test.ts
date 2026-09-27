import { describe,expect,it } from 'vitest'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { sourcePositionHolding } from '../../src/modules/liquidity-sources/liquidity-source.read.js'

describe('financial normalization',()=>{
  it('defaults USD and unknown asset type while deriving percentage-only and cash-at-par basis',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[
      ['CASH','Cash','800','1','800','','','','','Cash'],
      ['BOND','Bond','1000','80','','','','','','Bond'],
      ['EST','Equity','1','800','800','','','-20%','','Equity'],
    ]})))
    const n=normalizeDraft(draft!)
    expect(n.accounts[0]!.currency).toMatchObject({value:'USD',origin:'DERIVED',reason:'DEFAULT_USD'})
    expect(n.accounts[0]!.positions[0]!.costBasis).toMatchObject({value:'800',derivation:{rule:'CASH_AT_PAR',estimated:false}})
    expect(n.accounts[0]!.positions[1]!.marketValue.value).toBeNull()
    expect(n.accounts[0]!.positions[2]!.costBasis).toMatchObject({value:'1000',derivation:{rule:'BASIS_FROM_PERCENT_ESTIMATE',estimated:true}})
    expect(n.accounts[0]!.positions[2]!.unrealizedGainLoss.value).toBe('-200')
    expect(n.accounts[0]!.positions[0]!.assetType.value).toBe('cash')
    expect(n.accounts[0]!.positions[1]!.assetType.value).toBe('bond')
    expect(n.issues.some(i=>i.code==='MISSING_VALUE'&&i.severity==='BLOCKING')).toBe(true)
    expect(n.issues.some(i=>['MISSING_CURRENCY','UNKNOWN_ASSET_TYPE','MISSING_DAY_CHANGE'].includes(i.code))).toBe(false)
  })
  it('uses other when the source has no recognizable asset type',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['DEMO','Example','1','800','800','1000','-200','-20%','','']]})))
    const p=normalizeDraft(draft!).accounts[0]!.positions[0]!
    expect(p.assetType).toMatchObject({value:'other',origin:'DERIVED',reason:'DEFAULT_OTHER_ASSET_TYPE'})
    expect(p.currency).toMatchObject({value:'USD',reason:'ACCOUNT_CURRENCY'})
  })
  it('recognizes the top-equity reference and listed statement symbols from Symbol',async()=>{
    const rows=['NVDA','SPCX','KLAR','KBDC','NOTLISTED'].map((symbol,index)=>[
      '9/1/2026',String(index),symbol,'',`${symbol} holding`,'Example','Trust','00012345','1','10','10','0','0','0','0',
    ])
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({format:'merrill',rows})))
    const positions=normalizeDraft(draft!).accounts[0]!.positions
    expect(positions.map(position=>position.assetType.value)).toEqual(['equity','equity','equity','equity','other'])
    expect(positions.slice(0,4).every(position=>position.assetType.reason==='KNOWN_EQUITY_SYMBOL')).toBe(true)
  })
  it('upgrades legacy unknown categories for known symbols without overriding a reviewed Other choice',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({format:'merrill',rows:[['9/1/2026','1','KBDC','','Kayne Anderson BDC','Example','Trust','00012345','1','10','10','0','0','0','0']]})))
    const position=normalizeDraft(draft!).accounts[0]!.positions[0]!
    const row={id:'position',snapshot_id:'snapshot',source_account_id:'account',currency:'USD',quantity:'1',price:'10',market_value:'10',cost_basis:'10',unrealized_gain_loss:'0',as_of_date:'2026-09-01',as_of_at:null,canonical:position}
    position.assetType={...position.assetType,value:'unknown',reason:'DEFAULT_UNKNOWN_ASSET_TYPE'}
    expect(sourcePositionHolding(row).type).toBe('Stock')
    position.assetType={...position.assetType,value:'other',origin:'REVIEWED',reason:'Reviewed as Other'}
    expect(sourcePositionHolding(row).type).toBe('Other')
  })
  it('classifies known Merrill deposit programs as cash when asset type is absent',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[
      ['MLBDP','ML Bank Deposity Program','100','1','100','','','','',''],
      ['BLF','BLF FEDFUND','250','1','250','','','','',''],
    ]})))
    const positions=normalizeDraft(draft!).accounts[0]!.positions
    expect(positions.map(position=>position.assetType.value)).toEqual(['cash','cash'])
    expect(positions.map(position=>position.assetType.reason)).toEqual([
      'KNOWN_CASH_PROGRAM',
      'KNOWN_CASH_PROGRAM',
    ])
    expect(positions.map(position=>position.costBasis.value)).toEqual(['100','250'])
  })
  it('accepts value-only cash without quantity and uses value as basis',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[
      ['', 'Checking account cash', '', '', '1250.25', '', '', '', '', 'Cash'],
    ]})))
    const n=normalizeDraft(draft!),p=n.accounts[0]!.positions[0]!
    expect(p.quantity).toMatchObject({value:null,availability:'UNAVAILABLE'})
    expect(p.costBasis).toMatchObject({value:'1250.25',origin:'DERIVED',derivation:{rule:'CASH_VALUE_BASIS',estimated:false}})
    expect(p.unrealizedGainLoss).toMatchObject({value:'0',origin:'DERIVED',derivation:{rule:'GAIN_FROM_VALUE_BASIS'}})
    expect(n.issues.some(issue=>issue.code==='MISSING_BASIS')).toBe(false)
  })
  it('does not compare a rounded percentage estimate against itself as independent evidence',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['TINY','Example','1','0.01','0.01','','','12.3456789012%','','Equity']]})))
    const n=normalizeDraft(draft!),p=n.accounts[0]!.positions[0]!
    expect(p.costBasis.derivation?.rule).toBe('BASIS_FROM_PERCENT_ESTIMATE')
    expect(n.issues.some(issue=>issue.code==='PERCENT_MISMATCH')).toBe(false)
  })
  it('recognizes dated account titles without the synthetic Positions prefix',async()=>{
    const source=buildCsvFixture().replace('Positions for account Synthetic ...1234 as of 09/01/2026 04:00 PM ET','Synthetic Trust as of 12:45 AM ET, 2026/09/01')
    // The title contains a comma, so quote the complete single metadata cell.
    const lines=source.split('\r\n');lines[0]=`"${lines[0]}"`
    const {draft}=await parseCsv(Buffer.from(lines.join('\r\n')))
    expect(draft!.accounts[0]!.asOfDate.value).toBe('2026-09-01')
    expect(draft!.accounts[0]!.asOfAt.value).toBe('2026-09-01T04:45:00.000Z')
  })
  it('derives signed dollar basis and preserves evidence without using cumulative return',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({format:'merrill'})))
    const normalized=normalizeDraft(draft!)
    const p=normalized.accounts[0]!.positions[0]!
    expect(p.costBasis.value).toBe('1000')
    expect(p.costBasis.derivation).toMatchObject({rule:'BASIS_FROM_VALUE_GAIN',estimated:false})
    expect(p.unrealizedGainLossRatio.value).toBe('-0.2')
    expect(draft!.accounts[0]!.positions[0]!.costBasis.value).toBeNull()
  })
  it('does not replace explicit basis or excuse incompatible dollars',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['DEMO','Example','10','80','800','900','-200','-20%','','Equity']]})))
    const n=normalizeDraft(draft!)
    expect(n.accounts[0]!.positions[0]!.costBasis.value).toBe('900')
    expect(n.issues.some(i=>i.code==='FIELD_ARITHMETIC_MISMATCH'&&i.severity==='BLOCKING')).toBe(true)
  })
  it('keeps explicitly incomplete basis and its full-position gain unavailable',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['DEMO','Example','1','800','800','Incomplete','-200','-20%','','Equity']]})))
    const n=normalizeDraft(draft!),p=n.accounts[0]!.positions[0]!
    expect(p.costBasis.value).toBeNull()
    expect(p.costBasis.availability).toBe('INCOMPLETE')
    expect(p.unrealizedGainLoss.availability).toBe('INCOMPLETE')
    expect(n.issues.some(i=>i.code==='INCOMPLETE_BASIS'&&i.severity==='WARNING')).toBe(true)
  })
  it('derives missing gain and percent, with zero-basis ratio unavailable',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['DEMO','Example','1','800','800','1000','','','','Equity'],['ZERO','Example','1','5','5','0','','','','Equity']]})))
    const n=normalizeDraft(draft!)
    expect(n.accounts[0]!.positions[0]!.unrealizedGainLoss.value).toBe('-200')
    expect(n.accounts[0]!.positions[0]!.unrealizedGainLossRatio.value).toBe('-0.2')
    expect(n.accounts[0]!.positions[1]!.unrealizedGainLossRatio.value).toBeNull()
  })
})
