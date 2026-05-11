import { z } from 'zod'

const uuidSchema = z.string().uuid()
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
const commitmentAmountSchema = z
  .number()
  .finite()
  .min(0)
  .max(999_999_999_999.99)

export const commitmentStatusSchema = z.enum(['ACTIVE', 'INACTIVE'])
export const capitalSourceTypeSchema = z.enum(['manual', 'parsed'])
export const capitalEventTypeSchema = z.enum([
  'capital_call',
  'funded_contribution',
  'other_adjustment',
])

export const partnershipCommitmentsParamsSchema = z.object({
  partnershipId: uuidSchema,
})

export const partnershipCommitmentParamsSchema = z.object({
  partnershipId: uuidSchema,
  commitmentId: uuidSchema,
})

export const capitalActivityParamsSchema = z.object({
  partnershipId: uuidSchema,
})

export const capitalActivityEventParamsSchema = z.object({
  partnershipId: uuidSchema,
  eventId: uuidSchema,
})

export const createCommitmentBodySchema = z
  .object({
    commitmentAmountUsd: commitmentAmountSchema,
    commitmentDate: isoDateSchema.nullish(),
    commitmentStartDate: isoDateSchema.nullish(),
    commitmentEndDate: isoDateSchema.nullish(),
    status: commitmentStatusSchema.optional().default('ACTIVE'),
    sourceType: capitalSourceTypeSchema.optional().default('manual'),
    notes: z.string().max(10_000).nullish(),
  })
  .superRefine((value, ctx) => {
    if (
      value.commitmentStartDate &&
      value.commitmentEndDate &&
      value.commitmentStartDate > value.commitmentEndDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commitmentStartDate'],
        message: 'commitmentStartDate cannot be after commitmentEndDate',
      })
    }
  })

export const updateCommitmentBodySchema = z
  .object({
    commitmentAmountUsd: commitmentAmountSchema.optional(),
    commitmentDate: isoDateSchema.nullish(),
    commitmentStartDate: isoDateSchema.nullish(),
    commitmentEndDate: isoDateSchema.nullish(),
    status: commitmentStatusSchema.optional(),
    sourceType: capitalSourceTypeSchema.optional(),
    notes: z.string().max(10_000).nullish(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required',
  })
  .superRefine((value, ctx) => {
    if (
      value.commitmentStartDate &&
      value.commitmentEndDate &&
      value.commitmentStartDate > value.commitmentEndDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commitmentStartDate'],
        message: 'commitmentStartDate cannot be after commitmentEndDate',
      })
    }
  })

export const createCapitalActivityBodySchema = z
  .object({
    activityDate: isoDateSchema,
    eventType: capitalEventTypeSchema,
    amountUsd: z.number(),
    sourceType: capitalSourceTypeSchema.optional().default('manual'),
    notes: z.string().max(10_000).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.amountUsd === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountUsd'],
        message: 'amountUsd must be non-zero',
      })
    }
    if (
      (value.eventType === 'capital_call' || value.eventType === 'funded_contribution') &&
      value.amountUsd < 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountUsd'],
        message: 'amountUsd must be positive for this event type',
      })
    }
  })

export const updateCapitalActivityBodySchema = z
  .object({
    activityDate: isoDateSchema.optional(),
    eventType: capitalEventTypeSchema.optional(),
    amountUsd: z.number().optional(),
    sourceType: capitalSourceTypeSchema.optional(),
    notes: z.string().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required',
  })

export type CreateCommitmentBody = z.output<typeof createCommitmentBodySchema>
export type UpdateCommitmentBody = z.output<typeof updateCommitmentBodySchema>
export type CreateCapitalActivityBody = z.output<typeof createCapitalActivityBodySchema>
export type UpdateCapitalActivityBody = z.output<typeof updateCapitalActivityBodySchema>
