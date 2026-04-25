import { z } from 'zod'

// ---------------------------------------------------------------------------
// Scalar schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid()

export const partnershipStatusSchema = z.enum(['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'])

export const fmvSourceSchema = z.enum([
  'manager_statement',
  'valuation_409a',
  'k1',
  'manual',
])

// ---------------------------------------------------------------------------
// List / directory query
// ---------------------------------------------------------------------------

export const listPartnershipsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  entityId: uuidSchema.optional(),
  assetClass: z.string().max(100).optional(),
  status: z
    .union([partnershipStatusSchema, z.array(partnershipStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  sort: z
    .enum([
      'name',
      '-name',
      'entity',
      '-entity',
      'assetClass',
      '-assetClass',
      'latestK1Year',
      '-latestK1Year',
      'latestDistributionUsd',
      '-latestDistributionUsd',
      'latestFmvAmountUsd',
      '-latestFmvAmountUsd',
      'status',
      '-status',
    ])
    .optional()
    .default('name'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export type ListPartnershipsQuery = z.output<typeof listPartnershipsQuerySchema>

// ---------------------------------------------------------------------------
// Export query (same filter params, no pagination)
// ---------------------------------------------------------------------------

export const exportPartnershipsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  entityId: uuidSchema.optional(),
  assetClass: z.string().max(100).optional(),
  status: z
    .union([partnershipStatusSchema, z.array(partnershipStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
})

export type ExportPartnershipsQuery = z.output<typeof exportPartnershipsQuerySchema>

// ---------------------------------------------------------------------------
// Partnership CRUD
// ---------------------------------------------------------------------------

export const createPartnershipBodySchema = z.object({
  entityId: uuidSchema,
  name: z.string().min(1).max(120).transform((v) => v.trim()),
  assetClass: z.string().max(100).nullish(),
  status: partnershipStatusSchema.optional().default('ACTIVE'),
  notes: z.string().max(10_000).nullish(),
})

export type CreatePartnershipBody = z.output<typeof createPartnershipBodySchema>

export const updatePartnershipBodySchema = z
  .object({
    name: z.string().min(1).max(120).transform((v) => v.trim()).optional(),
    assetClass: z.string().max(100).nullish(),
    status: partnershipStatusSchema.optional(),
    notes: z.string().max(10_000).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export type UpdatePartnershipBody = z.output<typeof updatePartnershipBodySchema>

export const partnershipParamsSchema = z.object({ id: uuidSchema })

// ---------------------------------------------------------------------------
// FMV snapshots
// ---------------------------------------------------------------------------

export const createFmvSnapshotBodySchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  amountUsd: z.number(),
  source: fmvSourceSchema,
  note: z.string().max(2_000).nullish(),
})

export type CreateFmvSnapshotBody = z.output<typeof createFmvSnapshotBodySchema>

// ---------------------------------------------------------------------------
// Entity detail
// ---------------------------------------------------------------------------

export const entityParamsSchema = z.object({ id: uuidSchema })
