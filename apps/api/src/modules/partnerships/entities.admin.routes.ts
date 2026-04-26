import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z, ZodError } from 'zod'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from './partnershipScope.plugin.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { pool } from '../../infra/db/client.js'

/**
 * Entity management routes (Admin-only writes; list is visible to any user
 * scoped into the entity). Uses the in-memory k1Repository store — this is the
 * canonical entity store for local dev and is also written to by the K-1
 * upload flow for auto-created partnerships.
 */

interface EntityListItem {
  id: string
  name: string
  partnershipCount: number
  totalDistributionsUsd: number
}

const createEntitySchema = z.object({
  name: z.string().trim().min(1, 'Entity name is required').max(200),
})

const updateEntitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
})

const paramsSchema = z.object({ id: z.string().min(1) })

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const listEntitiesHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const scope = req.partnershipScope!
  const all = k1Repository.listEntities()
  const visible = scope.isAdmin ? all : all.filter((e) => scope.entityIds.includes(e.id))

  const items: EntityListItem[] = visible.map((entity) => {
    const partnershipsForEntity = k1Repository
      .listPartnerships()
      .filter((p) => p.entityId === entity.id)

    const totalDistributionsUsd = partnershipsForEntity.reduce((sum, p) => {
      const candidates = k1Repository
        .listK1sForPartnership(p.id)
        .filter((k) => k.taxYear != null)
        .sort(
          (a, b) =>
            (b.taxYear as number) - (a.taxYear as number) ||
            b.uploadedAt.getTime() - a.uploadedAt.getTime(),
        )
      for (const k of candidates) {
        const dist = reviewRepository.getEffectiveReportedDistribution(k.id)
        const amount = dist?.reportedDistributionAmount
        if (amount != null) return sum + Number(amount)
      }
      return sum
    }, 0)

    return {
      id: entity.id,
      name: entity.name,
      partnershipCount: partnershipsForEntity.length,
      totalDistributionsUsd,
    }
  })

  items.sort((a, b) => a.name.localeCompare(b.name))
  return reply.send({ items })
}

const createEntityHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }
  let body: z.infer<typeof createEntitySchema>
  try {
    body = createEntitySchema.parse(req.body)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  const needle = body.name.trim().toLowerCase()
  const duplicate = k1Repository.listEntities().some((e) => e.name.trim().toLowerCase() === needle)
  if (duplicate) {
    return reply.status(409).send({ error: 'DUPLICATE_ENTITY_NAME' })
  }

  const entity = k1Repository.createEntity({ name: body.name })

  // Mirror to Postgres when configured so GET /v1/entities/:id (which reads
  // from the DB) can find the row. If the DB already has an entity with the
  // same name (case-insensitive), reuse its UUID and reconcile the in-memory
  // store so subsequent K-1 / partnership inserts use a consistent id.
  if (pool) {
    try {
      const existing = await pool.query<{ id: string }>(
        `select id from entities where lower(name) = lower($1) limit 1`,
        [entity.name],
      )
      if (existing.rows[0] && existing.rows[0].id !== entity.id) {
        k1Repository.deleteEntity(entity.id)
        const reconciled = { id: existing.rows[0].id, name: entity.name }
        return reply.status(201).send(reconciled)
      }
      await pool.query(
        `insert into entities (id, name, entity_type, status, notes, created_at, updated_at)
         values ($1, $2, 'UNKNOWN', 'ACTIVE', null, now(), now())
         on conflict (id) do nothing`,
        [entity.id, entity.name],
      )
    } catch (error) {
      console.warn(
        'Failed to mirror entity into Postgres:',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  await auditRepository.record({
    actorUserId: req.authUser?.id,
    eventName: 'entity.created',
    objectType: 'entity',
    objectId: entity.id,
    before: null,
    after: { id: entity.id, name: entity.name },
  })
  return reply.status(201).send({ id: entity.id, name: entity.name })
}

const updateEntityHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }
  const params = paramsSchema.parse(req.params)
  let body: z.infer<typeof updateEntitySchema>
  try {
    body = updateEntitySchema.parse(req.body)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  const before = k1Repository.listEntities().find((e) => e.id === params.id)
  if (!before) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })

  if (body.name) {
    const needle = body.name.trim().toLowerCase()
    const duplicate = k1Repository
      .listEntities()
      .some((e) => e.id !== params.id && e.name.trim().toLowerCase() === needle)
    if (duplicate) {
      return reply.status(409).send({ error: 'DUPLICATE_ENTITY_NAME' })
    }
  }

  const updated = k1Repository.updateEntity(params.id, body)
  if (!updated) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })

  if (pool && body.name) {
    try {
      await pool.query(
        `update entities set name = $2, updated_at = now() where id = $1`,
        [updated.id, updated.name],
      )
    } catch (error) {
      console.warn(
        'Failed to mirror entity update into Postgres:',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  await auditRepository.record({
    actorUserId: req.authUser?.id,
    eventName: 'entity.updated',
    objectType: 'entity',
    objectId: updated.id,
    before: { id: before.id, name: before.name },
    after: { id: updated.id, name: updated.name },
  })
  return reply.send({ id: updated.id, name: updated.name })
}

const deleteEntityHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }
  const params = paramsSchema.parse(req.params)
  const before = k1Repository.listEntities().find((e) => e.id === params.id)
  if (!before) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })

  if (k1Repository.countPartnershipsForEntity(params.id) > 0) {
    return reply.status(409).send({ error: 'ENTITY_HAS_PARTNERSHIPS' })
  }

  k1Repository.deleteEntity(params.id)

  if (pool) {
    try {
      await pool.query(`delete from entities where id = $1`, [params.id])
    } catch (error) {
      console.warn(
        'Failed to mirror entity delete into Postgres:',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  await auditRepository.record({
    actorUserId: req.authUser?.id,
    eventName: 'entity.deleted',
    objectType: 'entity',
    objectId: before.id,
    before: { id: before.id, name: before.name },
    after: null,
  })
  return reply.status(204).send()
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const registerEntityAdminRoutes = async (app: FastifyInstance) => {
  const gated = { preHandler: [withSession, requireAuthenticated, requirePartnershipScope] }
  app.get('/entities', gated, listEntitiesHandler)
  app.post('/entities', gated, createEntityHandler)
  app.patch('/entities/:id', gated, updateEntityHandler)
  app.delete('/entities/:id', gated, deleteEntityHandler)
}
