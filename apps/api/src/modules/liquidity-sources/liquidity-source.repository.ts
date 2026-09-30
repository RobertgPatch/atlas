import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { CsvError } from '../liquidity-statements/liquidity-statement.errors.js'
import type { CustodianSummary,SourceAccount } from '../liquidity-statements/liquidity-statement.types.js'
import { custodianNameKey,normalizeCustodianName,preferredCustodianName,resolveCustodianName } from './custodian-name.js'

export interface LiquidityScope { userId: string; isAdmin: boolean; entityIds: string[] }
export type Db = Pick<pg.PoolClient, 'query'>
export function database(): Db { if (!pool) throw new CsvError('STORAGE_UNAVAILABLE'); return pool }
export function requireScope(scope: LiquidityScope, entityId: string, write = false): void {
  if (write && !scope.isAdmin) throw new CsvError('FORBIDDEN')
  if (!scope.isAdmin && !scope.entityIds.includes(entityId)) throw new CsvError('NOT_FOUND')
}
export const isoDate = (value: Date | string | null | undefined) => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
export function nextExpectedDate(date: string | null, cadence: SourceAccount['cadence']): string | null {
  if (!date || cadence === 'ON_DEMAND') return null
  const d = new Date(`${date}T12:00:00Z`)
  if (cadence === 'EVERY_14_DAYS') d.setUTCDate(d.getUTCDate() + 14)
  else { const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate(); d.setUTCDate(Math.min(day,end)) }
  return d.toISOString().slice(0,10)
}
export function mapSourceAccount(row: Record<string, any>): SourceAccount {
  const date = isoDate(row.as_of_date)
  return { id: row.id, entityId: row.entity_id, custodian: row.custodian, name: row.name, accountMask: row.account_mask, currency: row.currency, included: row.included, cadence: row.cadence, version: row.version, holdingsAsOfDate: date, nextExpectedDate: nextExpectedDate(date, row.cadence), latestSnapshotId: row.current_snapshot_id, uploadedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null, activeSource: row.active_source }
}
const accountSelect = `select a.*, s.as_of_date, s.as_of_at, s.as_of_precision, s.effective_key, s.revision as snapshot_revision, s.approved_at from liquidity_source_accounts a left join liquidity_holdings_snapshots s on s.id=a.current_snapshot_id`
export const liquiditySourceRepository = {
  async list(scope: LiquidityScope, entityId?: string, db: Db = database()): Promise<SourceAccount[]> {
    if (entityId) requireScope(scope, entityId)
    const result = await db.query(`${accountSelect} where a.archived_at is null and ($1::boolean or a.entity_id=any($2::uuid[])) and ($3::uuid is null or a.entity_id=$3) order by a.custodian,a.name,a.id`,[scope.isAdmin,scope.entityIds,entityId ?? null])
    const accounts=result.rows.map(mapSourceAccount)
    const variants=new Map<string,string[]>()
    for(const account of accounts){const key=`${account.entityId}:${custodianNameKey(account.custodian)}`;variants.set(key,[...(variants.get(key)??[]),account.custodian])}
    const displayNames=new Map([...variants].map(([key,names])=>[key,preferredCustodianName(names)]))
    return accounts.map(account=>({...account,custodian:displayNames.get(`${account.entityId}:${custodianNameKey(account.custodian)}`)??account.custodian}))
  },
  async get(id: string, scope: LiquidityScope, db: Db = database(), lock = false) {
    const result = await db.query(`${accountSelect} where a.id=$1 and a.archived_at is null and ($2::boolean or a.entity_id=any($3::uuid[])) ${lock ? 'for update of a' : ''}`,[id,scope.isAdmin,scope.entityIds])
    if (!result.rows[0]) throw new CsvError('NOT_FOUND')
    return result.rows[0]
  },
  async create(input: { entityId: string; custodian: string; name: string; accountMask?: string; currency: string; cadence: SourceAccount['cadence'] }, scope: LiquidityScope): Promise<SourceAccount> {
    requireScope(scope,input.entityId,true)
    return withTransaction(async db => {
      if (!(await db.query('select id from entities where id=$1',[input.entityId])).rowCount) throw new CsvError('NOT_FOUND')
      await db.query("select pg_advisory_xact_lock(hashtext('liquidity-custodian:' || $1::text))",[input.entityId])
      const custodian=await resolveCustodianName(input.entityId,input.custodian,db)
      const id = randomUUID()
      await db.query(`insert into liquidity_source_accounts(id,entity_id,custodian,name,account_mask,currency,cadence) values($1,$2,$3,$4,$5,$6,$7)`,[id,input.entityId,custodian,input.name,input.accountMask ?? null,input.currency,input.cadence])
      await auditRepository.record({ actorUserId: scope.userId, eventName: 'liquidity.account.created', objectType: 'liquidity_account', objectId: id },db)
      return mapSourceAccount(await this.get(id,scope,db))
    })
  },
  async update(id: string, input: { expectedVersion: number; name?: string; accountMask?: string | null; included?: boolean; cadence?: SourceAccount['cadence'] }, scope: LiquidityScope): Promise<SourceAccount> {
    return withTransaction(async db => {
      const row = await this.get(id,scope,db,true)
      requireScope(scope,row.entity_id,true)
      if (row.version !== input.expectedVersion) throw new CsvError('STALE_VERSION')
      const updateMask=input.accountMask!==undefined
      await db.query('update liquidity_source_accounts set name=coalesce($2,name),included=coalesce($3,included),cadence=coalesce($4,cadence),account_mask=case when $5 then $6 else account_mask end,version=version+1,updated_at=now() where id=$1',[id,input.name ?? null,input.included ?? null,input.cadence ?? null,updateMask,input.accountMask ?? null])
      await auditRepository.record({ actorUserId: scope.userId,eventName:'liquidity.account.updated',objectType:'liquidity_account',objectId:id,before:{name:row.name,accountMask:row.account_mask},after:{name:input.name??row.name,accountMask:updateMask?input.accountMask:row.account_mask,version:row.version+1} },db)
      return mapSourceAccount(await this.get(id,scope,db))
    })
  },
  async custodians(scope:LiquidityScope,entityId:string,db:Db=database()):Promise<CustodianSummary[]> {
    requireScope(scope,entityId)
    const rows=(await db.query(`with names as (
      select custodian from liquidity_source_accounts where entity_id=$1 and archived_at is null
      union
      select custodian from liquidity_csv_imports where entity_id=$1 and archived_at is null
    ) select $1::uuid as entity_id,n.custodian,
      (select count(*)::int from liquidity_source_accounts a where a.entity_id=$1 and a.custodian=n.custodian and a.archived_at is null) as account_count,
      (select count(*)::int from liquidity_csv_imports i where i.entity_id=$1 and i.custodian=n.custodian and i.archived_at is null) as statement_count,
      (select count(*)::int from liquidity_csv_imports i where i.entity_id=$1 and i.custodian=n.custodian and i.archived_at is null and i.status<>'APPLIED') as draft_count,
      (select count(*)::int from liquidity_csv_imports i where i.entity_id=$1 and i.custodian=n.custodian and i.archived_at is null and (i.status='APPLIED' or exists(select 1 from liquidity_csv_applications p where p.import_id=i.id and p.status='APPLIED'))) as applied_count,
      (select count(*)::int from liquidity_holdings_snapshots s join liquidity_source_accounts a on a.id=s.source_account_id where a.entity_id=$1 and a.custodian=n.custodian) as snapshot_count
      from names n order by n.custodian`,[entityId])).rows
    type CustodianGroup={entityId:string;names:string[];accountCount:number;statementCount:number;draftCount:number;appliedStatementCount:number;snapshotCount:number}
    const grouped=new Map<string,CustodianGroup>()
    for(const row of rows){
      const key=custodianNameKey(row.custodian),existing:CustodianGroup=grouped.get(key)??{entityId:row.entity_id,names:[],accountCount:0,statementCount:0,draftCount:0,appliedStatementCount:0,snapshotCount:0}
      existing.names.push(row.custodian);existing.accountCount+=row.account_count;existing.statementCount+=row.statement_count;existing.draftCount+=row.draft_count;existing.appliedStatementCount+=row.applied_count;existing.snapshotCount+=row.snapshot_count;grouped.set(key,existing)
    }
    return [...grouped.values()].map(item=>({entityId:item.entityId,name:preferredCustodianName(item.names),accountCount:item.accountCount,statementCount:item.statementCount,draftCount:item.draftCount,appliedStatementCount:item.appliedStatementCount,snapshotCount:item.snapshotCount,deletable:item.appliedStatementCount===0&&item.snapshotCount===0})).sort((left,right)=>left.name.localeCompare(right.name))
  },
  async archiveCustodian(entityId:string,custodian:string,scope:LiquidityScope):Promise<void>{
    requireScope(scope,entityId,true)
    await withTransaction(async db=>{
      await db.query("select pg_advisory_xact_lock(hashtext('liquidity-custodian:' || $1::text))",[entityId])
      const requestedKey=custodianNameKey(custodian)
      const activeNames=(await db.query(`select custodian from liquidity_source_accounts where entity_id=$1 and archived_at is null
        union select custodian from liquidity_csv_imports where entity_id=$1 and archived_at is null`,[entityId])).rows.map(row=>String(row.custodian))
      const matchingNames=activeNames.filter(name=>custodianNameKey(name)===requestedKey)
      if(!matchingNames.length)throw new CsvError('NOT_FOUND')
      const counts=(await db.query(`select
        (select count(*)::int from liquidity_source_accounts where entity_id=$1 and custodian=any($2::text[]) and archived_at is null) as accounts,
        (select count(*)::int from liquidity_csv_imports where entity_id=$1 and custodian=any($2::text[]) and archived_at is null) as statements,
        (select count(*)::int from liquidity_holdings_snapshots s join liquidity_source_accounts a on a.id=s.source_account_id where a.entity_id=$1 and a.custodian=any($2::text[])) as snapshots,
        (select count(*)::int from liquidity_csv_applications p join liquidity_csv_imports i on i.id=p.import_id where i.entity_id=$1 and i.custodian=any($2::text[]) and p.status='APPLIED') as applications,
        (select count(*)::int from liquidity_csv_imports where entity_id=$1 and custodian=any($2::text[]) and archived_at is null and (status='APPLIED' or source_identity_retained)) as retained_imports`,[entityId,matchingNames])).rows[0]
      if(!counts||counts.accounts+counts.statements===0)throw new CsvError('NOT_FOUND')
      if(counts.snapshots>0||counts.applications>0||counts.retained_imports>0)throw new CsvError('FINANCIAL_HISTORY_RETAINED')
      await db.query(`update liquidity_csv_parse_runs set status='CANCELLED',generation=generation+1,lease_owner=null,lease_expires_at=null
        where import_id in(select id from liquidity_csv_imports where entity_id=$1 and custodian=any($2::text[]) and archived_at is null)
        and status in ('QUEUED','PARSING','FAILED')`,[entityId,matchingNames])
      await db.query("update liquidity_csv_imports set status='CANCELLED',reservation_active=false,archived_at=now(),archived_by_user_id=$3,version=version+1 where entity_id=$1 and custodian=any($2::text[]) and archived_at is null",[entityId,matchingNames,scope.userId])
      await db.query("update liquidity_source_accounts set status='INACTIVE',included=false,archived_at=now(),archived_by_user_id=$3,version=version+1,updated_at=now() where entity_id=$1 and custodian=any($2::text[]) and archived_at is null",[entityId,matchingNames,scope.userId])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.custodian.archived',objectType:'liquidity_custodian',after:{accountCount:counts.accounts,statementCount:counts.statements,retainedForAudit:true}},db)
    })
  },
  async renameCustodian(entityId:string,currentName:string,newName:string,scope:LiquidityScope):Promise<CustodianSummary>{
    requireScope(scope,entityId,true)
    const normalized=normalizeCustodianName(newName)
    await withTransaction(async db=>{
      await db.query("select pg_advisory_xact_lock(hashtext('liquidity-custodian:' || $1::text))",[entityId])
      const names=(await db.query(`select custodian from liquidity_source_accounts where entity_id=$1 and archived_at is null
        union select custodian from liquidity_csv_imports where entity_id=$1 and archived_at is null`,[entityId])).rows.map(row=>String(row.custodian))
      const currentKey=custodianNameKey(currentName),targetKey=custodianNameKey(normalized)
      const matching=names.filter(name=>custodianNameKey(name)===currentKey)
      if(!matching.length)throw new CsvError('NOT_FOUND')
      if(targetKey!==currentKey&&names.some(name=>custodianNameKey(name)===targetKey))throw new CsvError('CUSTODIAN_EXISTS')
      await db.query('update liquidity_source_accounts set custodian=$3,version=version+1,updated_at=now() where entity_id=$1 and custodian=any($2::text[]) and archived_at is null',[entityId,matching,normalized])
      await db.query('update liquidity_csv_imports set custodian=$3,version=version+1 where entity_id=$1 and custodian=any($2::text[]) and archived_at is null',[entityId,matching,normalized])
      await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.custodian.renamed',objectType:'liquidity_custodian',before:{name:preferredCustodianName(matching)},after:{name:normalized}},db)
    })
    const renamed=(await this.custodians(scope,entityId)).find(item=>custodianNameKey(item.name)===custodianNameKey(normalized))
    if(!renamed)throw new CsvError('NOT_FOUND')
    return renamed
  },
  async positions(snapshotId: string, accountId: string, db: Db = database()) {
    return (await db.query('select * from liquidity_source_positions where snapshot_id=$1 and source_account_id=$2 order by source_record,id',[snapshotId,accountId])).rows
  },
  async current(scope: LiquidityScope, db: Db = database()) {
    // Account visibility is a report-view concern. All active accounts are
    // available to Liquidity and the dashboard applies temporary account filters.
    const accounts = await this.list(scope,undefined,db)
    const positions = accounts.length ? (await db.query(`select p.*,s.as_of_date,s.as_of_at,s.source_kind,i.file_kind,
      r.canonical_draft->'adapter'->>'id' as adapter_id,r.canonical_draft->'adapter'->>'version' as adapter_version
      from liquidity_source_positions p join liquidity_source_accounts a on a.id=p.source_account_id and a.current_snapshot_id=p.snapshot_id
      join liquidity_holdings_snapshots s on s.id=p.snapshot_id
      left join liquidity_csv_imports i on i.id=s.import_id left join liquidity_csv_parse_runs r on r.id=s.run_id
      where a.id=any($1::uuid[])`,[accounts.map(a=>a.id)])).rows : []
    return { accounts, positions }
  },
}
