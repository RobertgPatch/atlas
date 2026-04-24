// In-memory data stores and helpers for Feature 003 (K-1 Review and Finalization).
// Extends the 002 `k1.repository` stores with field values, reported distributions,
// and partnership_annual_activity. Uses the same "one-process in-memory Maps" pattern.

import { randomUUID } from 'node:crypto'
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
// `box_19a_distribution`; the real Azure Document Intelligence pipeline emits
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
    // Two canonical names exist: stub extractor emits `box_19a_distribution`; Azure DI
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
