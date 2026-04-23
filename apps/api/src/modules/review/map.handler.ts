import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  k1ReviewParamsSchema,
  mapEntityBodySchema,
  mapPartnershipBodySchema,
} from './review.schemas.js'
import type { K1MapResponse } from './review.types.js'
import { loadK1ForReview } from './session.handler.js'

const sendZodError = (reply: FastifyReply, err: ZodError) =>
  reply.code(400).send({
    error: 'VALIDATION_ERROR',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

const parseIfMatch = (header: unknown): number | null => {
  if (typeof header !== 'string') return null
  const trimmed = header.replace(/^"|"$/g, '').trim()
  const n = Number.parseInt(trimmed, 10)
  return Number.isFinite(n) ? n : null
}

const requireVersion = (req: FastifyRequest, reply: FastifyReply, current: number) => {
  const v = parseIfMatch(req.headers['if-match'])
  if (v == null) {
    void reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
    return null
  }
  if (v !== current) {
    void reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: current })
    return null
  }
  return v
}

export const mapEntityHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)
  const body = mapEntityBodySchema.safeParse(request.body)
  if (!body.success) return sendZodError(reply, body.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return
  if (k.processingStatus === 'FINALIZED') return reply.code(409).send({ error: 'K1_FINALIZED' })

  const v = requireVersion(request, reply, k.version)
  if (v == null) return

  // Entity must exist and be in caller's scope (FR-013, FR-029).
  const entities = k1Repository.listEntities()
  const target = entities.find((e) => e.id === body.data.entityId)
  if (!target) return reply.code(400).send({ error: 'UNMAPPED_ENTITY' })
  if (!k1Repository.userCanAccessEntity(request.authUser!.userId, target.id)) {
    return reply.code(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const before = k.entityId
  const updated = k1Repository.casUpdateK1(k.id, v, { entityId: target.id })
  if (!updated) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })

  await auditRepository.record({
    actorUserId: request.authUser!.userId,
    eventName: 'k1.entity_mapped',
    objectType: 'k1_document',
    objectId: k.id,
    before: { entity_id: before },
    after: { entity_id: target.id },
  })

  const res: K1MapResponse = { version: updated.version, status: updated.processingStatus }
  return reply.header('ETag', String(updated.version)).send(res)
}

export const mapPartnershipHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)
  const body = mapPartnershipBodySchema.safeParse(request.body)
  if (!body.success) return sendZodError(reply, body.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return
  if (k.processingStatus === 'FINALIZED') return reply.code(409).send({ error: 'K1_FINALIZED' })

  const v = requireVersion(request, reply, k.version)
  if (v == null) return

  const partnership = k1Repository.getPartnership(body.data.partnershipId)
  if (!partnership) return reply.code(400).send({ error: 'UNMAPPED_PARTNERSHIP' })
  if (partnership.entityId !== k.entityId) {
    return reply.code(400).send({ error: 'PARTNERSHIP_ENTITY_MISMATCH' })
  }

  const before = k.partnershipId
  const updated = k1Repository.casUpdateK1(k.id, v, { partnershipId: partnership.id })
  if (!updated) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })

  await auditRepository.record({
    actorUserId: request.authUser!.userId,
    eventName: 'k1.partnership_mapped',
    objectType: 'k1_document',
    objectId: k.id,
    before: { partnership_id: before },
    after: { partnership_id: partnership.id },
  })

  const res: K1MapResponse = { version: updated.version, status: updated.processingStatus }
  return reply.header('ETag', String(updated.version)).send(res)
}
