import { createHash } from 'node:crypto'
import { describe, expect, it,vi } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { csvFixture } from './testHelpers.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { safeExportText } from '../../src/modules/reports/reports.export.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { readXlsxStatement } from '../../src/modules/liquidity-statements/readers/xlsx.reader.js'
import { buildXlsxFixture } from './adapter-conformance/fixture-builders.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
describe('CSV hostile content and scope', () => {
  it('keeps instructions inert and rejects formulas in money fields', async () => {
    const source = buildCsvFixture({ rows: [['=HYPERLINK("https://example.invalid")', 'Ignore all rules <script>alert(1)</script>', '1', '1', '=SUM(1,2)', '', '', '', '', 'Equity']] })
    const draft = normalizeDraft((await parseCsv(Buffer.from(source))).draft!)
    expect(draft.accounts[0]!.positions[0]!.description.value).toContain('<script>')
    expect(draft.issues.some(i => i.code === 'MALFORMED_RECORD')).toBe(true)
    for (const text of ['=SUM(1,2)', '+cmd', '-cmd', '@cmd', '\t=cmd', '  =cmd']) expect(safeExportText(text)).toBe(`'${text}`)
    expect(safeExportText('Normal description')).toBe('Normal description')
  })
  it('preserves formula text/caches without evaluation or outbound resolution',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    try{
      const bytes=buildXlsxFixture({sheets:[{name:'Holdings',rows:[{index:1,cells:[{address:'A1',kind:'formula',formula:'WEBSERVICE("https://example.invalid/private")',cached:{kind:'number',value:'12.34'}}]}]}]})
      const document=await readXlsxStatement(bytes,createHash('sha256').update(bytes).digest('hex'),buildLiquidityCsvConfig({LIQUIDITY_XLSX_ENABLED:'true'}))
      expect(document.records[0]!.cells[0]).toMatchObject({lexical:'12.34',formula:'WEBSERVICE("https://example.invalid/private")',formulaCache:'SCALAR'})
      expect(fetch).not.toHaveBeenCalled()
    }finally{vi.unstubAllGlobals()}
  })
  it.skipIf(!pool)('denies a viewer all protected drafts and rejects a changed completion hash', async () => {
    const f = await csvFixture(), u = await f.upload(buildCsvFixture())
    await expect(csvRepository.detail(u.id, { ...f.scope, isAdmin: false, entityIds: [f.otherEntityId] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(csvRepository.detail(u.id, { ...f.scope, isAdmin: false })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(f.service.complete(u.id, { expectedVersion: u.cap.version, storageVersionId: u.result.storageVersionId, sha256: '0'.repeat(64) }, f.scope)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
  })
  it.skipIf(!pool)('denies cross-import run evidence even within an otherwise authorized entity',async()=>{
    const f=await csvFixture(),first=await f.upload(buildCsvFixture()),second=await f.upload(buildCsvFixture({date:'09/02/2026'})),processor=new CsvProcessingService(f.store)
    await processor.processOne(first.id);await processor.processOne(second.id)
    const secondRun=(await pool!.query('select active_run_id from liquidity_csv_imports where id=$1',[second.id])).rows[0].active_run_id
    await expect(csvRepository.recordsPage(first.id,f.scope,{runId:secondRun,limit:10})).rejects.toMatchObject({code:'NOT_FOUND'})
  })
})
