import { describe, expect, it } from 'vitest'
import { allocationTone, formatCurrency, formatDate, formatPercent } from '../components/allocation'

describe('TIC Registry allocation helpers', () => {
  it('formats currency, dates, and percentages for compact registry display', () => {
    expect(formatCurrency(1250000)).toBe('$1,250,000')
    expect(formatCurrency(null)).toBe('--')
    expect(formatDate('2026-01-15')).toBe('Jan 15, 2026')
    expect(formatDate(null)).toBe('--')
    expect(formatPercent(40)).toBe('40%')
    expect(formatPercent(33.3333)).toBe('33.33%')
  })

  it('returns distinct tones for under, ok, and over allocations', () => {
    expect(allocationTone('under')).toContain('amber')
    expect(allocationTone('ok')).toContain('emerald')
    expect(allocationTone('over')).toContain('red')
  })
})
