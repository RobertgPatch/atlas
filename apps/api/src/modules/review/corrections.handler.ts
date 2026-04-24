import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from './review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  correctionsBodySchema,
  k1ReviewParamsSchema,
  validateFieldValueFormat,
} from './review.schemas.js'
import type { K1CorrectionsResponse } from './review.types.js'
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

export const correctionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)

  const body = correctionsBodySchema.safeParse(request.body)
  if (!body.success) return sendZodError(reply, body.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return

  if (k.processingStatus === 'FINALIZED') {
    return reply.code(409).send({ error: 'K1_FINALIZED' })
  }

  const expectedVersion = parseIfMatch(request.headers['if-match'])
  if (expectedVersion == null) {
    return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
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
    const field = reviewRepository.getFieldValue(c.fieldId)
    if (!field || field.k1DocumentId !== k.id) {
      validationErrors.push({ fieldId: c.fieldId, error: 'UNKNOWN_FIELD' })
      continue
    }
    const fmt = validateFieldValueFormat(field.fieldName, c.value)
    if (!fmt.ok) {
      validationErrors.push({ fieldId: c.fieldId, error: fmt.error })
      continue
    }
    resolvedFields.push({
      fieldId: c.fieldId,
      newValue: c.value,
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
