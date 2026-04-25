import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import { withTransaction } from '../../infra/db/client.js'
import { k1Repository } from './k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { localPdfStore } from './storage/localPdfStore.js'
import { getExtractor } from './extraction/index.js'
import { assertEntityInScope, requireK1Scope } from './k1Scope.plugin.js'
import {
  detailParamsSchema,
  exportQuerySchema,
  kpiQuerySchema,
  listQuerySchema,
  uploadBodySchema,
} from './k1.schemas.js'
import type {
  K1ListResponse,
  K1Status,
  K1UploadResponse,
} from './k1.types.js'
import { config } from '../../config.js'

const sendZodError = (reply: FastifyReply, err: ZodError) =>
  reply.code(400).send({
    error: 'VALIDATION_ERROR',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

const PARSE_MISSING_METADATA = 'PARSE_MISSING_REQUIRED_METADATA'

const ensureDbEntityAndPartnership = async (args: {
  entityId: string
  entityName: string
  entityType: string | null
  partnershipId: string
  partnershipName: string
  actorUserId: string
}): Promise<void> => {
  if (!config.databaseUrl) return

  try {
    await withTransaction(async (client) => {
      const entityResult = await client.query<{ id: string }>(
        `select id from entities where id = $1`,
        [args.entityId],
      )

      if (!entityResult.rows[0]) {
        await client.query(
          `insert into entities (id, name, entity_type, status, notes, created_at, updated_at)
           values ($1, $2, $3, 'ACTIVE', null, now(), now())`,
          [args.entityId, args.entityName, args.entityType ?? 'UNKNOWN'],
        )
      }

      const partnershipResult = await client.query<{ id: string }>(
        `select id from partnerships where entity_id = $1 and lower(name) = lower($2) limit 1`,
        [args.entityId, args.partnershipName],
      )

      if (partnershipResult.rows[0]) return

      await client.query(
        `insert into partnerships (id, entity_id, name, asset_class, status, notes, created_at, updated_at)
         values ($1, $2, $3, null, 'ACTIVE', $4, now(), now())`,
        [
          args.partnershipId,
          args.entityId,
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
            entity_id: args.entityId,
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

      await ensureDbEntityAndPartnership({
        entityId: k1.entityId,
        entityName,
        entityType: extractedEntityType,
        partnershipId: partnership.id,
        partnershipName: partnership.name,
        actorUserId: k1.uploaderUserId,
      })

      k1Repository.resolveUploadMetadata({
        k1DocumentId,
        partnershipId: partnership.id,
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
  const storagePath = await localPdfStore.put(documentId, 'pending', fileBuffer)

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
      .map(csvEscape)
      .join(','),
  )

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
    .send([header.join(','), ...rows].join('\r\n'))
}

// --- Registration -------------------------------------------------------------

export const registerK1Routes = async (app: FastifyInstance) => {
  const gated = { preHandler: [withSession, requireAuthenticated, requireK1Scope] }

  app.get('/k1-documents', gated, listHandler)
  app.get('/k1-documents/kpis', gated, kpiHandler)
  app.get('/k1-documents/export.csv', gated, exportHandler)
  app.get('/k1-documents/:k1DocumentId', gated, detailHandler)
  app.post('/k1-documents', gated, uploadHandler)
  app.post('/k1-documents/:k1DocumentId/reparse', gated, reparseHandler)

  // Lookup endpoints for upload form
  app.get('/k1/lookups/entities', gated, async (request, reply) => {
    const ids = k1Repository.getUserEntityIds(request.authUser!.userId)
    const entities = k1Repository
      .listEntities()
      .filter((e) => ids.includes(e.id))
      .map((e) => ({ id: e.id, name: e.name }))
    return reply.send({ items: entities })
  })
  app.get('/k1/lookups/partnerships', gated, async (request, reply) => {
    const ids = k1Repository.getUserEntityIds(request.authUser!.userId)
    const partnerships = k1Repository
      .listPartnerships()
      .filter((p) => ids.includes(p.entityId))
      .map((p) => ({ id: p.id, name: p.name, entityId: p.entityId }))
    return reply.send({ items: partnerships })
  })
}
