import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import { fingerprintSubject } from '../../src/modules/abuse-protection/subjectFingerprint.js'

const CALLS_PER_SAMPLE = 512
const SAMPLE_COUNT = 100
const REPRESENTATIVE_READ_P95_MS = 2
const BENCHMARK_KEY = 'benchmark-hmac-key-material-v1-0000'

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!
}

const sample = (protectedRead: boolean): number => {
  const started = performance.now()
  let checksum = 0
  for (let index = 0; index < CALLS_PER_SAMPLE; index += 1) {
    // Both paths perform the same deterministic cached-read stub. The protected
    // path adds only the request fingerprint work whose overhead we are testing.
    checksum ^= (index * 31 + 17) & 0xff
    if (protectedRead) {
      checksum ^= fingerprintSubject(BENCHMARK_KEY, {
        scope: 'session',
        value: 'benchmark-session',
      })[0]!
    }
  }
  if (checksum < 0) throw new Error('unreachable')
  return (performance.now() - started) / CALLS_PER_SAMPLE
}

describe('protected read overhead benchmark', () => {
  it('records repeatable p50/p95 samples and keeps absolute protection overhead bounded', () => {
    for (let index = 0; index < 20; index += 1) {
      sample(false)
      sample(true)
    }
    const baseline: number[] = []
    const protectedSamples: number[] = []
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      // Alternate order so gradual runner load changes cannot be attributed to
      // one path merely because all of its samples ran later.
      if (index % 2 === 0) {
        baseline.push(sample(false))
        protectedSamples.push(sample(true))
      } else {
        protectedSamples.push(sample(true))
        baseline.push(sample(false))
      }
    }
    const result = {
      baselineP50Ms: percentile(baseline, 0.5),
      baselineP95Ms: percentile(baseline, 0.95),
      protectedP50Ms: percentile(protectedSamples, 0.5),
      protectedP95Ms: percentile(protectedSamples, 0.95),
    }
    const absoluteP95OverheadMs = Math.max(
      0,
      result.protectedP95Ms - result.baselineP95Ms,
    )
    const relativeP95Overhead = absoluteP95OverheadMs / REPRESENTATIVE_READ_P95_MS
    expect(result.baselineP50Ms).toBeGreaterThan(0)
    expect(result.protectedP50Ms).toBeGreaterThan(0)
    expect(absoluteP95OverheadMs).toBeLessThan(1)
    expect(relativeP95Overhead).toBeLessThan(0.05)
  })
})
