import type { FastifyReply,FastifyRequest } from 'fastify'
import { z,ZodError } from 'zod'
import { CsvError } from './liquidity-statement.errors.js'
import { csvRepository } from './liquidity-statement.repository.js'
import { csvStatementService } from './liquidity-statement.service.js'
import { csvMappingService } from './csv-mapping.service.js'
import { csvReviewService } from './csv-review.service.js'
import { csvApplicationPreviewService } from './csv-application-preview.service.js'
import { csvApplicationService } from './csv-application.service.js'
import { completeSchema,recordsQuerySchema,reprocessSchema,uploadRequestSchema,uuid,versionSchema } from './liquidity-statement.zod.js'
import type { LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import { recordCsvOutcome, type CsvStage } from './csv-observability.js'
export function csvScope(request:FastifyRequest):LiquidityScope {
  if(!request.authUser||!request.partnershipScope)throw new CsvError('FORBIDDEN')
  return {userId:request.authUser.userId,isAdmin:request.partnershipScope.isAdmin,entityIds:request.partnershipScope.entityIds}
}
export function csvHandler(fn:(r:FastifyRequest,p:FastifyReply)=>Promise<unknown>,stage?:CsvStage){
  return async(r:FastifyRequest,p:FastifyReply)=>{const started=Date.now();try{const result=await fn(r,p);if(stage)recordCsvOutcome(stage,'success',Date.now()-started);return result}catch(error){
    const safe=error instanceof CsvError?error:error instanceof ZodError?new CsvError('INVALID_REQUEST'):new CsvError('TRANSIENT_FAILURE')
    if(stage)recordCsvOutcome(stage,safe.code==='DISABLED'?'disabled':safe.code==='QUOTA_EXCEEDED'?'quota':safe.statusCode>=500?'failed':'blocked',Date.now()-started)
    return p.status(safe.statusCode).send({error:safe.code,message:safe.message})
  }}
}
const id=(r:FastifyRequest)=>z.object({statementId:uuid}).parse(r.params).statementId
export const csvHandlers={
  upload:csvHandler(async(r,p)=>p.status(201).send(await csvStatementService.upload(uploadRequestSchema.parse(r.body),csvScope(r)))),
  complete:csvHandler(async(r,p)=>p.status(202).send(await csvStatementService.complete(id(r),completeSchema.parse(r.body),csvScope(r)))),
  list:csvHandler(async(r)=>{const q=z.object({entityId:uuid.optional(),cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(100).default(25),custodian:z.preprocess(value=>value===undefined?[]:Array.isArray(value)?value:[value],z.array(z.string().trim().min(1).max(120)).max(25)).default([])}).strict().parse(r.query);return csvRepository.list(csvScope(r),q.entityId,q.cursor,q.limit,q.custodian)}),
  detail:csvHandler(async(r)=>csvRepository.detail(id(r),csvScope(r))),
  records:csvHandler(async(r)=>csvRepository.recordsPage(id(r),csvScope(r),recordsQuerySchema.parse(r.query))),
  cancel:csvHandler(async(r,p)=>{const q=z.object({expectedVersion:z.coerce.number().int().positive()}).strict().parse(r.query);await csvRepository.cancel(id(r),q.expectedVersion,csvScope(r));return p.status(204).send()}),
  archive:csvHandler(async(r,p)=>{await csvRepository.archive(id(r),versionSchema.parse(r.body).expectedVersion,csvScope(r));return p.status(204).send()}),
  retry:csvHandler(async(r,p)=>p.status(202).send(await csvStatementService.retry(id(r),versionSchema.parse(r.body).expectedVersion,csvScope(r)))),
  reprocess:csvHandler(async(r,p)=>p.status(202).send(await csvStatementService.reprocess(id(r),reprocessSchema.parse(r.body),csvScope(r)))),
  mapping:csvHandler(async(r,p)=>p.status(202).send(await csvMappingService.map(id(r),r.body,csvScope(r)))),
  review:csvHandler(async(r)=>csvReviewService.review(id(r),r.body,csvScope(r)),'review'),
  preview:csvHandler(async(r)=>csvApplicationPreviewService.preview(id(r),r.body,csvScope(r))),
  apply:csvHandler(async(r)=>csvApplicationService.apply(id(r),r.body,csvScope(r)),'apply'),
  download:csvHandler(async(r)=>csvStatementService.download(id(r),csvScope(r)),'download'),
  putContent:csvHandler(async(r,p)=>{
    const q=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(r.query)
    if(r.headers['if-none-match']!=='*')throw new CsvError('STORAGE_MISMATCH')
    const body=Buffer.isBuffer(r.body)?r.body:typeof r.body==='string'?Buffer.from(r.body):null
    if(!body)throw new CsvError('INVALID_REQUEST')
    return p.status(201).send(await csvStatementService.putLocal(id(r),q.token,body,csvScope(r)))
  }),
  getContent:csvHandler(async(r,p)=>{
    const statementId=id(r),scope=csvScope(r),row=await csvRepository.get(statementId,scope)
    const kind=row.file_kind==='XLSX'||String(row.storage_key).endsWith('.xlsx')?'XLSX':'CSV'
    const body=await csvStatementService.original(statementId,scope)
    return p.header('Content-Disposition',`attachment; filename="brokerage-source.${kind.toLowerCase()}"`).header('X-Content-Type-Options','nosniff').type(kind==='XLSX'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/plain').send(body)
  }),
}
