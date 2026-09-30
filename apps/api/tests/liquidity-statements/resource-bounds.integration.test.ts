import { describe, expect, it } from 'vitest'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
import { reconcileDraft } from '../../src/modules/liquidity-statements/csv/reconcile.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvFixture } from './testHelpers.js'
import { pool } from '../../src/infra/db/client.js'
import { config } from '../../src/config.js'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { byteHash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
async function record(name: string, evidence: Record<string, number | string>) {
  if (process.env.ATLAS_CSV_BENCHMARK_DIR) await writeFile(join(process.env.ATLAS_CSV_BENCHMARK_DIR, `${name}.json`), JSON.stringify(evidence, null, 2))
}

const fixture = (count: number) => Buffer.from(buildCsvFixture({ rows: Array.from({ length: count }, (_, n) => [`TEST${n}`, 'Synthetic', '10', '80', '800', '1000', '-200', '-20%', '', 'Equity']) }))
describe('CSV resource bounds', () => {
  it('measures normal files and the 25,000 holding boundary', async () => {
    const timings: number[] = []
    for (let i = 0; i < 5; i++) {
      const started = performance.now(), result = await parseCsv(fixture(2000))
      reconcileDraft(normalizeDraft(result.draft!,new Date(),true),true); timings.push(performance.now() - started)
    }
    const bytes = fixture(25000), memoryBefore = process.memoryUsage().rss, started = performance.now()
    const result = reconcileDraft(normalizeDraft((await parseCsv(bytes,{maxRows:25000})).draft!,new Date(),true),true)
    const elapsed = performance.now() - started
    expect(result.draft.accounts[0]!.positions).toHaveLength(25000)
    expect(Math.max(...timings)).toBeLessThan(5000)
    expect(elapsed).toBeLessThan(30000)
    await record('parse-benchmark', { benchmark: 'liquidity_csv_synthetic', normalP95Ms: Math.ceil(Math.max(...timings)), maximumRowsMs: Math.ceil(elapsed), maximumRowsBytes: bytes.length, rssGrowthBytes: process.memoryUsage().rss - memoryBefore, rssBytes: process.memoryUsage().rss })
  }, 30000)
  it('rejects excessive bytes, holdings, fields and malformed quotes without skipping records', async () => {
    await expect(parseCsv(Buffer.alloc(10485761, 65))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(parseCsv(fixture(25001))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(parseCsv(fixture(5001))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(parseCsv(Buffer.from(`Header\n${'a'.repeat(16385)}`))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(parseCsv(Buffer.from('Header\n"unterminated'))).rejects.toMatchObject({ code: 'MALFORMED_CSV' })
  })
  it.skipIf(!pool)('persists a normal file while a separate database read remains responsive', async () => {
    const count=process.env.ATLAS_CSV_BENCHMARK_MAXIMUM==='true'?25000:process.env.ATLAS_CSV_BENCHMARK_ROWS==='5000'?5000:2000
    const priorLimit=config.liquidityCsv.maxRows
    // Explicit opt-in diagnostic for a larger API allocation; deployment stays 5k.
    if(count===25000)config.liquidityCsv.maxRows=25000
    try {
    const f = await csvFixture(), body = fixture(count), sha256 = byteHash(body)
    const capabilityStarted = performance.now()
    const capability = await f.service.upload({ entityId: f.entityId, custodian: 'Synthetic Broker', fileName: 'synthetic.csv', sizeBytes: body.length, sha256, contentType: 'text/csv', fileKind: 'CSV' }, f.scope)
    const capabilityMs = performance.now() - capabilityStarted
    const token = new URL(capability.url, 'http://localhost').searchParams.get('token')!
    const stored = await f.service.putLocal(capability.statementId, token, body, f.scope)
    await f.service.complete(capability.statementId, { expectedVersion: capability.version, storageVersionId: stored.storageVersionId, sha256 }, f.scope)
    const upload = { id: capability.statementId }
    const processor = new CsvProcessingService(f.store)
    const started = performance.now()
    const parsing = processor.processOne(upload.id)
    const readStarted = performance.now(); await pool!.query('select 1'); const readMs = performance.now() - readStarted
    expect(await parsing).toBe(true)
    await record(count===25000?'maximum-persist-benchmark':count===5000?'deployment-limit-persist-benchmark':'persist-benchmark', { benchmark: 'liquidity_csv_persist', rows: count, uploadCapabilityMs: Math.ceil(capabilityMs), elapsedMs: Math.ceil(performance.now() - started), concurrentReadMs: Math.ceil(readMs), rssBytes:process.memoryUsage().rss })
    expect(readMs).toBeLessThan(count===25000?2000:1000)
    } finally {config.liquidityCsv.maxRows=priorLimit}
  }, 30000)
  it.skipIf(!pool)('fails a stable malformed source once without partial evidence or retry looping',async()=>{
    const f=await csvFixture(),upload=await f.upload('Header\n"unterminated'),processor=new CsvProcessingService(f.store)
    expect(await processor.processOne(upload.id)).toBe(false)
    const state=(await pool!.query('select status,safe_error_code,active_run_id from liquidity_csv_imports where id=$1',[upload.id])).rows[0]
    expect(state).toMatchObject({status:'FAILED',safe_error_code:'MALFORMED_CSV'})
    expect(await processor.processOne(upload.id)).toBe(false)
    expect((await pool!.query('select count(*)::int as count from liquidity_csv_parse_runs where import_id=$1',[upload.id])).rows[0].count).toBe(1)
    expect((await pool!.query('select count(*)::int as count from liquidity_csv_records where run_id=$1',[state.active_run_id])).rows[0].count).toBe(0)
  })
})
