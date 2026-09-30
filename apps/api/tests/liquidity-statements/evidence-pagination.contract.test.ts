import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvFixture } from './testHelpers.js'

describe.skipIf(!pool)('bounded statement evidence pages',()=>{
  it('pages only records from the requested scoped import under record and byte ceilings',async()=>{
    const fixture=await csvFixture(),rows=Array.from({length:120},(_,i)=>[`S${i}`,'Synthetic','1','1','1','1','0','0%','','Equity'])
    const upload=await fixture.upload(buildCsvFixture({rows})),processor=new CsvProcessingService(fixture.store)
    await processor.processOne(upload.id)
    const detail=await csvRepository.detail(upload.id,fixture.scope)
    expect(detail.records).toHaveLength(100)
    expect(detail.recordsNextCursor).toBeTruthy()
    const second=await csvRepository.recordsPage(upload.id,fixture.scope,{cursor:detail.recordsNextCursor!,limit:100})
    expect(second.items.length).toBeGreaterThan(0)
    expect(Buffer.byteLength(JSON.stringify(second))).toBeLessThanOrEqual(1024*1024)
    expect(new Set([...detail.records,...second.items].map(record=>record.ordinal)).size).toBe(detail.records.length+second.items.length)
  })
  it('rejects a run belonging to a different import',async()=>{
    const fixture=await csvFixture(),one=await fixture.upload(buildCsvFixture()),two=await fixture.upload(buildCsvFixture({rows:[['TWO','Second','1','2','2','2','0','0%','','Equity']]}))
    const run=(await pool!.query('select active_run_id from liquidity_csv_imports where id=$1',[two.id])).rows[0].active_run_id
    await expect(csvRepository.recordsPage(one.id,fixture.scope,{runId:run,limit:10})).rejects.toMatchObject({code:'NOT_FOUND'})
  })
})
