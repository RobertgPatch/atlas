import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { csvFixture } from './testHelpers.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { CsvStatementService } from '../../src/modules/liquidity-statements/liquidity-statement.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { cp, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CsvObjectStore } from '../../src/modules/liquidity-statements/csv-object-store.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { config } from '../../src/config.js'
import { byteHash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvApplicationPreviewService } from '../../src/modules/liquidity-statements/csv-application-preview.service.js'
import { csvApplicationService } from '../../src/modules/liquidity-statements/csv-application.service.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { buildMorganStanleyHoldingsFixture } from './fixtures/morgan-stanley/holdings.fixture.js'
describe.skipIf(!pool)('durable CSV recovery', () => {
  it('recovers queued work with new service instances and protects successful evidence', async () => {
    const f=await csvFixture(),u=await f.upload(buildCsvFixture({total:'800'}))
    expect(await new CsvProcessingService(f.store).processOne(u.id)).toBe(true)
    const recovered=await new CsvStatementService(f.store).original(u.id,f.scope)
    expect(recovered).toEqual(u.body)
    const restoredRoot=await mkdtemp(join(tmpdir(),'atlas-csv-restored-original-'))
    await cp(f.root,restoredRoot,{recursive:true})
    const restoredStore=new CsvObjectStore(buildLiquidityCsvConfig({}),restoredRoot)
    expect(await new CsvStatementService(restoredStore).original(u.id,f.scope)).toEqual(u.body)
    const detail=await csvRepository.detail(u.id,f.scope)
    expect(detail.records.length).toBeGreaterThan(0)
    expect(detail.canonicalDraft?.accounts[0]?.positions[0]?.marketValue.value).toBe('800')
    await expect(pool!.query("update liquidity_csv_parse_runs set canonical_draft='{}' where import_id=$1",[u.id])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
    await expect(pool!.query("update liquidity_csv_imports set sha256=$2 where id=$1",[u.id,'0'.repeat(64)])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
  })

  it('restores both source kinds while preserving typed evidence, selections, approval history, and the current account pointer', async () => {
    const started = performance.now()
    const f = await csvFixture()
    const csv = await f.upload(buildCsvFixture({ format: 'merrill' }))
    const processor = new CsvProcessingService(f.store)
    expect(await processor.processOne(csv.id)).toBe(true)
    const target = await liquiditySourceRepository.create({ entityId: f.entityId, custodian: 'Synthetic Broker', name: 'Recovery target', currency: 'USD', cadence: 'ON_DEMAND' }, f.scope)
    let detail = await csvRepository.detail(csv.id, f.scope)
    const binding = {
      occurrenceId: detail.canonicalDraft!.accounts[0]!.occurrenceId,
      accountId: target.id,
      expectedAccountVersion: target.version,
      completeAccount: true as const,
      emptyAccountConfirmed: false,
      acknowledgedIssueIds: detail.issues.filter((issue) => issue.severity === 'WARNING').map((issue) => issue.id),
    }
    detail = await csvReviewService.review(csv.id, { expectedVersion: detail.summary.version, changes: [], accountBindings: [binding] }, f.scope)
    const preview = await csvApplicationPreviewService.preview(csv.id, { expectedVersion: detail.summary.version, accountBindings: [binding] }, f.scope)
    const applied = await csvApplicationService.apply(csv.id, { previewId: preview.id, expectedVersion: preview.expectedVersion, summaryHash: preview.summaryHash, idempotencyKey: randomUUID() }, f.scope)

    const xlsxEnabled = config.liquidityCsv.xlsxEnabled
    config.liquidityCsv.xlsxEnabled = true
    let xlsx: { id: string; body: Buffer }
    try {
      const body = buildMorganStanleyHoldingsFixture()
      const sha256 = byteHash(body)
      const capability = await f.service.upload({ entityId: f.entityId, custodian: 'Synthetic Broker', fileName: 'synthetic.xlsx', sizeBytes: body.length, sha256, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileKind: 'XLSX' }, f.scope)
      const token = new URL(capability.url, 'http://localhost').searchParams.get('token')!
      const stored = await f.service.putLocal(capability.statementId, token, body, f.scope)
      await f.service.complete(capability.statementId, { expectedVersion: capability.version, storageVersionId: stored.storageVersionId, sha256 }, f.scope)
      xlsx = { id: capability.statementId, body }
    } finally {
      config.liquidityCsv.xlsxEnabled = xlsxEnabled
    }

    const checkpoint = {
      detail: await csvRepository.detail(csv.id, f.scope),
      account: await liquiditySourceRepository.get(target.id, f.scope),
      records: (await pool!.query('select ordinal,role,raw_tokens,source_location from liquidity_csv_records where run_id=$1 order by ordinal', [detail.activeRunId])).rows,
      reviews: (await pool!.query('select revision,canonical_hash,bindings,excluded_accounts from liquidity_csv_reviews where import_id=$1 order by revision', [csv.id])).rows,
      applications: (await pool!.query('select status,summary_hash,snapshot_ids from liquidity_csv_applications where import_id=$1 order by created_at', [csv.id])).rows,
    }
    const restoredRoot = await mkdtemp(join(tmpdir(), 'atlas-statement-checkpoint-'))
    await cp(f.root, restoredRoot, { recursive: true })
    const restored = new CsvStatementService(new CsvObjectStore(buildLiquidityCsvConfig({}), restoredRoot))

    expect(await restored.original(csv.id, f.scope)).toEqual(csv.body)
    expect(await restored.original(xlsx!.id, f.scope)).toEqual(xlsx!.body)
    const after = await csvRepository.detail(csv.id, f.scope)
    const restoredAccount = await liquiditySourceRepository.get(target.id, f.scope)
    expect(after.storedCanonicalHash).toBe(checkpoint.detail.storedCanonicalHash)
    expect(after.records).toEqual(checkpoint.detail.records)
    expect(after.accountBindings).toEqual(checkpoint.detail.accountBindings)
    expect(after.priorApplications).toEqual(checkpoint.detail.priorApplications)
    expect(restoredAccount.current_snapshot_id).toBe(checkpoint.account.current_snapshot_id)
    expect(applied.snapshotIds).toContain(restoredAccount.current_snapshot_id)
    expect(checkpoint.records.length).toBeGreaterThan(0)
    expect(checkpoint.records.every((record) => record.source_location)).toBe(true)
    expect(checkpoint.reviews).toHaveLength(1)
    expect(checkpoint.applications).toHaveLength(1)
    expect(performance.now() - started).toBeLessThan(30_000)
  }, 30_000)
})
