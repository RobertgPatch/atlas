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
  entityType: string
  jurisdiction: string | null
  taxId: string | null
  formedOn: string | null
  status: string
  notes: string | null
  registeredAgent: string | null
  primaryContact: string | null
  ownerCount: number
  partnershipCount: number
  investmentCount: number
  holdingsValueUsd: number
  totalDistributionsUsd: number
}

const entityKindSchema = z.enum(['llc', 'trust', 'corporation', 'partnership', 'individual'])

const formationDateSchema = z
  .string()
  .trim()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Formation date must use MM/DD/YYYY')
  .optional()
  .or(z.literal(''))

const createEntitySchema = z.object({
  name: z.string().trim().min(1, 'Entity name is required').max(200),
  kind: entityKindSchema.default('llc'),
  jurisdiction: z.string().trim().min(1, 'Jurisdiction is required').max(120).default('Not on file'),
  taxId: z.string().trim().max(40).optional().default(''),
  formedOn: formationDateSchema,
})

const updateEntitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
})

const paramsSchema = z.object({ id: z.string().uuid() })

const toIsoDate = (value: string | undefined): string | null => {
  if (!value) return null
  const [month, day, year] = value.split('/').map(Number)
  const parsed = new Date(Date.UTC(year!, month! - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month! - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ZodError([
      {
        code: 'custom',
        path: ['formedOn'],
        message: 'Formation date is not valid',
      },
    ])
  }
  return `${year!.toString().padStart(4, '0')}-${month!.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`
}

const formatDirectoryDate = (value: unknown): string | null => {
  if (!value) return null
  const source = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  const [year, month, day] = source.split('-')
  return year && month && day ? `${month}/${day}/${year}` : String(value)
}

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
      entity_type: string
      jurisdiction: string | null
      tax_id: string | null
      formed_on: string | Date | null
      status: string
      notes: string | null
      registered_agent: string | null
      primary_contact: string | null
      partnership_count: string | number
      investment_count: string | number
      holdings_value_usd: string | number
    }>(
      `
        with latest_partnership_fmv as (
          select distinct on (partnership_id)
            partnership_id,
            fmv_amount
          from partnership_fmv_snapshots
          order by partnership_id, created_at desc, valuation_date desc, id desc
        ),
        latest_asset_fmv as (
          select distinct on (asset_id)
            asset_id,
            fmv_amount
          from partnership_asset_fmv_snapshots
          order by asset_id, created_at desc, valuation_date desc, id desc
        ),
        partnership_rollup as (
          select
            p.entity_id,
            count(*) as partnership_count,
            coalesce(sum(lpf.fmv_amount), 0) as partnership_value_usd
          from partnerships p
          left join latest_partnership_fmv lpf on lpf.partnership_id = p.id
          group by p.entity_id
        ),
        investment_rollup as (
          select
            p.entity_id,
            count(pa.id) as investment_count,
            coalesce(sum(laf.fmv_amount), 0) as investment_value_usd
          from partnerships p
          join partnership_assets pa on pa.partnership_id = p.id
          left join latest_asset_fmv laf on laf.asset_id = pa.id
          group by p.entity_id
        )
        select
          e.id,
          e.name,
          e.entity_type,
          e.jurisdiction,
          e.tax_id,
          e.formed_on,
          e.status,
          e.notes,
          e.registered_agent,
          e.primary_contact,
          coalesce(pr.partnership_count, 0) as partnership_count,
          coalesce(ir.investment_count, 0) as investment_count,
          coalesce(pr.partnership_value_usd, 0) + coalesce(ir.investment_value_usd, 0) as holdings_value_usd
        from entities e
        left join partnership_rollup pr on pr.entity_id = e.id
        left join investment_rollup ir on ir.entity_id = e.id
        ${where}
        order by e.name
      `,
      params,
    )

    const items: EntityListItem[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      entityType: row.entity_type,
      jurisdiction: row.jurisdiction,
      taxId: row.tax_id,
      formedOn: formatDirectoryDate(row.formed_on),
      status: row.status,
      notes: row.notes,
      registeredAgent: row.registered_agent,
      primaryContact: row.primary_contact,
      ownerCount: 0,
      partnershipCount: Number(row.partnership_count),
      investmentCount: Number(row.investment_count),
      holdingsValueUsd: Number(row.holdings_value_usd),
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
      entityType: entity.entityType,
      jurisdiction: entity.jurisdiction,
      taxId: entity.taxId,
      formedOn: entity.formedOn,
      status: entity.status,
      notes: entity.notes,
      registeredAgent: entity.registeredAgent,
      primaryContact: entity.primaryContact,
      ownerCount: 0,
      partnershipCount: partnershipsForEntity.length,
      investmentCount: 0,
      holdingsValueUsd: 0,
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

  let formedOn: string | null
  try {
    formedOn = toIsoDate(body.formedOn || undefined)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  const entity = k1Repository.createEntity({
    name: body.name,
    entityType: body.kind.toUpperCase(),
    jurisdiction: body.jurisdiction,
    taxId: body.taxId,
    formedOn: body.formedOn || null,
  })

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
        `insert into entities (
          id, name, entity_type, jurisdiction, tax_id, formed_on, status, notes,
          registered_agent, primary_contact, created_at, updated_at
        )
         values ($1, $2, $3, $4, $5, $6::date, 'DRAFT', null, null, null, now(), now())
         on conflict (id) do nothing`,
        [entity.id, entity.name, entity.entityType, entity.jurisdiction, entity.taxId, formedOn],
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
    after: entity,
  })
  return reply.status(201).send({
    id: entity.id,
    name: entity.name,
    entityType: entity.entityType,
    jurisdiction: entity.jurisdiction,
    taxId: entity.taxId,
    formedOn: entity.formedOn,
    status: entity.status,
  })
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
