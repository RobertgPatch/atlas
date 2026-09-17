import { createHash, randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pool } from '../src/infra/db/client.js'
import { durableK1BatchRepository, durableK1Repository } from '../src/modules/k1/k1.repository.js'
import {
  getK1PartnershipImportContext,
  importPartnershipFromK1IfSafe,
} from '../src/modules/k1/matching/k1PartnershipImport.service.js'
import { buildK1MatchProposal } from '../src/modules/k1/matching/k1Matcher.service.js'
import { durableReviewRepository } from '../src/modules/review/review.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const durable = pool ? describe : describe.skip

durable('K-1 partnership import', () => {
  let fixture: TestFixture
  let entityId: string
  let batchId: string
  let itemId: string
  let documentId: string
  let k1DocumentId: string
  let attemptId: string

  beforeEach(async () => {
    fixture = await createTestFixture()
    entityId = randomUUID()
    batchId = randomUUID()
    itemId = randomUUID()
    documentId = randomUUID()
    k1DocumentId = randomUUID()
    attemptId = randomUUID()
    await pool!.query(
      `insert into entities (id, name, entity_type, tax_id, status)
       values ($1, 'Jackson Family Trust', 'TRUST', '987-65-4321', 'ACTIVE')`,
      [entityId],
    )
    await durableK1BatchRepository.create({
      id: batchId,
      createdByUserId: fixture.admin.id,
      entityScopeId: entityId,
      createPartnershipIfMissing: true,
      items: [{
        id: itemId,
        fileName: 'new-partnership.pdf',
        sizeBytes: 100,
        sha256: 'a'.repeat(64),
        objectKey: `test-import/${k1DocumentId}.pdf`,
      }],
    })
    await durableK1Repository.createAccepted({
      documentId,
      k1DocumentId,
      ingestionItemId: itemId,
      partnershipId: null,
      taxYear: null,
      partnershipNameRaw: null,
      fileName: 'new-partnership.pdf',
      storagePath: `test-import/${k1DocumentId}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      pageCount: 2,
      uploadedBy: fixture.admin.id,
    })
    await pool!.query(
      `insert into k1_extraction_attempts
         (id, k1_document_id, attempt_number, provider, client_token,
          mapping_schema_version, status, raw_result_key, raw_result_sha256,
          custom_output_status, started_at, completed_at)
       values ($1, $2, 1, 'AWS_BDA', $3, 'test-v1', 'SUCCEEDED',
         'test-import/result.json', $4, 'MATCH', now(), now())`,
      [
        attemptId,
        k1DocumentId,
        `k1-${createHash('sha256').update(k1DocumentId).digest('hex')}`,
        'b'.repeat(64),
      ],
    )
    await pool!.query(
      `update k1_documents
          set active_extraction_attempt_id = $2, extraction_schema_version = 'test-v1'
        where id = $1`,
      [k1DocumentId, attemptId],
    )
    const signals: Array<[string, unknown, string]> = [
      ['partner_tin', '987-65-4321', 'STRING'],
      ['partner_name', 'Jackson Family Trust', 'STRING'],
      ['partnership_ein', '87-2893106', 'STRING'],
      ['partnership_name', 'AC Bell Investors, LLC', 'STRING'],
      ['tax_year', 2025, 'NUMBER'],
    ]
    for (const [index, [key, value, kind]] of signals.entries()) {
      await pool!.query(
        `insert into k1_field_values
           (id, k1_document_id, extraction_attempt_id, canonical_path, occurrence_id,
            occurrence_index, field_name, label, review_section, is_required, value_kind,
            raw_value, raw_value_json, normalized_value, normalized_value_json,
            confidence_score, extraction_method, review_status, source_locations,
            destination_kind, destination_key, mapping_rule_version)
         values ($1, $2, $3, $4, $5, $6, $4, $7, 'entityMapping', false, $8,
           $9, $10::jsonb, $9, $10::jsonb, 0.99, 'AWS_BDA', 'PENDING', '[]'::jsonb,
           'MATCH_SIGNAL', $11, 'test-v1')`,
        [
          randomUUID(), k1DocumentId, attemptId, `match.${key}`, randomUUID(), index,
          key, kind, String(value), JSON.stringify(value), key,
        ],
      )
    }
    const partnershipAddress = 'AC Bell Investors, LLC\n1200 Market Street\nSuite 400\nSan Francisco, CA 94102'
    await pool!.query(
      `insert into k1_field_values
         (id, k1_document_id, extraction_attempt_id, canonical_path, occurrence_id,
          occurrence_index, field_name, label, review_section, is_required, value_kind,
          raw_value, raw_value_json, normalized_value, normalized_value_json,
          confidence_score, extraction_method, review_status, source_locations,
          destination_kind, destination_key, mapping_rule_version)
       values ($1, $2, $3, 'official.part_i_b_partnership_name_address', $4,
         5, 'official.part_i_b_partnership_name_address', 'Partnership name and address',
         'core', false, 'STRING', $5, $6::jsonb, $5, $6::jsonb, 0.99,
         'AWS_BDA', 'PENDING', '[]'::jsonb, 'OFFICIAL',
         'part_i_b_partnership_name_address', 'test-v1')`,
      [randomUUID(), k1DocumentId, attemptId, randomUUID(), partnershipAddress, JSON.stringify(partnershipAddress)],
    )
  })

  afterEach(async () => {
    await pool!.query('delete from audit_events where object_type = $1 and object_id in (select id from partnerships where entity_id = $2)', ['partnership', entityId])
    await pool!.query('delete from k1_match_candidates where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_issues where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_field_values where k1_document_id = $1', [k1DocumentId])
    await pool!.query('update k1_documents set active_extraction_attempt_id = null where id = $1', [k1DocumentId])
    await pool!.query('delete from k1_extraction_attempts where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_ingestion_items where id = $1', [itemId])
    await pool!.query('delete from k1_documents where id = $1', [k1DocumentId])
    await pool!.query('delete from documents where id = $1', [documentId])
    await pool!.query('delete from k1_ingestion_batches where id = $1', [batchId])
    await pool!.query('delete from partnerships where entity_id = $1', [entityId])
    await pool!.query('delete from entity_memberships where entity_id = $1', [entityId])
    await pool!.query('delete from entities where id = $1', [entityId])
    await fixture.app.close()
  })

  const proposal = async () => {
    const fields = await durableReviewRepository.listForActiveAttempt(k1DocumentId)
    const client = await pool!.connect()
    try {
      return await buildK1MatchProposal(client, fields, [entityId])
    } finally {
      client.release()
    }
  }

  it('creates one owner-specific partnership from reliable identity fields', async () => {
    const context = await getK1PartnershipImportContext(k1DocumentId)
    expect(context).toMatchObject({ entityScopeId: entityId, actorUserId: fixture.admin.id })
    const match = await proposal()
    expect(match.issueCodes).toEqual(['PARTNERSHIP_MATCH_NOT_FOUND'])

    const result = await importPartnershipFromK1IfSafe({
      k1DocumentId,
      proposal: match,
      context: context!,
    })
    expect(result).toMatchObject({ action: 'CREATED', entityScopeId: entityId })
    const created = await pool!.query<{
      id: string
      name: string
      ein: string
      asset_class: string
      address_line_1: string
      address_line_2: string
      address_city: string
      address_region: string
      address_postal_code: string
    }>(
      `select id, name, ein, asset_class, address_line_1, address_line_2,
              address_city, address_region, address_postal_code
         from partnerships where entity_id = $1`,
      [entityId],
    )
    expect(created.rows).toEqual([expect.objectContaining({
      name: 'AC Bell Investors, LLC',
      ein: '87-2893106',
      asset_class: 'Other',
      address_line_1: '1200 Market Street',
      address_line_2: 'Suite 400',
      address_city: 'San Francisco',
      address_region: 'CA',
      address_postal_code: '94102',
    })])
  })

  it('reuses a record created after matching instead of inserting a duplicate', async () => {
    const context = (await getK1PartnershipImportContext(k1DocumentId))!
    const match = await proposal()
    const existingId = randomUUID()
    await pool!.query(
      `insert into partnerships (id, aggregation_group_id, entity_id, name, ein, asset_class, status)
       values ($1, $1, $2, 'AC Bell Investors LLC', '87-2893106', 'Other', 'ACTIVE')`,
      [existingId, entityId],
    )

    const result = await importPartnershipFromK1IfSafe({
      k1DocumentId,
      proposal: match,
      context,
    })
    expect(result).toEqual({ action: 'EXISTING', entityScopeId: entityId, partnershipId: existingId })
    const count = await pool!.query<{ count: number }>(
      'select count(*)::int as count from partnerships where entity_id = $1',
      [entityId],
    )
    expect(count.rows[0]?.count).toBe(1)
  })

  it('uses the explicitly selected owner without requiring partner or tax-year fields', async () => {
    await pool!.query(
      `delete from k1_field_values
        where k1_document_id = $1
          and destination_key in ('partner_tin', 'partner_name', 'tax_year')`,
      [k1DocumentId],
    )
    const context = (await getK1PartnershipImportContext(k1DocumentId))!
    const match = await proposal()
    expect(match.issueCodes).toEqual(expect.arrayContaining([
      'PARTNER_MATCH_SIGNAL_MISSING',
      'ENTITY_MATCH_NOT_FOUND',
      'PARTNERSHIP_MATCH_NOT_FOUND',
      'TAX_YEAR_UNRESOLVED',
    ]))

    const result = await importPartnershipFromK1IfSafe({
      k1DocumentId,
      proposal: match,
      context,
    })
    expect(result).toMatchObject({ action: 'CREATED', entityScopeId: entityId })
  })
})
