import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvApplicationPreviewService } from '../../src/modules/liquidity-statements/csv-application-preview.service.js'
import { csvApplicationService } from '../../src/modules/liquidity-statements/csv-application.service.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { csvFixture } from './testHelpers.js'

const fixturePath=fileURLToPath(new URL('./fixtures/merrill/holdings.csv',import.meta.url))

describe.skipIf(!pool)('explicit account selection',()=>{
  it('requires every candidate exactly once, publishes only selected accounts, and rejects changed preview decisions',async()=>{
    const f=await csvFixture(),processor=new CsvProcessingService(f.store)
    const [targetA,targetB,targetEur]=await Promise.all([
      liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'Selected A',currency:'USD',cadence:'ON_DEMAND'},f.scope),
      liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'Excluded B',currency:'USD',cadence:'ON_DEMAND'},f.scope),
      liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name:'Currency conflict',currency:'EUR',cadence:'ON_DEMAND'},f.scope),
    ])
    const upload=await f.upload(await readFile(fixturePath,'utf8'));await processor.processOne(upload.id)
    let detail=await csvRepository.detail(upload.id,f.scope)
    expect(detail.canonicalDraft?.accounts).toHaveLength(2)
    const [sourceA,sourceB]=detail.canonicalDraft!.accounts
    expect(sourceA!.identifierFingerprints).not.toEqual(sourceB!.identifierFingerprints)
    const binding={occurrenceId:sourceA!.occurrenceId,accountId:targetA.id,expectedAccountVersion:targetA.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:detail.issues.filter(issue=>issue.severity==='WARNING'&&(issue.accountOccurrenceId===null||issue.accountOccurrenceId===sourceA!.occurrenceId)).map(issue=>issue.id)}
    await expect(csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[binding]},f.scope)).rejects.toMatchObject({code:'BLOCKING_ISSUES'})
    await expect(csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[binding,{...binding,occurrenceId:sourceB!.occurrenceId}],excludedAccounts:[]},f.scope)).rejects.toMatchObject({name:'ZodError'})
    await expect(csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[{...binding,accountId:targetEur.id,expectedAccountVersion:targetEur.version}],excludedAccounts:[{occurrenceId:sourceB!.occurrenceId,reason:'Explicitly excluded'}]},f.scope)).rejects.toMatchObject({code:'BLOCKING_ISSUES'})

    const excluded=[{occurrenceId:sourceB!.occurrenceId,reason:'This account will be applied from a separately reviewed run'}]
    detail=await csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[binding],excludedAccounts:excluded},f.scope)
    expect(detail.excludedAccounts).toEqual(excluded)
    await expect(csvApplicationPreviewService.preview(upload.id,{expectedVersion:detail.summary.version,accountBindings:[{...binding,occurrenceId:sourceB!.occurrenceId,accountId:targetB.id}],excludedAccounts:[{occurrenceId:sourceA!.occurrenceId,reason:'Changed after review'}]},f.scope)).rejects.toMatchObject({code:'STALE_VERSION'})

    const preview=await csvApplicationPreviewService.preview(upload.id,{expectedVersion:detail.summary.version,accountBindings:[binding],excludedAccounts:excluded},f.scope)
    expect(preview.accounts).toHaveLength(1)
    expect(preview.excludedAccounts).toEqual([{...excluded[0],displayName:'Synthetic Secondary',positionCount:2}])
    await csvApplicationService.apply(upload.id,{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()},f.scope)
    const [selected,untouched]=await Promise.all([liquiditySourceRepository.get(targetA.id,f.scope),liquiditySourceRepository.get(targetB.id,f.scope)])
    expect(selected.current_snapshot_id).not.toBeNull()
    expect(untouched.current_snapshot_id).toBeNull()
    expect(untouched.version).toBe(1)
    expect((await pool!.query('select source_account_id from liquidity_holdings_snapshots where import_id=$1',[upload.id])).rows).toEqual([{source_account_id:targetA.id}])

    detail=await csvRepository.detail(upload.id,f.scope)
    await f.service.reprocess(upload.id,{expectedVersion:detail.summary.version,reason:'Apply formerly excluded account from a new reviewed run'},f.scope)
    await processor.processOne(upload.id);detail=await csvRepository.detail(upload.id,f.scope)
    const bindingB={occurrenceId:sourceB!.occurrenceId,accountId:targetB.id,expectedAccountVersion:targetB.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:detail.issues.filter(issue=>issue.severity==='WARNING'&&(issue.accountOccurrenceId===null||issue.accountOccurrenceId===sourceB!.occurrenceId)).map(issue=>issue.id)}
    const excludeA=[{occurrenceId:sourceA!.occurrenceId,reason:'Already applied from the prior reviewed run'}]
    detail=await csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[bindingB],excludedAccounts:excludeA},f.scope)
    const secondPreview=await csvApplicationPreviewService.preview(upload.id,{expectedVersion:detail.summary.version,accountBindings:[bindingB],excludedAccounts:excludeA},f.scope)
    await csvApplicationService.apply(upload.id,{previewId:secondPreview.id,expectedVersion:secondPreview.expectedVersion,summaryHash:secondPreview.summaryHash,idempotencyKey:randomUUID()},f.scope)
    expect((await pool!.query('select source_account_id from liquidity_holdings_snapshots where import_id=$1 order by source_account_id',[upload.id])).rows.map(row=>row.source_account_id).sort()).toEqual([targetA.id,targetB.id].sort())
    expect((await pool!.query("select count(*)::int as count from liquidity_csv_applications where import_id=$1 and status='APPLIED'",[upload.id])).rows[0].count).toBe(2)
  })
})
