import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { durableK1Repository } from '../k1/k1.repository.js'
import { durableReviewRepository, reviewRepository } from './review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  correctionsBodySchema,
  k1ReviewParamsSchema,
  validateFieldValueFormat,
} from './review.schemas.js'
import type { K1CorrectionsResponse } from './review.types.js'
import { loadK1ForReview } from './session.handler.js'
import { pool } from '../../infra/db/client.js'
import { assertK1DocumentInScope } from '../k1/k1Scope.plugin.js'

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

const validateTypedValue = (kind: string | null, value: unknown): string | null => {
  if (value == null) return null
  if (kind === 'BOOLEAN') return typeof value === 'boolean' ? null : 'INVALID_BOOLEAN'
  if (kind === 'DATE') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : 'INVALID_DATE_FORMAT'
  if (kind === 'NUMBER' || kind === 'MONEY' || kind === 'PERCENTAGE') {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
    return Number.isFinite(number) ? null : 'INVALID_NUMERIC_VALUE'
  }
  if (kind === 'CODE_ROW') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'INVALID_CODE_ROW'
    const row = value as Record<string, unknown>
    return typeof row.code === 'string' && row.code.length <= 20 && ('value' in row || 'amount' in row)
      ? null : 'INVALID_CODE_ROW'
  }
  return typeof value === 'string' && value.length <= 1000 ? null : 'INVALID_STRING_VALUE'
}

export const correctionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)

  const body = correctionsBodySchema.safeParse(request.body)
  if (!body.success) return sendZodError(reply, body.error)

  const expectedVersion = parseIfMatch(request.headers['if-match'])
  if (expectedVersion == null) {
    return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  }
  if (pool) {
    const durable = await durableK1Repository.getById(params.data.k1DocumentId)
    if (durable) {
      if (!await assertK1DocumentInScope(request, reply, durable.id)) return
      if (durable.version !== expectedVersion) {
        return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: durable.version })
      }
      const activeFields = await durableReviewRepository.listForActiveAttempt(durable.id)
      const byId = new Map(activeFields.map((field) => [field.id, field]))
      const corrections = body.data.corrections.map((correction) => ({
        fieldId: correction.fieldId ?? correction.fieldValueId!, correctedValue: correction.value,
      }))
      const validationErrors = corrections.flatMap((correction) => {
        const field = byId.get(correction.fieldId)
        if (!field) return [{ fieldId: correction.fieldId, error: 'INACTIVE_OR_UNKNOWN_FIELD' }]
        const error = validateTypedValue(field.valueKind, correction.correctedValue)
        return error ? [{ fieldId: correction.fieldId, error }] : []
      })
      if (validationErrors.length) return reply.code(400).send({ error: 'VALIDATION_FAILED', fields: validationErrors })
      try {
        const saved = await durableReviewRepository.saveCorrections({
          k1DocumentId: durable.id, corrections, correctedByUserId: request.authUser!.userId,
          expectedDocumentVersion: expectedVersion,
        })
        const res: K1CorrectionsResponse = {
          version: saved.documentVersion, status: 'NEEDS_REVIEW',
          resolvedIssueIds: saved.resolvedIssueIds, approvalRevoked: durable.approvedByUserId !== null,
        }
        return reply.header('ETag', String(saved.documentVersion)).send(res)
      } catch (error) {
        const cause = error as Error & { code?: string; currentVersion?: number }
        if (cause.code === 'STALE_K1_VERSION' || cause.code === 'INACTIVE_EXTRACTION_ATTEMPT' || cause.code === 'K1_FINALIZED') {
          return reply.code(409).send({ error: cause.code, currentVersion: cause.currentVersion })
        }
        throw error
      }
    }
  }

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return

  if (k.processingStatus === 'FINALIZED') {
    return reply.code(409).send({ error: 'K1_FINALIZED' })
  }
  if (expectedVersion !== k.version) {
    return reply
      .code(409)
      .send({ error: 'STALE_K1_VERSION', currentVersion: k.version })
  }

  // Validate each correction against its field's format rules.
  const validationErrors: Array<{ fieldId: string; error: string }> = []
  const resolvedFields: Array<{
    before: {
      rawValue: string | null
      normalizedValue: string | null
      reviewerCorrectedValue: string | null
    }
    fieldId: string
    newValue: string | null
    fieldName: string
  }> = []

  for (const c of body.data.corrections) {
    const fieldId = c.fieldId ?? c.fieldValueId!
    const field = reviewRepository.getFieldValue(fieldId)
    if (!field || field.k1DocumentId !== k.id) {
      validationErrors.push({ fieldId, error: 'UNKNOWN_FIELD' })
      continue
    }
    const value: string | null = c.value == null ? null : typeof c.value === 'string' ? c.value : String(c.value)
    const fmt = validateFieldValueFormat(field.fieldName, value)
    if (!fmt.ok) {
      validationErrors.push({ fieldId, error: fmt.error })
      continue
    }
    resolvedFields.push({
      fieldId,
      newValue: value,
      fieldName: field.fieldName,
      before: {
        rawValue: field.rawValue,
        normalizedValue: field.normalizedValue,
        reviewerCorrectedValue: field.reviewerCorrectedValue,
      },
    })
  }

  if (validationErrors.length > 0) {
    return reply
      .code(400)
      .send({ error: 'VALIDATION_FAILED', fields: validationErrors })
  }

  const actorUserId = request.authUser!.userId

  // Apply updates (atomic in-memory; in production this is a single DB transaction).
  const resolvedIssueIds: string[] = []
  for (const c of resolvedFields) {
    reviewRepository.updateFieldCorrection(c.fieldId, {
      reviewerCorrectedValue: c.newValue,
      // For V1 the normalizer is a pass-through; real normalization belongs to parsing.
      normalizedValue: c.newValue,
      reviewStatus: 'REVIEWED',
    })
    // Auto-resolve linked OPEN issues when the correction passes validation (it did).
    const linked = k1Repository.findOpenIssuesForField(c.fieldId)
    for (const issue of linked) {
      k1Repository.resolveIssue(issue.id, { resolvedByUserId: null })
      resolvedIssueIds.push(issue.id)
    }
  }

  // Recompute Approve-preconditions post-save. If K-1 was READY_FOR_APPROVAL and now regresses,
  // transition back to NEEDS_REVIEW and clear approved_by.
  const fieldsAfter = reviewRepository.listFieldValuesForK1(k.id)
  const issuesAfter = k1Repository.listIssuesForK1(k.id)
  const anyOpen = issuesAfter.some((i) => i.status === 'OPEN')
  const emptyRequired = fieldsAfter.some(
    (f) =>
      f.required &&
      !(f.reviewerCorrectedValue ?? f.normalizedValue ?? f.rawValue),
  )

  let approvalRevoked = false
  let cause: string | null = null
  let nextStatus = k.processingStatus
  const nextPatch: Parameters<typeof k1Repository.casUpdateK1>[2] = {}

  if (
    k.processingStatus === 'READY_FOR_APPROVAL' &&
    (anyOpen || emptyRequired)
  ) {
    approvalRevoked = true
    nextStatus = 'NEEDS_REVIEW'
    cause = emptyRequired ? 'cleared_required_field' : 'new_open_issue'
    nextPatch.processingStatus = 'NEEDS_REVIEW'
    nextPatch.approvedByUserId = null
  }

  const updated = k1Repository.casUpdateK1(k.id, expectedVersion, nextPatch)
  if (!updated) {
    // Race lost — another writer beat us.
    return reply
      .code(409)
      .send({ error: 'STALE_K1_VERSION', currentVersion: k1Repository.getK1Document(k.id)?.version ?? 0 })
  }

  // Audit events
  for (const c of resolvedFields) {
    await auditRepository.record({
      actorUserId,
      eventName: 'k1.field_corrected',
      objectType: 'k1_field_value',
      objectId: c.fieldId,
      before: c.before,
      after: {
        rawValue: c.before.rawValue,
        normalizedValue: c.newValue,
        reviewerCorrectedValue: c.newValue,
      },
    })
  }
  for (const issueId of resolvedIssueIds) {
    await auditRepository.record({
      actorUserId,
      eventName: 'k1.issue_resolved',
      objectType: 'k1_issue',
      objectId: issueId,
      before: { status: 'OPEN' },
      after: { status: 'RESOLVED', resolution_cause: 'auto' },
    })
  }
  if (approvalRevoked) {
    await auditRepository.record({
      actorUserId,
      eventName: 'k1.approval_revoked',
      objectType: 'k1_document',
      objectId: k.id,
      before: {
        processing_status: 'READY_FOR_APPROVAL',
        approved_by_user_id: k.approvedByUserId,
      },
      after: {
        processing_status: 'NEEDS_REVIEW',
        approved_by_user_id: null,
        cause,
      },
    })
  }

  const res: K1CorrectionsResponse = {
    version: updated.version,
    status: nextStatus,
    resolvedIssueIds,
    approvalRevoked,
  }
  return reply.header('ETag', String(updated.version)).send(res)
}
