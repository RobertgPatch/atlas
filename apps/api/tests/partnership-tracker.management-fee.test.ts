import { describe, expect, it } from 'vitest'
import { calculateManagementFeeEstimate } from '../src/modules/partnership-tracker/management-fee.js'

describe('Partnership management fee estimate', () => {
  it('prorates the inception year using inclusive active days', () => {
    const result = calculateManagementFeeEstimate({
      partnershipId: '00000000-0000-4000-8000-000000000001',
      inceptionDate: '2023-08-03',
      annualRate: '0.02000000',
      asOfDate: '2023-12-31',
      commitments: [{ amount: '1000000.00', effectiveDate: '2023-01-01' }],
    })
    expect(result.status).toBe('AVAILABLE')
    expect(result.annualRows[0]).toMatchObject({ activeDays: 151, daysInYear: 365, estimatedFee: '8273.97' })
    expect(result.cumulativeEstimatedFee).toBe('8273.97')
  })

  it('uses leap-year denominators and effective commitment segments', () => {
    const result = calculateManagementFeeEstimate({
      partnershipId: '00000000-0000-4000-8000-000000000001',
      inceptionDate: '2024-01-01',
      annualRate: '0.02000000',
      asOfDate: '2024-12-31',
      commitments: [
        { amount: '1000000.00', effectiveDate: '2024-01-01' },
        { amount: '2000000.00', effectiveDate: '2024-07-01' },
      ],
    })
    expect(result.annualRows[0]).toMatchObject({ activeDays: 366, daysInYear: 366, weightedCommittedCapital: '1502732.24', estimatedFee: '30054.64' })
  })

  it('keeps zero rates available and reports missing inputs explicitly', () => {
    const zero = calculateManagementFeeEstimate({ partnershipId: 'p', inceptionDate: '2024-01-01', annualRate: '0.00000000', asOfDate: '2024-12-31', commitments: [{ amount: '100.00', effectiveDate: '2024-01-01' }] })
    const missing = calculateManagementFeeEstimate({ partnershipId: 'p', inceptionDate: null, annualRate: null, asOfDate: '2024-12-31', commitments: [] })
    expect(zero).toMatchObject({ status: 'AVAILABLE', cumulativeEstimatedFee: '0.00' })
    expect(missing).toMatchObject({ status: 'MISSING_INCEPTION_DATE', annualRows: [], cumulativeEstimatedFee: null })
  })

  it('rejects an as-of date before inception', () => {
    expect(() => calculateManagementFeeEstimate({ partnershipId: 'p', inceptionDate: '2025-01-01', annualRate: '0.02000000', asOfDate: '2024-12-31', commitments: [] })).toThrow(/before inception/i)
  })
})
