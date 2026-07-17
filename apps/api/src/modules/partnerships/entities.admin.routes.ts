import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z, ZodError } from 'zod'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from './partnershipScope.plugin.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { pool, withTransaction } from '../../infra/db/client.js'

/**
 * Entity management routes (Admin-only writes; list is visible to any user
 * scoped into the entity). PostgreSQL is canonical when configured; the
 * in-memory k1Repository remains the fallback for database-free local dev.
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

const paramsSchema = z.object({ id: z.string().uuid() })

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const listEntitiesHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const scope = req.partnershipScope!

  if (pool) {
    if (!scope.isAdmin && scope.entityIds.length === 0) {
      return reply.send({ items: [] satisfies EntityListItem[] })
    }

    const params: unknown[] = []
    const where = scope.isAdmin
      ? ''
      : (() => {
          params.push(scope.entityIds)
          return `where e.id = any($${params.length}::uuid[])`
        })()

    const result = await pool.query<{
      id: string
      name: string
      partnership_count: string | number
    }>(
      `
        select
          e.id,
          e.name,
          count(p.id) as partnership_count
        from entities e
        left join partnerships p on p.entity_id = e.id
        ${where}
        group by e.id, e.name
        order by e.name
      `,
      params,
    )

    const items: EntityListItem[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      partnershipCount: Number(row.partnership_count),
      totalDistributionsUsd: 0,
    }))

    return reply.send({ items })
  }

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
    actorUserId: req.authUser?.userId,
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

  if (pool) {
    try {
      const updated = await withTransaction(async (client) => {
        const before = (await client.query<{ id: string; name: string }>('select id, name from entities where id = $1 for update', [params.id])).rows[0]
        if (!before) return null
        const nextName = body.name?.trim() ?? before.name
        const duplicate = (await client.query(
          'select 1 from entities where id <> $1 and lower(trim(name)) = lower(trim($2)) limit 1',
          [params.id, nextName],
        )).rows[0]
        if (duplicate) return 'DUPLICATE' as const
        const row = (await client.query<{ id: string; name: string }>(
          'update entities set name = $2, updated_at = now() where id = $1 returning id, name',
          [params.id, nextName],
        )).rows[0]!
        await auditRepository.record({
          actorUserId: req.authUser?.userId,
          eventName: 'entity.updated',
          objectType: 'entity',
          objectId: row.id,
          before,
          after: row,
        }, client)
        return row
      })
      if (updated == null) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })
      if (updated === 'DUPLICATE') return reply.status(409).send({ error: 'DUPLICATE_ENTITY_NAME' })
      return reply.send(updated)
    } catch (error) {
      req.log.error({ err: error }, 'Failed to update database-backed entity')
      throw error
    }
  }

  const before = k1Repository.listEntities().find((entity) => entity.id === params.id)
  if (!before) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })
  if (body.name) {
    const needle = body.name.trim().toLowerCase()
    const duplicate = k1Repository.listEntities().some((entity) => entity.id !== params.id && entity.name.trim().toLowerCase() === needle)
    if (duplicate) return reply.status(409).send({ error: 'DUPLICATE_ENTITY_NAME' })
  }
  const updated = k1Repository.updateEntity(params.id, body)
  if (!updated) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })
  await auditRepository.record({ actorUserId: req.authUser?.userId, eventName: 'entity.updated', objectType: 'entity', objectId: updated.id, before, after: updated })
  return reply.send({ id: updated.id, name: updated.name })
}

const deleteEntityHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }
  const params = paramsSchema.parse(req.params)

  if (pool) {
    const deleted = await withTransaction(async (client) => {
      const before = (await client.query<{ id: string; name: string }>(
        'select id, name from entities where id = $1 for update',
        [params.id],
      )).rows[0]
      if (!before) return null

      const hasPartnerships = (await client.query(
        'select 1 from partnerships where entity_id = $1 limit 1',
        [params.id],
      )).rows.length > 0
      if (hasPartnerships) return 'HAS_PARTNERSHIPS' as const

      await client.query('delete from k1_tracker_import_batches where entity_id = $1', [params.id])
      await client.query('delete from entity_memberships where entity_id = $1', [params.id])
      await client.query('delete from entities where id = $1', [params.id])
      await auditRepository.record({
        actorUserId: req.authUser?.userId,
        eventName: 'entity.deleted',
        objectType: 'entity',
        objectId: before.id,
        before,
        after: null,
      }, client)
      return before
    })

    if (deleted == null) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })
    if (deleted === 'HAS_PARTNERSHIPS') return reply.status(409).send({ error: 'ENTITY_HAS_PARTNERSHIPS' })

    // Reconcile process-local development state when the entity happens to be
    // present there; PostgreSQL remains authoritative in database-backed mode.
    k1Repository.deleteEntity(params.id)
    return reply.status(204).send()
  }

  const before = k1Repository.listEntities().find((e) => e.id === params.id)
  if (!before) return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })

  if (k1Repository.countPartnershipsForEntity(params.id) > 0) {
    return reply.status(409).send({ error: 'ENTITY_HAS_PARTNERSHIPS' })
  }

  k1Repository.deleteEntity(params.id)

  await auditRepository.record({
    actorUserId: req.authUser?.userId,
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
