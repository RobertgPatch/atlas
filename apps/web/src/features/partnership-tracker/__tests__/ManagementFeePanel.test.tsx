import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ManagementFeePanel } from '../components/ManagementFeePanel'
import { summaryFixture } from './fixtures'

const updatePartnership = { mutateAsync: vi.fn(), isPending: false }
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipManagementFees: () => ({
    isLoading: false,
    isError: false,
    data: {
      partnershipId: 'p-1', inceptionDate: '2023-08-03', annualRate: '0.02000000', asOfDate: '2023-12-31', status: 'AVAILABLE', cumulativeEstimatedFee: '8273.97',
      annualRows: [{ calendarYear: 2023, periodStart: '2023-08-03', periodEnd: '2023-12-31', activeDays: 151, daysInYear: 365, weightedCommittedCapital: '1000000.00', annualRate: '0.02000000', estimatedFee: '8273.97' }],
    },
  }),
  usePartnershipTrackerActions: () => ({ updatePartnership }),
}))

describe('ManagementFeePanel', () => {
  it('shows configuration, through-date, schedule, and cumulative estimate', () => {
    render(<ManagementFeePanel summary={summaryFixture} canEdit />)
    expect(screen.getByLabelText('Partnership inception')).toHaveValue('2022-01-01')
    expect(screen.getByLabelText('Annual fee rate (%)')).toHaveValue(2)
    expect(screen.getByText('151/365')).toBeInTheDocument()
    expect(screen.getAllByText('$8,274').length).toBeGreaterThan(0)
  })

  it('saves fee settings as a unit ratio and hides mutations for read-only users', async () => {
    const { rerender } = render(<ManagementFeePanel summary={summaryFixture} canEdit />)
    fireEvent.change(screen.getByLabelText('Annual fee rate (%)'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updatePartnership.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ managementFeeRate: '0.02500000' }) }))

    rerender(<ManagementFeePanel summary={summaryFixture} canEdit={false} />)
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
