import { createHash, randomUUID } from 'node:crypto'

import { pool } from '../../src/infra/db/client.js'
import { durableK1BatchRepository, durableK1Repository } from '../../src/modules/k1/k1.repository.js'
import { getK1ObjectStore } from '../../src/modules/k1/storage/index.js'
import { createTestFixture, type TestFixture } from './testApp.js'

export interface DurableK1ReviewFixture extends TestFixture {
  entityId: string
  partnershipId: string
  batchId: string
  itemId: string
  documentId: string
  k1DocumentId: string
  activeAttemptId: string
  inactiveAttemptId: string
  moneyFieldId: string
  codeRowFieldId: string
  issueId: string
  objectKey: string
  cleanup(): Promise<void>
}

export const createDurableK1ReviewFixture = async (): Promise<DurableK1ReviewFixture> => {
  if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required')
  const base = await createTestFixture()
  const entityId = randomUUID()
  const partnershipId = randomUUID()
  const batchId = randomUUID()
  const itemId = randomUUID()
  const documentId = randomUUID()
  const k1DocumentId = randomUUID()
  const inactiveAttemptId = randomUUID()
  const activeAttemptId = randomUUID()
  const moneyFieldId = randomUUID()
  const codeRowFieldId = randomUUID()
  const issueId = randomUUID()
  const objectKey = `test-review/${k1DocumentId}.pdf`
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n')
  const sha256 = createHash('sha256').update(pdf).digest('hex')

  await pool.query(`insert into entities (id, name, entity_type, tax_id, status) values ($1, 'Review Trust', 'TRUST', '987-65-4321', 'ACTIVE')`, [entityId])
  await pool.query(`insert into partnerships (id, entity_id, name, ein, status) values ($1, $2, 'Review Fund LP', '12-3456789', 'ACTIVE')`, [partnershipId, entityId])
  await pool.query(
    `insert into entity_memberships (id, user_id, entity_id, created_by)
     values ($1, $2, $3, $4) on conflict (user_id, entity_id) do nothing`,
    [randomUUID(), base.user.id, entityId, base.admin.id],
  )
  await getK1ObjectStore().put({ key: objectKey, body: pdf, contentType: 'application/pdf', sizeBytes: pdf.length, checksumSha256: sha256 })
  await durableK1BatchRepository.create({
    id: batchId, createdByUserId: base.admin.id, entityScopeId: entityId,
    items: [{ id: itemId, fileName: 'review-k1.pdf', sizeBytes: pdf.length, sha256, objectKey }],
  })
  await durableK1Repository.createAccepted({
    documentId, k1DocumentId, ingestionItemId: itemId, partnershipId, taxYear: 2025,
    partnershipNameRaw: 'Review Fund LP', fileName: 'review-k1.pdf', storagePath: objectKey,
    mimeType: 'application/pdf', sizeBytes: pdf.length, sha256, pageCount: 2,
    uploadedBy: base.admin.id,
  })
  const tokenA = `k1-${createHash('sha256').update(`${k1DocumentId}:inactive`).digest('hex')}`
  const tokenB = `k1-${createHash('sha256').update(`${k1DocumentId}:active`).digest('hex')}`
  await pool.query(
    `insert into k1_extraction_attempts
       (id, k1_document_id, attempt_number, provider, client_token, mapping_schema_version,
        status, raw_result_key, raw_result_sha256, custom_output_status, started_at, completed_at)
     values
       ($1, $3, 1, 'STUB', $4, 'test-v1', 'SUPERSEDED', 'raw/old.json', $6, 'MATCH', now(), now()),
       ($2, $3, 2, 'STUB', $5, 'test-v1', 'SUCCEEDED', 'raw/new.json', $6, 'MATCH', now(), now())`,
    [inactiveAttemptId, activeAttemptId, k1DocumentId, tokenA, tokenB, 'a'.repeat(64)],
  )
  await pool.query(
    `update k1_documents
        set active_extraction_attempt_id = $2, extraction_schema_version = 'test-v1',
            processing_status = 'NEEDS_REVIEW', match_status = 'MATCHED', version = 3
      where id = $1`,
    [k1DocumentId, activeAttemptId],
  )
  await pool.query(
    `update k1_ingestion_items set status = 'NEEDS_REVIEW', updated_at = now() where id = $1`,
    [itemId],
  )
  await pool.query(
    `insert into k1_field_values
       (id, k1_document_id, extraction_attempt_id, canonical_path, occurrence_id,
        occurrence_index, field_name, label, review_section, is_required, value_kind,
        raw_value, raw_value_json, normalized_value, normalized_value_json,
        confidence_score, extraction_method, review_status, source_locations,
        destination_kind, destination_key, mapping_rule_version)
     values
       ($1, $3, $4, 'calculation.box_1_ordinary_income_loss', $5, 0,
        'calculation.box_1_ordinary_income_loss', 'Box 1 ordinary income', 'core', true,
        'MONEY', '1250.50', '1250.50'::jsonb, '1250.5', '1250.5'::jsonb,
        0.72, 'STUB', 'PENDING', '[{"page":1,"bbox":[0.1,0.2,0.4,0.3]}]'::jsonb,
        'CALCULATION', 'box_1_ordinary_income_loss', 'test-v1'),
       ($2, $3, $4, 'official.box_13_entries', $6, 1,
        'official.box_13_entries', 'Box 13 coded row', 'core', false,
        'CODE_ROW', '{"code":"W","value":45}', '{"code":"W","value":45}'::jsonb,
        '{"code":"W","value":45}', '{"code":"W","value":45}'::jsonb,
        0.98, 'STUB', 'ACCEPTED', '[{"page":2,"bbox":[0.2,0.3,0.5,0.4]}]'::jsonb,
        'OFFICIAL', 'box_13_entries', 'test-v1')`,
    [moneyFieldId, codeRowFieldId, k1DocumentId, activeAttemptId, randomUUID(), randomUUID()],
  )
  await pool.query(
    `insert into k1_field_values
       (id, k1_document_id, extraction_attempt_id, canonical_path, occurrence_id,
        occurrence_index, field_name, value_kind, raw_value_json, normalized_value_json,
        extraction_method, review_status, source_locations, destination_kind, destination_key, mapping_rule_version)
     values ($1, $2, $3, 'calculation.box_2_net_rental_real_estate_income_loss', $4,
       0, 'inactive_field', 'MONEY', '99'::jsonb, '99'::jsonb, 'STUB', 'PENDING', '[]'::jsonb,
       'CALCULATION', 'box_2_net_rental_real_estate_income_loss', 'test-v1')`,
    [randomUUID(), k1DocumentId, inactiveAttemptId, randomUUID()],
  )
  await pool.query(
    `insert into k1_issues
       (id, k1_document_id, issue_type, severity, status, message, k1_field_value_id,
        extraction_attempt_id, occurrence_id, issue_code, details_json)
     select $1, $2, 'LOW_CONFIDENCE', 'MEDIUM', 'OPEN', 'Review the source amount.', $3,
            $4, occurrence_id, 'LOW_CONFIDENCE', '{}'::jsonb
       from k1_field_values where id = $3`,
    [issueId, k1DocumentId, moneyFieldId, activeAttemptId],
  )

  const cleanup = async () => {
    await pool.query('delete from audit_events where object_id = any($1::uuid[])', [[k1DocumentId, moneyFieldId, codeRowFieldId, issueId]])
    await pool.query('delete from k1_application_field_decisions where application_id in (select id from k1_document_applications where k1_document_id = $1)', [k1DocumentId])
    await pool.query('delete from k1_document_applications where k1_document_id = $1', [k1DocumentId])
    await pool.query('update k1_documents set applied_tracker_year_id = null, applied_at = null where id = $1', [k1DocumentId])
    await pool.query('delete from k1_tracker_signoffs where tracker_year_id in (select id from k1_tracker_years where partnership_id = $1)', [partnershipId])
    await pool.query('delete from k1_tracker_official_value_revisions where tracker_year_id in (select id from k1_tracker_years where partnership_id = $1)', [partnershipId])
    await pool.query('delete from k1_tracker_value_revisions where tracker_year_id in (select id from k1_tracker_years where partnership_id = $1)', [partnershipId])
    await pool.query('delete from partnership_annual_activity where partnership_id = $1', [partnershipId])
    await pool.query('delete from k1_tracker_years where partnership_id = $1', [partnershipId])
    await pool.query('delete from k1_match_candidates where k1_document_id = $1', [k1DocumentId])
    await pool.query('delete from k1_issues where k1_document_id = $1', [k1DocumentId])
    await pool.query('delete from k1_field_value_corrections where k1_document_id = $1', [k1DocumentId])
    await pool.query('delete from k1_field_values where k1_document_id = $1', [k1DocumentId])
    await pool.query('update k1_documents set active_extraction_attempt_id = null where id = $1', [k1DocumentId])
    await pool.query('delete from k1_extraction_attempts where k1_document_id = $1', [k1DocumentId])
    await pool.query('delete from k1_ingestion_items where id = $1', [itemId])
    await pool.query('delete from k1_documents where id = $1', [k1DocumentId])
    await pool.query('delete from documents where id = $1', [documentId])
    await pool.query('delete from k1_ingestion_batches where id = $1', [batchId])
    await pool.query('delete from entity_memberships where entity_id = $1', [entityId])
    await pool.query('delete from partnerships where id = $1', [partnershipId])
    await pool.query('delete from entities where id = $1', [entityId])
    await getK1ObjectStore().delete({ key: objectKey }).catch(() => undefined)
    await base.app.close()
  }
  return { ...base, entityId, partnershipId, batchId, itemId, documentId, k1DocumentId,
    activeAttemptId, inactiveAttemptId, moneyFieldId, codeRowFieldId, issueId, objectKey, cleanup }
}
