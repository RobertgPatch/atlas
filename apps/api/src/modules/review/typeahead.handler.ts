import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'

const entityQuerySchema = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const partnershipQuerySchema = z.object({
  entity_id: z.string().optional(),
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const entityTypeaheadHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const parsed = entityQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({ error: 'INVALID_QUERY' })
  }
  const { q, limit } = parsed.data

  const userId = request.authUser!.userId
  const allowedEntityIds = k1Repository.listEntitiesForUser(userId)
  const allEntities = k1Repository.listEntities()
  const scoped = allEntities.filter((e) => allowedEntityIds.includes(e.id))

  const lower = q.toLowerCase()
  const filtered = lower
    ? scoped.filter((e) => e.name.toLowerCase().includes(lower))
    : scoped

  const items = filtered.slice(0, limit).map((e) => ({ id: e.id, name: e.name }))
  return reply.send({ items })
}

export const partnershipTypeaheadHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const parsed = partnershipQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({ error: 'INVALID_QUERY' })
  }
  const { entity_id, q, limit } = parsed.data

  const userId = request.authUser!.userId
  const allowedEntities = k1Repository.listEntitiesForUser(userId)

  let allPartnerships = k1Repository.listPartnerships()

  // Scope to entity_id if provided; verify the user has access to it.
  if (entity_id) {
    if (!allowedEntities.includes(entity_id)) {
      return reply.code(403).send({ error: 'FORBIDDEN_ENTITY' })
    }
    allPartnerships = allPartnerships.filter((p) => p.entityId === entity_id)
  } else {
    allPartnerships = allPartnerships.filter((p) => allowedEntities.includes(p.entityId))
  }

  const lower = q.toLowerCase()
  const filtered = lower
    ? allPartnerships.filter((p) => p.name.toLowerCase().includes(lower))
    : allPartnerships

  const items = filtered.slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name,
    entityId: p.entityId,
  }))
  return reply.send({ items })
}
