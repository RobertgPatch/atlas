import { pathToFileURL } from 'node:url'

import pino from 'pino'

import { config } from '../config.js'
import { pool } from '../infra/db/client.js'
import { runMigrations } from '../infra/db/migrate.js'
import { getExtractor, listExtractorProviders } from '../modules/k1/extraction/index.js'
import { isAsyncK1Extractor } from '../modules/k1/extraction/K1Extractor.js'
import type {
  K1CompletionMessage,
  K1ReceivedMessage,
  K1StartWorkMessage,
  K1WorkQueue,
} from '../modules/k1/queue/K1WorkQueue.js'
import { getK1WorkQueue } from '../modules/k1/queue/index.js'
import type { K1ObjectStore } from '../modules/k1/storage/K1ObjectStore.js'
import { getK1ObjectStore } from '../modules/k1/storage/index.js'
import { createK1StartWorkHandler } from '../modules/k1/worker/k1StartWork.handler.js'
import { createK1CompletionHandler } from '../modules/k1/worker/k1Completion.handler.js'

const log = pino({
  name: 'k1-extraction-worker',
  redact: {
    paths: ['*.rawValue', '*.normalizedValue', '*.taxId', '*.ein', '*.tin'],
    remove: true,
  },
})

export interface K1WorkerDependencies {
  queue: K1WorkQueue
  objectStore: K1ObjectStore
  handleStart: (
    received: K1ReceivedMessage<K1StartWorkMessage>,
    signal: AbortSignal,
  ) => Promise<void>
  handleCompletion: (
    received: K1ReceivedMessage<K1CompletionMessage>,
    signal: AbortSignal,
  ) => Promise<void>
}

export const processK1ReceivedMessages = async <T extends K1StartWorkMessage | K1CompletionMessage>(
  messages: Array<K1ReceivedMessage<T>>,
  handler: (received: K1ReceivedMessage<T>, signal: AbortSignal) => Promise<void>,
  queue: K1WorkQueue,
  signal: AbortSignal,
): Promise<void> => {
  await Promise.all(messages.map(async (received) => {
    try {
      await handler(received, signal)
      await queue.acknowledge(received.receipt)
    } catch (error) {
      if (signal.aborted) return
      const delay = Math.min(300, 2 ** Math.min(received.deliveryCount, 8))
      log.error({
        messageId: received.message.messageId,
        k1DocumentId: received.message.k1DocumentId,
        deliveryCount: received.deliveryCount,
        errorCode: (error as { code?: string }).code ?? 'K1_WORKER_HANDLER_ERROR',
      }, 'K-1 queue message failed')
      await queue.retry(received.receipt, delay)
    }
  }))
}

export const runK1ExtractionWorker = async (
  dependencies: K1WorkerDependencies,
  signal: AbortSignal,
): Promise<void> => {
  const concurrency = Math.max(1, Math.min(config.k1Ingestion.workerConcurrency, 10))
  log.info({
    queue: dependencies.queue.kind,
    objectStore: dependencies.objectStore.kind,
    extractor: getExtractor().backend,
    providers: listExtractorProviders(),
    concurrency,
  }, 'K-1 extraction worker started')

  while (!signal.aborted) {
    const [starts, completions] = await Promise.all([
      dependencies.queue.receiveStart({
        maxMessages: concurrency,
        waitSeconds: dependencies.queue.kind === 'sqs' ? 10 : 0,
      }),
      dependencies.queue.receiveCompletion({
        maxMessages: concurrency,
        waitSeconds: dependencies.queue.kind === 'sqs' ? 10 : 0,
      }),
    ])
    await Promise.all([
      processK1ReceivedMessages(starts, dependencies.handleStart, dependencies.queue, signal),
      processK1ReceivedMessages(completions, dependencies.handleCompletion, dependencies.queue, signal),
    ])
    if (dependencies.queue.kind === 'local' && starts.length === 0 && completions.length === 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 500)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        }, { once: true })
      })
    }
  }
  log.info('K-1 extraction worker stopped')
}

const main = async (): Promise<void> => {
  if (!pool) throw new Error('DATABASE_URL is required for the K-1 extraction worker')
  await runMigrations((message) => log.info(message))
  const abortController = new AbortController()
  const shutdown = () => abortController.abort()
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  const queue = getK1WorkQueue()
  const objectStore = getK1ObjectStore()
  const extractor = getExtractor()
  if (!isAsyncK1Extractor(extractor)) {
    throw Object.assign(new Error('K1_ASYNC_EXTRACTOR_REQUIRED'), { code: 'K1_ASYNC_EXTRACTOR_REQUIRED' })
  }
  await runK1ExtractionWorker({
    queue,
    objectStore,
    handleStart: createK1StartWorkHandler({
      extractor,
      provider: extractor.backend === 'stub' ? 'STUB' : 'AWS_BDA',
      queue,
    }),
    handleCompletion: createK1CompletionHandler({ objectStore }),
  }, abortController.signal)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    log.fatal({ errorCode: (error as { code?: string }).code ?? 'K1_WORKER_FATAL' }, 'K-1 worker failed')
    process.exitCode = 1
  })
}
