import { afterEach, describe, expect, it, vi } from 'vitest'
import { partnershipTrackerClient, serializeTrackerMoney } from '../api/partnershipTrackerClient'

afterEach(() => vi.unstubAllGlobals())

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

  it('preserves additive comparison fields and explicit zero versus missing values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        summary: {},
        years: [
          { taxYear: 2024, capitalContributed: '0.00', distributions: null, endingOutsideBasis: '100.00' },
          { taxYear: 2023, capitalContributed: null, distributions: '0.00', endingOutsideBasis: null },
        ],
        commitments: [],
        navEntries: [],
        permissions: {},
      }),
    }))
    const detail = await partnershipTrackerClient.get('00000000-0000-4000-8000-000000000001')
    expect(detail.years[0]).toMatchObject({ capitalContributed: '0.00', distributions: null })
    expect(detail.years[1]).toMatchObject({ capitalContributed: null, distributions: '0.00' })
  })
})
