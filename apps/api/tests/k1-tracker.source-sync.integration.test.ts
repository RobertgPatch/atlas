import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { pool } from '../src/infra/db/client.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { createK1TrackerFixture, type K1TrackerFixture } from './helpers/k1TrackerFixture.js'

const durable = pool ? it : it.skip
describe('K1 Tracker finalized-source sync', () => {
  let fixture: K1TrackerFixture
  beforeEach(async () => { fixture = await createK1TrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  durable('backfills a missing year from durable finalized K-1 field values', async () => {
    const documentId = randomUUID(); const k1DocumentId = randomUUID()
    await pool!.query(`insert into documents (id, document_type, file_name, storage_path, uploaded_by) values ($1, 'K1', 'fixture.pdf', 'fixture.pdf', $2)`, [documentId, fixture.adminUserId])
    await pool!.query(`insert into k1_documents (id, document_id, partnership_id, tax_year, processing_status, finalized_at) values ($1, $2, $3, 2024, 'FINALIZED', now())`, [k1DocumentId, documentId, fixture.partnershipId])
    await pool!.query(`insert into k1_field_values (id, k1_document_id, field_name, raw_value, normalized_value, review_status) values ($1,$2,'box_1_ordinary_income','125.00','125.00','FINALIZED'), ($3,$2,'box_19_distributions','(10.00)','(10.00)','FINALIZED')`, [randomUUID(), k1DocumentId, randomUUID()])
    const detail = await k1TrackerRepository.getPartnership(fixture.partnershipId, { isAdmin: true, entityIds: [] })
    expect(detail.years.map((year) => year.taxYear)).toContain(2024)
    const year = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    expect(year.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.sourceType).toBe('FINALIZED_K1')
    expect(year.values.find((value) => value.fieldKey === 'box_19_distributions')?.amount).toBe('10.00')
    const projection = await pool!.query<{ source_has_k1: boolean; source_has_manual_input: boolean; finalized_from_k1_document_id: string | null }>('select source_has_k1, source_has_manual_input, finalized_from_k1_document_id from partnership_annual_activity where partnership_id = $1 and tax_year = 2024', [fixture.partnershipId])
    expect(projection.rows[0]).toMatchObject({ source_has_k1: true, source_has_manual_input: false, finalized_from_k1_document_id: k1DocumentId })
  })

  durable('records a differing finalized source as a conflict without overwriting the active value', async () => {
    await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [{ fieldKey: 'box_1_ordinary_income_loss', amount: '100.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const documentId = randomUUID(); const k1DocumentId = randomUUID()
    await pool!.query(`insert into documents (id, document_type, file_name, storage_path, uploaded_by) values ($1, 'K1', 'conflict.pdf', 'conflict.pdf', $2)`, [documentId, fixture.adminUserId])
    await pool!.query(`insert into k1_documents (id, document_id, partnership_id, tax_year, processing_status, finalized_at) values ($1, $2, $3, 2024, 'FINALIZED', now())`, [k1DocumentId, documentId, fixture.partnershipId])
    await pool!.query(`insert into k1_field_values (id, k1_document_id, field_name, normalized_value, review_status) values ($1,$2,'box_1_ordinary_income','75.00','FINALIZED')`, [randomUUID(), k1DocumentId])
    await k1TrackerRepository.getPartnership(fixture.partnershipId, { isAdmin: true, entityIds: [] })
    const detail = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    expect(detail.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.amount).toBe('100.00')
    expect(detail.sourceConflicts).toHaveLength(1)
    const resolved = await k1TrackerRepository.updateYear(fixture.partnershipId, 2024, detail.revision, [{ fieldKey: 'box_1_ordinary_income_loss', amount: '75.00', sourceType: 'MANUAL_OVERRIDE', overrideReason: 'Use finalized amendment.' }], fixture.adminUserId, { isAdmin: true, entityIds: [] })
    expect(resolved.year.sourceConflicts).toHaveLength(0)
  })

  durable('selects the latest amended finalized source once and does not duplicate it on later loads', async () => {
    const originalDocumentId = randomUUID(); const originalK1DocumentId = randomUUID()
    await pool!.query(`insert into documents (id, document_type, file_name, storage_path, uploaded_by) values ($1, 'K1', 'original.pdf', 'original.pdf', $2)`, [originalDocumentId, fixture.adminUserId])
    await pool!.query(`insert into k1_documents (id, document_id, partnership_id, tax_year, processing_status, finalized_at) values ($1, $2, $3, 2024, 'FINALIZED', now())`, [originalK1DocumentId, originalDocumentId, fixture.partnershipId])
    await pool!.query(`insert into k1_field_values (id, k1_document_id, field_name, normalized_value, review_status) values ($1,$2,'box_1_ordinary_income','100.00','FINALIZED')`, [randomUUID(), originalK1DocumentId])
    await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })

    const amendedDocumentId = randomUUID(); const amendedK1DocumentId = randomUUID(); const amendedFieldId = randomUUID()
    await pool!.query(`insert into documents (id, document_type, file_name, storage_path, uploaded_by) values ($1, 'K1', 'amended.pdf', 'amended.pdf', $2)`, [amendedDocumentId, fixture.adminUserId])
    await pool!.query(`insert into k1_documents (id, document_id, partnership_id, tax_year, processing_status, is_amended, finalized_at) values ($1, $2, $3, 2024, 'FINALIZED', true, now())`, [amendedK1DocumentId, amendedDocumentId, fixture.partnershipId])
    await pool!.query(`insert into k1_field_values (id, k1_document_id, field_name, normalized_value, review_status) values ($1,$2,'box_1_ordinary_income','75.00','FINALIZED')`, [amendedFieldId, amendedK1DocumentId])

    const firstLoad = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    expect(firstLoad.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.amount).toBe('100.00')
    expect(firstLoad.sourceConflicts).toHaveLength(1)
    const before = await pool!.query<{ count: string }>(`select count(*)::text as count from k1_tracker_value_revisions where source_k1_field_value_id = $1`, [amendedFieldId])
    await k1TrackerRepository.getYear(fixture.partnershipId, 2024, { isAdmin: true, entityIds: [] })
    const after = await pool!.query<{ count: string }>(`select count(*)::text as count from k1_tracker_value_revisions where source_k1_field_value_id = $1`, [amendedFieldId])
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count)
  })
})
