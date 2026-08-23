import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { durableK1Repository } from '../k1/k1.repository.js'
import { durableReviewRepository, reviewRepository } from './review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  k1ReviewIssueParamsSchema,
  k1ReviewParamsSchema,
  openIssueBodySchema,
  resolveIssueBodySchema,
} from './review.schemas.js'
import type {
  K1OpenIssueResponse,
  K1ResolveIssueResponse,
} from './review.types.js'
import { loadK1ForReview } from './session.handler.js'
import { pool, withTransaction } from '../../infra/db/client.js'
import { assertK1DocumentInScope } from '../k1/k1Scope.plugin.js'
import { randomUUID } from 'node:crypto'

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

  const expected = parseIfMatch(request.headers['if-match'])
  if (expected == null) return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  if (pool) {
    const durable = await durableK1Repository.getById(params.data.k1DocumentId)
    if (durable) {
      if (!await assertK1DocumentInScope(request, reply, durable.id)) return
      if (durable.version !== expected) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: durable.version })
      const fields = body.data.k1FieldValueId ? await durableReviewRepository.listForActiveAttempt(durable.id) : []
      if (body.data.k1FieldValueId && !fields.some((field) => field.id === body.data.k1FieldValueId)) {
        return reply.code(400).send({ error: 'INACTIVE_OR_UNKNOWN_FIELD' })
      }
      const result = await withTransaction(async (client) => {
        const locked = await durableK1Repository.lockById(client, durable.id)
        if (!locked || locked.version !== expected) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: locked?.version })
        const issueId = randomUUID()
        await client.query(
          `insert into k1_issues
             (id, k1_document_id, issue_type, severity, status, message,
              k1_field_value_id, extraction_attempt_id, issue_code, details_json)
           values ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $3, '{}'::jsonb)`,
          [issueId, durable.id, body.data.issueType ?? 'USER_RAISED', body.data.severity ?? 'MEDIUM',
            body.data.message ?? '', body.data.k1FieldValueId ?? null, durable.activeExtractionAttemptId],
        )
        const updated = await durableK1Repository.compareAndSet(client, durable.id, expected, { processingStatus: 'NEEDS_REVIEW' })
        if (!updated) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION' })
        await auditRepository.record({ actorUserId: request.authUser!.userId, eventName: 'k1.issue_opened', objectType: 'k1_issue', objectId: issueId }, client)
        return { issueId, version: updated.version }
      })
      return reply.code(201).header('ETag', String(result.version)).send(result)
    }
  }

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return
  if (k.processingStatus === 'FINALIZED') return reply.code(409).send({ error: 'K1_FINALIZED' })
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

  const expected = parseIfMatch(request.headers['if-match'])
  if (expected == null) return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  const body = resolveIssueBodySchema.safeParse(request.body ?? {})
  if (!body.success) return sendZodError(reply, body.error)
  if (pool) {
    const durable = await durableK1Repository.getById(params.data.k1DocumentId)
    if (durable) {
      if (!await assertK1DocumentInScope(request, reply, durable.id)) return
      try {
        const result = await withTransaction(async (client) => {
          const locked = await durableK1Repository.lockById(client, durable.id)
          if (!locked || locked.version !== expected) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: locked?.version })
          const issueResult = await client.query<{
            id: string; status: string; issue_type: string; issue_code: string | null
            k1_field_value_id: string | null; extraction_attempt_id: string | null
          }>('select id, status, issue_type, issue_code, k1_field_value_id, extraction_attempt_id from k1_issues where id = $1 and k1_document_id = $2 for update', [params.data.issueId, durable.id])
          const issue = issueResult.rows[0]
          if (!issue) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
          if (issue.status === 'RESOLVED') throw Object.assign(new Error('ISSUE_ALREADY_RESOLVED'), { code: 'ISSUE_ALREADY_RESOLVED' })
          if (issue.extraction_attempt_id && issue.extraction_attempt_id !== locked.activeExtractionAttemptId) {
            throw Object.assign(new Error('INACTIVE_EXTRACTION_ATTEMPT'), { code: 'INACTIVE_EXTRACTION_ATTEMPT' })
          }
          if (issue.issue_type === 'MATCHING') throw Object.assign(new Error('MATCH_RESOLUTION_REQUIRED'), { code: 'MATCH_RESOLUTION_REQUIRED' })
          const acknowledgementRequired = !issue.k1_field_value_id || /^(BDA_|UNMAPPED_|UNSUPPORTED_)/.test(issue.issue_code ?? '')
          if (acknowledgementRequired && !body.data.acknowledgement) {
            throw Object.assign(new Error('ACKNOWLEDGEMENT_REQUIRED'), { code: 'ACKNOWLEDGEMENT_REQUIRED' })
          }
          if (issue.k1_field_value_id) {
            const field = await durableReviewRepository.lockField(client, issue.k1_field_value_id)
            if (!field || field.extractionAttemptId !== locked.activeExtractionAttemptId) {
              throw Object.assign(new Error('INACTIVE_EXTRACTION_ATTEMPT'), { code: 'INACTIVE_EXTRACTION_ATTEMPT' })
            }
            if (field.reviewStatus === 'PENDING' && !body.data.acceptExtractedValue && field.reviewerCorrectedValueJson == null) {
              throw Object.assign(new Error('FIELD_REVIEW_REQUIRED'), { code: 'FIELD_REVIEW_REQUIRED' })
            }
            if (body.data.acceptExtractedValue) {
              await client.query(`update k1_field_values set review_status = 'ACCEPTED', updated_at = now() where id = $1`, [field.id])
            }
          }
          await client.query(
            `update k1_issues
                set status = 'RESOLVED', resolved_by_user_id = $2, resolved_at = now(),
                    details_json = details_json || $3::jsonb
              where id = $1`,
            [issue.id, request.authUser!.userId, JSON.stringify({ acknowledgement: body.data.acknowledgement ?? null })],
          )
          const updated = await durableK1Repository.compareAndSet(client, durable.id, expected, {})
          if (!updated) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION' })
          await auditRepository.record({ actorUserId: request.authUser!.userId, eventName: 'k1.issue_resolved', objectType: 'k1_issue', objectId: issue.id, after: { acknowledgement: body.data.acknowledgement ?? null } }, client)
          return updated.version
        })
        return reply.header('ETag', String(result)).send({ version: result })
      } catch (error) {
        const cause = error as Error & { code?: string; currentVersion?: number }
        if (cause.code === 'NOT_FOUND') return reply.code(404).send({ error: cause.code })
        if (cause.code === 'STALE_K1_VERSION' || cause.code === 'ISSUE_ALREADY_RESOLVED' || cause.code === 'INACTIVE_EXTRACTION_ATTEMPT') {
          return reply.code(409).send({ error: cause.code, currentVersion: cause.currentVersion })
        }
        if (cause.code === 'MATCH_RESOLUTION_REQUIRED' || cause.code === 'ACKNOWLEDGEMENT_REQUIRED' || cause.code === 'FIELD_REVIEW_REQUIRED') {
          return reply.code(422).send({ error: cause.code })
        }
        throw error
      }
    }
  }

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return

  const issue = k1Repository.getIssue(params.data.issueId)
  if (!issue || issue.k1DocumentId !== k.id) return reply.code(404).send({ error: 'NOT_FOUND' })
  if (issue.status === 'RESOLVED') {
    return reply.code(409).send({ error: 'ISSUE_ALREADY_RESOLVED' })
  }

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
