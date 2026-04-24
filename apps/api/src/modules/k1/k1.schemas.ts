import { z } from 'zod'
import { K1_STATUSES } from './k1.types.js'

// Shared scalar parsers -------------------------------------------------------

export const k1StatusSchema = z.enum(K1_STATUSES)

export const k1SortSchema = z.enum([
  'uploaded_at',
  'partnership',
  'entity',
  'tax_year',
  'status',
  'issues',
])

const uuidSchema = z.string().uuid()
const taxYearSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(new Date().getFullYear() + 1)

// Query parsers ---------------------------------------------------------------

export const listQuerySchema = z.object({
  tax_year: taxYearSchema.optional(),
  entity_id: uuidSchema.optional(),
  status: k1StatusSchema.optional(),
  q: z.string().max(200).optional(),
  sort: k1SortSchema.optional().default('uploaded_at'),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().max(512).optional(),
})

export const kpiQuerySchema = z
  .object({
    tax_year: taxYearSchema.optional(),
    entity_id: uuidSchema.optional(),
  })
  // Deliberately reject status / q so KPIs can't be distorted by finding-level filters (FR-004).
  .strict()

export const detailParamsSchema = z.object({
  k1DocumentId: uuidSchema,
})

// Upload body parser ----------------------------------------------------------

export const uploadBodySchema = z.object({
  partnershipId: uuidSchema,
  entityId: uuidSchema,
  taxYear: taxYearSchema,
  replaceDocumentId: uuidSchema.optional(),
})

export const exportQuerySchema = z.object({
  tax_year: taxYearSchema.optional(),
  entity_id: uuidSchema.optional(),
  status: k1StatusSchema.optional(),
  q: z.string().max(200).optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>
export type KpiQuery = z.infer<typeof kpiQuerySchema>
export type UploadBody = z.infer<typeof uploadBodySchema>
export type ExportQuery = z.infer<typeof exportQuerySchema>
