import { z } from 'zod'
import {
  K1_TRACKER_FIELD_KEYS,
  K1_TRACKER_SOURCE_TYPES,
  K1_TRACKER_WORKFLOW_STATUSES,
} from './k1-tracker.contracts.js'
import { k1OfficialFormDataSchema } from './k1-official-form.zod.js'

const money = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/, 'Use a money value with at most two decimals')
const uuid = z.string().uuid()
const taxYear = z.coerce.number().int().min(1900).max(2100)

export const trackerPartnershipParamsSchema = z.object({ partnershipId: uuid })
export const trackerYearParamsSchema = trackerPartnershipParamsSchema.extend({ taxYear })
export const trackerImportParamsSchema = z.object({ importBatchId: uuid })
export const trackerListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(K1_TRACKER_WORKFLOW_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const fieldChangeSchema = z.object({
  fieldKey: z.enum(K1_TRACKER_FIELD_KEYS),
  amount: money.nullable(),
  sourceType: z.enum(['MANUAL_ENTRY', 'MANUAL_OVERRIDE']),
  overrideReason: z.string().trim().min(1).max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.fieldKey === 'section_l_capital_contributed') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fieldKey'],
      message: 'Use capital_contributions. Section L contributions is retained only for legacy provenance.',
    })
  }
  if (value.fieldKey === 'box_13_other_deductions') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fieldKey'],
      message: 'Use Other Portfolio Deductions and Management Fees. The combined Line 13 field is retained only for legacy provenance.',
    })
  }
  if (value.sourceType === 'MANUAL_OVERRIDE' && !value.overrideReason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['overrideReason'], message: 'An override reason is required' })
  }
})

export const createTrackerYearBodySchema = z.object({
  taxYear,
  expectedPartnershipRevision: z.number().int().min(0).optional(),
  values: z.array(fieldChangeSchema).default([]),
})
export const updateTrackerYearBodySchema = z.object({
  expectedRevision: z.number().int().min(1),
  changes: z.array(fieldChangeSchema).default([]),
  officialFormData: k1OfficialFormDataSchema.optional(),
}).superRefine((body, ctx) => {
  if (!body.changes.length && body.officialFormData === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['changes'], message: 'Change at least one K-1 value.' })
  }
})
export const calculateTrackerYearBodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  changes: z.array(fieldChangeSchema).default([]),
})
export const deleteTrackerYearQuerySchema = z.object({ expectedRevision: z.coerce.number().int().min(1) })
export const signoffBodySchema = z.object({
  expectedRevision: z.number().int().min(1),
  action: z.enum(['PREPARED', 'REVIEWED', 'INVALIDATED']),
  reason: z.string().trim().max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'INVALIDATED' && !value.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A reason is required when invalidating sign-off' })
  }
})
export const importCommitBodySchema = z.object({
  targetPartnershipId: uuid,
  decisions: z.array(z.object({
    sheetName: z.string().trim().min(1).max(250),
    taxYear,
    action: z.enum(['SKIP', 'MERGE', 'REPLACE']),
    expectedRevision: z.number().int().min(1).nullable().optional(),
  })).min(1),
})
