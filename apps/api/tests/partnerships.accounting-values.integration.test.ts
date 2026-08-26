import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipsRepository } from '../src/modules/partnerships/partnerships.repository.js'
import {
  createK1TrackerFixture,
  type K1TrackerFixture,
} from './helpers/k1TrackerFixture.js'

const durable = pool ? describe : describe.skip

durable('partnership directory K-1 amount formatting', () => {
  let fixture: K1TrackerFixture
  let documentId: string

  beforeEach(async () => {
    fixture = await createK1TrackerFixture()
    documentId = randomUUID()
  })

  afterEach(async () => {
    await fixture?.cleanup()
    if (pool) await pool.query('delete from documents where id = $1', [documentId])
  })

  it('lists a partnership when the latest K-1 distribution uses accounting parentheses', async () => {
    if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required for this test')

    const k1DocumentId = randomUUID()
    await pool.query(
      `insert into documents (id, document_type, file_name, storage_path)
       values ($1, 'K1', 'distribution.pdf', 'test/distribution.pdf')`,
      [documentId],
    )
    await pool.query(
      `insert into k1_documents (id, document_id, partnership_id, tax_year, processing_status)
       values ($1, $2, $3, 2025, 'NEEDS_REVIEW')`,
      [k1DocumentId, documentId, fixture.partnershipId],
    )
    await pool.query(
      `insert into k1_field_values (id, k1_document_id, field_name, raw_value, normalized_value)
       values ($1, $2, 'box_19_distributions', '(10.00)', '(10.00)')`,
      [randomUUID(), k1DocumentId],
    )

    const directory = await partnershipsRepository.listPartnerships(
      { page: 1, pageSize: 50, sort: 'name' },
      { isAdmin: true, entityIds: [] },
    )

    expect(directory.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fixture.partnershipId,
          latestK1Year: 2025,
          latestDistributionUsd: 10,
        }),
      ]),
    )
  })
})
