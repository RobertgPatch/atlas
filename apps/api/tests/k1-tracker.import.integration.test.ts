import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { K1TrackerError } from '../src/modules/k1-tracker/k1-tracker.types.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { createK1TrackerFixture, type K1TrackerFixture } from './helpers/k1TrackerFixture.js'

const durable = pool ? it : it.skip
const workbookBuffer = async () => { const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Basis'); sheet.getCell('B1').value = 2024; sheet.getCell('A2').value = 'line 1 - ordinary income'; sheet.getCell('B2').value = 125; sheet.getCell('A3').value = 'line 19 - distributions'; sheet.getCell('B3').value = 10; return Buffer.from(await workbook.xlsx.writeBuffer()) }
describe('K1 Tracker import commit', () => {
  let fixture: K1TrackerFixture
  beforeEach(async () => { fixture = await createK1TrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  durable('commits selected preview years atomically with cell provenance and idempotency', async () => {
    const preview = await k1TrackerRepository.previewImport(await workbookBuffer(), 'basis.xlsx', fixture.partnershipId, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    expect(preview.sheets[0]!.years[0]!.mappedFieldCount).toBe(2)
    const decision = [{ sheetName: 'Basis', taxYear: 2024, action: 'MERGE' as const }]
    const committed = await k1TrackerRepository.commitImport(preview.importBatchId, fixture.partnershipId, decision, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    expect(committed.importedTaxYears).toEqual([2024])
    const duplicate = await k1TrackerRepository.commitImport(preview.importBatchId, fixture.partnershipId, decision, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    expect(duplicate.importedTaxYears).toEqual([2024])
    const year = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    expect(year.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.sourceCell).toBe('B2')
  })
  durable('rolls back every selected year when a staged sheet/year decision is invalid', async () => {
    const preview = await k1TrackerRepository.previewImport(await workbookBuffer(), 'basis.xlsx', fixture.partnershipId, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await expect(k1TrackerRepository.commitImport(preview.importBatchId, fixture.partnershipId, [{ sheetName: 'Basis', taxYear: 2024, action: 'MERGE' }, { sheetName: 'Missing', taxYear: 2025, action: 'MERGE' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })).rejects.toMatchObject<K1TrackerError>({ code: 'IMPORT_NOT_FOUND' })
    await expect(k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })).rejects.toMatchObject<K1TrackerError>({ code: 'TRACKER_NOT_FOUND' })
  })
  durable('expires stale previews before a commit can mutate tracker data', async () => {
    const preview = await k1TrackerRepository.previewImport(await workbookBuffer(), 'basis.xlsx', fixture.partnershipId, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await pool!.query(`update k1_tracker_import_batches set expires_at = now() - interval '1 minute' where id = $1`, [preview.importBatchId])
    await expect(k1TrackerRepository.commitImport(preview.importBatchId, fixture.partnershipId, [{ sheetName: 'Basis', taxYear: 2024, action: 'MERGE' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })).rejects.toMatchObject<K1TrackerError>({ code: 'IMPORT_EXPIRED' })
    expect((await pool!.query<{ status: string }>('select status from k1_tracker_import_batches where id = $1', [preview.importBatchId])).rows[0]!.status).toBe('EXPIRED')
  })

  durable('preserves prior revisions for merge conflicts, replaces only by decision, and audits each committed batch', async () => {
    await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [{ fieldKey: 'box_1_ordinary_income_loss', amount: '100.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const firstPreview = await k1TrackerRepository.previewImport(await workbookBuffer(), 'basis.xlsx', fixture.partnershipId, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await k1TrackerRepository.commitImport(firstPreview.importBatchId, fixture.partnershipId, [{ sheetName: 'Basis', taxYear: 2024, action: 'MERGE' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const afterMerge = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    expect(afterMerge.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.amount).toBe('100.00')
    expect(afterMerge.sourceConflicts).toHaveLength(1)

    const replacePreview = await k1TrackerRepository.previewImport(await workbookBuffer(), 'basis.xlsx', fixture.partnershipId, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await k1TrackerRepository.commitImport(replacePreview.importBatchId, fixture.partnershipId, [{ sheetName: 'Basis', taxYear: 2024, action: 'REPLACE', expectedRevision: afterMerge.revision }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const replaced = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    expect(replaced.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.amount).toBe('125.00')
    expect(replaced.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.sourceType).toBe('WORKBOOK_IMPORT')
    const revisions = await pool!.query<{ active: boolean; count: string }>(`select is_active as active, count(*)::text as count from k1_tracker_value_revisions where tracker_year_id = (select id from k1_tracker_years where partnership_id = $1 and tax_year = 2024) and field_key = 'box_1_ordinary_income_loss' group by is_active`, [fixture.partnershipId])
    expect(revisions.rows.find((row) => row.active)?.count).toBe('1')
    expect(Number(revisions.rows.find((row) => !row.active)?.count)).toBeGreaterThan(1)
    const audit = await pool!.query<{ event_name: string }>('select event_name from audit_events where object_id = $1', [replacePreview.importBatchId])
    expect(audit.rows.map((row) => row.event_name)).toContain('k1_tracker.import_committed')
    const skipPreview = await k1TrackerRepository.previewImport(await workbookBuffer(), 'basis.xlsx', fixture.partnershipId, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const skipped = await k1TrackerRepository.commitImport(skipPreview.importBatchId, fixture.partnershipId, [{ sheetName: 'Basis', taxYear: 2024, action: 'SKIP' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    expect(skipped).toMatchObject({ importedTaxYears: [], skippedTaxYears: [2024] })
  })

  durable('imports the five populated CPA-workbook years with workbook provenance and exact ending basis', async () => {
    const preview = await k1TrackerRepository.previewImport(
      await readFile(new URL('./fixtures/k1-tracker-basis-template.xlsx', import.meta.url)),
      'k1-tracker-basis-template.xlsx',
      fixture.partnershipId,
      fixture.adminUserId,
      { isAdmin: true, entityIds: [] },
    )
    const sheet = preview.sheets[0]!
    expect(sheet.years.map((year) => year.state)).toEqual(['POPULATED', 'POPULATED', 'POPULATED', 'POPULATED', 'POPULATED', 'FORMULA_ONLY', 'FORMULA_ONLY', 'FORMULA_ONLY', 'FORMULA_ONLY', 'FORMULA_ONLY'])

    await k1TrackerRepository.commitImport(
      preview.importBatchId,
      fixture.partnershipId,
      sheet.years.slice(0, 5).map((year) => ({ sheetName: sheet.sheetName, taxYear: year.taxYear, action: 'MERGE' as const })),
      fixture.adminUserId,
      { isAdmin: true, entityIds: [] },
    )

    await Promise.all(['1932344.00', '1684727.00', '1376978.00', '1144214.00', '695823.00'].map(async (endingBasis, index) => {
      const year = await k1TrackerRepository.getYear(fixture.partnershipId, 2021 + index, { isAdmin: true, entityIds: [] })
      expect(year.calculation.basis.endingOutsideBasis).toBe(endingBasis)
      expect(year.status).not.toBe('RECONCILED')
      expect(year.calculation.summary.status).toBe(year.status)
      expect(year.values.some((value) => value.sourceType === 'WORKBOOK_IMPORT' && value.sourceSheet === sheet.sheetName && value.sourceCell != null)).toBe(true)
    }))
  })
})
