import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { k1Repository } from '../k1/k1.repository.js'
import { durableK1Repository } from '../k1/k1.repository.js'
import { getK1ObjectStore } from '../k1/storage/index.js'
import { partnershipsRepository } from '../partnerships/partnerships.repository.js'
import {
  durableReviewRepository,
  reviewRepository,
  confidenceBandFor,
  type DurableK1FieldValueRecord,
} from './review.repository.js'
import { k1ExtractionAttemptRepository } from '../k1/extraction/k1ExtractionAttempt.repository.js'
import { k1MatchRepository } from '../k1/matching/k1Match.repository.js'
import { pool, query } from '../../infra/db/client.js'
import { k1ReviewParamsSchema } from './review.schemas.js'
import type {
  K1ReviewSession,
  K1FieldValue,
  K1Issue,
  K1ReviewSection,
} from './review.types.js'

const sendZodError = (reply: FastifyReply, err: ZodError) =>
  reply.code(400).send({
    error: 'VALIDATION_ERROR',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

const isAdmin = (req: FastifyRequest) => req.authUser?.role === 'Admin'

const attemptSummary = (attempt: Awaited<ReturnType<typeof k1ExtractionAttemptRepository.listForDocument>>[number]) => ({
  id: attempt.id,
  attemptNumber: attempt.attemptNumber,
  provider: attempt.provider,
  status: attempt.status,
  blueprintVersion: attempt.blueprintVersion,
  schemaVersion: attempt.mappingSchemaVersion,
  startedAt: attempt.startedAt?.toISOString() ?? null,
  completedAt: attempt.completedAt?.toISOString() ?? null,
  error: attempt.errorCode ? { error: attempt.errorCode, message: attempt.errorSummary ?? undefined, retryable: attempt.status === 'FAILED' } : null,
})

const effectiveDurableFieldValue = (field: DurableK1FieldValueRecord): unknown =>
  field.reviewerCorrectedValueJson
  ?? field.normalizedValueJson
  ?? field.normalizedValue
  ?? field.rawValueJson
  ?? field.rawValue

const coalesceLegacyItemJDecreaseFields = (
  records: DurableK1FieldValueRecord[],
): { records: DurableK1FieldValueRecord[]; aliases: Map<string, string> } => {
  const targetKey = 'part_ii_j_decrease_sale'
  const legacyKey = 'part_ii_j_decrease_exchange'
  const target = records.find((field) => field.destinationKind === 'OFFICIAL' && field.destinationKey === targetKey)
  const legacy = records.find((field) => field.destinationKind === 'OFFICIAL' && field.destinationKey === legacyKey)
  if (!legacy) return { records, aliases: new Map() }

  const representative = target ?? legacy
  const hasExplicitCombinedCorrection = representative.reviewerCorrectedValueJson !== null
  const combinedValue = hasExplicitCombinedCorrection
    ? effectiveDurableFieldValue(representative) === true
    : [target, legacy].filter((field): field is DurableK1FieldValueRecord => Boolean(field))
      .some((field) => effectiveDurableFieldValue(field) === true)
  const statuses = [target, legacy]
    .filter((field): field is DurableK1FieldValueRecord => Boolean(field))
    .map((field) => field.reviewStatus)
  const reviewStatus = hasExplicitCombinedCorrection
    ? representative.reviewStatus
    : statuses.includes('PENDING')
      ? 'PENDING'
      : statuses.includes('CORRECTED')
        ? 'CORRECTED'
        : representative.reviewStatus
  const merged: DurableK1FieldValueRecord = {
    ...representative,
    canonicalPath: `official.${targetKey}`,
    fieldName: `official.${targetKey}`,
    label: 'Item J - Decrease due to sale or exchange of partnership interest',
    normalizedValue: String(combinedValue),
    normalizedValueJson: combinedValue,
    destinationKey: targetKey,
    reviewStatus,
    confidenceScore: [target?.confidenceScore, legacy.confidenceScore]
      .filter((value): value is number => value !== null && value !== undefined)
      .reduce<number | null>((lowest, value) => lowest === null ? value : Math.min(lowest, value), null),
    sourceLocations: [...(target?.sourceLocations ?? []), ...legacy.sourceLocations]
      .filter((location, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(location)) === index),
  }
  const aliases = new Map<string, string>([[legacy.id, representative.id]])
  return {
    records: records.flatMap((field) => {
      if (field.id === representative.id) return [merged]
      if (field.id === legacy.id) return []
      return [field]
    }),
    aliases,
  }
}

const sendDurableSession = async (
  request: FastifyRequest,
  reply: FastifyReply,
  k1DocumentId: string,
): Promise<boolean> => {
  if (!pool) return false
  const document = await durableK1Repository.getById(k1DocumentId)
  if (!document) return false
  const authorized = document.entityId
    ? request.k1Scope?.entityIds.includes(document.entityId)
    : isAdmin(request) || document.uploadedBy === request.authUser?.userId
  if (!authorized) {
    void reply.code(404).send({ error: 'NOT_FOUND' })
    return true
  }
  const [storedFieldRecords, issueRecords, attempts, candidates, histories, refs, applicationActor] = await Promise.all([
    durableReviewRepository.listForActiveAttempt(document.id),
    durableReviewRepository.listIssuesForActiveAttempt(document.id),
    k1ExtractionAttemptRepository.listForDocument(document.id),
    k1MatchRepository.listForActiveAttempt(document.id),
    durableReviewRepository.listCorrectionHistoryForDocument(document.id),
    query<{ partnership_name: string | null; entity_name: string | null }>(
      `select p.name as partnership_name, e.name as entity_name
         from k1_documents kd
         left join partnerships p on p.id = kd.partnership_id
         left join k1_ingestion_items i on i.k1_document_id = kd.id
         left join k1_ingestion_batches b on b.id = i.batch_id
         left join entities e on e.id = coalesce(p.entity_id, b.entity_scope_id)
        where kd.id = $1`,
      [document.id],
    ),
    query<{ applied_by_email: string | null }>(
      `select u.email as applied_by_email
         from k1_document_applications a
         left join users u on u.id = a.applied_by_user_id
        where a.k1_document_id = $1 and a.status = 'APPLIED'
        order by a.applied_at desc nulls last
        limit 1`,
      [document.id],
    ),
  ])
  const itemJ = coalesceLegacyItemJDecreaseFields(storedFieldRecords)
  const fieldRecords = itemJ.records
  const fieldIdByOccurrenceId = new Map(
    storedFieldRecords.flatMap((field) => field.occurrenceId
      ? [[field.occurrenceId, itemJ.aliases.get(field.id) ?? field.id] as const]
      : []),
  )
  const linkedFieldIdForIssue = (issue: typeof issueRecords[number]): string | null =>
    issue.k1FieldValueId
      ? itemJ.aliases.get(issue.k1FieldValueId) ?? issue.k1FieldValueId
      : issue.occurrenceId ? fieldIdByOccurrenceId.get(issue.occurrenceId) ?? null : null
  const linkedByField = new Map<string, string[]>()
  for (const issue of issueRecords) {
    const linkedFieldId = linkedFieldIdForIssue(issue)
    if (!linkedFieldId || issue.status !== 'OPEN') continue
    const linked = linkedByField.get(linkedFieldId) ?? []
    linked.push(issue.id)
    linkedByField.set(linkedFieldId, linked)
  }
  const fields: K1ReviewSession['fields'] = { entityMapping: [], partnershipMapping: [], core: [] }
  for (const field of fieldRecords) {
    const effective = field.reviewerCorrectedValueJson
      ?? field.normalizedValueJson ?? field.normalizedValue ?? field.rawValueJson ?? field.rawValue
    const wire: K1FieldValue = {
      id: field.id, fieldName: field.fieldName, label: field.label, section: field.section,
      required: field.required, rawValue: field.rawValue, normalizedValue: field.normalizedValue,
      reviewerCorrectedValue: field.reviewerCorrectedValue,
      confidenceScore: field.confidenceScore, confidenceBand: confidenceBandFor(field.confidenceScore),
      sourceLocation: field.sourceLocations[0] ?? null, reviewStatus: field.reviewStatus,
      isModified: field.reviewerCorrectedValueJson !== null, linkedIssueIds: linkedByField.get(field.id) ?? [],
      updatedAt: field.updatedAt.toISOString(), extractionAttemptId: field.extractionAttemptId,
      occurrenceId: field.occurrenceId, occurrenceIndex: field.occurrenceIndex,
      canonicalPath: field.canonicalPath, valueKind: field.valueKind,
      rawValueJson: field.rawValueJson, normalizedValueJson: field.normalizedValueJson,
      reviewerCorrectedValueJson: field.reviewerCorrectedValueJson, effectiveValueJson: effective,
      sourceLocations: field.sourceLocations,
      destination: field.destinationKind ? {
        kind: field.destinationKind as 'CALCULATION' | 'OFFICIAL' | 'MATCH_SIGNAL' | 'EVIDENCE_ONLY',
        key: field.destinationKey,
      } : null,
      mappingRuleVersion: field.mappingRuleVersion,
      correctionHistory: (histories[field.id] ?? []).map((history) => ({ ...history, createdAt: history.createdAt.toISOString() })),
    }
    fields[field.section].push(wire)
  }
  const issues: K1Issue[] = issueRecords.map((issue) => ({
    id: issue.id, k1FieldValueId: linkedFieldIdForIssue(issue), issueType: issue.issueType,
    severity: issue.severity, status: issue.status, message: issue.message,
    resolvedAt: issue.resolvedAt?.toISOString() ?? null, resolvedByUserId: issue.resolvedByUserId,
    createdAt: issue.createdAt.toISOString(), extractionAttemptId: issue.extractionAttemptId,
    occurrenceId: issue.occurrenceId, issueCode: issue.issueCode, details: issue.details,
  }))
  const activeAttempt = attempts.find((attempt) => attempt.id === document.activeExtractionAttemptId) ?? null
  const openIssues = issues.filter((issue) => issue.status === 'OPEN')
  const requiredEmpty = fieldRecords.some((field) => field.required && (
    field.reviewerCorrectedValueJson ?? field.normalizedValueJson ?? field.rawValueJson
  ) == null)
  const applyBlockingReasons: string[] = []
  if (!activeAttempt || activeAttempt.status !== 'SUCCEEDED') applyBlockingReasons.push('ACTIVE_ATTEMPT_NOT_SUCCEEDED')
  if (document.matchStatus !== 'MATCHED' || !document.partnershipId) applyBlockingReasons.push('MATCH_REQUIRED')
  if (!document.taxYear) applyBlockingReasons.push('TAX_YEAR_REQUIRED')
  if (openIssues.length) applyBlockingReasons.push('OPEN_ISSUES')
  if (requiredEmpty) applyBlockingReasons.push('EMPTY_REQUIRED')
  if (document.processingStatus !== 'READY_FOR_APPROVAL') applyBlockingReasons.push('REVIEW_NOT_FINALIZED')
  if (document.appliedAt) applyBlockingReasons.push('ALREADY_APPLIED')
  const refsRow = refs.rows[0]
  const admin = isAdmin(request)
  const canApply = applyBlockingReasons.length === 0 && admin
  const approveBlockingReasons: import('./review.types.js').K1ActionBlockingReason[] = []
  if (!admin) approveBlockingReasons.push('NOT_ADMIN')
  if (openIssues.length) approveBlockingReasons.push('OPEN_ISSUES')
  if (requiredEmpty) approveBlockingReasons.push('EMPTY_REQUIRED')
  if (!document.entityId) approveBlockingReasons.push('UNMAPPED_ENTITY')
  if (!document.partnershipId) approveBlockingReasons.push('UNMAPPED_PARTNERSHIP')
  const finalizeBlockingReasons: import('./review.types.js').K1ActionBlockingReason[] = []
  if (!admin) finalizeBlockingReasons.push('NOT_ADMIN')
  if (!activeAttempt || activeAttempt.status !== 'SUCCEEDED' || document.processingStatus !== 'NEEDS_REVIEW' || !document.taxYear || document.appliedAt) {
    finalizeBlockingReasons.push('WRONG_STATUS')
  }
  if (openIssues.length) finalizeBlockingReasons.push('OPEN_ISSUES')
  if (requiredEmpty) finalizeBlockingReasons.push('EMPTY_REQUIRED')
  if (!document.entityId) finalizeBlockingReasons.push('UNMAPPED_ENTITY')
  if (!document.partnershipId || document.matchStatus !== 'MATCHED') finalizeBlockingReasons.push('UNMAPPED_PARTNERSHIP')
  const canFinalize = finalizeBlockingReasons.length === 0
  const body: K1ReviewSession = {
    k1DocumentId: document.id, version: document.version, status: document.processingStatus,
    partnership: { id: document.partnershipId, name: refsRow?.partnership_name ?? null, rawName: document.partnershipNameRaw },
    entity: { id: document.entityId, name: refsRow?.entity_name ?? null }, taxYear: document.taxYear,
    uploadedAt: document.uploadedAt.toISOString(), approvedByUserId: document.approvedByUserId,
    finalizedByUserId: document.finalizedByUserId, fields, issues,
    reportedDistributionAmount: null, pdfUrl: `/k1-documents/${document.id}/pdf`,
    canApprove: false, canFinalize,
    canEdit: !document.appliedAt, approveBlockingReasons,
    finalizeBlockingReasons, activeAttempt: activeAttempt ? attemptSummary(activeAttempt) : null,
    attemptHistory: attempts.map(attemptSummary), matchCandidates: candidates,
    canApply, applyBlockingReasons: admin ? applyBlockingReasons : ['NOT_ADMIN', ...applyBlockingReasons],
    appliedTrackerYearId: document.appliedTrackerYearId,
    appliedAt: document.appliedAt?.toISOString() ?? null,
    appliedByEmail: applicationActor.rows[0]?.applied_by_email ?? null,
  }
  void reply.header('ETag', String(document.version)).header('Cache-Control', 'private, no-store').send(body)
  return true
}

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
  if (await sendDurableSession(request, reply, parsed.data.k1DocumentId)) return
  const k = loadK1ForReview(request, reply, parsed.data.k1DocumentId)
  if (!k) return

  const partnershipScope = {
    isAdmin: request.authUser!.role === 'Admin',
    entityIds: k1Repository.listEntitiesForUser(request.authUser!.userId),
  }
  const partnership = k.partnershipId
    ? await partnershipsRepository.getPartnershipById(k.partnershipId, partnershipScope)
    : null
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
  // Two-person rule: the admin who approved cannot also finalize.
  if (k.approvedByUserId && k.approvedByUserId === request.authUser?.userId) {
    finalizeBlockingReasons.push('SAME_ACTOR_FINALIZE_FORBIDDEN')
  }
  const canFinalize = finalizeBlockingReasons.length === 0

  const body: K1ReviewSession = {
    k1DocumentId: k.id,
    version: k.version,
    status,
    partnership: {
      id: partnership?.id ?? null,
      name: partnership?.name ?? null,
      rawName: k.partnershipNameRaw ?? partnership?.name ?? null,
    },
    entity: { id: entity?.id ?? null, name: entity?.name ?? null },
    taxYear: k.taxYear,
    uploadedAt: k.uploadedAt.toISOString(),
    approvedByUserId: k.approvedByUserId,
    finalizedByUserId: k.finalizedByUserId,
    fields,
    issues,
    reportedDistributionAmount: reported?.reportedDistributionAmount ?? null,
    pdfUrl: `/k1-documents/${k.id}/pdf`,
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
  if (pool) {
    const durable = await durableK1Repository.getById(parsed.data.k1DocumentId)
    if (durable) {
      const authorized = durable.entityId
        ? request.k1Scope?.entityIds.includes(durable.entityId)
        : isAdmin(request) || durable.uploadedBy === request.authUser?.userId
      if (!authorized) return reply.code(404).send({ error: 'NOT_FOUND' })
      try {
        const rangeHeader = request.headers.range
        let range: { start: number; end?: number } | undefined
        if (rangeHeader) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader)
          if (!match?.[1]) return reply.code(416).header('Accept-Ranges', 'bytes').send({ error: 'INVALID_RANGE' })
          range = { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined }
          if (!Number.isSafeInteger(range.start) || (range.end != null && (!Number.isSafeInteger(range.end) || range.end < range.start))) {
            return reply.code(416).header('Accept-Ranges', 'bytes').send({ error: 'INVALID_RANGE' })
          }
        }
        const object = await getK1ObjectStore().read({
          key: durable.storagePath, bucket: durable.storageBucket, versionId: durable.storageVersionId,
        }, range)
        const response = reply.type(object.metadata.contentType ?? 'application/pdf')
          .header('Accept-Ranges', 'bytes')
          .header('Cache-Control', 'private, no-store')
          .header('X-Content-Type-Options', 'nosniff')
        if (range) {
          response.code(206)
          if (object.contentRange) response.header('Content-Range', object.contentRange)
        }
        return response.send(object.body)
      } catch (error) {
        if ((error as { code?: string }).code === 'INVALID_OBJECT_RANGE') {
          return reply.code(416).header('Accept-Ranges', 'bytes').send({ error: 'INVALID_RANGE' })
        }
        return reply.code(404).send({ error: 'NOT_FOUND' })
      }
    }
  }
  const k = loadK1ForReview(request, reply, parsed.data.k1DocumentId)
  if (!k) return

  const storagePath = k1Repository.getDocumentStoragePath(k.id)
  if (!storagePath) return reply.code(404).send({ error: 'NOT_FOUND' })

  try {
    const rangeHeader = request.headers.range
    let range: { start: number; end?: number } | undefined
    if (rangeHeader) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader)
      if (!match?.[1]) {
        return reply.code(416).header('Accept-Ranges', 'bytes').send({ error: 'INVALID_RANGE' })
      }
      range = {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : undefined,
      }
    }
    const object = await getK1ObjectStore().read({ key: storagePath }, range)
    const response = reply
      .type(object.metadata.contentType ?? 'application/pdf')
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'private, max-age=300')
    if (range) {
      response.code(206)
      if (object.contentRange) response.header('Content-Range', object.contentRange)
    }
    return response.send(object.body)
  } catch {
    return reply.code(404).send({ error: 'NOT_FOUND' })
  }
}
