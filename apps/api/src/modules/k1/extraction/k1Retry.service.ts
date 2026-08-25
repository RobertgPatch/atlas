import { randomUUID } from 'node:crypto'

import { config } from '../../../config.js'
import { withTransaction } from '../../../infra/db/client.js'
import { durableK1BatchRepository, durableK1Repository } from '../k1.repository.js'
import type { K1IngestionItemStatus } from '../k1.types.js'
import type { K1StartWorkMessage } from '../queue/K1WorkQueue.js'
import { getK1WorkQueue } from '../queue/index.js'
import {
  createK1ExtractionClientToken,
  k1ExtractionAttemptRepository,
} from './k1ExtractionAttempt.repository.js'

const retryableFailure = (code: string | null): boolean => {
  if (!code) return true
  return !/CLIENT|ENCRYPT|UNSUPPORTED|DUPLICATE/i.test(code)
}

const REPROCESSABLE_ITEM_STATUSES = ['FAILED', 'NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY'] as const

const configuredExtractionProvider = (): 'AWS_BDA' | 'STUB' =>
  config.k1ExtractorBackend === 'aws_bda' ? 'AWS_BDA' : 'STUB'

export interface K1RetryExtractionResult {
  k1DocumentId: string
  documentVersion: number
  attemptId: string
  attemptNumber: number
  status: 'QUEUED'
}

export const retryK1Extraction = async (args: {
  k1DocumentId: string
  expectedDocumentVersion: number
  actorUserId: string
}): Promise<K1RetryExtractionResult> => {
  const prepared = await withTransaction(async (client) => {
    const document = await durableK1Repository.lockById(client, args.k1DocumentId)
    if (!document) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
    if (document.version !== args.expectedDocumentVersion) {
      throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: document.version })
    }
    if (document.appliedAt) throw Object.assign(new Error('K1_DOCUMENT_ALREADY_APPLIED'), { code: 'K1_DOCUMENT_ALREADY_APPLIED' })
    const itemResult = await client.query<{ id: string; status: K1IngestionItemStatus }>(
      `select id, status from k1_ingestion_items where k1_document_id = $1 for update`,
      [args.k1DocumentId],
    )
    const item = itemResult.rows[0]
    if (!item || !(REPROCESSABLE_ITEM_STATUSES as readonly string[]).includes(item.status)) {
      throw Object.assign(new Error('EXTRACTION_NOT_RETRYABLE'), { code: 'EXTRACTION_NOT_RETRYABLE' })
    }
    const attempts = await k1ExtractionAttemptRepository.listForDocument(args.k1DocumentId, client)
    const previous = attempts.at(-1)
    const retryableFailedAttempt = previous?.status === 'FAILED' && retryableFailure(previous.errorCode)
    const reprocessableSucceededAttempt = previous?.status === 'SUCCEEDED' && item.status !== 'FAILED'
    if (!previous || (!retryableFailedAttempt && !reprocessableSucceededAttempt)) {
      throw Object.assign(new Error('EXTRACTION_NOT_RETRYABLE'), { code: 'EXTRACTION_NOT_RETRYABLE' })
    }
    const attemptNumber = previous.attemptNumber + 1
    const clientToken = createK1ExtractionClientToken(
      args.k1DocumentId,
      attemptNumber,
      config.k1Ingestion.bda.mappingSchemaVersion,
    )
    const attempt = await k1ExtractionAttemptRepository.createOrGet({
      k1DocumentId: args.k1DocumentId,
      requestedAttemptNumber: attemptNumber,
      provider: configuredExtractionProvider(),
      mappingSchemaVersion: config.k1Ingestion.bda.mappingSchemaVersion,
      projectArn: config.k1Ingestion.bda.projectArn || null,
      projectStage: config.k1Ingestion.bda.projectStage,
      blueprintArn: config.k1Ingestion.bda.blueprintArn || null,
      blueprintVersion: config.k1Ingestion.bda.blueprintVersion || null,
      clientToken,
    }, client)
    await durableK1BatchRepository.transitionItem(client, item.id, {
      from: [item.status],
      to: 'QUEUED',
      errorCode: null,
      errorSummary: null,
      queuedAt: new Date(),
    })
    const updated = await durableK1Repository.compareAndSet(client, document.id, document.version, {
      processingStatus: 'PROCESSING',
      parseErrorCode: null,
      parseErrorMessage: null,
    })
    if (!updated) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION' })
    const message: K1StartWorkMessage = {
      version: 1,
      type: 'K1_EXTRACTION_START',
      messageId: randomUUID(),
      dedupeKey: `start:${args.k1DocumentId}:${attemptNumber}`,
      ingestionItemId: item.id,
      k1DocumentId: args.k1DocumentId,
      requestedAttemptNumber: attemptNumber,
      clientToken,
      object: {
        key: document.storagePath,
        bucket: document.storageBucket,
        versionId: document.storageVersionId,
      },
      enqueuedAt: new Date().toISOString(),
    }
    return { attempt, message, documentVersion: updated.version, itemId: item.id }
  })

  try {
    await getK1WorkQueue().sendStart(prepared.message)
  } catch (error) {
    await k1ExtractionAttemptRepository.markFailed({
      attemptId: prepared.attempt.id,
      errorCode: 'EXTRACTION_QUEUE_UNAVAILABLE',
      errorSummary: 'The extraction request could not be queued.',
    })
    await withTransaction(async (client) => {
      const item = await durableK1BatchRepository.getItemById(prepared.itemId, client, true)
      if (item?.status === 'QUEUED') {
        await durableK1BatchRepository.transitionItem(client, item.id, {
          from: ['QUEUED'], to: 'FAILED', errorCode: 'EXTRACTION_FAILED',
          errorSummary: 'The extraction request could not be queued.',
        })
      }
    })
    throw error
  }

  return {
    k1DocumentId: args.k1DocumentId,
    documentVersion: prepared.documentVersion,
    attemptId: prepared.attempt.id,
    attemptNumber: prepared.attempt.attemptNumber,
    status: 'QUEUED',
  }
}
