import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvMappingService } from '../../src/modules/liquidity-statements/csv-mapping.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { csvFixture } from './testHelpers.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
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
