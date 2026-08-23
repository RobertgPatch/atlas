import { describe, expect, it, vi } from 'vitest'

import type { K1WorkQueue } from '../src/modules/k1/queue/K1WorkQueue.js'
import { LocalK1ObjectStore } from '../src/modules/k1/storage/localK1ObjectStore.js'
import { runK1ExtractionWorker } from '../src/workers/k1-extraction-worker.js'

describe('K-1 extraction worker loop', () => {
  it('runs the local BDA reconciler and stops cleanly when aborted', async () => {
    const abortController = new AbortController()
    const queue: K1WorkQueue = {
      kind: 'local',
      sendStart: vi.fn(),
      sendCompletion: vi.fn(),
      receiveStart: vi.fn().mockResolvedValue([]),
      receiveCompletion: vi.fn().mockResolvedValue([]),
      acknowledge: vi.fn(),
      retry: vi.fn(),
    }
    const reconcile = vi.fn(async () => {
      abortController.abort()
      return { checked: 1, completionsQueued: 1, failed: 0 }
    })

    await runK1ExtractionWorker({
      queue,
      objectStore: new LocalK1ObjectStore(),
      handleStart: vi.fn(),
      handleCompletion: vi.fn(),
      reconcile,
      reconciliationIntervalMs: 1_000,
    }, abortController.signal)

    expect(reconcile).toHaveBeenCalledTimes(1)
  })
})
