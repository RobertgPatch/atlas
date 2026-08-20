import { z } from 'zod'
import { config } from '../../config.js'
import { K1_INGESTION_ERROR_CODES, K1_STATUSES } from './k1.types.js'

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
export const k1Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
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

export const retryExtractionBodySchema = z.object({
  expectedDocumentVersion: z.number().int().min(0),
}).strict()

export const applyPreviewBodySchema = z.object({
  expectedDocumentVersion: z.number().int().nonnegative(),
}).strict()

export const k1ApplicationDecisionSchema = z.enum(['USE_EXTRACTED', 'KEEP_EXISTING', 'SKIP_UNMAPPED'])

export const applyK1BodySchema = z.object({
  applicationId: uuidSchema,
  expectedDocumentVersion: z.number().int().nonnegative(),
  expectedTrackerRevision: z.number().int().positive(),
  decisions: z.array(z.object({
    decisionId: uuidSchema,
    decision: k1ApplicationDecisionSchema,
    reason: z.string().trim().min(3).max(500).nullable().optional(),
  }).strict()).max(100),
}).strict()

// Upload body parser ----------------------------------------------------------

export const uploadBodySchema = z.object({
  entityId: uuidSchema,
  replaceDocumentId: uuidSchema.optional(),
})

export const createIngestionBatchSchema = z.object({
  entityScopeId: uuidSchema.nullish(),
  files: z.array(z.object({
    fileName: z.string().trim().min(1).max(255)
      .refine((value) => !/[\\/\0-\x1f]/.test(value), 'File name contains unsupported characters.'),
    sizeBytes: z.number().int().min(1).max(config.k1Ingestion.uploadMaxBytes),
    sha256: k1Sha256Schema,
    mimeType: z.literal('application/pdf').optional().default('application/pdf'),
  }).strict()).min(1).max(config.k1Ingestion.batchMaxFiles),
}).strict()

export const ingestionBatchParamsSchema = z.object({ batchId: uuidSchema })
export const ingestionItemParamsSchema = z.object({ itemId: uuidSchema })

export const ingestionBatchListSchema = z.object({
  entity_id: uuidSchema.optional(),
  status: z.enum(['OPEN', 'PROCESSING', 'ACTION_REQUIRED', 'COMPLETED', 'PARTIAL_FAILURE', 'CANCELLED']).optional(),
  attention_only: z.string().transform((value) => value === 'true').pipe(z.boolean()).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().max(512).optional(),
}).strict()

export const completeIngestionUploadsSchema = z.object({
  items: z.array(z.object({
    itemId: uuidSchema,
    sha256: k1Sha256Schema,
    objectVersionId: z.string().max(1_024).nullish(),
  }).strict()).min(1).max(config.k1Ingestion.batchMaxFiles),
}).strict()

export const localUploadHeadersSchema = z.object({
  'content-type': z.string().refine(
    (value) => value.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf',
    'Content-Type must be application/pdf.',
  ),
  'content-length': z.coerce.number().int().min(1).max(config.k1Ingestion.uploadMaxBytes),
  'x-amz-checksum-sha256': k1Sha256Schema,
})

export const k1IngestionErrorSchema = z.object({
  error: z.enum(K1_INGESTION_ERROR_CODES),
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
  requestId: z.string().max(100).optional(),
  itemId: uuidSchema.optional(),
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
export type CreateIngestionBatchBody = z.infer<typeof createIngestionBatchSchema>
export type CompleteIngestionUploadsBody = z.infer<typeof completeIngestionUploadsSchema>
