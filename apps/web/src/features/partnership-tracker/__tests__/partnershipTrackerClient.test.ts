import { describe, expect, it } from 'vitest'
import { serializeTrackerMoney } from '../api/partnershipTrackerClient'

describe('Partnership Tracker money request boundary', () => {
  it.each([
    ['1000', '1000.00'],
    ['1,000', '1000.00'],
    ['$1,000.5', '1000.50'],
    ['-1000', '-1000.00'],
    ['1000.00', '1000.00'],
  ])('normalizes %s before a request', (raw, expected) => {
    expect(serializeTrackerMoney(raw)).toBe(expected)
  })

  it('keeps malformed grouping and excessive precision out of requests', () => {
    expect(() => serializeTrackerMoney('1,00')).toThrow('valid comma grouping')
    expect(() => serializeTrackerMoney('1000.001')).toThrow('no more than two decimal places')
  })
})
