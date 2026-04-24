import type { FastifyReply, FastifyRequest } from 'fastify'
import { k1Repository } from './k1.repository.js'

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
  const entityIds = k1Repository.getUserEntityIds(request.authUser.userId)
  request.k1Scope = { entityIds }
}

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
