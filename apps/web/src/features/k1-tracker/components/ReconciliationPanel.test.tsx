import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { K1TrackerCalculation, K1TrackerYearDetail } from '../../../../../../packages/types/src/k1-tracker'
import { ReconciliationPanel } from './ReconciliationPanel'

const calculation = {
  sectionL: { partThreeIncome: '60027.00', partThreeDeductions: '122197.00', calculatedNetIncome: '-62170.00', reportedNetIncome: '-47.00' },
  distribution: { cashOrPropertyDistribution: '85995.00' }, bookTax: {}, checks: [],
} as unknown as K1TrackerCalculation
const detail = (taxYear: number) => ({ taxYear, values: [] }) as unknown as K1TrackerYearDetail

describe('ReconciliationPanel', () => {
  it('shows the historical taxable subtotal and separates distributions from Item L book adjustments', () => {
    render(<ReconciliationPanel calculation={calculation} detail={detail(2019)} />)
    expect(screen.getByText('Part III tax reconciliation')).toBeInTheDocument()
    expect(screen.getByText('$60,027')).toBeInTheDocument()
    expect(screen.getByText('$122,197')).toBeInTheDocument()
    expect(screen.getByText('-$62,170')).toBeInTheDocument()
    expect(screen.getByText('Distributions (separate basis reduction)')).toBeInTheDocument()
    expect(screen.queryByText('-$47')).not.toBeInTheDocument()
    expect(screen.queryByText('Book-tax explanations')).not.toBeInTheDocument()
  })
  it('retains the Section L comparison for 2021 and later', () => {
    render(<ReconciliationPanel calculation={calculation} detail={detail(2021)} />)
    expect(screen.getByText('Section L and book-tax reconciliation')).toBeInTheDocument()
    expect(screen.getByText('Reported net income')).toBeInTheDocument()
    expect(screen.getByText('Book-tax explanations')).toBeInTheDocument()
  })
})
