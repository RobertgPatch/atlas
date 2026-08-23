import { describe, expect, it } from 'vitest'
import { parseFeatureFlag } from './featureFlags'

describe('parseFeatureFlag', () => {
  it.each([true, 'true', 'TRUE', '1', 'yes', 'on'])('enables recognized true values (%s)', (value) => {
    expect(parseFeatureFlag(value)).toBe(true)
  })

  it.each([false, undefined, null, '', 'false', '0', 'off', 'anything-else'])('keeps all other values disabled (%s)', (value) => {
    expect(parseFeatureFlag(value)).toBe(false)
  })
})
