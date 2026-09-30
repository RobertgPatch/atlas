import {
  normalizeSectorSymbol,
  type SaveSectorAssignment,
  type SectorAssignment,
} from '@jackson/types/liquidity-sectors'
import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'

export class SectorAssignmentError extends Error {
  constructor(readonly code: 'FORBIDDEN' | 'STALE_VERSION' | 'STORAGE_UNAVAILABLE') {
    super(code)
  }
}

type AssignmentRow = {
  symbol: string
  sector: SectorAssignment['sector']
  version: number
  updated_at: Date | string
}
const mapAssignment = (row: AssignmentRow): SectorAssignment => ({
  symbol: row.symbol, sector: row.sector, version: row.version,
  updatedAt: new Date(row.updated_at).toISOString(),
})

export const liquiditySectorRepository = {
  async list(): Promise<SectorAssignment[]> {
    if (!pool) throw new SectorAssignmentError('STORAGE_UNAVAILABLE')
    const result = await pool.query<AssignmentRow>(
      'select symbol, sector, version, updated_at from liquidity_sector_assignments order by symbol',
    )
    return result.rows.map(mapAssignment)
  },

  /** Read only symbols already authorized by the report's entity/account scope. */
  async forSymbols(symbols: Array<string | null>): Promise<Map<string, SectorAssignment>> {
    const normalized = [...new Set(symbols.map(normalizeSectorSymbol).filter(Boolean))]
    if (!normalized.length || !pool) return new Map()
    const result = await pool.query<AssignmentRow>(
      'select symbol, sector, version, updated_at from liquidity_sector_assignments where symbol=any($1::text[])',
      [normalized],
    )
    return new Map(result.rows.map((row) => [row.symbol, mapAssignment(row)]))
  },

  async save(symbol: string, input: SaveSectorAssignment, actor: { userId: string; isAdmin: boolean }): Promise<SectorAssignment> {
    if (!actor.isAdmin) throw new SectorAssignmentError('FORBIDDEN')
    if (!pool) throw new SectorAssignmentError('STORAGE_UNAVAILABLE')
    const normalized = normalizeSectorSymbol(symbol)
    return withTransaction(async (db) => {
      // Also serialize first inserts, where SELECT FOR UPDATE cannot lock a row yet.
      await db.query("select pg_advisory_xact_lock(hashtext('liquidity-sector:' || $1::text))", [normalized])
      const previous = (await db.query<AssignmentRow>(
        'select symbol, sector, version, updated_at from liquidity_sector_assignments where symbol=$1 for update',
        [normalized],
      )).rows[0]
      if ((previous?.version ?? 0) !== input.expectedVersion) throw new SectorAssignmentError('STALE_VERSION')
      const result = await db.query<AssignmentRow>(
        `insert into liquidity_sector_assignments(symbol, sector, updated_by_user_id)
         values ($1, $2, $3)
         on conflict (symbol) do update set sector=excluded.sector,
           version=liquidity_sector_assignments.version+1,
           updated_by_user_id=excluded.updated_by_user_id, updated_at=now()
         returning symbol, sector, version, updated_at`,
        [normalized, input.sector, actor.userId],
      )
      const assignment = mapAssignment(result.rows[0]!)
      await auditRepository.record({
        actorUserId: actor.userId,
        eventName: input.sector === null ? 'liquidity.sector.reset' : 'liquidity.sector.assigned',
        objectType: 'liquidity_sector',
        before: { symbol: normalized, sector: previous?.sector ?? null, version: previous?.version ?? 0 },
        after: assignment,
      }, db)
      return assignment
    })
  },
}
