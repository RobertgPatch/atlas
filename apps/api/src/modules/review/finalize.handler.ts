import type { FastifyReply, FastifyRequest } from 'fastify'

import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { durableK1Repository } from '../k1/k1.repository.js'
import { transitionK1IngestionItem } from '../k1/ingestion/k1BatchStatus.service.js'
import { assertK1DocumentInScope } from '../k1/k1Scope.plugin.js'
import { durableReviewRepository } from './review.repository.js'
import { k1ReviewParamsSchema } from './review.schemas.js'
import { finalizeFaultInjection, finalizeHandler as legacyFinalizeHandler } from './approve.handler.js'

const parseIfMatch = (header: unknown): number | null => {
  if (typeof header !== 'string') return null
  const parsed = Number.parseInt(header.replace(/^"|"$/g, '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Completes durable extraction review; financial writes occur only in /apply. */
export const finalizeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
  if (pool) {
    const document = await durableK1Repository.getById(params.data.k1DocumentId)
    if (document) {
      if (!await assertK1DocumentInScope(request, reply, document.id)) return
      if (request.authUser?.role !== 'Admin') return reply.code(403).send({ error: 'ROLE_REQUIRED_ADMIN' })
      const expected = parseIfMatch(request.headers['if-match'])
      if (expected == null) return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
      if (expected !== document.version) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: document.version })
      try {
        const result = await withTransaction(async (client) => {
          const locked = await durableK1Repository.lockById(client, document.id)
          if (!locked || locked.version !== expected) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: locked?.version })
          if (!locked.activeExtractionAttemptId || locked.matchStatus !== 'MATCHED' || !locked.partnershipId || !locked.taxYear) {
            throw Object.assign(new Error('FINALIZE_PRECONDITION_FAILED'), { code: 'FINALIZE_PRECONDITION_FAILED', cause: 'unmatched' })
          }
          const [attempt, issues, fields] = await Promise.all([
            client.query<{ status: string }>('select status from k1_extraction_attempts where id = $1 for share', [locked.activeExtractionAttemptId]),
            durableReviewRepository.listIssuesForActiveAttempt(locked.id),
            durableReviewRepository.listForActiveAttempt(locked.id),
          ])
          if (attempt.rows[0]?.status !== 'SUCCEEDED') throw Object.assign(new Error('FINALIZE_PRECONDITION_FAILED'), { code: 'FINALIZE_PRECONDITION_FAILED', cause: 'active_attempt' })
          if (issues.some((issue) => issue.status === 'OPEN')) throw Object.assign(new Error('FINALIZE_PRECONDITION_FAILED'), { code: 'FINALIZE_PRECONDITION_FAILED', cause: 'open_issues' })
          if (fields.some((field) => field.required && (field.reviewerCorrectedValueJson ?? field.normalizedValueJson ?? field.rawValueJson) == null)) {
            throw Object.assign(new Error('FINALIZE_PRECONDITION_FAILED'), { code: 'FINALIZE_PRECONDITION_FAILED', cause: 'empty_required' })
          }
          await client.query(
            `update k1_field_values set review_status = 'ACCEPTED', updated_at = now()
              where k1_document_id = $1 and extraction_attempt_id = $2 and review_status = 'PENDING'`,
            [locked.id, locked.activeExtractionAttemptId],
          )
          const updated = await durableK1Repository.compareAndSet(client, locked.id, expected, { processingStatus: 'READY_FOR_APPROVAL' })
          if (!updated) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION' })
          await client.query(`update k1_documents set approved_by_user_id = $2 where id = $1`, [locked.id, request.authUser!.userId])
          const item = await client.query<{ id: string; status: 'NEEDS_MATCH' | 'NEEDS_REVIEW' }>(
            `select id, status from k1_ingestion_items
              where k1_document_id = $1 and status in ('NEEDS_MATCH', 'NEEDS_REVIEW') for update`,
            [locked.id],
          )
          if (item.rows[0]) {
            await transitionK1IngestionItem(client, item.rows[0].id, {
              from: [item.rows[0].status], to: 'READY_TO_APPLY',
            })
          }
          await auditRepository.record({
            actorUserId: request.authUser!.userId, eventName: 'k1.review_finalized',
            objectType: 'k1_document', objectId: locked.id,
            after: { extractionAttemptId: locked.activeExtractionAttemptId, status: 'READY_TO_APPLY' },
          }, client)
          return updated.version
        })
        return reply.header('ETag', String(result)).send({
          version: result, status: 'READY_FOR_APPROVAL', finalizedByUserId: request.authUser.userId,
          partnershipAnnualActivityId: null, readyToApply: true,
        })
      } catch (error) {
        const cause = error as Error & { code?: string; currentVersion?: number; cause?: string }
        if (cause.code === 'STALE_K1_VERSION') return reply.code(409).send({ error: cause.code, currentVersion: cause.currentVersion })
        if (cause.code === 'FINALIZE_PRECONDITION_FAILED') return reply.code(409).send({ error: cause.code, cause: cause.cause })
        throw error
      }
    }
  }
  return legacyFinalizeHandler(request, reply)
}

export { finalizeFaultInjection }
