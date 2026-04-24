import { z } from 'zod'

const uuidSchema = z.string().uuid()

export const k1ReviewParamsSchema = z.object({
  k1DocumentId: uuidSchema,
})

export const k1ReviewIssueParamsSchema = z.object({
  k1DocumentId: uuidSchema,
  issueId: uuidSchema,
})

// Corrections ---------------------------------------------------------------

const correctionItemSchema = z
  .object({
    fieldId: uuidSchema,
    value: z.string().max(1000).nullable(),
  })
  .strict()

export const correctionsBodySchema = z
  .object({
    corrections: z.array(correctionItemSchema).min(1).max(200),
  })
  .strict()

// Mapping -------------------------------------------------------------------

export const mapEntityBodySchema = z
  .object({
    entityId: uuidSchema,
  })
  .strict()

export const mapPartnershipBodySchema = z
  .object({
    partnershipId: uuidSchema,
  })
  .strict()

// Issues --------------------------------------------------------------------

export const openIssueBodySchema = z
  .object({
    message: z.string().max(2000).optional(),
    k1FieldValueId: uuidSchema.optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    issueType: z.string().max(100).optional(),
  })
  .strict()

// Value format validators ---------------------------------------------------

const currencyRe = /^-?\d{1,18}(\.\d{1,2})?$/
const isoDateRe = /^\d{4}-\d{2}-\d{2}$/

export const validateFieldValueFormat = (
  fieldName: string,
  value: string | null,
): { ok: true } | { ok: false; error: string } => {
  if (value == null) return { ok: true }
  const lower = fieldName.toLowerCase()
  if (lower.includes('date') || lower.includes('_on')) {
    if (!isoDateRe.test(value)) return { ok: false, error: 'INVALID_DATE_FORMAT' }
    return { ok: true }
  }
  if (
    lower.startsWith('box_') ||
    lower.includes('amount') ||
    lower.includes('distribution') ||
    lower === 'reported_distribution_amount'
  ) {
    if (!currencyRe.test(value)) return { ok: false, error: 'INVALID_CURRENCY_FORMAT' }
    return { ok: true }
  }
  // free text: length already capped by zod
  return { ok: true }
}

export type CorrectionsBody = z.infer<typeof correctionsBodySchema>
export type MapEntityBody = z.infer<typeof mapEntityBodySchema>
export type MapPartnershipBody = z.infer<typeof mapPartnershipBodySchema>
export type OpenIssueBody = z.infer<typeof openIssueBodySchema>
