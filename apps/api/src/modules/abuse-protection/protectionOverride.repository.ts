import type { PoolClient } from 'pg'

import { pool, withTransaction } from '../../infra/db/client.js'
import type { AdmissionSqlClient } from './admission.repository.js'

export const PROTECTION_OVERRIDE_MODES = ['disable', 'lower_limit', 'temporary_allow'] as const
export type ProtectionOverrideMode = (typeof PROTECTION_OVERRIDE_MODES)[number]
export type ProtectionOverrideScope = 'environment' | 'workload' | 'tenant' | 'user'

export interface ProtectionOverrideRecord {
  readonly overrideId: string
  readonly controlKey: string
  readonly scopeKind: ProtectionOverrideScope
  readonly scopeHash: Buffer | null
  readonly mode: ProtectionOverrideMode
  readonly value: Readonly<Record<string, string | number | boolean>>
  readonly reason: string
  readonly ticketReference: string | null
  readonly createdByUserId: string
  readonly createdAt: Date
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokedByUserId: string | null
}

interface ProtectionOverrideRow extends Record<string, unknown> {
  override_id: string
  control_key: string
  scope_kind: ProtectionOverrideScope
  scope_hash: Buffer | null
  mode: ProtectionOverrideMode
  value: Record<string, string | number | boolean>
  reason: string
  ticket_reference: string | null
  created_by_user_id: string
  created_at: Date
  expires_at: Date | null
  revoked_at: Date | null
  revoked_by_user_id: string | null
}

export interface ReplaceProtectionOverrideInput {
  readonly controlKey: string
  readonly scopeKind: ProtectionOverrideScope
  readonly scopeHash: Uint8Array | null
  readonly mode: ProtectionOverrideMode
  readonly value: Readonly<Record<string, string | number | boolean>>
  readonly reason: string
  readonly ticketReference?: string | null
  readonly createdByUserId: string
  readonly expiresAt?: Date | null
  readonly expectedOverrideId?: string | null
  readonly now?: Date
}

export class ProtectionOverrideConflictError extends Error {
  readonly code = 'OVERRIDE_CONFLICT'

  constructor(message = 'The active protection override changed. Retry with fresh state.') {
    super(message)
    this.name = 'ProtectionOverrideConflictError'
  }
}

const fromRow = (row: ProtectionOverrideRow): ProtectionOverrideRecord => ({
  overrideId: row.override_id,
  controlKey: row.control_key,
  scopeKind: row.scope_kind,
  scopeHash: row.scope_hash,
  mode: row.mode,
  value: Object.freeze({ ...row.value }),
  reason: row.reason,
  ticketReference: row.ticket_reference,
  createdByUserId: row.created_by_user_id,
  createdAt: new Date(row.created_at),
  expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  revokedByUserId: row.revoked_by_user_id,
})

const activeSql = `
  select *
    from protection_overrides
   where control_key = $1
     and revoked_at is null
     and (expires_at is null or expires_at > $2)
   order by created_at desc, override_id desc
`

export class ProtectionOverrideRepository {
  async listActiveInTransaction(
    client: AdmissionSqlClient,
    controlKey: string,
    now = new Date(),
  ): Promise<readonly ProtectionOverrideRecord[]> {
    const result = await client.query<ProtectionOverrideRow>(activeSql, [controlKey, now])
    return result.rows.map(fromRow)
  }

  async list(now = new Date()): Promise<readonly ProtectionOverrideRecord[]> {
    if (!pool) throw new Error('DATABASE_URL is not configured')
    const result = await pool.query<ProtectionOverrideRow>(
      `select * from protection_overrides
        where revoked_at is null
          and (expires_at is null or expires_at > $1)
        order by control_key, created_at desc, override_id desc`,
      [now],
    )
    return result.rows.map(fromRow)
  }

  async replace(input: ReplaceProtectionOverrideInput): Promise<ProtectionOverrideRecord> {
    const now = input.now ?? new Date()
    return withTransaction(async (client) => {
      const active = await client.query<ProtectionOverrideRow>(
        `select * from protection_overrides
          where control_key = $1
            and revoked_at is null
            and (expires_at is null or expires_at > $2)
            and scope_kind = $3
            and scope_hash is not distinct from $4
          order by created_at desc, override_id desc
          limit 1 for update`,
        [input.controlKey, now, input.scopeKind, input.scopeHash ? Buffer.from(input.scopeHash) : null],
      )
      const current = active.rows[0] ? fromRow(active.rows[0]) : null
      if (
        input.expectedOverrideId !== undefined
        && input.expectedOverrideId !== current?.overrideId
      ) {
        throw new ProtectionOverrideConflictError()
      }
      if (current) {
        await client.query(
          `update protection_overrides
              set revoked_at = $2, revoked_by_user_id = $3
            where override_id = $1 and revoked_at is null`,
          [current.overrideId, now, input.createdByUserId],
        )
      }
      const inserted = await client.query<ProtectionOverrideRow>(
        `insert into protection_overrides (
           control_key, scope_kind, scope_hash, mode, value, reason,
           ticket_reference, created_by_user_id, created_at, expires_at
         ) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
         returning *`,
        [
          input.controlKey,
          input.scopeKind,
          input.scopeHash ? Buffer.from(input.scopeHash) : null,
          input.mode,
          JSON.stringify(input.value),
          input.reason,
          input.ticketReference ?? null,
          input.createdByUserId,
          now,
          input.expiresAt ?? null,
        ],
      )
      return fromRow(inserted.rows[0]!)
    })
  }

  async revoke(
    controlKey: string,
    revokedByUserId: string,
    now = new Date(),
  ): Promise<ProtectionOverrideRecord | null> {
    return withTransaction(async (client: PoolClient) => {
      const result = await client.query<ProtectionOverrideRow>(
        `update protection_overrides
            set revoked_at = $2, revoked_by_user_id = $3
          where override_id = (
            select override_id from protection_overrides
             where control_key = $1 and scope_kind = 'workload'
               and revoked_at is null and (expires_at is null or expires_at > $2)
             order by created_at desc, override_id desc
             limit 1 for update
          )
          returning *`,
        [controlKey, now, revokedByUserId],
      )
      return result.rows[0] ? fromRow(result.rows[0]) : null
    })
  }

  async cleanupExpired(cutoff: Date, maximumRows: number): Promise<number> {
    if (!pool) throw new Error('DATABASE_URL is not configured')
    const result = await pool.query(
      `with candidates as (
         select override_id from protection_overrides
          where (expires_at is not null and expires_at <= $1)
             or (revoked_at is not null and revoked_at <= $1)
          order by coalesce(revoked_at, expires_at), override_id
          limit $2
       )
       delete from protection_overrides target using candidates
        where target.override_id = candidates.override_id`,
      [cutoff, maximumRows],
    )
    return result.rowCount ?? 0
  }
}

export const protectionOverrideRepository = new ProtectionOverrideRepository()
