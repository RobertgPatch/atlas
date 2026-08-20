// Durable review persistence for Feature 022 plus the legacy Feature 003
// in-memory adapter retained until its older routes are migrated.

import { randomUUID } from 'node:crypto'
import type pg from 'pg'

import { query, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import type { K1DocumentRecord, K1IssueRecord, PartnershipRecord, EntityRecord } from '../k1/k1.repository.js'
import type {
  K1ConfidenceBand,
  K1FieldReviewStatus,
  K1ReviewSection,
  K1SourceLocation,
} from './review.types.js'

// ---------------------------------------------------------------------------
// Record shapes
// ---------------------------------------------------------------------------

export interface K1FieldValueRecord {
  id: string
  k1DocumentId: string
  fieldName: string
  label: string
  section: K1ReviewSection
  required: boolean
  /** Immutable after insert (enforced by corrections handler). */
  rawValue: string | null
  /** Original value also immutable — retained for traceability. */
  originalValue: string | null
  normalizedValue: string | null
  reviewerCorrectedValue: string | null
  confidenceScore: number | null
  sourceLocation: K1SourceLocation | null
  reviewStatus: K1FieldReviewStatus
  updatedAt: Date
}

export interface K1ReportedDistributionRecord {
  id: string
  k1DocumentId: string
  /** String to preserve exact precision (mirrors DB NUMERIC). */
  reportedDistributionAmount: string | null
}

export interface PartnershipAnnualActivityRecord {
  id: string
  entityId: string
  partnershipId: string
  taxYear: number
  reportedDistributionAmount: string | null
  originalCommitmentAmount: string | null
  percentCalled: string | null
  unfundedAmount: string | null
  paidInAmount: string | null
  residualValueAmount: string | null
  dpi: string | null
  rvpi: string | null
  tvpi: string | null
  sourceHasK1: boolean
  sourceHasCapitalActivity: boolean
  sourceHasFmv: boolean
  sourceHasManualInput: boolean
  commitmentSourceType: string | null
  paidInSourceType: string | null
  distributionSourceType: string | null
  residualValueSourceType: string | null
  returnMetricsSourceType: string | null
  finalizedFromK1DocumentId: string | null
  createdAt: Date
  updatedAt: Date
}

export type DurableFieldReviewStatus =
  | 'PENDING'
  | 'REVIEWED'
  | 'ACCEPTED'
  | 'CORRECTED'
  | 'REJECTED'

export interface DurableK1FieldValueRecord {
  id: string
  k1DocumentId: string
  extractionAttemptId: string | null
  canonicalPath: string | null
  occurrenceId: string | null
  occurrenceIndex: number | null
  fieldName: string
  label: string
  section: K1ReviewSection
  required: boolean
  valueKind: string | null
  rawValue: string | null
  rawValueJson: unknown
  normalizedValue: string | null
  normalizedValueJson: unknown
  reviewerCorrectedValue: string | null
  reviewerCorrectedValueJson: unknown
  confidenceScore: number | null
  sourceLocations: K1SourceLocation[]
  destinationKind: string | null
  destinationKey: string | null
  mappingRuleVersion: string | null
  reviewStatus: DurableFieldReviewStatus
  createdAt: Date
  updatedAt: Date
}

interface DurableFieldRow {
  id: string
  k1_document_id: string
  extraction_attempt_id: string | null
  canonical_path: string | null
  occurrence_id: string | null
  occurrence_index: number | null
  field_name: string
  label: string | null
  review_section: K1ReviewSection | null
  is_required: boolean
  value_kind: string | null
  raw_value: string | null
  raw_value_json: unknown
  normalized_value: string | null
  normalized_value_json: unknown
  reviewer_corrected_value: string | null
  reviewer_corrected_value_json: unknown
  confidence_score: string | null
  source_locations: K1SourceLocation[]
  destination_kind: string | null
  destination_key: string | null
  mapping_rule_version: string | null
  review_status: DurableFieldReviewStatus
  created_at: Date
  updated_at: Date
}

const toDurableField = (row: DurableFieldRow): DurableK1FieldValueRecord => ({
  id: row.id,
  k1DocumentId: row.k1_document_id,
  extractionAttemptId: row.extraction_attempt_id,
  canonicalPath: row.canonical_path,
  occurrenceId: row.occurrence_id,
  occurrenceIndex: row.occurrence_index,
  fieldName: row.field_name,
  label: row.label ?? row.field_name,
  section: row.review_section ?? 'core',
  required: row.is_required,
  valueKind: row.value_kind,
  rawValue: row.raw_value,
  rawValueJson: row.raw_value_json,
  normalizedValue: row.normalized_value,
  normalizedValueJson: row.normalized_value_json,
  reviewerCorrectedValue: row.reviewer_corrected_value,
  reviewerCorrectedValueJson: row.reviewer_corrected_value_json,
  confidenceScore: row.confidence_score == null ? null : Number(row.confidence_score),
  sourceLocations: row.source_locations ?? [],
  destinationKind: row.destination_kind,
  destinationKey: row.destination_key,
  mappingRuleVersion: row.mapping_rule_version,
  reviewStatus: row.review_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export interface InsertDurableFieldInput {
  id: string
  k1DocumentId: string
  extractionAttemptId: string
  canonicalPath: string
  occurrenceId: string
  occurrenceIndex: number
  fieldName: string
  label?: string
  section?: K1ReviewSection
  required?: boolean
  valueKind: string
  rawValue: unknown
  normalizedValue: unknown
  confidenceScore: number | null
  sourceLocations: K1SourceLocation[]
  destinationKind?: string | null
  destinationKey?: string | null
  mappingRuleVersion: string
  extractionMethod: string
}

const compatibilityText = (value: unknown): string | null => {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** PostgreSQL-backed field, issue, correction-history, and attempt queries. */
export const durableReviewRepository = {
  async insertFields(
    client: pg.PoolClient,
    fields: InsertDurableFieldInput[],
  ): Promise<void> {
    for (const field of fields) {
      await client.query(
        `insert into k1_field_values
           (id, k1_document_id, extraction_attempt_id, canonical_path,
            occurrence_id, occurrence_index, field_name, label, review_section,
            is_required, value_kind, raw_value, raw_value_json, normalized_value,
            normalized_value_json, confidence_score, extraction_method,
            review_status, page_number, source_ref, source_locations,
            destination_kind, destination_key, mapping_rule_version)
         values
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, 'PENDING', $18, $19, $20, $21, $22, $23)
         on conflict (extraction_attempt_id, occurrence_id)
           where extraction_attempt_id is not null and occurrence_id is not null
         do nothing`,
        [
          field.id,
          field.k1DocumentId,
          field.extractionAttemptId,
          field.canonicalPath,
          field.occurrenceId,
          field.occurrenceIndex,
          field.fieldName,
          field.label ?? field.fieldName,
          field.section ?? 'core',
          field.required ?? false,
          field.valueKind,
          compatibilityText(field.rawValue),
          field.rawValue,
          compatibilityText(field.normalizedValue),
          field.normalizedValue,
          field.confidenceScore,
          field.extractionMethod,
          field.sourceLocations[0]?.page ?? null,
          field.sourceLocations[0] ? `page:${field.sourceLocations[0].page}` : null,
          JSON.stringify(field.sourceLocations),
          field.destinationKind ?? null,
          field.destinationKey ?? null,
          field.mappingRuleVersion,
        ],
      )
    }
  },

  async listForActiveAttempt(k1DocumentId: string): Promise<DurableK1FieldValueRecord[]> {
    const result = await query<DurableFieldRow>(
      `select fv.*
         from k1_documents kd
         join k1_field_values fv
           on fv.k1_document_id = kd.id
          and fv.extraction_attempt_id = kd.active_extraction_attempt_id
        where kd.id = $1
        order by fv.occurrence_index nulls last, fv.created_at, fv.id`,
      [k1DocumentId],
    )
    return result.rows.map(toDurableField)
  },

  async listForAttempt(extractionAttemptId: string): Promise<DurableK1FieldValueRecord[]> {
    const result = await query<DurableFieldRow>(
      `select * from k1_field_values
        where extraction_attempt_id = $1
        order by occurrence_index nulls last, created_at, id`,
      [extractionAttemptId],
    )
    return result.rows.map(toDurableField)
  },

  async lockField(
    client: pg.PoolClient,
    fieldId: string,
  ): Promise<DurableK1FieldValueRecord | null> {
    const result = await client.query<DurableFieldRow>(
      'select * from k1_field_values where id = $1 for update',
      [fieldId],
    )
    return result.rows[0] ? toDurableField(result.rows[0]) : null
  },

  async saveCorrection(args: {
    fieldId: string
    correctedValue: unknown
    correctedByUserId: string
    expectedDocumentVersion: number
    reviewStatus?: DurableFieldReviewStatus
  }): Promise<{ field: DurableK1FieldValueRecord; documentVersion: number }> {
    return withTransaction(async (client) => {
      const field = await this.lockField(client, args.fieldId)
      if (!field) throw Object.assign(new Error('K1_FIELD_NOT_FOUND'), { code: 'K1_FIELD_NOT_FOUND' })
      const document = await client.query<{
        version: number
        active_extraction_attempt_id: string | null
      }>(
        'select version, active_extraction_attempt_id from k1_documents where id = $1 for update',
        [field.k1DocumentId],
      )
      const current = document.rows[0]
      if (!current) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
      if (current.version !== args.expectedDocumentVersion) {
        throw Object.assign(new Error('STALE_K1_VERSION'), {
          code: 'STALE_K1_VERSION',
          currentVersion: current.version,
        })
      }
      if (field.extractionAttemptId !== current.active_extraction_attempt_id) {
        throw Object.assign(new Error('INACTIVE_EXTRACTION_ATTEMPT'), {
          code: 'INACTIVE_EXTRACTION_ATTEMPT',
        })
      }
      const nextVersion = current.version + 1
      await client.query(
        `insert into k1_field_value_corrections
           (id, k1_field_value_id, k1_document_id, extraction_attempt_id,
            previous_value_json, corrected_value_json, previous_value_text,
            corrected_value_text, document_version, corrected_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          field.id,
          field.k1DocumentId,
          field.extractionAttemptId,
          field.reviewerCorrectedValueJson,
          args.correctedValue,
          field.reviewerCorrectedValue,
          compatibilityText(args.correctedValue),
          nextVersion,
          args.correctedByUserId,
        ],
      )
      await client.query(
        `update k1_field_values
            set reviewer_corrected_value = $2,
                reviewer_corrected_value_json = $3,
                review_status = $4,
                updated_at = now()
          where id = $1`,
        [
          field.id,
          compatibilityText(args.correctedValue),
          args.correctedValue,
          args.reviewStatus ?? 'CORRECTED',
        ],
      )
      await client.query(
        `update k1_documents set version = $2, updated_at = now() where id = $1`,
        [field.k1DocumentId, nextVersion],
      )
      const updated = await this.lockField(client, field.id)
      if (!updated) throw new Error('K1_FIELD_CORRECTION_FAILED')
      return { field: updated, documentVersion: nextVersion }
    })
  },

  async listCorrectionHistory(fieldId: string): Promise<Array<{
    id: string
    correctedValue: unknown
    correctedValueText: string | null
    documentVersion: number
    correctedByUserId: string
    createdAt: Date
  }>> {
    const result = await query<{
      id: string
      corrected_value_json: unknown
      corrected_value_text: string | null
      document_version: number
      corrected_by_user_id: string
      created_at: Date
    }>(
      `select id, corrected_value_json, corrected_value_text, document_version,
              corrected_by_user_id, created_at
         from k1_field_value_corrections
        where k1_field_value_id = $1
        order by created_at desc, id desc`,
      [fieldId],
    )
    return result.rows.map((row) => ({
      id: row.id,
      correctedValue: row.corrected_value_json,
      correctedValueText: row.corrected_value_text,
      documentVersion: row.document_version,
      correctedByUserId: row.corrected_by_user_id,
      createdAt: row.created_at,
    }))
  },

  async listCorrectionHistoryForDocument(k1DocumentId: string): Promise<Record<string, Array<{
    id: string
    correctedValue: unknown
    correctedValueText: string | null
    documentVersion: number
    correctedByUserId: string
    createdAt: Date
  }>>> {
    const result = await query<{
      id: string; k1_field_value_id: string; corrected_value_json: unknown
      corrected_value_text: string | null; document_version: number
      corrected_by_user_id: string; created_at: Date
    }>(
      `select id, k1_field_value_id, corrected_value_json, corrected_value_text,
              document_version, corrected_by_user_id, created_at
         from k1_field_value_corrections
        where k1_document_id = $1
        order by created_at desc, id desc`,
      [k1DocumentId],
    )
    const grouped: Record<string, Array<{
      id: string; correctedValue: unknown; correctedValueText: string | null
      documentVersion: number; correctedByUserId: string; createdAt: Date
    }>> = {}
    for (const row of result.rows) {
      ;(grouped[row.k1_field_value_id] ??= []).push({
        id: row.id, correctedValue: row.corrected_value_json,
        correctedValueText: row.corrected_value_text, documentVersion: row.document_version,
        correctedByUserId: row.corrected_by_user_id, createdAt: row.created_at,
      })
    }
    return grouped
  },

  async saveCorrections(args: {
    k1DocumentId: string
    corrections: Array<{ fieldId: string; correctedValue: unknown }>
    correctedByUserId: string
    expectedDocumentVersion: number
  }): Promise<{ documentVersion: number; resolvedIssueIds: string[] }> {
    return withTransaction(async (client) => {
      const document = await client.query<{
        version: number; active_extraction_attempt_id: string | null; processing_status: string
      }>(
        `select version, active_extraction_attempt_id, processing_status
           from k1_documents where id = $1 for update`,
        [args.k1DocumentId],
      )
      const current = document.rows[0]
      if (!current) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
      if (current.version !== args.expectedDocumentVersion) {
        throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: current.version })
      }
      if (current.processing_status === 'FINALIZED') throw Object.assign(new Error('K1_FINALIZED'), { code: 'K1_FINALIZED' })
      const fields: DurableK1FieldValueRecord[] = []
      for (const correction of args.corrections) {
        const field = await this.lockField(client, correction.fieldId)
        if (!field || field.k1DocumentId !== args.k1DocumentId) {
          throw Object.assign(new Error('K1_FIELD_NOT_FOUND'), { code: 'K1_FIELD_NOT_FOUND', fieldId: correction.fieldId })
        }
        if (field.extractionAttemptId !== current.active_extraction_attempt_id) {
          throw Object.assign(new Error('INACTIVE_EXTRACTION_ATTEMPT'), { code: 'INACTIVE_EXTRACTION_ATTEMPT', fieldId: correction.fieldId })
        }
        fields.push(field)
      }
      const nextVersion = current.version + 1
      const resolvedIssueIds: string[] = []
      for (const [index, correction] of args.corrections.entries()) {
        const field = fields[index]
        await client.query(
          `insert into k1_field_value_corrections
             (id, k1_field_value_id, k1_document_id, extraction_attempt_id,
              previous_value_json, corrected_value_json, previous_value_text,
              corrected_value_text, document_version, corrected_by_user_id)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
          [randomUUID(), field.id, field.k1DocumentId, field.extractionAttemptId,
            JSON.stringify(field.reviewerCorrectedValueJson ?? null), JSON.stringify(correction.correctedValue ?? null),
            field.reviewerCorrectedValue, compatibilityText(correction.correctedValue), nextVersion,
            args.correctedByUserId],
        )
        await client.query(
          `update k1_field_values
              set reviewer_corrected_value = $2,
                  reviewer_corrected_value_json = $3::jsonb,
                  review_status = 'CORRECTED', updated_at = now()
            where id = $1`,
          [field.id, compatibilityText(correction.correctedValue), JSON.stringify(correction.correctedValue ?? null)],
        )
        const resolved = await client.query<{ id: string }>(
          `update k1_issues
              set status = 'RESOLVED', resolved_by_user_id = $2, resolved_at = now()
            where k1_field_value_id = $1 and status = 'OPEN'
            returning id`,
          [field.id, args.correctedByUserId],
        )
        resolvedIssueIds.push(...resolved.rows.map((row) => row.id))
        await auditRepository.record({
          actorUserId: args.correctedByUserId, eventName: 'k1.field_corrected',
          objectType: 'k1_field_value', objectId: field.id,
          before: { correctedValue: field.reviewerCorrectedValueJson },
          after: { correctedValue: correction.correctedValue, extractionAttemptId: field.extractionAttemptId },
        }, client)
      }
      await client.query(
        `update k1_documents
            set version = $2, processing_status = 'NEEDS_REVIEW',
                approved_by_user_id = null, updated_at = now()
          where id = $1`,
        [args.k1DocumentId, nextVersion],
      )
      return { documentVersion: nextVersion, resolvedIssueIds }
    })
  },

  async listIssuesForActiveAttempt(k1DocumentId: string): Promise<K1IssueRecord[]> {
    const result = await query<{
      id: string
      k1_document_id: string
      issue_type: string
      issue_code: string | null
      severity: K1IssueRecord['severity']
      status: K1IssueRecord['status']
      message: string | null
      k1_field_value_id: string | null
      resolved_at: Date | null
      resolved_by_user_id: string | null
      created_at: Date
      extraction_attempt_id: string | null
      occurrence_id: string | null
      details_json: Record<string, unknown>
    }>(
      `select i.id, i.k1_document_id, i.issue_type, i.issue_code, i.severity, i.status,
              i.message, i.k1_field_value_id, i.resolved_at,
              i.resolved_by_user_id, i.created_at, i.extraction_attempt_id,
              i.occurrence_id, i.details_json
         from k1_documents kd
         join k1_issues i on i.k1_document_id = kd.id
        where kd.id = $1
          and (i.extraction_attempt_id is null
               or i.extraction_attempt_id = kd.active_extraction_attempt_id)
        order by i.created_at, i.id`,
      [k1DocumentId],
    )
    return result.rows.map((row) => ({
      id: row.id,
      k1DocumentId: row.k1_document_id,
      issueType: row.issue_type,
      severity: row.severity,
      status: row.status,
      message: row.message ?? '',
      k1FieldValueId: row.k1_field_value_id,
      resolvedAt: row.resolved_at,
      resolvedByUserId: row.resolved_by_user_id,
      createdAt: row.created_at,
      extractionAttemptId: row.extraction_attempt_id,
      occurrenceId: row.occurrence_id,
      issueCode: row.issue_code,
      details: row.details_json,
    }))
  },
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const fieldValues = new Map<string, K1FieldValueRecord>()
const reportedDistributions = new Map<string, K1ReportedDistributionRecord>() // keyed by k1DocumentId
const partnershipAnnualActivity = new Map<string, PartnershipAnnualActivityRecord>() // keyed by `${entity}:${partnership}:${year}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const confidenceBandFor = (score: number | null): K1ConfidenceBand => {
  if (score == null) return 'none'
  if (score >= 0.9) return 'high'
  if (score >= 0.7) return 'medium'
  return 'low'
}

const activityKey = (entityId: string, partnershipId: string, taxYear: number) =>
  `${entityId}:${partnershipId}:${taxYear}`

const fieldValueFor = (field: K1FieldValueRecord): string | null =>
  field.reviewerCorrectedValue ?? field.normalizedValue ?? field.rawValue

// Canonical "reported distribution" field names. The stub extractor emits
// `box_19a_distribution`; the real AWS BDA pipeline emits
// `box_19_distributions` (per Schedule K-1 Box 19 — distributions). Both are
// treated as the same semantic value so downstream KPI rollups match either.
export const REPORTED_DISTRIBUTION_FIELD_NAMES = [
  'box_19a_distribution',
  'box_19_distributions',
] as const

export const isReportedDistributionField = (fieldName: string | null | undefined): boolean =>
  fieldName != null &&
  (REPORTED_DISTRIBUTION_FIELD_NAMES as readonly string[]).includes(fieldName)

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const reviewRepository = {
  // ---- field values ----

  insertFieldValue(args: Omit<K1FieldValueRecord, 'id' | 'updatedAt'>): K1FieldValueRecord {
    const rec: K1FieldValueRecord = {
      ...args,
      id: randomUUID(),
      updatedAt: new Date(),
    }
    fieldValues.set(rec.id, rec)
    return rec
  },

  listFieldValuesForK1(k1DocumentId: string): K1FieldValueRecord[] {
    return [...fieldValues.values()].filter((f) => f.k1DocumentId === k1DocumentId)
  },

  getFieldValue(id: string): K1FieldValueRecord | undefined {
    return fieldValues.get(id)
  },

  /**
   * Writes a new `reviewer_corrected_value` / `normalized_value`.
   * Enforces raw_value and original_value are never mutated.
   */
  updateFieldCorrection(
    id: string,
    args: {
      reviewerCorrectedValue: string | null
      normalizedValue: string | null
      reviewStatus?: K1FieldReviewStatus
    },
  ): K1FieldValueRecord {
    const rec = fieldValues.get(id)
    if (!rec) throw new Error(`Unknown k1_field_value ${id}`)
    const next: K1FieldValueRecord = {
      ...rec,
      reviewerCorrectedValue: args.reviewerCorrectedValue,
      normalizedValue: args.normalizedValue,
      reviewStatus: args.reviewStatus ?? 'REVIEWED',
      updatedAt: new Date(),
    }
    // Invariant: raw_value must not change (defense-in-depth; the trigger will also catch this).
    if (next.rawValue !== rec.rawValue || next.originalValue !== rec.originalValue) {
      throw new Error('raw_value / original_value is immutable')
    }
    fieldValues.set(id, next)

    // Keep the per-K-1 reportedDistributions map in sync when the Box 19 field
    // is corrected, so any legacy readers (and finalize's snapshot) see the
    // reviewer-corrected amount rather than the original parse.
    if (isReportedDistributionField(next.fieldName)) {
      const effective = fieldValueFor(next)
      const existing = reportedDistributions.get(next.k1DocumentId)
      if (existing) {
        existing.reportedDistributionAmount = effective
      } else {
        reportedDistributions.set(next.k1DocumentId, {
          id: randomUUID(),
          k1DocumentId: next.k1DocumentId,
          reportedDistributionAmount: effective,
        })
      }
    }
    return next
  },

  // ---- reported distributions ----

  getReportedDistribution(k1DocumentId: string): K1ReportedDistributionRecord | undefined {
    return reportedDistributions.get(k1DocumentId)
  },

  getEffectiveReportedDistribution(k1DocumentId: string): K1ReportedDistributionRecord | undefined {
    // Source of truth is the Box 19 distribution row in `k1_field_values`, because that
    // row carries reviewer corrections (via `updateFieldCorrection`) whereas the legacy
    // `reportedDistributions` map is only written at parse time and never re-synced.
    // Reading the field first means reviewer-corrected amounts flow to the Partnership /
    // Entity / Entities rollups and to finalize's `partnership_annual_activity`.
    // Two canonical names exist: stub extractor emits `box_19a_distribution`; AWS BDA
    // emits `box_19_distributions`. See `REPORTED_DISTRIBUTION_FIELD_NAMES`.
    const distributionField = [...fieldValues.values()].find(
      (field) => field.k1DocumentId === k1DocumentId && isReportedDistributionField(field.fieldName),
    )
    if (distributionField) {
      return {
        id: `derived:${k1DocumentId}`,
        k1DocumentId,
        reportedDistributionAmount: fieldValueFor(distributionField),
      }
    }

    // Fallback to the legacy per-K-1 map (seed fixtures, K-1s missing a field row).
    return reportedDistributions.get(k1DocumentId)
  },

  upsertReportedDistribution(
    k1DocumentId: string,
    amount: string | null,
  ): K1ReportedDistributionRecord {
    const existing = reportedDistributions.get(k1DocumentId)
    if (existing) {
      existing.reportedDistributionAmount = amount
      reportedDistributions.set(k1DocumentId, existing)
      return existing
    }
    const rec: K1ReportedDistributionRecord = {
      id: randomUUID(),
      k1DocumentId,
      reportedDistributionAmount: amount,
    }
    reportedDistributions.set(k1DocumentId, rec)
    return rec
  },

  // ---- partnership_annual_activity ----

  upsertPartnershipAnnualActivity(args: {
    entityId: string
    partnershipId: string
    taxYear: number
    reportedDistributionAmount: string | null
    originalCommitmentAmount?: string | null
    percentCalled?: string | null
    unfundedAmount?: string | null
    paidInAmount?: string | null
    residualValueAmount?: string | null
    dpi?: string | null
    rvpi?: string | null
    tvpi?: string | null
    sourceHasK1?: boolean
    sourceHasCapitalActivity?: boolean
    sourceHasFmv?: boolean
    sourceHasManualInput?: boolean
    commitmentSourceType?: string | null
    paidInSourceType?: string | null
    distributionSourceType?: string | null
    residualValueSourceType?: string | null
    returnMetricsSourceType?: string | null
    finalizedFromK1DocumentId?: string | null
  }): PartnershipAnnualActivityRecord {
    const key = activityKey(args.entityId, args.partnershipId, args.taxYear)
    const existing = partnershipAnnualActivity.get(key)
    const now = new Date()
    if (existing) {
      existing.reportedDistributionAmount = args.reportedDistributionAmount
      if ('originalCommitmentAmount' in args) existing.originalCommitmentAmount = args.originalCommitmentAmount ?? null
      if ('percentCalled' in args) existing.percentCalled = args.percentCalled ?? null
      if ('unfundedAmount' in args) existing.unfundedAmount = args.unfundedAmount ?? null
      if ('paidInAmount' in args) existing.paidInAmount = args.paidInAmount ?? null
      if ('residualValueAmount' in args) existing.residualValueAmount = args.residualValueAmount ?? null
      if ('dpi' in args) existing.dpi = args.dpi ?? null
      if ('rvpi' in args) existing.rvpi = args.rvpi ?? null
      if ('tvpi' in args) existing.tvpi = args.tvpi ?? null
      existing.sourceHasK1 = args.sourceHasK1 ?? existing.sourceHasK1
      existing.sourceHasCapitalActivity = args.sourceHasCapitalActivity ?? existing.sourceHasCapitalActivity
      existing.sourceHasFmv = args.sourceHasFmv ?? existing.sourceHasFmv
      existing.sourceHasManualInput = args.sourceHasManualInput ?? existing.sourceHasManualInput
      if ('commitmentSourceType' in args) existing.commitmentSourceType = args.commitmentSourceType ?? null
      if ('paidInSourceType' in args) existing.paidInSourceType = args.paidInSourceType ?? null
      if ('distributionSourceType' in args) existing.distributionSourceType = args.distributionSourceType ?? null
      if ('residualValueSourceType' in args) existing.residualValueSourceType = args.residualValueSourceType ?? null
      if ('returnMetricsSourceType' in args) existing.returnMetricsSourceType = args.returnMetricsSourceType ?? null
      if ('finalizedFromK1DocumentId' in args) {
        existing.finalizedFromK1DocumentId = args.finalizedFromK1DocumentId ?? null
      }
      existing.updatedAt = now
      partnershipAnnualActivity.set(key, existing)
      return existing
    }
    const rec: PartnershipAnnualActivityRecord = {
      id: randomUUID(),
      entityId: args.entityId,
      partnershipId: args.partnershipId,
      taxYear: args.taxYear,
      reportedDistributionAmount: args.reportedDistributionAmount,
      originalCommitmentAmount: args.originalCommitmentAmount ?? null,
      percentCalled: args.percentCalled ?? null,
      unfundedAmount: args.unfundedAmount ?? null,
      paidInAmount: args.paidInAmount ?? null,
      residualValueAmount: args.residualValueAmount ?? null,
      dpi: args.dpi ?? null,
      rvpi: args.rvpi ?? null,
      tvpi: args.tvpi ?? null,
      sourceHasK1: args.sourceHasK1 ?? false,
      sourceHasCapitalActivity: args.sourceHasCapitalActivity ?? false,
      sourceHasFmv: args.sourceHasFmv ?? false,
      sourceHasManualInput: args.sourceHasManualInput ?? false,
      commitmentSourceType: args.commitmentSourceType ?? null,
      paidInSourceType: args.paidInSourceType ?? null,
      distributionSourceType: args.distributionSourceType ?? null,
      residualValueSourceType: args.residualValueSourceType ?? null,
      returnMetricsSourceType: args.returnMetricsSourceType ?? null,
      finalizedFromK1DocumentId: args.finalizedFromK1DocumentId ?? null,
      createdAt: now,
      updatedAt: now,
    }
    partnershipAnnualActivity.set(key, rec)
    return rec
  },

  getPartnershipAnnualActivity(
    entityId: string,
    partnershipId: string,
    taxYear: number,
  ): PartnershipAnnualActivityRecord | undefined {
    return partnershipAnnualActivity.get(activityKey(entityId, partnershipId, taxYear))
  },

  // ---- test helpers ----

  _debugReset(): void {
    fieldValues.clear()
    reportedDistributions.clear()
    partnershipAnnualActivity.clear()
  },

  _debugAllFieldValues(): K1FieldValueRecord[] {
    return [...fieldValues.values()]
  },
  _debugAllAnnualActivity(): PartnershipAnnualActivityRecord[] {
    return [...partnershipAnnualActivity.values()]
  },
  _debugDeleteReportedDistribution(k1DocumentId: string): void {
    reportedDistributions.delete(k1DocumentId)
  },
  _debugDeletePartnershipAnnualActivity(
    entityId: string,
    partnershipId: string,
    taxYear: number,
  ): void {
    partnershipAnnualActivity.delete(activityKey(entityId, partnershipId, taxYear))
  },
}

// Re-export for convenience in handlers.
export type { K1DocumentRecord, K1IssueRecord, PartnershipRecord, EntityRecord }
