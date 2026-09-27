import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { database } from '../liquidity-sources/liquidity-source.repository.js'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { CsvObjectStore,csvObjectStore } from './csv-object-store.js'
import { CsvError } from './liquidity-statement.errors.js'
import { hash } from './liquidity-statement.repository.js'
import { parseCsv } from './csv/profiles.js'
import { normalizeDraft } from './csv/normalize.js'
import { reconcileDraft } from './csv/reconcile.js'
import { positionFields } from './liquidity-statement.types.js'
import { recordCsvOutcome } from './csv-observability.js'

export class CsvProcessingService {
  private readonly owner=randomUUID()
  private active=false
  private stopped=true
  private timer:ReturnType<typeof setTimeout>|null=null
  private lastReservationCleanup=0
  constructor(private readonly store:CsvObjectStore=csvObjectStore){}
  async expireReservations(){
    const result=await database().query("update liquidity_csv_imports set reservation_active=false,status='CANCELLED',version=version+1 where reservation_active and capability_expires_at<now() and status='UPLOAD_PENDING'")
    for(let i=0;i<(result.rowCount??0);i++)recordCsvOutcome('reservation_expired','success')
    this.lastReservationCleanup=Date.now()
    return result.rowCount??0
  }
  async claim(importId?:string):Promise<Record<string,any>|null>{
    if(!config.liquidityCsv.parsingEnabled)return null
    return withTransaction(async db=>{
      const row=(await db.query(`select r.*,i.storage_key,i.sha256,i.size_bytes,i.entity_id,i.uploaded_by_user_id from liquidity_csv_imports i join liquidity_csv_parse_runs r on r.id=i.active_run_id
        where i.status in ('QUEUED','PARSING') and (r.status='QUEUED' or (r.status='PARSING' and r.lease_expires_at<now())) and ($1::uuid is null or i.id=$1)
        order by r.created_at limit 1 for update of i skip locked`,[importId??null])).rows[0]
      if(!row)return null
      if(row.status==='PARSING'&&row.retry_count>=config.liquidityCsv.maxRetries){
        await db.query("update liquidity_csv_parse_runs set status='FAILED',safe_error_code='TRANSIENT_FAILURE',completed_at=now() where id=$1",[row.id])
        await db.query("update liquidity_csv_imports set status='FAILED',safe_error_code='TRANSIENT_FAILURE',version=version+1 where id=$1",[row.import_id]);return null
      }
      const run=(await db.query(`update liquidity_csv_parse_runs set status='PARSING',generation=generation+1,lease_owner=$2,lease_expires_at=now()+($3*interval '1 millisecond'),started_at=now(),retry_count=retry_count+$4 where id=$1 returning *`,[row.id,this.owner,config.liquidityCsv.parseTimeoutMs*2,row.status==='PARSING'?1:0])).rows[0]
      await db.query("update liquidity_csv_imports set status='PARSING',version=version+1 where id=$1",[row.import_id])
      return {...row,...run}
    })
  }
  async processOne(importId?:string){
    if(this.active)return false
    this.active=true
    try {const claim=await this.claim(importId);return claim?await this.processClaim(claim):false}finally{this.active=false}
  }
  async processClaim(claim:Record<string,any>):Promise<boolean>{
    const started=Date.now()
    const heartbeat=setInterval(()=>{
      void database().query("update liquidity_csv_parse_runs set lease_expires_at=now()+($4*interval '1 millisecond') where id=$1 and generation=$2 and lease_owner=$3 and status='PARSING'",[claim.id,claim.generation,this.owner,config.liquidityCsv.parseTimeoutMs*2]).catch(()=>{})
    },10000)
    heartbeat.unref()
    try{
      const bytes=await this.store.readVerified(claim.storage_key,claim.source_version,claim.source_hash,claim.size_bytes)
      const profile=claim.profile_id?(await database().query('select profile from liquidity_csv_profiles where id=$1 and import_id=$2',[claim.profile_id,claim.import_id])).rows[0]?.profile:undefined
      const parsed=await parseCsv(bytes,{},profile)
      const result=parsed.draft?reconcileDraft(normalizeDraft(parsed.draft,new Date(),true),true):null
      if(Date.now()-started>config.liquidityCsv.parseTimeoutMs)throw new CsvError('RESOURCE_LIMIT')
      return await withTransaction(async db=>{
        const current=(await db.query('select i.status,i.active_run_id,r.generation,r.lease_owner,r.lease_expires_at from liquidity_csv_imports i join liquidity_csv_parse_runs r on r.id=i.active_run_id where i.id=$1 for update of i,r',[claim.import_id])).rows[0]
        if(!current||current.status!=='PARSING'||current.active_run_id!==claim.id||current.generation!==claim.generation||current.lease_owner!==this.owner||new Date(current.lease_expires_at).valueOf()<Date.now())return false
        if(!config.liquidityCsv.parsingEnabled)throw new CsvError('DISABLED')
        await db.query(`insert into liquidity_csv_records(run_id,ordinal,line_start,line_end,role,raw_tokens) select $1,x.ordinal,x."lineStart",x."lineEnd",x.role,x.cells from jsonb_to_recordset($2::jsonb) as x(ordinal integer,"lineStart" integer,"lineEnd" integer,role text,cells jsonb)`,[claim.id,JSON.stringify(parsed.records)])
        for(const [ai,a] of (result?.draft.accounts??[]).entries()){
          await db.query('insert into liquidity_csv_account_occurrences(run_id,occurrence_id,canonical) values($1,$2,$3)',[claim.id,a.occurrenceId,JSON.stringify({...a,positions:[]})])
          for(let offset=0;offset<a.positions.length;offset+=250){
            const batch=a.positions.slice(offset,offset+250)
            await db.query(`insert into liquidity_csv_positions(run_id,account_occurrence,occurrence_id,source_record,canonical) select $1,$2,x->>'occurrenceId',(x->>'sourceRecord')::int,x from jsonb_array_elements($3::jsonb) x`,[claim.id,a.occurrenceId,JSON.stringify(batch)])
            const fields=batch.flatMap((p,pi)=>positionFields.map(key=>({id:randomUUID(),path:`accounts.${ai}.positions.${offset+pi}.${key}`,field:p[key]})))
            await db.query(`insert into liquidity_csv_fields(id,run_id,field_path,field) select x.id,$1,x.path,x.field from jsonb_to_recordset($2::jsonb) as x(id uuid,path text,field jsonb)`,[claim.id,JSON.stringify(fields)])
            if(Date.now()-started>config.liquidityCsv.parseTimeoutMs)throw new CsvError('RESOURCE_LIMIT')
          }
        }
        await db.query(`update liquidity_csv_parse_runs set status='SUCCEEDED',canonical_draft=$2,canonical_hash=$3,reconciliation=$4,completed_at=now(),lease_owner=null,lease_expires_at=null where id=$1`,[claim.id,result?JSON.stringify(result.draft):null,result?hash(result.draft):null,JSON.stringify(result?.accounts??{})])
        await db.query('update liquidity_csv_imports set status=$2,version=version+1 where id=$1',[claim.import_id,result?'NEEDS_REVIEW':'NEEDS_MAPPING'])
        await auditRepository.record({eventName:'liquidity.csv.parse',objectType:'liquidity_csv',objectId:claim.import_id,after:{status:result?'NEEDS_REVIEW':'NEEDS_MAPPING'}},db)
        recordCsvOutcome('parse','success',Date.now()-started)
        return true
      })
    }catch(error){
      recordCsvOutcome('parse','failed',Date.now()-started)
      const code=error instanceof CsvError?error.code:error instanceof Error&&/^DECIMAL_/.test(error.message)?'MALFORMED_CSV':'TRANSIENT_FAILURE'
      await withTransaction(async db=>{
        const row=(await db.query('select i.id from liquidity_csv_imports i join liquidity_csv_parse_runs r on r.id=i.active_run_id where i.id=$1 and r.id=$2 and r.generation=$3 and i.status=\'PARSING\' and r.lease_owner=$4 for update of i,r',[claim.import_id,claim.id,claim.generation,this.owner])).rows[0]
        if(!row)return
        await db.query("update liquidity_csv_parse_runs set status='FAILED',safe_error_code=$2,completed_at=now(),lease_owner=null,lease_expires_at=null where id=$1",[claim.id,code])
        await db.query("update liquidity_csv_imports set status='FAILED',safe_error_code=$2,version=version+1 where id=$1",[claim.import_id,code])
      })
      return false
    }finally{clearInterval(heartbeat)}
  }
  start(){
    if(!this.stopped)return
    this.stopped=false
    const tick=async()=>{if(this.stopped)return;try{if(Date.now()-this.lastReservationCleanup>60000)await this.expireReservations();await this.processOne()}catch{recordCsvOutcome('parse','failed')}finally{if(!this.stopped){this.timer=setTimeout(tick,1500);this.timer.unref()}}}
    void tick()
  }
  async stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);while(this.active)await new Promise(resolve=>setTimeout(resolve,20))}
}
export const csvProcessingService=new CsvProcessingService()
