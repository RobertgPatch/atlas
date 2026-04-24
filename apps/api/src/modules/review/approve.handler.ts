import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from './review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { k1ReviewParamsSchema } from './review.schemas.js'
import type {
  K1ApproveResponse,
  K1FinalizeResponse,
} from './review.types.js'
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

// Injection seam for rollback tests (SC-007). When set, the finalize handler
// will throw at the named step, allowing the integration test to verify that
// all writes rolled back.
export const finalizeFaultInjection: { step: string | null } = { step: null }

export const approveHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return
  if (request.authUser?.role !== 'Admin') {
    return reply.code(403).send({ error: 'ROLE_REQUIRED_ADMIN' })
  }
  if (k.processingStatus === 'FINALIZED') return reply.code(409).send({ error: 'K1_FINALIZED' })
  if (k.processingStatus !== 'NEEDS_REVIEW') {
    return reply.code(409).send({ error: 'INVALID_STATE_TRANSITION' })
  }

  const expectedVersion = parseIfMatch(request.headers['if-match'])
  if (expectedVersion == null) {
    return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  }
  if (expectedVersion !== k.version) {
    return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })
  }

  // Approve preconditions: no open issues, no empty required fields, mapped entity+partnership.
  const fields = reviewRepository.listFieldValuesForK1(k.id)
  const issues = k1Repository.listIssuesForK1(k.id)
  if (issues.some((i) => i.status === 'OPEN')) {
    return reply.code(409).send({ error: 'APPROVE_PRECONDITION_FAILED', cause: 'open_issues' })
  }
  if (fields.some((f) => f.required && !(f.reviewerCorrectedValue ?? f.normalizedValue ?? f.rawValue))) {
    return reply.code(409).send({ error: 'APPROVE_PRECONDITION_FAILED', cause: 'empty_required' })
  }
  if (!k.entityId || !k.partnershipId) {
    return reply.code(409).send({ error: 'APPROVE_PRECONDITION_FAILED', cause: 'unmapped' })
  }

  const actor = request.authUser!.userId

  const updated = k1Repository.casUpdateK1(k.id, expectedVersion, {
    processingStatus: 'READY_FOR_APPROVAL',
    approvedByUserId: actor,
  })
  if (!updated) return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })

  await auditRepository.record({
    actorUserId: actor,
    eventName: 'k1.approved',
    objectType: 'k1_document',
    objectId: k.id,
    before: { processing_status: 'NEEDS_REVIEW', approved_by_user_id: null },
    after: { processing_status: 'READY_FOR_APPROVAL', approved_by_user_id: actor },
  })

  const res: K1ApproveResponse = {
    version: updated.version,
    status: 'READY_FOR_APPROVAL',
    approvedByUserId: actor,
  }
  return reply.header('ETag', String(updated.version)).send(res)
}

export const finalizeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = k1ReviewParamsSchema.safeParse(request.params)
  if (!params.success) return sendZodError(reply, params.error)

  const k = loadK1ForReview(request, reply, params.data.k1DocumentId)
  if (!k) return
  if (request.authUser?.role !== 'Admin') {
    return reply.code(403).send({ error: 'ROLE_REQUIRED_ADMIN' })
  }
  const actor = request.authUser.userId

  if (k.processingStatus === 'FINALIZED') return reply.code(409).send({ error: 'K1_FINALIZED' })
  if (k.processingStatus !== 'READY_FOR_APPROVAL' && k.processingStatus !== 'NEEDS_REVIEW') {
    return reply.code(409).send({ error: 'INVALID_STATE_TRANSITION' })
  }

  const expectedVersion = parseIfMatch(request.headers['if-match'])
  if (expectedVersion == null) return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' })
  if (expectedVersion !== k.version) {
    return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })
  }

  // Finalize preconditions (single-admin workflow: missing Box 19A defaults to $0).
  const fields = reviewRepository.listFieldValuesForK1(k.id)
  const issues = k1Repository.listIssuesForK1(k.id)
  if (issues.some((i) => i.status === 'OPEN')) {
    return reply.code(409).send({ error: 'FINALIZE_PRECONDITION_FAILED', cause: 'open_issues' })
  }
  if (fields.some((f) => f.required && !(f.reviewerCorrectedValue ?? f.normalizedValue ?? f.rawValue))) {
    return reply.code(409).send({ error: 'FINALIZE_PRECONDITION_FAILED', cause: 'empty_required' })
  }
  if (!k.entityId || !k.partnershipId) {
    return reply.code(409).send({ error: 'FINALIZE_PRECONDITION_FAILED', cause: 'unmapped' })
  }
  const reported = reviewRepository.getEffectiveReportedDistribution(k.id)
  const reportedDistributionAmount = reported?.reportedDistributionAmount ?? '0'

  // Snapshot current state for rollback on simulated failure.
  const prevK = { ...k }

  // Simulated fault injection for SC-007 rollback tests.
  const fail = (step: string) => {
    if (finalizeFaultInjection.step === step) {
      throw new Error(`Injected failure at step: ${step}`)
    }
  }

  try {
    fail('status_update')
    const updated = k1Repository.casUpdateK1(k.id, expectedVersion, {
      processingStatus: 'FINALIZED',
      approvedByUserId: k.approvedByUserId ?? actor,
      finalizedByUserId: actor,
    })
    if (!updated) {
      return reply.code(409).send({ error: 'STALE_K1_VERSION', currentVersion: k.version })
    }

    fail('annual_activity_upsert')
    const paa = reviewRepository.upsertPartnershipAnnualActivity({
      entityId: updated.entityId,
      partnershipId: updated.partnershipId,
      taxYear: updated.taxYear,
      reportedDistributionAmount,
      finalizedFromK1DocumentId: updated.id,
    })

    fail('audit_write')
    await auditRepository.record({
      actorUserId: actor,
      eventName: 'k1.finalized',
      objectType: 'k1_document',
      objectId: k.id,
      before: {
        processing_status: 'READY_FOR_APPROVAL',
        approved_by_user_id: k.approvedByUserId,
        finalized_by_user_id: null,
      },
      after: {
        processing_status: 'FINALIZED',
        approved_by_user_id: updated.approvedByUserId,
        finalized_by_user_id: actor,
        partnership_annual_activity_id: paa.id,
      },
    })

    const res: K1FinalizeResponse = {
      version: updated.version,
      status: 'FINALIZED',
      finalizedByUserId: actor,
      partnershipAnnualActivityId: paa.id,
    }
    return reply.header('ETag', String(updated.version)).send(res)
  } catch (err) {
    // Rollback: restore k1_documents row; remove any partnership_annual_activity we may have inserted.
    k1Repository._debugSetK1(prevK)
    const maybe = reviewRepository.getPartnershipAnnualActivity(
      prevK.entityId,
      prevK.partnershipId,
      prevK.taxYear,
    )
    if (maybe && maybe.finalizedFromK1DocumentId === prevK.id) {
      reviewRepository._debugDeletePartnershipAnnualActivity(
        prevK.entityId,
        prevK.partnershipId,
        prevK.taxYear,
      )
    }
    request.log?.error({ err }, 'finalize rolled back due to injected failure')
    return reply.code(500).send({ error: 'FINALIZE_FAILED', step: finalizeFaultInjection.step })
  }
}
