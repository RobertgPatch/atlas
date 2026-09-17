import { describe, expect, it, vi } from 'vitest'

import { LocalConcurrencyLimiter } from '../../src/modules/abuse-protection/localConcurrency.js'

describe('bounded no-queue heavy work concurrency', () => {
  it('rejects immediately at capacity and starts no aggregation', async () => {
    const limiter = new LocalConcurrencyLimiter()
    const first = limiter.acquire('heavy_read', 1)
    expect(first.admitted).toBe(true)

    const aggregate = vi.fn(async () => ['row'])
    const rejected = limiter.acquire('heavy_read', 1)
    if (rejected.admitted) await aggregate()

    expect(rejected).toEqual({
      classKey: 'heavy_read',
      admitted: false,
      retryAfterSeconds: 1,
    })
    expect(aggregate).not.toHaveBeenCalled()
    if (first.admitted) first.release()
  })

  it('releases exactly once on error and permits the next download', async () => {
    const limiter = new LocalConcurrencyLimiter()
    const lease = limiter.acquire('download', 1)
    expect(lease.admitted).toBe(true)
    try {
      throw new Error('stream failed')
    } catch {
      if (lease.admitted) {
        lease.release()
        lease.release()
      }
    }
    expect(limiter.snapshot()).toEqual({ heavy_read: 0, download: 0 })
    expect(limiter.acquire('download', 1).admitted).toBe(true)
  })
})
