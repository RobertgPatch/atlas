import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { partnershipsRepository } from './partnerships.repository.js'
import { pool, withTransaction } from '../../infra/db/client.js'
import type { PartnershipDirectoryRow } from '../../../../../packages/types/src/partnership-management.js'
import {
  listPartnershipsQuerySchema,
  exportPartnershipsQuerySchema,
  partnershipParamsSchema,
  createPartnershipBodySchema,
  updatePartnershipBodySchema,
} from './partnerships.zod.js'

/**
 * GET /v1/partnerships
 * Returns paginated PartnershipDirectoryResponse with KPI totals.
 */
export const listPartnershipsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = request.partnershipScope!

  // Guard: non-Admin requesting an out-of-scope entityId
  const rawQuery = request.query as Record<string, unknown>
  const entityIdFilter = rawQuery.entityId as string | undefined
  if (entityIdFilter && !scope.isAdmin && !scope.entityIds.includes(entityIdFilter)) {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  let query: ReturnType<typeof listPartnershipsQuerySchema.parse>
  try {
    query = listPartnershipsQuerySchema.parse(request.query)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  const result = await partnershipsRepository.listPartnerships(query, scope)
  return reply.send(result)
}

/**
 * GET /v1/partnerships/export.csv
 * Streams a CSV file of the filtered partnership list (capped at 5 000 rows).
 * Returns 413 if the result would exceed the cap.
 */
export const exportPartnershipsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = request.partnershipScope!

  let filters: ReturnType<typeof exportPartnershipsQuerySchema.parse>
  try {
    filters = exportPartnershipsQuerySchema.parse(request.query)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  // Non-Admin entityId guard
  if (filters.entityId && !scope.isAdmin && !scope.entityIds.includes(filters.entityId)) {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const { rows, cappedAt5000 } = await partnershipsRepository.listForExport(filters, scope)
  if (cappedAt5000) {
    return reply.status(413).send({ error: 'EXPORT_ROW_LIMIT_EXCEEDED', limit: 5000 })
  }

  // CSV is intentionally built in memory: the 5 000-row cap above ensures
  // the payload stays bounded. If the cap is ever raised, revisit streaming.
  const csv = buildCsv(rows)
  const filename = `partnerships-${new Date().toISOString().slice(0, 10)}.csv`
  void reply.header('Content-Type', 'text/csv; charset=utf-8')
  void reply.header('Content-Disposition', `attachment; filename="${filename}"`)
  return reply.send(csv)
}

// ---------------------------------------------------------------------------
// GET /v1/partnerships/:id
// ---------------------------------------------------------------------------

export const getPartnershipDetailHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = request.partnershipScope!

  let params: { id: string }
  try {
    params = partnershipParamsSchema.parse(request.params)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  const detail = await partnershipsRepository.getPartnershipDetail(params.id, scope)
  if (!detail) return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  return reply.send(detail)
}

// ---------------------------------------------------------------------------
// POST /v1/partnerships — T048
// ---------------------------------------------------------------------------

export const createPartnershipHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = request.partnershipScope!

  // Role guard
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let body: ReturnType<typeof createPartnershipBodySchema.parse>
  try {
    body = createPartnershipBodySchema.parse(request.body)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  // Scope guard
  if (!scope.isAdmin && !scope.entityIds.includes(body.entityId)) {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  // Duplicate check (uses pool directly — safe outside transaction)
  const isDuplicate = await partnershipsRepository.findByEntityAndName(body.entityId, body.name)
  if (isDuplicate) {
    return reply.status(409).send({ error: 'DUPLICATE_PARTNERSHIP_NAME' })
  }

  try {
    const partnership = pool
      ? await withTransaction((client) =>
          partnershipsRepository.insertPartnership(body, request.authUser!.id, client),
        )
      : await partnershipsRepository.insertPartnership(body, request.authUser!.id, null)
    return reply.status(201).send(partnership)
  } catch (err: unknown) {
    // withTransaction throws if pool is undefined or entity doesn't exist
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('DATABASE_URL') || msg.includes('ENTITY_NOT_FOUND')) {
      return reply.status(404).send({ error: 'ENTITY_NOT_FOUND' })
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/partnerships/:id — T049
// ---------------------------------------------------------------------------

export const updatePartnershipHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = request.partnershipScope!

  // Role guard
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { id: string }
  try {
    params = partnershipParamsSchema.parse(request.params)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  let body: ReturnType<typeof updatePartnershipBodySchema.parse>
  try {
    body = updatePartnershipBodySchema.parse(request.body)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  // Fetch the existing partnership to validate scope and check for rename collision
  const existing = await partnershipsRepository.getPartnershipById(params.id, scope)
  if (!existing) {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }

  // Non-Admin scope guard
  if (!scope.isAdmin && !scope.entityIds.includes(existing.entity.id)) {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  // Rename collision check
  if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
    const isDuplicate = await partnershipsRepository.findByEntityAndName(
      existing.entity.id,
      body.name,
      params.id,
    )
    if (isDuplicate) {
      return reply.status(409).send({ error: 'DUPLICATE_PARTNERSHIP_NAME' })
    }
  }

  try {
    const updated = pool
      ? await withTransaction((client) =>
          partnershipsRepository.updatePartnership(params.id, body, request.authUser!.id, client),
        )
      : await partnershipsRepository.updatePartnership(params.id, body, request.authUser!.id, null)
    if (!updated) return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
    return reply.send(updated)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('DATABASE_URL')) {
      return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// CSV builder (T021)
// ---------------------------------------------------------------------------

function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCsv(rows: PartnershipDirectoryRow[]): string {
  const header = [
    'Partnership Name',
    'Entity',
    'Asset Class',
    'Status',
    'Latest K-1 Year',
    'Latest Distribution (USD)',
    'Latest FMV (USD)',
    'FMV As Of Date',
  ].join(',')

  const dataRows = rows.map((r) =>
    [
      escapeCsvField(r.name),
      escapeCsvField(r.entity.name),
      escapeCsvField(r.assetClass),
      escapeCsvField(r.status),
      escapeCsvField(r.latestK1Year),
      escapeCsvField(r.latestDistributionUsd),
      escapeCsvField(r.latestFmv?.amountUsd),
      escapeCsvField(r.latestFmv?.asOfDate),
    ].join(','),
  )

  return [header, ...dataRows].join('\n')
}
