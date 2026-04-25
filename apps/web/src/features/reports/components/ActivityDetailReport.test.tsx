import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActivityDetailResponse } from '../../../../../../../packages/types/src/reports'
import { ActivityDetailReport } from './ActivityDetailReport'

const basePayload: ActivityDetailResponse = {
  rows: [
    {
      id: 'activity-row-1',
      entityId: 'entity-1',
      entityName: 'Whitfield Family Trust',
      partnershipId: 'partnership-1',
      partnershipName: 'Blackstone Capital Partners VII',
      taxYear: 2024,
      beginningBasisUsd: null,
      contributionsUsd: 500_000,
      interestUsd: 25_000,
      dividendsUsd: 10_000,
      capitalGainsUsd: 5_000,
      remainingK1Usd: null,
      totalIncomeUsd: 40_000,
      distributionsUsd: 125_000,
      otherAdjustmentsUsd: null,
      endingTaxBasisUsd: null,
      endingGlBalanceUsd: 380_000,
      bookToBookAdjustmentUsd: null,
      k1CapitalAccountUsd: null,
      k1VsTaxDifferenceUsd: null,
      excessDistributionUsd: null,
      negativeBasis: false,
      endingBasisUsd: null,
      notes: null,
      sourceSignals: {
        hasK1: true,
        hasCapitalActivity: true,
        hasFmv: false,
        hasManualInput: true,
      },
      finalizedFromK1DocumentId: null,
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
  ],
  page: {
    size: 50,
    offset: 0,
    total: 1,
  },
}

describe('ActivityDetailReport', () => {
  it('renders loading state', () => {
    render(
      <ActivityDetailReport
        data={undefined}
        isLoading={true}
        isError={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('activity-detail-loading')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(
      <ActivityDetailReport
        data={{ ...basePayload, rows: [], page: { ...basePayload.page, total: 0 } }}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('activity-detail-empty')).toBeInTheDocument()
    expect(screen.getByText('No activity detail rows match your filters')).toBeInTheDocument()
  })

  it('renders populated rows and key phase 3 columns', () => {
    render(
      <ActivityDetailReport
        data={basePayload}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('activity-detail-table')).toBeInTheDocument()
    expect(screen.getByText('Whitfield Family Trust')).toBeInTheDocument()
    expect(screen.getByText('Blackstone Capital Partners VII')).toBeInTheDocument()
    expect(screen.getByText('Negative Basis')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('supports admin inline edit and undo actions for contributions', async () => {
    const user = userEvent.setup()
    const onCommitContributions = vi.fn().mockResolvedValue({ status: 'ok' })
    const onUndoLatestEdit = vi.fn()

    render(
      <ActivityDetailReport
        data={basePayload}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        isAdmin={true}
        undoRowId="activity-row-1"
        onUndoLatestEdit={onUndoLatestEdit}
        onCommitContributions={onCommitContributions}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Undo latest edit' }))
    expect(onUndoLatestEdit).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('editable-cell-display'))
    const input = screen.getByTestId('editable-cell-input')
    await user.clear(input)
    await user.type(input, '525000')
    await user.click(screen.getByRole('button', { name: 'Save amount' }))

    expect(onCommitContributions).toHaveBeenCalledWith(
      expect.objectContaining({
        nextValue: 525000,
      }),
    )
  })
})
