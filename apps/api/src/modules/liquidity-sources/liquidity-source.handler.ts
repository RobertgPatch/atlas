import { z } from 'zod'
import { csvHandler,csvScope } from '../liquidity-statements/liquidity-statement.handler.js'
import { uuid } from '../liquidity-statements/liquidity-statement.zod.js'
import { createAccountSchema,updateAccountSchema } from './liquidity-source.zod.js'
import { liquiditySourceRepository } from './liquidity-source.repository.js'
export const sourceHandlers={
  list:csvHandler(async(r)=>({items:await liquiditySourceRepository.list(csvScope(r),z.object({entityId:uuid.optional()}).strict().parse(r.query).entityId)})),
  create:csvHandler(async(r,p)=>p.status(201).send(await liquiditySourceRepository.create(createAccountSchema.parse(r.body),csvScope(r)))),
  update:csvHandler(async(r)=>liquiditySourceRepository.update(z.object({accountId:uuid}).parse(r.params).accountId,updateAccountSchema.parse(r.body),csvScope(r))),
}
