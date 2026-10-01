import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { executeStatementWorker, statementWorkerResourceLimits } from '../../src/modules/liquidity-statements/statement-processing.service.js'

const source = Buffer.from('Symbol,Value\nDEMO,10')
const sourceHash = createHash('sha256').update(source).digest('hex')
const recipe = {
  reader: { id: 'test-reader', version: '1.0.0' },
  adapters: [{ id: 'test-adapter', version: '1.0.0', region: 'all' }],
  canonicalSchemaVersion: '3.0.0',
  normalizerVersion: 'test',
  reconcilerVersion: 'test',
  classificationCatalogVersion: 'test',
  configurationRevision: 'test',
}

describe('bounded statement worker orchestration', () => {
  it('applies a finite worker heap ceiling and rejects invalid limits', () => {
    expect(statementWorkerResourceLimits(256)).toEqual({ maxOldGenerationSizeMb: 256 })
    expect(() => statementWorkerResourceLimits(0)).toThrow('INVALID_WORKER_MEMORY_LIMIT')
    expect(() => statementWorkerResourceLimits(Number.POSITIVE_INFINITY)).toThrow('INVALID_WORKER_MEMORY_LIMIT')
  })

  it('terminates CPU-stalled work at the parent deadline', async () => {
    const started = Date.now()
    await expect(executeStatementWorker({
      source,
      sourceHash,
      recipe,
      timeoutMs: 50,
      maxOutputBytes: 1024,
      testBehavior: 'STALL',
    })).rejects.toMatchObject({ code: 'WORKER_TIMEOUT', retryable: false })
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('cancels and ignores a late worker result', async () => {
    const controller = new AbortController()
    const pending = executeStatementWorker({
      source,
      sourceHash,
      recipe,
      timeoutMs: 2_000,
      maxOutputBytes: 1024,
      signal: controller.signal,
      testBehavior: 'STALL',
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'WORKER_CANCELLED', retryable: false })
  })

  it('rejects source identity and output-size violations', async () => {
    await expect(executeStatementWorker({
      source,
      sourceHash: '0'.repeat(64),
      recipe,
      timeoutMs: 1_000,
      maxOutputBytes: 1024,
      testBehavior: 'ECHO',
    })).rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH', retryable: false })

    await expect(executeStatementWorker({
      source,
      sourceHash,
      recipe,
      timeoutMs: 1_000,
      maxOutputBytes: 8,
      testBehavior: 'ECHO',
    })).rejects.toMatchObject({ code: 'WORKER_OUTPUT_LIMIT', retryable: false })
  })

  it('fails closed when a pinned recipe cannot be fulfilled', async () => {
    await expect(executeStatementWorker({
      source,
      sourceHash,
      recipe: { ...recipe, reader: { id: 'missing-reader', version: '99.0.0' } },
      timeoutMs: 1_000,
      maxOutputBytes: 1024,
      testBehavior: 'ECHO',
    })).rejects.toMatchObject({ code: 'RECIPE_VERSION_UNAVAILABLE', retryable: true })
  })
})
