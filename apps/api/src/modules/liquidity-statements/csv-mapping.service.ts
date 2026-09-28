import { randomUUID } from 'node:crypto'
import { withTransaction } from '../../infra/db/client.js'
import { config } from '../../config.js'
import { auditRepository } from '../audit/audit.repository.js'
import type { LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import { CsvError } from './liquidity-statement.errors.js'
import { mappingSchema } from './liquidity-statement.zod.js'
import { csvRepository,hash,summary } from './liquidity-statement.repository.js'
export const csvMappingService={async map(id:string,body:unknown,scope:LiquidityScope){
  const input=mappingSchema.parse(body)
  if(!config.liquidityCsv.parsingEnabled)throw new CsvError('DISABLED')
  return withTransaction(async db=>{
    const row=await csvRepository.get(id,scope,db,true)
    if(row.version!==input.expectedVersion)throw new CsvError('STALE_VERSION')
    if(!['NEEDS_MAPPING','NEEDS_REVIEW','READY_TO_APPLY'].includes(row.status)&&!(row.status==='FAILED'&&row.safe_error_code==='UNSUPPORTED_ENCODING'))throw new CsvError('INVALID_STATE')
    const idProfile=randomUUID(),version=(await db.query('select coalesce(max(version),0)+1 as n from liquidity_csv_profiles where import_id=$1',[id])).rows[0].n
    await db.query('insert into liquidity_csv_profiles(id,import_id,version,profile,profile_hash,actor_id) values($1,$2,$3,$4,$5,$6)',[idProfile,id,version,JSON.stringify(input.profile),hash(input.profile),scope.userId])
    await csvRepository.queue(row,db,idProfile)
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.mapping',objectType:'liquidity_csv',objectId:id,after:{version}},db)
    return summary(await csvRepository.get(id,scope,db))
  })
}}
