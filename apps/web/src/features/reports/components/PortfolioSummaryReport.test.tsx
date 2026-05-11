import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PortfolioSummaryResponse } from '../../../../../../../packages/types/src/reports'
import { PortfolioSummaryReport } from './PortfolioSummaryReport'

const basePayload: PortfolioSummaryResponse = {
  kpis: {
    totalCommitmentUsd: 3_000_000,
    totalDistributionsUsd: 540_000,
    weightedIrr: null,
    weightedTvpi: 1.32,
  },
  rows: [
    {
      id: 'entity-1',
      entityId: 'entity-1',
      entityName: 'Whitfield Realty LLC',
      entityType: 'LLC',
      assetClassSummary: 'Private Equity',
      partnershipCount: 1,
      originalCommitmentUsd: 3_000_000,
      calledPct: 25,
      unfundedUsd: 2_250_000,
      paidInUsd: 750_000,
      distributionsUsd: 540_000,
      residualValueUsd: 450_000,
      dpi: 0.72,
      rvpi: 0.6,
      tvpi: 1.32,
      irr: null,
      editability: {
        originalCommitmentEditable: true,
        reason: null,
        commitmentTarget: {
          partnershipId: 'partnership-1',
          commitmentId: 'commitment-1',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    },
  ],
  totals: {
    originalCommitmentUsd: 3_000_000,
    calledPct: 25,
    unfundedUsd: 2_250_000,
    paidInUsd: 750_000,
    distributionsUsd: 540_000,
    residualValueUsd: 450_000,
    dpi: 0.72,
    rvpi: 0.6,
    tvpi: 1.32,
    irr: null,
  },
  page: {
    size: 50,
    offset: 0,
    total: 1,
  },
}

describe('PortfolioSummaryReport', () => {
  it('renders loading state', () => {
    render(
      <PortfolioSummaryReport
        data={undefined}
        isLoading={true}
        isError={false}
        onRetry={vi.fn()}
        undoCommitmentId={null}
        onUndoLatestEdit={vi.fn()}
        onCommitOriginalCommitment={vi.fn()}
      />,
    )

    expect(screen.getByTestId('portfolio-loading')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(
      <PortfolioSummaryReport
        data={{ ...basePayload, rows: [], page: { ...basePayload.page, total: 0 } }}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        undoCommitmentId={null}
        onUndoLatestEdit={vi.fn()}
        onCommitOriginalCommitment={vi.fn()}
      />,
    )

    expect(screen.getByTestId('portfolio-empty')).toBeInTheDocument()
    expect(screen.getByText('No portfolio rows match your filters')).toBeInTheDocument()
  })

  it('renders populated rows with sticky totals and N/A weighted metric output', () => {
    render(
      <PortfolioSummaryReport
        data={basePayload}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        undoCommitmentId={null}
        onUndoLatestEdit={vi.fn()}
        onCommitOriginalCommitment={vi.fn().mockResolvedValue({ status: 'ok' })}
      />,
    )

    expect(screen.getByText('Whitfield Realty LLC')).toBeInTheDocument()
    expect(screen.getByText('Weighted IRR')).toBeInTheDocument()
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
    expect(screen.getByTestId('portfolio-sticky-totals')).toBeInTheDocument()
  })
})
