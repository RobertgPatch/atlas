import { createHash,randomUUID } from 'node:crypto'
import { withTransaction } from '../../infra/db/client.js'
import { database,requireScope,type Db,type LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import type { AccountBinding,CsvDetail,CsvDraft,CsvRecord,CsvSummary,ReviewIssue,StatementDraft,StatementParseRecipe,StatementStoredRecord } from './liquidity-statement.types.js'
import { CsvError } from './liquidity-statement.errors.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'

// JSONB can reorder object keys. Hash canonical key order across DB round trips.
export const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value,(_key,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)).digest('hex')
export const byteHash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
export const summary=(r:Record<string,any>):CsvSummary=>({id:r.id,entityId:r.entity_id,custodian:r.custodian,version:r.version,status:r.status,uploadedAt:new Date(r.created_at).toISOString(),adapterId:r.adapter_id??null,safeErrorCode:r.safe_error_code})
export function issueId(issue:unknown):string {const h=hash(issue);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`}
export const reviewIssues=(draft:CsvDraft|StatementDraft,acknowledged:string[]=[]):ReviewIssue[]=>draft.issues.map(i=>({...i,id:issueId(i),acknowledged:acknowledged.includes(issueId(i))}))
const recordCursor=(ordinal:number)=>Buffer.from(String(ordinal)).toString('base64url')
const cursorOrdinal=(cursor?:string)=>{if(!cursor)return 0;const value=Buffer.from(cursor,'base64url').toString('utf8');if(!/^\d+$/u.test(value))throw new CsvError('INVALID_REQUEST');return Number(value)}
const storedRecord=(r:Record<string,any>):CsvRecord|StatementStoredRecord=>r.source_kind==='XLSX'?({ordinal:r.ordinal,lineStart:r.line_start,lineEnd:r.line_end,role:r.role,cells:r.raw_tokens,sourceKind:r.source_kind,sourceLocation:r.source_location}):({ordinal:r.ordinal,lineStart:r.line_start,lineEnd:r.line_end,role:r.role,cells:r.raw_tokens})
export const csvRepository={
  async get(id:string,scope:LiquidityScope,db:Db=database(),lock=false){
    const {rows}=await db.query(`select * from liquidity_csv_imports where id=$1 and archived_at is null and ($2::boolean or entity_id=any($3::uuid[])) ${lock?'for update':''}`,[id,scope.isAdmin,scope.entityIds])
    const row=rows[0];if(!row)throw new CsvError('NOT_FOUND');requireScope(scope,row.entity_id,true);return row
  },
  async list(scope:LiquidityScope,entityId?:string,cursor?:string,limit=25,custodians:string[]=[]){
    if(!scope.isAdmin)throw new CsvError('FORBIDDEN')
    if(entityId)requireScope(scope,entityId)
    const {rows}=await database().query(`select i.*,r.canonical_draft->'adapter'->>'id' as adapter_id from liquidity_csv_imports i left join liquidity_csv_parse_runs r on r.id=i.active_run_id
      where i.archived_at is null and ($1::uuid is null or i.entity_id=$1)
      and ($2::uuid is null or (i.created_at,i.id)<(select created_at,id from liquidity_csv_imports where id=$2 and archived_at is null))
      and (cardinality($4::text[])=0 or i.custodian=any($4::text[]))
      order by i.created_at desc,i.id desc limit $3`,[entityId??null,cursor??null,limit+1,custodians])
    return {items:rows.slice(0,limit).map(summary),nextCursor:rows.length>limit?rows[limit-1]!.id:null}
  },
  async detail(id:string,scope:LiquidityScope,db:Db=database()):Promise<CsvDetail>{
    const row=await this.get(id,scope,db)
    const run=row.active_run_id?(await db.query('select * from liquidity_csv_parse_runs where id=$1',[row.active_run_id])).rows[0]:null
    const review=run&&row.active_review_id
      ?(await db.query('select * from liquidity_csv_reviews where id=$1 and import_id=$2 and run_id=$3',[row.active_review_id,id,run.id])).rows[0]
      :run&&row.review_revision
        ?(await db.query('select * from liquidity_csv_reviews where import_id=$1 and run_id=$2 and revision=$3',[id,run.id,row.review_revision])).rows[0]
        :null
    const draft:CsvDraft|StatementDraft|null=review?.canonical_draft??run?.canonical_draft??null
    const recordPage=run?await this.recordsPage(id,scope,{runId:run.id,limit:100},db,row):{items:[],nextCursor:null}
    const records=recordPage.items
    const priorApplications=(await db.query(`select id,run_id,status,applied_at,snapshot_ids from liquidity_csv_applications where import_id=$1 order by created_at,id`,[id])).rows.map(application=>({id:application.id,runId:application.run_id,status:application.status,appliedAt:application.applied_at?new Date(application.applied_at).toISOString():null,snapshotIds:application.snapshot_ids??[]}))
    let bindings:AccountBinding[]=review?.bindings??[]
    if(!review&&draft){
      bindings=[]
      for(const account of draft.accounts){
        // Drafts are immutable evidence and may have been parsed before account
        // fingerprints were added. Treat the absent field as "no automatic
        // match" so those uploads remain reviewable and can be bound manually.
        const identifierFingerprints=account.identifierFingerprints??[]
        if(!identifierFingerprints.length)continue
        const matches=(await db.query(`select id,version from liquidity_source_accounts where entity_id=$1 and custodian=$2 and identifier_fingerprint=any($3::text[]) and status='ACTIVE'`,[row.entity_id,row.custodian,identifierFingerprints])).rows
        if(matches.length===1)bindings.push({occurrenceId:account.occurrenceId,accountId:matches[0].id,expectedAccountVersion:matches[0].version,completeAccount:true,emptyAccountConfirmed:false})
      }
    }
    const kind=(row.file_kind??'CSV') as 'CSV'|'XLSX'
    const availableAdapterVersions=(kind==='XLSX'
      ?[{id:'morgan_stanley_holdings_xlsx',version:'1.0.0',fileKind:kind}]
      :[{id:'merrill_holdings_csv',version:'1.0.0',fileKind:kind},{id:'charles_schwab_positions_csv',version:'1.0.0',fileKind:kind}])
      .map(adapter=>({...adapter,current:draft?.adapter.id===adapter.id&&draft.adapter.version===adapter.version}))
    return {summary:{...summary(row),adapterId:draft?.adapter.id??null},canonicalDraft:draft,reviewRevision:row.review_revision,issues:review?.issues??(draft?reviewIssues(draft):[]),accountBindings:bindings,reconciliations:review?.reconciliation??run?.reconciliation??{},records,recordsNextCursor:recordPage.nextCursor,fileKind:kind,recipe:run?.recipe??null,excludedAccounts:review?.excluded_accounts??[],priorApplications,activeRunId:run?.id??null,sourceSchemaVersion:draft?.schemaVersion??null,storedCanonicalHash:review?.canonical_hash??run?.canonical_hash??null,availableAdapterVersions}
  },
  async recordsPage(id:string,scope:LiquidityScope,input:{runId?:string;cursor?:string;limit:number},db:Db=database(),knownRow?:Record<string,any>){
    const row=knownRow??await this.get(id,scope,db),runId=input.runId??row.active_run_id
    if(!runId)return {items:[] as Array<CsvRecord|StatementStoredRecord>,nextCursor:null}
    if(!knownRow){const belongs=(await db.query('select 1 from liquidity_csv_parse_runs where id=$1 and import_id=$2',[runId,id])).rowCount;if(!belongs)throw new CsvError('NOT_FOUND')}
    const after=cursorOrdinal(input.cursor),limit=Math.min(input.limit,100)
    const rows=(await db.query(`select ordinal,line_start,line_end,role,raw_tokens,source_kind,source_location from liquidity_csv_records
      where run_id=$1 and ordinal>$2 order by ordinal limit $3`,[runId,after,limit+1])).rows
    const items:Array<CsvRecord|StatementStoredRecord>=[]
    let bytes=64
    for(const row of rows.slice(0,limit)){
      const item=storedRecord(row),size=Buffer.byteLength(JSON.stringify(item))+1
      if(items.length&&bytes+size>1024*1024)break
      if(size>1024*1024)throw new CsvError('RESOURCE_LIMIT')
      items.push(item);bytes+=size
    }
    const hasMore=rows.length>items.length
    return {items,nextCursor:hasMore&&items.length?recordCursor(items.at(-1)!.ordinal):null}
  },
  async queue(row:Record<string,any>,db:Db,profileId:string|null=null,recipe?:StatementParseRecipe){
    await db.query("select pg_advisory_xact_lock(hashtext('liquidity-csv-queue'))")
    const queued=Number((await db.query("select count(*) as n from liquidity_csv_imports where status in ('QUEUED','PARSING')")).rows[0].n)
    if(queued>=config.liquidityCsv.maxQueuedJobs)throw new CsvError('QUOTA_EXCEEDED')
    const id=randomUUID(),attempt=(await db.query('select coalesce(max(attempt_no),0)+1 as n from liquidity_csv_parse_runs where import_id=$1',[row.id])).rows[0].n
    await db.query(`insert into liquidity_csv_parse_runs(id,import_id,attempt_no,status,source_version,source_hash,profile_id,recipe,recipe_hash,schema_version) values($1,$2,$3,'QUEUED',$4,$5,$6,$7,$8,$9)`,[id,row.id,attempt,row.storage_version,row.sha256,profileId,recipe?JSON.stringify(recipe):null,recipe?hash(recipe):null,recipe?.schemaVersion??'2.0.0'])
    await db.query(`update liquidity_csv_imports set active_run_id=$2,active_review_id=null,profile_id=$3,status='QUEUED',version=version+1,safe_error_code=null,reservation_active=false where id=$1`,[row.id,id,profileId])
    return id
  },
  async allocateReviewRevision(importId:string,db:Db){
    const row=(await db.query('update liquidity_csv_imports set review_revision=review_revision+1 where id=$1 returning review_revision',[importId])).rows[0]
    if(!row)throw new CsvError('NOT_FOUND')
    return Number(row.review_revision)
  },
  async activateReview(importId:string,runId:string,reviewId:string,status:'NEEDS_REVIEW'|'READY_TO_APPLY',db:Db){
    const result=await db.query('update liquidity_csv_imports set active_review_id=$3,status=$4,version=version+1 where id=$1 and active_run_id=$2',[importId,runId,reviewId,status])
    if(result.rowCount!==1)throw new CsvError('STALE_VERSION')
  },
  async persistRecords(runId:string,records:Array<CsvRecord|StatementStoredRecord>,db:Db){
    if(!records.length)return
    await db.query(`insert into liquidity_csv_records(run_id,ordinal,line_start,line_end,role,raw_tokens,source_kind,source_location)
      select $1,x.ordinal,x."lineStart",x."lineEnd",x.role,x.cells,coalesce(x."sourceKind",'CSV'),
        coalesce(x."sourceLocation",jsonb_build_object('kind','CSV','record',x.ordinal,'lineStart',x."lineStart",'lineEnd',x."lineEnd"))
      from jsonb_to_recordset($2::jsonb) as x(ordinal integer,"lineStart" integer,"lineEnd" integer,role text,cells jsonb,"sourceKind" text,"sourceLocation" jsonb)`,[runId,JSON.stringify(records)])
  },
  async assertNoActiveLease(importId:string,db:Db){
    const row=(await db.query(`select r.status,r.lease_expires_at from liquidity_csv_imports i
      left join liquidity_csv_parse_runs r on r.id=i.active_run_id where i.id=$1`,[importId])).rows[0]
    if(row?.status==='PARSING'&&row.lease_expires_at&&new Date(row.lease_expires_at).valueOf()>Date.now())throw new CsvError('INVALID_STATE')
  },
  async restoreAppliedView(importId:string,cancelledRunId:string,db:Db):Promise<boolean>{
    const applied=(await db.query(`select a.run_id,a.review_revision,r.id as review_id from liquidity_csv_applications a
      left join liquidity_csv_reviews r on r.import_id=a.import_id and r.run_id=a.run_id and r.revision=a.review_revision
      where a.import_id=$1 and a.status='APPLIED' order by a.applied_at desc,a.id desc limit 1`,[importId])).rows[0]
    if(!applied)return false
    await db.query("update liquidity_csv_parse_runs set status='CANCELLED',generation=generation+1,lease_owner=null,lease_expires_at=null where id=$1 and status in ('QUEUED','PARSING','FAILED')",[cancelledRunId])
    await db.query("update liquidity_csv_imports set active_run_id=$2,active_review_id=$3,status='APPLIED',source_identity_retained=true,version=version+1,reservation_active=false where id=$1",[importId,applied.run_id,applied.review_id??null])
    return true
  },
  async cancel(id:string,version:number,scope:LiquidityScope){
    return withTransaction(async db=>{
      const row=await this.get(id,scope,db,true)
      if(row.version!==version)throw new CsvError('STALE_VERSION')
      if(row.status==='APPLIED')throw new CsvError('INVALID_STATE')
      if(row.source_identity_retained&&row.active_run_id&&await this.restoreAppliedView(id,row.active_run_id,db)){
        await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.statement.reprocess.abandoned',objectType:'liquidity_csv',objectId:id},db)
        return
      }
      await db.query("update liquidity_csv_imports set status='CANCELLED',version=version+1,reservation_active=false where id=$1",[id])
      await db.query("update liquidity_csv_parse_runs set status='CANCELLED',generation=generation+1,lease_owner=null,lease_expires_at=null where import_id=$1 and status in ('QUEUED','PARSING')",[id])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.cancel',objectType:'liquidity_csv',objectId:id},db)
    })
  },
  async archive(id:string,version:number,scope:LiquidityScope){
    return withTransaction(async db=>{
      const row=await this.get(id,scope,db,true)
      if(row.version!==version)throw new CsvError('STALE_VERSION')
      const retained=await db.query(`select
        exists(select 1 from liquidity_csv_applications where import_id=$1 and status='APPLIED') as has_application,
        exists(select 1 from liquidity_holdings_snapshots where import_id=$1) as has_snapshot`,[id])
      if(retained.rows[0]?.has_application||retained.rows[0]?.has_snapshot||row.status==='APPLIED'||row.source_identity_retained)throw new CsvError('FINANCIAL_HISTORY_RETAINED')
      await db.query("update liquidity_csv_parse_runs set status='CANCELLED',generation=generation+1,lease_owner=null,lease_expires_at=null where import_id=$1 and status in ('QUEUED','PARSING','FAILED')",[id])
      await db.query("update liquidity_csv_imports set status='CANCELLED',archived_at=now(),archived_by_user_id=$2,version=version+1,reservation_active=false where id=$1",[id,scope.userId])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.statement.archived',objectType:'liquidity_csv',objectId:id,after:{retainedForAudit:true}},db)
    })
  },
}
