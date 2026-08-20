import { randomUUID } from 'node:crypto'
import type pg from 'pg'

import type {
  K1TrackerOfficialFormData,
  K1TrackerOfficialFormFieldKey,
  K1TrackerOfficialFormValue,
} from './k1-tracker.contracts.js'

export interface K1OfficialRevisionWrite {
  fieldKey: K1TrackerOfficialFormFieldKey
  value: K1TrackerOfficialFormValue
  sourceK1DocumentId: string
  sourceK1FieldValueIds: string[]
  extractionAttemptId: string
  actorUserId: string
}

export const k1OfficialRevisionRepository = {
  async applyActive(client: pg.PoolClient, trackerYearId: string, write: K1OfficialRevisionWrite): Promise<string> {
    const current = await client.query<{ id: string }>(
      `select id from k1_tracker_official_value_revisions
        where tracker_year_id = $1 and field_key = $2 and is_active for update`,
      [trackerYearId, write.fieldKey],
    )
    await client.query(
      `update k1_tracker_official_value_revisions set is_active = false
        where tracker_year_id = $1 and field_key = $2 and is_active`,
      [trackerYearId, write.fieldKey],
    )
    const id = randomUUID()
    await client.query(
      `insert into k1_tracker_official_value_revisions
         (id, tracker_year_id, field_key, value_json, source_type,
          source_k1_document_id, source_k1_field_value_ids, extraction_attempt_id,
          supersedes_revision_id, is_active, created_by_user_id)
       values ($1, $2, $3, $4::jsonb, 'FINALIZED_K1', $5, $6::uuid[], $7, $8, true, $9)`,
      [id, trackerYearId, write.fieldKey, JSON.stringify(write.value), write.sourceK1DocumentId,
        write.sourceK1FieldValueIds, write.extractionAttemptId, current.rows[0]?.id ?? null, write.actorUserId],
    )
    return id
  },

  async addEvidenceOnly(client: pg.PoolClient, trackerYearId: string, write: K1OfficialRevisionWrite): Promise<string> {
    const id = randomUUID()
    await client.query(
      `insert into k1_tracker_official_value_revisions
         (id, tracker_year_id, field_key, value_json, source_type,
          source_k1_document_id, source_k1_field_value_ids, extraction_attempt_id,
          is_active, created_by_user_id)
       values ($1, $2, $3, $4::jsonb, 'FINALIZED_K1', $5, $6::uuid[], $7, false, $8)`,
      [id, trackerYearId, write.fieldKey, JSON.stringify(write.value), write.sourceK1DocumentId,
        write.sourceK1FieldValueIds, write.extractionAttemptId, write.actorUserId],
    )
    return id
  },

  async rebuildSnapshot(client: pg.PoolClient, trackerYearId: string): Promise<K1TrackerOfficialFormData> {
    const result = await client.query<{ snapshot: K1TrackerOfficialFormData | null }>(
      `select jsonb_object_agg(field_key, value_json order by field_key) as snapshot
         from k1_tracker_official_value_revisions
        where tracker_year_id = $1 and is_active`,
      [trackerYearId],
    )
    const snapshot = result.rows[0]?.snapshot ?? {}
    await client.query(
      `update k1_tracker_years set official_form_data = $2::jsonb, updated_at = now() where id = $1`,
      [trackerYearId, JSON.stringify(snapshot)],
    )
    return snapshot
  },

  async listActiveSources(client: Pick<pg.PoolClient, 'query'>, trackerYearId: string) {
    const result = await client.query<{
      field_key: K1TrackerOfficialFormFieldKey; source_type: 'FINALIZED_K1' | 'MANUAL_ENTRY' | 'MANUAL_OVERRIDE'
      source_k1_document_id: string | null; source_k1_field_value_ids: string[]
      extraction_attempt_id: string | null; created_by_email: string | null; created_at: Date
    }>(
      `select r.field_key, r.source_type, r.source_k1_document_id,
              r.source_k1_field_value_ids, r.extraction_attempt_id,
              u.email as created_by_email, r.created_at
         from k1_tracker_official_value_revisions r
         left join users u on u.id = r.created_by_user_id
        where r.tracker_year_id = $1 and r.is_active order by r.field_key`,
      [trackerYearId],
    )
    return Object.fromEntries(result.rows.map((row) => [row.field_key, {
      sourceType: row.source_type, sourceK1DocumentId: row.source_k1_document_id,
      sourceK1FieldValueIds: row.source_k1_field_value_ids,
      extractionAttemptId: row.extraction_attempt_id, createdByEmail: row.created_by_email,
      createdAt: row.created_at.toISOString(),
    }]))
  },
}
