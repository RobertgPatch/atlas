import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { database } from '../liquidity-sources/liquidity-source.repository.js'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { CsvObjectStore,csvObjectStore } from './csv-object-store.js'
import { CsvError } from './liquidity-statement.errors.js'
import { csvRepository,hash } from './liquidity-statement.repository.js'
import { parseCsv } from './csv/profiles.js'
import { normalizeDraft } from './csv/normalize.js'
import { reconcileDraft } from './csv/reconcile.js'
import { positionFields } from './liquidity-statement.types.js'
import { recordCsvOutcome,recordStatementOutcome } from './csv-observability.js'
import { executeStatementWorker,StatementWorkerError } from './statement-processing.service.js'
import { CSV_ADAPTER_VERSION } from './csv/profiles.js'
import { accountIdentifierFingerprints,classifyAccountIdentifier } from './csv/account-identity.js'
import type { StatementDocument } from './statement-document.types.js'

const legacyRecipe={reader:{id:'legacy_csv',version:CSV_ADAPTER_VERSION},registryRevision:'legacy-hardcoded-1',limitsRevision:'032-1',adapters:[],canonicalSchemaVersion:'2.0.0',normalizerVersion:'2.0.0',reconcilerVersion:'2.0.0',classificationCatalogVersion:'1.0.0',configurationRevision:'032-1'}

export const unmatchedStatementStatus=(fileKind:'CSV'|'XLSX',outcome:string|undefined)=>(
  fileKind==='CSV'&&outcome==='NEEDS_ADAPTER'?'NEEDS_MAPPING':'NEEDS_ADAPTER'
)

function enrichAndMinimizeTrustedIdentity(workerOutput:Record<string,any>){
  const draft=workerOutput.result?.draft
  const document=workerOutput.document as Pick<StatementDocument,'reader'|'records'>|undefined
  if(!draft||draft.schemaVersion!=='3.0.0'||!document)return
  const records=new Map(document.records.map(record=>[record.ordinal,record]))
  const secrets:Array<{value:string;mask:string}>=[]
  for(const account of draft.accounts as Array<Record<string,any>>){
    if(account.identifierQuality!=='FULL_RELIABLE')continue
    const evidence=account.accountMask?.evidence?.[0]
    const record=evidence?records.get(evidence.record??document.records.find(item=>item.location.kind==='XLSX'&&item.location.sheetName===evidence.sheetName&&item.location.row===evidence.row)?.ordinal):undefined
    const cell=record?.location.kind==='CSV'&&typeof evidence?.column==='number'
      ?record.cells[evidence.column]
      :record?.cells.find(candidate=>candidate.column===evidence?.column||candidate.address===evidence?.address)
    const source=cell?.lexical?.trim()??''
    const adapterId=draft.adapter?.id
    const candidate=adapterId==='charles_schwab_positions_csv'
      ?source.match(/(?:^|\s)(\d[\d -]{4,}\d)(?=\s+as of\b)/iu)?.[1]??''
      :source
    const classified=classifyAccountIdentifier(candidate,cell?.type==='NUMBER'?'NUMBER':'TEXT')
    if(classified.quality!=='FULL_RELIABLE'||!classified.normalized||!classified.displayMask)continue
    account.identifierFingerprints=accountIdentifierFingerprints(candidate)
    secrets.push({value:candidate,mask:classified.displayMask})
  }
  if(!secrets.length)return
  const redact=(value:string)=>secrets.reduce((safe,secret)=>safe.replaceAll(secret.value,secret.mask),value)
  for(const record of workerOutput.parsed.records as Array<{cells:string[]}>){record.cells=record.cells.map(redact)}
  const scrub=(value:unknown):unknown=>{
    if(typeof value==='string')return redact(value)
    if(Array.isArray(value))return value.map(scrub)
    if(value&&typeof value==='object')for(const [key,nested] of Object.entries(value))Reflect.set(value,key,scrub(nested))
    return value
  }
  scrub(draft)
  workerOutput.parsed.draft=draft
}

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
      const row=(await db.query(`select r.*,i.storage_key,i.sha256,i.size_bytes,i.entity_id,i.uploaded_by_user_id,i.file_kind from liquidity_csv_imports i join liquidity_csv_parse_runs r on r.id=i.active_run_id
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
      const workerOutput=await executeStatementWorker({source:bytes,sourceHash:claim.source_hash,recipe:claim.recipe??legacyRecipe,timeoutMs:config.liquidityCsv.parseTimeoutMs,maxOutputBytes:config.liquidityCsv.maxWorkerOutputBytes,mappingProfile:profile,config:{maxBytes:config.liquidityCsv.maxBytes,maxRows:config.liquidityCsv.maxRows,maxColumns:config.liquidityCsv.maxColumns,maxRecordBytes:config.liquidityCsv.maxRecordBytes,maxFieldBytes:config.liquidityCsv.maxFieldBytes,maxMetadataRecords:config.liquidityCsv.maxMetadataRecords,parseTimeoutMs:config.liquidityCsv.parseTimeoutMs}}) as {document?:StatementDocument;parsed:Awaited<ReturnType<typeof parseCsv>>;result:ReturnType<typeof reconcileDraft>|null;detection?:{outcome:string}}
      enrichAndMinimizeTrustedIdentity(workerOutput)
      const {parsed,result}=workerOutput
      if(Date.now()-started>config.liquidityCsv.parseTimeoutMs)throw new CsvError('RESOURCE_LIMIT')
      return await withTransaction(async db=>{
        const current=(await db.query('select i.status,i.active_run_id,r.generation,r.lease_owner,r.lease_expires_at from liquidity_csv_imports i join liquidity_csv_parse_runs r on r.id=i.active_run_id where i.id=$1 for update of i,r',[claim.import_id])).rows[0]
        if(!current||current.status!=='PARSING'||current.active_run_id!==claim.id||current.generation!==claim.generation||current.lease_owner!==this.owner||new Date(current.lease_expires_at).valueOf()<Date.now())return false
        if(!config.liquidityCsv.parsingEnabled)throw new CsvError('DISABLED')
        await csvRepository.persistRecords(claim.id,parsed.records,db)
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
        const actualRecipe=(result?.draft as any)?.recipe??claim.recipe??legacyRecipe
        await db.query(`update liquidity_csv_parse_runs set status='SUCCEEDED',canonical_draft=$2,canonical_hash=$3,reconciliation=$4,recipe=$5,recipe_hash=$6,completed_at=now(),lease_owner=null,lease_expires_at=null where id=$1`,[claim.id,result?JSON.stringify(result.draft):null,result?hash(result.draft):null,JSON.stringify(result?.accounts??{}),JSON.stringify(actualRecipe),hash(actualRecipe)])
        const detectionOutcome=workerOutput.detection?.outcome
        const nextStatus=result
          ?'NEEDS_REVIEW'
          :unmatchedStatementStatus(claim.file_kind,detectionOutcome)
        const detectionCode=!result&&['AMBIGUOUS_LAYOUT','CUSTODIAN_MISMATCH'].includes(detectionOutcome??'')?detectionOutcome:null
        await db.query('update liquidity_csv_imports set status=$2,safe_error_code=$3,version=version+1 where id=$1',[claim.import_id,nextStatus,detectionCode])
        await auditRepository.record({eventName:'liquidity.csv.parse',objectType:'liquidity_csv',objectId:claim.import_id,after:{status:nextStatus,detectionOutcome:detectionOutcome??null}},db)
        const reader=workerOutput.document?.reader?.id??'unknown',adapter=(result?.draft as any)?.adapter?.id??'unknown',version=(result?.draft as any)?.adapter?.version??'unknown',records=parsed.records.length
        const metricOutcome=detectionOutcome==='MATCHED'?'matched':detectionOutcome==='NEEDS_ADAPTER'?'needs_adapter':detectionOutcome==='AMBIGUOUS_LAYOUT'?'ambiguous':detectionOutcome?'blocked':'failed'
        recordStatementOutcome({reader,adapter,version,outcome:metricOutcome,resourceBucket:records>config.liquidityCsv.maxTotalRecords?'limit':records>2000?'large':records>100?'ordinary':'small',correlationId:claim.id})
        recordCsvOutcome('parse','success',Date.now()-started)
        return true
      })
    }catch(error){
      recordCsvOutcome('parse','failed',Date.now()-started)
      const code=error instanceof CsvError?error.code:error instanceof StatementWorkerError&&error.code==='WORKER_TIMEOUT'?'RESOURCE_LIMIT':error instanceof StatementWorkerError&&!error.retryable?'MALFORMED_CSV':error instanceof Error&&/^DECIMAL_/.test(error.message)?'MALFORMED_CSV':'TRANSIENT_FAILURE'
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
