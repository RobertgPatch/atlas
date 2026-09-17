import { createHash, randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { config } from '../../config.js'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { durableK1Repository } from '../k1/k1.repository.js'
import { getK1ObjectStore } from '../k1/storage/index.js'
import { k1ReviewParamsSchema } from './review.schemas.js'
import { sendPdfStorageError } from './pdfStorageError.js'

const isAdmin = (request: FastifyRequest): boolean => request.authUser?.role === 'Admin'

const isAuthorized = (
  request: FastifyRequest,
  document: NonNullable<Awaited<ReturnType<typeof durableK1Repository.getById>>>,
): boolean => document.entityId
  ? Boolean(request.k1Scope?.entityIds.includes(document.entityId))
  : isAdmin(request) || document.uploadedBy === request.authUser?.userId

/**
 * Reattaches the exact original bytes when a durable K-1's object disappeared.
 * Extracted values and review state are deliberately left untouched.
 */
export const sourcePdfRecoveryHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = k1ReviewParamsSchema.safeParse(request.params)
  if (!parsed.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })

  const document = await durableK1Repository.getById(parsed.data.k1DocumentId)
  if (!document || !isAuthorized(request, document)) {
    return reply.code(404).send({ error: 'NOT_FOUND' })
  }
  if (!request.isMultipart()) return reply.code(400).send({ error: 'EXPECTED_MULTIPART' })

  const store = getK1ObjectStore()
  const currentIdentity = {
    key: document.storagePath,
    bucket: document.storageBucket,
    versionId: document.storageVersionId,
  }
  try {
    if (await store.head(currentIdentity)) {
      return reply.code(409).send({ error: 'SOURCE_PDF_ALREADY_AVAILABLE' })
    }
  } catch (error) {
    return sendPdfStorageError(request, reply, error)
  }
  if (!document.sha256 || document.sizeBytes == null) {
    return reply.code(409).send({ error: 'SOURCE_PDF_IDENTITY_UNAVAILABLE' })
  }

  let source: Buffer | null = null
  for await (const part of request.parts({ limits: { files: 1, fields: 0, parts: 1 } })) {
    if (part.type !== 'file') continue
    if (part.mimetype !== 'application/pdf') {
      return reply.code(415).send({ error: 'UNSUPPORTED_MEDIA_TYPE' })
    }
    source = await part.toBuffer()
  }
  if (!source) return reply.code(400).send({ error: 'FILE_REQUIRED' })
  if (source.byteLength > config.k1Ingestion.uploadMaxBytes) {
    return reply.code(413).send({ error: 'FILE_TOO_LARGE' })
  }
  if (source.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return reply.code(422).send({ error: 'PDF_INVALID' })
  }

  const sha256 = createHash('sha256').update(source).digest('hex')
  if (source.byteLength !== document.sizeBytes || sha256 !== document.sha256.toLowerCase()) {
    return reply.code(409).send({ error: 'SOURCE_PDF_CHECKSUM_MISMATCH' })
  }

  const prefix = config.k1Ingestion.s3.inputPrefix.replace(/^\/+|\/+$/g, '')
  const key = `${prefix}/accepted/${document.id}/recovered-${randomUUID()}.pdf`
  const stored = await store.put({
    key,
    body: source,
    contentType: 'application/pdf',
    sizeBytes: source.byteLength,
    checksumSha256: sha256,
    ifNoneMatch: '*',
    metadata: { recovery: 'missing-source-pdf', k1DocumentId: document.id },
  }).catch(error => {
    sendPdfStorageError(request, reply, error)
    return null
  })
  if (!stored) return reply

  try {
    const updated = await withTransaction(async (client) => {
      const replaced = await durableK1Repository.replaceSourcePdfStorage(
        client,
        document.id,
        {
          storagePath: document.storagePath,
          storageBucket: document.storageBucket,
          storageVersionId: document.storageVersionId,
        },
        {
          storagePath: stored.key,
          storageBucket: stored.bucket,
          storageVersionId: stored.versionId,
          mimeType: 'application/pdf',
          sizeBytes: source!.byteLength,
          sha256,
        },
      )
      if (!replaced) return false
      await auditRepository.record({
        eventName: 'k1.source_pdf.reattached',
        objectType: 'k1_document',
        objectId: document.id,
        actorUserId: request.authUser!.userId,
        before: {
          storagePath: document.storagePath,
          storageBucket: document.storageBucket,
          storageVersionId: document.storageVersionId,
        },
        after: {
          storagePath: stored.key,
          storageBucket: stored.bucket,
          storageVersionId: stored.versionId,
          sha256,
          sizeBytes: source!.byteLength,
        },
      }, client)
      return true
    })
    if (!updated) {
      await store.delete(stored).catch(() => undefined)
      return reply.code(409).send({ error: 'SOURCE_PDF_CHANGED' })
    }
  } catch (error) {
    await store.delete(stored).catch(() => undefined)
    throw error
  }

  return reply.code(200).send({
    status: 'REATTACHED',
    k1DocumentId: document.id,
    pdfUrl: `/k1-documents/${document.id}/pdf`,
  })
}
