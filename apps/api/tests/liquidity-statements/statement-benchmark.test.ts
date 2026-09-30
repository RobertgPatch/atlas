import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe,expect,it } from 'vitest'
import { executeStatementWorker } from '../../src/modules/liquidity-statements/statement-processing.service.js'
import { buildCsvBytes,merrillHeaders } from './adapter-conformance/fixture-builders.js'

const rows = 2_000
const source = buildCsvBytes([
  [...merrillHeaders],
  ...Array.from({ length: rows }, (_, index) => [
    '09/21/2026', `S${index}`, `B${index}`, '', `Synthetic ${index}`, 'Benchmark',
    'Trust', '0000099999', '1', '10', '10', '0', '0', '10', '0',
  ]),
])
const recipe = {
  reader: { id: 'bounded_csv', version: '1.0.0' },
  registryRevision: 'registry-032.1',
  limitsRevision: 'limits-032.1',
  adapters: [],
  schemaVersion: '3.0.0',
  normalizerVersion: '2.0.0',
  reconcilerVersion: '2.0.0',
  classificationCatalogVersion: '1.0.0',
  accountIdentityVersion: '1.0.0',
  structuralSelection: [],
  mapping: null,
}

describe('statement deployment-shape benchmark', () => {
  it('keeps ordinary 2,000-position worker p95 below five seconds and the API event loop responsive', async () => {
    const samples: number[] = []
    const before = process.memoryUsage()
    const timerDelays: number[] = []
    for (let run = 0; run < 5; run++) {
      const timerStarted = performance.now()
      const timer = new Promise<void>((resolve) => setTimeout(() => {
        timerDelays.push(performance.now() - timerStarted)
        resolve()
      }, 0))
      const started = performance.now()
      const output = await executeStatementWorker({
        source,
        sourceHash: createHash('sha256').update(source).digest('hex'),
        recipe,
        timeoutMs: 30_000,
        maxOutputBytes: 32 * 1024 * 1024,
      })
      samples.push(performance.now() - started)
      await timer
      expect(output.result?.draft.accounts[0]?.positions).toHaveLength(rows)
    }
    const sorted = [...samples].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!
    const after = process.memoryUsage()
    expect(p95).toBeLessThan(5_000)
    expect(Math.max(...timerDelays)).toBeLessThan(1_000)
    const evidence = {
      runs: samples.length,
      positions: rows,
      sourceBytes: source.length,
      samplesMs: samples.map(Math.ceil),
      p95Ms: Math.ceil(p95),
      eventLoopMaxDelayMs: Math.ceil(Math.max(...timerDelays)),
      rssBefore: before.rss,
      rssAfter: after.rss,
      externalBefore: before.external,
      externalAfter: after.external,
      arrayBuffersBefore: before.arrayBuffers,
      arrayBuffersAfter: after.arrayBuffers,
      note: 'Parent-process totals include serialized worker copies; OS-level child peak RSS requires deployment telemetry.',
    }
    if (process.env.ATLAS_STATEMENT_BENCHMARK_DIR) {
      await mkdir(process.env.ATLAS_STATEMENT_BENCHMARK_DIR, { recursive: true })
      await writeFile(join(process.env.ATLAS_STATEMENT_BENCHMARK_DIR, 'statement-worker.json'), JSON.stringify(evidence, null, 2))
    }
  },30_000)
})
