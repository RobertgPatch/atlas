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
})
