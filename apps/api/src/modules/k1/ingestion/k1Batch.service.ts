import { randomUUID } from 'node:crypto'

import { config } from '../../../config.js'
import {
  durableK1BatchRepository,
  durableK1Repository,
  type DurableK1IngestionBatchRecord,
  type DurableK1IngestionItemRecord,
} from '../k1.repository.js'
import { k1ExtractionAttemptRepository } from '../extraction/k1ExtractionAttempt.repository.js'
import { k1MatchRepository } from '../matching/k1Match.repository.js'
import type {
  K1IngestionBatch,
  K1IngestionBatchCollection,
  K1IngestionErrorCode,
  K1IngestionItem,
} from '../k1.types.js'
import { localK1UploadSlotService } from './localUploadSlots.service.js'
import { getS3K1UploadSlotService, type K1UploadSlotService } from './k1UploadSlots.service.js'

const retryableError = (code: K1IngestionErrorCode | null): boolean =>
  code != null && [
    'UPLOAD_NOT_FOUND',
    'UPLOAD_INCOMPLETE',
    'OBJECT_SIZE_MISMATCH',
    'OBJECT_CHECKSUM_MISMATCH',
    'INTERNAL_INGESTION_ERROR',
  ].includes(code)

const retryableAttemptError = (code: string | null): boolean =>
  code != null && !/CLIENT|ENCRYPT|UNSUPPORTED|DUPLICATE/i.test(code)

const safeAttemptMessage = (code: string): string =>
  /THROTTL|TIMEOUT|UNAVAILABLE/i.test(code)
    ? 'The extraction provider was temporarily unavailable.'
    : 'The extraction attempt did not complete.'

const safeItemMessage = (code: string): string => ({
  UPLOAD_NOT_FOUND: 'The uploaded object was not found.',
  UPLOAD_INCOMPLETE: 'The upload did not complete.',
  OBJECT_SIZE_MISMATCH: 'The uploaded file size did not match the declaration.',
  OBJECT_CHECKSUM_MISMATCH: 'The uploaded file checksum did not match the declaration.',
  PDF_INVALID: 'The file is not a readable PDF.',
  PDF_ENCRYPTED: 'Encrypted PDFs are not supported.',
  DUPLICATE_K1_CONTENT: 'This PDF was already uploaded.',
  EXTRACTION_FAILED: 'The extraction attempt did not complete.',
}[code] ?? 'The file requires attention.')

const slotService = (): K1UploadSlotService =>
  config.k1Ingestion.objectStore === 's3'
    ? getS3K1UploadSlotService()
    : localK1UploadSlotService

export const toPublicItem = async (
  item: DurableK1IngestionItemRecord,
  includeSlot: boolean,
): Promise<K1IngestionItem> => {
  const [document, attempts, matchCandidates] = item.k1DocumentId
    ? await Promise.all([
        durableK1Repository.getById(item.k1DocumentId),
        k1ExtractionAttemptRepository.listForDocument(item.k1DocumentId),
        k1MatchRepository.listForActiveAttempt(item.k1DocumentId),
      ])
    : [null, [], []]
  const latestAttempt = attempts.at(-1)
  return {
    id: item.id,
    fileName: item.fileName,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
    status: item.status,
    upload: includeSlot && ['PENDING_UPLOAD', 'FAILED'].includes(item.status) && !item.k1DocumentId
      ? await slotService().createSlot(item)
      : null,
    k1DocumentId: item.k1DocumentId,
    error: item.errorCode
      ? {
          code: item.errorCode,
          message: safeItemMessage(item.errorCode),
          retryable: retryableError(item.errorCode),
        }
      : null,
    updatedAt: item.updatedAt.toISOString(),
    documentVersion: document?.version ?? null,
    activeExtractionAttemptId: document?.activeExtractionAttemptId ?? null,
    attemptHistory: attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      provider: attempt.provider,
      status: attempt.status,
      blueprintVersion: attempt.blueprintVersion,
      schemaVersion: attempt.mappingSchemaVersion,
      active: document?.activeExtractionAttemptId === attempt.id,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      completedAt: attempt.completedAt?.toISOString() ?? null,
      error: attempt.errorCode ? {
        code: 'EXTRACTION_FAILED',
        message: safeAttemptMessage(attempt.errorCode),
        retryable: retryableAttemptError(attempt.errorCode),
      } : null,
    })),
    canRetry: Boolean(item.k1DocumentId && document && !document.appliedAt && (
      (item.status === 'FAILED' && latestAttempt?.status === 'FAILED' && retryableAttemptError(latestAttempt.errorCode))
      || (['NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY'].includes(item.status) && latestAttempt?.status === 'SUCCEEDED')
    )),
    canCancel: !['PROCESSING', 'APPLIED', 'CANCELLED'].includes(item.status),
    canDelete: ['FAILED', 'CANCELLED'].includes(item.status) && !document?.appliedAt,
    partnershipId: document?.partnershipId ?? null,
    taxYear: document?.taxYear ?? null,
    partnershipCandidates: matchCandidates
      .filter((candidate) => candidate.type === 'PARTNERSHIP')
      .map((candidate) => ({
        id: candidate.recordId,
        maskedLabel: candidate.maskedLabel,
        score: candidate.score,
        decision: candidate.decision,
      })),
  }
}

export const toPublicBatch = async (
  batch: DurableK1IngestionBatchRecord,
  includeSlots = true,
): Promise<K1IngestionBatch> => ({
  id: batch.id,
  status: batch.status,
  entityScopeId: batch.entityScopeId,
  createdAt: batch.createdAt.toISOString(),
  closedAt: batch.closedAt?.toISOString() ?? null,
  counts: batch.counts,
  items: await Promise.all(batch.items.map((item) => toPublicItem(item, includeSlots))),
})

export const createK1IngestionBatch = async (args: {
  actorUserId: string
  entityScopeId: string | null
  files: Array<{ fileName: string; sizeBytes: number; sha256: string }>
}): Promise<K1IngestionBatch> => {
  if (args.files.length < 1 || args.files.length > config.k1Ingestion.batchMaxFiles) {
    throw Object.assign(new Error('INVALID_FILE_COUNT'), { code: 'INVALID_FILE_COUNT' })
  }
  const hashes = new Set<string>()
  for (const file of args.files) {
    if (hashes.has(file.sha256)) {
      throw Object.assign(new Error('DUPLICATE_K1_CONTENT'), { code: 'DUPLICATE_K1_CONTENT' })
    }
    hashes.add(file.sha256)
  }
  const batchId = randomUUID()
  const prefix = config.k1Ingestion.objectStore === 's3'
    ? `${config.k1Ingestion.s3.inputPrefix}/quarantine`
    : 'quarantine'
  const batch = await durableK1BatchRepository.create({
    id: batchId,
    createdByUserId: args.actorUserId,
    entityScopeId: args.entityScopeId,
    items: args.files.map((file) => {
      const itemId = randomUUID()
      return {
        id: itemId,
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        objectKey: `${prefix}/${batchId}/${itemId}.pdf`,
      }
    }),
  })
  return toPublicBatch(batch)
}

export const getK1IngestionBatch = async (
  batchId: string,
): Promise<K1IngestionBatch | null> => {
  const batch = await durableK1BatchRepository.getById(batchId)
  return batch ? toPublicBatch(batch) : null
}

const encodeCursor = (cursor: { createdAt: Date; id: string }): string => Buffer.from(JSON.stringify({
  createdAt: cursor.createdAt.toISOString(), id: cursor.id,
})).toString('base64url')

const decodeCursor = (cursor: string | undefined): { createdAt: Date; id: string } | undefined => {
  if (!cursor) return undefined
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown }
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(decoded.id)) throw new Error()
    const createdAt = new Date(decoded.createdAt)
    if (!Number.isFinite(createdAt.getTime())) throw new Error()
    return { createdAt, id: decoded.id }
  } catch {
    throw Object.assign(new Error('INVALID_CURSOR'), { code: 'INVALID_CURSOR' })
  }
}

export const listK1IngestionBatches = async (args: {
  actorUserId: string
  isAdmin: boolean
  authorizedEntityIds: readonly string[]
  entityId?: string
  status?: import('../k1.types.js').K1IngestionBatchStatus
  attentionOnly?: boolean
  limit: number
  cursor?: string
}): Promise<K1IngestionBatchCollection> => {
  const result = await durableK1BatchRepository.list({ ...args, cursor: decodeCursor(args.cursor) })
  return {
    items: await Promise.all(result.items.map((batch) => toPublicBatch(batch, false))),
    counts: result.counts,
    nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
  }
}
