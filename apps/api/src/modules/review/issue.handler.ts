import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from './review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  k1ReviewIssueParamsSchema,
  k1ReviewParamsSchema,
  openIssueBodySchema,
} from './review.schemas.js'
import type {
  K1OpenIssueResponse,
  K1ResolveIssueResponse,
} from './review.types.js'
import { loadK1ForReview } from './session.handler.js'

const sendZodError = (reply: FastifyReply, err: ZodError) =>
  reply.code(400).send({
    error: 'VALIDATION_ERROR',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

const parseIfMatch = (header: unknown): number | null => {
  if (typeof header !== 'string') return null
  const n = Number.parseInt(header.replace(/^"|"$/g, '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

export const openIssueHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)
  const body = openIssueBodySchema.safeParse(request.body ?? {})
  if (!body.success) return sendZodError(reply, body.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return
  if (k.processingStatus === 'FINALIZED') return reply.code(409).send({ error: 'K1_FINALIZED' })

  const expected = parseIfMatch(request.headers['if-match'])
  if (expected == null) return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  if (expected !== k.version) {
    return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })
  }

  // If the caller links a field, it must belong to this K-1.
  if (body.data.k1FieldValueId) {
    const f = reviewRepository.getFieldValue(body.data.k1FieldValueId)
    if (!f || f.k1DocumentId !== k.id) {
      return reply.code(400).send({ error: 'UNKNOWN_FIELD' })
    }
  }

  const issue = k1Repository.addIssue({
    k1DocumentId: k.id,
    issueType: body.data.issueType ?? 'USER_RAISED',
    severity: body.data.severity ?? 'MEDIUM',
    message: body.data.message ?? '',
    k1FieldValueId: body.data.k1FieldValueId ?? null,
  })

  const updated = k1Repository.casUpdateK1(k.id, expected, {})
  if (!updated) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })

  await auditRepository.record({
    actorUserId: request.authUser!.userId,
    eventName: 'k1.issue_opened',
    objectType: 'k1_issue',
    objectId: issue.id,
    after: {
      status: 'OPEN',
      message: issue.message,
      k1_field_value_id: issue.k1FieldValueId,
      severity: issue.severity,
    },
  })

  const res: K1OpenIssueResponse = { issueId: issue.id, version: updated.version }
  return reply.code(201).header('ETag', String(updated.version)).send(res)
}

export const resolveIssueHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewIssueParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return

  const issue = k1Repository.getIssue(params.data.issueId)
  if (!issue || issue.k1DocumentId !== k.id) return reply.code(404).send({ error: 'NOT_FOUND' })
  if (issue.status === 'RESOLVED') {
    return reply.code(409).send({ error: 'ISSUE_ALREADY_RESOLVED' })
  }

  const expected = parseIfMatch(request.headers['if-match'])
  if (expected == null) return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  if (expected !== k.version) {
    return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })
  }

  const actor = request.authUser!.userId
  k1Repository.resolveIssue(issue.id, { resolvedByUserId: actor })

  const updated = k1Repository.casUpdateK1(k.id, expected, {})
  if (!updated) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })

  await auditRepository.record({
    actorUserId: actor,
    eventName: 'k1.issue_resolved',
    objectType: 'k1_issue',
    objectId: issue.id,
    before: { status: 'OPEN' },
    after: { status: 'RESOLVED', resolution_cause: 'manual' },
  })

  const res: K1ResolveIssueResponse = { version: updated.version }
  return reply.header('ETag', String(updated.version)).send(res)
}
