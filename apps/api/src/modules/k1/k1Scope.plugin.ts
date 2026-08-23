import type { FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../../infra/db/client.js'
import { durableK1Repository, k1Repository } from './k1.repository.js'

const loadEntityIds = async (request: FastifyRequest): Promise<string[]> => {
  if (!request.authUser) return []
  if (!pool) return k1Repository.getUserEntityIds(request.authUser.userId)
  const result = request.authUser.role === 'Admin'
    ? await pool.query<{ id: string }>('select id from entities order by id')
    : await pool.query<{ id: string }>(
      `select entity_id as id from entity_memberships where user_id = $1 order by entity_id`,
      [request.authUser.userId],
    )
  return result.rows.map((row) => row.id)
}

/**
 * Attaches the caller's entity scope to the request and rejects any request
 * whose body/query targets an entity outside that scope (FR-032).
 *
 * Must be run AFTER the session middleware.
 */
export const requireK1Scope = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    void reply.code(401).send({ error: 'UNAUTHORIZED' })
    return
  }
  const entityIds = await loadEntityIds(request)
  request.k1Scope = { entityIds }
}

export const assertK1DocumentInScope = async (
  request: FastifyRequest,
  reply: FastifyReply,
  k1DocumentId: string,
): Promise<boolean> => {
  if (!request.authUser) {
    void reply.code(401).send({ error: 'UNAUTHORIZED' })
    return false
  }
  if (!pool) {
    const legacy = k1Repository.getK1Document(k1DocumentId)
    if (legacy && request.k1Scope?.entityIds.includes(legacy.entityId)) return true
  } else {
    const durable = await durableK1Repository.getById(k1DocumentId)
    if (durable?.entityId && request.k1Scope?.entityIds.includes(durable.entityId)) return true
  }
  void reply.code(403).send({ error: 'FORBIDDEN_K1_DOCUMENT' })
  return false
}

export const k1AuditMetadata = (
  request: FastifyRequest,
  metadata: Omit<import('./k1.types.js').K1AuditMetadata, 'actorUserId'>,
): import('./k1.types.js').K1AuditMetadata => ({
  ...metadata,
  actorUserId: request.authUser?.userId,
})

/**
 * For handlers that accept an `entity_id` query param or JSON body,
 * validate it against the caller's memberships.
 */
export const assertEntityInScope = (
  request: FastifyRequest,
  reply: FastifyReply,
  entityId: string | undefined,
): boolean => {
  if (!entityId) return true
  if (!request.k1Scope?.entityIds.includes(entityId)) {
    void reply.code(403).send({ error: 'FORBIDDEN_ENTITY' })
    return false
  }
  return true
}

declare module 'fastify' {
  interface FastifyRequest {
    k1Scope?: { entityIds: string[] }
  }
}
