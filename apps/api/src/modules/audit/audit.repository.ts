import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../infra/db/client.js'

export interface AuditInput {
  actorUserId?: string
  eventName: string
  objectType: string
  objectId?: string
  before?: unknown
  after?: unknown
}

export interface AuditEventRecord extends AuditInput {
  createdAt: Date
}

const inMemoryAudit: AuditEventRecord[] = []
let warnedAuditFallback = false

const serializeAuditInput = (input: AuditInput) => [
  randomUUID(),
  input.actorUserId ?? null,
  input.eventName,
  input.objectType,
  input.objectId ?? null,
  input.before ? JSON.stringify(input.before) : null,
  input.after ? JSON.stringify(input.after) : null,
] as const

export const auditRepository = {
  async record(input: AuditInput, client?: PoolClient): Promise<void> {
    const db = client ?? null
    if (db) {
      await db.query(
        `insert into audit_events (id, actor_user_id, event_name, object_type, object_id, before_json, after_json, created_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())`,
        serializeAuditInput(input),
      )
      return
    }

    if (pool) {
      try {
        await pool.query(
          `insert into audit_events (id, actor_user_id, event_name, object_type, object_id, before_json, after_json, created_at)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())`,
          serializeAuditInput(input),
        )
        return
      } catch (error) {
        if (!warnedAuditFallback) {
          warnedAuditFallback = true
          console.warn(
            'auditRepository: falling back to in-memory audit storage because Postgres is unavailable:',
            error instanceof Error ? error.message : String(error),
          )
        }
      }
    }

    inMemoryAudit.push({ ...input, createdAt: new Date() })
  },

  async listRecentForUser(userId: string, limit = 10): Promise<AuditEventRecord[]> {
    if (pool) {
      try {
        const result = await pool.query<AuditEventRecord>(
          `select actor_user_id as "actorUserId",
                  event_name as "eventName",
                  object_type as "objectType",
                  object_id as "objectId",
                  before_json as "before",
                  after_json as "after",
                  created_at as "createdAt"
             from audit_events
            where actor_user_id = $1
               or (object_type = 'user' and object_id = $1)
            order by created_at desc
            limit $2`,
          [userId, limit],
        )
        return result.rows.map((row) => ({
          ...row,
          createdAt: new Date(row.createdAt),
        }))
      } catch {
        // Fall back to in-memory events when Postgres is unavailable in local dev.
      }
    }

    return inMemoryAudit
      .filter((event) => event.actorUserId === userId || (event.objectType === 'user' && event.objectId === userId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
  },

  getInMemoryEvents() {
    return inMemoryAudit
  },
}
