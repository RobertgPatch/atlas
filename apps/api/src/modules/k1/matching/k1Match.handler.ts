import type { FastifyReply, FastifyRequest } from 'fastify'

import { assertK1DocumentInScope } from '../k1Scope.plugin.js'
import { k1ReviewParamsSchema, resolveK1MatchBodySchema } from '../../review/review.schemas.js'
import { k1MatchService } from './k1Match.service.js'

export const resolveK1MatchHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  const body = resolveK1MatchBodySchema.safeParse(request.body)
  if (!params.success || !body.success) {
    return reply.code(400).send({
      error: 'VALIDATION_ERROR',
      issues: [...(params.success ? [] : params.error.issues), ...(body.success ? [] : body.error.issues)]
        .map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  if (!await assertK1DocumentInScope(request, reply, params.data.k1DocumentId)) return
  if (body.data.createFromExtraction) {
    return reply.code(409).send({
      error: 'EXPLICIT_RECORD_CREATION_REQUIRED',
      message: 'Create and authorize the entity/partnership first, then select those records.',
    })
  }
  try {
    const updated = await k1MatchService.resolve({
      k1DocumentId: params.data.k1DocumentId,
      expectedDocumentVersion: body.data.expectedDocumentVersion,
      entityId: body.data.entityId,
      partnershipId: body.data.partnershipId,
      taxYear: body.data.taxYear,
      actorUserId: request.authUser!.userId,
      authorizedEntityIds: request.k1Scope?.entityIds ?? [],
    })
    return reply.header('ETag', String(updated.version)).send({
      documentVersion: updated.version,
      entityId: body.data.entityId,
      partnershipId: body.data.partnershipId,
      taxYear: body.data.taxYear,
      matchStatus: updated.matchStatus,
    })
  } catch (error) {
    const cause = error as Error & { code?: string; currentVersion?: number }
    if (cause.code === 'K1_DOCUMENT_NOT_FOUND') return reply.code(404).send({ error: cause.code })
    if (cause.code === 'FORBIDDEN_ENTITY') return reply.code(403).send({ error: cause.code })
    if (cause.code === 'STALE_K1_VERSION' || cause.code === 'ENTITY_PARTNERSHIP_CONFLICT') {
      return reply.code(409).send({ error: cause.code, currentVersion: cause.currentVersion })
    }
    throw error
  }
}
