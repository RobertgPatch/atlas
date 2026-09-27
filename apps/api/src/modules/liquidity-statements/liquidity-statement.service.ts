import { randomBytes,randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { database,requireScope,type LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import { csvObjectStore,CsvObjectStore } from './csv-object-store.js'
import { CsvError } from './liquidity-statement.errors.js'
import { byteHash,csvRepository,summary } from './liquidity-statement.repository.js'
import type { UploadRequest,UploadCapability } from './liquidity-statement.types.js'
import { recordCsvOutcome } from './csv-observability.js'
import { resolveCustodianName } from '../liquidity-sources/custodian-name.js'
import { CSV_ADAPTER_VERSION } from './csv/profiles.js'

export class CsvStatementService {
  constructor(readonly store:CsvObjectStore=csvObjectStore){}
  async upload(input:UploadRequest,scope:LiquidityScope):Promise<UploadCapability>{
    const c=config.liquidityCsv
    if(!c.uploadsEnabled)throw new CsvError('DISABLED')
    requireScope(scope,input.entityId,true)
    if(input.sizeBytes>c.maxBytes)throw new CsvError('RESOURCE_LIMIT')
    return withTransaction(async db=>{
      // Global admission lock makes reservations atomic across API instances.
      await db.query("select pg_advisory_xact_lock(hashtext('liquidity-csv-admission'))")
      if(!(await db.query('select id from entities where id=$1',[input.entityId])).rowCount)throw new CsvError('NOT_FOUND')
      await db.query("select pg_advisory_xact_lock(hashtext('liquidity-custodian:' || $1::text))",[input.entityId])
      const custodian=await resolveCustodianName(input.entityId,input.custodian,db)
      await db.query("update liquidity_csv_imports set reservation_active=false,status='CANCELLED',version=version+1 where reservation_active and capability_expires_at<now() and status='UPLOAD_PENDING'")
      const duplicate=(await db.query("select * from liquidity_csv_imports where entity_id=$1 and sha256=$2 and status not in ('CANCELLED','REJECTED') order by created_at limit 1",[input.entityId,input.sha256])).rows[0]
      if(duplicate){
        recordCsvOutcome('duplicate','success')
        if(duplicate.status==='UPLOAD_PENDING'){
          let existingVersion:string|undefined
          try{existingVersion=await this.store.version(duplicate.storage_key)}catch(error){
            const e=error as {code?:string;name?:string;$metadata?:{httpStatusCode?:number}}
            if(!['ENOENT','NoSuchKey','NotFound'].includes(e.code??e.name??'')&&e.$metadata?.httpStatusCode!==404)throw error
          }
          if(existingVersion){
            await this.store.readVerified(duplicate.storage_key,existingVersion,duplicate.sha256,duplicate.size_bytes)
            await db.query('update liquidity_csv_imports set storage_version=$2,completed_at=now() where id=$1',[duplicate.id,existingVersion])
            await csvRepository.queue({...duplicate,storage_version:existingVersion},db)
            return {statementId:duplicate.id,version:duplicate.version+1,url:`/v1/liquidity-statements/${duplicate.id}`,expiresAt:new Date(duplicate.capability_expires_at).toISOString(),requiredHeaders:{},duplicate:true}
          }
          // Reissue the same immutable key to resume an interrupted upload.
          const token=randomBytes(32).toString('hex')
          const capability=await this.store.uploadUrl(duplicate.storage_key,duplicate.sha256,duplicate.size_bytes,`/v1/liquidity-statements/${duplicate.id}/content?token=${token}`)
          await db.query('update liquidity_csv_imports set capability_token_hash=$2 where id=$1',[duplicate.id,byteHash(token)])
          return {statementId:duplicate.id,version:duplicate.version,...capability,expiresAt:new Date(duplicate.capability_expires_at).toISOString()}
        }
        if(['NEEDS_REVIEW','READY_TO_APPLY'].includes(duplicate.status)&&duplicate.active_run_id){
          const parsedVersion=(await db.query("select canonical_draft->'adapter'->>'version' as version from liquidity_csv_parse_runs where id=$1",[duplicate.active_run_id])).rows[0]?.version
          if(parsedVersion!==CSV_ADAPTER_VERSION){
            await csvRepository.queue(duplicate,db,duplicate.profile_id)
            await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.reprocess',objectType:'liquidity_csv',objectId:duplicate.id,before:{adapterVersion:parsedVersion??null},after:{adapterVersion:CSV_ADAPTER_VERSION}},db)
            return {statementId:duplicate.id,version:duplicate.version+1,url:`/v1/liquidity-statements/${duplicate.id}`,expiresAt:new Date(duplicate.capability_expires_at).toISOString(),requiredHeaders:{},duplicate:true}
          }
        }
        return {statementId:duplicate.id,version:duplicate.version,url:`/v1/liquidity-statements/${duplicate.id}`,expiresAt:new Date(duplicate.capability_expires_at).toISOString(),requiredHeaders:{},duplicate:true}
      }
      const counts=(await db.query(`select count(*) filter(where created_at>now()-interval '30 days')::int as files,
        count(*) filter(where created_at>now()-interval '1 hour' and uploaded_by_user_id=$1)::int as hourly,
        count(*) filter(where reservation_active)::int as outstanding,
        count(*) filter(where status in ('QUEUED','PARSING') or reservation_active)::int as queued,
        coalesce(sum(size_bytes) filter(where created_at>now()-interval '30 days'),0)::text as bytes
        from liquidity_csv_imports`,[scope.userId])).rows[0]
      if(counts.files>=c.filesPer30Days||counts.hourly>=c.capabilitiesPerHour||counts.outstanding>=c.maxOutstandingCapabilities||counts.queued>=c.maxQueuedJobs||BigInt(counts.bytes)+BigInt(input.sizeBytes)>BigInt(c.filesPer30Days)*BigInt(c.maxBytes))throw new CsvError('QUOTA_EXCEEDED')
      const id=randomUUID(),token=randomBytes(32).toString('hex'),key=this.store.key(input.entityId,id),expiresAt=new Date(Date.now()+c.capabilityTtlSeconds*1000).toISOString()
      const capability=await this.store.uploadUrl(key,input.sha256,input.sizeBytes,`/v1/liquidity-statements/${id}/content?token=${token}`)
      await db.query(`insert into liquidity_csv_imports(id,entity_id,custodian,uploaded_by_user_id,file_name,sha256,size_bytes,content_type,storage_key,capability_token_hash,capability_expires_at,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'UPLOAD_PENDING')`,[id,input.entityId,custodian,scope.userId,input.fileName,input.sha256,input.sizeBytes,input.contentType,key,byteHash(token),expiresAt])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.upload',objectType:'liquidity_csv',objectId:id},db)
      recordCsvOutcome('upload','success')
      return {statementId:id,version:1,...capability,expiresAt}
    })
  }
  async putLocal(id:string,token:string,body:Buffer,scope:LiquidityScope){
    if(!config.liquidityCsv.uploadsEnabled)throw new CsvError('DISABLED')
    const row=await csvRepository.get(id,scope)
    if(row.status!=='UPLOAD_PENDING'||byteHash(token)!==row.capability_token_hash)throw new CsvError('INVALID_STATE')
    if(new Date(row.capability_expires_at).valueOf()<Date.now())throw new CsvError('CAPABILITY_EXPIRED')
    return {storageVersionId:await this.store.putLocal(row.storage_key,body,row.sha256,row.size_bytes)}
  }
  async complete(id:string,input:{expectedVersion:number;storageVersionId:string;sha256:string},scope:LiquidityScope){
    if(!config.liquidityCsv.uploadsEnabled)throw new CsvError('DISABLED')
    const initial=await csvRepository.get(id,scope)
    if(initial.sha256!==input.sha256)throw new CsvError('STORAGE_MISMATCH')
    if(initial.storage_version===input.storageVersionId && !['CANCELLED','REJECTED'].includes(initial.status))return summary(initial)
    if(initial.version!==input.expectedVersion)throw new CsvError('STALE_VERSION')
    if(initial.status!=='UPLOAD_PENDING')throw new CsvError('INVALID_STATE')
    if(new Date(initial.capability_expires_at).valueOf()<Date.now())throw new CsvError('CAPABILITY_EXPIRED')
    try { await this.store.readVerified(initial.storage_key,input.storageVersionId,initial.sha256,initial.size_bytes) }
    catch(error){
      if(error instanceof CsvError && ['STORAGE_MISMATCH','RESOURCE_LIMIT'].includes(error.code))await database().query("update liquidity_csv_imports set status='REJECTED',safe_error_code=$2,reservation_active=false,version=version+1 where id=$1 and status='UPLOAD_PENDING' and version=$3",[id,error.code,input.expectedVersion])
      throw error
    }
    return withTransaction(async db=>{
      const row=await csvRepository.get(id,scope,db,true)
      if(row.storage_version===input.storageVersionId&&row.status!=='CANCELLED')return summary(row)
      if(row.version!==input.expectedVersion||row.status!=='UPLOAD_PENDING')throw new CsvError('STALE_VERSION')
      if(new Date(row.capability_expires_at).valueOf()<Date.now())throw new CsvError('CAPABILITY_EXPIRED')
      await db.query('update liquidity_csv_imports set storage_version=$2,completed_at=now() where id=$1',[id,input.storageVersionId])
      await csvRepository.queue({...row,storage_version:input.storageVersionId},db)
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.complete',objectType:'liquidity_csv',objectId:id},db)
      return summary(await csvRepository.get(id,scope,db))
    })
  }
  async retry(id:string,version:number,scope:LiquidityScope){
    if(!config.liquidityCsv.parsingEnabled)throw new CsvError('DISABLED')
    return withTransaction(async db=>{
      const row=await csvRepository.get(id,scope,db,true)
      if(row.version!==version)throw new CsvError('STALE_VERSION')
      if(row.status!=='FAILED'||row.safe_error_code!=='TRANSIENT_FAILURE')throw new CsvError('INVALID_STATE')
      const run=(await db.query('select * from liquidity_csv_parse_runs where id=$1',[row.active_run_id])).rows[0]
      if(run.retry_count>=config.liquidityCsv.maxRetries)throw new CsvError('RETRY_EXHAUSTED')
      const next=await csvRepository.queue(row,db,row.profile_id)
      await db.query('update liquidity_csv_parse_runs set retry_count=$2 where id=$1',[next,run.retry_count+1])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.retry',objectType:'liquidity_csv',objectId:id},db)
      return summary(await csvRepository.get(id,scope,db))
    })
  }
  async download(id:string,scope:LiquidityScope){
    const row=await csvRepository.get(id,scope)
    if(!row.storage_version)throw new CsvError('INVALID_STATE')
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.download',objectType:'liquidity_csv',objectId:id})
    return {url:await this.store.downloadUrl(row.storage_key,row.storage_version,`/v1/liquidity-statements/${id}/content`),expiresAt:new Date(Date.now()+120000).toISOString()}
  }
  async original(id:string,scope:LiquidityScope){const row=await csvRepository.get(id,scope);if(!row.storage_version)throw new CsvError('INVALID_STATE');return this.store.readVerified(row.storage_key,row.storage_version,row.sha256,row.size_bytes)}
}
export const csvStatementService=new CsvStatementService()
