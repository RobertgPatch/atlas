import { randomUUID } from 'node:crypto'
import type pg from 'pg'

import { withTransaction } from '../../../infra/db/client.js'
import type { K1ApplicationPreview } from '../k1.types.js'
import { durableK1Repository } from '../k1.repository.js'
import { durableReviewRepository } from '../../review/review.repository.js'
import { mapReviewedK1ApplicationValues } from './k1ApplicationMapper.js'

const PREVIEW_MINUTES = 30
const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

interface DecisionRow {
  id: string
  destination_kind: 'CALCULATION' | 'OFFICIAL'
  destination_key: string
  extracted_value: unknown
  existing_value: unknown
  decision: 'USE_EXTRACTED' | 'KEEP_EXISTING' | 'SKIP_UNMAPPED'
  source_field_value_ids: string[]
}

const readPreview = async (client: pg.PoolClient, applicationId: string): Promise<K1ApplicationPreview> => {
  const application = await client.query<{
    id: string; k1_document_id: string; expected_document_version: number
    tracker_year_id: string; expected_tracker_revision: number; preview_expires_at: Date
  }>('select id, k1_document_id, expected_document_version, tracker_year_id, expected_tracker_revision, preview_expires_at from k1_document_applications where id = $1', [applicationId])
  const row = application.rows[0]!
  const decisions = await client.query<DecisionRow>(
    `select id, destination_kind, destination_key, extracted_value, existing_value,
            decision, source_field_value_ids
       from k1_application_field_decisions where application_id = $1
      order by destination_kind, destination_key`,
    [applicationId],
  )
  return {
    applicationId: row.id, k1DocumentId: row.k1_document_id,
    expectedDocumentVersion: row.expected_document_version, trackerYearId: row.tracker_year_id,
    expectedTrackerRevision: row.expected_tracker_revision, expiresAt: row.preview_expires_at.toISOString(),
    decisions: decisions.rows.map((decision) => ({
      id: decision.id, destinationKind: decision.destination_kind,
      destinationKey: decision.destination_key, extractedValue: decision.extracted_value,
      existingValue: decision.existing_value, defaultDecision: decision.decision,
      conflict: !sameJson(decision.extracted_value, decision.existing_value) && decision.existing_value != null,
      sourceFieldValueIds: decision.source_field_value_ids,
    })),
  }
}

export const createK1ApplyPreview = async (args: {
  k1DocumentId: string
  expectedDocumentVersion: number
  actorUserId: string
  authorizedEntityIds: readonly string[]
  isAdmin: boolean
}): Promise<K1ApplicationPreview> => withTransaction(async (client) => {
  const document = await durableK1Repository.lockById(client, args.k1DocumentId)
  if (!document) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
  if (!args.isAdmin) throw Object.assign(new Error('ROLE_REQUIRED_ADMIN'), { code: 'ROLE_REQUIRED_ADMIN' })
  if (!document.entityId || !args.authorizedEntityIds.includes(document.entityId)) throw Object.assign(new Error('FORBIDDEN_ENTITY'), { code: 'FORBIDDEN_ENTITY' })
  if (document.version !== args.expectedDocumentVersion) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: document.version })
  if (document.appliedAt) throw Object.assign(new Error('K1_ALREADY_APPLIED'), { code: 'K1_ALREADY_APPLIED' })
  const ingestionItem = await client.query<{ status: string }>(
    'select status from k1_ingestion_items where k1_document_id = $1 for share', [document.id],
  )
  if (ingestionItem.rows[0]?.status === 'CANCELLED') {
    throw Object.assign(new Error('K1_CANCELLED'), { code: 'K1_CANCELLED' })
  }
  if (!document.activeExtractionAttemptId || !document.partnershipId || !document.taxYear || document.matchStatus !== 'MATCHED') {
    throw Object.assign(new Error('K1_REVIEW_INCOMPLETE'), { code: 'K1_REVIEW_INCOMPLETE' })
  }
  if (document.processingStatus !== 'READY_FOR_APPROVAL') {
    throw Object.assign(new Error('K1_REVIEW_NOT_FINALIZED'), { code: 'K1_REVIEW_NOT_FINALIZED' })
  }
  const readiness = await client.query<{ attempt_status: string; open_issues: string }>(
    `select a.status as attempt_status,
            (select count(*)::text from k1_issues i where i.k1_document_id = kd.id
              and i.status = 'OPEN' and (i.extraction_attempt_id is null or i.extraction_attempt_id = kd.active_extraction_attempt_id)) as open_issues
       from k1_documents kd join k1_extraction_attempts a on a.id = kd.active_extraction_attempt_id
      where kd.id = $1`,
    [document.id],
  )
  if (readiness.rows[0]?.attempt_status !== 'SUCCEEDED' || Number(readiness.rows[0]?.open_issues ?? 0) > 0) {
    throw Object.assign(new Error('K1_REVIEW_INCOMPLETE'), { code: 'K1_REVIEW_INCOMPLETE' })
  }
  const prior = await client.query<{ id: string }>(
    `select id from k1_document_applications
      where k1_document_id = $1 and extraction_attempt_id = $2 and expected_document_version = $3
        and status = 'PREVIEWED' and preview_expires_at > now()
      order by created_at desc limit 1`,
    [document.id, document.activeExtractionAttemptId, document.version],
  )
  if (prior.rows[0]) return readPreview(client, prior.rows[0].id)

  const partnership = await client.query<{ entity_id: string }>('select entity_id from partnerships where id = $1 for share', [document.partnershipId])
  if (!partnership.rows[0] || partnership.rows[0].entity_id !== document.entityId) throw Object.assign(new Error('ENTITY_PARTNERSHIP_CONFLICT'), { code: 'ENTITY_PARTNERSHIP_CONFLICT' })
  let year = (await client.query<{ id: string; revision: number; official_form_data: Record<string, unknown> }>(
    'select id, revision, official_form_data from k1_tracker_years where partnership_id = $1 and tax_year = $2 for update',
    [document.partnershipId, document.taxYear],
  )).rows[0]
  if (!year) {
    year = (await client.query<{ id: string; revision: number; official_form_data: Record<string, unknown> }>(
      `insert into k1_tracker_years
         (id, entity_id, partnership_id, tax_year, workflow_status, official_form_data,
          created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, $4, 'NOT_STARTED', '{}'::jsonb, $5, $5)
       returning id, revision, official_form_data`,
      [randomUUID(), document.entityId, document.partnershipId, document.taxYear, args.actorUserId],
    )).rows[0]
  }
  const fields = await durableReviewRepository.listForActiveAttempt(document.id)
  const mapped = mapReviewedK1ApplicationValues(fields)
  const calculations = await client.query<{ field_key: string; amount: string | null }>(
    `select field_key, amount from k1_tracker_value_revisions
      where tracker_year_id = $1 and is_active`,
    [year.id],
  )
  const existingCalculation = new Map(calculations.rows.map((row) => [row.field_key, row.amount]))
  const activity = await client.query<{ event_type: string; amount: string }>(
    `select case when event_type = 'funded_contribution' then 'capital_contributions' else 'box_19_distributions' end as event_type,
            sum(abs(amount))::text as amount
       from capital_activity_events
      where partnership_id = $1 and extract(year from activity_date)::int = $2
        and event_type in ('funded_contribution', 'distribution', 'recallable_distribution')
        and settlement_status = 'SETTLED'
      group by case when event_type = 'funded_contribution' then 'capital_contributions' else 'box_19_distributions' end`,
    [document.partnershipId, document.taxYear],
  )
  for (const row of activity.rows) existingCalculation.set(row.event_type, row.amount)

  await client.query(`update k1_document_applications set status = 'STALE', updated_at = now() where k1_document_id = $1 and status = 'PREVIEWED'`, [document.id])
  const applicationId = randomUUID()
  const expiresAt = new Date(Date.now() + PREVIEW_MINUTES * 60_000)
  await client.query(
    `insert into k1_document_applications
       (id, k1_document_id, extraction_attempt_id, tracker_year_id,
        expected_document_version, expected_tracker_revision, mapping_rule_version,
        status, preview_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'PREVIEWED', $8)`,
    [applicationId, document.id, document.activeExtractionAttemptId, year.id,
      document.version, year.revision, document.extractionSchemaVersion ?? 'k1-form-1065-v1', expiresAt],
  )
  for (const destination of mapped) {
    const existingValue = destination.destinationKind === 'CALCULATION'
      ? existingCalculation.get(destination.destinationKey) ?? null
      : year.official_form_data?.[destination.destinationKey] ?? null
    const datedActivity = destination.policy === 'DATED_ACTIVITY_AUTHORITATIVE' && activity.rows.some((row) => row.event_type === destination.destinationKey)
    const conflict = datedActivity || (existingValue != null && !sameJson(existingValue, destination.value))
    const decision = conflict ? 'KEEP_EXISTING' : 'USE_EXTRACTED'
    await client.query(
      `insert into k1_application_field_decisions
         (id, application_id, destination_kind, destination_key,
          source_field_value_ids, extracted_value, existing_value, decision, final_value, reason)
       values ($1, $2, $3, $4, $5::uuid[], $6::jsonb, $7::jsonb, $8, $9::jsonb, $10)`,
      [randomUUID(), applicationId, destination.destinationKind, destination.destinationKey,
        destination.sourceFieldValueIds, JSON.stringify(destination.value), JSON.stringify(existingValue), decision,
        JSON.stringify(decision === 'USE_EXTRACTED' ? destination.value : existingValue),
        datedActivity ? 'Dated cash activity is authoritative.' : null],
    )
  }
  return readPreview(client, applicationId)
})
