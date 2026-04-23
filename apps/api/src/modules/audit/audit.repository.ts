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

const inMemoryAudit: AuditInput[] = []
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

    inMemoryAudit.push(input)
  },

  getInMemoryEvents() {
    return inMemoryAudit
  },
}
