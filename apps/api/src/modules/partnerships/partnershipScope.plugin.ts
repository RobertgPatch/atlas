import type { FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../../infra/db/client.js'

/**
 * Loads the caller's entity memberships from the database and attaches them
 * to `req.partnershipScope`. Admins bypass the join and get `isAdmin: true`
 * which signals downstream code to skip scope filtering.
 *
 * Returns 401 if the session is missing, 403 (FORBIDDEN_ENTITY) if a
 * requested entity / partnership is outside the caller's scope.
 *
 * Mirrors k1Scope.plugin.ts (Feature 002) per plan.md Decision 9.
 */
export const requirePartnershipScope = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    void reply.code(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  if (request.authUser.role === 'Admin') {
    request.partnershipScope = { isAdmin: true, entityIds: [] }
    return
  }

  if (!pool) {
    // No DB available — grant empty scope so the caller sees nothing (fail-safe)
    request.partnershipScope = { isAdmin: false, entityIds: [] }
    return
  }

  const result = await pool.query<{ entity_id: string }>(
    `select entity_id from entity_memberships where user_id = $1`,
    [request.authUser.userId],
  )
  request.partnershipScope = {
    isAdmin: false,
    entityIds: result.rows.map((r) => r.entity_id),
  }
}

/**
 * Checks that `entityId` (when provided) is within the caller's scope.
 * Sends a 403 and returns `false` if the check fails; returns `true` on pass.
 */
export const assertEntityInPartnershipScope = (
  request: FastifyRequest,
  reply: FastifyReply,
  entityId: string | undefined,
): boolean => {
  if (!entityId) return true
  const scope = request.partnershipScope
  if (!scope) {
    void reply.code(401).send({ error: 'UNAUTHORIZED' })
    return false
  }
  if (scope.isAdmin) return true
  if (!scope.entityIds.includes(entityId)) {
    void reply.code(403).send({ error: 'FORBIDDEN_ENTITY' })
    return false
  }
  return true
}

declare module 'fastify' {
  interface FastifyRequest {
    partnershipScope?: { isAdmin: boolean; entityIds: string[] }
  }
}
