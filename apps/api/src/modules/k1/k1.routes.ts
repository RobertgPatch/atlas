import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { admitCostWorkload } from '../abuse-protection/costWorkloadAdmission.js'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import { withTransaction } from '../../infra/db/client.js'
import { durableK1BatchRepository, k1Repository } from './k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { capitalRepository } from '../partnerships/capital.repository.js'
import { getK1ObjectStore } from './storage/index.js'
import { getExtractor } from './extraction/index.js'
import { assertEntityInScope, k1AuditMetadata, requireK1Scope } from './k1Scope.plugin.js'
import {
  completeIngestionUploadsSchema,
  createIngestionBatchSchema,
  detailParamsSchema,
  exportQuerySchema,
  ingestionBatchParamsSchema,
  ingestionBatchListSchema,
  ingestionItemParamsSchema,
  kpiQuerySchema,
  listQuerySchema,
  localUploadHeadersSchema,
  retryExtractionBodySchema,
  applyPreviewBodySchema,
  applyK1BodySchema,
  uploadBodySchema,
} from './k1.schemas.js'
import type {
  K1ListResponse,
  K1Status,
  K1UploadResponse,
} from './k1.types.js'
import { config } from '../../config.js'
import { createK1IngestionBatch, getK1IngestionBatch, listK1IngestionBatches, toPublicItem } from './ingestion/k1Batch.service.js'
import { acceptLocalK1Upload } from './ingestion/localUploadSlots.service.js'
import { completeK1BatchUploads } from './ingestion/k1UploadCompletion.service.js'
import { retryK1Extraction } from './extraction/k1Retry.service.js'
import { assertK1DocumentInScope } from './k1Scope.plugin.js'
import { createK1ApplyPreview } from './application/k1ApplyPreview.service.js'
import { applyReviewedK1 } from './application/k1Apply.service.js'
import { cancelK1IngestionItem } from './ingestion/k1Cancel.service.js'
import { deleteK1IngestionItem } from './ingestion/k1Delete.service.js'
import { logK1Workflow } from './k1Observability.js'

const sendZodError = (reply: FastifyReply, err: ZodError) =>
  reply.code(400).send({
    error: 'VALIDATION_ERROR',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

const ingestionErrorStatus = (code: string): number => {
  if (code === 'BATCH_NOT_FOUND' || code === 'ITEM_NOT_FOUND' || code === 'UPLOAD_NOT_FOUND') return 404
  if (code === 'FORBIDDEN_ENTITY' || code === 'FORBIDDEN_K1_DOCUMENT') return 403
  if (code === 'UNSUPPORTED_MEDIA_TYPE') return 415
  if (code === 'WORKLOAD_DISABLED' || code === 'PROTECTION_UNAVAILABLE') return 503
  if (code === 'INVALID_FILE_COUNT' || code === 'INVALID_FILE_NAME' || code === 'INVALID_FILE_SIZE' || code === 'INVALID_CHECKSUM') return 400
  return 409
}

const ingestionErrorMessage = (code: string): string => ({
  DUPLICATE_K1_CONTENT: 'This exact PDF was already uploaded.',
  OBJECT_CHECKSUM_MISMATCH: 'The uploaded file checksum does not match.',
  OBJECT_SIZE_MISMATCH: 'The uploaded file size does not match.',
  INVALID_ITEM_STATE: 'The upload item is not in a valid state.',
  ITEM_NOT_CANCELLABLE: 'This item can no longer be cancelled.',
  ITEM_NOT_DELETABLE: 'Only failed or cancelled uploads can be deleted.',
  ITEM_DOCUMENT_NOT_FOUND: 'The upload document could not be found.',
  APPLIED_DOCUMENT_RETAINED: 'Applied K-1 source documents cannot be cancelled or deleted.',
  BATCH_NOT_FOUND: 'The upload batch was not found.',
  ITEM_NOT_FOUND: 'The upload item was not found.',
  WORKLOAD_DISABLED: 'K-1 uploads are temporarily disabled by the application cost controls.',
  PROTECTION_UNAVAILABLE: 'K-1 upload protection is temporarily unavailable. Try again shortly.',
  IDEMPOTENT_REPLAY: 'This upload attempt is already being processed. Refresh the K-1 queue before retrying.',
}[code] ?? 'The K-1 upload request could not be completed.')

const sendIngestionError = (reply: FastifyReply, error: unknown) => {
  const code = (error as { code?: string }).code ?? 'INTERNAL_INGESTION_ERROR'
  const retryable = ['UPLOAD_NOT_FOUND', 'UPLOAD_INCOMPLETE', 'OBJECT_CHECKSUM_MISMATCH', 'OBJECT_SIZE_MISMATCH', 'INTERNAL_INGESTION_ERROR'].includes(code)
  return reply.code(ingestionErrorStatus(code)).send({
    error: code,
    message: ingestionErrorMessage(code),
    retryable,
  })
}

const batchInScope = (
  request: FastifyRequest,
  batch: { createdByUserId: string; entityScopeId: string | null },
): boolean => request.authUser?.role === 'Admin'
  || batch.createdByUserId === request.authUser?.userId
  || (batch.entityScopeId != null && request.k1Scope?.entityIds.includes(batch.entityScopeId) === true)

const PARSE_MISSING_METADATA = 'PARSE_MISSING_REQUIRED_METADATA'

const ensureDbEntityAndPartnership = async (args: {
  entityId: string
  entityName: string
  entityType: string | null
  partnershipId: string
  partnershipName: string
  actorUserId: string
}): Promise<{ entityId: string; partnershipId: string }> => {
  if (!config.databaseUrl) {
    return { entityId: args.entityId, partnershipId: args.partnershipId }
  }

  let resolvedEntityId = args.entityId
  let resolvedPartnershipId = args.partnershipId

  try {
    await withTransaction(async (client) => {
      // Resolve entity: prefer the supplied id; otherwise reuse any row that
      // already matches by name (case-insensitive). Prevents duplicate
      // entities when the in-memory store gets reset (UUIDs change) but the
      // DB still has the same logical entity.
      const entityById = await client.query<{ id: string }>(
        `select id from entities where id = $1`,
        [args.entityId],
      )

      if (!entityById.rows[0]) {
        const entityByName = await client.query<{ id: string }>(
          `select id from entities where lower(name) = lower($1) limit 1`,
          [args.entityName],
        )

        if (entityByName.rows[0]) {
          resolvedEntityId = entityByName.rows[0].id
        } else {
          await client.query(
            `insert into entities (id, name, entity_type, status, notes, created_at, updated_at)
             values ($1, $2, $3, 'ACTIVE', null, now(), now())`,
            [args.entityId, args.entityName, args.entityType ?? 'UNKNOWN'],
          )
        }
      }

      // Resolve partnership similarly: dedupe by (entity, name).
      const partnershipByName = await client.query<{ id: string }>(
        `select id from partnerships where entity_id = $1 and lower(name) = lower($2) limit 1`,
        [resolvedEntityId, args.partnershipName],
      )

      if (partnershipByName.rows[0]) {
        resolvedPartnershipId = partnershipByName.rows[0].id
        return
      }

      await client.query(
        `insert into partnerships (id, entity_id, name, asset_class, status, notes, created_at, updated_at)
         values ($1, $2, $3, null, 'ACTIVE', $4, now(), now())`,
        [
          args.partnershipId,
          resolvedEntityId,
          args.partnershipName,
          'Auto-created from K-1 upload.',
        ],
      )

      await auditRepository.record(
        {
          actorUserId: args.actorUserId,
          eventName: PARTNERSHIP_AUDIT_EVENTS.CREATED,
          objectType: 'partnership',
          objectId: args.partnershipId,
          before: null,
          after: {
            id: args.partnershipId,
            entity_id: resolvedEntityId,
            name: args.partnershipName,
            asset_class: null,
            status: 'ACTIVE',
            notes: 'Auto-created from K-1 upload.',
          },
        },
        client,
      )
    })
  } catch (error) {
    console.warn(
      'Failed to sync K-1 partnership into Postgres:',
      error instanceof Error ? error.message : String(error),
    )
  }

  return { entityId: resolvedEntityId, partnershipId: resolvedPartnershipId }
}

const REPORTED_DISTRIBUTION_FIELD_NAMES = ['box_19a_distribution', 'box_19_distributions'] as const

/**
 * Mirror the K-1 parse output (document, k1_documents, field values, reported
 * distribution) to Postgres so PG-backed list/detail/dashboard queries reflect
 * the freshly ingested K-1. The in-memory store remains the source of truth
 * for review/finalize today; this writes a parallel snapshot so partnerships
 * surface the distribution KPI.
 */
const mirrorK1ToDb = async (args: {
  documentId: string
  k1DocumentId: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  uploaderUserId: string
  fileName: string | null
  entityId: string
  partnershipId: string
  taxYear: number
  processingStatus: string
  extractionMethod: 'AWS_BDA' | 'STUB'
  fieldValues: Array<{
    fieldName: string
    rawValue: string | null
    confidenceScore: number | null
    sourceLocation?: { page: number; bbox: [number, number, number, number] } | null
  }>
}): Promise<void> => {
  if (!config.databaseUrl) return

  try {
    await withTransaction(async (client) => {
      // documents row (idempotent)
      await client.query(
        `insert into documents (id, document_type, file_name, storage_path, mime_type, uploaded_by, uploaded_at)
         values ($1, 'K1', $2, $3, $4, $5, now())
         on conflict (id) do nothing`,
        [args.documentId, args.fileName, args.storagePath, args.mimeType, args.uploaderUserId],
      )

      // k1_documents row (idempotent — overwrite parsed fields on re-parse)
      await client.query(
        `insert into k1_documents (id, document_id, partnership_id, tax_year, partnership_name_raw, processing_status)
         values ($1, $2, $3, $4, null, $5)
         on conflict (id) do update
           set partnership_id = excluded.partnership_id,
               tax_year = excluded.tax_year,
               processing_status = excluded.processing_status,
               updated_at = now()`,
        [args.k1DocumentId, args.documentId, args.partnershipId, args.taxYear, args.processingStatus],
      )

      // Wipe + reinsert field values so re-parses don't accumulate duplicates.
      await client.query(`delete from k1_field_values where k1_document_id = $1`, [args.k1DocumentId])

      for (const fv of args.fieldValues) {
        await client.query(
          `insert into k1_field_values
             (id, k1_document_id, field_name, raw_value, normalized_value, confidence_score,
              extraction_method, review_status, page_number)
           values (gen_random_uuid(), $1, $2, $3, $3, $4, $5, 'PENDING', $6)`,
          [
            args.k1DocumentId,
            fv.fieldName,
            fv.rawValue,
            fv.confidenceScore,
            args.extractionMethod,
            fv.sourceLocation?.page ?? null,
          ],
        )
      }

      // Reported distribution: pull the canonical Box 19 field if present.
      const distributionRaw = args.fieldValues.find((field) =>
        (REPORTED_DISTRIBUTION_FIELD_NAMES as readonly string[]).includes(field.fieldName),
      )?.rawValue
      const distributionNumeric = parseUsdToNumber(distributionRaw ?? null)

      await client.query(`delete from k1_reported_distributions where k1_document_id = $1`, [args.k1DocumentId])
      if (distributionNumeric != null) {
        await client.query(
          `insert into k1_reported_distributions
             (id, k1_document_id, entity_id, partnership_id, tax_year, reported_distribution_amount)
           values (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [args.k1DocumentId, args.entityId, args.partnershipId, args.taxYear, distributionNumeric],
        )
      }
    })
  } catch (error) {
    console.warn(
      'Failed to mirror K-1 into Postgres:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

const parseUsdToNumber = (raw: string | null): number | null => {
  if (raw == null) return null
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''))
  if (cleaned === '' || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// --- Async parse pipeline -----------------------------------------------------

const runParsePipeline = (k1DocumentId: string, sizeBytes: number, storagePath: string) => {
  // Fire-and-forget. The lifecycle (UPLOADED → PROCESSING → NEEDS_REVIEW / READY_FOR_APPROVAL)
  // is observable via GET /v1/k1-documents.
  setImmediate(async () => {
    try {
      k1Repository.beginParse(k1DocumentId)
      const result = await getExtractor().extract({ k1DocumentId, pdfSizeBytes: sizeBytes, storagePath })
      if (result.outcome === 'FAILURE') {
        k1Repository.failParse(k1DocumentId, result.errorCode, result.errorMessage)
        await auditRepository.record({
          eventName: 'k1.parse_failed',
          objectType: 'k1_document',
          objectId: k1DocumentId,
          after: { code: result.errorCode, message: result.errorMessage },
        })
        return
      }

      const k1 = k1Repository.getK1Document(k1DocumentId)
      if (!k1) return

      const extractedPartnershipName = result.extractedPartnershipName?.trim() ?? ''
      const extractedTaxYear = result.extractedTaxYear ?? null

      if (!extractedPartnershipName || extractedTaxYear == null) {
        const errorMessage =
          'The parser could not derive both partnership name and tax year from the uploaded K-1.'
        k1Repository.failParse(k1DocumentId, PARSE_MISSING_METADATA, errorMessage)
        await auditRepository.record({
          eventName: 'k1.parse_failed',
          objectType: 'k1_document',
          objectId: k1DocumentId,
          after: { code: PARSE_MISSING_METADATA, message: errorMessage },
        })
        return
      }

      let partnership = k1Repository.findPartnershipByEntityAndName(k1.entityId, extractedPartnershipName)
      let autoCreatedPartnership = false
      if (!partnership) {
        partnership = k1Repository.createPartnership({
          entityId: k1.entityId,
          name: extractedPartnershipName,
        })
        autoCreatedPartnership = true
        await auditRepository.record({
          eventName: 'partnership.auto_created_from_k1',
          objectType: 'partnership',
          objectId: partnership.id,
          actorUserId: k1.uploaderUserId,
          after: {
            entityId: k1.entityId,
            name: partnership.name,
            sourceK1DocumentId: k1DocumentId,
          },
        })
      }

      const entityName = k1Repository.listEntities().find((entity) => entity.id === k1.entityId)?.name ?? 'Unknown Entity'
      const extractedEntityType =
        result.fieldValues.find((field) => field.fieldName === 'partner_entity_type')?.rawValue?.trim() ??
        null

      const resolved = await ensureDbEntityAndPartnership({
        entityId: k1.entityId,
        entityName,
        entityType: extractedEntityType,
        partnershipId: partnership.id,
        partnershipName: partnership.name,
        actorUserId: k1.uploaderUserId,
      })

      // If the DB already has this partnership/entity under a different UUID
      // (e.g. after an admin "Clear all data" wiped the in-memory store but
      // not the DB), reconcile the in-memory id so subsequent reads resolve.
      if (resolved.partnershipId !== partnership.id) {
        k1Repository.upsertPartnership({
          id: resolved.partnershipId,
          entityId: resolved.entityId,
          name: partnership.name,
        })
        partnership = k1Repository.getPartnership(resolved.partnershipId) ?? partnership
      }

      k1Repository.resolveUploadMetadata({
        k1DocumentId,
        partnershipId: resolved.partnershipId,
        partnershipNameRaw: extractedPartnershipName,
        taxYear: extractedTaxYear,
      })

      for (const fv of result.fieldValues) {
        reviewRepository.insertFieldValue({
          k1DocumentId,
          fieldName: fv.fieldName,
          label: fv.label,
          section: fv.section,
          required: fv.required,
          rawValue: fv.rawValue,
          originalValue: fv.rawValue,
          normalizedValue: fv.rawValue,
          reviewerCorrectedValue: null,
          confidenceScore: fv.confidenceScore,
          sourceLocation: fv.sourceLocation ?? null,
          reviewStatus: 'PENDING',
        })
      }
      const reportedDistribution =
        result.fieldValues.find(
          (field) =>
            field.fieldName === 'box_19a_distribution' ||
            field.fieldName === 'box_19_distributions',
        )?.rawValue ?? null
      reviewRepository.upsertReportedDistribution(k1DocumentId, reportedDistribution)
      for (const issue of result.issues) {
        k1Repository.addIssue({
          k1DocumentId,
          issueType: issue.issueType,
          severity: issue.severity,
          message: issue.message,
        })
      }

      let nextStatus = result.nextStatus
      const duplicate = k1Repository.findDuplicate(
        partnership.id,
        k1.entityId,
        extractedTaxYear,
        k1DocumentId,
      )
      if (duplicate) {
        k1Repository.addIssue({
          k1DocumentId,
          issueType: 'DUPLICATE_K1',
          severity: 'HIGH',
          message: `A K-1 already exists for ${partnership.name} in tax year ${extractedTaxYear}. Review before approval.`,
        })
        nextStatus = 'NEEDS_REVIEW'
      }

      k1Repository.completeParse(k1DocumentId, nextStatus)


      await mirrorK1ToDb({
        documentId: k1.documentId,
        k1DocumentId,
        storagePath,
        mimeType: 'application/pdf',
        sizeBytes,
        uploaderUserId: k1.uploaderUserId,
        fileName: null,
        entityId: resolved.entityId,
        partnershipId: resolved.partnershipId,
        taxYear: extractedTaxYear,
        processingStatus: nextStatus,
        extractionMethod: getExtractor().backend === 'aws_bda' ? 'AWS_BDA' : 'STUB',
        fieldValues: result.fieldValues.map((fv) => ({
          fieldName: fv.fieldName,
          rawValue: fv.rawValue,
          confidenceScore: fv.confidenceScore,
          sourceLocation: fv.sourceLocation ?? null,
        })),
      })

      // Also update partnership_annual_activity so details page KPIs reflect parsed K-1
      if (config.databaseUrl && resolved.entityId && resolved.partnershipId && extractedTaxYear) {
        await capitalRepository.syncActivityDetail(
          resolved.partnershipId,
          resolved.entityId,
          { preferredYear: extractedTaxYear }
        )
      }

      await auditRepository.record({
        eventName: 'k1.parse_completed',
        objectType: 'k1_document',
        objectId: k1DocumentId,
        after: {
          status: nextStatus,
          issues: result.issues.length + (duplicate ? 1 : 0),
          partnershipId: partnership.id,
          taxYear: extractedTaxYear,
          autoCreatedPartnership,
        },
      })
    } catch (err) {
      k1Repository.failParse(
        k1DocumentId,
        'PARSE_UNEXPECTED',
        err instanceof Error ? err.message : 'Unexpected extraction error.',
      )
    }
  })
}

// --- Handlers -----------------------------------------------------------------

const listHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = listQuerySchema.safeParse(request.query)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const q = parsed.data
  if (!assertEntityInScope(request, reply, q.entity_id)) return

  const result = k1Repository.listK1s(request.authUser!.userId, {
    taxYear: q.tax_year,
    entityId: q.entity_id,
    status: q.status,
    q: q.q,
    sort: q.sort,
    direction: q.direction,
    limit: q.limit,
    cursor: q.cursor,
  })

  const body: K1ListResponse = {
    items: result.items,
    nextCursor: result.nextCursor,
  }
  return reply.send(body)
}

const kpiHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = kpiQuerySchema.safeParse(request.query)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const q = parsed.data
  if (!assertEntityInScope(request, reply, q.entity_id)) return

  const kpis = k1Repository.getKpis(request.authUser!.userId, {
    taxYear: q.tax_year,
    entityId: q.entity_id,
  })
  return reply.send(kpis)
}

const detailHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = detailParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const summary = k1Repository.getK1Summary(request.authUser!.userId, parsed.data.k1DocumentId)
  if (!summary) return reply.code(404).send({ error: 'NOT_FOUND' })
  return reply.send(summary)
}

const uploadHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.isMultipart()) {
    return reply.code(400).send({ error: 'EXPECTED_MULTIPART' })
  }

  const fields: Record<string, string> = {}
  let fileBuffer: Buffer | null = null
  let fileMime = 'application/pdf'
  let fileName = 'upload.pdf'

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.mimetype !== 'application/pdf') {
        return reply.code(415).send({ error: 'UNSUPPORTED_MEDIA_TYPE' })
      }
      fileMime = part.mimetype
      fileName = part.filename ?? 'upload.pdf'
      fileBuffer = await part.toBuffer()
    } else {
      fields[part.fieldname] = String(part.value ?? '')
    }
  }

  if (!fileBuffer) return reply.code(400).send({ error: 'FILE_REQUIRED' })

  const parsed = uploadBodySchema.safeParse({
    entityId: fields.entityId,
    replaceDocumentId: fields.replaceDocumentId || undefined,
  })
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const body = parsed.data

  if (!assertEntityInScope(request, reply, body.entityId)) return

  if (fileBuffer.byteLength > config.k1UploadMaxBytes) {
    return reply.code(413).send({ error: 'FILE_TOO_LARGE' })
  }

  // Persist PDF + K-1 record.
  const documentId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const storagePath = `k1/pending/${documentId}.pdf`
  await getK1ObjectStore().put({
    key: storagePath,
    body: fileBuffer,
    contentType: fileMime,
    sizeBytes: fileBuffer.byteLength,
  })

  const inserted = k1Repository.insertUpload({
    uploaderUserId: request.authUser!.userId,
    entityId: body.entityId,
    storagePath,
    mimeType: fileMime,
    sizeBytes: fileBuffer.byteLength,
  })

  await auditRepository.record({
    eventName: 'k1.uploaded',
    objectType: 'k1_document',
    objectId: inserted.k1.id,
    actorUserId: request.authUser!.userId,
    after: {
      entityId: body.entityId,
      replaceDocumentId: body.replaceDocumentId ?? null,
      fileName,
      sizeBytes: fileBuffer.byteLength,
    },
  })

  runParsePipeline(inserted.k1.id, fileBuffer.byteLength, storagePath)

  const res: K1UploadResponse = {
    k1DocumentId: inserted.k1.id,
    documentId: inserted.document.id,
    status: 'UPLOADED',
  }
  return reply.code(201).send(res)
}

const reparseHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = detailParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const k1 = k1Repository.getK1Document(parsed.data.k1DocumentId)
  if (!k1 || k1.supersededByDocumentId) {
    return reply.code(404).send({ error: 'NOT_FOUND' })
  }
  if (!k1Repository.userCanAccessEntity(request.authUser!.userId, k1.entityId)) {
    return reply.code(403).send({ error: 'FORBIDDEN_ENTITY' })
  }
  if (k1.processingStatus !== 'PROCESSING' || !k1.parseErrorCode) {
    return reply.code(409).send({ error: 'NOT_RETRYABLE' })
  }

  await admitCostWorkload({
    workloadKey: 'k1_reparse',
    method: 'POST',
    routePattern: '/v1/k1-documents/:k1DocumentId/reparse',
    principal: request.authUser!.userId,
    canonicalInputs: {
      k1DocumentId: k1.id,
      parseErrorCode: k1.parseErrorCode,
    },
    globalDailyLimit: config.abuseProtection.quotas.paidExtraction.globalDocumentsPerDay,
    quotas: [
      { scopeKind: 'user', scopeValue: request.authUser!.userId, limit: config.abuseProtection.quotas.paidExtraction.userDocumentsPerDay },
      { scopeKind: 'entity', scopeValue: k1.id, limit: config.abuseProtection.quotas.paidExtraction.retriesPerDocumentPerDay },
      { scopeKind: 'global', scopeValue: 'atlas', limit: config.abuseProtection.quotas.paidExtraction.globalDocumentsPerDay },
    ],
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.bdaProviderMs / 1_000),
  })

  await auditRepository.record({
    eventName: 'k1.reparse_requested',
    objectType: 'k1_document',
    objectId: k1.id,
    actorUserId: request.authUser!.userId,
  })

  const reparsePath = k1Repository.getDocumentStoragePath(k1.id) ?? ''
  runParsePipeline(k1.id, 1024, reparsePath)
  return reply.code(202).send({ k1DocumentId: k1.id, status: 'PROCESSING' })
}

const csvEscape = (v: string) => {
  if (/[",\n\r]/.test(v)) return `"${v.replaceAll('"', '""')}"`
  return v
}

const exportHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = exportQuerySchema.safeParse(request.query)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const q = parsed.data
  if (!assertEntityInScope(request, reply, q.entity_id)) return

  await admitCostWorkload({
    workloadKey: 'k1_csv_export',
    method: 'GET',
    routePattern: '/v1/k1-documents/export.csv',
    principal: request.authUser!.userId,
    canonicalInputs: {
      taxYear: q.tax_year ?? null,
      entityId: q.entity_id ?? null,
      status: q.status ?? null,
      search: q.q ?? null,
    },
    globalDailyLimit: config.abuseProtection.quotas.reportExport.globalExportsPerDay,
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.exportMs / 1_000),
  })

  const { items } = k1Repository.listK1s(request.authUser!.userId, {
    taxYear: q.tax_year,
    entityId: q.entity_id,
    status: q.status,
    q: q.q,
    sort: 'uploaded_at',
    direction: 'desc',
    limit: 10_000,
  })

  const header = [
    'k1_document_id',
    'document_name',
    'partnership_name',
    'entity_name',
    'tax_year',
    'status',
    'issues_open_count',
    'uploaded_at',
    'uploader_user_id',
    'parse_error_code',
    'parse_error_message',
  ]
  const rows = items.map((i) =>
    [
      i.id,
      i.documentName,
      i.partnership.name,
      i.entity.name,
      String(i.taxYear),
      i.status,
      String(i.issuesOpenCount),
      i.uploadedAt,
      i.uploaderUserId,
      i.parseError?.code ?? '',
      i.parseError?.message ?? '',
    ]
      .map((value) => csvEscape(value ?? ''))
      .join(','),
  )
  if (items.length > config.abuseProtection.payloadLimits.exportRows) {
    return reply.code(413).send({ error: 'EXPORT_ROW_LIMIT_EXCEEDED' })
  }
  const body = [header.join(','), ...rows].join('\r\n')
  if (Buffer.byteLength(body, 'utf8') > config.abuseProtection.quotas.reportExport.userBytesPerDay) {
    return reply.code(413).send({ error: 'EXPORT_BYTE_LIMIT_EXCEEDED' })
  }

  await auditRepository.record({
    eventName: 'k1.export_generated',
    objectType: 'k1_export',
    actorUserId: request.authUser!.userId,
    after: {
      rowCount: items.length,
      filters: { tax_year: q.tax_year, entity_id: q.entity_id, status: q.status, q: q.q },
    },
  })

  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="k1-export-${Date.now()}.csv"`)
    .send(body)
}

const createBatchHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = createIngestionBatchSchema.safeParse(request.body)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  if (!assertEntityInScope(request, reply, parsed.data.entityScopeId ?? undefined)) return
  try {
    const batch = await createK1IngestionBatch({
      actorUserId: request.authUser!.userId,
      entityScopeId: parsed.data.entityScopeId ?? null,
      uploadAttemptId: parsed.data.uploadAttemptId,
      files: parsed.data.files,
    })
    await auditRepository.record({
      eventName: 'k1.ingestion_batch.created',
      objectType: 'k1_ingestion_batch',
      objectId: batch.id,
      actorUserId: request.authUser!.userId,
      after: k1AuditMetadata(request, {
        batchId: batch.id,
        entityId: batch.entityScopeId ?? undefined,
        status: batch.status,
        counts: { ...batch.counts },
      }),
    })
    logK1Workflow(request.log, 'k1.batch.created', { batchId: batch.id, entityId: batch.entityScopeId ?? undefined, status: batch.status, count: batch.counts.total })
    return reply.code(201).send(batch)
  } catch (error) {
    return sendIngestionError(reply, error)
  }
}

const getBatchHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = ingestionBatchParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const durable = await durableK1BatchRepository.getById(parsed.data.batchId)
  if (!durable || !batchInScope(request, durable)) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' })
  const batch = await getK1IngestionBatch(durable.id)
  if (!batch) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' })
  const version = Math.max(0, ...durable.items.map((item) => item.updatedAt.getTime()))
  return reply.header('ETag', `"${version}"`).header('Cache-Control', 'private, no-store').send(batch)
}

const listBatchesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = ingestionBatchListSchema.safeParse(request.query)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  if (!assertEntityInScope(request, reply, parsed.data.entity_id)) return
  try {
    const collection = await listK1IngestionBatches({
      actorUserId: request.authUser!.userId,
      isAdmin: request.authUser!.role === 'Admin',
      authorizedEntityIds: request.k1Scope?.entityIds ?? [],
      entityId: parsed.data.entity_id,
      status: parsed.data.status,
      attentionOnly: parsed.data.attention_only,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    })
    return reply.header('Cache-Control', 'private, no-store').send(collection)
  } catch (error) {
    if ((error as { code?: string }).code === 'INVALID_CURSOR') {
      return reply.code(400).send({ error: 'INVALID_CURSOR', message: 'The batch cursor is invalid.', retryable: false })
    }
    return sendIngestionError(reply, error)
  }
}

const getItemAttemptsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = ingestionItemParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const item = await durableK1BatchRepository.getItemById(parsed.data.itemId)
  if (!item) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  const batch = await durableK1BatchRepository.getById(item.batchId)
  if (!batch || !batchInScope(request, batch)) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  const publicItem = await toPublicItem(item, false)
  return reply.header('Cache-Control', 'private, no-store').send({
    itemId: item.id, activeExtractionAttemptId: publicItem.activeExtractionAttemptId,
    attempts: publicItem.attemptHistory,
  })
}

const cancelItemHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = ingestionItemParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const item = await durableK1BatchRepository.getItemById(parsed.data.itemId)
  if (!item) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  const batch = await durableK1BatchRepository.getById(item.batchId)
  if (!batch || !batchInScope(request, batch)) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  try {
    const cancelled = await cancelK1IngestionItem({ itemId: item.id, actorUserId: request.authUser!.userId })
    logK1Workflow(request.log, 'k1.item.cancelled', { batchId: item.batchId, itemId: item.id, k1DocumentId: item.k1DocumentId ?? undefined, status: cancelled.status })
    return reply.send(cancelled)
  } catch (error) {
    return sendIngestionError(reply, error)
  }
}

const deleteItemHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = ingestionItemParamsSchema.safeParse(request.params)
  if (!parsed.success) return sendZodError(reply, parsed.error)
  const item = await durableK1BatchRepository.getItemById(parsed.data.itemId)
  if (!item) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  const batch = await durableK1BatchRepository.getById(item.batchId)
  if (!batch || !batchInScope(request, batch)) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  try {
    const deleted = await deleteK1IngestionItem({
      itemId: item.id,
      actorUserId: request.authUser!.userId,
    })
    logK1Workflow(request.log, 'k1.item.deleted', {
      batchId: deleted.batchId,
      itemId: deleted.itemId,
      k1DocumentId: deleted.k1DocumentId ?? undefined,
      status: 'DELETED',
    })
    return reply.code(204).send()
  } catch (error) {
    return sendIngestionError(reply, error)
  }
}

const localUploadHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (config.k1Ingestion.objectStore !== 'local') return reply.code(404).send({ error: 'NOT_FOUND' })
  const params = ingestionItemParamsSchema.safeParse(request.params)
  const headers = localUploadHeadersSchema.safeParse(request.headers)
  if (!params.success) return sendZodError(reply, params.error)
  if (!headers.success) return sendZodError(reply, headers.error)
  const item = await durableK1BatchRepository.getItemById(params.data.itemId)
  if (!item) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  const batch = await durableK1BatchRepository.getById(item.batchId)
  if (!batch || !batchInScope(request, batch)) return reply.code(404).send({ error: 'ITEM_NOT_FOUND' })
  if (!Buffer.isBuffer(request.body)) {
    return reply.code(400).send({ error: 'UPLOAD_INCOMPLETE', message: 'A PDF body is required.', retryable: true })
  }
  try {
    await acceptLocalK1Upload({
      itemId: item.id,
      body: request.body,
      sizeBytes: headers.data['content-length'],
      sha256: headers.data['x-amz-checksum-sha256'],
    })
    return reply.code(204).send()
  } catch (error) {
    return sendIngestionError(reply, error)
  }
}

const completeBatchUploadsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = ingestionBatchParamsSchema.safeParse(request.params)
  const body = completeIngestionUploadsSchema.safeParse(request.body)
  if (!params.success) return sendZodError(reply, params.error)
  if (!body.success) return sendZodError(reply, body.error)
  const durable = await durableK1BatchRepository.getById(params.data.batchId)
  if (!durable || !batchInScope(request, durable)) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' })
  try {
    const batch = await completeK1BatchUploads({ batchId: durable.id, items: body.data.items })
    await auditRepository.record({
      eventName: 'k1.ingestion_batch.uploads_completed',
      objectType: 'k1_ingestion_batch',
      objectId: batch.id,
      actorUserId: request.authUser!.userId,
      after: k1AuditMetadata(request, {
        batchId: batch.id,
        entityId: batch.entityScopeId ?? undefined,
        status: batch.status,
        counts: { ...batch.counts },
      }),
    })
    logK1Workflow(request.log, 'k1.batch.uploads_completed', { batchId: batch.id, entityId: batch.entityScopeId ?? undefined, status: batch.status, count: batch.counts.total })
    return reply.code(202).send(batch)
  } catch (error) {
    return sendIngestionError(reply, error)
  }
}

const retryExtractionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = detailParamsSchema.safeParse(request.params)
  const body = retryExtractionBodySchema.safeParse(request.body)
  if (!params.success) return sendZodError(reply, params.error)
  if (!body.success) return sendZodError(reply, body.error)
  if (!await assertK1DocumentInScope(request, reply, params.data.k1DocumentId)) return
  try {
    const result = await retryK1Extraction({
      k1DocumentId: params.data.k1DocumentId,
      expectedDocumentVersion: body.data.expectedDocumentVersion,
      actorUserId: request.authUser!.userId,
    })
    await auditRepository.record({
      eventName: 'k1.extraction.retry_requested',
      objectType: 'k1_document',
      objectId: result.k1DocumentId,
      actorUserId: request.authUser!.userId,
      after: k1AuditMetadata(request, {
        k1DocumentId: result.k1DocumentId,
        extractionAttemptId: result.attemptId,
        status: result.status,
        version: result.documentVersion,
      }),
    })
    logK1Workflow(request.log, 'k1.extraction.retry_queued', { k1DocumentId: result.k1DocumentId, extractionAttemptId: result.attemptId, status: result.status })
    return reply.code(202).send(result)
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'INTERNAL_INGESTION_ERROR'
    const status = code === 'K1_DOCUMENT_NOT_FOUND' ? 404
      : code === 'FORBIDDEN_K1_DOCUMENT' ? 403
        : code === 'STALE_K1_VERSION' ? 409
          : 409
    return reply.code(status).send({
      error: code,
      message: code === 'STALE_K1_VERSION'
        ? 'The K-1 changed. Refresh before retrying extraction.'
        : 'This K-1 extraction cannot be retried.',
      retryable: code === 'STALE_K1_VERSION',
    })
  }
}

const sendApplicationError = (reply: FastifyReply, error: unknown) => {
  const cause = error as Error & { code?: string; currentVersion?: number; currentRevision?: number; decisionId?: string }
  const code = cause.code ?? 'K1_APPLICATION_FAILED'
  const status = code === 'K1_DOCUMENT_NOT_FOUND' || code === 'APPLICATION_PREVIEW_NOT_FOUND' ? 404
    : code === 'FORBIDDEN_ENTITY' || code === 'ROLE_REQUIRED_ADMIN' ? 403
      : code.startsWith('STALE_') || code.includes('PREVIEW') || code.includes('INCOMPLETE')
        || code.includes('AUTHORITATIVE') || code.includes('ALREADY_APPLIED') || code.includes('TARGET_CHANGED')
        || code === 'INCEPTION_YEAR_CONFLICT' ? 409
        : code.includes('DECISION') || code.includes('INVALID') ? 400 : 500
  return reply.code(status).send({
    error: code,
    currentVersion: cause.currentVersion,
    currentRevision: cause.currentRevision,
    decisionId: cause.decisionId,
  })
}

const applyPreviewHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = detailParamsSchema.safeParse(request.params)
  const body = applyPreviewBodySchema.safeParse(request.body)
  if (!params.success) return sendZodError(reply, params.error)
  if (!body.success) return sendZodError(reply, body.error)
  if (!await assertK1DocumentInScope(request, reply, params.data.k1DocumentId)) return
  try {
    const preview = await createK1ApplyPreview({
      k1DocumentId: params.data.k1DocumentId,
      expectedDocumentVersion: body.data.expectedDocumentVersion,
      actorUserId: request.authUser!.userId,
      authorizedEntityIds: request.k1Scope?.entityIds ?? [],
      isAdmin: request.authUser!.role === 'Admin',
    })
    logK1Workflow(request.log, 'k1.apply.previewed', { k1DocumentId: preview.k1DocumentId, applicationId: preview.applicationId, status: 'PREVIEWED', count: preview.decisions.length })
    return reply.header('Cache-Control', 'private, no-store').send(preview)
  } catch (error) {
    return sendApplicationError(reply, error)
  }
}

const applyK1Handler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = detailParamsSchema.safeParse(request.params)
  const body = applyK1BodySchema.safeParse(request.body)
  if (!params.success) return sendZodError(reply, params.error)
  if (!body.success) return sendZodError(reply, body.error)
  if (!await assertK1DocumentInScope(request, reply, params.data.k1DocumentId)) return
  try {
    const applied = await applyReviewedK1({
      k1DocumentId: params.data.k1DocumentId,
      applicationId: body.data.applicationId,
      expectedDocumentVersion: body.data.expectedDocumentVersion,
      expectedTrackerRevision: body.data.expectedTrackerRevision,
      inceptionYear: body.data.inceptionYear,
      decisions: body.data.decisions,
      actorUserId: request.authUser!.userId,
      authorizedEntityIds: request.k1Scope?.entityIds ?? [],
      isAdmin: request.authUser!.role === 'Admin',
    })
    logK1Workflow(request.log, 'k1.apply.completed', { k1DocumentId: applied.k1DocumentId, applicationId: applied.applicationId, status: applied.status, inceptionYear: body.data.inceptionYear, count: applied.invalidatedTaxYears.length })
    return reply.send(applied)
  } catch (error) {
    return sendApplicationError(reply, error)
  }
}

// --- Registration -------------------------------------------------------------

export const registerK1Routes = async (app: FastifyInstance) => {
  const gated = (
    method: 'DELETE' | 'GET' | 'POST' | 'PUT',
    routePattern: string,
  ) => ({
    preHandler: [withSession, requireAuthenticated, requireK1Scope],
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, `/v1${routePattern}`),
    },
  })

  app.post(
    '/k1-ingestion-batches',
    gated('POST', '/k1-ingestion-batches'),
    createBatchHandler,
  )
  app.get(
    '/k1-ingestion-batches',
    gated('GET', '/k1-ingestion-batches'),
    listBatchesHandler,
  )
  app.get(
    '/k1-ingestion-batches/:batchId',
    gated('GET', '/k1-ingestion-batches/:batchId'),
    getBatchHandler,
  )
  app.put(
    '/k1-ingestion-items/:itemId/local-upload',
    gated('PUT', '/k1-ingestion-items/:itemId/local-upload'),
    localUploadHandler,
  )
  app.post(
    '/k1-ingestion-batches/:batchId/complete-uploads',
    gated('POST', '/k1-ingestion-batches/:batchId/complete-uploads'),
    completeBatchUploadsHandler,
  )
  app.get(
    '/k1-ingestion-items/:itemId/attempts',
    gated('GET', '/k1-ingestion-items/:itemId/attempts'),
    getItemAttemptsHandler,
  )
  app.post(
    '/k1-ingestion-items/:itemId/cancel',
    gated('POST', '/k1-ingestion-items/:itemId/cancel'),
    cancelItemHandler,
  )
  app.delete(
    '/k1-ingestion-items/:itemId',
    gated('DELETE', '/k1-ingestion-items/:itemId'),
    deleteItemHandler,
  )

  app.get('/k1-documents', gated('GET', '/k1-documents'), listHandler)
  app.get('/k1-documents/kpis', gated('GET', '/k1-documents/kpis'), kpiHandler)
  app.get(
    '/k1-documents/export.csv',
    gated('GET', '/k1-documents/export.csv'),
    exportHandler,
  )
  app.get(
    '/k1-documents/:k1DocumentId',
    gated('GET', '/k1-documents/:k1DocumentId'),
    detailHandler,
  )
  app.post('/k1-documents', gated('POST', '/k1-documents'), uploadHandler)
  app.post(
    '/k1-documents/:k1DocumentId/reparse',
    gated('POST', '/k1-documents/:k1DocumentId/reparse'),
    reparseHandler,
  )
  app.post(
    '/k1-documents/:k1DocumentId/retry-extraction',
    gated('POST', '/k1-documents/:k1DocumentId/retry-extraction'),
    retryExtractionHandler,
  )
  app.post(
    '/k1-documents/:k1DocumentId/apply-preview',
    gated('POST', '/k1-documents/:k1DocumentId/apply-preview'),
    applyPreviewHandler,
  )
  app.post(
    '/k1-documents/:k1DocumentId/apply',
    gated('POST', '/k1-documents/:k1DocumentId/apply'),
    applyK1Handler,
  )

  // Lookup endpoints for upload form
  app.get(
    '/k1/lookups/entities',
    gated('GET', '/k1/lookups/entities'),
    async (request, reply) => {
      const ids = k1Repository.getUserEntityIds(request.authUser!.userId)
      const entities = k1Repository
        .listEntities()
        .filter((e) => ids.includes(e.id))
        .map((e) => ({ id: e.id, name: e.name }))
      return reply.send({ items: entities })
    },
  )
  app.get(
    '/k1/lookups/partnerships',
    gated('GET', '/k1/lookups/partnerships'),
    async (request, reply) => {
      const ids = k1Repository.getUserEntityIds(request.authUser!.userId)
      const partnerships = k1Repository
        .listPartnerships()
        .filter((p) => ids.includes(p.entityId))
        .map((p) => ({ id: p.id, name: p.name, entityId: p.entityId }))
      return reply.send({ items: partnerships })
    },
  )
}
