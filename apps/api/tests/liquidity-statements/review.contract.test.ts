import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { applyCorrections,csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvMappingService } from '../../src/modules/liquidity-statements/csv-mapping.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { csvFixture } from './testHelpers.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { reviewSchema } from '../../src/modules/liquidity-statements/liquidity-statement.zod.js'
import { issueId } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'

describe('review overlay contract',()=>{
  it('requires reasons and denies direct control/tolerance clearing paths',()=>{
    const binding={occurrenceId:'account-1',accountId:'11111111-1111-4111-8111-111111111111',expectedAccountVersion:1,completeAccount:true,emptyAccountConfirmed:false}
    expect(reviewSchema.safeParse({expectedVersion:1,accountBindings:[binding],changes:[{fieldPath:'accounts.0.positions.0.costBasis',value:'100',reason:'Verified source detail'}]}).success).toBe(true)
    expect(reviewSchema.safeParse({expectedVersion:1,accountBindings:[binding],changes:[{fieldPath:'controls.value.tolerance',value:'999',reason:'bypass'}]}).success).toBe(false)
    expect(reviewSchema.safeParse({expectedVersion:1,accountBindings:[binding],changes:[{fieldPath:'accounts.0.reportedTotal',value:null,reason:'   '}]}).success).toBe(false)
  })

  it('recalculates canonical financial fields after a reasoned category correction and changes warning identity when its evidence changes',async()=>{
    const {draft}=await parseCsv(Buffer.from(buildCsvFixture({rows:[['UNKNOWN','Cash-like value','', '1','125','','','','','Unknown']]})))
    const normalized=normalizeDraft(draft!)
    const corrected=normalizeDraft(applyCorrections(normalized,[{fieldPath:'accounts.0.positions.0.assetType',value:'cash',reason:'Confirmed cash classification'}]),new Date(),true)
    expect(corrected.accounts[0]!.positions[0]!.costBasis).toMatchObject({value:'125',origin:'DERIVED',derivation:{rule:'CASH_AT_PAR'}})
    const before={code:'PARTIAL_SOURCE_COVERAGE',severity:'WARNING',accountOccurrenceId:'account-1',fieldPath:'controls.one',sourceRecords:[2]} as const
    expect(issueId(before)).not.toBe(issueId({...before,sourceRecords:[3]}))
  })
})

describe.skipIf(!pool)('CSV immutable review and mapping',()=>{
  it('records corrections, recalculates dependents and refuses stale or cross-custodian bindings',async()=>{
    const f=await csvFixture(),u=await f.upload(buildCsvFixture({format:'merrill'})),processor=new CsvProcessingService(f.store)
    await processor.processOne(u.id)
    const account=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'Example',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    const d=await csvRepository.detail(u.id,f.scope)
    const bindings=[{occurrenceId:d.canonicalDraft!.accounts[0]!.occurrenceId,accountId:account.id,expectedAccountVersion:account.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:d.issues.filter(i=>i.severity==='WARNING').map(i=>i.id)}]
    const body={expectedVersion:d.summary.version,accountBindings:bindings,changes:[{fieldPath:'accounts.0.currency',value:'USD',reason:'Broker convention confirmed'}]}
    const reviewed=await csvReviewService.review(u.id,body,f.scope)
    expect(reviewed.canonicalDraft!.accounts[0]!.positions[0]!.costBasis.value).toBe('1000')
    expect(reviewed.summary.status).toBe('READY_TO_APPLY')
    expect(reviewed.reviewRevision).toBe(1)
    await expect(csvReviewService.review(u.id,body,f.scope)).rejects.toMatchObject({code:'STALE_VERSION'})
    const original=(await pool!.query('select canonical_draft from liquidity_csv_parse_runs where import_id=$1',[u.id])).rows[0].canonical_draft
    expect(original.accounts[0].currency).toMatchObject({value:'USD',origin:'DERIVED',reason:'DEFAULT_USD'})
    const other=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Other',name:'Example',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    await expect(csvReviewService.review(u.id,{...body,expectedVersion:reviewed.summary.version,accountBindings:[{...bindings[0]!,accountId:other.id}]},f.scope)).rejects.toMatchObject({code:'FORBIDDEN'})
  })
  it('maps unfamiliar headers through a new immutable run without executable expressions',async()=>{
    const f=await csvFixture(),u=await f.upload('Ticker,Description,Value,Basis\nDEMO,Example,800,1000'),p=new CsvProcessingService(f.store)
    await p.processOne(u.id)
    const d=await csvRepository.detail(u.id,f.scope)
    await csvMappingService.map(u.id,{expectedVersion:d.summary.version,profile:{name:'Synthetic map',delimiter:',',encoding:'UTF8',headerRecord:1,dateFormat:'YYYY-MM-DD',asOfDate:'2026-09-01',percentUnit:'PERCENT_POINTS',currency:'USD',columns:[{sourceIndex:0,sourceHeader:'Ticker',target:'symbol'},{sourceIndex:1,sourceHeader:'Description',target:'description'},{sourceIndex:2,sourceHeader:'Value',target:'marketValue'},{sourceIndex:3,sourceHeader:'Basis',target:'costBasis'}]}},f.scope)
    await p.processOne(u.id)
    const mapped=await csvRepository.detail(u.id,f.scope)
    expect(mapped.canonicalDraft!.adapter.id).toBe('mapped_csv_v1')
    expect(mapped.canonicalDraft!.accounts[0]!.positions[0]!.unrealizedGainLoss.value).toBe('-200')
    expect((await pool!.query('select id from liquidity_csv_parse_runs where import_id=$1',[u.id])).rows).toHaveLength(2)
  })
})
