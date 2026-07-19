import { z } from 'zod'
import { K1_TRACKER_FIELD_KEYS } from '../k1-tracker/k1-tracker.contracts.js'
import {
  PARTNERSHIP_AGGREGATION_SORTS,
  PARTNERSHIP_AGGREGATION_WORKFLOWS,
  PARTNERSHIP_DATA_QUALITIES,
  PARTNERSHIP_TYPES,
  type PartnershipAggregationPageSize,
  type PartnershipAggregationQuery,
} from './partnership-tracker.contracts.js'

export const partnershipTrackerUuidSchema = z.string().uuid()
export const partnershipTrackerMoneySchema = z.string().regex(/^-?\d+\.\d{2}$/, 'Use a money value with exactly two decimal places')
export const partnershipTrackerNonnegativeMoneySchema = z.string().regex(/^\d+\.\d{2}$/, 'Use a nonnegative money value with exactly two decimal places')
export const partnershipTrackerDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Use a valid calendar date')
export const partnershipTrackerDateTimeSchema = z.string().datetime({ offset: true })
export const partnershipTrackerRatioSchema = z.string()
  .regex(/^\d+\.\d{4,8}$/, 'Use a unit ratio with four to eight decimal places')
  .refine((value) => Number(value) >= 0 && Number(value) <= 1, 'Use a unit ratio between 0 and 1')
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

const aggregationCsv = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return [...new Set(values.flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean))]
}

const aggregationEnumValues = <T extends string>(value: unknown, allowed: readonly T[]): T[] => {
  const accepted = new Set<string>(allowed)
  return aggregationCsv(value).filter((item): item is T => accepted.has(item))
}

const aggregationPositiveInteger = (value: unknown, fallback: number) => {
  const candidate = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(candidate) && candidate > 0 ? candidate : fallback
}

export const partnershipAggregationQuerySchema = z.object({
  search: z.unknown().optional(),
  ownerIds: z.unknown().optional(),
  partnershipTypes: z.unknown().optional(),
  statuses: z.unknown().optional(),
  workflowStatuses: z.unknown().optional(),
  dataQuality: z.unknown().optional(),
  sort: z.unknown().optional(),
  direction: z.unknown().optional(),
  page: z.unknown().optional(),
  pageSize: z.unknown().optional(),
}).transform((raw): PartnershipAggregationQuery => {
  const searchValue = Array.isArray(raw.search) ? raw.search[0] : raw.search
  const search = typeof searchValue === 'string' ? searchValue.trim().slice(0, 200) : ''
  const ownerIds = aggregationCsv(raw.ownerIds).filter((value) => partnershipTrackerUuidSchema.safeParse(value).success).sort()
  const sortValue = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort
  const directionValue = Array.isArray(raw.direction) ? raw.direction[0] : raw.direction
  const requestedPageSize = aggregationPositiveInteger(raw.pageSize, 50)
  const pageSize: PartnershipAggregationPageSize = requestedPageSize === 25 || requestedPageSize === 100 ? requestedPageSize : 50
  return {
    ...(search ? { search } : {}),
    ownerIds,
    partnershipTypes: aggregationEnumValues(raw.partnershipTypes, PARTNERSHIP_TYPES),
    statuses: aggregationEnumValues(raw.statuses, ['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'] as const),
    workflowStatuses: aggregationEnumValues(raw.workflowStatuses, PARTNERSHIP_AGGREGATION_WORKFLOWS),
    dataQuality: aggregationEnumValues(raw.dataQuality, PARTNERSHIP_DATA_QUALITIES),
    sort: PARTNERSHIP_AGGREGATION_SORTS.includes(sortValue as never) ? sortValue as PartnershipAggregationQuery['sort'] : 'partnership',
    direction: directionValue === 'desc' ? 'desc' : 'asc',
    page: aggregationPositiveInteger(raw.page, 1),
    pageSize,
  }
})
export const partnershipTrackerPartnershipParamsSchema = z.object({ partnershipId: partnershipTrackerUuidSchema })
export const partnershipTrackerYearParamsSchema = partnershipTrackerPartnershipParamsSchema.extend({ taxYear: partnershipTrackerTaxYearSchema })
export const partnershipTrackerCommitmentParamsSchema = partnershipTrackerPartnershipParamsSchema.extend({ commitmentId: partnershipTrackerUuidSchema })
export const partnershipTrackerNavParamsSchema = partnershipTrackerPartnershipParamsSchema.extend({ navEntryId: partnershipTrackerUuidSchema })
export const partnershipTrackerCashFlowParamsSchema = partnershipTrackerYearParamsSchema.extend({ cashFlowId: partnershipTrackerUuidSchema })

const inceptionDateSchema = partnershipTrackerDateSchema.nullable().refine(
  (value) => value == null || value <= new Date().toISOString().slice(0, 10),
  'Inception date cannot be in the future',
)

const nullableProfileText = (max: number) => z.string().trim().max(max).nullable().optional()
const partnershipEinSchema = z.string().trim()
  .regex(/^\d{2}-?\d{7}$/, 'Use a nine-digit EIN, optionally formatted as XX-XXXXXXX')
  .transform((value) => value.replace('-', ''))
  .nullable()
  .optional()

export const createTrackedPartnershipBodySchema = z.object({
  entityId: partnershipTrackerUuidSchema,
  name: z.string().trim().min(1).max(120),
  partnershipType: partnershipTrackerTypeSchema,
  existingPartnershipId: partnershipTrackerUuidSchema.optional(),
  copyK1YearsFrom: z.object({
    partnershipId: partnershipTrackerUuidSchema,
    taxYears: z.array(partnershipTrackerTaxYearSchema).min(1).max(201)
      .transform((years) => [...new Set(years)].sort((left, right) => left - right)),
  }).optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  inceptionDate: inceptionDateSchema.optional(),
  managementFeeRate: partnershipTrackerRatioSchema.nullable().optional(),
  ein: partnershipEinSchema,
  fundManager: nullableProfileText(200),
  addressLine1: nullableProfileText(200),
  addressLine2: nullableProfileText(200),
  addressCity: nullableProfileText(120),
  addressRegion: nullableProfileText(120),
  addressPostalCode: nullableProfileText(30),
  addressCountry: nullableProfileText(120),
  initialValuationAmount: partnershipTrackerNonnegativeMoneySchema.nullable().optional(),
  initialValuationDate: partnershipTrackerDateSchema.nullable().optional(),
}).superRefine((body, context) => {
  if ((body.initialValuationAmount == null) !== (body.initialValuationDate == null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['initialValuationAmount'], message: 'Initial valuation amount and date must be entered together' })
  }
})
export const updateTrackedPartnershipBodySchema = z.object({
  entityId: partnershipTrackerUuidSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  partnershipType: partnershipTrackerTypeSchema.optional(),
  status: partnershipTrackerStatusSchema.optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  inceptionDate: inceptionDateSchema.optional(),
  managementFeeRate: partnershipTrackerRatioSchema.nullable().optional(),
  ein: partnershipEinSchema,
  fundManager: nullableProfileText(200),
  addressLine1: nullableProfileText(200),
  addressLine2: nullableProfileText(200),
  addressCity: nullableProfileText(120),
  addressRegion: nullableProfileText(120),
  addressPostalCode: nullableProfileText(30),
  addressCountry: nullableProfileText(120),
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
export const managementFeeQuerySchema = z.object({ asOfDate: partnershipTrackerDateSchema.optional() })

export const createPartnershipCashFlowBodySchema = z.object({
  kind: z.enum(['CAPITAL_CALL', 'DISTRIBUTION', 'RECALLABLE_DISTRIBUTION']),
  activityDate: partnershipTrackerDateSchema,
  amount: partnershipTrackerNonnegativeMoneySchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
  note: z.string().trim().max(2_000).nullable().optional(),
})

export const createPartnershipCashFlowsBodySchema = z.object({
  entries: z.array(createPartnershipCashFlowBodySchema).min(1).max(50),
})

export const manualFieldChangeSchema = z.object({
  fieldKey: z.enum(K1_TRACKER_FIELD_KEYS),
  amount: partnershipTrackerMoneySchema.nullable(),
  textValue: z.string().trim().max(2_000).nullable().optional(),
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
  if (change.fieldKey === 'box_13_other_deductions') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fieldKey'],
      message: 'Use Other Portfolio Deductions and Management Fees. The combined Line 13 field is retained only for legacy provenance.',
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
