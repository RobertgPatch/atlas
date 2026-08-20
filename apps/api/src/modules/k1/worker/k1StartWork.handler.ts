import { config } from '../../../config.js'
import { withTransaction } from '../../../infra/db/client.js'
import {
  k1ExtractionAttemptRepository,
  type K1ExtractionProvider,
} from '../extraction/k1ExtractionAttempt.repository.js'
import type { K1AsyncExtractor } from '../extraction/K1Extractor.js'
import { durableK1BatchRepository } from '../k1.repository.js'
import type { K1ReceivedMessage, K1StartWorkMessage } from '../queue/K1WorkQueue.js'
import type { K1WorkQueue } from '../queue/K1WorkQueue.js'
import { randomUUID } from 'node:crypto'

export interface K1StartWorkHandlerDependencies {
  extractor: K1AsyncExtractor
  provider?: K1ExtractionProvider
  queue?: K1WorkQueue
}

const s3Uri = (bucket: string | null, key: string): string => {
  const resolvedBucket = bucket ?? config.k1Ingestion.s3.bucket
  if (!resolvedBucket) throw Object.assign(new Error('BDA_S3_INPUT_REQUIRED'), { code: 'BDA_S3_INPUT_REQUIRED' })
  return `s3://${resolvedBucket}/${key}`
}

const inputUri = (extractor: K1AsyncExtractor, bucket: string | null, key: string): string =>
  extractor.backend === 'aws_bda' ? s3Uri(bucket, key) : `local:///${key}`

const outputUri = (extractor: K1AsyncExtractor, attemptId: string): string => {
  const prefix = config.k1Ingestion.s3.outputPrefix.replace(/^\/+|\/+$/g, '')
  if (extractor.backend !== 'aws_bda') return `local:///${prefix}/${attemptId}/result.json`
  const bucket = config.k1Ingestion.s3.bucket
  if (!bucket) throw Object.assign(new Error('K1_S3_BUCKET_REQUIRED'), { code: 'K1_S3_BUCKET_REQUIRED' })
  return `s3://${bucket}/${prefix}/${attemptId}/`
}

const isRetryableProviderError = (error: unknown): boolean => {
  const candidate = error as { name?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } }
  if (candidate.$retryable) return true
  if (['ThrottlingException', 'TooManyRequestsException', 'ServiceUnavailableException', 'InternalServerException'].includes(candidate.name ?? '')) return true
  return (candidate.$metadata?.httpStatusCode ?? 0) >= 500
}

export const createK1StartWorkHandler = (dependencies: K1StartWorkHandlerDependencies) =>
  async (received: K1ReceivedMessage<K1StartWorkMessage>, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) throw Object.assign(new Error('K1_WORKER_ABORTED'), { code: 'K1_WORKER_ABORTED' })
    const message = received.message
    // Claim the item before contacting a provider. Cancellation and worker
    // submission therefore serialize on the same row lock; a cancelled item
    // can never start a late provider job from an already-delivered message.
    const attempt = await withTransaction(async (client) => {
      const item = await durableK1BatchRepository.getItemById(message.ingestionItemId, client)
      if (!item || !['QUEUED', 'PROCESSING'].includes(item.status)) return null
      const created = await k1ExtractionAttemptRepository.createOrGet({
        k1DocumentId: message.k1DocumentId,
        requestedAttemptNumber: message.requestedAttemptNumber,
        provider: dependencies.provider ?? 'AWS_BDA',
        mappingSchemaVersion: config.k1Ingestion.bda.mappingSchemaVersion,
        projectArn: config.k1Ingestion.bda.projectArn || null,
        projectStage: config.k1Ingestion.bda.projectStage,
        blueprintArn: config.k1Ingestion.bda.blueprintArn || null,
        blueprintVersion: config.k1Ingestion.bda.blueprintVersion || null,
        clientToken: message.clientToken,
      }, client)
      if (created.status !== 'CREATED') return null
      if (item.status === 'QUEUED') {
        await durableK1BatchRepository.transitionItem(client, item.id, {
          from: ['QUEUED'], to: 'PROCESSING',
        })
      }
      return created
    })
    if (!attempt) return

    const inputS3Uri = inputUri(dependencies.extractor, message.object.bucket, message.object.key)
    const outputS3Uri = outputUri(dependencies.extractor, attempt.id)
    try {
      const submitted = await dependencies.extractor.submit({
        clientToken: attempt.clientToken,
        inputS3Uri,
        outputS3Uri,
        k1DocumentId: message.k1DocumentId,
        extractionAttemptId: attempt.id,
      })
      await withTransaction(async (client) => {
        await k1ExtractionAttemptRepository.markSubmitted({
          attemptId: attempt.id,
          providerJobId: submitted.providerJobId,
          inputS3Uri,
          outputS3Prefix: outputS3Uri,
        }, client)
      })
      if (submitted.immediateCompletion) {
        if (!dependencies.queue) throw Object.assign(new Error('K1_COMPLETION_QUEUE_REQUIRED'), { code: 'K1_COMPLETION_QUEUE_REQUIRED' })
        await dependencies.queue.sendCompletion({
          version: 1,
          type: 'K1_EXTRACTION_COMPLETION',
          messageId: randomUUID(),
          dedupeKey: `completion:${attempt.id}:${submitted.providerJobId}`,
          k1DocumentId: message.k1DocumentId,
          extractionAttemptId: attempt.id,
          providerJobId: submitted.providerJobId,
          providerStatus: submitted.immediateCompletion.providerStatus,
          output: submitted.immediateCompletion.output,
          occurredAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      if (isRetryableProviderError(error)) {
        // The provider did not accept the job. Put the durable item back in
        // QUEUED so the queue retry accurately reflects the work that remains
        // and a reconnecting UI never shows a job as submitted.
        await withTransaction(async (client) => {
          const item = await durableK1BatchRepository.getItemById(message.ingestionItemId, client)
          if (item?.status === 'PROCESSING') {
            await durableK1BatchRepository.transitionItem(client, item.id, {
              from: ['PROCESSING'],
              to: 'QUEUED',
            })
          }
        })
        throw Object.assign(error instanceof Error ? error : new Error('EXTRACTION_THROTTLED'), {
          code: 'EXTRACTION_THROTTLED',
        })
      }
      await k1ExtractionAttemptRepository.markFailed({
        attemptId: attempt.id,
        errorCode: (error as { name?: string; code?: string }).code
          ?? (error as { name?: string }).name
          ?? 'EXTRACTION_FAILED',
        errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : 'Provider submission failed.',
      })
      await withTransaction(async (client) => {
        const item = await durableK1BatchRepository.getItemById(message.ingestionItemId, client)
        if (item && ['QUEUED', 'PROCESSING'].includes(item.status)) {
          await durableK1BatchRepository.transitionItem(client, item.id, {
            from: ['QUEUED', 'PROCESSING'],
            to: 'FAILED',
            errorCode: 'EXTRACTION_FAILED',
            errorSummary: 'The extraction provider rejected this document.',
          })
        }
      })
      throw error
    }
  }
