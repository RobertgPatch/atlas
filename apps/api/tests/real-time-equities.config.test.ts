import { describe, expect, it } from 'vitest'
import { resolveRealTimeEquitiesEnabled } from '../src/config.js'

describe('REAL_TIME_EQUITIES_ENABLED configuration', () => {
  it('defaults to false', () => {
    expect(resolveRealTimeEquitiesEnabled({})).toBe(false)
  })

  it.each([
    ['true', true],
    ['false', false],
  ] as const)('parses %s exactly', (value, expected) => {
    expect(resolveRealTimeEquitiesEnabled({ REAL_TIME_EQUITIES_ENABLED: value }))
      .toBe(expected)
  })

  it('rejects ambiguous values', () => {
    expect(() =>
      resolveRealTimeEquitiesEnabled({ REAL_TIME_EQUITIES_ENABLED: '1' }),
    ).toThrow(/expected exactly true or false/i)
  })
})
