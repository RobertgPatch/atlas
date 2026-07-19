import { z } from 'zod'
import { K1_TRACKER_FIELD_KEYS } from '../k1-tracker/k1-tracker.contracts.js'
import { PARTNERSHIP_TYPES } from './partnership-tracker.contracts.js'

export const partnershipTrackerUuidSchema = z.string().uuid()
export const partnershipTrackerMoneySchema = z.string().regex(/^-?\d+\.\d{2}$/, 'Use a money value with exactly two decimal places')
export const partnershipTrackerNonnegativeMoneySchema = z.string().regex(/^\d+\.\d{2}$/, 'Use a nonnegative money value with exactly two decimal places')
export const partnershipTrackerDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Use a valid calendar date')
export const partnershipTrackerDateTimeSchema = z.string().datetime({ offset: true })
export const partnershipTrackerTypeSchema = z.enum(PARTNERSHIP_TYPES)
export const partnershipTrackerStatusSchema = z.enum(['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'])
export const partnershipTrackerTaxYearSchema = z.coerce.number().int().min(1900).max(2100)

export const partnershipTrackerListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  entityId: partnershipTrackerUuidSchema.optional(),
  partnershipType: partnershipTrackerTypeSchema.optional(),
  status: partnershipTrackerStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().regex(/^\d+$/).optional(),
})
export const partnershipTrackerPartnershipParamsSchema = z.object({ partnershipId: partnershipTrackerUuidSchema })
export const partnershipTrackerYearParamsSchema = partnershipTrackerPartnershipParamsSchema.extend({ taxYear: partnershipTrackerTaxYearSchema })
export const partnershipTrackerCommitmentParamsSchema = partnershipTrackerPartnershipParamsSchema.extend({ commitmentId: partnershipTrackerUuidSchema })
export const partnershipTrackerNavParamsSchema = partnershipTrackerPartnershipParamsSchema.extend({ navEntryId: partnershipTrackerUuidSchema })

export const createTrackedPartnershipBodySchema = z.object({
  entityId: partnershipTrackerUuidSchema,
  name: z.string().trim().min(1).max(120),
  partnershipType: partnershipTrackerTypeSchema,
  notes: z.string().trim().max(10_000).nullable().optional(),
})
export const updateTrackedPartnershipBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  partnershipType: partnershipTrackerTypeSchema.optional(),
  status: partnershipTrackerStatusSchema.optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  expectedUpdatedAt: partnershipTrackerDateTimeSchema,
}).refine((body) => Object.keys(body).some((key) => key !== 'expectedUpdatedAt'), { message: 'At least one editable field is required' })

export const createCommitmentBodySchema = z.object({
  amount: partnershipTrackerNonnegativeMoneySchema,
  effectiveDate: partnershipTrackerDateSchema,
  note: z.string().trim().max(2_000).nullable().optional(),
})
export const updateCommitmentBodySchema = z.object({
  amount: partnershipTrackerNonnegativeMoneySchema.optional(),
  effectiveDate: partnershipTrackerDateSchema.optional(),
  note: z.string().trim().max(2_000).nullable().optional(),
  expectedUpdatedAt: partnershipTrackerDateTimeSchema,
}).refine((body) => Object.keys(body).some((key) => key !== 'expectedUpdatedAt'), { message: 'At least one editable field is required' })

export const createNavBodySchema = z.object({
  amount: partnershipTrackerNonnegativeMoneySchema,
  valuationDate: partnershipTrackerDateSchema,
  note: z.string().trim().max(2_000).nullable().optional(),
})
export const updateNavBodySchema = z.object({
  amount: partnershipTrackerNonnegativeMoneySchema.optional(),
  valuationDate: partnershipTrackerDateSchema.optional(),
  note: z.string().trim().max(2_000).nullable().optional(),
  expectedUpdatedAt: partnershipTrackerDateTimeSchema,
}).refine((body) => Object.keys(body).some((key) => key !== 'expectedUpdatedAt'), { message: 'At least one editable field is required' })
export const expectedUpdatedAtQuerySchema = z.object({ expectedUpdatedAt: partnershipTrackerDateTimeSchema })
export const commitmentListQuerySchema = z.object({ asOfDate: partnershipTrackerDateSchema.optional() })

export const manualFieldChangeSchema = z.object({
  fieldKey: z.enum(K1_TRACKER_FIELD_KEYS),
  amount: partnershipTrackerMoneySchema.nullable(),
  sourceType: z.enum(['MANUAL_ENTRY', 'MANUAL_OVERRIDE']),
  overrideReason: z.string().trim().min(1).max(2_000).nullable().optional(),
}).superRefine((change, context) => {
  if (change.fieldKey === 'section_l_capital_contributed') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fieldKey'],
      message: 'Use capital_contributions. Section L contributions is retained only for legacy provenance.',
    })
  }
  if (change.sourceType === 'MANUAL_OVERRIDE' && !change.overrideReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['overrideReason'], message: 'An override reason is required' })
  }
})
export const createManualYearBodySchema = z.object({ taxYear: partnershipTrackerTaxYearSchema })
export const updateManualYearBodySchema = z.object({ expectedRevision: z.number().int().min(1), changes: z.array(manualFieldChangeSchema).min(1) })
export const calculateManualYearBodySchema = z.object({ expectedRevision: z.number().int().min(0), changes: z.array(manualFieldChangeSchema).default([]) })
export const deleteManualYearQuerySchema = z.object({ expectedRevision: z.coerce.number().int().min(1) })
export const partnershipTrackerSignoffBodySchema = z.object({
  expectedRevision: z.number().int().min(1),
  action: z.enum(['PREPARE', 'REVIEW', 'INVALIDATE']),
  reason: z.string().trim().max(2_000).nullable().optional(),
}).superRefine((body, context) => {
  if (body.action === 'INVALIDATE' && !body.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A reason is required to invalidate sign-off' })
})
