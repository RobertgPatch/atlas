import { z } from 'zod'
export const liquiditySourceKindSchema=z.enum(['CSV','STATEMENT'])
export const statementFileKindSchema=z.enum(['CSV','XLSX'])
export const valuationConventionSchema=z.object({
  priceUnit:z.enum(['PER_UNIT','PERCENT_OF_PAR','PER_CONTRACT','UNKNOWN']),
  quantityUnit:z.enum(['SHARES','PRINCIPAL','CONTRACTS','CURRENCY','UNKNOWN']),
  multiplier:z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/).nullable(),
  accruedInterest:z.enum(['INCLUDED','EXCLUDED','UNKNOWN']),
  providerIdentity:z.string().max(200).nullable(),
}).strict()
export { createAccountSchema,updateAccountSchema } from '../liquidity-statements/liquidity-statement.zod.js'
