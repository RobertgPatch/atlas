import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { byteHash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvApplicationPreviewService } from '../../src/modules/liquidity-statements/csv-application-preview.service.js'
import { csvApplicationService } from '../../src/modules/liquidity-statements/csv-application.service.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvFixture } from './testHelpers.js'

describe.skipIf(!pool)('explicit immutable-source reprocessing', () => {
  it('creates a pinned new run while preserving the original run and active-review history', async () => {
    const fixture = await csvFixture()
    const upload = await fixture.upload(buildCsvFixture({ format: 'merrill' }))
    const processor = new CsvProcessingService(fixture.store)
    await processor.processOne(upload.id)
    const before = await csvRepository.detail(upload.id, fixture.scope)
    const oldRun = (await pool!.query('select id,canonical_hash from liquidity_csv_parse_runs where import_id=$1', [upload.id])).rows[0]

    const summary = await fixture.service.reprocess(upload.id, {
      expectedVersion: before.summary.version,
      reason: 'Apply the current versioned statement rules',
      structuralSelection: ['csv:all'],
    }, fixture.scope)

    expect(summary.status).toBe('QUEUED')
    const state = (await pool!.query('select active_run_id,active_review_id,review_revision from liquidity_csv_imports where id=$1', [upload.id])).rows[0]
    expect(state.active_review_id).toBeNull()
    const runs = (await pool!.query('select id,attempt_no,status,recipe,canonical_hash from liquidity_csv_parse_runs where import_id=$1 order by attempt_no', [upload.id])).rows
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({ id: oldRun.id, status: 'SUCCEEDED', canonical_hash: oldRun.canonical_hash })
    expect(runs[1]).toMatchObject({ id: state.active_run_id, status: 'QUEUED', recipe: expect.objectContaining({ schemaVersion: '3.0.0', structuralSelection: ['csv:all'] }) })
  })

  it('refuses reprocessing while the active generation owns a live lease', async () => {
    const fixture = await csvFixture()
    const upload = await fixture.upload(buildCsvFixture())
    const current = await csvRepository.detail(upload.id, fixture.scope)
    await pool!.query("update liquidity_csv_parse_runs set status='PARSING',lease_owner=$2,lease_expires_at=now()+interval '5 minutes' where id=(select active_run_id from liquidity_csv_imports where id=$1)", [upload.id,randomUUID()])
    await pool!.query("update liquidity_csv_imports set status='PARSING' where id=$1", [upload.id])
    await expect(fixture.service.reprocess(upload.id, {
      expectedVersion: current.summary.version,
      reason: 'Must not supersede live work',
    }, fixture.scope)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('abandons a correction back to the preserved approval and reopens identical retained source bytes',async()=>{
    const fixture=await csvFixture(),body=Buffer.from(buildCsvFixture({format:'merrill'})),upload=await fixture.upload(body.toString('utf8')),processor=new CsvProcessingService(fixture.store)
    await processor.processOne(upload.id)
    const target=await liquiditySourceRepository.create({entityId:fixture.entityId,custodian:'Synthetic Broker',name:'History target',currency:'USD',cadence:'ON_DEMAND'},fixture.scope)
    let detail=await csvRepository.detail(upload.id,fixture.scope)
    const binding={occurrenceId:detail.canonicalDraft!.accounts[0]!.occurrenceId,accountId:target.id,expectedAccountVersion:target.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:detail.issues.filter(issue=>issue.severity==='WARNING').map(issue=>issue.id)}
    detail=await csvReviewService.review(upload.id,{expectedVersion:detail.summary.version,changes:[],accountBindings:[binding]},fixture.scope)
    const preview=await csvApplicationPreviewService.preview(upload.id,{expectedVersion:detail.summary.version,accountBindings:[binding]},fixture.scope)
    await csvApplicationService.apply(upload.id,{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()},fixture.scope)
    const applied=await csvRepository.detail(upload.id,fixture.scope),appliedRun=applied.activeRunId,storedHash=applied.storedCanonicalHash
    expect(applied.priorApplications?.filter(application=>application.status==='APPLIED')).toHaveLength(1)

    await fixture.service.reprocess(upload.id,{expectedVersion:applied.summary.version,reason:'Test a new correction without rewriting approval'},fixture.scope)
    await processor.processOne(upload.id);const correction=await csvRepository.detail(upload.id,fixture.scope)
    expect(correction.activeRunId).not.toBe(appliedRun)
    expect(correction.priorApplications?.filter(application=>application.status==='APPLIED')).toHaveLength(1)
    await csvRepository.cancel(upload.id,correction.summary.version,fixture.scope)
    const restored=await csvRepository.detail(upload.id,fixture.scope)
    expect(restored.summary.status).toBe('APPLIED');expect(restored.activeRunId).toBe(appliedRun);expect(restored.storedCanonicalHash).toBe(storedHash)

    const duplicate=await fixture.service.upload({entityId:fixture.entityId,custodian:'Synthetic Broker',fileName:'same-source.csv',sizeBytes:body.length,sha256:byteHash(body),contentType:'text/csv',fileKind:'CSV'},fixture.scope)
    expect(duplicate).toMatchObject({statementId:upload.id,duplicate:true})
    expect((await pool!.query('select count(*)::int as count from liquidity_csv_imports where entity_id=$1 and sha256=$2',[fixture.entityId,byteHash(body)])).rows[0].count).toBe(1)
  })
})
