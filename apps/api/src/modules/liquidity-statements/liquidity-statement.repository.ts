import { createHash,randomUUID } from 'node:crypto'
import { withTransaction } from '../../infra/db/client.js'
import { database,requireScope,type Db,type LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import type { AccountBinding,CsvDetail,CsvDraft,CsvRecord,CsvSummary,ReviewIssue } from './liquidity-statement.types.js'
import { CsvError } from './liquidity-statement.errors.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'

// JSONB can reorder object keys. Hash canonical key order across DB round trips.
export const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value,(_key,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)).digest('hex')
export const byteHash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
export const summary=(r:Record<string,any>):CsvSummary=>({id:r.id,entityId:r.entity_id,custodian:r.custodian,version:r.version,status:r.status,uploadedAt:new Date(r.created_at).toISOString(),adapterId:r.adapter_id??null,safeErrorCode:r.safe_error_code})
export function issueId(issue:unknown):string {const h=hash(issue);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`}
export const reviewIssues=(draft:CsvDraft,acknowledged:string[]=[]):ReviewIssue[]=>draft.issues.map(i=>({...i,id:issueId(i),acknowledged:acknowledged.includes(issueId(i))}))
export const csvRepository={
  async get(id:string,scope:LiquidityScope,db:Db=database(),lock=false){
    const {rows}=await db.query(`select * from liquidity_csv_imports where id=$1 and ($2::boolean or entity_id=any($3::uuid[])) ${lock?'for update':''}`,[id,scope.isAdmin,scope.entityIds])
    const row=rows[0];if(!row)throw new CsvError('NOT_FOUND');requireScope(scope,row.entity_id,true);return row
  },
  async list(scope:LiquidityScope,entityId?:string,cursor?:string,limit=25){
    if(!scope.isAdmin)throw new CsvError('FORBIDDEN')
    if(entityId)requireScope(scope,entityId)
    const {rows}=await database().query(`select i.*,r.canonical_draft->'adapter'->>'id' as adapter_id from liquidity_csv_imports i left join liquidity_csv_parse_runs r on r.id=i.active_run_id where ($1::uuid is null or i.entity_id=$1) and ($2::uuid is null or (i.created_at,i.id)<(select created_at,id from liquidity_csv_imports where id=$2)) order by i.created_at desc,i.id desc limit $3`,[entityId??null,cursor??null,limit+1])
    return {items:rows.slice(0,limit).map(summary),nextCursor:rows.length>limit?rows[limit-1]!.id:null}
  },
  async detail(id:string,scope:LiquidityScope,db:Db=database()):Promise<CsvDetail>{
    const row=await this.get(id,scope,db)
    const run=row.active_run_id?(await db.query('select * from liquidity_csv_parse_runs where id=$1',[row.active_run_id])).rows[0]:null
    const review=row.review_revision?(await db.query('select * from liquidity_csv_reviews where import_id=$1 and revision=$2',[id,row.review_revision])).rows[0]:null
    const draft:CsvDraft|null=review?.canonical_draft??run?.canonical_draft??null
    const records:CsvRecord[]=run?(await db.query('select ordinal,line_start,line_end,role,raw_tokens from liquidity_csv_records where run_id=$1 order by ordinal',[run.id])).rows.map(r=>({ordinal:r.ordinal,lineStart:r.line_start,lineEnd:r.line_end,role:r.role,cells:r.raw_tokens})):[]
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
    return {summary:{...summary(row),adapterId:draft?.adapter.id??null},canonicalDraft:draft,reviewRevision:row.review_revision,issues:review?.issues??(draft?reviewIssues(draft):[]),accountBindings:bindings,reconciliations:review?.reconciliation??run?.reconciliation??{},records}
  },
  async queue(row:Record<string,any>,db:Db,profileId:string|null=null){
    await db.query("select pg_advisory_xact_lock(hashtext('liquidity-csv-queue'))")
    const queued=Number((await db.query("select count(*) as n from liquidity_csv_imports where status in ('QUEUED','PARSING')")).rows[0].n)
    if(queued>=config.liquidityCsv.maxQueuedJobs)throw new CsvError('QUOTA_EXCEEDED')
    const id=randomUUID(),attempt=(await db.query('select coalesce(max(attempt_no),0)+1 as n from liquidity_csv_parse_runs where import_id=$1',[row.id])).rows[0].n
    await db.query(`insert into liquidity_csv_parse_runs(id,import_id,attempt_no,status,source_version,source_hash,profile_id) values($1,$2,$3,'QUEUED',$4,$5,$6)`,[id,row.id,attempt,row.storage_version,row.sha256,profileId])
    await db.query(`update liquidity_csv_imports set active_run_id=$2,profile_id=$3,status='QUEUED',version=version+1,review_revision=0,safe_error_code=null,reservation_active=false where id=$1`,[row.id,id,profileId])
    return id
  },
  async cancel(id:string,version:number,scope:LiquidityScope){
    return withTransaction(async db=>{
      const row=await this.get(id,scope,db,true)
      if(row.version!==version)throw new CsvError('STALE_VERSION')
      if(row.status==='APPLIED')throw new CsvError('INVALID_STATE')
      await db.query("update liquidity_csv_imports set status='CANCELLED',version=version+1,reservation_active=false where id=$1",[id])
      await db.query("update liquidity_csv_parse_runs set status='CANCELLED',generation=generation+1,lease_owner=null,lease_expires_at=null where import_id=$1 and status in ('QUEUED','PARSING')",[id])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.cancel',objectType:'liquidity_csv',objectId:id},db)
    })
  },
}
