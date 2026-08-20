import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pool } from '../src/infra/db/client.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { createK1TrackerFixture, type K1TrackerFixture } from './helpers/k1TrackerFixture.js'

const durable = pool ? describe : describe.skip

durable('K1 Tracker explicit finalized-source boundary', () => {
  let fixture: K1TrackerFixture
  const scope = { isAdmin: true, entityIds: [] }
  beforeEach(async () => { fixture = await createK1TrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })

  const seedLegacyFinalizedK1 = async (amount: string) => {
    const documentId = randomUUID()
    const k1DocumentId = randomUUID()
    const fieldId = randomUUID()
    await pool!.query(
      `insert into documents (id, document_type, file_name, storage_path, uploaded_by)
       values ($1, 'K1', 'legacy.pdf', 'legacy.pdf', $2)`,
      [documentId, fixture.adminUserId],
    )
    await pool!.query(
      `insert into k1_documents
         (id, document_id, partnership_id, tax_year, processing_status, finalized_at)
       values ($1, $2, $3, 2024, 'FINALIZED', now())`,
      [k1DocumentId, documentId, fixture.partnershipId],
    )
    await pool!.query(
      `insert into k1_field_values
         (id, k1_document_id, field_name, normalized_value, review_status)
       values ($1, $2, 'box_1_ordinary_income', $3, 'FINALIZED')`,
      [fieldId, k1DocumentId, amount],
    )
    return { k1DocumentId, fieldId }
  }

  it('does not create a tracker year during a GET for a legacy finalized document', async () => {
    await seedLegacyFinalizedK1('125.00')
    const detail = await k1TrackerRepository.getPartnership(fixture.partnershipId, scope)
    expect(detail.years).toEqual([])
    const count = await pool!.query<{ count: string }>(
      'select count(*)::text as count from k1_tracker_years where partnership_id = $1',
      [fixture.partnershipId],
    )
    expect(count.rows[0].count).toBe('0')
  })

  it('does not insert conflict candidates or change revisions while reading a populated year', async () => {
    const created = await k1TrackerRepository.createYear(
      fixture.partnershipId, 2024,
      [{ fieldKey: 'box_1_ordinary_income_loss', amount: '100.00', sourceType: 'MANUAL_ENTRY' }],
      fixture.adminUserId, scope,
    )
    const legacy = await seedLegacyFinalizedK1('75.00')
    const first = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, scope)
    const second = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, scope)
    expect(first.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')?.amount).toBe('100.00')
    expect(second.revision).toBe(created.revision)
    const imported = await pool!.query<{ count: string }>(
      `select count(*)::text as count from k1_tracker_value_revisions
        where source_k1_document_id = $1 or source_k1_field_value_id = $2`,
      [legacy.k1DocumentId, legacy.fieldId],
    )
    expect(imported.rows[0].count).toBe('0')
  })

  it('keeps repeated partnership/year reads byte-for-byte side-effect free', async () => {
    await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [], fixture.adminUserId, scope)
    const before = await pool!.query<{ revisions: string; signoffs: string }>(
      `select
         (select count(*)::text from k1_tracker_value_revisions v join k1_tracker_years y on y.id = v.tracker_year_id where y.partnership_id = $1) as revisions,
         (select count(*)::text from k1_tracker_signoffs s join k1_tracker_years y on y.id = s.tracker_year_id where y.partnership_id = $1) as signoffs`,
      [fixture.partnershipId],
    )
    await k1TrackerRepository.getPartnership(fixture.partnershipId, scope)
    await k1TrackerRepository.getYear(fixture.partnershipId, 2024, scope)
    const after = await pool!.query<{ revisions: string; signoffs: string }>(
      `select
         (select count(*)::text from k1_tracker_value_revisions v join k1_tracker_years y on y.id = v.tracker_year_id where y.partnership_id = $1) as revisions,
         (select count(*)::text from k1_tracker_signoffs s join k1_tracker_years y on y.id = s.tracker_year_id where y.partnership_id = $1) as signoffs`,
      [fixture.partnershipId],
    )
    expect(after.rows[0]).toEqual(before.rows[0])
  })
})
