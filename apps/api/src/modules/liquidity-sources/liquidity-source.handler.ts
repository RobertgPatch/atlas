import { z } from 'zod'
import { csvHandler,csvScope } from '../liquidity-statements/liquidity-statement.handler.js'
import { uuid } from '../liquidity-statements/liquidity-statement.zod.js'
import { createAccountSchema,updateAccountSchema } from './liquidity-source.zod.js'
import { liquiditySourceRepository } from './liquidity-source.repository.js'
const custodianQuerySchema=z.object({entityId:uuid}).strict()
const custodianDeleteSchema=z.object({entityId:uuid,custodian:z.string().trim().min(1).max(120)}).strict()
const custodianRenameSchema=z.object({entityId:uuid,currentName:z.string().trim().min(1).max(120),newName:z.string().trim().min(1).max(120)}).strict()
export const sourceHandlers={
  list:csvHandler(async(r)=>({items:await liquiditySourceRepository.list(csvScope(r),z.object({entityId:uuid.optional()}).strict().parse(r.query).entityId)})),
  create:csvHandler(async(r,p)=>p.status(201).send(await liquiditySourceRepository.create(createAccountSchema.parse(r.body),csvScope(r)))),
  update:csvHandler(async(r)=>liquiditySourceRepository.update(z.object({accountId:uuid}).parse(r.params).accountId,updateAccountSchema.parse(r.body),csvScope(r))),
  custodians:csvHandler(async(r)=>({items:await liquiditySourceRepository.custodians(csvScope(r),custodianQuerySchema.parse(r.query).entityId)})),
  renameCustodian:csvHandler(async(r)=>{const input=custodianRenameSchema.parse(r.body);return liquiditySourceRepository.renameCustodian(input.entityId,input.currentName,input.newName,csvScope(r))}),
  archiveCustodian:csvHandler(async(r,p)=>{const input=custodianDeleteSchema.parse(r.body);await liquiditySourceRepository.archiveCustodian(input.entityId,input.custodian,csvScope(r));return p.status(204).send()}),
}
