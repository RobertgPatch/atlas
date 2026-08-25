import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFeatureFlag } from './featureFlags'

describe('parseFeatureFlag', () => {
  it.each([true, 'true', 'TRUE', '1', 'yes', 'on'])('enables recognized true values (%s)', (value) => {
    expect(parseFeatureFlag(value)).toBe(true)
  })

  it.each([false, undefined, null, '', 'false', '0', 'off', 'anything-else'])('keeps all other values disabled (%s)', (value) => {
    expect(parseFeatureFlag(value)).toBe(false)
  })
})

describe('featureFlags environment integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each([
    ['false', false],
    ['true', true],
  ])('reads VITE_MAGIC_PATTERN_DESIGNS=%s at module initialization', async (value, expected) => {
    vi.stubEnv('VITE_MAGIC_PATTERN_DESIGNS', value)
    vi.resetModules()
    const isolated = await import('./featureFlags')
    expect(isolated.featureFlags.magicPatternDesigns).toBe(expected)
  })
})
