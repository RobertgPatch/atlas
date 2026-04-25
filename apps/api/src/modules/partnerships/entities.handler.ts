import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { entitiesRepository } from './entities.repository.js'
import { entityParamsSchema } from './partnerships.zod.js'

/**
 * GET /v1/entities/:id
 * Returns EntityDetail (entity header, rollup KPIs, scoped partnership list).
 * Returns 403 if entity is out of the caller's scope.
 * Returns 404 if entity does not exist (or is not visible within scope).
 */
export const getEntityDetailHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = request.partnershipScope!

  let params: { id: string }
  try {
    params = entityParamsSchema.parse(request.params)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  // Non-Admin: check entity is in scope before hitting DB
  if (!scope.isAdmin && !scope.entityIds.includes(params.id)) {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const detail = await entitiesRepository.getEntityDetail(params.id, scope)
  if (!detail) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })
  return reply.send(detail)
}
