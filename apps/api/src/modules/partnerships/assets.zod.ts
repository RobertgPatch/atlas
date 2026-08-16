import { z } from 'zod'

const uuidSchema = z.string().uuid()
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')

export const partnershipAssetSourceSchema = z.enum(['manual', 'imported', 'plaid'])

export const partnershipAssetCategorySchema = z.enum([
  'real_estate',
  'marketable_securities',
  'alternatives',
  'cash_equivalents',
  'other',
])

export const partnershipAssetStatusSchema = z.enum(['ACTIVE', 'INACTIVE'])

export const assetFmvSourceSchema = z.enum([
  'manual',
  'manager_statement',
  'valuation_409a',
  'k1',
  'imported',
  'plaid',
])

export const partnershipAssetParamsSchema = z.object({
  partnershipId: uuidSchema,
  assetId: uuidSchema,
})

export const partnershipAssetsParamsSchema = z.object({
  partnershipId: uuidSchema,
})

export const createAssetFmvSnapshotBodySchema = z.object({
  valuationDate: isoDateSchema,
  amountUsd: z.number().min(0),
  source: assetFmvSourceSchema,
  confidenceLabel: z.string().max(120).nullish(),
  note: z.string().max(2_000).nullish(),
})

export const createPartnershipAssetBodySchema = z.object({
  name: z.string().min(1).max(160).transform((value) => value.trim()),
  assetCategory: partnershipAssetCategorySchema.optional(),
  assetType: z.string().min(1).max(80).transform((value) => value.trim()),
  displayDetail: z.string().max(240).nullish(),
  description: z.string().max(2_000).nullish(),
  notes: z.string().max(10_000).nullish(),
  initialValuation: createAssetFmvSnapshotBodySchema.nullish(),
})

export const updatePartnershipAssetBodySchema = z.object({
  name: z.string().min(1).max(160).transform((value) => value.trim()).optional(),
  assetCategory: partnershipAssetCategorySchema.optional(),
  assetType: z.string().min(1).max(80).transform((value) => value.trim()).optional(),
  status: partnershipAssetStatusSchema.optional(),
  displayDetail: z.string().max(240).nullish(),
  description: z.string().max(2_000).nullish(),
  notes: z.string().max(10_000).nullish(),
}).refine((body) => Object.values(body).some((value) => value !== undefined), {
  message: 'At least one asset field is required',
})

export type CreatePartnershipAssetBody = z.output<typeof createPartnershipAssetBodySchema>
export type UpdatePartnershipAssetBody = z.output<typeof updatePartnershipAssetBodySchema>
export type CreateAssetFmvSnapshotBody = z.output<typeof createAssetFmvSnapshotBodySchema>
