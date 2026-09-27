import { describe,expect,it } from 'vitest'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
import { reconcileDraft } from '../../src/modules/liquidity-statements/csv/reconcile.js'
import { applyCorrections } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
describe('account totals and incomplete coverage',()=>{
  it.each([['800','MATCHED'],['800.01','MATCHED'],['800.02','BLOCKED'],[undefined,'NOT_PROVIDED']])('compares independent total %s',async(total,status)=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({total})))
    const n=normalizeDraft(draft!);n.accounts[0]!.currency.value='USD'
    for(const p of n.accounts[0]!.positions)p.currency.value='USD'
    expect(reconcileDraft(n).accounts['account-1']!.status).toBe(status)
  })
  it('does not create a review finding when the source omits its total',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture()))
    const result=reconcileDraft(normalizeDraft(draft!))
    expect(result.accounts['account-1']!.status).toBe('NOT_PROVIDED')
    expect(result.draft.issues.some(issue=>issue.code==='TOTAL_NOT_PROVIDED')).toBe(false)
  })
  it('reports unknown basis as a null full total and a labeled known subtotal',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['DEMO','Complete','1','800','800','1000','-200','-20%','','Equity'],['MISS','Incomplete','1','200','200','Incomplete','','','','Equity']]})))
    const result=reconcileDraft(normalizeDraft(draft!)).accounts['account-1']!
    expect(result.basisCoverage).toMatchObject({total:null,knownSubtotal:'1000',knownRows:1,unknownRows:1,status:'PARTIAL'})
    expect(result.gainCoverage.total).toBeNull()
  })
  it('keeps partial source footers non-blocking after reviewed values complete a position',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[
      ['COMP','Complete','1','100','100','100','0','0%','','Equity'],
      ['MISS','Incomplete','1','50','50','Incomplete','N/A','','','Equity'],
      ['Cash & Cash Investments','--','--','--','10','--','--','--','','Cash and Money Market'],
      ['Positions Total','','','','160','100','0','','',''],
    ]})))
    const initial=normalizeDraft(draft!)
    const corrected=applyCorrections(initial,[
      {fieldPath:'accounts.0.positions.1.costBasis',value:'50',reason:'Confirmed from statement detail'},
      {fieldPath:'accounts.0.positions.1.unrealizedGainLoss',value:'0',reason:'Confirmed from statement detail'},
    ])
    const result=reconcileDraft(normalizeDraft(corrected,new Date(),true),true)
    expect(result.accounts['account-1']).toMatchObject({status:'MATCHED',difference:'0'})
    expect(result.draft.issues.some(issue=>issue.code==='TOTAL_MISMATCH')).toBe(false)
    expect(result.draft.issues.filter(issue=>issue.code==='PARTIAL_SOURCE_COVERAGE').map(issue=>issue.fieldPath)).toEqual([
      'accounts.0.reportedBasis',
      'accounts.0.reportedGain',
    ])
  })
  it('identifies complete basis and gain footer mismatches separately',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[
      ['COMP','Complete','1','100','100','100','0','0%','','Equity'],
      ['Positions Total','','','','100','90','10','','',''],
    ]})))
    const result=reconcileDraft(normalizeDraft(draft!))
    expect(result.accounts['account-1']!.status).toBe('BLOCKED')
    expect(result.draft.issues.filter(issue=>issue.code==='TOTAL_MISMATCH').map(issue=>issue.fieldPath)).toEqual([
      'accounts.0.reportedBasis',
      'accounts.0.reportedGain',
    ])
  })
})
