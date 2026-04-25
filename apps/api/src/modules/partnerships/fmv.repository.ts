import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import type { FmvSnapshot } from '../../../../../packages/types/src/partnership-management.js'
import type { CreateFmvSnapshotBody } from './partnerships.zod.js'

export const fmvRepository = {
  async listFmvSnapshots(
    partnershipId: string,
    scope: { isAdmin: boolean; entityIds: string[] },
  ): Promise<FmvSnapshot[] | null> {
    if (!pool) return []

    // Scope check via partnership → entity
    if (!scope.isAdmin) {
      const scopeResult = await pool.query<{ entity_id: string }>(
        `select entity_id from partnerships where id = $1`,
        [partnershipId],
      )
      if (!scopeResult.rows[0]) return null
      if (!scope.entityIds.includes(scopeResult.rows[0].entity_id)) return null
    }

    const result = await pool.query(
      `
      select fmv.id, fmv.partnership_id, fmv.valuation_date as as_of_date,
             fmv.fmv_amount as amount_usd, fmv.source_type as source,
             fmv.notes as note, fmv.created_at,
             u.id as recorded_by_user_id, u.email as recorded_by_email
      from partnership_fmv_snapshots fmv
      left join users u on u.id = fmv.created_by
      where fmv.partnership_id = $1
      order by fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
      `,
      [partnershipId],
    )

    return result.rows.map((r) => ({
      id: r.id,
      partnershipId: r.partnership_id,
      asOfDate: r.as_of_date,
      amountUsd: Number(r.amount_usd),
      source: r.source,
      note: r.note ?? null,
      recordedByUserId: r.recorded_by_user_id ?? '',
      recordedByEmail: r.recorded_by_email ?? '',
      createdAt: r.created_at,
    }))
  },

  async insertFmvSnapshot(
    partnershipId: string,
    body: CreateFmvSnapshotBody,
    actorUserId: string,
    client: PoolClient,
  ): Promise<FmvSnapshot> {
    // Capture prior-latest for before_json
    const priorResult = await client.query(
      `select * from partnership_fmv_snapshots
       where partnership_id = $1
       order by created_at desc, valuation_date desc, id desc
       limit 1`,
      [partnershipId],
    )
    const prior = priorResult.rows[0] ?? null

    const id = randomUUID()
    const result = await client.query(
      `insert into partnership_fmv_snapshots
         (id, partnership_id, valuation_date, fmv_amount, source_type, notes, created_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now(), now())
       returning *`,
      [id, partnershipId, body.asOfDate, body.amountUsd, body.source, body.note ?? null, actorUserId],
    )
    const row = result.rows[0]

    // Fetch actor email for response
    const actorResult = await client.query<{ email: string }>(
      `select email from users where id = $1`,
      [actorUserId],
    )

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.FMV_RECORDED,
        objectType: 'partnership',
        objectId: partnershipId,
        before: prior,
        after: row,
      },
      client,
    )

    return {
      id: row.id,
      partnershipId: row.partnership_id,
      asOfDate: row.valuation_date,
      amountUsd: Number(row.fmv_amount),
      source: row.source_type,
      note: row.notes ?? null,
      recordedByUserId: actorUserId,
      recordedByEmail: actorResult.rows[0]?.email ?? '',
      createdAt: row.created_at,
    }
  },
}
