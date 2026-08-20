import { randomUUID } from 'node:crypto'

import { config } from '../../../config.js'
import { k1ExtractionAttemptRepository } from '../extraction/k1ExtractionAttempt.repository.js'
import type { K1AsyncExtractor } from '../extraction/K1Extractor.js'
import type { K1CompletionMessage, K1WorkQueue } from '../queue/K1WorkQueue.js'

export interface K1ExtractionReconcilerDependencies {
  extractor: K1AsyncExtractor
  queue: K1WorkQueue
  now?: () => Date
}

const parseS3Uri = (uri: string): { bucket: string; key: string } => {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri)
  if (!match || match[2].endsWith('/')) {
    throw Object.assign(new Error('BDA_OUTPUT_URI_NOT_AN_OBJECT'), { code: 'BDA_OUTPUT_URI_NOT_AN_OBJECT' })
  }
  return { bucket: match[1], key: decodeURIComponent(match[2]) }
}

export class K1ExtractionReconciler {
  constructor(private readonly dependencies: K1ExtractionReconcilerDependencies) {}

  async runOnce(): Promise<{ checked: number; completionsQueued: number; failed: number }> {
    const now = this.dependencies.now?.() ?? new Date()
    const cutoff = new Date(now.getTime() - config.k1Ingestion.reconciliationStaleSeconds * 1_000)
    const attempts = await k1ExtractionAttemptRepository.listStale(cutoff)
    let completionsQueued = 0
    let failed = 0
    for (const attempt of attempts) {
      if (!attempt.providerJobId) continue
      try {
        const provider = await this.dependencies.extractor.getStatus(attempt.providerJobId)
        if (provider.status === 'IN_PROGRESS') {
          if (attempt.status === 'SUBMITTED') await k1ExtractionAttemptRepository.markInProgress(attempt.id)
        } else if (provider.status === 'FAILED') {
          await k1ExtractionAttemptRepository.markFailed({
            attemptId: attempt.id,
            errorCode: provider.errorCode ?? `BDA_${provider.providerStatus.toUpperCase()}`,
            errorSummary: provider.errorMessage ?? 'Bedrock Data Automation reported a terminal failure.',
          })
          failed += 1
        } else {
          if (!provider.outputS3Uri) throw Object.assign(new Error('BDA_SUCCESS_OUTPUT_URI_MISSING'), { code: 'BDA_SUCCESS_OUTPUT_URI_MISSING' })
          const output = parseS3Uri(provider.outputS3Uri)
          const message: K1CompletionMessage = {
            version: 1,
            type: 'K1_EXTRACTION_COMPLETION',
            messageId: randomUUID(),
            dedupeKey: `bda-completion:${attempt.id}:${attempt.providerJobId}`,
            k1DocumentId: attempt.k1DocumentId,
            extractionAttemptId: attempt.id,
            providerJobId: attempt.providerJobId,
            providerStatus: provider.providerStatus,
            output: { ...output, versionId: null },
            occurredAt: (provider.completedAt ?? now).toISOString(),
          }
          await this.dependencies.queue.sendCompletion(message)
          completionsQueued += 1
        }
      } finally {
        await k1ExtractionAttemptRepository.touchReconciled(attempt.id)
      }
    }
    return { checked: attempts.length, completionsQueued, failed }
  }
}
