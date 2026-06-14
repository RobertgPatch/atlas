import { z } from 'zod'

export const plaidLinkTokenBodySchema = z.object({
  mode: z.enum(['create', 'update']).optional().default('create'),
  connectionId: z.string().uuid().nullish(),
})

export const plaidExchangePublicTokenBodySchema = z.object({
  publicToken: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
})

export const updatePlaidInvestmentAccountsBodySchema = z.object({
  selectedAccountIds: z.array(z.string().min(1)).default([]),
})

export type PlaidLinkTokenBody = z.output<typeof plaidLinkTokenBodySchema>
export type PlaidExchangePublicTokenBody = z.output<
  typeof plaidExchangePublicTokenBodySchema
>
export type UpdatePlaidInvestmentAccountsBody = z.output<
  typeof updatePlaidInvestmentAccountsBodySchema
>
