import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { CsvError } from '../liquidity-statements/liquidity-statement.errors.js'
import type { SourceAccount } from '../liquidity-statements/liquidity-statement.types.js'
import { resolveCustodianName } from './custodian-name.js'

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
    const result = await db.query(`${accountSelect} where ($1::boolean or a.entity_id=any($2::uuid[])) and ($3::uuid is null or a.entity_id=$3) order by a.custodian,a.name,a.id`,[scope.isAdmin,scope.entityIds,entityId ?? null])
    return result.rows.map(mapSourceAccount)
  },
  async get(id: string, scope: LiquidityScope, db: Db = database(), lock = false) {
    const result = await db.query(`${accountSelect} where a.id=$1 and ($2::boolean or a.entity_id=any($3::uuid[])) ${lock ? 'for update of a' : ''}`,[id,scope.isAdmin,scope.entityIds])
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
  async update(id: string, input: { expectedVersion: number; name?: string; included?: boolean; cadence?: SourceAccount['cadence'] }, scope: LiquidityScope): Promise<SourceAccount> {
    return withTransaction(async db => {
      const row = await this.get(id,scope,db,true)
      requireScope(scope,row.entity_id,true)
      if (row.version !== input.expectedVersion) throw new CsvError('STALE_VERSION')
      await db.query('update liquidity_source_accounts set name=coalesce($2,name),included=coalesce($3,included),cadence=coalesce($4,cadence),version=version+1,updated_at=now() where id=$1',[id,input.name ?? null,input.included ?? null,input.cadence ?? null])
      await auditRepository.record({ actorUserId: scope.userId,eventName:'liquidity.account.updated',objectType:'liquidity_account',objectId:id,after:{ version: row.version + 1 } },db)
      return mapSourceAccount(await this.get(id,scope,db))
    })
  },
  async positions(snapshotId: string, accountId: string, db: Db = database()) {
    return (await db.query('select * from liquidity_source_positions where snapshot_id=$1 and source_account_id=$2 order by source_record,id',[snapshotId,accountId])).rows
  },
  async current(scope: LiquidityScope, db: Db = database()) {
    const accounts = (await this.list(scope,undefined,db)).filter(a => a.included)
    const positions = accounts.length ? (await db.query(`select p.*,s.as_of_date,s.as_of_at,s.source_kind from liquidity_source_positions p join liquidity_source_accounts a on a.id=p.source_account_id and a.current_snapshot_id=p.snapshot_id join liquidity_holdings_snapshots s on s.id=p.snapshot_id where a.id=any($1::uuid[])`,[accounts.map(a=>a.id)])).rows : []
    return { accounts, positions }
  },
}
