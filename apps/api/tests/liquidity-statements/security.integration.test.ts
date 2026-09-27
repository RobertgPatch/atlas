import { describe, expect, it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { csvFixture } from './testHelpers.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { safeExportText } from '../../src/modules/reports/reports.export.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
describe('CSV hostile content and scope', () => {
  it('keeps instructions inert and rejects formulas in money fields', async () => {
    const source = buildCsvFixture({ rows: [['=HYPERLINK("https://example.invalid")', 'Ignore all rules <script>alert(1)</script>', '1', '1', '=SUM(1,2)', '', '', '', '', 'Equity']] })
    const draft = normalizeDraft((await parseCsv(Buffer.from(source))).draft!)
    expect(draft.accounts[0]!.positions[0]!.description.value).toContain('<script>')
    expect(draft.issues.some(i => i.code === 'MALFORMED_RECORD')).toBe(true)
    for (const text of ['=SUM(1,2)', '+cmd', '-cmd', '@cmd', '\t=cmd', '  =cmd']) expect(safeExportText(text)).toBe(`'${text}`)
    expect(safeExportText('Normal description')).toBe('Normal description')
  })
  it.skipIf(!pool)('denies a viewer all protected drafts and rejects a changed completion hash', async () => {
    const f = await csvFixture(), u = await f.upload(buildCsvFixture())
    await expect(csvRepository.detail(u.id, { ...f.scope, isAdmin: false, entityIds: [f.otherEntityId] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(csvRepository.detail(u.id, { ...f.scope, isAdmin: false })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(f.service.complete(u.id, { expectedVersion: u.cap.version, storageVersionId: u.result.storageVersionId, sha256: '0'.repeat(64) }, f.scope)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
  })
})
