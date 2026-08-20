import { randomUUID } from 'node:crypto'

import { withTransaction } from '../../../infra/db/client.js'
import { auditRepository } from '../../audit/audit.repository.js'
import { recalculateTrackerAfterK1Apply } from '../../k1-tracker/k1-tracker.repository.js'
import { k1OfficialRevisionRepository } from '../../k1-tracker/k1OfficialRevision.repository.js'
import { k1OfficialFormDataSchema } from '../../k1-tracker/k1-official-form.zod.js'
import type { K1ApplyResponse } from '../k1.types.js'
import { durableK1Repository } from '../k1.repository.js'
import { durableReviewRepository } from '../../review/review.repository.js'
import { mapReviewedK1ApplicationValues } from './k1ApplicationMapper.js'
import { transitionK1IngestionItem } from '../ingestion/k1BatchStatus.service.js'

export const k1ApplyFaultInjection: { step: string | null } = { step: null }
const failAt = (step: string) => {
  if (k1ApplyFaultInjection.step === step) throw Object.assign(new Error(`Injected K-1 apply failure at ${step}`), { code: 'INJECTED_APPLY_FAILURE' })
}

export interface ApplyK1Input {
  k1DocumentId: string
  applicationId: string
  expectedDocumentVersion: number
  expectedTrackerRevision: number
  decisions: Array<{
    decisionId: string
    decision: 'USE_EXTRACTED' | 'KEEP_EXISTING' | 'SKIP_UNMAPPED'
    reason?: string | null
  }>
  actorUserId: string
  authorizedEntityIds: readonly string[]
  isAdmin: boolean
}

interface ApplicationRow {
  id: string; k1_document_id: string; extraction_attempt_id: string; tracker_year_id: string
  expected_document_version: number; expected_tracker_revision: number
  status: 'PREVIEWED' | 'APPLIED' | 'STALE' | 'FAILED' | 'CANCELLED'
  preview_expires_at: Date; applied_at: Date | null; created_at: Date
}

const idempotentResponse = async (
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  application: ApplicationRow,
): Promise<K1ApplyResponse> => {
  const year = await client.query<{ partnership_id: string; tax_year: number; revision: number }>(
    'select partnership_id, tax_year, revision from k1_tracker_years where id = $1',
    [application.tracker_year_id],
  )
  const invalidated = year.rows[0] ? await client.query<{ tax_year: number }>(
    `select distinct y.tax_year from k1_tracker_years y
      join k1_tracker_signoffs s on s.tracker_year_id = y.id
     where y.partnership_id = $1 and y.tax_year > $2
       and s.reason = 'Reviewed K-1 document applied' and s.created_at >= $3`,
    [year.rows[0].partnership_id, year.rows[0].tax_year, application.created_at],
  ) : { rows: [] as Array<{ tax_year: number }> }
  return {
    applicationId: application.id, k1DocumentId: application.k1_document_id,
    status: 'APPLIED', trackerYearId: application.tracker_year_id,
    trackerRevision: year.rows[0]?.revision ?? application.expected_tracker_revision,
    appliedAt: (application.applied_at ?? new Date()).toISOString(),
    invalidatedTaxYears: invalidated.rows.map((row) => row.tax_year).sort((a, b) => a - b),
  }
}

export const applyReviewedK1 = async (args: ApplyK1Input): Promise<K1ApplyResponse> => withTransaction(async (client) => {
  const applicationResult = await client.query<ApplicationRow>(
    'select * from k1_document_applications where id = $1 and k1_document_id = $2 for update',
    [args.applicationId, args.k1DocumentId],
  )
  const application = applicationResult.rows[0]
  if (!application) throw Object.assign(new Error('APPLICATION_PREVIEW_NOT_FOUND'), { code: 'APPLICATION_PREVIEW_NOT_FOUND' })
  if (application.status === 'APPLIED') return idempotentResponse(client, application)
  if (application.status !== 'PREVIEWED') throw Object.assign(new Error('APPLICATION_PREVIEW_STALE'), { code: 'APPLICATION_PREVIEW_STALE' })
  if (application.preview_expires_at <= new Date()) {
    await client.query(`update k1_document_applications set status = 'STALE', updated_at = now() where id = $1`, [application.id])
    throw Object.assign(new Error('APPLICATION_PREVIEW_EXPIRED'), { code: 'APPLICATION_PREVIEW_EXPIRED' })
  }
  if (!args.isAdmin) throw Object.assign(new Error('ROLE_REQUIRED_ADMIN'), { code: 'ROLE_REQUIRED_ADMIN' })
  const document = await durableK1Repository.lockById(client, args.k1DocumentId)
  if (!document) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
  if (!document.entityId || !args.authorizedEntityIds.includes(document.entityId)) throw Object.assign(new Error('FORBIDDEN_ENTITY'), { code: 'FORBIDDEN_ENTITY' })
  if (document.version !== args.expectedDocumentVersion || application.expected_document_version !== args.expectedDocumentVersion) {
    throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: document.version })
  }
  if (document.activeExtractionAttemptId !== application.extraction_attempt_id || document.appliedAt) {
    throw Object.assign(new Error('APPLICATION_PREVIEW_STALE'), { code: 'APPLICATION_PREVIEW_STALE' })
  }
  const year = await client.query<{ id: string; entity_id: string; partnership_id: string; tax_year: number; revision: number }>(
    'select id, entity_id, partnership_id, tax_year, revision from k1_tracker_years where id = $1 for update',
    [application.tracker_year_id],
  )
  const trackerYear = year.rows[0]
  if (!trackerYear || trackerYear.entity_id !== document.entityId || trackerYear.partnership_id !== document.partnershipId || trackerYear.tax_year !== document.taxYear) {
    throw Object.assign(new Error('APPLICATION_TARGET_CHANGED'), { code: 'APPLICATION_TARGET_CHANGED' })
  }
  if (trackerYear.revision !== args.expectedTrackerRevision || application.expected_tracker_revision !== args.expectedTrackerRevision) {
    throw Object.assign(new Error('STALE_TRACKER_REVISION'), { code: 'STALE_TRACKER_REVISION', currentRevision: trackerYear.revision })
  }
  const decisionRows = await client.query<{
    id: string; destination_kind: 'CALCULATION' | 'OFFICIAL'; destination_key: string
    source_field_value_ids: string[]; extracted_value: unknown; existing_value: unknown; reason: string | null
  }>('select id, destination_kind, destination_key, source_field_value_ids, extracted_value, existing_value, reason from k1_application_field_decisions where application_id = $1 for update', [application.id])
  const requested = new Map(args.decisions.map((decision) => [decision.decisionId, decision]))
  if (requested.size !== decisionRows.rows.length || decisionRows.rows.some((row) => !requested.has(row.id))) {
    throw Object.assign(new Error('APPLICATION_DECISIONS_INCOMPLETE'), { code: 'APPLICATION_DECISIONS_INCOMPLETE' })
  }
  const fields = await durableReviewRepository.listForActiveAttempt(document.id)
  const mapped = mapReviewedK1ApplicationValues(fields)
  const mappedByDestination = new Map(mapped.map((value) => [`${value.destinationKind}:${value.destinationKey}`, value]))
  let propagationRequired = false
  let officialChanged = false
  for (const row of decisionRows.rows) {
    const request = requested.get(row.id)!
    const mapping = mappedByDestination.get(`${row.destination_kind}:${row.destination_key}`)
    if (!mapping || JSON.stringify(mapping.sourceFieldValueIds) !== JSON.stringify(row.source_field_value_ids)) {
      throw Object.assign(new Error('APPLICATION_PREVIEW_STALE'), { code: 'APPLICATION_PREVIEW_STALE' })
    }
    if (mapping.policy === 'DATED_ACTIVITY_AUTHORITATIVE' && row.existing_value != null && request.decision !== 'KEEP_EXISTING') {
      throw Object.assign(new Error('DATED_ACTIVITY_IS_AUTHORITATIVE'), { code: 'DATED_ACTIVITY_IS_AUTHORITATIVE', decisionId: row.id })
    }
    if (request.decision === 'SKIP_UNMAPPED' && !request.reason?.trim()) {
      throw Object.assign(new Error('APPLICATION_DECISION_REASON_REQUIRED'), { code: 'APPLICATION_DECISION_REASON_REQUIRED', decisionId: row.id })
    }
    const finalValue = request.decision === 'USE_EXTRACTED' ? row.extracted_value : row.existing_value
    await client.query(
      `update k1_application_field_decisions
          set decision = $2, final_value = $3::jsonb, reason = coalesce($4, reason), updated_at = now()
        where id = $1`,
      [row.id, request.decision, JSON.stringify(finalValue), request.reason?.trim() ?? null],
    )
    if (row.destination_kind === 'CALCULATION') {
      const current = await client.query<{ id: string }>(
        `select id from k1_tracker_value_revisions where tracker_year_id = $1 and field_key = $2 and is_active for update`,
        [trackerYear.id, row.destination_key],
      )
      if (request.decision === 'USE_EXTRACTED') {
        await client.query(`update k1_tracker_value_revisions set is_active = false where tracker_year_id = $1 and field_key = $2 and is_active`, [trackerYear.id, row.destination_key])
        await client.query(
          `insert into k1_tracker_value_revisions
             (id, tracker_year_id, field_key, amount, source_type,
              source_k1_document_id, source_k1_field_value_id,
              supersedes_value_revision_id, is_active, created_by_user_id, original_source_text)
           values ($1, $2, $3, $4, 'FINALIZED_K1', $5, $6, $7, true, $8, $9)`,
          [randomUUID(), trackerYear.id, row.destination_key, row.extracted_value,
            document.id, row.source_field_value_ids[0], current.rows[0]?.id ?? null,
            args.actorUserId, `Reviewed extraction attempt ${application.extraction_attempt_id}`],
        )
        propagationRequired ||= mapping.affectsDownstreamCalculations
      } else if (request.decision === 'KEEP_EXISTING' && JSON.stringify(row.extracted_value) !== JSON.stringify(row.existing_value)) {
        await client.query(
          `insert into k1_tracker_value_revisions
             (id, tracker_year_id, field_key, amount, source_type,
              source_k1_document_id, source_k1_field_value_id,
              is_active, created_by_user_id, original_source_text)
           values ($1, $2, $3, $4, 'FINALIZED_K1', $5, $6, false, $7, $8)`,
          [randomUUID(), trackerYear.id, row.destination_key, row.extracted_value,
            document.id, row.source_field_value_ids[0], args.actorUserId,
            request.reason?.trim() ?? 'Existing application value retained during K-1 apply'],
        )
      }
    } else {
      const write = {
        fieldKey: row.destination_key as never, value: row.extracted_value as never,
        sourceK1DocumentId: document.id, sourceK1FieldValueIds: row.source_field_value_ids,
        extractionAttemptId: application.extraction_attempt_id, actorUserId: args.actorUserId,
      }
      if (request.decision === 'USE_EXTRACTED') {
        await k1OfficialRevisionRepository.applyActive(client, trackerYear.id, write)
        officialChanged = true
      } else if (request.decision === 'KEEP_EXISTING' && JSON.stringify(row.extracted_value) !== JSON.stringify(row.existing_value)) {
        await k1OfficialRevisionRepository.addEvidenceOnly(client, trackerYear.id, write)
      }
    }
  }
  failAt('after_revisions')
  if (officialChanged) {
    const snapshot = await k1OfficialRevisionRepository.rebuildSnapshot(client, trackerYear.id)
    const validated = k1OfficialFormDataSchema.safeParse(snapshot)
    if (!validated.success) throw Object.assign(new Error('OFFICIAL_FORM_SNAPSHOT_INVALID'), { code: 'OFFICIAL_FORM_SNAPSHOT_INVALID' })
  }
  const recalculated = await recalculateTrackerAfterK1Apply(
    client, trackerYear.partnership_id, trackerYear.tax_year, args.actorUserId, propagationRequired,
  )
  failAt('after_recalculation')
  const appliedAt = new Date()
  await client.query(
    `update k1_document_applications
        set status = 'APPLIED', applied_by_user_id = $2, applied_at = $3, updated_at = now()
      where id = $1`,
    [application.id, args.actorUserId, appliedAt],
  )
  await client.query(
    `update k1_documents
        set processing_status = 'FINALIZED', user_approved = true, finalized_at = $2,
            finalized_by_user_id = $3, applied_tracker_year_id = $4, applied_at = $2,
            version = version + 1, updated_at = now()
      where id = $1`,
    [document.id, appliedAt, args.actorUserId, trackerYear.id],
  )
  const ingestionItem = await client.query<{ id: string; status: import('../k1.types.js').K1IngestionItemStatus }>(
    `select id, status from k1_ingestion_items where k1_document_id = $1 for update`, [document.id],
  )
  if (ingestionItem.rows[0]) {
    await transitionK1IngestionItem(client, ingestionItem.rows[0].id, {
      from: [ingestionItem.rows[0].status], to: 'APPLIED',
    })
  }
  await auditRepository.record({
    actorUserId: args.actorUserId, eventName: 'k1.document_applied', objectType: 'k1_document', objectId: document.id,
    after: { applicationId: application.id, extractionAttemptId: application.extraction_attempt_id, trackerYearId: trackerYear.id, decisions: args.decisions.map((decision) => ({ decisionId: decision.decisionId, decision: decision.decision })) },
  }, client)
  failAt('before_commit')
  return {
    applicationId: application.id, k1DocumentId: document.id, status: 'APPLIED',
    trackerYearId: trackerYear.id, trackerRevision: recalculated.trackerRevision,
    appliedAt: appliedAt.toISOString(), invalidatedTaxYears: recalculated.invalidatedTaxYears,
  }
})
