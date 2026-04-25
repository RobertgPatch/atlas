import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { fmvRepository } from './fmv.repository.js'
import { partnershipsRepository } from './partnerships.repository.js'
import { pool, withTransaction } from '../../infra/db/client.js'
import {
  partnershipParamsSchema,
  createFmvSnapshotBodySchema,
} from './partnerships.zod.js'

// ---------------------------------------------------------------------------
// GET /v1/partnerships/:id/fmv-snapshots — list (T059)
// ---------------------------------------------------------------------------

export const listFmvSnapshotsHandler = async (
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

  // Non-Admin scope check
  if (!scope.isAdmin) {
    const partnership = await partnershipsRepository.getPartnershipById(params.id, scope)
    if (!partnership) return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
    if (!scope.entityIds.includes(partnership.entity.id)) {
      return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
    }
  }

  const snapshots = await fmvRepository.listFmvSnapshots(params.id, scope)
  return reply.send(snapshots ?? [])
}

// ---------------------------------------------------------------------------
// POST /v1/partnerships/:id/fmv-snapshots — create (T059)
// ---------------------------------------------------------------------------

export const createFmvSnapshotHandler = async (
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

  let body: ReturnType<typeof createFmvSnapshotBodySchema.parse>
  try {
    body = createFmvSnapshotBodySchema.parse(request.body)
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: err.issues })
    }
    throw err
  }

  // Future date check
  const today = new Date().toISOString().slice(0, 10)
  if (body.asOfDate > today) {
    return reply.status(400).send({ error: 'FUTURE_DATE_NOT_ALLOWED' })
  }

  // Negative amount guard (zero requires LIQUIDATED status check below)
  if (body.amountUsd < 0) {
    return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'Amount must be >= 0' })
  }

  // Fetch partnership to check status for zero-amount guard and scope
  const partnership = await partnershipsRepository.getPartnershipById(params.id, scope)
  if (!partnership) return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })

  // Non-Admin scope guard
  if (!scope.isAdmin && !scope.entityIds.includes(partnership.entity.id)) {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  // Zero amount only allowed for LIQUIDATED
  if (body.amountUsd === 0 && partnership.status !== 'LIQUIDATED') {
    return reply.status(400).send({
      error: 'ZERO_AMOUNT_NOT_ALLOWED',
      message: 'Zero FMV is only allowed for LIQUIDATED partnerships',
    })
  }

  try {
    const snapshot = pool
      ? await withTransaction((client) =>
          fmvRepository.insertFmvSnapshot(params.id, body, request.authUser!.id, client),
        )
      : await fmvRepository.insertFmvSnapshot(params.id, body, request.authUser!.id, null)
    return reply.status(201).send(snapshot)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('DATABASE_URL')) {
      return reply.status(503).send({ error: 'DATABASE_UNAVAILABLE' })
    }
    throw err
  }
}
