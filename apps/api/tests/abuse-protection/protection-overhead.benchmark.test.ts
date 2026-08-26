import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import { fingerprintSubject } from '../../src/modules/abuse-protection/subjectFingerprint.js'

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!
}

const sleepCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))

const sample = (protectedRead: boolean): number => {
  const started = performance.now()
  let checksum = 0
  if (protectedRead) {
    checksum ^= fingerprintSubject('benchmark-hmac-key-material-v1-0000', {
      scope: 'session',
      value: 'benchmark-session',
    })[0]!
  }
  // A deterministic two-millisecond stub represents an ordinary cached/DB
  // read without introducing network or paid-provider variability.
  Atomics.wait(sleepCell, 0, 0, 2)
  if (checksum < 0) throw new Error('unreachable')
  return performance.now() - started
}

describe('protected read overhead benchmark', () => {
  it('records repeatable p50/p95 samples and keeps absolute protection overhead bounded', () => {
    for (let index = 0; index < 20; index += 1) {
      sample(false)
      sample(true)
    }
    const baseline: number[] = []
    const protectedSamples: number[] = []
    for (let index = 0; index < 100; index += 1) {
      baseline.push(sample(false))
      protectedSamples.push(sample(true))
    }
    const result = {
      baselineP50Ms: percentile(baseline, 0.5),
      baselineP95Ms: percentile(baseline, 0.95),
      protectedP50Ms: percentile(protectedSamples, 0.5),
      protectedP95Ms: percentile(protectedSamples, 0.95),
    }
    const absoluteP95OverheadMs = result.protectedP95Ms - result.baselineP95Ms
    const relativeP95Overhead = absoluteP95OverheadMs / result.baselineP95Ms
    expect(result.baselineP50Ms).toBeGreaterThan(0)
    expect(result.protectedP50Ms).toBeGreaterThan(0)
    expect(absoluteP95OverheadMs).toBeLessThan(1)
    expect(relativeP95Overhead).toBeLessThan(0.05)
  })
})
