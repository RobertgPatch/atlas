import { createHash, randomUUID } from 'node:crypto'

import { PDFDocument } from 'pdf-lib'

import { config } from '../../../config.js'
import { withTransaction } from '../../../infra/db/client.js'
import {
  durableK1BatchRepository,
  durableK1Repository,
  type DurableK1IngestionItemRecord,
} from '../k1.repository.js'
import type { K1IngestionErrorCode } from '../k1.types.js'
import type { K1StartWorkMessage } from '../queue/K1WorkQueue.js'
import { getK1WorkQueue } from '../queue/index.js'
import { readObjectToBuffer } from '../storage/K1ObjectStore.js'
import { getK1ObjectStore } from '../storage/index.js'
import { toPublicBatch } from './k1Batch.service.js'
import { createK1ExtractionClientToken } from '../extraction/k1ExtractionAttempt.repository.js'
import { admitCostWorkload } from '../../abuse-protection/costWorkloadAdmission.js'

const safeMessages: Record<K1IngestionErrorCode, string> = {
  K1_INGESTION_DISABLED: 'K-1 ingestion is not available.',
  BATCH_NOT_FOUND: 'The upload batch was not found.',
  ITEM_NOT_FOUND: 'The upload item was not found.',
  FORBIDDEN_ENTITY: 'You do not have access to this entity.',
  FORBIDDEN_K1_DOCUMENT: 'You do not have access to this K-1 document.',
  INVALID_FILE_COUNT: 'Select between 1 and 25 PDF files.',
  INVALID_FILE_NAME: 'The file name is not valid.',
  INVALID_FILE_SIZE: 'The file size is not valid.',
  INVALID_CHECKSUM: 'The file checksum is not valid.',
  UNSUPPORTED_MEDIA_TYPE: 'Only PDF files are supported.',
  UPLOAD_NOT_FOUND: 'The uploaded file was not found. Upload it again.',
  UPLOAD_INCOMPLETE: 'The upload is not complete. Upload it again.',
  OBJECT_SIZE_MISMATCH: 'The uploaded file size does not match the selected file.',
  OBJECT_CHECKSUM_MISMATCH: 'The uploaded file checksum does not match the selected file.',
  PDF_INVALID: 'The file is not a readable PDF.',
  PDF_ENCRYPTED: 'Password-protected or encrypted PDFs are not supported.',
  PDF_PAGE_LIMIT_EXCEEDED: 'The PDF has more pages than the configured limit.',
  DUPLICATE_K1_CONTENT: 'This exact PDF was already uploaded for the entity.',
  EXTRACTION_FAILED: 'The K-1 could not be extracted. Retry the document.',
  EXTRACTION_RESULT_INVALID: 'The extraction result could not be verified.',
  EXTRACTION_THROTTLED: 'The extraction provider is busy. The document will retry.',
  STALE_K1_VERSION: 'The K-1 changed. Refresh and try again.',
  STALE_TRACKER_REVISION: 'The tracker year changed. Refresh and try again.',
  INVALID_ITEM_STATE: 'The upload item is not in a valid state for this action.',
  INTERNAL_INGESTION_ERROR: 'The upload could not be processed. Try again.',
}

const asIngestionError = (error: unknown): K1IngestionErrorCode => {
  const code = (error as { code?: string }).code
  return code && code in safeMessages ? code as K1IngestionErrorCode : 'INTERNAL_INGESTION_ERROR'
}

const inspectPdf = async (buffer: Buffer): Promise<number> => {
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw Object.assign(new Error('PDF_INVALID'), { code: 'PDF_INVALID' })
  }
  if (buffer.includes(Buffer.from('/Encrypt'))) {
    throw Object.assign(new Error('PDF_ENCRYPTED'), { code: 'PDF_ENCRYPTED' })
  }
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false })
    const pages = pdf.getPageCount()
    if (pages < 1) throw Object.assign(new Error('PDF_INVALID'), { code: 'PDF_INVALID' })
    if (pages > config.k1Ingestion.uploadMaxPages) {
      throw Object.assign(new Error('PDF_PAGE_LIMIT_EXCEEDED'), { code: 'PDF_PAGE_LIMIT_EXCEEDED' })
    }
    return pages
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('encrypt')) {
      throw Object.assign(new Error('PDF_ENCRYPTED'), { code: 'PDF_ENCRYPTED' })
    }
    if ((error as { code?: string }).code) throw error
    throw Object.assign(new Error('PDF_INVALID'), { code: 'PDF_INVALID' })
  }
}

const failItem = async (
  item: DurableK1IngestionItemRecord,
  code: K1IngestionErrorCode,
): Promise<void> => {
  await withTransaction(async (client) => {
    const current = await durableK1BatchRepository.getItemById(item.id, client, true)
    if (!current || ['QUEUED', 'PROCESSING', 'APPLIED'].includes(current.status)) return
    await durableK1BatchRepository.transitionItem(client, item.id, {
      to: 'FAILED',
      errorCode: code,
      errorSummary: safeMessages[code],
    })
  })
}

const completeOne = async (args: {
  batchId: string
  itemId: string
  sha256: string
  objectVersionId?: string | null
}): Promise<void> => {
  const initialItem = await durableK1BatchRepository.getItemById(args.itemId)
  if (!initialItem || initialItem.batchId !== args.batchId) {
    throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })
  }
  let item: DurableK1IngestionItemRecord = initialItem
  if (['QUEUED', 'PROCESSING', 'NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED'].includes(item.status)) {
    return
  }
  if (args.sha256 !== item.sha256) {
    await failItem(item, 'OBJECT_CHECKSUM_MISMATCH')
    return
  }
  try {
    await withTransaction(async (client) => {
      await durableK1BatchRepository.transitionItem(client, item.id, {
        from: ['PENDING_UPLOAD', 'UPLOADED', 'FAILED', 'VALIDATING'],
        to: 'VALIDATING',
        errorCode: null,
        errorSummary: null,
      })
    })
    item = (await durableK1BatchRepository.getItemById(item.id))!
    const store = getK1ObjectStore()
    const identity = {
      key: item.objectKey,
      bucket: store.kind === 's3' ? config.k1Ingestion.s3.bucket : null,
      versionId: args.objectVersionId ?? item.objectVersionId,
    }
    const metadata = await store.head(identity)
    if (!metadata) throw Object.assign(new Error('UPLOAD_NOT_FOUND'), { code: 'UPLOAD_NOT_FOUND' })
    if (metadata.sizeBytes !== item.sizeBytes) {
      throw Object.assign(new Error('OBJECT_SIZE_MISMATCH'), { code: 'OBJECT_SIZE_MISMATCH' })
    }
    if (store.kind === 's3' && (
      metadata.serverSideEncryption !== 'aws:kms'
      || !metadata.kmsKeyId
    )) {
      throw Object.assign(new Error('UPLOAD_INCOMPLETE'), { code: 'UPLOAD_INCOMPLETE' })
    }
    const buffer = await readObjectToBuffer(store, identity, config.k1Ingestion.uploadMaxBytes)
    const actualHash = createHash('sha256').update(buffer).digest('hex')
    if (actualHash !== item.sha256) {
      throw Object.assign(new Error('OBJECT_CHECKSUM_MISMATCH'), { code: 'OBJECT_CHECKSUM_MISMATCH' })
    }
    const pageCount = await inspectPdf(buffer)
    const batch = await durableK1BatchRepository.getById(args.batchId)
    if (!batch) throw Object.assign(new Error('BATCH_NOT_FOUND'), { code: 'BATCH_NOT_FOUND' })

    await admitCostWorkload({
      workloadKey: 'k1_bda_document',
      method: 'POST',
      routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
      principal: batch.createdByUserId,
      canonicalInputs: {
        batchId: args.batchId,
        itemId: args.itemId,
        sha256: actualHash,
        pageCount,
      },
      globalDailyLimit: config.abuseProtection.quotas.paidExtraction.globalDocumentsPerDay,
      units: 1,
      quotas: [
        { scopeKind: 'user', scopeValue: batch.createdByUserId, limit: config.abuseProtection.quotas.paidExtraction.userDocumentsPerDay },
        { scopeKind: 'global', scopeValue: 'atlas', limit: config.abuseProtection.quotas.paidExtraction.globalDocumentsPerDay },
      ],
      leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.bdaProviderMs / 1_000),
    })

    let k1DocumentId = item.k1DocumentId
    let acceptedMetadata = metadata
    let acceptedObjectKey = item.objectKey
    if (!k1DocumentId) {
      const duplicate = batch.entityScopeId
        ? await durableK1Repository.findActiveDuplicateByHash(batch.entityScopeId, actualHash)
        : null
      if (duplicate) {
        throw Object.assign(new Error('DUPLICATE_K1_CONTENT'), { code: 'DUPLICATE_K1_CONTENT' })
      }
      const documentId = randomUUID()
      k1DocumentId = randomUUID()
      acceptedObjectKey = `${config.k1Ingestion.s3.inputPrefix.replace(/^\/+|\/+$/g, '')}/accepted/${k1DocumentId}.pdf`
      if (store.promoteAccepted) {
        acceptedMetadata = await store.promoteAccepted(identity, acceptedObjectKey)
      }
      await withTransaction(async (client) => {
        await durableK1Repository.createAccepted({
          documentId,
          k1DocumentId: k1DocumentId!,
          ingestionItemId: item.id,
          fileName: item.fileName,
          storagePath: acceptedObjectKey,
          storageBucket: acceptedMetadata.bucket,
          storageVersionId: acceptedMetadata.versionId,
          mimeType: 'application/pdf',
          sizeBytes: item.sizeBytes,
          sha256: actualHash,
          pageCount,
          uploadedBy: batch.createdByUserId,
        }, client)
        await durableK1BatchRepository.transitionItem(client, item.id, {
          from: ['VALIDATING'],
          to: 'UPLOADED',
          documentId,
          k1DocumentId,
          objectVersionId: acceptedMetadata.versionId,
        })
      })
    } else {
      await withTransaction(async (client) => {
        await durableK1BatchRepository.transitionItem(client, item.id, {
          from: ['VALIDATING'],
          to: 'UPLOADED',
          objectVersionId: metadata.versionId,
        })
      })
    }

    const attemptNumber = 1
    const message: K1StartWorkMessage = {
      version: 1,
      type: 'K1_EXTRACTION_START',
      messageId: `start:${item.id}:${attemptNumber}`,
      dedupeKey: `start:${item.id}:${attemptNumber}`,
      ingestionItemId: item.id,
      k1DocumentId,
      requestedAttemptNumber: attemptNumber,
      clientToken: createK1ExtractionClientToken(
        k1DocumentId,
        attemptNumber,
        config.k1Ingestion.bda.mappingSchemaVersion,
      ),
      object: {
        key: acceptedObjectKey,
        bucket: acceptedMetadata.bucket ?? null,
        versionId: acceptedMetadata.versionId ?? null,
      },
      enqueuedAt: new Date().toISOString(),
    }
    await withTransaction(async (client) => {
      await durableK1BatchRepository.transitionItem(client, item.id, {
        from: ['UPLOADED'],
        to: 'QUEUED',
        queuedAt: new Date(),
      })
    })
    await getK1WorkQueue().sendStart(message)
  } catch (error) {
    await failItem(item, asIngestionError(error))
  }
}

export const completeK1BatchUploads = async (args: {
  batchId: string
  items: Array<{ itemId: string; sha256: string; objectVersionId?: string | null }>
}) => {
  const batch = await durableK1BatchRepository.getById(args.batchId)
  if (!batch) throw Object.assign(new Error('BATCH_NOT_FOUND'), { code: 'BATCH_NOT_FOUND' })
  for (const item of args.items) {
    await completeOne({ batchId: args.batchId, ...item })
  }
  const updated = await durableK1BatchRepository.getById(args.batchId)
  if (!updated) throw new Error('BATCH_NOT_FOUND')
  return toPublicBatch(updated)
}
