import { z } from 'zod'
import { config } from '../../config.js'

export const plaidIdempotencyKeySchema = z.string().min(1)
  .max(config.abuseProtection.payloadLimits.maximumIdempotencyKeyCharacters)

export const plaidLinkTokenBodySchema = z.object({
  mode: z.enum(['create', 'update']).optional().default('create'),
  connectionId: z.string().uuid().nullish(),
  idempotencyKey: plaidIdempotencyKeySchema.optional(),
})

export const plaidExchangePublicTokenBodySchema = z.object({
  publicToken: z.string().min(1).max(config.abuseProtection.payloadLimits.businessJsonBodyBytes),
  metadata: z.record(z.unknown()).optional(),
})

export const updatePlaidInvestmentAccountsBodySchema = z.object({
  selectedAccountIds: z.array(z.string().min(1).max(256))
    .max(config.abuseProtection.payloadLimits.maximumJsonProperties)
    .default([]),
})

export type PlaidLinkTokenBody = z.output<typeof plaidLinkTokenBodySchema>
export type PlaidExchangePublicTokenBody = z.output<
  typeof plaidExchangePublicTokenBodySchema
>
export type UpdatePlaidInvestmentAccountsBody = z.output<
  typeof updatePlaidInvestmentAccountsBodySchema
>
