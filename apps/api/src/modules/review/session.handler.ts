import type { FastifyReply, FastifyRequest } from 'fastify'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository, confidenceBandFor } from './review.repository.js'
import { k1ReviewParamsSchema } from './review.schemas.js'
import type {
  K1ReviewSession,
  K1FieldValue,
  K1Issue,
  K1ReviewSection,
} from './review.types.js'
import { config } from '../../config.js'

const sendZodError = (reply: FastifyReply, err: ZodError) =>
  reply.code(400).send({
    error: 'VALIDATION_ERROR',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

const isAdmin = (req: FastifyRequest) => req.authUser?.role === 'Admin'

/**
 * Loads the K-1, asserts entity scope, and returns either the row or a formatted
 * response. Returns null when a response has already been sent.
 */
export const loadK1ForReview = (
  request: FastifyRequest,
  reply: FastifyReply,
  k1DocumentId: string,
) => {
  if (!request.authUser) {
    void reply.code(401).send({ error: 'UNAUTHORIZED' })
    return null
  }
  const k = k1Repository.getK1Document(k1DocumentId)
  if (!k || k.supersededByDocumentId) {
    void reply.code(404).send({ error: 'NOT_FOUND' })
    return null
  }
  if (!k1Repository.userCanAccessEntity(request.authUser.userId, k.entityId)) {
    void reply.code(404).send({ error: 'NOT_FOUND' }) // return 404 to avoid leaking existence
    return null
  }
  return k
}

export const sessionHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const parsed = k1ReviewParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const k = loadK1ForReview(request, reply, parsed.data.k1DocumentId)
  if (!k) return

  const partnership = k1Repository.getPartnership(k.partnershipId)
  const entity = k1Repository.listEntities().find((e) => e.id === k.entityId)
  const fieldRecs = reviewRepository.listFieldValuesForK1(k.id)
  const issueRecs = k1Repository.listIssuesForK1(k.id)
  const reported = reviewRepository.getEffectiveReportedDistribution(k.id)

  const fields: K1ReviewSession['fields'] = {
    entityMapping: [],
    partnershipMapping: [],
    core: [],
  }

  const linkedByField = new Map<string, string[]>()
  for (const i of issueRecs) {
    if (i.k1FieldValueId && i.status === 'OPEN') {
      const list = linkedByField.get(i.k1FieldValueId) ?? []
      list.push(i.id)
      linkedByField.set(i.k1FieldValueId, list)
    }
  }

  for (const f of fieldRecs) {
    const wire: K1FieldValue = {
      id: f.id,
      fieldName: f.fieldName,
      label: f.label,
      section: f.section,
      required: f.required,
      rawValue: f.rawValue,
      normalizedValue: f.normalizedValue,
      reviewerCorrectedValue: f.reviewerCorrectedValue,
      confidenceScore: f.confidenceScore,
      confidenceBand: confidenceBandFor(f.confidenceScore),
      sourceLocation: f.sourceLocation,
      reviewStatus: f.reviewStatus,
      isModified:
        f.reviewerCorrectedValue != null &&
        f.reviewerCorrectedValue !== (f.normalizedValue ?? f.rawValue),
      linkedIssueIds: linkedByField.get(f.id) ?? [],
      updatedAt: f.updatedAt.toISOString(),
    }
    fields[f.section].push(wire)
  }

  const issues: K1Issue[] = issueRecs.map((i) => ({
    id: i.id,
    k1FieldValueId: i.k1FieldValueId,
    issueType: i.issueType,
    severity: i.severity,
    status: i.status,
    message: i.message,
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: i.resolvedByUserId,
    createdAt: i.createdAt.toISOString(),
  }))

  const hasOpenIssues = issueRecs.some((i) => i.status === 'OPEN')
  const hasEmptyRequired = fieldRecs.some(
    (f) => f.required && !(f.reviewerCorrectedValue ?? f.normalizedValue ?? f.rawValue),
  )

  const status = k.processingStatus
  const admin = isAdmin(request)

  const canEdit = status !== 'FINALIZED'

  const approveBlockingReasons: import('./review.types.js').K1ActionBlockingReason[] = []
  if (!admin) approveBlockingReasons.push('NOT_ADMIN')
  if (status !== 'NEEDS_REVIEW') approveBlockingReasons.push('WRONG_STATUS')
  if (hasOpenIssues) approveBlockingReasons.push('OPEN_ISSUES')
  if (hasEmptyRequired) approveBlockingReasons.push('EMPTY_REQUIRED')
  if (!k.entityId) approveBlockingReasons.push('UNMAPPED_ENTITY')
  if (!k.partnershipId) approveBlockingReasons.push('UNMAPPED_PARTNERSHIP')
  const canApprove = approveBlockingReasons.length === 0

  const finalizeBlockingReasons: import('./review.types.js').K1ActionBlockingReason[] = []
  if (!admin) finalizeBlockingReasons.push('NOT_ADMIN')
  if (status !== 'READY_FOR_APPROVAL' && status !== 'NEEDS_REVIEW')
    finalizeBlockingReasons.push('WRONG_STATUS')
  if (hasOpenIssues) finalizeBlockingReasons.push('OPEN_ISSUES')
  if (hasEmptyRequired) finalizeBlockingReasons.push('EMPTY_REQUIRED')
  if (!k.entityId) finalizeBlockingReasons.push('UNMAPPED_ENTITY')
  if (!k.partnershipId) finalizeBlockingReasons.push('UNMAPPED_PARTNERSHIP')
  // Box 19A is no longer a blocker in single-admin mode — missing value defaults to $0 on finalize.
  const canFinalize = finalizeBlockingReasons.length === 0

  const body: K1ReviewSession = {
    k1DocumentId: k.id,
    version: k.version,
    status,
    partnership: {
      id: partnership?.id ?? null,
      name: partnership?.name ?? null,
      rawName: partnership?.name ?? null,
    },
    entity: { id: entity?.id ?? null, name: entity?.name ?? null },
    taxYear: k.taxYear,
    uploadedAt: k.uploadedAt.toISOString(),
    approvedByUserId: k.approvedByUserId,
    finalizedByUserId: k.finalizedByUserId,
    fields,
    issues,
    reportedDistributionAmount: reported?.reportedDistributionAmount ?? null,
    pdfUrl: `/v1/k1-documents/${k.id}/pdf`,
    canApprove,
    canFinalize,
    canEdit,
    approveBlockingReasons,
    finalizeBlockingReasons,
  }

  return reply
    .header('ETag', String(k.version))
    .header('Cache-Control', 'private, no-store')
    .send(body)
}

export const pdfHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = k1ReviewParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const k = loadK1ForReview(request, reply, parsed.data.k1DocumentId)
  if (!k) return

  const storagePath = k1Repository.getDocumentStoragePath(k.id)
  if (!storagePath) return reply.code(404).send({ error: 'NOT_FOUND' })

  const abs = path.resolve(config.storageRoot, storagePath)
  try {
    const stat = await fs.stat(abs)
    if (!stat.isFile()) return reply.code(404).send({ error: 'NOT_FOUND' })
  } catch {
    return reply.code(404).send({ error: 'NOT_FOUND' })
  }

  const stream = (await import('node:fs')).createReadStream(abs)
  return reply
    .type('application/pdf')
    .header('Cache-Control', 'private, max-age=300')
    .send(stream)
}
