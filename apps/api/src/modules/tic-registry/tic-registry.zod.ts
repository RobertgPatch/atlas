import { z } from 'zod'

const uuidSchema = z.string().uuid()
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
const isoTimestampSchema = z.string().datetime()

const nullableDateSchema = z.union([isoDateSchema, z.null()]).optional()
const nullableStringSchema = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (typeof value === 'string' && value.length === 0 ? null : value))

const nullableMoneySchema = z
  .union([z.number().min(0), z.null()])
  .optional()

const percentageSchema = z.number().min(0).max(100)

export const ticPropertyTypeSchema = z.enum([
  'multifamily',
  'retail',
  'office',
  'industrial',
  'self_storage',
  'hospitality',
  'land',
  'mixed_use',
  'other',
])

export const ticPropertyStatusSchema = z.enum(['held', 'under_contract', 'sold'])

export const ticInterestStatusSchema = z.enum(['active', 'rolled', 'exited'])

export const ticAcquisitionOriginSchema = z.enum(['cash', 'exchange'])

export const ticOwnerTypeSchema = z.enum([
  'individual',
  'llc',
  'trust',
  'partnership',
  's_corp',
  'ira',
  'other',
])

export const ticRegistryListQuerySchema = z.object({
  entityId: uuidSchema.optional(),
  status: ticPropertyStatusSchema.optional(),
  propertyType: ticPropertyTypeSchema.optional(),
  search: z.string().trim().max(200).optional(),
})

export const ticPropertyParamsSchema = z.object({
  propertyId: uuidSchema,
})

export const ticInterestParamsSchema = z.object({
  interestId: uuidSchema,
})

export const ticOwnerParamsSchema = z.object({
  ownerId: uuidSchema,
})

export const expectedUpdatedAtQuerySchema = z.object({
  expectedUpdatedAt: isoTimestampSchema.optional(),
})

export const createTicPropertyBodySchema = z.object({
  entityId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  propertyType: ticPropertyTypeSchema,
  status: ticPropertyStatusSchema.optional().default('held'),
  acquiredDate: nullableDateSchema,
  estimatedValueUsd: nullableMoneySchema,
  notes: nullableStringSchema(10_000),
})

export const updateTicPropertyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    propertyType: ticPropertyTypeSchema.optional(),
    status: ticPropertyStatusSchema.optional(),
    acquiredDate: nullableDateSchema,
    estimatedValueUsd: nullableMoneySchema,
    notes: nullableStringSchema(10_000),
    expectedUpdatedAt: isoTimestampSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required',
  })

export const createTicInterestBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    propertyPercentage: percentageSchema,
    status: ticInterestStatusSchema.optional().default('active'),
    acquisitionOrigin: ticAcquisitionOriginSchema,
    relinquishedInterestId: z.union([uuidSchema, z.null()]).optional(),
    relinquishedSourceName: nullableStringSchema(200),
    acquisitionDate: nullableDateSchema,
    acquisitionValueUsd: nullableMoneySchema,
    notes: nullableStringSchema(10_000),
  })
  .superRefine((value, ctx) => {
    if (
      value.acquisitionOrigin === 'exchange' &&
      !value.relinquishedInterestId &&
      !value.relinquishedSourceName
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relinquishedSourceName'],
        message: 'Exchange interests require a source interest or source name',
      })
    }
  })

export const updateTicInterestBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    propertyPercentage: percentageSchema.optional(),
    status: ticInterestStatusSchema.optional(),
    acquisitionOrigin: ticAcquisitionOriginSchema.optional(),
    relinquishedInterestId: z.union([uuidSchema, z.null()]).optional(),
    relinquishedSourceName: nullableStringSchema(200),
    acquisitionDate: nullableDateSchema,
    acquisitionValueUsd: nullableMoneySchema,
    notes: nullableStringSchema(10_000),
    expectedUpdatedAt: isoTimestampSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required',
  })

export const createTicOwnerBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  ownerType: ticOwnerTypeSchema,
  ticPercentage: percentageSchema,
})

export const updateTicOwnerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    ownerType: ticOwnerTypeSchema.optional(),
    ticPercentage: percentageSchema.optional(),
    expectedUpdatedAt: isoTimestampSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required',
  })

export type TicRegistryListQuery = z.output<typeof ticRegistryListQuerySchema>
export type CreateTicPropertyBody = z.output<typeof createTicPropertyBodySchema>
export type UpdateTicPropertyBody = z.output<typeof updateTicPropertyBodySchema>
export type CreateTicInterestBody = z.output<typeof createTicInterestBodySchema>
export type UpdateTicInterestBody = z.output<typeof updateTicInterestBodySchema>
export type CreateTicOwnerBody = z.output<typeof createTicOwnerBodySchema>
export type UpdateTicOwnerBody = z.output<typeof updateTicOwnerBodySchema>
