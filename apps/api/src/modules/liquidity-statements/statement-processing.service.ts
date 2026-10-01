import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import type { buildLiquidityCsvConfig } from './liquidity-statement.config.js'

type StatementReaderConfig = ReturnType<typeof buildLiquidityCsvConfig>

export type StatementWorkerErrorCode = 'WORKER_TIMEOUT' | 'WORKER_CANCELLED' | 'SOURCE_HASH_MISMATCH' | 'WORKER_OUTPUT_LIMIT' | 'INVALID_WORKER_MEMORY_LIMIT' | 'RECIPE_VERSION_UNAVAILABLE' | 'WORKER_PARSE_FAILED'
export class StatementWorkerError extends Error {
  constructor(readonly code: StatementWorkerErrorCode | string, readonly retryable: boolean) { super(code) }
}

export interface StatementWorkerRequest {
  source: Buffer
  sourceHash: string
  recipe: Record<string, any>
  timeoutMs: number
  maxOutputBytes: number
  signal?: AbortSignal
  limits?: Record<string, string>
  config?: StatementReaderConfig
  maxOldGenerationSizeMb?: number
  mappingProfile?: unknown
  testBehavior?: 'STALL' | 'ECHO'
}

export const statementWorkerResourceLimits = (maxOldGenerationSizeMb?: number) => {
  if (maxOldGenerationSizeMb === undefined) return undefined
  if (!Number.isSafeInteger(maxOldGenerationSizeMb) || maxOldGenerationSizeMb < 1 || maxOldGenerationSizeMb > 1_024) {
    throw new StatementWorkerError('INVALID_WORKER_MEMORY_LIMIT', false)
  }
  return { maxOldGenerationSizeMb }
}

/** Parent-owned worker lifecycle. Only immutable bytes, a validated/pinned
 * recipe and bounded configuration cross the isolation boundary. */
export async function executeStatementWorker(request: StatementWorkerRequest): Promise<unknown> {
  const actualHash = createHash('sha256').update(request.source).digest('hex')
  if (actualHash !== request.sourceHash) throw new StatementWorkerError('SOURCE_HASH_MISMATCH', false)
  if (request.signal?.aborted) throw new StatementWorkerError('WORKER_CANCELLED', false)
  const workerUrl = new URL(import.meta.url.endsWith('.ts') ? './statement-processing.worker.ts' : './statement-processing.worker.js', import.meta.url)
  const resourceLimits = statementWorkerResourceLimits(request.maxOldGenerationSizeMb)
  const worker = new Worker(workerUrl, {
    execArgv: ['--import', 'tsx'],
    ...(resourceLimits ? { resourceLimits } : {}),
  })
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = async (error?: unknown, result?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', abort)
      await worker.terminate().catch(() => undefined)
      if (error) reject(error); else resolve(result)
    }
    const abort = () => void finish(new StatementWorkerError('WORKER_CANCELLED', false))
    const timer = setTimeout(() => void finish(new StatementWorkerError('WORKER_TIMEOUT', false)), request.timeoutMs)
    timer.unref()
    request.signal?.addEventListener('abort', abort, { once: true })
    worker.once('error', error => void finish(new StatementWorkerError('WORKER_PARSE_FAILED', false), error))
    worker.once('exit', code => { if (!settled && code !== 0) void finish(new StatementWorkerError('WORKER_PARSE_FAILED', false)) })
    worker.once('message', (message: { result?: unknown; error?: { code: string; retryable: boolean } }) => {
      if (message.error) return void finish(new StatementWorkerError(message.error.code, message.error.retryable))
      const size = Buffer.byteLength(JSON.stringify(message.result))
      if (size > request.maxOutputBytes) return void finish(new StatementWorkerError('WORKER_OUTPUT_LIMIT', false))
      void finish(undefined, message.result)
    })
    worker.postMessage({ source: request.source, sourceHash: request.sourceHash, recipe: request.recipe, limits: request.limits, config: request.config, mappingProfile: request.mappingProfile, testBehavior: request.testBehavior })
  })
}
