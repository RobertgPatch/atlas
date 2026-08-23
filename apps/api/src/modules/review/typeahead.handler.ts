import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { pool } from '../../infra/db/client.js'
import { k1Repository } from '../k1/k1.repository.js'
import { partnershipsRepository } from '../partnerships/partnerships.repository.js'

const entityQuerySchema = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const partnershipQuerySchema = z.object({
  entity_id: z.string().optional(),
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

interface EntityOption {
  id: string
  name: string
}

const durableEntityOptions = async (
  request: FastifyRequest,
  q = '',
  limit?: number,
): Promise<EntityOption[] | null> => {
  if (!pool) return null
  const admin = request.authUser!.role === 'Admin'
  const result = await pool.query<EntityOption>(
    `select distinct e.id, e.name
       from entities e
       left join entity_memberships em
         on em.entity_id = e.id and em.user_id = $1
      where ($2::boolean or em.user_id is not null)
        and ($3 = '' or e.name ilike '%' || $3 || '%')
      order by e.name, e.id
      limit coalesce($4::integer, 2147483647)`,
    [request.authUser!.userId, admin, q, limit ?? null],
  )
  return result.rows
}

export const entityTypeaheadHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const parsed = entityQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({ error: 'INVALID_QUERY' })
  }
  const { q, limit } = parsed.data

  const durableItems = await durableEntityOptions(request, q, limit)
  if (durableItems) return reply.send({ items: durableItems })

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
  const isAdmin = request.authUser!.role === 'Admin'
  const durableEntities = await durableEntityOptions(request)
  const allowedEntityIds = durableEntities
    ? durableEntities.map((entity) => entity.id)
    : isAdmin
      ? k1Repository.listEntities().map((entity) => entity.id)
      : k1Repository.listEntitiesForUser(userId)

  // Scope to entity_id if provided; verify the user has access to it.
  if (entity_id && !allowedEntityIds.includes(entity_id)) {
    return reply.code(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const result = await partnershipsRepository.listPartnerships(
    {
      search: q || undefined,
      entityId: entity_id,
      sort: 'name',
      page: 1,
      pageSize: limit,
    },
    {
      isAdmin,
      entityIds: allowedEntityIds,
    },
  )

  const items = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    entityId: row.entity.id,
  }))
  return reply.send({ items })
}
