import { describe, expect, it } from 'vitest'
import { formatEinInput, isCompleteEin } from './einInput'

describe('partnership EIN input', () => {
  it('adds the standard dash after the first two digits', () => {
    expect(formatEinInput('12')).toBe('12')
    expect(formatEinInput('123')).toBe('12-3')
    expect(formatEinInput('123456789')).toBe('12-3456789')
    expect(formatEinInput('12-3456789')).toBe('12-3456789')
  })

  it('strips non-digits, caps the value at nine digits, and validates completeness', () => {
    expect(formatEinInput('12 345-6789 extra')).toBe('12-3456789')
    expect(isCompleteEin('123456789')).toBe(true)
    expect(isCompleteEin('12-34')).toBe(false)
  })
})
