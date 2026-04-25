import { z } from 'zod'

const uuidSchema = z.string().uuid()

const dateRangeSchema = z.enum(['all', '1y', '3y', '5y'])

const monetaryAmountSchema = z.number().finite().min(0).max(999_999_999_999.99)

const sharedReportsFilterShape = {
  search: z.string().max(200).optional(),
  dateRange: z.union([dateRangeSchema, z.string().max(32)]).optional().default('all'),
  entityType: z.string().max(100).optional(),
  entityId: uuidSchema.optional(),
  partnershipId: uuidSchema.optional(),
  taxYear: z.coerce.number().int().min(1900).max(9999).optional(),
} as const

const portfolioSortFields = [
  'entityName',
  'partnershipCount',
  'originalCommitmentUsd',
  'calledPct',
  'unfundedUsd',
  'paidInUsd',
  'distributionsUsd',
  'residualValueUsd',
  'dpi',
  'rvpi',
  'tvpi',
  'irr',
] as const

const assetClassSortFields = [
  'assetClass',
  'partnershipCount',
  'originalCommitmentUsd',
  'calledPct',
  'unfundedUsd',
  'paidInUsd',
  'distributionsUsd',
  'residualValueUsd',
  'dpi',
  'rvpi',
  'tvpi',
  'irr',
] as const

const activityDetailSortFields = [
  'taxYear',
  'entityName',
  'partnershipName',
  'distributionsUsd',
  'endingBasisUsd',
  'updatedAt',
] as const

const reportTypeSchema = z.enum([
  'portfolio_summary',
  'asset_class_summary',
  'activity_detail',
])

const exportFormatSchema = z.enum(['csv', 'xlsx'])

export const activityDetailRowParamsSchema = z.object({
  rowId: uuidSchema,
})

export const portfolioSummaryQuerySchema = z.object({
  ...sharedReportsFilterShape,
  sort: z.enum(portfolioSortFields).optional().default('entityName'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const assetClassSummaryQuerySchema = z.object({
  ...sharedReportsFilterShape,
  sort: z.enum(assetClassSortFields).optional().default('assetClass'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
})

export const activityDetailQuerySchema = z.object({
  ...sharedReportsFilterShape,
  sort: z.enum(activityDetailSortFields).optional().default('taxYear'),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const exportReportQuerySchema = z.object({
  reportType: reportTypeSchema,
  format: exportFormatSchema,
  ...sharedReportsFilterShape,
  sort: z.string().max(120).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
})

export const updateActivityDetailBodySchema = z
  .object({
    beginningBasisUsd: monetaryAmountSchema.nullish(),
    contributionsUsd: monetaryAmountSchema.nullish(),
    otherAdjustmentsUsd: monetaryAmountSchema.nullish(),
    endingGlBalanceUsd: monetaryAmountSchema.nullish(),
    notes: z.string().max(10_000).nullish(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((value) => {
    const editableFields: Array<keyof Omit<typeof value, 'expectedUpdatedAt'>> = [
      'beginningBasisUsd',
      'contributionsUsd',
      'otherAdjustmentsUsd',
      'endingGlBalanceUsd',
      'notes',
    ]

    return editableFields.some((field) => field in value)
  }, {
    message: 'At least one editable field is required',
  })

export const updatePortfolioCommitmentBodySchema = z.object({
  partnershipId: uuidSchema,
  commitmentId: uuidSchema,
  commitmentAmountUsd: monetaryAmountSchema,
  expectedUpdatedAt: z.string().datetime().optional(),
})

export type PortfolioSummaryQuery = z.output<typeof portfolioSummaryQuerySchema>
export type AssetClassSummaryQuery = z.output<typeof assetClassSummaryQuerySchema>
export type ActivityDetailQuery = z.output<typeof activityDetailQuerySchema>
export type ActivityDetailRowParams = z.output<typeof activityDetailRowParamsSchema>
export type UpdateActivityDetailBody = z.output<typeof updateActivityDetailBodySchema>
export type UpdatePortfolioCommitmentBody = z.output<
  typeof updatePortfolioCommitmentBodySchema
>
export type ReportExportQuery = z.output<typeof exportReportQuerySchema>
export type ReportExportFormat = z.output<typeof exportFormatSchema>
export type ReportType = z.output<typeof reportTypeSchema>
