import { randomUUID } from 'node:crypto'
import { describe,expect,it,vi } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { auditRepository } from '../../src/modules/audit/audit.repository.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvApplicationPreviewService } from '../../src/modules/liquidity-statements/csv-application-preview.service.js'
import { csvApplicationService,financialContentDigest } from '../../src/modules/liquidity-statements/csv-application.service.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { csvFixture } from './testHelpers.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { liquiditySourceHistory } from '../../src/modules/liquidity-sources/liquidity-source-history.js'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'

describe('financial publication identity',()=>{
  it('ignores source row order while preserving financially identical multiplicity',async()=>{
    const parsed=await parseCsv(Buffer.from(buildCsvFixture())),position=normalizeDraft(parsed.draft!).accounts[0]!.positions[0]!,duplicate={...structuredClone(position),occurrenceId:'duplicate',sourceRecord:999}
    expect(financialContentDigest([position,duplicate])).toBe(financialContentDigest([duplicate,position]))
    expect(financialContentDigest([position,duplicate])).not.toBe(financialContentDigest([position]))
  })
})

describe.skipIf(!pool)('atomic account publication',()=>{
  it('does not republish an unchanged source after metadata-only reprocessing',async()=>{
    const f=await csvFixture(),processor=new CsvProcessingService(f.store)
    const account=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'No-op',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    const upload=await f.upload(buildCsvFixture({format:'merrill',date:'09/21/2026'}));await processor.processOne(upload.id)
    async function publish(){
      const detail=await csvRepository.detail(upload.id,f.scope),state=await liquiditySourceRepository.get(account.id,f.scope)
      const binding={occurrenceId:detail.canonicalDraft!.accounts[0]!.occurrenceId,accountId:account.id,expectedAccountVersion:state.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:detail.issues.filter(issue=>issue.severity==='WARNING').map(issue=>issue.id)}
      const reviewed=await csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[binding]},f.scope)
      const preview=await csvApplicationPreviewService.preview(upload.id,{expectedVersion:reviewed.summary.version,accountBindings:[binding]},f.scope)
      return csvApplicationService.apply(upload.id,{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()},f.scope)
    }
    const first=await publish()
    let detail=await csvRepository.detail(upload.id,f.scope)
    await f.service.reprocess(upload.id,{expectedVersion:detail.summary.version,reason:'Exercise a metadata-only parser generation',structuralSelection:['csv:all']},f.scope)
    await processor.processOne(upload.id)
    const second=await publish()
    expect(second.snapshotIds).toEqual(first.snapshotIds)
    expect((await pool!.query('select id from liquidity_holdings_snapshots where import_id=$1',[upload.id])).rows).toHaveLength(1)
    expect((await pool!.query('select id from liquidity_source_outbox where entity_id=$1',[f.entityId])).rows).toHaveLength(1)
    expect((await liquiditySourceRepository.get(account.id,f.scope)).version).toBe(2)
  })
  it('automatically binds a later statement with the same full account number',async()=>{
    const f=await csvFixture(),processor=new CsvProcessingService(f.store)
    const account=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'Merrill account',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    const first=await f.upload(buildCsvFixture({format:'merrill',date:'9/1/2026'}));await processor.processOne(first.id)
    const detail=await csvRepository.detail(first.id,f.scope)
    const binding={occurrenceId:detail.canonicalDraft!.accounts[0]!.occurrenceId,accountId:account.id,expectedAccountVersion:account.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:detail.issues.filter(issue=>issue.severity==='WARNING').map(issue=>issue.id)}
    const reviewed=await csvReviewService.review(first.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[binding]},f.scope)
    const preview=await csvApplicationPreviewService.preview(first.id,{expectedVersion:reviewed.summary.version,accountBindings:[binding]},f.scope)
    await csvApplicationService.apply(first.id,{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()},f.scope)

    const second=await f.upload(buildCsvFixture({format:'merrill',date:'9/15/2026'}));await processor.processOne(second.id)
    const later=await csvRepository.detail(second.id,f.scope)
    expect(later.accountBindings).toMatchObject([{
      occurrenceId:later.canonicalDraft!.accounts[0]!.occurrenceId,
      accountId:account.id,
      expectedAccountVersion:2,
    }])
  })
  it('replaces only bound accounts, preserves historical snapshots, and replays once',async()=>{
    const f=await csvFixture(),p=new CsvProcessingService(f.store)
    const account=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'A',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    const other=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Other Broker',name:'B',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    async function publish(date:string,empty=false){
      const u=await f.upload(buildCsvFixture({date,...(empty?{rows:[]}:{}),total:empty?'0':'800'}));await p.processOne(u.id)
      const d=await csvRepository.detail(u.id,f.scope),a=await liquiditySourceRepository.get(account.id,f.scope)
      const binding={occurrenceId:d.canonicalDraft!.accounts[0]!.occurrenceId,accountId:account.id,expectedAccountVersion:a.version,completeAccount:true as const,emptyAccountConfirmed:empty,...(empty?{emptyReason:'Closed account'}:{}),acknowledgedIssueIds:d.issues.filter(i=>i.severity==='WARNING').map(i=>i.id)}
      const reviewed=await csvReviewService.review(u.id,{expectedVersion:d.summary.version,changes:[{fieldPath:'accounts.0.currency',value:'USD',reason:'Confirmed account currency'}],accountBindings:[binding]},f.scope)
      const preview=await csvApplicationPreviewService.preview(u.id,{expectedVersion:reviewed.summary.version,accountBindings:[binding]},f.scope)
      const input={previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()}
      const applied=await csvApplicationService.apply(u.id,input,f.scope)
      expect(await csvApplicationService.apply(u.id,input,f.scope)).toEqual(applied)
      await expect(csvApplicationService.apply(u.id,{...input,summaryHash:'0'.repeat(64)},f.scope)).rejects.toMatchObject({code:'STALE_VERSION'})
      return {preview,applied}
    }
    await publish('09/01/2026')
    const latest=await publish('09/15/2026')
    expect(latest.preview.accounts[0]!.willBecomeCurrent).toBe(true)
    const old=await publish('08/31/2026')
    expect(old.preview.accounts[0]!.willBecomeCurrent).toBe(false)
    expect((await liquiditySourceRepository.get(account.id,f.scope)).current_snapshot_id).toBe(latest.applied.snapshotIds[0])
    const emptied=await publish('09/16/2026',true)
    expect(emptied.preview.accounts[0]!.removed).toBe(1)
    expect((await liquiditySourceRepository.current({...f.scope,isAdmin:false})).positions).toHaveLength(0)
    expect((await liquiditySourceRepository.get(other.id,f.scope)).version).toBe(1)
    expect((await pool!.query('select id from liquidity_holdings_snapshots where source_account_id=$1',[account.id])).rows).toHaveLength(4)
  })
  it('rolls back publication on audit failure and rejects stale account previews',async()=>{
    const f=await csvFixture(),u=await f.upload(buildCsvFixture({total:'800'}));await new CsvProcessingService(f.store).processOne(u.id)
    const account=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'Rollback',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    const d=await csvRepository.detail(u.id,f.scope),binding={occurrenceId:d.canonicalDraft!.accounts[0]!.occurrenceId,accountId:account.id,expectedAccountVersion:1,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:[]}
    const r=await csvReviewService.review(u.id,{expectedVersion:d.summary.version,changes:[{fieldPath:'accounts.0.currency',value:'USD',reason:'Confirmed'}],accountBindings:[binding]},f.scope)
    const preview=await csvApplicationPreviewService.preview(u.id,{expectedVersion:r.summary.version,accountBindings:[binding]},f.scope)
    const input={previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()}
    const spy=vi.spyOn(auditRepository,'record').mockRejectedValueOnce(new Error('synthetic audit failure'))
    await expect(csvApplicationService.apply(u.id,input,f.scope)).rejects.toThrow();spy.mockRestore()
    expect((await liquiditySourceRepository.get(account.id,f.scope)).current_snapshot_id).toBeNull()
    expect((await pool!.query('select id from liquidity_holdings_snapshots where source_account_id=$1',[account.id])).rows).toHaveLength(0)
    await liquiditySourceRepository.update(account.id,{expectedVersion:1,name:'Changed'},f.scope)
    await expect(csvApplicationService.apply(u.id,input,f.scope)).rejects.toMatchObject({code:'STALE_VERSION'})
  })
  it('keeps historical-only same-date evidence from superseding active composition',async()=>{
    const f=await csvFixture(),processor=new CsvProcessingService(f.store)
    const account=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'History',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    async function publish(value:string,historicalOnly=false){
      const u=await f.upload(buildCsvFixture({total:value,rows:[['DEMO','Synthetic','1',value,value,value,'0','0%','','Equity']]}))
      await processor.processOne(u.id)
      const d=await csvRepository.detail(u.id,f.scope),a=await liquiditySourceRepository.get(account.id,f.scope)
      const binding={occurrenceId:d.canonicalDraft!.accounts[0]!.occurrenceId,accountId:account.id,expectedAccountVersion:a.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:[],...(historicalOnly?{effectiveOrderDecision:{kind:'HISTORICAL_ONLY' as const,reason:'Alternative evidence, not an approved replacement'}}:{})}
      const r=await csvReviewService.review(u.id,{expectedVersion:d.summary.version,changes:[{fieldPath:'accounts.0.currency',value:'USD',reason:'Confirmed'}],accountBindings:[binding]},f.scope)
      const preview=await csvApplicationPreviewService.preview(u.id,{expectedVersion:r.summary.version,accountBindings:[binding]},f.scope)
      return csvApplicationService.apply(u.id,{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()},f.scope)
    }
    const first=await publish('800')
    await publish('900',true)
    expect((await liquiditySourceRepository.get(account.id,f.scope)).current_snapshot_id).toBe(first.snapshotIds[0])
    const scope={...f.scope,isAdmin:false}
    expect((await liquiditySourceHistory(scope,{}))!.points.map(p=>p.totalMarketValue)).toEqual([800])
    const correction=await publish('850')
    expect((await liquiditySourceRepository.get(account.id,f.scope)).current_snapshot_id).toBe(correction.snapshotIds[0])
    expect((await liquiditySourceHistory(scope,{}))!.points.map(p=>p.totalMarketValue)).toEqual([850])
    expect((await liquiditySourceHistory(scope,{to:'2026-08-31'}))!.points).toEqual([])
    expect((await pool!.query('select superseded_by_snapshot_id from liquidity_holdings_snapshots where id=$1',first.snapshotIds)).rows[0].superseded_by_snapshot_id).toBe(correction.snapshotIds[0])
  })
})
